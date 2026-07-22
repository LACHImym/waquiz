-- ============================================================
--  オンラインコミュニティは クイズ — Supabase スキーマ
--  使い方：Supabase ダッシュボード → 左メニュー「SQL Editor」→
--          このファイルの中身を全部貼り付けて「Run」。
-- ============================================================

-- ---- 問題 ----
create table if not exists questions (
  id              uuid primary key default gen_random_uuid(),
  rank            text not null default 'beginner',   -- beginner / intermediate / mania
  body            text not null,                       -- 問題文
  choices         jsonb not null,                      -- ["選択肢1","選択肢2","選択肢3","選択肢4"]
  correct_index   int  not null,                       -- 正解の番号（0〜3）
  explanation     text default '',                     -- 解答解説
  created_by      text not null,                       -- @user@host
  created_by_name text,
  updated_by      text,
  updated_by_name text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ---- コメント / 補足 ----
create table if not exists comments (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid references questions(id) on delete cascade,
  kind         text not null default 'comment',        -- comment / supplement
  body         text not null,
  author       text not null,                           -- @user@host
  author_name  text,
  created_at   timestamptz default now()
);

-- ---- 編集履歴（誰が作った・誰が修正した） ----
create table if not exists history (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid references questions(id) on delete cascade,
  action       text not null,                           -- create / edit
  actor        text not null,
  actor_name   text,
  detail       text,
  created_at   timestamptz default now()
);

create index if not exists idx_questions_rank on questions(rank);
create index if not exists idx_comments_qid   on comments(question_id);
create index if not exists idx_history_qid     on history(question_id);

-- ============================================================
--  RLS（行レベルセキュリティ）
--  ※ 認証は Misskey 側で行い、Supabase では anon キーで読み書きします。
--    内輪コミュニティ向けの「anon キーを知っていれば読み書きOK」設定です。
--    URL とキーを外部に広く公開しない運用を前提にしています。
--    より厳密にしたい場合は README の「運用メモ」を参照。
-- ============================================================
alter table questions enable row level security;
alter table comments  enable row level security;
alter table history   enable row level security;

-- 読み取り：誰でも可
create policy "read questions" on questions for select using (true);
create policy "read comments"  on comments  for select using (true);
create policy "read history"   on history   for select using (true);

-- 書き込み：anon（＝このアプリ）から可
create policy "insert questions" on questions for insert with check (true);
create policy "update questions" on questions for update using (true) with check (true);
create policy "insert comments"  on comments  for insert with check (true);
create policy "insert history"   on history   for insert with check (true);
