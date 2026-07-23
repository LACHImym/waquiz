/* ============================================================
 *  データ層（Supabase）
 *  問題・コメント/補足・編集履歴の読み書きをまとめています。
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

  // ---- 問題 ----
  async function listQuestions(rank) {
    must();
    let q = db.from('questions').select('*').order('updated_at', { ascending: false });
    if (rank) q = q.eq('rank', rank);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }

  async function getQuestion(id) {
    must();
    const { data, error } = await db.from('questions').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  }

  async function listMyQuestions(user) {
    must();
    const { data, error } = await db.from('questions')
      .select('*').eq('created_by', Misskey.handleOf(user))
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

  // 通常の難易度プール（本日の問題＝scheduled_date付きは除外）からランダムに n 問
  async function sampleQuestions(rank, n) {
    must();
    let q = db.from('questions').select('*').is('scheduled_date', null);
    if (rank) q = q.eq('rank', rank);
    const { data, error } = await q;
    if (error) throw error;
    return shuffle(data).slice(0, n);
  }

  // 本日の問題（scheduled_date が今日）からランダムに n 問
  async function sampleDaily(n, todayYmd) {
    must();
    const { data, error } = await db.from('questions').select('*').eq('scheduled_date', todayYmd);
    if (error) throw error;
    return shuffle(data).slice(0, n);
  }

  // ランクごとの最新作成日時（通常問題のみ）。NEWバッジ判定用。
  async function newestByRank() {
    must();
    const { data, error } = await db.from('questions').select('rank, created_at').is('scheduled_date', null);
    if (error) throw error;
    const m = {};
    data.forEach(r => { if (!m[r.rank] || r.created_at > m[r.rank]) m[r.rank] = r.created_at; });
    return m;
  }

  async function countDaily(todayYmd) {
    must();
    const { count, error } = await db.from('questions')
      .select('*', { count: 'exact', head: true }).eq('scheduled_date', todayYmd);
    if (error) throw error;
    return count || 0;
  }

  // ランク別の問題数（通常プールのみ・出題プール表示用）
  async function countByRank() {
    must();
    const { data, error } = await db.from('questions').select('rank').is('scheduled_date', null);
    if (error) throw error;
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
      scheduled_date: payload.scheduledDate || null,
      created_by: handle,
      created_by_name: user.name,
      updated_by: handle,
      updated_by_name: user.name,
    };
    const { data, error } = await db.from('questions').insert(row).select().single();
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
      scheduled_date: payload.scheduledDate || null,
      updated_by: handle,
      updated_by_name: user.name,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await db.from('questions').update(row).eq('id', id).select().single();
    if (error) throw error;
    await addHistory(id, 'edit', user, '問題を修正');
    return data;
  }

  async function deleteQuestion(id) {
    must();
    const { error } = await db.from('questions').delete().eq('id', id);
    if (error) throw error;
  }

  // ---- 解答の記録・成績 ----
  async function recordAnswer(questionId, isCorrect, user) {
    if (!user || !db) return;
    const row = { question_id: questionId, user_handle: Misskey.handleOf(user), user_name: user.name, is_correct: isCorrect };
    const { error } = await db.from('answers').insert(row);
    if (error) console.warn('answer insert failed', error);
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
      .select('*, questions(body, choices, correct_index, rank)')
      .eq('user_handle', Misskey.handleOf(user))
      .order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data;
  }

  // 正答数ランキング（正解の総数が多い順＝たくさん解くほど有利）
  async function ranking() {
    must();
    const { data, error } = await db.from('answers').select('user_handle, user_name, is_correct');
    if (error) throw error;
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

  // ---- コメント / 補足 ----
  async function listComments(questionId) {
    must();
    const { data, error } = await db.from('comments')
      .select('*').eq('question_id', questionId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  }

  async function addComment(questionId, kind, body, user) {
    must();
    const row = {
      question_id: questionId,
      kind, // 'comment' | 'supplement'
      body,
      author: Misskey.handleOf(user),
      author_name: user.name,
    };
    const { data, error } = await db.from('comments').insert(row).select().single();
    if (error) throw error;
    return data;
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
    sampleDaily, countDaily, newestByRank,
    createQuestion, updateQuestion, deleteQuestion,
    recordAnswer, recordResult, listMyResults, listRecentAnswers, ranking,
    recordLogin, getStreak,
    listComments, addComment, listHistory,
  };
})();
