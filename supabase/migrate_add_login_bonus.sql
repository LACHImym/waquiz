-- ============================================================
--  マイグレーション：ログインボーナス（連続ログイン）用テーブル
--  ------------------------------------------------------------
--  連続ログイン日数の記録・表示に必要です。すでにテーブル作成済みの
--  人は、これを SQL Editor で1回だけ実行してください。
-- ============================================================
create table if not exists logins (
  id           uuid primary key default gen_random_uuid(),
  user_handle  text not null,
  user_name    text,
  login_date   date not null,
  created_at   timestamptz default now(),
  unique (user_handle, login_date)
);

alter table logins enable row level security;
drop policy if exists "read logins" on logins;
create policy "read logins" on logins for select using (true);
drop policy if exists "insert logins" on logins;
create policy "insert logins" on logins for insert with check (true);
