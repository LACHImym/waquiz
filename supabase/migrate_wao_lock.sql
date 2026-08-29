-- ============================================================
--  WA王決定戦：記録を書き換えられないようにする（開催中でも安全に実行できます）
--  ------------------------------------------------------------
--  下の「ここから」～「ここまで」をコピーして
--  Supabase → SQL Editor に貼り付け →「Run」。
--
--  ★ いま挑戦している人への影響はありません。
--     「まだ完走していない人が、1回だけ結果を書き込む」ことは今までどおりできます。
--     禁止されるのは「完走した後の書き換え」と「記録を消してやり直すこと」だけです。
-- ============================================================
-- ===== ここから =====

-- ------------------------------------------------------------
-- 1) 挑戦の開始（insert）は「0点・未完走」でしか作れないようにする
--    → いきなり「251問正解・完走ずみ」の行を作ることはできない
-- ------------------------------------------------------------
drop policy if exists "insert wao_entries" on wao_entries;
create policy "insert wao_entries" on wao_entries for insert
  with check (finished = false and correct = 0 and answered = 0);

-- ------------------------------------------------------------
-- 2) 結果の書き込み（update）は「未完走 → 完走」の一方通行だけ
--    → 一度完走したら、本人にも他人にも二度と書き換えられない
-- ------------------------------------------------------------
drop policy if exists "update wao_entries" on wao_entries;
create policy "update wao_entries" on wao_entries for update
  using      (finished = false)
  with check (finished = true);

-- ------------------------------------------------------------
-- 3) 記録の削除を禁止する
--    → 自分の行を消して何度でも挑戦する、という抜け道をふさぐ
--    ※ どうしても消す必要が出たときは、Supabase の管理画面
--       （Table Editor）から消してください。管理画面はRLSの対象外です。
-- ------------------------------------------------------------
drop policy if exists "delete wao_entries" on wao_entries;
drop policy if exists "delete wao_answers" on wao_answers;

-- ------------------------------------------------------------
-- 4) 1問ごとの解答記録も、完走したら追加・書き換えできないようにする
--    → これが「申告された正解数」を後から検算するための証拠になります
-- ------------------------------------------------------------
drop policy if exists "insert wao_answers" on wao_answers;
create policy "insert wao_answers" on wao_answers for insert
  with check (exists (
    select 1 from wao_entries e
    where e.user_handle = wao_answers.user_handle and e.finished = false));

drop policy if exists "update wao_answers" on wao_answers;
create policy "update wao_answers" on wao_answers for update
  using (exists (
    select 1 from wao_entries e
    where e.user_handle = wao_answers.user_handle and e.finished = false))
  with check (true);

-- ===== ここまで =====

-- ------------------------------------------------------------
-- おまけ：申告された正解数と、実際の解答記録が合っているかの検算
--   （アプリのオーナー画面にも出ますが、SQLでも確認できます）
-- ------------------------------------------------------------
-- select e.user_handle, e.user_name,
--        e.correct as 申告, count(a.*) filter (where a.is_correct) as 実際,
--        e.answered as 申告回答数, count(a.*) as 実際の回答数
--   from wao_entries e left join wao_answers a on a.user_handle = e.user_handle
--  group by e.user_handle, e.user_name, e.correct, e.answered
--  order by e.correct desc;

-- ------------------------------------------------------------
-- 【元に戻したくなったとき】
--   もし開催中に何か不具合が出たら、下の6行のコメント（--）を外して
--   実行すれば、制限を外して元の状態に戻せます。
-- ------------------------------------------------------------
-- drop policy if exists "insert wao_entries" on wao_entries;
-- create policy "insert wao_entries" on wao_entries for insert with check (true);
-- drop policy if exists "update wao_entries" on wao_entries;
-- create policy "update wao_entries" on wao_entries for update using (true) with check (true);
-- drop policy if exists "insert wao_answers" on wao_answers;
-- create policy "insert wao_answers" on wao_answers for insert with check (true);
-- drop policy if exists "update wao_answers" on wao_answers;
-- create policy "update wao_answers" on wao_answers for update using (true) with check (true);
