-- ============================================================
--  コメントへのリアクション
--  ------------------------------------------------------------
--  1つのコメントにつき、1人1つまで。押し直すと差し替わります。
--  絵文字はそのまま kind に入ります（'❤️' や '👏' など）。
-- ============================================================
create table if not exists comment_reactions (
  id          uuid primary key default gen_random_uuid(),
  comment_id  uuid references comments(id) on delete cascade,
  user_handle text not null,
  user_name   text,
  kind        text not null,
  created_at  timestamptz default now(),
  unique (comment_id, user_handle)
);
create index if not exists idx_cmt_react_c on comment_reactions(comment_id);

alter table comment_reactions enable row level security;
drop policy if exists "read comment_reactions" on comment_reactions;
create policy "read comment_reactions" on comment_reactions for select using (true);
drop policy if exists "insert comment_reactions" on comment_reactions;
create policy "insert comment_reactions" on comment_reactions for insert with check (true);
drop policy if exists "update comment_reactions" on comment_reactions;
create policy "update comment_reactions" on comment_reactions for update using (true) with check (true);
drop policy if exists "delete comment_reactions" on comment_reactions;
create policy "delete comment_reactions" on comment_reactions for delete using (true);
