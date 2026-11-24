/* MY HEALTH AI - 画面の動き */
(function () {
  'use strict';
  const M = window.MHA;
  const KEY_SAMPLES = 'mha.samples.v1';
  const KEY_PROFILE = 'mha.profile.v1';
  const TITLES = { home: 'ホーム', sleep: '睡眠', analysis: 'AI分析', activity: '運動', data: 'データ管理' };

  // ---------- 保存（端末の中だけ） ----------
  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { toast('保存できませんでした（容量不足の可能性）'); return false; }
  }

  let samples = load(KEY_SAMPLES, []);
  let profile = load(KEY_PROFILE, {});
  let days = {};

  const $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function na() { return '<span class="na">データ未取得</span>'; }
  function val(v, unit) { return v == null ? na() : '<span class="big">' + esc(v) + '</span><span class="unit">' + esc(unit || '') + '</span>'; }
  function badge(level, label) { return '<span class="badge ' + (level == null ? 'lvn' : 'lv' + level) + '">' + esc(label) + '</span>'; }

  // ---------- 取り込み ----------
  function importText(text) {
    const r = M.parseText(text);
    if (!r.samples.length) { toast('取り込めるデータがありませんでした'); return 0; }
    const before = samples.length;
    samples = M.mergeSamples(samples, r.samples);
    // 1年より古いデータは容量節約のため削除
    const limit = Date.now() - 366 * 86400e3;
    samples = samples.filter(function (s) { return s.s >= limit; });
    save(KEY_SAMPLES, samples);
    autoProfile();
    const added = samples.length - before;
    toast(added > 0 ? added + '件のデータを取り込みました' : '新しいデータはありませんでした（取り込み済み）');
    render();
    return added;
  }

  // ショートカットから「#import=...」で開かれたとき
  function checkHashImport() {
    const h = location.hash || '';
    const m = h.match(/^#import=([\s\S]*)$/);
    if (!m) return;
    let text = m[1];
    try { text = decodeURIComponent(text); } catch (e) { /* そのまま */ }
    // 健康データがURLに残らないよう、すぐに消す
    history.replaceState(null, '', location.pathname + location.search);
    importText(text);
  }

  // ヘルスケアの身長・体重でプロフィールを補う（手入力が優先）
  function autoProfile() {
    const w = samples.filter(function (s) { return s.t === 'weight'; }).pop();
    const h = samples.filter(function (s) { return s.t === 'height'; }).pop();
    let changed = false;
    if (w && profile.weightSource !== 'manual') { profile.weight = w.v; profile.weightSource = 'health'; changed = true; }
    if (h && !profile.height) { profile.height = Math.round(h.v * 100); changed = true; }
    if (changed) save(KEY_PROFILE, profile);
  }

  // ---------- グラフ（SVGの棒グラフ） ----------
  function barChart(items, opts) {
    const W = 340, H = 150, pad = 22, n = items.length;
    const max = Math.max(opts.min || 0, ...items.map(function (i) { return i.v || 0; })) || 1;
    const bw = (W - pad) / n;
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + esc(opts.label) + '">';
    if (opts.goal) {
      const gy = H - pad - (opts.goal / max) * (H - pad - 10);
      s += '<line x1="0" x2="' + W + '" y1="' + gy + '" y2="' + gy + '" stroke="var(--green)" stroke-dasharray="4 4"/>';
    }
    items.forEach(function (it, i) {
      const x = i * bw + 4;
      if (it.v == null) {
        s += '<text x="' + (x + bw / 2 - 4) + '" y="' + (H - pad - 4) + '" text-anchor="middle">-</text>';
      } else {
        const h = (it.v / max) * (H - pad - 10);
        s += '<rect x="' + x + '" y="' + (H - pad - h) + '" width="' + (bw - 8) + '" height="' + h + '" rx="4" fill="' + (it.color || 'var(--blue)') + '"/>';
      }
      s += '<text x="' + (x + bw / 2 - 4) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(it.label) + '</text>';
    });
    return s + '</svg>';
  }

  function lastNDays(n, endKey) {
    const out = [];
    const end = endKey || M.dateKey(Date.now());
    for (let i = n - 1; i >= 0; i--) out.push(M.addDays(end, -i));
    return out;
  }
  function shortDate(k) { const p = k.split('-'); return Number(p[1]) + '/' + Number(p[2]); }
  function avgOf(keys, m) {
    const v = keys.map(function (k) { return M.getMetric(days[k], m); }).filter(function (x) { return x != null; });
    return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null;
  }

  // ---------- 各画面 ----------
  function emptyGuide() {
    return '<div class="card"><b>まだデータがありません</b>' +
      '<p class="muted">iPhoneの「ショートカット」アプリで <b>MY HEALTH AI 取り込み</b> を実行すると、Apple Watchのデータがここに表示されます。</p>' +
      '<p class="muted">作り方はチャットでClaudeが案内します。架空のデータは表示しません。</p></div>';
  }

  function renderHome(a) {
    const el = $('tab-home');
    if (!a) { el.innerHTML = emptyGuide(); return; }
    const d = a.day, n = d.night || {};
    const score = a.score;
    const ring = score == null ? '' :
      '<svg width="84" height="84" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--line)" stroke-width="3.5"/>' +
      '<circle cx="18" cy="18" r="15.9" fill="none" stroke="' + (a.level === 2 ? 'var(--red)' : a.level === 1 ? 'var(--orange)' : 'var(--green)') + '" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="' + score + ' 100" transform="rotate(-90 18 18)"/>' +
      '<text x="18" y="21.5" text-anchor="middle" style="font-size:10px;font-weight:700;fill:var(--text)">' + score + '</text></svg>';
    const top = a.findings.filter(function (f) { return f.level >= 1; }).sort(function (x, y) { return y.level - x.level; })[0];
    const advice = top ? top.action : (a.findings[0] ? a.findings[0].action : '大きな変化はありません。今日もいつもどおりのリズムで過ごしましょう。');
    el.innerHTML =
      '<div class="card"><div class="label">今日の健康スコア（' + esc(shortDate(a.date)) + 'の朝）</div>' +
      '<div class="scorewrap">' + (ring || na()) + '<div>' + badge(a.level, a.levelLabel) +
      '<div class="muted" style="margin-top:6px">' + (a.findings.filter(function (f) { return f.level >= 1; }).length ? '気になる変化が ' + a.findings.filter(function (f) { return f.level >= 1; }).length + '件あります' : '大きな変化はありません') + '</div></div></div></div>' +
      '<div class="grid">' +
      '<div class="card"><div class="label">睡眠時間</div>' + (n.totalMin != null ? '<span class="big" style="font-size:22px">' + esc(M.fmtMin(n.totalMin)) + '</span>' : na()) + '</div>' +
      '<div class="card"><div class="label">安静時心拍数</div>' + val(d.rhr, '拍/分') + '</div>' +
      '<div class="card"><div class="label">HRV</div>' + val(M.getMetric(d, 'hrv'), 'ms') + '</div>' +
      '<div class="card"><div class="label">歩数（前日）</div>' + val(M.getMetric(days[M.addDays(a.date, -1)], 'steps') != null ? M.getMetric(days[M.addDays(a.date, -1)], 'steps').toLocaleString() : null, '歩') + '</div>' +
      '</div>' +
      '<div class="card"><div class="label">✦ AIからの今日のアドバイス</div><div style="margin-top:4px">' + esc(advice) + '</div></div>' +
      '<button id="consultBtn">Claudeにくわしく相談する（文章をコピー）</button>' +
      '<p class="disclaimer">医学的な診断ではありません。強い症状がある場合は医療機関に相談してください。</p>';
    $('consultBtn').onclick = copyConsult;
  }

  function renderSleep(a) {
    const el = $('tab-sleep');
    if (!a) { el.innerHTML = emptyGuide(); return; }
    const n = (a.day.night) || null;
    let html = '<h2>昨夜の睡眠</h2>';
    if (!n) {
      html += '<div class="card">' + na() + '<div class="muted">この日の睡眠データはありません。</div></div>';
    } else {
      const parts = [['deep', '深い', n.deepMin], ['core', 'コア', n.coreMin], ['rem', 'レム', n.remMin], ['awake', '覚醒', n.awakeMin]];
      const total = parts.reduce(function (s, p) { return s + (p[2] || 0); }, 0) || 1;
      const hasStages = n.deepMin != null;
      html += '<div class="card"><div class="big">' + esc(M.fmtMin(n.totalMin)) + '</div>' +
        '<div class="muted">' + esc(M.fmtTime(n.bed)) + ' 就寝 → ' + esc(M.fmtTime(n.wake)) + ' 起床</div>' +
        (hasStages ? '<div class="stagebar">' + parts.map(function (p) { return p[2] ? '<div style="width:' + (p[2] / total * 100) + '%;background:var(--' + p[0] + ')"></div>' : ''; }).join('') + '</div>' +
          '<div class="legend">' + parts.map(function (p) { return '<span><span class="dot" style="background:var(--' + p[0] + ')"></span>' + p[1] + ' ' + (p[2] != null ? esc(M.fmtMin(p[2])) : 'データ未取得') + '</span>'; }).join('') + '</div>'
          : '<div class="muted">睡眠ステージ：データ未取得</div>') +
        '</div>' +
        '<div class="card">' +
        '<div class="row"><span>目が覚めた回数</span><span>' + n.awakeCount + '回</span></div>' +
        '<div class="row"><span>睡眠中の平均心拍数</span><span>' + (n.hrAvg != null ? n.hrAvg + ' 拍/分' : 'データ未取得') + '</span></div>' +
        '<div class="row"><span>睡眠中の呼吸数</span><span>' + (n.rrAvg != null ? n.rrAvg + ' 回/分' : 'データ未取得') + '</span></div>' +
        '<div class="row"><span>血中酸素（平均／最低）</span><span>' + (n.spo2Avg != null ? n.spo2Avg + '% ／ ' + n.spo2Min + '%' : 'データ未取得') + '</span></div>' +
        '<div class="row"><span>手首皮膚温</span><span>' + (n.wtemp != null ? n.wtemp + ' ℃' : 'データ未取得') + '</span></div>' +
        '<div class="row"><span>いびき</span><span class="muted">無料版では測定できません</span></div>' +
        '</div>';
    }
    const keys = lastNDays(7, a.date);
    html += '<h2>睡眠の週間推移</h2><div class="card">' +
      barChart(keys.map(function (k) { const v = M.getMetric(days[k], 'sleep'); return { label: shortDate(k), v: v != null ? v / 60 : null, color: 'var(--core)' }; }), { label: '睡眠時間', goal: a.recommended.min / 60, min: 9 }) +
      '<div class="muted">緑の点線：目安（' + esc(a.recommended.label) + '）の下限</div></div>';
    el.innerHTML = html;
  }

  function renderAnalysis(a) {
    const el = $('tab-analysis');
    if (!a) { el.innerHTML = emptyGuide(); return; }
    const concerns = a.findings.filter(function (f) { return f.level >= 1; });
    const causes = concerns.map(function (f) { return f.cause; }).filter(Boolean);
    const actions = a.findings.map(function (f) { return f.action; }).filter(Boolean);
    let html = '<h2>AI健康レポート</h2><div class="card">' +
      '<div class="label">① 現在の健康状態</div><div style="margin:4px 0 12px">' + badge(a.level, a.levelLabel) + ' ' + (a.level === 0 ? '大きな変化はありません。' : a.level === 1 ? '普段と違う傾向があります。' : a.level === 2 ? '続いている変化や気になるデータがあります。' : '') + '</div>' +
      '<div class="label">② 前日との違い</div><div style="margin:4px 0 12px">' + (a.diffs.length ? a.diffs.map(function (x) { return '・' + esc(x); }).join('<br>') : '<span class="muted">比べられるデータがありません</span>') + '</div>' +
      '<div class="label">③ 気になる変化</div>' + (concerns.length ? concerns.map(function (f) { return '<div class="finding l' + f.level + '"><b>' + esc(f.title) + '</b><span class="muted">' + esc(f.detail) + '</span></div>'; }).join('') : '<div style="margin:4px 0 12px" class="muted">特にありません</div>') +
      '<div class="label" style="margin-top:12px">④ 考えられる原因</div><div style="margin:4px 0 12px">' + (causes.length ? causes.map(function (x) { return '・' + esc(x); }).join('<br>') : '<span class="muted">—</span>') + '</div>' +
      '<div class="label">⑤ 今日のおすすめ行動</div><div style="margin-top:4px">' + (actions.length ? actions.map(function (x) { return '・' + esc(x); }).join('<br>') : '・いつもどおりのリズムで過ごしましょう。') + '</div>' +
      '</div>';

    const k7 = lastNDays(7, a.date).slice(0, 7), k30 = lastNDays(30, a.date);
    const rowsDef = [['睡眠時間', 'sleep', function (v) { return M.fmtMin(v); }], ['安静時心拍数', 'rhr', function (v) { return Math.round(v) + ' 拍/分'; }], ['HRV', 'hrv', function (v) { return Math.round(v) + ' ms'; }], ['睡眠中の呼吸数', 'rr', function (v) { return v.toFixed(1) + ' 回/分'; }], ['歩数', 'steps', function (v) { return Math.round(v).toLocaleString() + ' 歩'; }]];
    html += '<h2>7日間・30日間の比較</h2><div class="card"><div class="row"><span class="label">項目</span><span class="label">7日平均 ／ 30日平均</span></div>' +
      rowsDef.map(function (r) { const a7 = avgOf(k7, r[1]), a30 = avgOf(k30, r[1]); return '<div class="row"><span>' + r[0] + '</span><span>' + (a7 != null ? esc(r[2](a7)) : '—') + ' ／ ' + (a30 != null ? esc(r[2](a30)) : '—') + '</span></div>'; }).join('') +
      '<div class="muted" style="margin-top:6px">比べる基準は、あなた自身の過去のデータです。</div></div>';

    const life = M.lifestyleAdvice(days, profile);
    html += '<h2>生活改善アドバイス</h2><div class="card">' +
      (life.length ? life.map(function (x) { return '<p style="margin:6px 0">・' + esc(x) + '</p>'; }).join('') : '<span class="muted">「データ」タブでプロフィールを入れると、あなたに合わせたアドバイスが出ます。</span>') +
      (profile.birthYear && profile.height ? '' : '<button class="secondary" id="goProfile">プロフィールを入力する</button>') +
      '</div><button id="consultBtn2">Claudeにくわしく相談する（文章をコピー）</button>' +
      '<p class="disclaimer">数値だけで病気を判定しません。異常値が続く場合や強い症状がある場合は医療機関に相談してください。</p>';
    el.innerHTML = html;
    $('consultBtn2').onclick = copyConsult;
    if ($('goProfile')) $('goProfile').onclick = function () { showTab('data'); };
  }

  function renderActivity(a) {
    const el = $('tab-activity');
    const keys = lastNDays(7);
    const today = days[M.dateKey(Date.now())] || {};
    let html = '<h2>今日</h2><div class="grid">' +
      '<div class="card"><div class="label">歩数</div>' + val(today.steps != null ? today.steps.toLocaleString() : null, '歩') + '</div>' +
      '<div class="card"><div class="label">消費カロリー</div>' + val(today.energy, 'kcal') + '</div>' +
      '<div class="card"><div class="label">運動時間</div>' + val(today.exercise, '分') + '</div>' +
      '<div class="card"><div class="label">体重</div>' + val(profile.weight || null, 'kg') + '</div></div>';
    html += '<h2>歩数（7日間）</h2><div class="card">' + barChart(keys.map(function (k) { return { label: shortDate(k), v: M.getMetric(days[k], 'steps') }; }), { label: '歩数', goal: 8000, min: 8000 }) + '<div class="muted">緑の点線：1日8,000歩</div></div>';
    html += '<h2>運動時間（7日間）</h2><div class="card">' + barChart(keys.map(function (k) { return { label: shortDate(k), v: days[k] ? days[k].exercise : null, color: 'var(--green)' }; }), { label: '運動時間', goal: 30, min: 30 }) + '<div class="muted">緑の点線：1日30分</div></div>';
    html += '<div class="card muted">ジム・バスケットボールなどのワークアウト履歴は、次のバージョンで追加予定です。</div>';
    el.innerHTML = a || samples.length ? html : emptyGuide();
  }

  function renderData() {
    $('pSex').value = profile.sex || '';
    $('pBirth').value = profile.birthYear || '';
    $('pHeight').value = profile.height || '';
    $('pWeight').value = profile.weight || '';
    $('pAuto').textContent = profile.weightSource === 'health' ? '※体重はヘルスケアの最新の記録を使っています' : '';
    const keys = Object.keys(days).sort();
    const bytes = (function () { try { return (localStorage.getItem(KEY_SAMPLES) || '').length; } catch (e) { return 0; } })();
    $('storageInfo').innerHTML =
      '<div class="row"><span>データ件数</span><span>' + samples.length.toLocaleString() + ' 件</span></div>' +
      '<div class="row"><span>期間</span><span>' + (keys.length ? esc(keys[0]) + ' 〜 ' + esc(keys[keys.length - 1]) : '—') + '</span></div>' +
      '<div class="row"><span>使用容量</span><span>' + Math.round(bytes / 1024) + ' KB</span></div>';
  }

  function copyConsult() {
    const text = M.buildConsultText(days, profile);
    const done = function () { toast('コピーしました。Claudeのアプリに貼り付けてください'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    t.remove();
  }

  // ---------- 全体 ----------
  function render() {
    days = M.buildDays(samples);
    const a = M.analyze(days, profile);
    renderHome(a); renderSleep(a); renderAnalysis(a); renderActivity(a); renderData();
    const d = new Date();
    $('dateLabel').textContent = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日（' + '日月火水木金土'[d.getDay()] + '）';
  }

  function showTab(name) {
    document.querySelectorAll('section.tab').forEach(function (s) { s.classList.toggle('active', s.id === 'tab-' + name); });
    document.querySelectorAll('nav button').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === name); });
    $('title').textContent = TITLES[name];
    window.scrollTo(0, 0);
  }

  document.querySelectorAll('nav button').forEach(function (b) { b.onclick = function () { showTab(b.dataset.tab); }; });

  $('saveProfile').onclick = function () {
    const w = $('pWeight').value;
    profile = {
      sex: $('pSex').value,
      birthYear: $('pBirth').value ? Number($('pBirth').value) : null,
      height: $('pHeight').value ? Number($('pHeight').value) : null,
      weight: w ? Number(w) : null,
      weightSource: w && Number(w) !== profile.weight ? 'manual' : profile.weightSource
    };
    if (profile.birthYear && (profile.birthYear < 1900 || profile.birthYear > new Date().getFullYear())) { toast('生まれた年を確認してください'); return; }
    save(KEY_PROFILE, profile); toast('プロフィールを保存しました'); render();
  };
  $('importPaste').onclick = function () {
    const t = $('pasteArea').value;
    if (!t.trim()) { toast('貼り付けた内容がありません'); return; }
    if (importText(t) >= 0) $('pasteArea').value = '';
  };
  $('exportBackup').onclick = function () {
    const blob = new Blob([JSON.stringify({ app: 'MY HEALTH AI', version: 1, exportedAt: new Date().toISOString(), profile: profile, samples: samples })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'my-health-ai-backup-' + M.dateKey(Date.now()) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  };
  $('importBackupBtn').onclick = function () { $('importBackup').click(); };
  $('importBackup').onchange = function (e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = function () {
      try {
        const data = JSON.parse(r.result);
        if (data.app !== 'MY HEALTH AI' || !Array.isArray(data.samples)) throw new Error('format');
        samples = M.mergeSamples(samples, data.samples);
        if (data.profile) profile = Object.assign({}, data.profile, profile.birthYear ? profile : {});
        save(KEY_SAMPLES, samples); save(KEY_PROFILE, profile);
        toast('バックアップから戻しました'); render();
      } catch (err) { toast('このファイルは読み込めませんでした'); }
    };
    r.readAsText(f);
    e.target.value = '';
  };
  $('deleteAll').onclick = function () {
    if (!confirm('この端末に保存した健康データとプロフィールをすべて削除します。元に戻せません。よろしいですか？')) return;
    try { localStorage.removeItem(KEY_SAMPLES); localStorage.removeItem(KEY_PROFILE); } catch (e) { /* ignore */ }
    samples = []; profile = {}; render(); toast('すべて削除しました');
  };

  window.addEventListener('hashchange', checkHashImport);
  render();
  checkHashImport();
})();
