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

-- 任意の参考URL
alter table questions add column if not exists link_url text;

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

-- 👍 グッド
create table if not exists goods (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references questions(id) on delete cascade,
  user_handle text not null, created_at timestamptz default now(),
  unique (question_id, user_handle)
);
alter table goods enable row level security;
drop policy if exists "read goods" on goods;
create policy "read goods" on goods for select using (true);
drop policy if exists "insert goods" on goods;
create policy "insert goods" on goods for insert with check (true);
drop policy if exists "delete goods" on goods;
create policy "delete goods" on goods for delete using (true);

-- ♥ ハート反応：goods に種類(kind)を追加（既存データは 🤣＝funny 扱い）
alter table goods add column if not exists kind text not null default 'funny';
-- 1問1ユーザーにつき、種類ごとに1回まで（🤣と♥は別々に押せる）
alter table goods drop constraint if exists goods_question_id_user_handle_key;
alter table goods drop constraint if exists goods_question_id_user_handle_kind_key;
alter table goods add constraint goods_question_id_user_handle_kind_key unique (question_id, user_handle, kind);

-- ユーザーのアイコン（ランキングやコメントに顔を出すため）
-- ログインしたときに、その人の名前とアイコンURLを保存します。
create table if not exists profiles (
  user_handle text primary key,
  user_name   text,
  avatar_url  text,
  updated_at  timestamptz default now()
);
alter table profiles enable row level security;
drop policy if exists "read profiles" on profiles;
create policy "read profiles" on profiles for select using (true);
drop policy if exists "insert profiles" on profiles;
create policy "insert profiles" on profiles for insert with check (true);
drop policy if exists "update profiles" on profiles;
create policy "update profiles" on profiles for update using (true) with check (true);

-- コメントの編集を許可（「新着コメント → 送信」から自分のコメントを書き直せるように）
-- ※「自分のコメントだけ」の判定はアプリ側で行っています（認証が Misskey 側のため）
drop policy if exists "update comments" on comments;
create policy "update comments" on comments for update using (true) with check (true);

-- ============================================================
--  WA王決定戦（1週間限定イベント）
--  wao_entries：1人1行だけ。挑戦を始めた時点で作られる（＝1回きりの管理）
--  wao_answers：1問ごとの正誤。同点だったときの順位付けに使う
-- ============================================================
create table if not exists wao_entries (
  user_handle text primary key,               -- @user@host（1人1行＝1回きり）
  user_name   text,
  total       int  not null default 0,        -- 出題した問題数
  answered    int  not null default 0,        -- 実際に答えた数（途中でやめた場合は少なくなる）
  correct     int  not null default 0,        -- 正解数
  finished    boolean not null default false, -- 最後まで終えたか
  started_at  timestamptz default now(),
  finished_at timestamptz
);
create table if not exists wao_answers (
  id          uuid primary key default gen_random_uuid(),
  user_handle text not null,
  question_id uuid references questions(id) on delete cascade,
  is_correct  boolean not null,
  created_at  timestamptz default now(),
  unique (user_handle, question_id)
);
create index if not exists idx_wao_answers_user on wao_answers(user_handle);
create index if not exists idx_wao_answers_q    on wao_answers(question_id);

alter table wao_entries enable row level security;
alter table wao_answers enable row level security;
drop policy if exists "read wao_entries" on wao_entries;
create policy "read wao_entries" on wao_entries for select using (true);
drop policy if exists "insert wao_entries" on wao_entries;
create policy "insert wao_entries" on wao_entries for insert with check (true);
drop policy if exists "update wao_entries" on wao_entries;
create policy "update wao_entries" on wao_entries for update using (true) with check (true);
drop policy if exists "read wao_answers" on wao_answers;
create policy "read wao_answers" on wao_answers for select using (true);
drop policy if exists "insert wao_answers" on wao_answers;
create policy "insert wao_answers" on wao_answers for insert with check (true);
drop policy if exists "update wao_answers" on wao_answers;
create policy "update wao_answers" on wao_answers for update using (true) with check (true);

-- ===== ここまで =====
