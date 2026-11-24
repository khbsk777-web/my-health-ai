/*
 * MY HEALTH AI - 分析ロジック（画面と切り離した部分）
 * ショートカットから届いたテキストを読み取り、夜ごと・日ごとに集計し、
 * 個人の過去データと比べて「通常／注意／要確認」を判定する。
 * ※医学的な診断はしない。架空の値は作らない（データがなければ null）。
 */
(function (root) {
  'use strict';

  // ---------- 1. テキストの読み取り ----------

  // 種類名（日本語・英語どちらでも）→ 内部コード
  function typeCode(name) {
    const s = String(name || '').toLowerCase();
    if (/除脂肪|lean/.test(s)) return null;
    if (/睡眠の変化|sleep change/.test(s)) return null;
    if (/睡眠|sleep/.test(s)) return 'sleep';
    if (/安静時心拍|resting/.test(s)) return 'rhr';
    if (/心拍変動|variability|hrv/.test(s)) return 'hrv';
    if (/歩行時平均心拍|walking heart/.test(s)) return null;
    if (/心拍数回復|recovery/.test(s)) return null;
    if (/心拍数|heart rate/.test(s)) return 'hr';
    if (/呼吸数|respiratory/.test(s)) return 'rr';
    if (/酸素|oxygen|spo2/.test(s)) return 'spo2';
    if (/手首皮膚温|wrist temp/.test(s)) return 'wtemp';
    if (/歩数|step count|^steps?$/.test(s)) return 'steps';
    if (/アクティブエネルギー|active energy/.test(s)) return 'energy';
    if (/エクササイズ|exercise/.test(s)) return 'exercise';
    if (/体重|body mass$|^weight/.test(s)) return 'weight';
    if (/身長|height/.test(s)) return 'height';
    return null;
  }

  function sleepStage(v) {
    const s = String(v || '').toLowerCase();
    if (/コア|core/.test(s)) return 'core';
    if (/深い|deep/.test(s)) return 'deep';
    if (/レム|rem/.test(s)) return 'rem';
    if (/覚醒|awake/.test(s)) return 'awake';
    if (/ベッド|in ?bed/.test(s)) return 'inbed';
    if (/睡眠|asleep|unspecified/.test(s)) return 'asleep';
    return null;
  }

  // 日付の読み取り（ISO 8601 / 2026/11/24 1:23 / 2026年11月24日 1:23 など）
  function parseDate(str) {
    if (!str) return null;
    let s = String(str).trim();
    let d = new Date(s);
    if (!isNaN(d)) return d;
    const m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D*?(?:(午前|午後)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    let h = m[5] ? Number(m[5]) : 0;
    if (m[4] === '午後' && h < 12) h += 12;
    if (m[4] === '午前' && h === 12) h = 0;
    d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, m[6] ? Number(m[6]) : 0, m[7] ? Number(m[7]) : 0);
    return isNaN(d) ? null : d;
  }

  function parseNumber(v) {
    if (v == null) return null;
    const m = String(v).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : null;
  }

  /**
   * 1行 = 種類|開始日|終了日|値|単位
   * 戻り値: { samples: [...], skipped: 行数 }
   */
  function parseText(text) {
    const samples = [];
    let skipped = 0;
    String(text || '').split(/\r?\n/).forEach(function (line) {
      line = line.trim();
      if (!line) return;
      const p = line.split('|').map(function (x) { return x.trim(); });
      if (p.length < 4) { skipped++; return; }
      const code = typeCode(p[0]);
      const start = parseDate(p[1]);
      const end = parseDate(p[2]) || start;
      if (!code || !start) { skipped++; return; }
      const s = { t: code, s: start.getTime(), e: end.getTime() };
      if (code === 'sleep') {
        s.v = sleepStage(p[3]);
        if (!s.v) { skipped++; return; }
      } else {
        let n = parseNumber(p[3]);
        if (n == null) { skipped++; return; }
        if (code === 'spo2' && n <= 1) n = n * 100;           // 0.97 → 97
        if (code === 'height' && n > 3) n = n / 100;          // 172 cm → 1.72 m
        s.v = Math.round(n * 100) / 100;
      }
      samples.push(s);
    });
    return { samples: samples, skipped: skipped };
  }

  function sampleKey(s) { return s.t + '|' + s.s + '|' + s.e + '|' + s.v; }

  // 既存データと新しいデータをまとめる（重複は1つにする）
  function mergeSamples(oldList, newList) {
    const map = new Map();
    (oldList || []).concat(newList || []).forEach(function (s) { map.set(sampleKey(s), s); });
    return Array.from(map.values()).sort(function (a, b) { return a.s - b.s; });
  }

  // ---------- 2. 集計 ----------

  function dateKey(ms) {
    const d = new Date(ms);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function avg(arr) { return arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : null; }
  function round(v, n) { if (v == null) return null; const k = Math.pow(10, n || 0); return Math.round(v * k) / k; }

  // 睡眠サンプルを「夜」ごとにまとめる
  function buildNights(samples) {
    const sl = samples.filter(function (s) { return s.t === 'sleep' && s.v !== 'inbed'; })
      .sort(function (a, b) { return a.s - b.s; });
    const clusters = [];
    let cur = null;
    sl.forEach(function (s) {
      if (!cur || s.s - cur.end > 3 * 3600e3) { cur = { items: [], end: s.e }; clusters.push(cur); }
      cur.items.push(s);
      cur.end = Math.max(cur.end, s.e);
    });

    const nights = [];
    clusters.forEach(function (c) {
      const asleep = c.items.filter(function (s) { return s.v !== 'awake'; });
      if (!asleep.length) return;
      const min = function (stage) {
        return c.items.filter(function (s) { return s.v === stage; })
          .reduce(function (a, s) { return a + (s.e - s.s) / 60000; }, 0);
      };
      const bed = Math.min.apply(null, asleep.map(function (s) { return s.s; }));
      const wake = Math.max.apply(null, asleep.map(function (s) { return s.e; }));
      const total = min('core') + min('deep') + min('rem') + min('asleep');
      if (total < 60) return; // 1時間未満は仮眠として除外
      const awakeCount = c.items.filter(function (s) { return s.v === 'awake' && s.s > bed && s.e < wake; }).length;
      const hasStages = min('core') + min('deep') + min('rem') > 0;

      const inWin = function (t) { return samples.filter(function (s) { return s.t === t && s.s >= bed && s.s <= wake; }).map(function (s) { return s.v; }); };
      const hr = inWin('hr'), rr = inWin('rr'), sp = inWin('spo2'), hrv = inWin('hrv');
      const wt = samples.filter(function (s) { return s.t === 'wtemp' && s.e >= bed - 3600e3 && s.s <= wake + 6 * 3600e3; }).map(function (s) { return s.v; });

      nights.push({
        date: dateKey(wake),
        bed: bed, wake: wake,
        totalMin: Math.round(total),
        deepMin: hasStages ? Math.round(min('deep')) : null,
        coreMin: hasStages ? Math.round(min('core')) : null,
        remMin: hasStages ? Math.round(min('rem')) : null,
        awakeMin: Math.round(min('awake')),
        awakeCount: awakeCount,
        hrAvg: round(avg(hr), 0), hrMin: hr.length ? Math.min.apply(null, hr) : null,
        rrAvg: round(avg(rr), 1),
        spo2Avg: round(avg(sp), 0), spo2Min: sp.length ? Math.min.apply(null, sp) : null,
        hrvAvg: round(avg(hrv), 0),
        wtemp: wt.length ? round(avg(wt), 2) : null
      });
    });
    // 同じ日付の夜が2つあれば長いほうを使う
    const byDate = {};
    nights.forEach(function (n) { if (!byDate[n.date] || byDate[n.date].totalMin < n.totalMin) byDate[n.date] = n; });
    return byDate;
  }

  // 日ごとの記録を作る
  function buildDays(samples) {
    const nights = buildNights(samples);
    const days = {};
    const day = function (k) { return days[k] || (days[k] = { date: k }); };

    Object.keys(nights).forEach(function (k) { day(k).night = nights[k]; });

    const sumBy = function (t, field) {
      samples.filter(function (s) { return s.t === t; }).forEach(function (s) {
        const d = day(dateKey(s.s));
        d[field] = (d[field] || 0) + s.v;
      });
    };
    sumBy('steps', 'steps');
    sumBy('energy', 'energy');
    sumBy('exercise', 'exercise');

    const lastBy = function (t, field) {
      samples.filter(function (s) { return s.t === t; }).forEach(function (s) { day(dateKey(s.s))[field] = s.v; });
    };
    lastBy('rhr', 'rhr');
    lastBy('weight', 'weight');

    // 日中も含めた HRV の平均（睡眠中のデータがない日のため）
    const hrvDay = {};
    samples.filter(function (s) { return s.t === 'hrv'; }).forEach(function (s) {
      const k = dateKey(s.s); (hrvDay[k] = hrvDay[k] || []).push(s.v);
    });
    Object.keys(hrvDay).forEach(function (k) { day(k).hrvDay = round(avg(hrvDay[k]), 0); });

    Object.keys(days).forEach(function (k) {
      ['steps', 'energy', 'exercise'].forEach(function (f) { if (days[k][f] != null) days[k][f] = Math.round(days[k][f]); });
    });
    return days;
  }

  // ---------- 3. 判定 ----------

  function getMetric(d, m) {
    if (!d) return null;
    const n = d.night || {};
    switch (m) {
      case 'sleep': return n.totalMin != null ? n.totalMin : null;
      case 'deepPct': return n.deepMin != null && n.totalMin ? (n.deepMin / n.totalMin) * 100 : null;
      case 'sleepHr': return n.hrAvg != null ? n.hrAvg : null;
      case 'rr': return n.rrAvg != null ? n.rrAvg : null;
      case 'spo2Min': return n.spo2Min != null ? n.spo2Min : null;
      case 'hrv': return n.hrvAvg != null ? n.hrvAvg : (d.hrvDay != null ? d.hrvDay : null);
      case 'rhr': return d.rhr != null ? d.rhr : null;
      case 'steps': return d.steps != null ? d.steps : null;
      case 'bedMin': {
        if (!n.bed) return null;
        const b = new Date(n.bed);
        let mins = b.getHours() * 60 + b.getMinutes();
        if (mins < 12 * 60) mins += 24 * 60; // 深夜0時以降は「24時以降」として扱う
        return mins;
      }
      default: return null;
    }
  }

  function addDays(key, delta) {
    const p = key.split('-').map(Number);
    return dateKey(new Date(p[0], p[1] - 1, p[2] + delta).getTime());
  }

  // 過去N日（当日を除く）の平均。3日分以上ないときは null
  function baseline(days, key, m, n) {
    const vals = [];
    for (let i = 1; i <= n; i++) {
      const v = getMetric(days[addDays(key, -i)], m);
      if (v != null) vals.push(v);
    }
    return vals.length >= 3 ? avg(vals) : null;
  }

  function age(profile) {
    if (!profile || !profile.birthYear) return null;
    return new Date().getFullYear() - Number(profile.birthYear);
  }

  function recommendedSleep(profile) {
    const a = age(profile);
    if (a == null) return { min: 7 * 60, max: 9 * 60, label: '7〜9時間（成人の目安）' };
    if (a < 18) return { min: 8 * 60, max: 10 * 60, label: '8〜10時間（10代の目安）' };
    if (a >= 65) return { min: 7 * 60, max: 8 * 60, label: '7〜8時間（65歳以上の目安）' };
    return { min: 7 * 60, max: 9 * 60, label: '7〜9時間（成人の目安）' };
  }

  function bmi(profile) {
    if (!profile || !profile.height || !profile.weight) return null;
    const h = Number(profile.height) / 100;
    return h > 0 ? round(Number(profile.weight) / (h * h), 1) : null;
  }

  const LEVEL = { normal: 0, caution: 1, check: 2 };
  const LEVEL_LABEL = ['通常', '注意', '要確認'];

  /**
   * 指定日（未指定なら最新の睡眠がある日）の分析
   */
  function analyze(days, profile, targetKey) {
    const keys = Object.keys(days).sort();
    if (!keys.length) return null;
    const key = targetKey || keys.filter(function (k) { return days[k].night; }).pop() || keys[keys.length - 1];
    const d = days[key];
    const prevKey = addDays(key, -1);
    const prev = days[prevKey];
    const findings = [];
    const add = function (level, title, detail, cause, action) {
      findings.push({ level: level, title: title, detail: detail, cause: cause, action: action });
    };
    const rec = recommendedSleep(profile);

    const sleep = getMetric(d, 'sleep');
    const sleepBase = baseline(days, key, 'sleep', 30);
    if (sleep != null) {
      // 3日連続の睡眠不足
      let shortStreak = 0;
      for (let i = 0; i < 7; i++) {
        const v = getMetric(days[addDays(key, -i)], 'sleep');
        if (v != null && v < 6 * 60) shortStreak++; else break;
      }
      if (shortStreak >= 3) add(LEVEL.check, '睡眠不足が続いています', shortStreak + '日連続で6時間未満です。', '就寝時刻の遅れ、仕事や移動の疲れ、寝る前のスマホなど', '今夜は目標の就寝時刻を決め、いつもより30〜60分早く布団に入りましょう。');
      else if (sleep < 6 * 60) add(LEVEL.caution, '睡眠時間が短めです', fmtMin(sleep) + '（目安：' + rec.label + '）', '寝る時刻が遅い、夜中に目が覚めた など', '今夜はいつもより30分早く寝る準備を始めましょう。');
      else if (sleep < rec.min) add(LEVEL.normal, '睡眠時間が目安より少し短めです', fmtMin(sleep) + '（目安：' + rec.label + '）', '', '寝る前の1時間はスマホや明るい画面を控えると寝つきやすくなります。');
    }

    const deepPct = getMetric(d, 'deepPct');
    if (deepPct != null && deepPct < 8) add(LEVEL.caution, '深い睡眠が少なめです', '深い睡眠は睡眠全体の' + round(deepPct, 0) + '%でした。', '寝る直前の飲酒・食事、寝室の暑さ、ストレスなど', '寝る3時間前までに夕食を済ませ、寝室を少し涼しく（目安18〜22℃）保ちましょう。');

    const awake = d.night ? d.night.awakeCount : null;
    let awakeVals = [];
    for (let i = 1; i <= 30; i++) { const x = days[addDays(key, -i)]; if (x && x.night) awakeVals.push(x.night.awakeCount); }
    const awakeAvg = awakeVals.length >= 3 ? avg(awakeVals) : null;
    if (awake != null && awakeAvg != null && awake >= awakeAvg + 3) add(LEVEL.caution, '夜中に目が覚めた回数が多めです', awake + '回（普段の平均 ' + round(awakeAvg, 1) + '回）', '寝室の音や光、トイレ、寝る前のカフェインや飲酒など', '夕方以降のカフェインを控え、寝室を暗く静かにしましょう。');

    const rhr = getMetric(d, 'rhr');
    const rhrBase = baseline(days, key, 'rhr', 30);
    const sleepHr = getMetric(d, 'sleepHr');
    const sleepHrBase = baseline(days, key, 'sleepHr', 30);
    const hrUp = (rhr != null && rhrBase != null && rhr - rhrBase >= 5) || (sleepHr != null && sleepHrBase != null && sleepHr - sleepHrBase >= 5);
    if (rhr != null && rhrBase != null && rhr - rhrBase >= 10) add(LEVEL.check, '安静時心拍数がかなり高めです', rhr + '拍/分（普段 ' + round(rhrBase, 0) + '拍/分）', '疲れ、睡眠不足、体調の変化、飲酒など', '今日は激しい運動を避けて休養を優先しましょう。数日続く場合や体調が悪い場合は医療機関に相談してください。');
    else if (hrUp) add(LEVEL.caution, '心拍数が普段より高めです', (rhr != null ? '安静時 ' + rhr + '拍/分' : '') + (sleepHr != null ? (rhr != null ? '・' : '') + '睡眠中平均 ' + sleepHr + '拍/分' : ''), '疲れ、睡眠不足、飲酒、ストレスなど', '水分をこまめにとり、今日は軽めの運動にしましょう。');

    const hrv = getMetric(d, 'hrv');
    const hrvBase = baseline(days, key, 'hrv', 30);
    if (hrv != null && hrvBase != null && hrv < hrvBase * 0.8) add(LEVEL.caution, 'HRV（心拍変動）が普段より低めです', hrv + 'ms（普段 ' + round(hrvBase, 0) + 'ms）', '疲れやストレスがたまっているサインのことがあります', '深呼吸やストレッチなどでリラックスする時間を作りましょう。');

    // 組み合わせ：睡眠不足＋心拍上昇＝疲労傾向
    if (sleep != null && sleep < 6 * 60 && (hrUp || (hrv != null && hrvBase != null && hrv < hrvBase * 0.8))) {
      add(LEVEL.check, '疲れがたまっている可能性があります', '睡眠不足と、心拍数またはHRVの変化が同時に出ています。', '睡眠不足や疲労の蓄積', '今日は無理をせず、早めに寝ることを最優先にしましょう。');
    }

    const rr = getMetric(d, 'rr');
    const rrBase = baseline(days, key, 'rr', 30);
    if (rr != null && rrBase != null && Math.abs(rr - rrBase) >= 3) add(LEVEL.check, '睡眠中の呼吸数が普段と大きく違います', rr + '回/分（普段 ' + round(rrBase, 1) + '回/分）', '体調の変化、鼻づまり、飲酒など', '続く場合や息苦しさなどがある場合は医療機関に相談してください。');
    else if (rr != null && rrBase != null && Math.abs(rr - rrBase) >= 2) add(LEVEL.caution, '睡眠中の呼吸数がいつもと少し違います', rr + '回/分（普段 ' + round(rrBase, 1) + '回/分）', '体調の変化、鼻づまり、寝室の乾燥など', '寝室の湿度（目安40〜60%）を保ちましょう。');

    const spMin = getMetric(d, 'spo2Min');
    let lowSpNights = 0;
    for (let i = 0; i < 7; i++) { const v = getMetric(days[addDays(key, -i)], 'spo2Min'); if (v != null && v < 90) lowSpNights++; }
    if (lowSpNights >= 2) add(LEVEL.check, '睡眠中の血中酸素が低めの夜が続いています', '過去7日で' + lowSpNights + '回、90%未満の記録がありました。', 'Apple Watchの付け方による測定誤差のこともあります', 'いびきや日中の強い眠気がある場合は、医療機関（睡眠外来など）に相談してください。');
    else if (spMin != null && spMin < 90) add(LEVEL.caution, '睡眠中の血中酸素が一時的に低めでした', '最低 ' + spMin + '%', 'Apple Watchのずれなど測定誤差のこともあります', 'バンドを手首にしっかり付けて寝てみましょう。続く場合は相談を。');

    const bedMin = getMetric(d, 'bedMin');
    const bedBase = baseline(days, key, 'bedMin', 7);
    if (bedMin != null && bedBase != null && Math.abs(bedMin - bedBase) >= 60) add(LEVEL.caution, '睡眠リズムが乱れています', '寝た時刻が普段より' + Math.round(Math.abs(bedMin - bedBase)) + '分' + (bedMin > bedBase ? '遅い' : '早い') + 'です。', '夜ふかし、出張や予定の変化など', '起きる時刻をできるだけ毎日そろえ、朝に日光を浴びましょう。');

    const steps = getMetric(prev, 'steps') != null ? getMetric(prev, 'steps') : getMetric(d, 'steps');
    const stepsBase = baseline(days, prevKey, 'steps', 30);
    if (steps != null && (steps < 4000 || (stepsBase != null && steps < stepsBase * 0.6))) add(LEVEL.caution, '活動量が少なめです', '歩数 ' + steps.toLocaleString() + '歩' + (stepsBase != null ? '（普段 ' + Math.round(stepsBase).toLocaleString() + '歩）' : ''), '座り仕事や移動が車中心の日など', '昼休みや移動のついでに10分歩くだけでも、夜の眠りが深くなりやすくなります。');

    // 総合レベルとスコア
    let level = 0;
    let score = 100;
    findings.forEach(function (f) { level = Math.max(level, f.level); score -= f.level === 2 ? 20 : f.level === 1 ? 8 : 0; });
    if (sleep != null && sleep < rec.min) score -= Math.min(20, Math.round((rec.min - sleep) / 6));
    score = Math.max(0, Math.min(100, score));
    const hasData = sleep != null || rhr != null || hrv != null || steps != null;

    // 前日との違い
    const diffs = [];
    const diff = function (label, m, unit, fmt) {
      const a = getMetric(d, m), b = getMetric(prev, m);
      if (a == null || b == null) return;
      const v = a - b;
      diffs.push(label + '：' + (fmt ? fmt(a) : a + unit) + '（前日より' + (v >= 0 ? '+' : '') + (fmt ? fmtMinSigned(v) : round(v, 1) + unit) + '）');
    };
    diff('睡眠時間', 'sleep', '', fmtMin);
    diff('安静時心拍数', 'rhr', '拍/分');
    diff('HRV', 'hrv', 'ms');
    diff('睡眠中の呼吸数', 'rr', '回/分');

    return {
      date: key,
      day: d,
      level: hasData ? level : null,
      levelLabel: hasData ? LEVEL_LABEL[level] : 'データ未取得',
      score: hasData ? score : null,
      findings: findings,
      diffs: diffs,
      baselines: { sleep: sleepBase, rhr: rhrBase, hrv: hrvBase, rr: rrBase, steps: stepsBase },
      recommended: rec
    };
  }

  // プロフィールにもとづく生活改善アドバイス
  function lifestyleAdvice(days, profile) {
    const out = [];
    const b = bmi(profile);
    if (b != null) {
      if (b < 18.5) out.push('BMIは' + b + '（低体重の範囲）です。食事の量と回数を見直し、筋トレで筋肉をつけましょう。');
      else if (b < 25) out.push('BMIは' + b + '（普通体重の範囲）です。今の体重を保ちましょう。');
      else out.push('BMIは' + b + '（日本の基準では肥満の範囲）です。毎日の歩数を少しずつ増やし、夜遅い食事を控えると体重と睡眠の両方に良い影響があります。');
    }
    const keys = Object.keys(days).sort().slice(-7);
    const sl = keys.map(function (k) { return getMetric(days[k], 'sleep'); }).filter(function (v) { return v != null; });
    const st = keys.map(function (k) { return getMetric(days[k], 'steps'); }).filter(function (v) { return v != null; });
    const rec = recommendedSleep(profile);
    if (sl.length) {
      const a = avg(sl);
      out.push('直近の平均睡眠は' + fmtMin(a) + 'です（目安：' + rec.label + '）。' + (a < rec.min ? '目安まであと' + fmtMin(rec.min - a) + '足りません。' : '目安に届いています。'));
    }
    if (st.length) {
      const a = avg(st);
      out.push('直近の平均歩数は' + Math.round(a).toLocaleString() + '歩です。' + (a < 8000 ? '1日8,000歩を目標に、まずは＋1,000歩から始めましょう。' : 'しっかり動けています。'));
    }
    const a = age(profile);
    if (a != null && a >= 40) out.push('40歳以上は年に1回の健康診断で、血圧や血糖値もチェックしましょう。');
    return out;
  }

  // 「Claudeに相談」用の文章
  function buildConsultText(days, profile) {
    const keys = Object.keys(days).sort().slice(-7);
    const lines = [];
    lines.push('私のApple Watchの健康データ（直近7日）をもとに、睡眠と生活の改善策を教えてください。医学的な診断は不要です。気になる点があれば医療機関に相談すべきかも教えてください。');
    lines.push('');
    if (profile) {
      const p = [];
      if (profile.sex) p.push('性別：' + profile.sex);
      if (age(profile) != null) p.push('年齢：' + age(profile) + '歳');
      if (profile.height) p.push('身長：' + profile.height + 'cm');
      if (profile.weight) p.push('体重：' + profile.weight + 'kg');
      if (bmi(profile) != null) p.push('BMI：' + bmi(profile));
      if (p.length) lines.push('【プロフィール】' + p.join('、'));
    }
    lines.push('【日ごとのデータ】');
    keys.forEach(function (k) {
      const d = days[k], n = d.night || {};
      const parts = [k];
      if (n.totalMin != null) parts.push('睡眠' + fmtMin(n.totalMin) + '（深い' + (n.deepMin != null ? n.deepMin + '分' : '不明') + '・REM' + (n.remMin != null ? n.remMin + '分' : '不明') + '・覚醒' + n.awakeCount + '回）');
      if (n.bed) parts.push('就寝' + fmtTime(n.bed) + '・起床' + fmtTime(n.wake));
      if (n.hrAvg != null) parts.push('睡眠中心拍' + n.hrAvg);
      if (n.rrAvg != null) parts.push('呼吸数' + n.rrAvg);
      if (n.spo2Min != null) parts.push('血中酸素最低' + n.spo2Min + '%');
      if (d.rhr != null) parts.push('安静時心拍' + d.rhr);
      const h = getMetric(d, 'hrv'); if (h != null) parts.push('HRV' + h + 'ms');
      if (d.steps != null) parts.push('歩数' + d.steps);
      if (d.exercise != null) parts.push('運動' + d.exercise + '分');
      lines.push('・' + parts.join('、'));
    });
    return lines.join('\n');
  }

  // ---------- 表示用 ----------
  function fmtMin(m) {
    if (m == null) return 'データ未取得';
    m = Math.round(m);
    if (m < 60) return m + '分';
    return Math.floor(m / 60) + '時間' + String(m % 60).padStart(2, '0') + '分';
  }
  function fmtMinSigned(m) { return (m < 0 ? '-' : '') + fmtMin(Math.abs(m)); }
  function fmtTime(ms) { const d = new Date(ms); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); }

  const api = {
    parseText: parseText, mergeSamples: mergeSamples, buildDays: buildDays, buildNights: buildNights,
    analyze: analyze, lifestyleAdvice: lifestyleAdvice, buildConsultText: buildConsultText,
    getMetric: getMetric, baseline: baseline, bmi: bmi, age: age, recommendedSleep: recommendedSleep,
    fmtMin: fmtMin, fmtTime: fmtTime, dateKey: dateKey, addDays: addDays, typeCode: typeCode, parseDate: parseDate,
    LEVEL_LABEL: LEVEL_LABEL
  };
  root.MHA = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
