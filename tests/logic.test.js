// 分析ロジックのテスト（テスト専用のデータ。アプリには表示されない）
// 実行: node tests/logic.test.js
const assert = require('assert');
const M = require('../docs/logic.js');

function iso(y, mo, d, h, mi) {
  const dt = new Date(y, mo - 1, d, h, mi);
  return dt.toISOString();
}
const lines = [];
// 10夜分：普段は 0:00〜7:00（コア/深い/レム/覚醒）、最後の夜だけ 2:30〜6:30 で短い
for (let day = 10; day <= 19; day++) {
  const last = day === 19;
  const startH = last ? 2 : 0, startM = last ? 30 : 0;
  const base = new Date(2026, 10, day, startH, startM).getTime();
  const seg = (offMin, lenMin, v) => lines.push(`睡眠|${new Date(base + offMin * 60000).toISOString()}|${new Date(base + (offMin + lenMin) * 60000).toISOString()}|${v}`);
  if (last) {
    seg(0, 90, 'コア'); seg(90, 10, '覚醒'); seg(100, 30, '深い'); seg(130, 5, '覚醒'); seg(135, 60, 'レム'); seg(195, 2, '覚醒'); seg(197, 43, 'コア');
  } else {
    seg(0, 120, 'コア'); seg(120, 60, '深い'); seg(180, 5, '覚醒'); seg(185, 90, 'レム'); seg(275, 145, 'コア');
  }
  // 睡眠中の心拍・呼吸・血中酸素
  lines.push(`心拍数|${new Date(base + 60 * 60000).toISOString()}|${new Date(base + 60 * 60000).toISOString()}|${last ? 66 : 55}|拍/分`);
  lines.push(`呼吸数|${new Date(base + 90 * 60000).toISOString()}|${new Date(base + 90 * 60000).toISOString()}|${last ? 15.5 : 14}|回/分`);
  lines.push(`取り込まれた酸素のレベル|${new Date(base + 100 * 60000).toISOString()}|${new Date(base + 100 * 60000).toISOString()}|${last ? '0.95' : '97%'}|%`);
  lines.push(`安静時心拍数|${iso(2026, 11, day, 9, 0)}|${iso(2026, 11, day, 9, 0)}|${last ? 68 : 56}|拍/分`);
  lines.push(`心拍変動|${iso(2026, 11, day, 3, 0)}|${iso(2026, 11, day, 3, 0)}|${last ? 30 : 50}|ms`);
  lines.push(`歩数|${iso(2026, 11, day, 12, 0)}|${iso(2026, 11, day, 13, 0)}|${day === 18 ? '2,500' : '9,000'}|歩`);
}
lines.push('いいかげんな行');
lines.push(`体重|2026/11/19 7:00|2026/11/19 7:00|70.5|kg`);

const { samples, skipped } = M.parseText(lines.join('\n'));
assert.strictEqual(skipped, 1, '壊れた行は1行だけスキップされる');
const merged = M.mergeSamples(samples, samples);
assert.strictEqual(merged.length, samples.length, '重複は取り込まれない');

const days = M.buildDays(merged);
const n = days['2026-11-19'].night;
assert.strictEqual(n.totalMin, 223, '最後の夜の睡眠＝コア90+深い30+レム60+コア43');
assert.strictEqual(n.deepMin, 30);
assert.strictEqual(n.awakeCount, 3);
assert.strictEqual(n.spo2Min, 95, '0.95 → 95% に変換');
assert.strictEqual(days['2026-11-18'].night.totalMin, 415);
assert.strictEqual(days['2026-11-18'].steps, 2500, '「2,500」の読み取り');
assert.strictEqual(days['2026-11-19'].weight, 70.5, '日本式の日付の読み取り');

const profile = { sex: '男性', birthYear: 1997, height: 175, weight: 70.5 };
const r = M.analyze(days, profile);
assert.strictEqual(r.date, '2026-11-19');
const titles = r.findings.map(f => f.title);
console.log('判定:', r.levelLabel, 'スコア:', r.score);
console.log(titles);
assert.ok(titles.includes('睡眠時間が短めです'));
assert.ok(titles.includes('安静時心拍数がかなり高めです'));
assert.ok(titles.includes('HRV（心拍変動）が普段より低めです'));
assert.ok(titles.includes('疲れがたまっている可能性があります'));
assert.ok(titles.includes('睡眠リズムが乱れています'));
assert.ok(titles.includes('活動量が少なめです'), '前日の歩数2,500歩');
assert.strictEqual(r.levelLabel, '要確認');
assert.ok(r.diffs.length >= 3);

// 普段どおりの日は「通常」
const r2 = M.analyze(days, profile, '2026-11-17');
assert.strictEqual(r2.levelLabel, '通常', JSON.stringify(r2.findings));

// データがない場合は架空の値を作らない
assert.strictEqual(M.analyze({}, profile), null);
const empty = M.buildDays([]);
assert.deepStrictEqual(empty, {});

// 睡眠スコア
const good = M.sleepScore(days, '2026-11-17', profile);
assert.strictEqual(good.total, 99, JSON.stringify(good.parts));
assert.strictEqual(good.label, 'とても良い');
const bad = M.sleepScore(days, '2026-11-19', profile);
assert.strictEqual(bad.total, 37, JSON.stringify(bad.parts));
assert.strictEqual(bad.label, '低い');
assert.strictEqual(bad.priority.id, 'duration');
console.log(bad.parts.map(p => `${p.name} ${p.score}/${p.max}：${p.note} → ${p.tip}`).join('\n'));
const first = M.sleepScore(days, '2026-11-10', profile);
assert.strictEqual(first.parts.find(p => p.id === 'regularity').score, null, '履歴がない日は規則正しさを採点しない');
assert.strictEqual(M.sleepScore(days, '2030-01-01', profile), null, '睡眠データがない日は点数を作らない');
console.log(M.lifestyleAdvice(days, profile));
console.log(M.buildConsultText(days, profile).split('\n').slice(0, 5).join('\n'));
console.log('✅ すべてのテストに合格');
