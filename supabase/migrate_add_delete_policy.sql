-- ============================================================
--  マイグレーション：削除を許可する設定を追加
--  ------------------------------------------------------------
--  これを実行しないと、アプリの削除ボタンやSQLからの削除が
--  効かないことがあります。すでにテーブル作成済みの人は
--  1回だけ実行してください。
-- ============================================================
drop policy if exists "delete questions" on questions;
create policy "delete questions" on questions for delete using (true);
drop policy if exists "delete comments" on comments;
create policy "delete comments" on comments for delete using (true);
drop policy if exists "delete history" on history;
create policy "delete history" on history for delete using (true);
