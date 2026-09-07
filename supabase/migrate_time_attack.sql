-- ============================================================
--  タイムマッチ（WA王決定戦アーカイブ）の記録テーブル
--  Supabase → SQL Editor に貼り付けて Run。何度実行しても安全です。
-- ============================================================
create table if not exists time_attack (
  id          uuid primary key default gen_random_uuid(),
  user_handle text not null,
  user_name   text,
  questions   int     not null,   -- 10 / 50 / 100 / 251
  seconds     numeric not null,   -- ペナルティ込みの記録タイム
  raw_seconds numeric not null,   -- 実際にかかった時間
  wrong       int     not null,   -- 不正解の数
  created_at  timestamptz default now()
);
create index if not exists idx_time_attack_q on time_attack(questions, seconds);

alter table time_attack enable row level security;
drop policy if exists "read time_attack" on time_attack;
create policy "read time_attack" on time_attack for select using (true);
drop policy if exists "insert time_attack" on time_attack;
create policy "insert time_attack" on time_attack for insert with check (true);
-- 記録は書き換え・削除できません（あとから縮められないように）。
-- 消す必要が出たときは Supabase の管理画面から。
