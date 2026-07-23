/* ============================================================
 *  みんなで WA 検定 — 画面ロジック
 *  トップ(3難易度) → 全5問 → 結果(円グラフ) / 作問アコーディオン
 * ============================================================ */
const CONFIG = window.QUIZ_CONFIG;

/* ---------- ヘルパー ---------- */
const $ = sel => document.querySelector(sel);
const h = (tag, attrs = {}, children = []) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style') e.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) e.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null) return;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return e;
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rankOf = key => CONFIG.ranks.find(r => r.key === key) || CONFIG.ranks[0];
const rankLabel = key => rankOf(key).label;
const COLOR = { yellow: '#f2c94e', red: '#d8261c', blue: '#1f4cd6', ink: '#1c1c1a' };
const rankColor = key => COLOR[rankOf(key).color] || COLOR.ink;
const LETTERS = '1234';
const fmtDate = iso => {
  if (!iso) return '';
  const d = new Date(iso), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fmtDay = iso => {
  if (!iso) return '';
  const d = new Date(iso), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
};
const toast = (msg, kind = 'info') => {
  const t = h('div', { class: `toast toast-${kind}` }, msg);
  $('#toasts').appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
};

/* ---------- 状態 ---------- */
let user = null;
let currentView = 'home';
let quiz = null;           // { rank, list:[], i, correct, answered }
let manageFilter = '';     // 作問一覧の絞り込み

/* ---------- 起動 ---------- */
async function boot() {
  Store.init();
  try {
    const u = await Misskey.handleCallback();
    if (u) toast(`ようこそ ${u.name} さん`, 'success');
  } catch (e) { toast(e.message || 'ログインに失敗しました', 'error'); }

  user = Misskey.getUser();
  if (!Store.isConfigured()) renderSetupNotice();
  updateFooterPool();
  switchView('home');
}

/* ---------- フッターの出題プール表示 ---------- */
function updateFooterPool() {
  const el = $('#footer-pool');
  if (!el || !Store.isConfigured()) return;
  Store.countByRank().then(c => {
    const parts = CONFIG.ranks.map(r => `${r.label}：${c[r.key] || 0}問`).join(' / ');
    el.textContent = `出題プール：${c.total || 0}問（${parts}）`;
  }).catch(() => {});
}

/* ---------- ヘッダー（左：文脈タイトル / 右：アカウント） ---------- */
function renderHeader(ctx = {}) {
  const header = $('#header');
  header.innerHTML = '';
  header.style.borderBottomColor = ctx.color || COLOR.ink;

  const title = ctx.title
    ? h('button', { class: 'screen-title', style: ctx.color ? `color:${ctx.color}` : '', onclick: () => switchView('home') }, ctx.title)
    : h('button', { class: 'brand', onclick: () => switchView('home') }, [
        h('span', { class: 'brand-mark' }, '◯△□'),
        h('span', { class: 'brand-name' }, CONFIG.appName),
      ]);
  header.appendChild(title);

  // 右上：アカウントアイコン＋ハンバーガー
  const acct = h('div', { class: 'acct' });
  if (user) {
    acct.appendChild(user.avatarUrl
      ? h('img', { class: 'acct-icon', src: user.avatarUrl, alt: user.name, title: user.name })
      : h('span', { class: 'acct-icon acct-blank', title: user.name }));
  }
  acct.appendChild(h('button', { class: 'burger', title: 'メニュー', onclick: openMenu }, '☰'));
  header.appendChild(acct);
}

/* ---------- ハンバーガーメニュー ---------- */
function openMenu() {
  const m = $('#menu');
  m.innerHTML = '';
  m.classList.add('open');

  const items = [];
  // ログイン情報
  if (user) {
    items.push(h('div', { class: 'menu-user' }, [
      user.avatarUrl ? h('img', { class: 'menu-avatar', src: user.avatarUrl, alt: '' }) : h('span', { class: 'menu-avatar acct-blank' }),
      h('div', { class: 'menu-user-txt' }, [
        h('div', { class: 'menu-user-name' }, user.name),
        h('div', { class: 'menu-user-handle' }, Misskey.handleOf(user)),
      ]),
    ]));
  } else {
    items.push(h('button', { class: 'btn btn-primary btn-block', onclick: () => { closeMenu(); switchView('login'); } }, 'ログイン'));
  }

  items.push(h('div', { class: 'menu-sep' }));
  items.push(menuItem('トップ', () => switchView('home')));
  items.push(menuItem('マイページ', () => (user ? switchView('mypage') : requireLogin('マイページはログインすると使えます'))));
  items.push(menuItem('作問する', () => (user ? switchView('manage') : requireLogin('作問はログインすると使えます'))));

  if (user) {
    items.push(h('div', { class: 'menu-sep' }));
    items.push(h('button', { class: 'link-btn menu-logout', onclick: () => { Misskey.logout(); location.reload(); } }, 'ログアウト'));
  }

  m.appendChild(h('div', { class: 'menu-panel' }, [
    h('button', { class: 'menu-close', onclick: closeMenu }, '×'),
    ...items,
  ]));
  m.onclick = e => { if (e.target === m) closeMenu(); };
}
function menuItem(label, fn) {
  return h('button', { class: 'menu-item', onclick: () => { closeMenu(); fn(); } }, label);
}
function closeMenu() {
  const m = $('#menu');
  m.classList.remove('open');
  m.innerHTML = '';
}

/* ---------- 画面切替 ---------- */
function switchView(view) {
  currentView = view;
  const app = $('#app');
  app.innerHTML = '';
  if (view === 'home') renderHome(app);
  else if (view === 'manage') renderManage(app);
  else if (view === 'create') renderCreate(app);
  else if (view === 'login') renderLogin(app);
  else if (view === 'mypage') renderMyPage(app);
}

function requireLogin(msg) {
  toast(msg || 'ログインすると使えます', 'info');
  switchView('login');
}

// その問題を作った本人か？
function isOwner(q) {
  return !!user && q.created_by === Misskey.handleOf(user);
}

// オーナーアカウント（全員の問題を閲覧できる）か？
function isOwnerAccount() {
  return !!user && (CONFIG.owners || []).includes(Misskey.handleOf(user));
}

/* ---------- Supabase 未設定の案内 ---------- */
function renderSetupNotice() {
  $('#notice').appendChild(h('div', { class: 'setup-notice' }, [
    h('strong', {}, '⚠ Supabase が未設定です。'),
    ' 問題の保存・共有には設定が必要です。',
    h('code', {}, 'js/config.js'), ' と ', h('code', {}, 'README.md'), ' を確認してください。',
  ]));
}


/* ---------- トップ（3難易度） ---------- */
function renderHome(app) {
  renderHeader({});
  app.appendChild(h('section', { class: 'home-hero' }, [
    h('h1', { class: 'home-title' }, CONFIG.appName),
    h('p', { class: 'home-tagline' }, CONFIG.tagline),
  ]));

  const blocks = h('div', { class: 'rank-blocks' });
  CONFIG.ranks.forEach(r => {
    const locked = !user && r.key !== 'beginner';
    const block = h('button', {
      class: `rank-block clr-${r.color}` + (locked ? ' locked' : ''),
      onclick: () => locked ? requireLogin('中級・上級はログインすると挑戦できます') : startQuiz(r.key),
    }, [
      h('span', { class: 'rank-block-label' }, [r.label, locked ? h('span', { class: 'lock' }, ' 🔒') : null]),
    ]);
    blocks.appendChild(h('div', { class: 'rank-block-wrap' }, [block, h('p', { class: 'rank-block-desc' }, r.desc)]));
  });
  app.appendChild(blocks);
}

/* ---------- クイズ開始（全5問） ---------- */
async function startQuiz(rankKey) {
  if (!user && rankKey !== 'beginner') return requireLogin('中級・上級はログインすると挑戦できます');
  if (!Store.isConfigured()) return toast('Supabase を設定すると挑戦できます', 'error');

  currentView = 'quiz';
  renderHeader({ title: rankLabel(rankKey), color: rankColor(rankKey) });
  const app = $('#app'); app.innerHTML = '';
  app.appendChild(h('p', { class: 'muted center' }, '問題を準備中…'));

  let list;
  try { list = await Store.sampleQuestions(rankKey, CONFIG.questionsPerQuiz); }
  catch (e) { app.innerHTML = ''; app.appendChild(errorBox(e)); return; }

  if (!list.length) {
    app.innerHTML = '';
    app.appendChild(h('div', { class: 'card center' }, [
      h('p', { class: 'muted' }, `${rankLabel(rankKey)}の問題はまだありません。`),
      user ? h('button', { class: 'btn btn-primary', onclick: () => switchView('manage') }, '問題をつくる')
           : h('button', { class: 'btn btn-primary', onclick: () => requireLogin() }, 'ログインして作問'),
      h('div', { style: 'margin-top:12px' }, h('button', { class: 'btn btn-ghost btn-sm', onclick: () => switchView('home') }, '← トップへ')),
    ]));
    return;
  }
  quiz = { rank: rankKey, list, i: 0, correct: 0, answered: false };
  renderQuiz();
}

function renderQuiz() {
  const app = $('#app'); app.innerHTML = '';
  const q = quiz.list[quiz.i];
  const total = quiz.list.length;

  app.appendChild(h('div', { class: 'quiz-progress' }, [
    h('span', {}, `${quiz.i + 1}問目 / 全${total}問`),
    h('div', { class: 'seg-bar' }, quiz.list.map((_, idx) =>
      h('span', { class: 'seg' + (idx < quiz.i ? ' done' : idx === quiz.i ? ' cur' : ''), style: idx <= quiz.i ? `background:${rankColor(quiz.rank)}` : '' }))),
  ]));

  const grid = h('div', { class: 'choice-grid' });
  q.choices.forEach((c, i) => {
    grid.appendChild(h('button', { class: 'gopt', onclick: () => answerQuiz(i, grid, q) },
      [h('span', { class: 'gopt-n' }, LETTERS[i] + '.'), h('span', { class: 'gopt-t' }, c)]));
  });

  quiz.answered = false;
  const card = h('section', { class: 'card quiz-card' }, [
    h('h2', { class: 'q-title' }, [h('span', { class: 'q-mark' }, 'Q.'), ' ', q.body]),
    grid,
    h('div', { id: 'reveal' }),
  ]);
  app.appendChild(card);
}

function answerQuiz(i, grid, q) {
  if (quiz.answered) return;
  quiz.answered = true;
  const correct = q.correct_index;
  if (i === correct) quiz.correct++;
  Store.recordAnswer(q.id, i === correct, user); // 成績記録（未ログイン時は何もしない）
  const accent = rankColor(quiz.rank);
  const onAccentText = rankOf(quiz.rank).color === 'yellow' ? '#1c1c1a' : '#f7f3e8';
  [...grid.children].forEach((btn, idx) => {
    btn.disabled = true;
    if (idx === correct) {
      btn.classList.add('is-correct');
      btn.style.background = accent; btn.style.borderColor = accent; btn.style.color = onAccentText;
      btn.querySelector('.gopt-n').style.color = onAccentText;
    } else if (idx === i) btn.classList.add('is-picked');
    else btn.classList.add('is-faded');
  });

  const isLast = quiz.i >= quiz.list.length - 1;
  const reveal = $('#reveal');
  reveal.appendChild(h('div', { class: 'explain' }, [
    h('div', { class: 'explain-head' }, i === correct ? '正解！' : '不正解'),
    h('p', {}, q.explanation ? q.explanation : '（解説はまだありません）'),
  ]));
  reveal.appendChild(h('div', { class: 'quiz-actions' }, [
    h('button', { class: 'btn btn-primary btn-block', onclick: () => nextQuiz() }, isLast ? '結果を見る →' : '次の問題へ →'),
  ]));
  // コメント：記入欄 → みんなのコメント（次へボタンの下）
  const cWrap = h('div', { class: 'quiz-comments' });
  reveal.appendChild(cWrap);
  Store.listComments(q.id).then(comments => {
    cWrap.appendChild(h('h3', { class: 'section-title' }, '// コメント'));
    cWrap.appendChild(commentsBlock(q.id, comments.slice().reverse(), true)); // 新しい順
  }).catch(() => {});

  reveal.appendChild(creditLine(q));
  reveal.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function nextQuiz() {
  if (quiz.i >= quiz.list.length - 1) return showResult();
  quiz.i++;
  renderQuiz();
}

/* ---------- 結果（アニメ円グラフ） ---------- */
function showResult() {
  const total = quiz.list.length;
  const pct = Math.round((quiz.correct / total) * 100);
  Store.recordResult(quiz.rank, quiz.correct, total, user); // 成績記録（未ログイン時は何もしない）
  const color = rankColor(quiz.rank);
  currentView = 'result';
  renderHeader({ title: rankLabel(quiz.rank), color });

  const app = $('#app'); app.innerHTML = '';
  const R = 54, C = 2 * Math.PI * R;
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  const svg = `
    <svg class="donut" viewBox="0 0 140 140">
      <circle cx="70" cy="70" r="${R}" fill="none" stroke="#e6e0d0" stroke-width="16"/>
      <circle id="ring" cx="70" cy="70" r="${R}" fill="none" stroke="${color}" stroke-width="16"
        stroke-linecap="butt" transform="rotate(-90 70 70)"
        stroke-dasharray="${C}" stroke-dashoffset="${C}" style="transition:stroke-dashoffset 1s ease"/>
    </svg>`;

  const donutWrap = h('div', { class: 'donut-wrap', html: svg });
  const pctNum = h('div', { class: 'donut-pct' }, '0%');
  const pctSub = h('div', { class: 'donut-sub' }, `${quiz.correct}問 / ${total}問中`);
  donutWrap.appendChild(h('div', { class: 'donut-center' }, [pctNum, pctSub]));

  app.appendChild(h('section', { class: 'result-wrap' }, [
    donutWrap,
    h('p', { class: 'result-line' }, oneLiner(pct)),
    h('div', { class: 'result-actions' }, [
      h('button', { class: `btn clr-${rankOf(quiz.rank).color} share-btn`, onclick: () => shareResult(pct) }, '⤴ シェア'),
      h('button', { class: 'btn', onclick: () => startQuiz(quiz.rank) }, '再挑戦する'),
    ]),
  ]));

  // アニメーション（円グラフ＋数字カウントアップ）
  requestAnimationFrame(() => {
    const r = $('#ring');
    if (r) r.setAttribute('stroke-dashoffset', String(C * (1 - pct / 100)));
    const start = performance.now(), dur = 1000;
    const step = now => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      pctNum.textContent = Math.round(pct * eased) + '%';
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function oneLiner(pct) {
  if (pct === 100) return 'パーフェクト！WA の主（ぬし）だ。';
  if (pct >= 80) return 'お見事！かなりの WA 通。';
  if (pct >= 60) return 'いい感じ！その調子。';
  if (pct >= 40) return 'あと一歩。復習でぐっと伸びる。';
  if (pct >= 20) return 'これからこれから。もう一回！';
  return '伸びしろしかない。再挑戦だ！';
}

function shareResult(pct) {
  const text =
    `「${CONFIG.appName}」${rankLabel(quiz.rank)}に挑戦！\n` +
    `全${quiz.list.length}問中 ${quiz.correct}問正解（${pct}%）\n` +
    `${oneLiner(pct)}\n` +
    (location.href.startsWith('http') ? `${location.origin + location.pathname}\n` : '') +
    `#${CONFIG.shareHashtag}`;
  Misskey.share(text);
}

/* ---------- クレジット（作成者：作成日（最終更新日）） ---------- */
function creditLine(q) {
  const updated = q.updated_at && fmtDay(q.updated_at) !== fmtDay(q.created_at)
    ? `（${fmtDay(q.updated_at)}更新）` : '';
  return h('div', { class: 'credit' }, [
    h('span', {}, `${esc(q.created_by_name || q.created_by || '不明')}：${fmtDay(q.created_at)}${updated}`),
  ]);
}

/* ---------- 作問一覧（アコーディオン） ---------- */
async function renderManage(app) {
  if (!user) return requireLogin();
  const ownerMode = isOwnerAccount();
  renderHeader({ title: '作問' });

  app.appendChild(h('button', { class: 'btn btn-ink btn-block newq-btn', onclick: () => switchView('create') }, '＋ 新規作成'));
  app.appendChild(h('p', { class: 'hint' },
    ownerMode ? '👑 オーナー表示：全員の問題が見えています。' : '自分が作った問題だけが表示されます。'));

  const chips = h('div', { class: 'rank-chips' },
    [manageChip('', 'すべて', 'ink')].concat(CONFIG.ranks.map(r => manageChip(r.key, r.label, r.color))));
  app.appendChild(chips);

  const slot = h('div', {}, h('p', { class: 'muted center' }, '読み込み中…'));
  app.appendChild(slot);

  if (!Store.isConfigured()) { slot.innerHTML = ''; slot.appendChild(h('p', { class: 'muted center' }, 'Supabase を設定すると一覧が表示されます。')); return; }
  let list;
  try {
    list = await Store.listQuestions(manageFilter || undefined);
    if (!ownerMode) list = list.filter(q => isOwner(q)); // 自分の問題のみ
  }
  catch (e) { slot.innerHTML = ''; slot.appendChild(errorBox(e)); return; }

  slot.innerHTML = '';
  if (!list.length) { slot.appendChild(h('p', { class: 'muted center' }, 'まだ問題がありません。「新規作成」から作れます。')); return; }
  const acc = h('div', { class: 'acc-list' });
  list.forEach(q => acc.appendChild(accRow(q)));
  slot.appendChild(acc);
}
function manageChip(key, label, color) {
  return h('button', {
    class: 'chip' + (manageFilter === key ? ' active' : ''),
    style: manageFilter === key ? `background:${COLOR[color] || COLOR.ink};border-color:${COLOR[color] || COLOR.ink};color:${color === 'yellow' ? '#1c1c1a' : '#f7f3e8'}` : '',
    onclick: () => { manageFilter = key; switchView('manage'); },
  }, label);
}

function accRow(q) {
  const body = h('div', { class: 'acc-body' });
  const row = h('div', { class: 'acc-item' }, [
    h('button', { class: 'acc-head', onclick: () => toggleAcc(row, body, q) }, [
      h('span', { class: 'acc-bar', style: `background:${rankColor(q.rank)}` }),
      h('span', { class: 'acc-tri' }, '▶'),
      h('span', { class: 'acc-q' }, `Q. ${q.body}`),
    ]),
    body,
  ]);
  return row;
}

async function toggleAcc(row, body, q) {
  const open = row.classList.toggle('open');
  if (!open) { body.innerHTML = ''; return; }
  body.innerHTML = '';
  body.appendChild(h('p', { class: 'muted center' }, '読み込み中…'));
  let full, comments, hist;
  try {
    [full, comments, hist] = await Promise.all([Store.getQuestion(q.id), Store.listComments(q.id), Store.listHistory(q.id)]);
  } catch (e) { body.innerHTML = ''; body.appendChild(errorBox(e)); return; }

  body.innerHTML = '';
  // 問題 + 選択肢
  body.appendChild(h('div', { class: 'choices static' }, full.choices.map((c, i) =>
    h('div', { class: 'choice static' + (i === full.correct_index ? ' correct' : '') },
      [h('span', { class: 'choice-index' }, LETTERS[i]), h('span', {}, c),
       i === full.correct_index ? h('span', { class: 'correct-tag' }, '正解') : null]))));
  // 解答解説
  body.appendChild(h('h3', { class: 'section-title' }, '// 解答解説'));
  body.appendChild(h('p', { class: 'explain-body' }, full.explanation || '（解説はまだありません）'));
  // 編集・削除（作った本人のみ）
  if (isOwner(full)) {
    const delBtn = h('button', { class: 'btn btn-danger btn-sm' }, '🗑 削除する');
    delBtn.addEventListener('click', async () => {
      if (!confirm('この問題を削除します。元に戻せません。よろしいですか？')) return;
      delBtn.disabled = true;
      try {
        await Store.deleteQuestion(full.id);
        toast('問題を削除しました', 'success');
        updateFooterPool();
        switchView('manage');
      } catch (e) { delBtn.disabled = false; toast(e.message || '削除に失敗しました', 'error'); }
    });
    body.appendChild(h('div', { class: 'detail-actions' }, [
      h('button', { class: 'btn btn-ink btn-sm', onclick: () => renderCreate($('#app'), full) }, '✎ 編集する'),
      delBtn,
    ]));
  } else {
    body.appendChild(h('p', { class: 'owner-note' }, `※ 編集・削除は作成者（${esc(full.created_by_name || full.created_by || '不明')}さん）のみ可能です`));
  }
  // コメント・補足
  body.appendChild(h('h3', { class: 'section-title' }, '// コメント・補足'));
  body.appendChild(commentsBlock(q.id, comments));
  // 編集履歴
  body.appendChild(h('h3', { class: 'section-title' }, '// 編集履歴'));
  body.appendChild(h('ul', { class: 'history' },
    (hist.length ? hist.map(x => h('li', {}, `${fmtDate(x.created_at)}　${x.action === 'create' ? '作成' : '修正'}：${esc(x.actor_name || x.actor)}`))
                 : [h('li', { class: 'muted' }, '履歴はまだありません')])));
  body.appendChild(creditLine(full));
}

/* ---------- コメント欄 ----------
 * formFirst: true なら「記入欄 → みんなのコメント一覧」の順で表示 */
function commentsBlock(qid, comments, formFirst = false) {
  const listEl = h('div', { class: 'comment-list' },
    comments.length ? comments.map(renderComment) : [h('p', { class: 'comment-empty muted' }, 'まだありません。')]);

  let form;
  if (user) {
    const input = h('textarea', { class: 'input', rows: '2', placeholder: 'コメントや補足を書く…' });
    const kindSel = h('select', { class: 'input input-inline' }, [
      h('option', { value: 'comment' }, 'コメント'), h('option', { value: 'supplement' }, '補足'),
    ]);
    const send = h('button', { class: 'btn btn-primary btn-sm' }, '送信');
    send.addEventListener('click', async () => {
      const b = input.value.trim(); if (!b) return;
      send.disabled = true;
      try {
        const c = await Store.addComment(qid, kindSel.value, b, user);
        input.value = ''; send.disabled = false;
        const empty = listEl.querySelector('.comment-empty');
        if (empty) empty.remove();
        // 新しいコメントは一覧の一番上に追加（新しい順で見えるように）
        formFirst ? listEl.prepend(renderComment(c)) : listEl.appendChild(renderComment(c));
      } catch (e) { send.disabled = false; toast(e.message || '送信に失敗', 'error'); }
    });
    form = h('div', { class: 'comment-form' }, [kindSel, input, send]);
  } else {
    form = h('p', { class: 'hint' }, '※ コメントはログインすると書けます。');
  }

  return formFirst
    ? h('div', {}, [form, h('p', { class: 'comment-list-label muted' }, 'みんなのコメント'), listEl])
    : h('div', {}, [listEl, form]);
}
function renderComment(c) {
  return h('div', { class: 'comment' }, [
    h('div', { class: 'comment-head' }, [
      h('span', { class: 'comment-kind kind-' + c.kind }, c.kind === 'supplement' ? '補足' : 'コメント'),
      h('span', { class: 'comment-author' }, esc(c.author_name || c.author)),
      h('span', { class: 'comment-date muted' }, fmtDate(c.created_at)),
    ]),
    h('p', { class: 'comment-body' }, c.body),
  ]);
}

/* ---------- 作問フォーム（解答解説つき） ---------- */
function renderCreate(app, editing = null) {
  if (!user) return requireLogin();
  if (editing && !isOwner(editing)) return toast('他の人が作った問題は編集できません', 'error');
  const isEdit = !!editing;
  currentView = 'create';
  renderHeader({ title: isEdit ? '編集' : '新規作成' });
  app = $('#app'); app.innerHTML = '';

  const rankSel = h('select', { class: 'input' },
    CONFIG.ranks.map(r => h('option', { value: r.key, selected: editing && editing.rank === r.key ? '' : null }, r.label)));
  const bodyIn = h('textarea', { class: 'input', rows: '3', placeholder: '問題文を入力…' }, editing ? editing.body : '');
  const choiceInputs = [];
  const choicesWrap = h('div', { class: 'create-choices' });
  for (let i = 0; i < 4; i++) {
    const radio = h('input', { type: 'radio', name: 'correct', value: String(i),
      ...(editing ? (editing.correct_index === i ? { checked: '' } : {}) : (i === 0 ? { checked: '' } : {})) });
    const inp = h('input', { class: 'input', type: 'text', placeholder: `選択肢 ${i + 1}`, value: editing ? (editing.choices[i] || '') : '' });
    choiceInputs.push({ radio, inp });
    choicesWrap.appendChild(h('div', { class: 'create-choice-row' }, [
      h('label', { class: 'radio-wrap', title: '正解にする' }, [radio, h('span', { class: 'radio-dot' })]), inp]));
  }
  const explainIn = h('textarea', { class: 'input', rows: '3', placeholder: '解答解説を入力（任意）…' }, editing ? (editing.explanation || '') : '');

  const submit = h('button', { class: 'btn btn-primary btn-block' }, isEdit ? '編集を保存' : '問題を登録');
  submit.addEventListener('click', async () => {
    const payload = {
      rank: rankSel.value, body: bodyIn.value.trim(),
      choices: choiceInputs.map(c => c.inp.value.trim()),
      correctIndex: choiceInputs.findIndex(c => c.radio.checked),
      explanation: explainIn.value.trim(),
    };
    if (!payload.body) return toast('問題文を入力してください', 'error');
    if (payload.choices.some(c => !c)) return toast('4つの選択肢をすべて入力してください', 'error');
    if (payload.correctIndex < 0) return toast('正解の選択肢を選んでください', 'error');
    submit.disabled = true;
    try {
      if (isEdit) {
        await Store.updateQuestion(editing.id, payload, user);
        toast('編集を保存しました', 'success');
        updateFooterPool();
        manageFilter = payload.rank;
        switchView('manage');
      } else {
        await Store.createQuestion(payload, user);
        toast('問題を登録しました！', 'success');
        updateFooterPool();
        manageFilter = payload.rank;
        renderCreateDone(payload);
      }
    } catch (e) { submit.disabled = false; toast(e.message || '保存に失敗しました', 'error'); }
  });

  app.appendChild(h('section', { class: 'card' }, [
    h('h1', {}, isEdit ? '問題を編集' : '問題をつくる'),
    h('p', { class: 'hint' }, '正解にする選択肢の左のマークを選んでください。'),
    h('label', { class: 'field-label' }, '難易度ランク'), rankSel,
    h('label', { class: 'field-label' }, '問題文'), bodyIn,
    h('label', { class: 'field-label' }, '選択肢（4つ・マークが正解）'), choicesWrap,
    h('label', { class: 'field-label' }, '解答解説'), explainIn,
    submit,
    h('button', { class: 'btn btn-ghost btn-block btn-sm', onclick: () => switchView('manage') }, '← 一覧へ戻る'),
  ]));
}

/* ---------- 作問完了（シェア） ---------- */
function renderCreateDone(payload) {
  const app = $('#app'); app.innerHTML = '';
  renderHeader({ title: '作問' });
  app.appendChild(h('section', { class: 'card center' }, [
    h('h1', {}, '登録しました！🎉'),
    h('p', { class: 'muted' }, `【${rankLabel(payload.rank)}】Q. ${payload.body}`),
    h('div', { class: 'result-actions', style: 'margin-top:18px' }, [
      h('button', { class: 'btn btn-primary', onclick: () => shareNewQuestion(payload) }, '⤴ 作問したことをシェア'),
      h('button', { class: 'btn', onclick: () => switchView('create') }, 'もう1問つくる'),
      h('button', { class: 'btn btn-ghost', onclick: () => switchView('manage') }, '一覧へ'),
    ]),
    h('p', { class: 'hint' }, '※ シェアには正解は含まれません。安心して投稿してください。'),
  ]));
}

function shareNewQuestion(p) {
  const text =
    `「${CONFIG.appName}」に新しい問題を作りました！【${rankLabel(p.rank)}】\n\n` +
    `Q. ${p.body}\n` +
    p.choices.map((c, i) => `${i + 1}. ${c}`).join('\n') + '\n\n' +
    `答えはこちらで挑戦してみて↓\n` +
    (location.href.startsWith('http') ? `${location.origin + location.pathname}\n` : '') +
    `#${CONFIG.shareHashtag}`;
  Misskey.share(text);
}

/* ---------- マイページ ---------- */
async function renderMyPage(app) {
  if (!user) return requireLogin('マイページはログインすると使えます');
  renderHeader({ title: 'マイページ' });

  app.appendChild(h('div', { class: 'menu-user mypage-user' }, [
    user.avatarUrl ? h('img', { class: 'menu-avatar', src: user.avatarUrl, alt: '' }) : h('span', { class: 'menu-avatar acct-blank' }),
    h('div', { class: 'menu-user-txt' }, [
      h('div', { class: 'menu-user-name' }, user.name + (isOwnerAccount() ? ' 👑' : '')),
      h('div', { class: 'menu-user-handle' }, Misskey.handleOf(user)),
    ]),
  ]));

  // 自分の問題へ
  app.appendChild(h('button', { class: 'btn btn-ink btn-block', onclick: () => switchView('manage') },
    isOwnerAccount() ? '問題の閲覧（全員分）' : '自分の問題を見る'));

  const slot = h('div', {}, h('p', { class: 'muted center', style: 'margin-top:16px' }, '読み込み中…'));
  app.appendChild(slot);

  if (!Store.isConfigured()) { slot.innerHTML = ''; return; }
  let results, recent, ranks;
  try {
    [results, recent, ranks] = await Promise.all([
      Store.listMyResults(user, 20), Store.listRecentAnswers(user, 10), Store.ranking(),
    ]);
  } catch (e) {
    slot.innerHTML = '';
    slot.appendChild(errorBox(e));
    slot.appendChild(h('p', { class: 'hint' }, '※ 成績の記録には Supabase 側の追加設定（migrate_add_results.sql）が必要です。'));
    return;
  }
  slot.innerHTML = '';

  // ---- 過去の成績 ----
  slot.appendChild(h('h3', { class: 'section-title' }, '// 過去の成績'));
  if (!results.length) slot.appendChild(h('p', { class: 'muted' }, 'まだ記録がありません。クイズに挑戦してみよう！'));
  else slot.appendChild(h('ul', { class: 'score-list' }, results.map(r => {
    const pct = r.total ? Math.round(r.correct / r.total * 100) : 0;
    return h('li', { class: 'score-row' }, [
      h('span', { class: 'score-rank', style: `background:${rankColor(r.rank)};color:${rankOf(r.rank).color === 'yellow' ? '#1c1c1a' : '#f7f3e8'}` }, rankLabel(r.rank)),
      h('span', { class: 'score-val' }, `${r.correct}/${r.total}問（${pct}%）`),
      h('span', { class: 'score-date muted' }, fmtDay(r.created_at)),
    ]);
  })));

  // ---- 正答数ランキング ----
  slot.appendChild(h('h3', { class: 'section-title' }, '// 正答数ランキング'));
  slot.appendChild(h('p', { class: 'hint', style: 'margin-bottom:8px' }, 'これまでの正解数の合計。たくさん解くほど上位に！'));
  if (!ranks.length) slot.appendChild(h('p', { class: 'muted' }, 'まだ誰も解いていません。'));
  else slot.appendChild(h('ol', { class: 'rank-list' }, ranks.slice(0, 20).map((r, i) => {
    const isMe = r.handle === Misskey.handleOf(user);
    return h('li', { class: 'rank-row' + (isMe ? ' me' : '') }, [
      h('span', { class: 'rank-pos' }, String(i + 1)),
      h('span', { class: 'rank-name' }, (r.name || r.handle) + (isMe ? '（あなた）' : '')),
      h('span', { class: 'rank-score' }, `${r.correct}問正解`),
    ]);
  })));

  // ---- 直近に解いた10問の振り返り ----
  slot.appendChild(h('h3', { class: 'section-title' }, '// 直近に解いた10問の振り返り'));
  if (!recent.length) slot.appendChild(h('p', { class: 'muted' }, 'まだ解答がありません。'));
  else slot.appendChild(h('div', { class: 'review-list' }, recent.map(a => {
    const q = a.questions;
    return h('div', { class: 'review-row' }, [
      h('span', { class: 'review-mark ' + (a.is_correct ? 'ok' : 'ng') }, a.is_correct ? '○' : '×'),
      h('div', { class: 'review-txt' }, [
        h('p', { class: 'review-q' }, q ? q.body : '（削除された問題）'),
        q ? h('p', { class: 'review-a muted' }, `正解：${q.choices[q.correct_index]}`) : null,
        h('p', { class: 'review-date muted' }, fmtDate(a.created_at)),
      ]),
    ]);
  })));
}

/* ---------- ログイン画面 ---------- */
function renderLogin(app) {
  app = $('#app'); app.innerHTML = '';
  renderHeader({});
  const host = Misskey.serverHost();
  if (CONFIG.lockMisskeyHost) {
    app.appendChild(h('section', { class: 'card login-card' }, [
      h('h1', {}, 'ようこそ'),
      h('p', { class: 'muted' }, 'みんなで四択クイズを作って、みんなで解こう。'),
      h('div', { class: 'server-tag' }, [
        h('span', { class: 'server-tag-label' }, 'コミュニティ'),
        h('span', { class: 'server-tag-host' }, host),
      ]),
      h('button', { class: 'btn btn-primary btn-block', onclick: () => Misskey.login() }, `${host} でログイン`),
      h('p', { class: 'hint' }, `※ ${host} のアカウントが必要です。ブラウザで既にログイン済みなら、開く画面で「許可」を押すだけです。`),
      h('button', { class: 'btn btn-ghost btn-block btn-sm', onclick: () => switchView('home') }, '← トップへ戻る'),
    ]));
    return;
  }
  const hostInput = h('input', { class: 'input', type: 'text', value: host, placeholder: 'misskey.io' });
  app.appendChild(h('section', { class: 'card login-card' }, [
    h('h1', {}, 'ようこそ'),
    h('label', { class: 'field-label' }, 'あなたの Misskey サーバー'), hostInput,
    h('button', { class: 'btn btn-primary btn-block', onclick: () => Misskey.login(hostInput.value) }, 'Misskey でログイン'),
  ]));
}

/* ---------- エラー ---------- */
function errorBox(e) {
  console.error(e);
  return h('div', { class: 'card error-box' }, [
    h('strong', {}, 'エラー：'), h('span', {}, e.message || String(e)),
    h('p', { class: 'hint' }, 'Supabase の設定（config.js）とテーブル作成（schema.sql）を確認してください。'),
  ]);
}

/* ---------- 実行 ---------- */
boot();
