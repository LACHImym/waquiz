-- ============================================================
--  アーカイブ（ランダムマッチ／タイムマッチ）の1日あたり上限
--  ------------------------------------------------------------
--  answers に「どこで解いたか」の列を足します。
--  これで「アーカイブで今日すでに何問ぶんポイントが入ったか」を数えられます。
--  既存のデータはすべて 'quiz'（普段のクイズ）として扱われます。
-- ============================================================
alter table answers add column if not exists source text not null default 'quiz';
create index if not exists idx_answers_src on answers(user_handle, source, created_at);
