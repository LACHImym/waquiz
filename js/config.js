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

  // アプリ名（画面・シェア文に使われます）
  appName: 'WA検定',

  // 1回のクイズの出題数
  questionsPerQuiz: 5,

  // ログインに使う Misskey サーバー。
  // lockMisskeyHost を true にすると、このサーバー専用になります
  // （＝このサーバーにアカウントがある人だけがログイン可能・入力欄は非表示）。
  defaultMisskeyHost: 'wa-community.xsns.jp',
  lockMisskeyHost: true,

  // 3ランク。label・desc・color は自由に変えられます（key は変えないでください）。
  // color は 'yellow' / 'magenta' / 'cyan' / 'navy' から選択。
  // desc＝ホームの説明、guide＝作問時のガイドライン、stars＝難易度の星の数
  ranks: [
    { key: 'beginner',     label: '入門編', color: 'yellow',  stars: 1, desc: 'まずは腕試し', guide: '公式・準公式に関するもの' },
    { key: 'intermediate', label: '中級編', color: 'magenta', stars: 2, desc: '慣れてきたら', guide: 'メンバー複数名が参加しておりAERUや配信アーカイブなどで情報が後からでも見返せるもの' },
    { key: 'mania',        label: '上級編', color: 'cyan',    stars: 3, desc: 'ようこそ沼へ', guide: '特定のメンバーに関するもの' },
  ],

  // 本日の問題（その日限りのお題）。ストックがこの数「以下」だとグレーアウト。
  daily: { label: '本日の問題', color: 'navy', desc: 'タイムリーな話題', guide: '一過性の話題', minStock: 3 },

  // WA王決定戦（1週間限定イベント）
  // enabled: false の間は、トップのバナーがグレーアウトして中に入れません。
  // 期間中だけ公開したいので、公開の準備が整ったら enabled: true にします。
  waking: {
    enabled: true,               // ← 公開するとき true にする
    label: 'WA王決定戦',
    start: '2026-08-24',         // 公開開始の日
    startTime: '21:00',          // 公開開始の時刻（この時刻から挑戦できる）
    end:   '2026-08-31',         // 公開終了（この日の終わり＝9/1の0時まで）
    cutoff: '2026-08-24',        // この日より前に作られた問題が出題対象（＝8/23まで）
    // 出題数。null にすると対象の問題を「全問」出す。
    // 数字を入れると、その数だけランダムに選んで出題する。
    questionCount: null,
    minutes: 45,                 // 想定所要時間（分）
  },

  // WA王決定戦アーカイブ（大会終了後、ホーム下部から入れる常設ページ）
  waoArchive: {
    enabled: true,
    label: 'WA王決定戦アーカイブ',
    // 概要説明。ホームやアーカイブページに出ます。
    summary: '2026年8月24日〜8月31日に開催された、WA検定はじめての大会。'
           + '8月23日までに作られた全251問を、ランダムな順で一発勝負。'
           + 'やり直しなし・途中でやめたらそこで終了というルールで、初代WA王を決めました。',
    // ランダムマッチ／タイムマッチで選べる問題数
    counts: [10, 50, 100, 251],
    // タイムマッチ：不正解1問につき加算される秒数
    timePenaltySec: 60,
    // 1日にポイントが入る問題数の上限（翌日0時にリセット）。
    // 0 にすると上限なし。数字を入れるとその問題数までになる。
    //
    // このアプリの狙いは「定期的にログインする」「たまに作問する」
    // 「リアクションする」ことなので、アーカイブの周回でそこが霞まないようにしている。
    // 目安：50問＝約80pt（普段の1日の3倍ほど）。251問だと約400pt＝15倍になり、
    //       ログインや作問の重みが消えてしまう。
    dailyPointCap: 50,
    // テーマソング（YouTubeの限定公開URL）。空にすると欄ごと非表示になります。
    themeSongUrl: 'https://youtu.be/H3deBh_mBzI',
    themeSongTitle: 'WA王決定戦 テーマソング',
  },

  // シェア文につけるハッシュタグ（# は不要）
  shareHashtag: 'wa検定',

  // オーナーアカウント（全員の問題を閲覧できる特別な権限）。
  // 「@ユーザー名@サーバー」の形式で追加します。複数人OK。
  owners: ['@lachi@wa-community.xsns.jp'],

  // ポイントの締め日。この日時より前のぶんは legacy_points に凍結済みで、
  // それ以降だけを新しいルールで計算します（supabase/migrate_freeze_points.sql）。
  // null にすると凍結を使わず、全期間を今のルールで計算します。
  pointsFrozenAt: '2026-09-12T00:00:00+09:00',

  // 総合ランキングの配点（ここの数字を変えれば重み付けを調整できます）
  points: {
    login: 1,            // ログイン（1日1回・基本点）
    loginBonus: { 2: 2, 3: 3 }, // 連続N日ちょうどのボーナス（基本点に加算）
    loginEvery5: 10,     // 連続5日以降、5の倍数日ごとに追加（5,10,15…日目）
    loginEvery30: 30,    // 連続30日ごとの達成ボーナス（30,60,90…日目）
    // クイズのポイントは「その問題をはじめて解いたとき」の1回だけ入ります。
    // 2回目以降は何度解いても0。＝未挑戦の問題がある限り、1日の上限はありません。
    solve: 1,            // クイズを1問解く（初挑戦のみ）
    correct: 1,          // 正解ボーナス（初回の解答が正解だったとき）
    create: 10,          // 作問（1問作る）
    comment: 2,          // コメントを書く
    commentReceived: 3,  // 自分の問題にコメントが付く
    // リアクションは種類を問わず対象（♥でも🤣でも、どの絵文字でも）。
    // 1つの問題につき1人1つまで数えます。
    goodGiven: 1,        // リアクションを押す
    goodReceived: 5,     // 自分の問題にリアクションが付く
    decisionBattle: 100, // WA王決定戦を完走（8/24〜8/31限定・実装時に使用）
  },
};
