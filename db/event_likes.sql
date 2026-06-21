-- Likes for events (mirrors post likes). Run once in Supabase SQL Editor.

alter table public.events add column if not exists likes integer not null default 0;

create table if not exists public.event_likes (
  event_id   uuid        not null references public.events(id) on delete cascade,
  user_id    uuid        not null references auth.users(id)    on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.event_likes enable row level security;

drop policy if exists event_likes_select on public.event_likes;
create policy event_likes_select on public.event_likes for select using (true);
drop policy if exists event_likes_insert on public.event_likes;
create policy event_likes_insert on public.event_likes for insert with check (auth.uid() = user_id);
drop policy if exists event_likes_delete on public.event_likes;
create policy event_likes_delete on public.event_likes for delete using (auth.uid() = user_id);

create or replace function public.toggle_event_like(p_event_id uuid)
returns table (liked boolean, likes integer)
language plpgsql security definer set search_path = public
as $$
declare v_user uuid := auth.uid(); v_exists boolean; v_likes integer;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select exists(select 1 from event_likes where event_id = p_event_id and user_id = v_user) into v_exists;
  if v_exists then
    delete from event_likes where event_id = p_event_id and user_id = v_user;
    update events set likes = greatest(0, coalesce(events.likes, 0) - 1)
      where events.id = p_event_id returning events.likes into v_likes;
    return query select false, coalesce(v_likes, 0);
  else
    insert into event_likes (event_id, user_id) values (p_event_id, v_user);
    update events set likes = coalesce(events.likes, 0) + 1
      where events.id = p_event_id returning events.likes into v_likes;
    return query select true, coalesce(v_likes, 0);
  end if;
end;
$$;
grant execute on function public.toggle_event_like(uuid) to authenticated;
