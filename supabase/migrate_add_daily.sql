-- ============================================================
--  マイグレーション：「本日の問題」用の出題予定日を追加
--  ------------------------------------------------------------
--  ホームの「本日の問題」機能に必要です。すでにテーブル作成済みの
--  人は、これを SQL Editor で1回だけ実行してください。
--  既存の問題データはそのまま残ります（通常問題は scheduled_date=NULL）。
-- ============================================================
alter table questions add column if not exists scheduled_date date;
create index if not exists idx_questions_sched on questions(scheduled_date);
