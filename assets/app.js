(() => {
  "use strict";

  // 公式の出題順（第1問〈共通問題〉→ 第34問〜第42問）に対応した分野
  const CATS = [
    { id: "ip", no: "共通", name: "知的財産権", sub: "著作権・産業財産権" },
    { id: "image", no: "34", name: "画像や色", sub: "画素・色の表現・知覚" },
    { id: "feature", no: "35", name: "マルチメディアの特徴", sub: "ディジタル化・音・情報表現" },
    { id: "content", no: "36", name: "コンテンツの処理と制作", sub: "圧縮・ファイル形式・動画・3DCG" },
    { id: "device", no: "37", name: "マルチメディア端末", sub: "ハードウェア・OS・記憶装置" },
    { id: "net", no: "38", name: "インターネットと通信", sub: "LAN・IPアドレス・DNS" },
    { id: "service", no: "39", name: "インターネットのサービス", sub: "Web・メール・クラウド" },
    { id: "business", no: "40", name: "インターネットビジネス", sub: "eコマース・広告・配信" },
    { id: "security", no: "41", name: "セキュリティと情報リテラシ", sub: "暗号化・マルウェア・対策" },
    { id: "society", no: "42", name: "社会に広がるマルチメディア", sub: "GPS・映像・行政・教育" }
  ];
  const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));
  const KEYS = ["ア", "イ", "ウ", "エ", "オ", "カ", "キ"];
  const CIRCLED = ["①", "②", "③", "④", "⑤"];
  const MULTI_SETS = [[0], [1], [2], [0, 1], [0, 2], [1, 2], [0, 1, 2]];
  const EXAM = { perCat: 4, minutes: 60, pass: 70 };
  const STORE_KEY = "mmb-drill-v1";

  const OFFICIAL = [
    { label: "2026年 前期", q: "https://www.cgarts.or.jp/static/past_download/past_download_files/pdf/2026/a/bas_mm_26a.pdf", a: "https://www.cgarts.or.jp/static/past_download/past_download_files/pdf/2026/a/an05-bas_mm_26a.pdf" },
    { label: "2025年 後期", q: "https://www.cgarts.or.jp/static/past_download/past_download_files/pdf/2025/b/bas_mm_25b.pdf", a: "https://www.cgarts.or.jp/static/past_download/past_download_files/pdf/2025/b/an05-bas_mm_25b2.pdf" }
  ];

  // ---------- question bank ----------
  const BANK = (window.QB || []).filter(q => CAT[q.cat]).map(normalize).filter(Boolean);
  const BY_ID = Object.fromEntries(BANK.map(q => [q.id, q]));

  function normalize(q) {
    if (q.type === "multi") {
      if (!Array.isArray(q.statements) || !Array.isArray(q.answer)) return null;
      const key = [...q.answer].sort().join(",");
      const correct = MULTI_SETS.findIndex(s => s.join(",") === key);
      if (correct < 0) return null;
      return { ...q, opts: MULTI_SETS.map(s => s.map(i => CIRCLED[i]).join("，")), correct };
    }
    if (!Array.isArray(q.choices) || typeof q.answer !== "number") return null;
    return { ...q, opts: q.choices, correct: q.answer };
  }

  // ---------- storage ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        return { q: d.q || {}, runs: d.runs || [], theme: d.theme || null };
      }
    } catch (e) { /* storage unavailable */ }
    return { q: {}, runs: [], theme: null };
  }
  let store = load();
  let storageOk = true;
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); storageOk = true; } catch (e) { storageOk = false; }
  }
  function record(id, ok) {
    const s = store.q[id] || { c: 0, w: 0 };
    ok ? s.c++ : s.w++;
    s.last = ok ? 1 : 0;
    s.t = Date.now();
    store.q[id] = s;
  }

  // ---------- helpers ----------
  const $app = document.getElementById("app");
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtQ = s => esc(s).replace(/【([①-⑤A-Za-zａ-ｚ]+)】/g, '<span class="blank">$1</span>');
  const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const fmtTime = sec => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  const fmtDate = t => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

  function catStats(catId) {
    const qs = BANK.filter(q => q.cat === catId);
    let tried = 0, ok = 0;
    qs.forEach(q => { const s = store.q[q.id]; if (s) { tried++; if (s.last) ok++; } });
    return { total: qs.length, tried, ok };
  }
  function overall() {
    let tried = 0, ok = 0, weak = 0;
    BANK.forEach(q => { const s = store.q[q.id]; if (s) { tried++; if (s.last) ok++; else weak++; } });
    return { total: BANK.length, tried, ok, weak };
  }

  // ---------- session ----------
  let session = null;
  let timerId = null;

  function start(mode, ids, title) {
    if (!ids.length) return;
    session = {
      mode, title, ids,
      // 選択肢の表示順（元のインデックスの並び）。順序に意味がある問題と multi は固定
      orders: ids.map(id => {
        const q = BY_ID[id];
        const base = q.opts.map((_, i) => i);
        return q.type === "multi" || q.fixed ? base : shuffle(base);
      }),
      answers: Array(ids.length).fill(null),
      flags: Array(ids.length).fill(false),
      idx: 0,
      startedAt: Date.now(),
      deadline: mode === "exam" ? Date.now() + EXAM.minutes * 60 * 1000 : null
    };
    location.hash = "#/quiz";
    render();
  }

  function startExam() {
    const ids = [];
    CATS.forEach(c => {
      ids.push(...shuffle(BANK.filter(q => q.cat === c.id)).slice(0, EXAM.perCat).map(q => q.id));
    });
    start("exam", ids, "模擬試験");
  }
  function startCat(catId) {
    start("practice", shuffle(BANK.filter(q => q.cat === catId)).map(q => q.id), `第${CAT[catId].no === "共通" ? "1問〈共通〉" : CAT[catId].no + "問"} ${CAT[catId].name}`);
  }
  function startRandom(n) { start("practice", shuffle(BANK).slice(0, n).map(q => q.id), `ランダム${n}問`); }
  function startWeak() {
    const ids = BANK.filter(q => store.q[q.id] && !store.q[q.id].last).map(q => q.id);
    start("practice", shuffle(ids), "苦手克服");
  }
  function startUntried(n) {
    const ids = BANK.filter(q => !store.q[q.id]).map(q => q.id);
    start("practice", shuffle(ids).slice(0, n), `未回答から${n}問`);
  }

  function finish() {
    if (!session) return;
    clearInterval(timerId);
    const s = session;
    let correct = 0, answered = 0;
    s.ids.forEach((id, i) => {
      const a = s.answers[i];
      if (a === null) return;
      answered++;
      if (a === BY_ID[id].correct) correct++;
      if (s.mode === "exam") record(id, a === BY_ID[id].correct);
    });
    if (s.mode === "exam") {
      store.runs.unshift({ at: Date.now(), mode: s.mode, title: s.title, correct, total: s.ids.length, sec: Math.round((Date.now() - s.startedAt) / 1000) });
      store.runs = store.runs.slice(0, 50);
    } else if (answered) {
      store.runs.unshift({ at: Date.now(), mode: s.mode, title: s.title, correct, total: answered });
      store.runs = store.runs.slice(0, 50);
    }
    save();
    s.done = true;
    s.correctCount = correct;
    s.answeredCount = answered;
    location.hash = "#/result";
    render();
  }

  // ---------- views ----------
  function viewHome() {
    const o = overall();
    const examReady = CATS.every(c => BANK.some(q => q.cat === c.id));
    const examTotal = CATS.reduce((n, c) => n + Math.min(EXAM.perCat, BANK.filter(q => q.cat === c.id).length), 0);
    const untried = o.total - o.tried;
    return `
      <section class="hero">
        <div>
          <div class="eyebrow">CG-ARTS Multimedia Basic</div>
          <h1>マルチメディア検定<br><em>ベーシック</em>対策ドリル</h1>
          <p>出題範囲（共通問題＋第34〜42問の9分野）に沿ったオリジナル問題 ${o.total} 問。分野別演習と本番形式の模擬試験で、合格ラインを目指します。</p>
        </div>
        <div class="hero-stats">
          <div class="card stat"><b>${o.tried}<small class="muted" style="font-size:13px">/${o.total}</small></b><span>解いた問題</span></div>
          <div class="card stat"><b>${o.tried ? pct(o.ok, o.tried) : "–"}<small style="font-size:13px">${o.tried ? "%" : ""}</small></b><span>直近の正答率</span></div>
          <div class="card stat"><b>${o.weak}</b><span>要復習</span></div>
        </div>
      </section>

      <section class="modes">
        <div class="card mode mode-exam">
          <div class="eyebrow">本番形式</div>
          <h2>模擬試験</h2>
          <p>全分野から本番と同じ構成（共通問題4問＋9分野×4問）で出題。解答は最後にまとめて採点します。</p>
          <div class="exam-spec">
            <div><b>${examTotal}</b>問</div>
            <div><b>${EXAM.minutes}</b>分</div>
            <div><b>${EXAM.pass}%</b>合格目安</div>
          </div>
          <button class="btn primary" data-act="exam" ${examReady ? "" : "disabled"}>模擬試験をはじめる</button>
        </div>
        <div class="mode-stack">
          <div class="card mode">
            <h2>クイック演習</h2>
            <p>1問ずつ解答と解説を確認しながら進めます。</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:auto">
              <button class="btn primary" data-act="random">ランダム10問</button>
              <button class="btn" data-act="untried" ${untried ? "" : "disabled"}>未回答から10問</button>
            </div>
          </div>
          <div class="card mode">
            <h2>苦手克服</h2>
            <p>直近で間違えた問題だけを出題します。正解すると一覧から外れます。</p>
            <button class="btn" data-act="weak" ${o.weak ? "" : "disabled"}>${o.weak ? `${o.weak}問を復習する` : "まだありません"}</button>
          </div>
        </div>
      </section>

      <div class="section-head"><h2>分野別演習</h2><span class="small muted">バーは正答率（直近の解答）</span></div>
      <section class="cats">
        ${CATS.map(c => {
          const st = catStats(c.id);
          const p = st.tried ? pct(st.ok, st.tried) : null;
          return `<button class="cat-row" data-cat="${c.id}" ${st.total ? "" : "disabled"}>
            <span class="cat-no">${c.no}</span>
            <span>
              <span class="cat-name">${esc(c.name)}</span>
              <span class="cat-sub">${esc(c.sub)} ・ ${st.tried}/${st.total}問</span>
              <span class="bar"><i style="width:${p ?? 0}%"></i></span>
            </span>
            <span class="cat-pct">${p === null ? "–" : p + "%"}</span>
          </button>`;
        }).join("")}
      </section>

      <section class="card links">
        <h2 style="font-size:17px">公式の過去問題で仕上げる</h2>
        <p class="small muted" style="margin:4px 0 0">本番の図版つき問題はCG-ARTS公式サイトで公開されています（PDF）。仕上げに時間を計って解いてみましょう。</p>
        <ul>
          ${OFFICIAL.map(o => `<li><span>${o.label} ベーシック マルチメディア検定</span><span><a href="${o.q}" target="_blank" rel="noopener">問題</a><a href="${o.a}" target="_blank" rel="noopener">解答</a></span></li>`).join("")}
          <li><span>その他の年度・検定</span><span><a href="https://www.cgarts.or.jp/kentei/past_download/" target="_blank" rel="noopener">過去問題ダウンロード</a></span></li>
        </ul>
      </section>`;
  }

  function viewQuiz() {
    const s = session;
    const q = BY_ID[s.ids[s.idx]];
    const order = s.orders[s.idx];
    const a = s.answers[s.idx];
    const isExam = s.mode === "exam";
    const revealed = !isExam && a !== null;
    const answeredCount = s.answers.filter(x => x !== null).length;
    const last = s.idx === s.ids.length - 1;
    const compact = q.type === "multi";

    const choices = order.map((i, d) => {
      let cls = "choice";
      if (revealed) {
        if (i === q.correct) cls += " correct";
        else if (i === a) cls += " wrong";
      } else if (i === a) cls += " selected";
      return `<button class="${cls}" data-choice="${d}" ${revealed ? "disabled" : ""}><span class="key">${KEYS[d]}</span><span>${esc(q.opts[i])}</span></button>`;
    }).join("");

    const feedback = revealed ? `
      <div class="feedback ${a === q.correct ? "ok" : "ng"}" role="status">
        <h3>${a === q.correct ? "正解" : `不正解 — 正解は「${KEYS[order.indexOf(q.correct)]}」`}</h3>
        <p>${esc(q.exp || "")}</p>
      </div>` : "";

    const grid = isExam ? `<div class="qgrid" aria-label="問題一覧">${s.ids.map((_, i) =>
      `<button class="grid-cell ${s.answers[i] !== null ? "answered" : ""} ${i === s.idx ? "current" : ""} ${s.flags[i] ? "flagged" : ""}" data-jump="${i}" aria-label="問${i + 1}">${i + 1}</button>`).join("")}</div>` : "";

    let nextBtn;
    if (isExam) {
      nextBtn = last
        ? `<button class="btn primary" data-act="submit">採点する</button>`
        : `<button class="btn primary" data-act="next">次へ →</button>`;
    } else {
      nextBtn = last
        ? `<button class="btn primary" data-act="submit" ${revealed ? "" : "disabled"}>結果を見る</button>`
        : `<button class="btn primary" data-act="next" ${revealed ? "" : "disabled"}>次へ →</button>`;
    }

    return `
      <div class="quiz-head">
        <span class="quiz-title">${esc(s.title)}</span>
        <div class="quiz-meta">
          ${isExam ? `<span class="timer num" id="timer">${fmtTime(Math.max(0, Math.round((s.deadline - Date.now()) / 1000)))}</span>` : ""}
          <button class="btn ghost small" data-act="quit" style="padding:6px 14px">${isExam ? "中断" : "終了"}</button>
        </div>
      </div>
      <div class="progress"><i style="width:${pct(isExam ? answeredCount : s.idx + (revealed ? 1 : 0), s.ids.length)}%"></i></div>
      <article class="card qcard">
        <div class="q-top">
          <span class="q-tag">${CAT[q.cat].no === "共通" ? "共通" : "第" + CAT[q.cat].no + "問"}・${esc(CAT[q.cat].name)}</span>
          <span style="display:flex;gap:8px;align-items:center">
            ${isExam ? `<button class="flag-btn" data-act="flag" aria-pressed="${s.flags[s.idx]}">見直し</button>` : ""}
            <span class="q-no">${s.idx + 1} / ${s.ids.length}</span>
          </span>
        </div>
        <p class="q-text">${fmtQ(q.q)}</p>
        ${q.type === "multi" ? `<ol class="statements">${q.statements.map((t, i) => `<li><span>${CIRCLED[i]}</span><span>${esc(t)}</span></li>`).join("")}</ol>` : ""}
        <div class="choices ${compact ? "compact" : ""}">${choices}</div>
        ${feedback}
        <div class="quiz-actions">
          <button class="btn ghost" data-act="prev" ${s.idx === 0 ? "disabled" : ""}>← 前へ</button>
          <div class="right">
            ${isExam && !last ? `<button class="btn" data-act="submit">採点する</button>` : ""}
            ${nextBtn}
          </div>
        </div>
        <div class="kbd-hint"><kbd>1</kbd>〜<kbd>${q.opts.length}</kbd> で選択 ・ <kbd>Enter</kbd> で次へ ・ <kbd>←</kbd><kbd>→</kbd> で移動</div>
      </article>
      ${grid}`;
  }

  function viewResult() {
    const s = session;
    const isExam = s.mode === "exam";
    const denom = isExam ? s.ids.length : s.answeredCount;
    const p = pct(s.correctCount, denom);
    const pass = isExam && s.correctCount * 2.5 >= EXAM.pass;
    const rows = CATS.map(c => {
      const idx = s.ids.map((id, i) => i).filter(i => BY_ID[s.ids[i]].cat === c.id && (isExam || s.answers[i] !== null));
      if (!idx.length) return "";
      const ok = idx.filter(i => s.answers[i] === BY_ID[s.ids[i]].correct).length;
      return `<div class="bd-row"><span>${c.no === "共通" ? "共通" : "第" + c.no + "問"} ${esc(c.name)}</span><span class="bar"><i style="width:${pct(ok, idx.length)}%"></i></span><span class="num">${ok}/${idx.length}</span></div>`;
    }).join("");

    const items = s.ids.map((id, i) => {
      const q = BY_ID[id];
      const a = s.answers[i];
      const order = s.orders[i];
      if (!isExam && a === null) return "";
      const ok = a === q.correct;
      return `<details class="card" data-ok="${ok ? 1 : 0}">
        <summary><span class="mark ${ok ? "ok" : "ng"}">${ok ? "○" : "×"}</span><span><span class="small muted">問${i + 1}・${esc(CAT[q.cat].name)}</span><span class="q-sum">${esc(q.q.replace(/【|】/g, ""))}</span></span></summary>
        <div class="rv-body">
          ${q.type === "multi" ? `<p>${q.statements.map((t, k) => `${CIRCLED[k]} ${esc(t)}`).join("<br>")}</p>` : ""}
          <p>あなたの解答：<b>${a === null ? "未解答" : `${KEYS[order.indexOf(a)]}．${esc(q.opts[a])}`}</b></p>
          <p>正解：<b>${KEYS[order.indexOf(q.correct)]}．${esc(q.opts[q.correct])}</b></p>
          <p class="muted">${esc(q.exp || "")}</p>
        </div>
      </details>`;
    }).join("");

    const wrongIds = s.ids.filter((id, i) => s.answers[i] !== null && s.answers[i] !== BY_ID[id].correct || (isExam && s.answers[i] === null));

    return `
      <section class="card result-hero">
        <div class="ring" style="--p:${p}"><div><div><b>${isExam ? s.correctCount * 2.5 : s.correctCount}</b><br><span>${isExam ? "点 / 100" : `問正解 / ${denom}`}</span></div></div></div>
        <div>
          <div class="eyebrow">${esc(s.title)} の結果</div>
          ${isExam ? `<div class="verdict ${pass ? "pass" : "fail"}">${pass ? "合格ライン到達" : "合格ラインまであと少し"}</div>` : `<div class="verdict">正答率 ${p}%</div>`}
          <p class="muted" style="margin:0 0 14px">${s.correctCount} / ${denom} 問正解${isExam ? `（1問2.5点換算・合格目安${EXAM.pass}点）` : ""}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${wrongIds.length ? `<button class="btn primary" data-act="retry-wrong">間違えた${wrongIds.length}問を解き直す</button>` : ""}
            ${isExam ? `<button class="btn" data-act="exam">もう一度受ける</button>` : ""}
            <a class="btn ghost" href="#/">ホームへ</a>
          </div>
        </div>
      </section>
      <section class="card breakdown"><h2 style="font-size:17px;margin-bottom:8px">分野別の正答</h2>${rows}</section>
      <div class="section-head"><h2>解答と解説</h2>
        <div class="filter-bar"><button class="chip" data-filter="all" aria-pressed="true">すべて</button><button class="chip" data-filter="ng" aria-pressed="false">不正解のみ</button></div>
      </div>
      <section class="review">${items}</section>`;
  }

  function viewStats() {
    const o = overall();
    const rows = CATS.map(c => {
      const st = catStats(c.id);
      return `<div class="bd-row"><span>${c.no === "共通" ? "共通" : "第" + c.no + "問"} ${esc(c.name)} <span class="small muted">${st.tried}/${st.total}</span></span><span class="bar"><i style="width:${st.tried ? pct(st.ok, st.tried) : 0}%"></i></span><span class="num">${st.tried ? pct(st.ok, st.tried) + "%" : "–"}</span></div>`;
    }).join("");
    const runs = store.runs;
    return `
      <div class="section-head" style="margin-top:8px"><h2 style="font-size:24px">学習記録</h2><span class="small muted">${storageOk ? "記録はこのブラウザにのみ保存されます" : "この環境では保存できないため、記録はページを閉じると消えます"}</span></div>
      <section class="card breakdown">
        <h2 style="font-size:17px;margin-bottom:8px">分野別の正答率 <span class="small muted">（全体 ${o.tried ? pct(o.ok, o.tried) + "%" : "–"}・${o.tried}/${o.total}問）</span></h2>
        ${rows}
      </section>
      <section class="card history">
        <h2 style="font-size:17px;margin-bottom:8px">履歴</h2>
        ${runs.length ? `<table><thead><tr><th>日時</th><th>内容</th><th style="text-align:right">正解</th><th style="text-align:right">正答率</th></tr></thead><tbody>
          ${runs.map(r => `<tr><td class="num">${fmtDate(r.at)}</td><td>${esc(r.title)}${r.sec ? ` <span class="small muted">${fmtTime(r.sec)}</span>` : ""}</td><td class="num">${r.correct}/${r.total}</td><td class="num">${pct(r.correct, r.total)}%</td></tr>`).join("")}
        </tbody></table>` : `<div class="empty">まだ記録がありません。</div>`}
      </section>
      <button class="btn ghost" data-act="reset">学習記録をリセット</button>`;
  }

  // ---------- render / routing ----------
  function render() {
    clearInterval(timerId);
    const route = location.hash.replace(/^#/, "") || "/";
    let html;
    if (route === "/quiz" && session && !session.done) html = viewQuiz();
    else if (route === "/result" && session && session.done) html = viewResult();
    else if (route === "/stats") html = viewStats();
    else html = viewHome();
    $app.innerHTML = html;
    if (route === "/quiz" && session && session.mode === "exam" && !session.done) tick();
  }

  function tick() {
    const el = document.getElementById("timer");
    const update = () => {
      const left = Math.round((session.deadline - Date.now()) / 1000);
      if (left <= 0) { clearInterval(timerId); alert("試験時間が終了しました。採点します。"); finish(); return; }
      if (el) { el.textContent = fmtTime(left); el.classList.toggle("low", left <= 300); }
    };
    update();
    timerId = setInterval(update, 1000);
  }

  function choose(d) {
    const s = session;
    if (!s || s.done) return;
    const q = BY_ID[s.ids[s.idx]];
    if (d < 0 || d >= q.opts.length) return;
    const i = s.orders[s.idx][d];
    if (s.mode === "exam" && Date.now() >= s.deadline) { finish(); return; }
    if (s.mode === "practice") {
      if (s.answers[s.idx] !== null) return;
      s.answers[s.idx] = i;
      record(q.id, i === q.correct);
      save();
    } else {
      s.answers[s.idx] = i;
    }
    render();
  }

  function go(delta) {
    const s = session;
    const n = s.idx + delta;
    if (n < 0 || n >= s.ids.length) return;
    if (s.mode === "practice" && delta > 0 && s.answers[s.idx] === null) return;
    s.idx = n;
    render();
    $app.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }

  function confirmSubmit() {
    const s = session;
    if (s.mode === "exam") {
      const left = s.answers.filter(a => a === null).length;
      if (left && !confirm(`未解答が${left}問あります。採点しますか？`)) return;
    }
    finish();
  }

  $app.addEventListener("click", e => {
    const t = e.target.closest("button, [data-act]");
    if (!t) return;
    const act = t.dataset.act;
    if (t.dataset.choice !== undefined) return choose(Number(t.dataset.choice));
    if (t.dataset.cat) return startCat(t.dataset.cat);
    if (t.dataset.jump !== undefined) { session.idx = Number(t.dataset.jump); return render(); }
    if (t.dataset.filter) {
      const ng = t.dataset.filter === "ng";
      $app.querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", String(c === t)));
      $app.querySelectorAll(".review details").forEach(d => { d.hidden = ng && d.dataset.ok === "1"; });
      return;
    }
    switch (act) {
      case "exam": return startExam();
      case "random": return startRandom(10);
      case "untried": return startUntried(10);
      case "weak": return startWeak();
      case "next": return go(1);
      case "prev": return go(-1);
      case "flag": session.flags[session.idx] = !session.flags[session.idx]; return render();
      case "submit": return confirmSubmit();
      case "quit":
        if (session.mode === "exam" && !confirm("模擬試験を中断しますか？（記録されません）")) return;
        if (session.mode === "practice" && session.answers.some(a => a !== null)) return finish();
        session = null; location.hash = "#/"; return render();
      case "retry-wrong": {
        const s = session;
        const ids = s.ids.filter((id, i) => s.answers[i] !== BY_ID[id].correct && (s.mode === "exam" || s.answers[i] !== null));
        return start("practice", ids, "解き直し");
      }
      case "reset":
        if (confirm("すべての学習記録を削除しますか？")) { store = { q: {}, runs: [], theme: store.theme }; save(); render(); }
        return;
    }
  });

  document.addEventListener("keydown", e => {
    if (!session || session.done || location.hash !== "#/quiz") return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target instanceof Element && e.target.closest("a, input, textarea, select, summary")) return;
    const k = e.key;
    if (/^[1-7]$/.test(k)) { e.preventDefault(); return choose(Number(k) - 1); }
    if (k === "ArrowRight") return go(1);
    if (k === "ArrowLeft") return go(-1);
    if (k === "Enter" && !(e.target instanceof HTMLButtonElement)) {
      const btn = $app.querySelector('[data-act="next"]:not(:disabled), .quiz-actions [data-act="submit"]:not(:disabled):last-child');
      if (btn) { e.preventDefault(); btn.click(); }
    }
  });

  // ---------- theme ----------
  const themeBtn = document.getElementById("themeBtn");
  function applyTheme() {
    if (store.theme) document.documentElement.dataset.theme = store.theme;
    else delete document.documentElement.dataset.theme;
  }
  themeBtn.addEventListener("click", () => {
    const dark = store.theme ? store.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    store.theme = dark ? "light" : "dark";
    save();
    applyTheme();
  });
  applyTheme();

  window.addEventListener("hashchange", () => {
    if (session && !session.done && session.mode === "exam" && location.hash !== "#/quiz") {
      if (!confirm("模擬試験を中断しますか？（記録されません）")) { location.hash = "#/quiz"; return; }
      session = null;
    }
    render();
  });
  window.addEventListener("beforeunload", e => {
    if (session && !session.done && session.mode === "exam") { e.preventDefault(); e.returnValue = ""; }
  });

  render();
})();
