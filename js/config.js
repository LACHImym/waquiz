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

  // アプリ名・タグライン（画面・シェア文に使われます）
  appName: 'みんなで WA 検定',
  tagline: 'みんなで作ってみんなで解く4択クイズ',

  // 1回のクイズの出題数
  questionsPerQuiz: 5,

  // ログインに使う Misskey サーバー。
  // lockMisskeyHost を true にすると、このサーバー専用になります
  // （＝このサーバーにアカウントがある人だけがログイン可能・入力欄は非表示）。
  defaultMisskeyHost: 'wa-community.xsns.jp',
  lockMisskeyHost: true,

  // 3ランク。label・desc・color は自由に変えられます（key は変えないでください）。
  // color は 'yellow' / 'red' / 'blue' から選択。
  ranks: [
    { key: 'beginner',     label: '入門編', color: 'yellow', desc: '入会したてで迷ってる人向け' },
    { key: 'intermediate', label: '中級編', color: 'red',    desc: 'ちょっと慣れてきた人向け'   },
    { key: 'mania',        label: '上級編', color: 'blue',   desc: '沼に入りたい人向け'         },
  ],

  // シェア文につけるハッシュタグ（# は不要）
  shareHashtag: 'オンラインコミュニティはクイズ',
};
