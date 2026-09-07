-- ============================================================
--  Plan A：正解をブラウザに送らないようにする
--  ------------------------------------------------------------
--  Supabase → SQL Editor に貼り付けて Run。
--  ★ 実行したら、アプリ側も新しいコードに更新されている必要があります
--    （どちらか片方だけだとクイズが動きません）。
--
--  やること：
--   1. 保存済みの選択肢をシャッフルする（いまは choices[0] が必ず正解）
--   2. correct_index と explanation の読み取り権限を外す
--   3. 採点をデータベース側の関数で行う
-- ============================================================
-- ===== ここから =====

-- ------------------------------------------------------------
-- 1) 選択肢のシャッフル（1回だけ実行すれば十分。2回目以降は並びが変わるだけで無害）
--    いまは「先頭が必ず正解」なので、これをやらないと
--    correct_index を隠しても意味がありません。
-- ------------------------------------------------------------
with s as (
  select q.id,
         jsonb_agg(c.val order by c.new_pos)                              as new_choices,
         min(c.new_pos) filter (where c.old_idx = q.correct_index)::int   as new_idx
  from questions q
  cross join lateral (
    select e.value                                as val,
           e.ordinality - 1                       as old_idx,
           row_number() over (order by random()) - 1 as new_pos
    from jsonb_array_elements(q.choices) with ordinality as e(value, ordinality)
  ) c
  where jsonb_typeof(q.choices) = 'array'
  group by q.id, q.correct_index
)
update questions q
   set choices = s.new_choices, correct_index = s.new_idx
  from s
 where s.id = q.id
   and s.new_idx is not null;

-- ------------------------------------------------------------
-- 2) 列単位で読み取りを止める
--    テーブルごと閉じないので、一覧・件数・ランキングはそのまま動きます。
--    anon が読めなくなるのは correct_index と explanation の2列だけ。
-- ------------------------------------------------------------
revoke select on questions from anon;
grant select (
  id, rank, body, choices, link_url, scheduled_date,
  created_by, created_by_name, updated_by, updated_by_name,
  created_at, updated_at
) on questions to anon;

-- 作問・編集・削除は今までどおり（列単位の制限は insert/update には掛けない）
grant insert, update, delete on questions to anon;

-- ------------------------------------------------------------
-- 3) 採点はデータベース側で行う
--    ブラウザは「この問題で、この選択肢を選んだ」とだけ送ります。
--    security definer なので、この関数の中だけが正解を読めます。
-- ------------------------------------------------------------

-- 採点＋答え合わせ（普段のクイズ用。正解と解説を返す）
create or replace function wq_grade(p_id uuid, p_choice text)
returns table (is_correct boolean, correct_choice text, explanation text)
language sql security definer set search_path = public as $$
  select (q.choices ->> q.correct_index) is not distinct from p_choice,
         q.choices ->> q.correct_index,
         coalesce(q.explanation, '')
  from questions q where q.id = p_id;
$$;

-- 採点のみ（大会・タイムマッチ用。正解も解説も返さない）
create or replace function wq_grade_quiet(p_id uuid, p_choice text)
returns boolean
language sql security definer set search_path = public as $$
  select (q.choices ->> q.correct_index) is not distinct from p_choice
  from questions q where q.id = p_id;
$$;

-- 1問ぶんの正解と解説（自分が答えた問題の振り返り用）
create or replace function wq_reveal(p_id uuid)
returns table (correct_choice text, explanation text)
language sql security definer set search_path = public as $$
  select q.choices ->> q.correct_index, coalesce(q.explanation, '')
  from questions q where q.id = p_id;
$$;

grant execute on function wq_grade(uuid, text)       to anon;
grant execute on function wq_grade_quiet(uuid, text) to anon;
grant execute on function wq_reveal(uuid)            to anon;

-- ===== ここまで =====


-- ============================================================
--  確認用：anon から正解が読めなくなったか
--  （下を実行して permission denied が出れば成功です）
-- ============================================================
-- set role anon;
-- select correct_index from questions limit 1;   -- ← エラーになるのが正しい
-- select id, body, choices from questions limit 1; -- ← これは読めてOK
-- reset role;
