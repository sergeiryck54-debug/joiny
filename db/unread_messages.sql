-- Unread chat message counters. Per-user "last read" marker per event + RPCs to
-- mark a chat read and to fetch unread counts for all events the user joined.
-- Run once in Supabase SQL Editor.

-- 1) Per-user, per-event last-read timestamp.
create table if not exists public.event_reads (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  event_id     uuid        not null references public.events(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
alter table public.event_reads enable row level security;

drop policy if exists event_reads_select on public.event_reads;
create policy event_reads_select on public.event_reads
  for select using (auth.uid() = user_id);

drop policy if exists event_reads_insert on public.event_reads;
create policy event_reads_insert on public.event_reads
  for insert with check (auth.uid() = user_id);

drop policy if exists event_reads_update on public.event_reads;
create policy event_reads_update on public.event_reads
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2) Mark the current user's chat for an event as read up to "now".
create or replace function public.mark_event_read(p_event_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  insert into event_reads (user_id, event_id, last_read_at)
  values (v_user, p_event_id, now())
  on conflict (user_id, event_id) do update set last_read_at = now();
end;
$$;
grant execute on function public.mark_event_read(uuid) to authenticated;

-- 3) Unread counts for every event the current user joined that has unread
--    messages from *other* people. Returns event meta so the client can render
--    badges and the "unread chats" list without extra round-trips.
create or replace function public.unread_counts()
returns table (event_id uuid, title text, emoji text, unread integer, last_at timestamptz)
language sql security definer set search_path = public
as $$
  select e.id, e.title, e.emoji, count(m.id)::int, max(m.created_at)
  from event_participants ep
  join events e on e.id = ep.event_id
  left join event_reads r
    on r.user_id = ep.user_id and r.event_id = ep.event_id
  join event_messages m
    on m.event_id = ep.event_id
   and m.user_id <> ep.user_id
   and m.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)
  where ep.user_id = auth.uid()
  group by e.id, e.title, e.emoji
  having count(m.id) > 0;
$$;
grant execute on function public.unread_counts() to authenticated;

-- 4) Stream friend requests live so the client can buzz on a new one.
--    (event_messages is already in the realtime publication.)
do $$
begin
  alter publication supabase_realtime add table public.friendships;
exception when others then null;  -- already added → ignore
end $$;

notify pgrst, 'reload schema';
