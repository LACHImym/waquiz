-- ============================================================
--  テスト用シードデータ（各ランク5問・計15問）
--  使い方：Supabase → SQL Editor に貼り付けて「Run」。
--  ※ 1回だけ実行してください（複数回実行すると問題が重複します）。
--  ※ 作成者は「テスト」名義です。消したいときは一番下のコメント参照。
-- ============================================================

insert into questions (rank, body, choices, correct_index, created_by, created_by_name, updated_by, updated_by_name) values

-- ===== 入門編 =====
('beginner', '「モナ・リザ」を描いた画家は？',
  '["ミケランジェロ","レオナルド・ダ・ヴィンチ","ラファエロ","フェルメール"]', 1,
  '@test@wa-community.xsns.jp','テスト','@test@wa-community.xsns.jp','テスト'),

('beginner', '光の三原色（RGB）に含まれないのはどれ？',
  '["赤","緑","青","黄"]', 3,
  '@test@wa-community.xsns.jp','テスト','@test@wa-community.xsns.jp','テスト'),

('beginner', '連作「ひまわり」で知られる画家は？',
  '["モネ","ピカソ","ゴッホ","ダリ"]', 2,
  '@test@wa-community.xsns.jp','テスト','@test@wa-community.xsns.jp','テスト'),

('beginner', '色の三原色（CMY）でないのはどれ？',
  '["シアン","マゼンタ","イエロー","グリーン"]', 3,
  '@test@wa-community.xsns.jp','テスト','@test@wa-community.xsns.jp','テスト'),

('beginner', '彫刻「考える人」を制作したのは？',
  '["オーギュスト・ロダン","ミケランジェロ","ブランクーシ","ジャコメッティ"]', 0,
  '@test@wa-community.xsns.jp','テスト','@test@wa-community.xsns.jp','テスト'),

-- ===== 中級 =====
('intermediate', 'バウハウスが最初に設立された都市は？',
  '["ベルリン","デッサウ","ワイマール","ミュンヘン"]', 2,
  '@test@wa-community.xsns.jp','テスト','@test@wa-community.xsns.jp','テスト'),

('intermediate', '「印象・日の出」を描き、印象派の名の由来となった画家は？',
  '["マネ","モネ","ルノワール","ドガ"]', 1,
  '@test@wa-community.xsns.jp','テスト','@test@wa-community.xsns.jp','テスト'),

('intermediate', '浮世絵「神奈川沖浪裏（かながわおきなみうら）」の作者は？',
  '["歌川広重","葛飾北斎","喜多川歌麿","東洲斎写楽"]', 1,
  '@test@wa-community.xsns.jp','テスト','@test@wa-community.xsns.jp','テスト'),

('intermediate', '色相環で「補色」の関係にある組み合わせは？',
  '["赤と青","赤と緑","黄と緑","青と紫"]', 1,
  '@test@wa-community.xsns.jp','テスト','@test@wa-community.xsns.jp','テスト'),

('intermediate', 'ル・コルビュジエが提唱した、人体寸法に基づく比例体系は？',
  '["メートル法","フィボナッチ数列","モデュロール","黄金数"]', 2,
  '@test@wa-community.xsns.jp','テスト','@test@wa-community.xsns.jp','テスト'),

-- ===== 上級 =====
('mania', 'バウハウスの初代校長は誰？',
  '["ミース・ファン・デル・ローエ","ハンネス・マイヤー","ヴァルター・グロピウス","ヨハネス・イッテン"]', 2,
  '@test@wa-community.xsns.jp','テスト','@test@wa-community.xsns.jp','テスト'),

('mania', 'バウハウスの予備課程を担い、著書「色彩の芸術」で知られるのは？',
  '["パウル・クレー","ヨハネス・イッテン","カンディンスキー","モホリ＝ナジ"]', 1,
  '@test@wa-community.xsns.jp','テスト','@test@wa-community.xsns.jp','テスト'),

('mania', '「点と線から面へ」を著し、抽象絵画を理論化した画家は？',
  '["モンドリアン","マレーヴィチ","カンディンスキー","クレー"]', 2,
  '@test@wa-community.xsns.jp','テスト','@test@wa-community.xsns.jp','テスト'),

('mania', 'デ・ステイルの代表画家で、赤・青・黄と黒い格子の抽象で知られるのは？',
  '["テオ・ファン・ドースブルフ","ピート・モンドリアン","ゲリット・リートフェルト","バルト・ファン・デル・レック"]', 1,
  '@test@wa-community.xsns.jp','テスト','@test@wa-community.xsns.jp','テスト'),

('mania', 'ピカソ「ゲルニカ」が主題とした出来事は？',
  '["フランス革命","スペイン内戦での都市無差別爆撃","第一次世界大戦の休戦","ロシア革命"]', 1,
  '@test@wa-community.xsns.jp','テスト','@test@wa-community.xsns.jp','テスト');

-- 履歴（「作成」）もテスト用に付けておく
insert into history (question_id, action, actor, actor_name, detail)
  select id, 'create', '@test@wa-community.xsns.jp', 'テスト', 'テストデータ作成'
  from questions where created_by = '@test@wa-community.xsns.jp';

-- ============================================================
--  テストデータを消したくなったら、以下を SQL Editor で実行：
--    delete from questions where created_by = '@test@wa-community.xsns.jp';
--  （コメント・履歴も自動で一緒に削除されます）
-- ============================================================
