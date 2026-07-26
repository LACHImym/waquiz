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

  // いいねボタンの絵文字
  goodEmoji: '🤣',

  // ログインに使う Misskey サーバー。
  // lockMisskeyHost を true にすると、このサーバー専用になります
  // （＝このサーバーにアカウントがある人だけがログイン可能・入力欄は非表示）。
  defaultMisskeyHost: 'wa-community.xsns.jp',
  lockMisskeyHost: true,

  // 3ランク。label・desc・color は自由に変えられます（key は変えないでください）。
  // color は 'yellow' / 'red' / 'blue' から選択。
  // desc＝ホームの説明、guide＝作問時のガイドライン
  ranks: [
    { key: 'beginner',     label: '入門編', color: 'yellow', desc: '入会したてで迷ってる人向け', guide: '公式・準公式に関するもの' },
    { key: 'intermediate', label: '中級編', color: 'red',    desc: 'ちょっと慣れてきた人向け',   guide: 'メンバー複数名が参加しておりAERUや配信アーカイブなどで情報が後からでも見返せるもの' },
    { key: 'mania',        label: '上級編', color: 'blue',   desc: '沼に入りたい人向け',         guide: '特定のメンバーに関するもの' },
  ],

  // 本日の問題（その日限りのお題）。ストックがこの数「以下」だとグレーアウト。
  daily: { label: '本日の問題', color: 'ink', desc: 'その日限りのタイムリーなお題', guide: '一過性の話題', minStock: 3 },

  // シェア文につけるハッシュタグ（# は不要）
  shareHashtag: 'waquiz',

  // オーナーアカウント（全員の問題を閲覧できる特別な権限）。
  // 「@ユーザー名@サーバー」の形式で追加します。複数人OK。
  owners: ['@lachi@wa-community.xsns.jp'],

  // 総合ランキングの配点（ここの数字を変えれば重み付けを調整できます）
  points: {
    login: 1,            // ログイン（1日1回・基本点）
    loginBonus: { 2: 2, 3: 3 }, // 連続N日ちょうどのボーナス（基本点に加算）
    loginEvery5: 5,      // 連続5日以降、5の倍数日ごとに追加（5,10,15…日目）
    solve: 1,            // クイズを1問解く
    correct: 1,          // 正解ボーナス（正解した1問につき追加）
    create: 10,          // 作問（1問作る）
    comment: 2,          // コメント・補足を書く
    commentReceived: 3,  // 自分の問題にコメントが付く
    goodGiven: 1,        // 👍を押す
    goodReceived: 5,     // 自分の問題が👍される
  },
};
