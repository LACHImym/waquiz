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

  // 指定ランクのプールからランダムに n 問（重複なし）
  async function sampleQuestions(rank, n) {
    const list = await listQuestions(rank);
    const shuffled = list.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, n);
  }

  // ランク別の問題数（出題プール表示用）
  async function countByRank() {
    must();
    const { data, error } = await db.from('questions').select('rank');
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
      updated_by: handle,
      updated_by_name: user.name,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await db.from('questions').update(row).eq('id', id).select().single();
    if (error) throw error;
    await addHistory(id, 'edit', user, '問題を修正');
    return data;
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
    createQuestion, updateQuestion,
    listComments, addComment, listHistory,
  };
})();
