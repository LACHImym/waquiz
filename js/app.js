/* ============================================================
 *  オンラインコミュニティは クイズ — 画面ロジック
 * ============================================================ */
const CONFIG = window.QUIZ_CONFIG;

/* ---------- 小さなヘルパー ---------- */
const $ = sel => document.querySelector(sel);
const h = (tag, attrs = {}, children = []) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
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
const rankLabel = key => (CONFIG.ranks.find(r => r.key === key) || {}).label || key;
const LETTERS = 'ABCDEFGH';
const fmtDate = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const toast = (msg, kind = 'info') => {
  const t = h('div', { class: `toast toast-${kind}` }, msg);
  $('#toasts').appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
};

/* ---------- 状態 ---------- */
let user = null;
let currentRankFilter = ''; // '' = すべて

/* ---------- 起動 ---------- */
async function boot() {
  Store.init();

  // Misskey コールバック処理
  try {
    const u = await Misskey.handleCallback();
    if (u) toast(`ようこそ ${u.name} さん`, 'success');
  } catch (e) {
    toast(e.message || 'ログインに失敗しました', 'error');
  }

  user = Misskey.getUser();
  renderHeader();

  if (!Store.isConfigured()) {
    renderSetupNotice();
  }

  if (!user) {
    renderLogin();
  } else {
    switchView('solve');
  }
}

/* ---------- ヘッダー ---------- */
function renderHeader() {
  const header = $('#header');
  header.innerHTML = '';
  header.appendChild(h('div', { class: 'brand' }, [
    h('span', { class: 'brand-mark' }, '◯△□'),
    h('span', { class: 'brand-name' }, CONFIG.appName),
  ]));

  if (user) {
    const nav = h('nav', { class: 'nav' }, [
      navBtn('solve', '挑戦'),
      navBtn('list', '問題一覧'),
      navBtn('my', '自分の問題'),
      navBtn('create', '作問'),
    ]);
    header.appendChild(nav);
    header.appendChild(h('div', { class: 'user-box' }, [
      user.avatarUrl ? h('img', { class: 'avatar', src: user.avatarUrl, alt: '' }) : null,
      h('span', { class: 'user-name' }, user.name),
      h('button', { class: 'link-btn', onclick: () => { Misskey.logout(); location.reload(); } }, 'ログアウト'),
    ]));
  }
}
function navBtn(view, label) {
  return h('button', {
    class: 'nav-btn' + (currentView === view ? ' active' : ''),
    onclick: () => switchView(view),
  }, label);
}

/* ---------- 画面切替 ---------- */
let currentView = 'solve';
function switchView(view) {
  currentView = view;
  renderHeader();
  const app = $('#app');
  app.innerHTML = '';
  if (view === 'solve') renderSolve(app);
  else if (view === 'create') renderCreate(app);
  else if (view === 'list') renderList(app);
  else if (view === 'my') renderMy(app);
}

/* ---------- Supabase 未設定の案内 ---------- */
function renderSetupNotice() {
  const bar = h('div', { class: 'setup-notice' }, [
    h('strong', {}, '⚠ Supabase が未設定です。'),
    ' 問題の保存・共有には設定が必要です。',
    h('code', {}, 'community-quiz/js/config.js'),
    ' と ',
    h('code', {}, 'README.md'),
    ' を確認してください（ログインとシェアは設定なしでも動きます）。',
  ]);
  $('#notice').appendChild(bar);
}

/* ---------- ログイン画面 ---------- */
function renderLogin() {
  const app = $('#app');
  app.innerHTML = '';
  const hostInput = h('input', {
    class: 'input', type: 'text', value: CONFIG.defaultMisskeyHost,
    placeholder: 'misskey.io',
  });
  app.appendChild(h('section', { class: 'card login-card' }, [
    h('h1', {}, 'ようこそ'),
    h('p', { class: 'muted' }, 'みんなで四択クイズを作って、みんなで解こう。まずは Misskey でログインしてください。'),
    h('label', { class: 'field-label' }, 'あなたの Misskey サーバー'),
    hostInput,
    h('button', {
      class: 'btn btn-primary btn-block',
      onclick: () => Misskey.login(hostInput.value),
    }, 'Misskey でログイン'),
    h('p', { class: 'hint' }, '※ サーバーの認可画面が開きます。「許可」すると戻ってきます。'),
  ]));
}

/* ---------- 挑戦（解く）画面 ---------- */
let solveState = null;
function renderSolve(app) {
  app.appendChild(h('div', { class: 'rank-chips' },
    [chip('', 'すべて')].concat(CONFIG.ranks.map(r => chip(r.key, r.label)))
  ));
  const slot = h('div', { id: 'solve-slot' });
  app.appendChild(slot);
  loadNextQuestion(slot);
}
function chip(key, label) {
  return h('button', {
    class: 'chip' + (currentRankFilter === key ? ' active' : ''),
    onclick: () => {
      currentRankFilter = key;
      switchView('solve');
    },
  }, label);
}

async function loadNextQuestion(slot) {
  slot.innerHTML = '';
  slot.appendChild(h('p', { class: 'muted center' }, '読み込み中…'));
  if (!Store.isConfigured()) {
    slot.innerHTML = '';
    slot.appendChild(h('p', { class: 'muted center' }, 'Supabase を設定すると問題が表示されます。'));
    return;
  }
  let q;
  try { q = await Store.randomQuestion(currentRankFilter || undefined); }
  catch (e) { slot.innerHTML = ''; slot.appendChild(errorBox(e)); return; }

  slot.innerHTML = '';
  if (!q) {
    slot.appendChild(h('div', { class: 'card center' }, [
      h('p', { class: 'muted' }, 'この難易度の問題はまだありません。'),
      h('button', { class: 'btn btn-primary', onclick: () => switchView('create') }, '最初の問題をつくる'),
    ]));
    return;
  }
  solveState = { q, answered: false };
  renderQuestionCard(slot, q);
}

function renderQuestionCard(slot, q) {
  slot.innerHTML = '';
  const choicesWrap = h('div', { class: 'choices' });
  q.choices.forEach((c, i) => {
    choicesWrap.appendChild(h('button', {
      class: 'choice',
      onclick: (ev) => onAnswer(ev, slot, q, i, choicesWrap),
    }, [h('span', { class: 'choice-index' }, LETTERS[i]), h('span', {}, c)]));
  });

  slot.appendChild(h('section', { class: 'card question-card' }, [
    h('div', { class: 'q-meta' }, [
      h('span', { class: `rank-badge rank-${q.rank}` }, rankLabel(q.rank)),
    ]),
    h('h2', { class: 'q-body' }, q.body),
    choicesWrap,
    footerCredit(q),
  ]));
}

function onAnswer(ev, slot, q, i, choicesWrap) {
  if (solveState.answered) return;
  solveState.answered = true;
  const correct = q.correct_index;
  [...choicesWrap.children].forEach((btn, idx) => {
    btn.disabled = true;
    if (idx === correct) btn.classList.add('correct');
    if (idx === i && i !== correct) btn.classList.add('wrong');
  });
  const isRight = i === correct;

  const resultCard = h('section', { class: 'card result-card' }, [
    h('div', { class: 'result-head ' + (isRight ? 'ok' : 'ng') }, isRight ? '正解！🎉' : '残念…'),
    h('p', {}, isRight ? 'お見事！' : `正解は「${q.choices[correct]}」でした。`),
    h('div', { class: 'result-actions' }, [
      h('button', { class: 'btn btn-primary', onclick: () => shareResult(q, isRight) }, 'Misskey でシェア'),
      h('button', { class: 'btn', onclick: () => loadNextQuestion(slot) }, '次の問題へ'),
      h('button', { class: 'btn btn-ghost', onclick: () => openDetail(q.id) }, 'この問題を修正・コメント'),
    ]),
  ]);
  slot.appendChild(resultCard);
  resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function shareResult(q, isRight) {
  const text =
    `「${CONFIG.appName}」で${rankLabel(q.rank)}の問題に挑戦！\n` +
    `${isRight ? '正解しました🎉' : '間違えた…悔しい😤'}\n` +
    `Q. ${q.body}\n` +
    (location.href.startsWith('http') ? `${location.origin + location.pathname}\n` : '') +
    `#${CONFIG.shareHashtag}`;
  Misskey.share(text);
}

/* ---------- 作問画面 ---------- */
function renderCreate(app, editing = null) {
  const isEdit = !!editing;
  const rankSel = h('select', { class: 'input' },
    CONFIG.ranks.map(r => h('option', { value: r.key, selected: editing && editing.rank === r.key ? '' : null }, r.label)));
  const body = h('textarea', { class: 'input', rows: '3', placeholder: '問題文を入力…' }, editing ? editing.body : '');

  const choiceInputs = [];
  const choicesWrap = h('div', { class: 'create-choices' });
  for (let i = 0; i < 4; i++) {
    const radio = h('input', { type: 'radio', name: 'correct', value: String(i),
      ...(editing ? (editing.correct_index === i ? { checked: '' } : {}) : (i === 0 ? { checked: '' } : {})) });
    const inp = h('input', { class: 'input', type: 'text', placeholder: `選択肢 ${i + 1}`,
      value: editing ? (editing.choices[i] || '') : '' });
    choiceInputs.push({ radio, inp });
    choicesWrap.appendChild(h('div', { class: 'create-choice-row' }, [
      h('label', { class: 'radio-wrap', title: '正解にする' }, [radio, h('span', { class: 'radio-dot' })]),
      inp,
    ]));
  }

  const submit = h('button', { class: 'btn btn-primary btn-block' }, isEdit ? '修正を保存' : '問題を登録');
  submit.addEventListener('click', async () => {
    const payload = {
      rank: rankSel.value,
      body: body.value.trim(),
      choices: choiceInputs.map(c => c.inp.value.trim()),
      correctIndex: choiceInputs.findIndex(c => c.radio.checked),
    };
    if (!payload.body) return toast('問題文を入力してください', 'error');
    if (payload.choices.some(c => !c)) return toast('4つの選択肢をすべて入力してください', 'error');
    if (payload.correctIndex < 0) return toast('正解の選択肢を選んでください', 'error');
    submit.disabled = true;
    try {
      if (isEdit) {
        await Store.updateQuestion(editing.id, payload, user);
        toast('修正を保存しました', 'success');
        closeModal();
        switchView('list');
      } else {
        await Store.createQuestion(payload, user);
        toast('問題を登録しました！', 'success');
        switchView('list');
      }
    } catch (e) {
      submit.disabled = false;
      toast(e.message || '保存に失敗しました', 'error');
    }
  });

  const form = h('section', { class: 'card' }, [
    h('h1', {}, isEdit ? '問題を修正' : '問題をつくる'),
    h('p', { class: 'hint' }, '正解にする選択肢の左のマークを選んでください。'),
    h('label', { class: 'field-label' }, '難易度ランク'),
    rankSel,
    h('label', { class: 'field-label' }, '問題文'),
    body,
    h('label', { class: 'field-label' }, '選択肢（4つ・◯が正解）'),
    choicesWrap,
    submit,
  ]);

  if (isEdit) return form; // モーダル用に返す
  app.appendChild(form);
}

/* ---------- 問題一覧 ---------- */
async function renderList(app) {
  app.appendChild(h('div', { class: 'rank-chips' },
    [chip('', 'すべて')].concat(CONFIG.ranks.map(r => chip(r.key, r.label)))
  ));
  const slot = h('div', {}, h('p', { class: 'muted center' }, '読み込み中…'));
  app.appendChild(slot);

  if (!Store.isConfigured()) {
    slot.innerHTML = '';
    slot.appendChild(h('p', { class: 'muted center' }, 'Supabase を設定すると一覧が表示されます。'));
    return;
  }
  let list;
  try { list = await Store.listQuestions(currentRankFilter || undefined); }
  catch (e) { slot.innerHTML = ''; slot.appendChild(errorBox(e)); return; }

  slot.innerHTML = '';
  const bar = h('div', { class: 'list-bar' }, [
    h('span', { class: 'muted' }, `${list.length} 問`),
    h('button', { class: 'btn btn-primary btn-sm', onclick: () => switchView('create') }, '＋ 作問'),
  ]);
  slot.appendChild(bar);

  if (!list.length) {
    slot.appendChild(emptyState('まだ問題がありません。最初の一問を作ってみましょう。'));
    return;
  }
  slot.appendChild(questionGrid(list));
}

function questionGrid(list) {
  const grid = h('div', { class: 'q-grid' });
  list.forEach(q => {
    grid.appendChild(h('button', { class: 'q-card-mini', onclick: () => openDetail(q.id) }, [
      h('span', { class: `rank-badge rank-${q.rank}` }, rankLabel(q.rank)),
      h('p', { class: 'q-mini-body' }, q.body),
      h('div', { class: 'q-mini-foot muted' }, `更新 ${fmtDate(q.updated_at)}・${esc(q.updated_by_name || q.created_by_name || '')}`),
    ]));
  });
  return grid;
}

function emptyState(msg) {
  return h('div', { class: 'card empty' }, [
    h('span', { class: 'empty-mark' }, '◯△□'),
    h('p', { class: 'muted' }, msg),
    h('button', { class: 'btn btn-primary btn-sm', onclick: () => switchView('create') }, '＋ 作問する'),
  ]);
}

/* ---------- 自分の問題 ---------- */
async function renderMy(app) {
  app.appendChild(h('h1', {}, '自分の問題'));
  app.appendChild(h('p', { class: 'hint' }, `${user.name} さんが作成した問題の一覧です。`));
  const slot = h('div', {}, h('p', { class: 'muted center' }, '読み込み中…'));
  app.appendChild(slot);

  if (!Store.isConfigured()) {
    slot.innerHTML = '';
    slot.appendChild(h('p', { class: 'muted center' }, 'Supabase を設定すると表示されます。'));
    return;
  }
  let list;
  try { list = await Store.listMyQuestions(user); }
  catch (e) { slot.innerHTML = ''; slot.appendChild(errorBox(e)); return; }

  slot.innerHTML = '';
  slot.appendChild(h('div', { class: 'list-bar' }, [
    h('span', { class: 'muted' }, `${list.length} 問`),
    h('button', { class: 'btn btn-primary btn-sm', onclick: () => switchView('create') }, '＋ 作問'),
  ]));
  if (!list.length) {
    slot.appendChild(emptyState('まだ作った問題はありません。あなたの一問がみんなの挑戦になります。'));
    return;
  }
  slot.appendChild(questionGrid(list));
}

/* ---------- 詳細モーダル（回答表示・編集・コメント・履歴） ---------- */
async function openDetail(id) {
  openModal(h('p', { class: 'muted center' }, '読み込み中…'));
  let q, comments, hist;
  try {
    [q, comments, hist] = await Promise.all([
      Store.getQuestion(id), Store.listComments(id), Store.listHistory(id),
    ]);
  } catch (e) { setModal(errorBox(e)); return; }

  const content = h('div', { class: 'detail' }, [
    h('div', { class: 'q-meta' }, [h('span', { class: `rank-badge rank-${q.rank}` }, rankLabel(q.rank))]),
    h('h2', { class: 'q-body' }, q.body),
    h('div', { class: 'choices static' }, q.choices.map((c, i) =>
      h('div', { class: 'choice static' + (i === q.correct_index ? ' correct' : '') }, [
        h('span', { class: 'choice-index' }, LETTERS[i]), h('span', {}, c),
        i === q.correct_index ? h('span', { class: 'correct-tag' }, '正解') : null,
      ]))),

    h('div', { class: 'detail-actions' }, [
      h('button', { class: 'btn btn-ink btn-sm', onclick: () => setModal(renderCreate(null, q)) }, '✎ この問題を修正'),
    ]),

    // コメント / 補足
    h('h3', { class: 'section-title' }, '// コメント・補足'),
    commentsBlock(q.id, comments),

    // 履歴
    h('h3', { class: 'section-title' }, '// 履歴'),
    h('ul', { class: 'history' }, (hist.length ? hist : []).map(x =>
      h('li', {}, `${fmtDate(x.created_at)}　${x.action === 'create' ? '作成' : '修正'}：${esc(x.actor_name || x.actor)}`))
      .concat(hist.length ? [] : [h('li', { class: 'muted' }, '履歴はまだありません')])),

    // クレジット
    footerCredit(q),
  ]);
  setModal(content);
}

function commentsBlock(qid, comments) {
  const listEl = h('div', { class: 'comment-list' },
    comments.length ? comments.map(c => h('div', { class: 'comment' }, [
      h('div', { class: 'comment-head' }, [
        h('span', { class: 'comment-kind kind-' + c.kind }, c.kind === 'supplement' ? '補足' : 'コメント'),
        h('span', { class: 'comment-author' }, esc(c.author_name || c.author)),
        h('span', { class: 'comment-date muted' }, fmtDate(c.created_at)),
      ]),
      h('p', { class: 'comment-body' }, c.body),
    ])) : [h('p', { class: 'muted' }, 'まだありません。最初のひとことをどうぞ。')]
  );

  const input = h('textarea', { class: 'input', rows: '2', placeholder: 'コメントや補足を書く…' });
  const kindSel = h('select', { class: 'input input-inline' }, [
    h('option', { value: 'comment' }, 'コメント'),
    h('option', { value: 'supplement' }, '補足'),
  ]);
  const send = h('button', { class: 'btn btn-primary btn-sm' }, '送信');
  send.addEventListener('click', async () => {
    const body = input.value.trim();
    if (!body) return;
    send.disabled = true;
    try {
      const c = await Store.addComment(qid, kindSel.value, body, user);
      input.value = '';
      send.disabled = false;
      // 追記表示
      if (listEl.querySelector('.muted')) listEl.innerHTML = '';
      listEl.appendChild(h('div', { class: 'comment' }, [
        h('div', { class: 'comment-head' }, [
          h('span', { class: 'comment-kind kind-' + c.kind }, c.kind === 'supplement' ? '補足' : 'コメント'),
          h('span', { class: 'comment-author' }, esc(c.author_name || c.author)),
          h('span', { class: 'comment-date muted' }, fmtDate(c.created_at)),
        ]),
        h('p', { class: 'comment-body' }, c.body),
      ]));
    } catch (e) { send.disabled = false; toast(e.message || '送信に失敗', 'error'); }
  });

  return h('div', {}, [
    listEl,
    h('div', { class: 'comment-form' }, [kindSel, input, send]),
  ]);
}

/* ---------- クレジット（誰が作成/修正・更新日） ---------- */
function footerCredit(q) {
  return h('div', { class: 'credit muted' }, [
    h('span', {}, `作成：${esc(q.created_by_name || q.created_by || '不明')}`),
    h('span', {}, `最終更新：${esc(q.updated_by_name || q.updated_by || '—')}（${fmtDate(q.updated_at)}）`),
  ]);
}

/* ---------- モーダル ---------- */
function openModal(content) {
  let overlay = $('#modal');
  overlay.innerHTML = '';
  overlay.classList.add('open');
  const box = h('div', { class: 'modal-box' }, [
    h('button', { class: 'modal-close', onclick: closeModal }, '×'),
    h('div', { class: 'modal-content' }, content),
  ]);
  overlay.appendChild(box);
  overlay.onclick = e => { if (e.target === overlay) closeModal(); };
}
function setModal(content) {
  const c = $('#modal .modal-content');
  if (c) { c.innerHTML = ''; c.appendChild(content); }
}
function closeModal() {
  const overlay = $('#modal');
  overlay.classList.remove('open');
  overlay.innerHTML = '';
}

/* ---------- エラー表示 ---------- */
function errorBox(e) {
  console.error(e);
  return h('div', { class: 'card error-box' }, [
    h('strong', {}, 'エラー：'),
    h('span', {}, e.message || String(e)),
    h('p', { class: 'hint' }, 'Supabase の設定（config.js）とテーブル作成（schema.sql）を確認してください。'),
  ]);
}

/* ---------- 実行 ---------- */
boot();
