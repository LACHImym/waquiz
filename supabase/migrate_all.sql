-- ============================================================
--  まとめマイグレーション（これ1本を実行すればOK）
--  ------------------------------------------------------------
--  下の「ここから」～「ここまで」を “ぜんぶ” コピーして
--  Supabase → SQL Editor に貼り付け →「Run」。
--  何回実行しても安全（既存データは消えません）。
-- ============================================================
-- ===== ここから =====

-- 解答解説の列
alter table questions add column if not exists explanation text default '';

-- 本日の問題の出題予定日
alter table questions add column if not exists scheduled_date date;
create index if not exists idx_questions_sched on questions(scheduled_date);

-- 削除の許可
drop policy if exists "delete questions" on questions;
create policy "delete questions" on questions for delete using (true);
drop policy if exists "delete comments" on comments;
create policy "delete comments" on comments for delete using (true);
drop policy if exists "delete history" on history;
create policy "delete history" on history for delete using (true);

-- 成績・ランキング・振り返り
create table if not exists answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references questions(id) on delete cascade,
  user_handle text not null, user_name text,
  is_correct boolean not null, created_at timestamptz default now()
);
create table if not exists results (
  id uuid primary key default gen_random_uuid(),
  rank text not null, correct int not null, total int not null,
  user_handle text not null, user_name text, created_at timestamptz default now()
);
create index if not exists idx_answers_user on answers(user_handle);
create index if not exists idx_results_user on results(user_handle);
alter table answers enable row level security;
alter table results enable row level security;
drop policy if exists "read answers" on answers;
create policy "read answers" on answers for select using (true);
drop policy if exists "insert answers" on answers;
create policy "insert answers" on answers for insert with check (true);
drop policy if exists "read results" on results;
create policy "read results" on results for select using (true);
drop policy if exists "insert results" on results;
create policy "insert results" on results for insert with check (true);

-- ログインボーナス（連続ログイン）
create table if not exists logins (
  id uuid primary key default gen_random_uuid(),
  user_handle text not null, user_name text,
  login_date date not null, created_at timestamptz default now(),
  unique (user_handle, login_date)
);
alter table logins enable row level security;
drop policy if exists "read logins" on logins;
create policy "read logins" on logins for select using (true);
drop policy if exists "insert logins" on logins;
create policy "insert logins" on logins for insert with check (true);

-- ===== ここまで =====
