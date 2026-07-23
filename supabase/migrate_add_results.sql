-- ============================================================
--  マイグレーション：成績・ランキング・振り返り用のテーブルを追加
--  ------------------------------------------------------------
--  マイページ（過去の成績／正答数ランキング／直近10問の振り返り）に
--  必要です。すでにテーブル作成済みの人は、これを SQL Editor で
--  1回だけ実行してください。既存の問題データはそのまま残ります。
-- ============================================================

-- 1問ごとの解答記録
create table if not exists answers (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid references questions(id) on delete cascade,
  user_handle  text not null,
  user_name    text,
  is_correct   boolean not null,
  created_at   timestamptz default now()
);

-- クイズ1回分（全5問）の成績
create table if not exists results (
  id           uuid primary key default gen_random_uuid(),
  rank         text not null,
  correct      int  not null,
  total        int  not null,
  user_handle  text not null,
  user_name    text,
  created_at   timestamptz default now()
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
