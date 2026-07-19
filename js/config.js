/* ============================================================
 *  設定ファイル（ここだけ書き換えればOK）
 * ------------------------------------------------------------
 *  Supabase の URL と anon key を貼り付けてください。
 *  anon key は公開してよいキーです（GitHub に上げても安全）。
 *  実際のデータ保護は Supabase 側の RLS ポリシーで行います。
 *  → 手順は community-quiz/README.md を参照。
 * ============================================================ */
window.QUIZ_CONFIG = {
  // ▼▼▼ ここ2つを自分の Supabase プロジェクトの値に置き換える ▼▼▼
  supabaseUrl:     'https://wmpdjuctrzhsonessuad.supabase.co',
  supabaseAnonKey: 'sb_publishable_eANsHPV3coCJom_IKZaBBg_k9DMP4q9',
  // ▲▲▲ ここまで ▲▲▲

  // アプリ名（画面上部・シェア文に使われます）
  appName: 'オンラインコミュニティは クイズ',

  // ログインに使う Misskey サーバー。
  // lockMisskeyHost を true にすると、このサーバー専用になります
  // （＝このサーバーにアカウントがある人だけがログイン可能・入力欄は非表示）。
  defaultMisskeyHost: 'wa-community.xsns.jp',
  lockMisskeyHost: true,

  // 3ランク。label は後から自由に変えられます（key は変えないでください）。
  ranks: [
    { key: 'beginner',     label: 'ビギナー' },
    { key: 'intermediate', label: '中級'     },
    { key: 'mania',        label: 'マニア'   },
  ],

  // シェア文につけるハッシュタグ（# は不要）
  shareHashtag: 'オンラインコミュニティはクイズ',
};
