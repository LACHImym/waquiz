/* ============================================================
 *  データ層（Supabase）
 *  問題・コメント・編集履歴の読み書きをまとめています。
 * ============================================================ */
const Store = (() => {
  let db = null;
  let configured = false;

  function init() {
    const url = CONFIG.supabaseUrl;
    const key = CONFIG.supabaseAnonKey;
    configured = url && key && !url.includes('YOUR-PROJECT') && !key.includes('YOUR-ANON');
    if (configured && window.supabase) {
      db = window.supabase.createClient(url, key);
    }
    return configured;
  }

  function isConfigured() { return configured; }

  function must() {
    if (!db) throw new Error('Supabase が未設定です。community-quiz/js/config.js を設定してください。');
  }

  // Supabase は1クエリ最大1000行。集計は全行が必要なのでページングして全部取る。
  async function selectAll(table, columns, build) {
    const size = 1000;
    let from = 0, all = [];
    for (;;) {
      let q = db.from(table).select(columns);
      if (build) q = build(q);
      q = q.range(from, from + size - 1);
      const { data, error } = await q;
      if (error) throw error;
      all = all.concat(data || []);
      if (!data || data.length < size) break;
      from += size;
    }
    return all;
  }

  // ---- 問題 ----
  // ブラウザが読める列。correct_index と explanation は含めない（正解を渡さないため）。
  // データベース側でも列単位で読み取りを止めてあります（supabase/migrate_plan_a.sql）。
  const Q_COLS = 'id, rank, body, choices, link_url, scheduled_date, '
               + 'created_by, created_by_name, updated_by, updated_by_name, created_at, updated_at';

  async function listQuestions(rank) {
    must();
    return selectAll('questions', Q_COLS, q => {
      let x = q.order('updated_at', { ascending: false });
      if (rank) x = x.eq('rank', rank);
      return x;
    });
  }

  async function getQuestion(id) {
    must();
    const { data, error } = await db.from('questions').select(Q_COLS).eq('id', id).single();
    if (error) throw error;
    return data;
  }

  async function listMyQuestions(user) {
    must();
    const { data, error } = await db.from('questions')
      .select(Q_COLS).eq('created_by', Misskey.handleOf(user))
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async function randomQuestion(rank) {
    const list = await listQuestions(rank);
    if (!list.length) return null;
    // Math.random はブラウザ側なので利用可
    return list[Math.floor(Math.random() * list.length)];
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 問題ごとの被解答数（全ユーザー合計）。露出の少ない＝新しい問題ほど小さい。
  async function answerCounts() {
    if (!db) return {};
    let data;
    try { data = await selectAll('answers', 'question_id'); } catch { return {}; }
    const m = {};
    data.forEach(a => { m[a.question_id] = (m[a.question_id] || 0) + 1; });
    return m;
  }

  // 被解答数が少ない問題ほど当たりやすい重み付き抽選（重複なし）。
  // weight = 1 / (解答数 + 1)  … 新問(解答0)が最大の重み。
  function weightedSample(pool, n, countMap) {
    const items = pool.slice();
    const result = [];
    const weight = q => 1 / ((countMap[q.id] || 0) + 1);
    while (result.length < n && items.length) {
      const total = items.reduce((s, q) => s + weight(q), 0);
      let r = Math.random() * total, idx = 0;
      for (; idx < items.length; idx++) { r -= weight(items[idx]); if (r <= 0) break; }
      if (idx >= items.length) idx = items.length - 1;
      result.push(items.splice(idx, 1)[0]);
    }
    return result;
  }

  // デッキ方式：seenIds（この一周で既に出した問題）を除いた未出題から選ぶ。
  // 未出題が n 未満になったら、残りを出し切ってから一周をリセットする。
  // 一周の中では②の露出重み付け（新問優先）を使う。
  // 戻り値 { list, seen }：seen は更新後の「この一周で出した問題ID」。
  function deckSelect(pool, n, seenIds, countMap) {
    const ids = new Set(pool.map(p => p.id));
    const seen = (seenIds || []).filter(id => ids.has(id)); // 削除済みを除外
    const seenSet = new Set(seen);
    const unseen = pool.filter(p => !seenSet.has(p.id));

    if (unseen.length >= n) {
      const picked = weightedSample(unseen, n, countMap);
      return { list: picked, seen: seen.concat(picked.map(p => p.id)) };
    }
    // 一周の終わり：残りを出し切って新しい一周へ
    const tail = unseen;
    const tailIds = new Set(tail.map(p => p.id));
    const poolB = pool.filter(p => !tailIds.has(p.id)); // 同一クイズ内での重複を避ける
    const fillers = weightedSample(poolB, n - tail.length, countMap);
    return { list: tail.concat(fillers), seen: fillers.map(p => p.id) };
  }

  // 通常の難易度プール（本日の問題＝scheduled_date付きは除外）から n 問
  async function sampleQuestions(rank, n, seenIds = []) {
    must();
    const data = await selectAll('questions', Q_COLS, q => {
      let x = q.is('scheduled_date', null);
      if (rank) x = x.eq('rank', rank);
      return x;
    });
    const counts = await answerCounts();
    return deckSelect(data, n, seenIds, counts);
  }

  // 本日の問題（scheduled_date が今日）から n 問
  async function sampleDaily(n, todayYmd, seenIds = []) {
    must();
    const data = await selectAll('questions', Q_COLS, q => q.eq('scheduled_date', todayYmd));
    const counts = await answerCounts();
    return deckSelect(data, n, seenIds, counts);
  }

  // これまでの「本日の問題」すべて（アーカイブ）から n 問
  async function sampleDailyArchive(n, seenIds = []) {
    must();
    const data = await selectAll('questions', Q_COLS, q => q.not('scheduled_date', 'is', null));
    const counts = await answerCounts();
    return deckSelect(data, n, seenIds, counts);
  }

  // ランクごとの最新作成日時（通常問題のみ）。NEWバッジ判定用。
  async function newestByRank() {
    must();
    const data = await selectAll('questions', 'rank, created_at', q => q.is('scheduled_date', null));
    const m = {};
    data.forEach(r => { if (!m[r.rank] || r.created_at > m[r.rank]) m[r.rank] = r.created_at; });
    return m;
  }

  async function countDaily(todayYmd) {
    must();
    const { count, error } = await db.from('questions')
      .select('id', { count: 'exact', head: true }).eq('scheduled_date', todayYmd);
    if (error) throw error;
    return count || 0;
  }

  // ランク別の問題数（通常プールのみ・出題プール表示用）
  async function countByRank() {
    must();
    const data = await selectAll('questions', 'rank', q => q.is('scheduled_date', null));
    const counts = { total: data.length };
    data.forEach(r => { counts[r.rank] = (counts[r.rank] || 0) + 1; });
    return counts;
  }

  async function createQuestion(payload, user) {
    must();
    const handle = Misskey.handleOf(user);
    const row = {
      rank: payload.rank,
      body: payload.body,
      choices: payload.choices,
      correct_index: payload.correctIndex,
      explanation: payload.explanation || '',
      link_url: payload.linkUrl || null,
      scheduled_date: payload.scheduledDate || null,
      created_by: handle,
      created_by_name: user.name,
      updated_by: handle,
      updated_by_name: user.name,
    };
    const { data, error } = await db.from('questions').insert(row).select(Q_COLS).single();
    if (error) throw error;
    await addHistory(data.id, 'create', user, '問題を作成');
    return data;
  }

  async function updateQuestion(id, payload, user) {
    must();
    const handle = Misskey.handleOf(user);
    const row = {
      rank: payload.rank,
      body: payload.body,
      choices: payload.choices,
      correct_index: payload.correctIndex,
      explanation: payload.explanation || '',
      link_url: payload.linkUrl || null,
      scheduled_date: payload.scheduledDate || null,
      updated_by: handle,
      updated_by_name: user.name,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await db.from('questions').update(row).eq('id', id).select(Q_COLS).single();
    if (error) throw error;
    await addHistory(id, 'edit', user, '問題を修正');
    return data;
  }

  async function deleteQuestion(id) {
    must();
    // .select() を付けると「実際に削除された行」が返る。
    // RLS の delete 許可が無いと 0 行（エラーなし）になるので検知できる。
    const { data, error } = await db.from('questions').delete().eq('id', id).select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('削除できませんでした。DBの「削除の許可」設定が必要です（supabase/migrate_all.sql を実行してください）。');
    }
    return data;
  }

  // ---- 解答の記録・成績 ----
  async function recordAnswer(questionId, isCorrect, user) {
    if (!user || !db) return;
    const row = { question_id: questionId, user_handle: Misskey.handleOf(user), user_name: user.name, is_correct: isCorrect };
    const { error } = await db.from('answers').insert(row);
    if (error) console.warn('answer insert failed', error);
  }

  // 1セッション分の解答をまとめて記録（完走時のみ呼ぶ＝途中離脱は無効）
  // source は 'quiz'（普段のクイズ）か 'arena'（アーカイブ）。
  // アーカイブは1日の上限を数えるために区別する。
  async function recordAnswersBatch(items, user, source = 'quiz') {
    if (!user || !db || !items || !items.length) return;
    const rows = items.map(it => ({
      question_id: it.question_id, user_handle: Misskey.handleOf(user),
      user_name: user.name, is_correct: it.is_correct, source,
    }));
    const { error } = await db.from('answers').insert(rows);
    if (!error) return;
    // source 列がまだ無いDBでも記録が消えないように、列を外してもう一度試す
    console.warn('answers batch failed, retrying without source', error);
    const plain = rows.map(({ source, ...rest }) => rest);
    const retry = await db.from('answers').insert(plain);
    if (retry.error) console.warn('answers batch failed', retry.error);
  }

  async function recordResult(rank, correct, total, user) {
    if (!user || !db) return;
    const row = { rank, correct, total, user_handle: Misskey.handleOf(user), user_name: user.name };
    const { error } = await db.from('results').insert(row);
    if (error) console.warn('result insert failed', error);
  }

  async function listMyResults(user, limit = 20) {
    must();
    const { data, error } = await db.from('results')
      .select('*').eq('user_handle', Misskey.handleOf(user))
      .order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data;
  }

  async function listRecentAnswers(user, limit = 10) {
    must();
    const { data, error } = await db.from('answers')
      .select('*, questions(body, choices, rank, link_url, scheduled_date)')
      .eq('user_handle', Misskey.handleOf(user))
      .order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data;
  }

  // 自分が作った問題に付いたコメント（自分のコメントは除く・新しい順）
  async function commentsOnMyQuestions(user) {
    if (!user || !db) return [];
    const handle = Misskey.handleOf(user);
    const qs = await selectAll('questions', 'id, body', q => q.eq('created_by', handle));
    const ids = qs.map(q => q.id);
    if (!ids.length) return [];
    const cms = await selectAll('comments', '*', q => q.in('question_id', ids).order('created_at', { ascending: false }));
    const bodyMap = {}; qs.forEach(q => { bodyMap[q.id] = q.body; });
    return cms.filter(c => c.author !== handle).map(c => ({ ...c, qbody: bodyMap[c.question_id] }));
  }

  // 複数問題のリアクション数をまとめて取得（一覧表示用）。kind: 'funny'（🤣）/ 'heart'（♥）
  async function goodCountsByQuestions(ids, kind = 'funny') {
    if (!db || !ids || !ids.length) return {};
    let data;
    try { data = await selectAll('goods', 'question_id', q => q.in('question_id', ids).eq('kind', kind)); } catch { return {}; }
    const m = {}; data.forEach(g => { m[g.question_id] = (m[g.question_id] || 0) + 1; });
    return m;
  }

  // ---- 🤣/♥ リアクション（kind で種類を分ける） ----
  async function goodCount(questionId, kind = 'funny') {
    if (!db) return 0;
    const { count, error } = await db.from('goods')
      .select('*', { count: 'exact', head: true }).eq('question_id', questionId).eq('kind', kind);
    if (error) return 0; // テーブル未作成でも 0 で返し、ボタンを止めない
    return count || 0;
  }
  async function hasGood(questionId, user, kind = 'funny') {
    if (!user || !db) return false;
    const { data, error } = await db.from('goods')
      .select('id').eq('question_id', questionId).eq('user_handle', Misskey.handleOf(user)).eq('kind', kind).limit(1);
    if (error) return false;
    return !!(data && data.length);
  }
  // 押す/取り消しをトグル。新しい状態(boolean)を返す
  async function toggleGood(questionId, user, kind = 'funny') {
    must();
    const handle = Misskey.handleOf(user);
    const on = await hasGood(questionId, user, kind);
    if (on) {
      const { error } = await db.from('goods').delete()
        .eq('question_id', questionId).eq('user_handle', handle).eq('kind', kind);
      if (error) throw error;
      return false;
    } else {
      const { error } = await db.from('goods').insert({ question_id: questionId, user_handle: handle, kind });
      if (error) throw error;
      return true;
    }
  }

  // 連続N日目のログインで得られる点数（基本＋ボーナス＋5の倍数）
  // Date から 'YYYY-MM-DD'（端末のローカル日付＝日本時間）
  function ymdOf(d) {
    const p2 = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }

  function loginPointsForDay(day) {
    const P = CONFIG.points;
    let pts = P.login || 0;
    if (P.loginBonus && P.loginBonus[day]) pts += P.loginBonus[day];
    if (day >= 5 && day % 5 === 0) pts += (P.loginEvery5 || 0);
    if (day >= 30 && day % 30 === 0) pts += (P.loginEvery30 || 0);
    return pts;
  }

  // リアクションが多い問題 上位 n。kind: 'funny'（🤣うけるね）/ 'heart'（♥いいね）
  async function reactionRanking(kind = 'funny', limit = 5) {
    must();
    const [gds, qs] = await Promise.all([
      selectAll('goods', 'question_id', q => q.eq('kind', kind)),
      selectAll('questions', 'id, body, rank, scheduled_date, created_by_name, created_by'),
    ]);
    const counts = {};
    gds.forEach(g => { counts[g.question_id] = (counts[g.question_id] || 0) + 1; });
    const qmap = {};
    qs.forEach(q => { qmap[q.id] = q; });
    return Object.entries(counts)
      .map(([id, c]) => ({ q: qmap[id], count: c }))
      .filter(x => x.q && x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
  // 面白クイズランキング（🤣が多い問題 上位 n）
  const funnyRanking = (limit = 5) => reactionRanking('funny', limit);
  // いいねランキング（♥が多い問題 上位 n）
  const heartRanking = (limit = 5) => reactionRanking('heart', limit);

  // 難問ランキング（正答率が低い問題 上位 n）
  // 1〜2人しか解いていない問題が上位を占めないよう、minAnswers 回以上解かれた問題だけを対象にする。
  async function hardRanking(limit = 5, minAnswers = 3) {
    must();
    const [ans, qs] = await Promise.all([
      selectAll('answers', 'question_id, is_correct'),
      selectAll('questions', 'id, body, rank, scheduled_date, created_by_name, created_by'),
    ]);
    const m = {};
    ans.forEach(a => {
      const x = m[a.question_id] || (m[a.question_id] = { total: 0, correct: 0 });
      x.total++; if (a.is_correct) x.correct++;
    });
    const qmap = {};
    qs.forEach(q => { qmap[q.id] = q; });
    return Object.entries(m)
      .filter(([id, x]) => qmap[id] && x.total >= minAnswers)
      .map(([id, x]) => ({ q: qmap[id], total: x.total, correct: x.correct, rate: x.correct / x.total }))
      .sort((a, b) => a.rate - b.rate || b.total - a.total)
      .slice(0, limit);
  }

  // ---- 総合ランキング（各アクションを配点して合算） ----
  async function totalRanking() {
    must();
    const P = CONFIG.points;
    const [qsD, ansD, cmsD, lgsD, gdsD, waoD, legD] = await Promise.all([
      selectAll('questions', 'id, created_by, created_by_name, created_at'),
      selectAll('answers', 'user_handle, user_name, question_id, is_correct, created_at'),
      selectAll('comments', 'author, author_name, question_id, created_at'),
      selectAll('logins', 'user_handle, user_name, login_date'),
      selectAll('goods', 'user_handle, question_id, kind, created_at'),
      // WA王決定戦の完走ボーナス用。テーブルが未作成でも他の集計は止めない。
      selectAll('wao_entries', 'user_handle, user_name, finished').catch(() => []),
      // 締め日までの持ち点。まだ作っていなければ null（従来どおり全期間を計算する）
      selectAll('legacy_points', 'user_handle, user_name, points').catch(() => null),
    ]);

    // 締め日。凍結データが揃っているときだけ「締め日より後」を新ルールで数える。
    const cut = CONFIG.pointsFrozenAt ? new Date(CONFIG.pointsFrozenAt) : null;
    const frozen = !!(cut && legD && legD.length);
    const after = ts => !frozen || (ts && new Date(ts) >= cut);
    const key2 = (a1, b1) => String(a1) + '|' + String(b1);

    const M = {};
    const get = (handle, name) => {
      const m = M[handle] || (M[handle] = { handle, name: name || handle, points: 0, days: 0, breakdown: {} });
      if (name) m.name = name;
      return m;
    };
    const add = (handle, name, key, pts) => {
      if (!handle || !pts) return;
      const m = get(handle, name);
      m.points += pts; m.breakdown[key] = (m.breakdown[key] || 0) + pts;
    };

    // 締め日までのぶんを、まず土台として置く
    if (frozen) legD.forEach(r => add(r.user_handle, r.user_name, 'legacy', r.points));

    // 問題→作成者ハンドルの対応表（コメント/リアクションの「受け取り」集計用）
    const qAuthor = {};
    qsD.forEach(q => {
      qAuthor[q.id] = q.created_by;
      if (after(q.created_at)) add(q.created_by, q.created_by_name, 'create', P.create);
    });

    // クイズ：その問題を「はじめて解いたとき」の1回だけ数える。
    // 2回目以降は何度解いても入らない（＝未挑戦の問題がある限り上限なし）。
    if (frozen) {
      // 「はじめて解いたとき」と「はじめて正解したとき」を別々に探す。
      // 正解ボーナスは、何回目の挑戦であっても “初めて当てた1回” に入る。
      const firstTry = {}, firstHit = {};
      ansD.forEach(a2 => {
        const k = key2(a2.user_handle, a2.question_id);
        if (!firstTry[k] || String(a2.created_at) < String(firstTry[k].created_at)) firstTry[k] = a2;
        if (a2.is_correct && (!firstHit[k] || String(a2.created_at) < String(firstHit[k].created_at))) firstHit[k] = a2;
      });
      Object.values(firstTry).forEach(a2 => {
        if (!after(a2.created_at)) return;   // 締め日より前の初挑戦は凍結ぶんに含まれている
        add(a2.user_handle, a2.user_name, 'solve', P.solve);
      });
      Object.values(firstHit).forEach(a2 => {
        if (!after(a2.created_at)) return;   // 締め日より前の初正解も凍結ぶんに含まれている
        add(a2.user_handle, a2.user_name, 'correct', P.correct);
      });
    } else {
      // 締め前（凍結テーブルがまだ無い）は、これまでどおり全件を数える
      ansD.forEach(a2 => {
        add(a2.user_handle, a2.user_name, 'solve', P.solve);
        if (a2.is_correct) add(a2.user_handle, a2.user_name, 'correct', P.correct);
      });
    }

    cmsD.forEach(c => {
      if (!after(c.created_at)) return;
      add(c.author, c.author_name, 'comment', P.comment);
      const author = qAuthor[c.question_id];
      if (author && author !== c.author) add(author, null, 'commentReceived', P.commentReceived);
    });

    // ログインは連続日数に応じて配点（各ユーザーの日付列からストリークを再現）
    const byUser = {};
    lgsD.forEach(l => {
      const u = byUser[l.user_handle] || (byUser[l.user_handle] = { name: l.user_name, dates: [] });
      u.dates.push(l.login_date);
      if (l.user_name) u.name = l.user_name;
    });
    const cutYmd = cut ? ymdOf(cut) : null;
    Object.entries(byUser).forEach(([handle, u]) => {
      const dates = [...new Set(u.dates)].sort();
      let day = 0, prev = null, sum = 0;
      for (const d of dates) {
        day = (prev && shiftYmd(prev, 1) === d) ? day + 1 : 1;
        // 連続日数は全期間から数えるが、加点するのは締め日より後の日だけ
        if (!frozen || d >= cutYmd) sum += loginPointsForDay(day);
        prev = d;
      }
      add(handle, u.name, 'login', sum);
      const m = get(handle, u.name);
      m.days = dates.length;                     // 累計ログイン日数
      m.lastLogin = dates[dates.length - 1];     // 最終ログイン日
    });

    // リアクション：種類は問わない（♥も🤣も、どの絵文字でも）。
    // 1つの問題につき1人1つまで数える（同じ問題に複数付けても1回ぶん）。
    const seenReact = {};
    gdsD.forEach(g => {
      if (!after(g.created_at)) return;
      if (!frozen && g.kind !== 'funny') return;   // 締め前はこれまでどおり🤣のみ
      const k = key2(g.user_handle, g.question_id);
      if (seenReact[k]) return;
      seenReact[k] = 1;
      add(g.user_handle, null, 'goodGiven', P.goodGiven);
      const author = qAuthor[g.question_id];
      if (author && author !== g.user_handle) add(author, null, 'goodReceived', P.goodReceived);
    });

    // WA王決定戦の完走ボーナス（締め日より前のイベントなので凍結ぶんに含まれる）
    if (!frozen) {
      (waoD || []).forEach(e => {
        if (e.finished) add(e.user_handle, e.user_name, 'decisionBattle', P.decisionBattle);
      });
    }

    return Object.values(M).sort((x, y) => y.points - x.points);
  }

  // 正答数ランキング（正解の総数が多い順＝たくさん解くほど有利）
  async function ranking() {
    must();
    const data = await selectAll('answers', 'user_handle, user_name, is_correct');
    const map = {};
    data.forEach(a => {
      const m = map[a.user_handle] || (map[a.user_handle] = { handle: a.user_handle, name: a.user_name, correct: 0, total: 0 });
      m.total++;
      if (a.is_correct) m.correct++;
      if (a.user_name) m.name = a.user_name;
    });
    return Object.values(map).sort((x, y) => y.correct - x.correct || y.total - x.total);
  }

  // ---- ログインボーナス（連続ログイン） ----
  // 今日のログインを記録し、{ current, longest, isNewToday } を返す
  async function recordLogin(user, todayYmd) {
    if (!user || !db) return null;
    const handle = Misskey.handleOf(user);
    // 今日ぶんを記録（同日重複は unique 制約 or upsert で無視）
    const { error: upErr } = await db.from('logins')
      .upsert({ user_handle: handle, user_name: user.name, login_date: todayYmd },
              { onConflict: 'user_handle,login_date', ignoreDuplicates: true });
    if (upErr) { console.warn('login upsert failed', upErr); }

    // これまでの全ログイン日を取得してストリークを計算
    const { data, error } = await db.from('logins')
      .select('login_date').eq('user_handle', handle).order('login_date', { ascending: false });
    if (error) { console.warn('login select failed', error); return null; }

    const days = new Set(data.map(r => r.login_date));
    const isNewToday = true; // 表示上は毎回ボーナス演出（重複記録は無視される）

    // 現在の連続日数（今日から遡る）
    const cur = countStreakFrom(days, todayYmd);
    // 最長連続日数
    const longest = longestStreak([...days].sort());
    return { current: cur, longest: Math.max(longest, cur), isNewToday, totalDays: days.size };
  }

  function shiftYmd(ymd, delta) {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + delta);
    const p = n => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
  }
  function countStreakFrom(daySet, todayYmd) {
    // 今日ログインしていなければ昨日基準（当日未記録でも直近の連続を返す）
    let cursor = daySet.has(todayYmd) ? todayYmd : shiftYmd(todayYmd, -1);
    if (!daySet.has(cursor)) return 0;
    let n = 0;
    while (daySet.has(cursor)) { n++; cursor = shiftYmd(cursor, -1); }
    return n;
  }
  function longestStreak(sortedDays) {
    let best = 0, run = 0, prev = null;
    for (const d of sortedDays) {
      if (prev && shiftYmd(prev, 1) === d) run++;
      else run = 1;
      best = Math.max(best, run); prev = d;
    }
    return best;
  }

  // ---- ユーザーのアイコン（profiles） ----
  // ログイン時に自分の名前とアイコンURLを保存する。テーブルが無くても落とさない。
  async function saveProfile(user) {
    if (!user || !db) return;
    try {
      await db.from('profiles').upsert({
        user_handle: Misskey.handleOf(user),
        user_name: user.name,
        avatar_url: user.avatarUrl || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_handle' });
    } catch (e) { /* テーブル未作成でも動作を止めない */ }
  }

  // Misskey から引いてきた他の人のアイコンを保存する（次から全員がすぐ見られる）
  async function saveProfileRow(handle, name, avatarUrl) {
    if (!handle || !db) return;
    try {
      await db.from('profiles').upsert({
        user_handle: handle, user_name: name || null, avatar_url: avatarUrl || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_handle' });
      if (_profileCache) _profileCache[handle] = { name, avatar: avatarUrl };
    } catch (e) { /* テーブル未作成でも動作を止めない */ }
  }

  // 全員ぶんのアイコンを取得。{ '@user@host': {name, avatar} } の形で返す。
  let _profileCache = null;
  async function allProfiles(force = false) {
    if (!db) return {};
    if (_profileCache && !force) return _profileCache;
    let rows = [];
    try { rows = await selectAll('profiles', 'user_handle, user_name, avatar_url'); }
    catch (e) { return {}; }
    const m = {};
    rows.forEach(r => { m[r.user_handle] = { name: r.user_name, avatar: r.avatar_url }; });
    _profileCache = m;
    return m;
  }

  async function getStreak(user, todayYmd) {
    if (!user || !db) return null;
    const handle = Misskey.handleOf(user);
    const { data, error } = await db.from('logins').select('login_date').eq('user_handle', handle);
    if (error) throw error;
    const days = new Set(data.map(r => r.login_date));
    const cur = countStreakFrom(days, todayYmd);
    const longest = longestStreak([...days].sort());
    return { current: cur, longest: Math.max(longest, cur), totalDays: days.size };
  }

  // ---- コメント ----
  async function listComments(questionId) {
    must();
    const { data, error } = await db.from('comments')
      .select('*').eq('question_id', questionId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  }

  async function addComment(questionId, body, user) {
    must();
    const row = {
      question_id: questionId,
      body,
      author: Misskey.handleOf(user),
      author_name: user.name,
    };
    const { data, error } = await db.from('comments').insert(row).select().single();
    if (error) throw error;
    return data;
  }

  // 自分のコメントを書き直す（本人以外は書き換えられないようアプリ側で確認）
  async function updateComment(id, body, user) {
    must();
    const { data, error } = await db.from('comments')
      .update({ body }).eq('id', id).eq('author', Misskey.handleOf(user)).select();
    if (error) throw error;
    if (!data || !data.length) {
      throw new Error('書き換えできませんでした。DBの設定（supabase/migrate_all.sql）を実行してください。');
    }
    return data[0];
  }

  async function deleteComment(id, user) {
    must();
    const { data, error } = await db.from('comments')
      .delete().eq('id', id).eq('author', Misskey.handleOf(user)).select();
    if (error) throw error;
    if (!data || !data.length) {
      throw new Error('削除できませんでした。DBの設定（supabase/migrate_all.sql）を実行してください。');
    }
    return data;
  }

  // 自分が書いたコメント（新しい順・問題文つき）
  async function myComments(user) {
    if (!user || !db) return [];
    const handle = Misskey.handleOf(user);
    const cms = await selectAll('comments', '*', q =>
      q.eq('author', handle).order('created_at', { ascending: false }));
    if (!cms.length) return [];
    const ids = [...new Set(cms.map(c => c.question_id))];
    const qs = await selectAll('questions', 'id, body', q => q.in('id', ids));
    const bodyMap = {}; qs.forEach(q => { bodyMap[q.id] = q.body; });
    return cms.map(c => ({ ...c, qbody: bodyMap[c.question_id] }));
  }

  // ============================================================
  //  WA王決定戦
  // ============================================================
  // この人の挑戦記録（無ければ null）。1人1行なので「挑戦済みか」の判定に使う。
  async function waoEntry(user) {
    if (!user || !db) return null;
    const { data, error } = await db.from('wao_entries')
      .select('*').eq('user_handle', Misskey.handleOf(user)).limit(1);
    if (error) throw error;
    return (data && data[0]) || null;
  }

  // 出題対象：cutoff の日より前に作られた問題を全部
  async function waoQuestions(cutoffYmd) {
    must();
    return selectAll('questions', Q_COLS, q => q.lt('created_at', cutoffYmd));
  }

  // 出題対象が何問あるか（ルール表示用。中身は取らずに数だけ数える）
  async function waoQuestionCount(cutoffYmd) {
    must();
    const { count, error } = await db.from('questions')
      .select('id', { count: 'exact', head: true }).lt('created_at', cutoffYmd);
    if (error) throw error;
    return count || 0;
  }

  // 挑戦の開始を記録。既に挑戦済みならエラーになる（1人1回きり）
  async function waoStart(user, total) {
    must();
    const { data, error } = await db.from('wao_entries')
      .insert({ user_handle: Misskey.handleOf(user), user_name: user.name, total })
      .select();
    if (error) throw error;
    return data && data[0];
  }

  // 1問ごとの正誤を記録（同点だったときの順位付けに使う）
  async function waoRecordAnswers(user, items) {
    if (!user || !db || !items || !items.length) return;
    const handle = Misskey.handleOf(user);
    const rows = items.map(it => ({
      user_handle: handle, question_id: it.question_id, is_correct: it.is_correct,
    }));
    const { error } = await db.from('wao_answers')
      .upsert(rows, { onConflict: 'user_handle,question_id' });
    if (error) console.warn('wao answers failed', error);
  }

  async function waoFinish(user, correct, answered) {
    must();
    const { error } = await db.from('wao_entries').update({
      correct, answered, finished: true, finished_at: new Date().toISOString(),
    }).eq('user_handle', Misskey.handleOf(user));
    if (error) throw error;
  }

  // オーナーが公開前にテストするため、自分の挑戦記録を消す
  async function waoResetUser(user) {
    must();
    const handle = Misskey.handleOf(user);
    const a = await db.from('wao_answers').delete().eq('user_handle', handle).select();
    if (a.error) throw a.error;
    const e = await db.from('wao_entries').delete().eq('user_handle', handle).select();
    if (e.error) throw e.error;
    if (!e.data || !e.data.length) {
      throw new Error('消せませんでした。記録の削除は禁止されています（不正防止のため）。'
        + 'どうしても消す必要があるときは Supabase の管理画面から消してください。');
    }
  }

  // 結果の集計。正解数の多い順。正解数が同じ人は同じ順位（同立）にする。
  async function waoRanking() {
    must();
    const entries = await selectAll('wao_entries', '*');
    const rows = entries.sort((a, b) =>
      b.correct - a.correct ||
      String(a.finished_at || '').localeCompare(String(b.finished_at || '')));
    // 1, 2, 2, 4 のように、同点は同じ順位・次はその人数ぶん飛ばす
    let prev = null, rank = 0;
    rows.forEach((r, i) => {
      if (prev === null || r.correct !== prev) { rank = i + 1; prev = r.correct; }
      r.rank = rank;
    });
    return rows;
  }

  // 検算用：1問ごとの解答記録から、人ごとの「実際の回答数・正解数」を数える。
  // 点数はブラウザが申告した数字なので、この実データと突き合わせて食い違いを見つける。
  async function waoAnswerStats() {
    must();
    const rows = await selectAll('wao_answers', 'user_handle, is_correct');
    const map = {};
    rows.forEach(r => {
      const m = map[r.user_handle] || (map[r.user_handle] = { answered: 0, correct: 0 });
      m.answered++;
      if (r.is_correct) m.correct++;
    });
    return map;
  }

  // ============================================================
  //  アーカイブ（ランダムマッチ／タイムマッチ）
  //  ※ ここでの成績は「普段の総合ランキング」には一切入りません。
  //     answers テーブルには書かないので、ポイントも動きません。
  // ============================================================
  // WA王で出題対象だった問題から、ランダムに n 問。
  async function arenaSample(cutoffYmd, n) {
    must();
    const all = await selectAll('questions', Q_COLS, q => q.lt('created_at', cutoffYmd));
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all.slice(0, n);
  }

  // タイムマッチの記録を残す（1回ごとに1行。順位は最速タイムで決める）
  async function timeAttackSubmit(user, questions, seconds, rawSeconds, wrong) {
    if (!user || !db) return;
    const { error } = await db.from('time_attack').insert({
      user_handle: Misskey.handleOf(user), user_name: user.name,
      questions, seconds, raw_seconds: rawSeconds, wrong,
    });
    if (error) console.warn('time attack save failed', error);
  }

  // 問題数ごとのタイムランキング。1人1つ（その人のいちばん速い記録）だけ残す。
  async function timeAttackRanking(questions) {
    must();
    const rows = await selectAll('time_attack', '*', q => q.eq('questions', questions));
    const best = {};
    rows.forEach(r => {
      const cur = best[r.user_handle];
      if (!cur || Number(r.seconds) < Number(cur.seconds)) best[r.user_handle] = r;
    });
    return Object.values(best).sort((a, b) => Number(a.seconds) - Number(b.seconds));
  }

  // ============================================================
  //  採点（正解はブラウザに渡さず、データベース側で判定する）
  // ============================================================
  // 普段のクイズ用。正誤に加えて、正解と解説も返す。
  async function grade(questionId, choiceText) {
    must();
    const { data, error } = await db.rpc('wq_grade', { p_id: questionId, p_choice: choiceText });
    if (error) throw error;
    const r = (data && data[0]) || {};
    return { isCorrect: !!r.is_correct, correctChoice: r.correct_choice || '', explanation: r.explanation || '' };
  }

  // 大会・タイムマッチ用。正誤だけを返す（正解も解説も渡さない）。
  async function gradeQuiet(questionId, choiceText) {
    must();
    const { data, error } = await db.rpc('wq_grade_quiet', { p_id: questionId, p_choice: choiceText });
    if (error) throw error;
    return !!data;
  }

  // 1問ぶんの正解と解説（自分が答えた問題の振り返り用）
  async function reveal(questionId) {
    must();
    const { data, error } = await db.rpc('wq_reveal', { p_id: questionId });
    if (error) throw error;
    const r = (data && data[0]) || {};
    return { correctChoice: r.correct_choice || '', explanation: r.explanation || '' };
  }

  // アーカイブで今日すでに何問ぶんポイントが入ったか（翌日0時にリセットされる）
  async function arenaTodayCount(user) {
    if (!user || !db) return 0;
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const { count, error } = await db.from('answers')
      .select('id', { count: 'exact', head: true })
      .eq('user_handle', Misskey.handleOf(user))
      .eq('source', 'arena')
      .gte('created_at', from.toISOString());
    if (error) throw error;
    return count || 0;
  }

  // 自分がこれまでに「解いた問題」と「正解した問題」。
  // ポイントが入るのは初挑戦・初正解の1回だけなので、その判定に使う。
  async function myAnswerState(user) {
    const empty = { solved: new Set(), correct: new Set() };
    if (!user || !db) return empty;
    const rows = await selectAll('answers', 'question_id, is_correct',
      q => q.eq('user_handle', Misskey.handleOf(user)));
    rows.forEach(r => {
      empty.solved.add(r.question_id);
      if (r.is_correct) empty.correct.add(r.question_id);
    });
    return empty;
  }

  // ---- 履歴 ----
  async function addHistory(questionId, action, user, detail) {
    const row = {
      question_id: questionId,
      action, // 'create' | 'edit'
      actor: Misskey.handleOf(user),
      actor_name: user.name,
      detail: detail || '',
    };
    const { error } = await db.from('history').insert(row);
    if (error) console.warn('history insert failed', error);
  }

  async function listHistory(questionId) {
    must();
    const { data, error } = await db.from('history')
      .select('*').eq('question_id', questionId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  return {
    init, isConfigured,
    listQuestions, listMyQuestions, getQuestion, randomQuestion, sampleQuestions, countByRank,
    sampleDaily, sampleDailyArchive, countDaily, newestByRank,
    createQuestion, updateQuestion, deleteQuestion,
    recordAnswer, recordAnswersBatch, recordResult, listMyResults, listRecentAnswers, ranking, totalRanking,
    funnyRanking, heartRanking, hardRanking,
    goodCount, hasGood, toggleGood, goodCountsByQuestions,
    commentsOnMyQuestions, myComments,
    recordLogin, getStreak, loginPointsForDay, saveProfile, saveProfileRow, allProfiles,
    listComments, addComment, updateComment, deleteComment, listHistory,
    waoEntry, waoQuestions, waoQuestionCount, waoStart, waoRecordAnswers, waoFinish, waoRanking, waoResetUser, waoAnswerStats,
    arenaSample, timeAttackSubmit, timeAttackRanking, arenaTodayCount,
    grade, gradeQuiet, reveal, myAnswerState,
  };
})();
