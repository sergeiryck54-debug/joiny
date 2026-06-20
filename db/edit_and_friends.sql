-- 1) Creator-only event edit (events has no RLS; guard via SECURITY DEFINER).
create or replace function public.update_event(
  p_event_id   uuid,
  p_title      text,
  p_category   text,
  p_emoji      text,
  p_location   text,
  p_lat        double precision,
  p_lng        double precision,
  p_max_people integer,
  p_is_now     boolean,
  p_starts_at  text
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_owner uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select creator_id into v_owner from events where id = p_event_id;
  if v_owner is null or v_owner <> v_user then raise exception 'not allowed'; end if;
  update events set
    title = p_title, category = p_category, emoji = p_emoji,
    location = p_location, lat = p_lat, lng = p_lng,
    max_people = p_max_people, is_now = p_is_now, starts_at = p_starts_at
  where id = p_event_id;
end;
$$;
grant execute on function public.update_event(uuid,text,text,text,text,double precision,double precision,integer,boolean,text) to authenticated;

-- 2) Friends (one-way "follow": user_id added friend_id).
create table if not exists public.friendships (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  friend_id  uuid        not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);
alter table public.friendships enable row level security;

drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships
  for select using (auth.uid() = user_id);

drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships
  for insert with check (auth.uid() = user_id and user_id <> friend_id);

drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships
  for delete using (auth.uid() = user_id);

notify pgrst, 'reload schema';
