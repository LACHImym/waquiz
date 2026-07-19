/* ============================================================
 *  Misskey ログイン（MiAuth）とシェア
 *  - サーバー不要。ブラウザだけで完結する MiAuth フローを使います。
 *  - ログイン情報は localStorage に保存します。
 * ============================================================ */
const Misskey = (() => {
  const LS_KEY = 'ocq_misskey_user';   // ログイン済みユーザー
  const LS_PENDING = 'ocq_miauth_pending'; // ログイン処理中の一時情報

  // uuid v4（crypto ベース）
  function uuid() {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = (crypto.getRandomValues(new Uint8Array(1))[0]) % 16;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
  }

  function getUser() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)); }
    catch { return null; }
  }

  function isLoggedIn() { return !!getUser(); }

  function logout() {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_PENDING);
  }

  // 「@user@host」形式のハンドル
  function handleOf(u) {
    return u ? `@${u.username}@${u.host}` : '';
  }

  // 使用するサーバー名を返す（ロック時は必ず固定サーバー）
  function serverHost() {
    return CONFIG.defaultMisskeyHost.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  }

  // ログイン開始 → Misskey の認可画面へリダイレクト
  function login(host) {
    // サーバー固定モードなら入力に関わらず専用サーバーを使う
    host = CONFIG.lockMisskeyHost ? serverHost()
      : (host || CONFIG.defaultMisskeyHost).trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    const session = uuid();
    // コールバック先＝このページ（クエリを綺麗にした状態）
    const callback = location.origin + location.pathname;
    localStorage.setItem(LS_PENDING, JSON.stringify({ host, session }));

    const url = new URL(`https://${host}/miauth/${session}`);
    url.searchParams.set('name', CONFIG.appName);
    url.searchParams.set('callback', callback);
    url.searchParams.set('permission', 'write:notes');
    location.href = url.toString();
  }

  // コールバックから戻ってきたときの処理（成功したら user を返す）
  async function handleCallback() {
    const params = new URLSearchParams(location.search);
    const session = params.get('session');
    const pendingRaw = localStorage.getItem(LS_PENDING);
    if (!session || !pendingRaw) return null;

    let pending;
    try { pending = JSON.parse(pendingRaw); } catch { return null; }
    if (pending.session !== session) return null;

    // トークン発行の確認
    const res = await fetch(`https://${pending.host}/api/miauth/${session}/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await res.json();
    if (!data || !data.ok || !data.token) {
      localStorage.removeItem(LS_PENDING);
      throw new Error('ログインに失敗しました。もう一度お試しください。');
    }

    const user = {
      host: pending.host,
      token: data.token,
      id: data.user.id,
      username: data.user.username,
      name: data.user.name || data.user.username,
      avatarUrl: data.user.avatarUrl || '',
    };
    localStorage.setItem(LS_KEY, JSON.stringify(user));
    localStorage.removeItem(LS_PENDING);

    // URL からクエリを消す
    history.replaceState({}, '', location.origin + location.pathname);
    return user;
  }

  // シェア（Misskey の投稿画面をプリフィルして開く。トークン不要で確実）
  function share(text) {
    const u = getUser();
    const host = (u && u.host) || CONFIG.defaultMisskeyHost;
    const url = new URL(`https://${host}/share`);
    url.searchParams.set('text', text);
    window.open(url.toString(), '_blank', 'noopener');
  }

  return { getUser, isLoggedIn, logout, handleOf, login, handleCallback, share, serverHost };
})();
