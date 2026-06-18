-- Likes for feed posts — persist who liked what + keep posts.likes counter in sync.
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.

-- 1) Who liked which post
create table if not exists public.post_likes (
  post_id    uuid        not null references public.posts(id) on delete cascade,
  user_id    uuid        not null references auth.users(id)   on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- 2) Row Level Security: anyone can read, but you may only like/unlike as yourself
alter table public.post_likes enable row level security;

drop policy if exists post_likes_select on public.post_likes;
create policy post_likes_select on public.post_likes
  for select using (true);

drop policy if exists post_likes_insert on public.post_likes;
create policy post_likes_insert on public.post_likes
  for insert with check (auth.uid() = user_id);

drop policy if exists post_likes_delete on public.post_likes;
create policy post_likes_delete on public.post_likes
  for delete using (auth.uid() = user_id);

-- 3) Atomic toggle: flips the like for the current user and updates posts.likes.
--    Returns the new state so the client can reconcile.
create or replace function public.toggle_like(p_post_id uuid)
returns table (liked boolean, likes integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_exists boolean;
  v_likes  integer;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select exists(
    select 1 from post_likes where post_id = p_post_id and user_id = v_user
  ) into v_exists;

  if v_exists then
    delete from post_likes where post_id = p_post_id and user_id = v_user;
    update posts set likes = greatest(0, coalesce(likes, 0) - 1)
      where id = p_post_id returning likes into v_likes;
    return query select false, coalesce(v_likes, 0);
  else
    insert into post_likes (post_id, user_id) values (p_post_id, v_user);
    update posts set likes = coalesce(likes, 0) + 1
      where id = p_post_id returning likes into v_likes;
    return query select true, coalesce(v_likes, 0);
  end if;
end;
$$;

grant execute on function public.toggle_like(uuid) to authenticated;
