-- ============================================================
--  ポイントの締め（2026-09-11 の終わり＝9/12 0時 時点で凍結）
--  ------------------------------------------------------------
--  これまでのポイントを legacy_points に保存します。
--  以降、アプリは「凍結した点 ＋ 締め日より後のぶん（新ルール）」で計算します。
--
--  ★ 9/12 0時（日本時間）を過ぎてから実行してください。
--    それより前に実行すると、11日ぶんが締め日前として確定してしまいます。
--  ★ 何度実行しても同じ結果になります（締め日で区切っているため）。
-- ============================================================
-- ===== ここから =====

create table if not exists legacy_points (
  user_handle text primary key,
  user_name   text,
  points      int  not null,
  frozen_at   timestamptz not null default now()
);
alter table legacy_points enable row level security;
drop policy if exists "read legacy_points" on legacy_points;
create policy "read legacy_points" on legacy_points for select using (true);

-- 締め日時点の持ち点を計算して入れ直す
truncate legacy_points;

insert into legacy_points (user_handle, user_name, points)
with cut as (select timestamptz '2026-09-12 00:00:00+09' as t,
                    date        '2026-09-12'             as d),
-- 問題→作成者（コメント・👍の「受け取り」用）
qa as (select id, created_by from questions),

-- ログインの連続日数から加点を出す
g as (
  select l.user_handle, l.user_name, l.login_date,
         l.login_date - (row_number() over (partition by l.user_handle order by l.login_date))::int as grp
  from logins l, cut where l.login_date < cut.d
),
dn as (
  select user_handle, user_name,
         row_number() over (partition by user_handle, grp order by login_date) as day_no
  from g
),

-- 発生源ごとの点を積み上げる
parts as (
  -- ログイン（1pt ＋ 2日目+2 / 3日目+3 / 5の倍数日+5）
  select user_handle as handle, max(user_name) as name,
         sum(1 + case day_no when 2 then 2 when 3 then 3 else 0 end
               + case when day_no >= 5 and day_no % 5 = 0 then 5 else 0 end)::int as pt
  from dn group by user_handle

  union all
  -- 作問（1問10pt）
  select created_by, max(created_by_name), (count(*) * 10)::int
  from questions, cut where created_at < cut.t group by created_by

  union all
  -- クイズ（1問1pt ＋ 正解1pt）※ 締め日までは旧ルール（全件）で数える
  select user_handle, max(user_name),
         (count(*) + count(*) filter (where is_correct))::int
  from answers, cut where created_at < cut.t group by user_handle

  union all
  -- コメントを書く（2pt）
  select author, max(author_name), (count(*) * 2)::int
  from comments, cut where created_at < cut.t group by author

  union all
  -- 自分の問題にコメントが付く（3pt）
  select qa.created_by, null, (count(*) * 3)::int
  from comments c join qa on qa.id = c.question_id, cut
  where c.created_at < cut.t and qa.created_by <> c.author
  group by qa.created_by

  union all
  -- 🤣を押す（1pt）
  select user_handle, null, count(*)::int
  from goods, cut where kind = 'funny' and created_at < cut.t group by user_handle

  union all
  -- 自分の問題が🤣される（5pt）
  select qa.created_by, null, (count(*) * 5)::int
  from goods g2 join qa on qa.id = g2.question_id, cut
  where g2.kind = 'funny' and g2.created_at < cut.t and qa.created_by <> g2.user_handle
  group by qa.created_by

  union all
  -- WA王決定戦を完走（100pt）
  select user_handle, max(user_name), (count(*) * 100)::int
  from wao_entries where finished group by user_handle
)
select handle, max(name), sum(pt)::int
from parts where handle is not null
group by handle;

-- ===== ここまで =====

-- 確認用
-- select user_name, points from legacy_points order by points desc limit 20;
