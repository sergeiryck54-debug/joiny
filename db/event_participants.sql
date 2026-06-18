-- Event participation — persist who joined which event + keep events.people in sync,
-- enforcing the max_people capacity. Run once in Supabase SQL Editor.

-- 1) Who joined which event
create table if not exists public.event_participants (
  event_id   uuid        not null references public.events(id) on delete cascade,
  user_id    uuid        not null references auth.users(id)    on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- 2) Row Level Security: anyone can read, you may only join/leave as yourself
alter table public.event_participants enable row level security;

drop policy if exists event_participants_select on public.event_participants;
create policy event_participants_select on public.event_participants
  for select using (true);

drop policy if exists event_participants_insert on public.event_participants;
create policy event_participants_insert on public.event_participants
  for insert with check (auth.uid() = user_id);

drop policy if exists event_participants_delete on public.event_participants;
create policy event_participants_delete on public.event_participants
  for delete using (auth.uid() = user_id);

-- 3) Atomic join/leave: flips participation for the current user, updates events.people,
--    and refuses to join a full event. Returns the new state for the client to reconcile.
create or replace function public.toggle_join(p_event_id uuid)
returns table (joined boolean, people integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_exists boolean;
  v_people integer;
  v_max    integer;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select exists(
    select 1 from event_participants where event_id = p_event_id and user_id = v_user
  ) into v_exists;

  if v_exists then
    delete from event_participants where event_id = p_event_id and user_id = v_user;
    update events set people = greatest(0, coalesce(people, 0) - 1)
      where id = p_event_id returning people into v_people;
    return query select false, coalesce(v_people, 0);
  else
    -- lock the row and check capacity
    select people, max_people into v_people, v_max
      from events where id = p_event_id for update;
    if v_max is not null and coalesce(v_people, 0) >= v_max then
      raise exception 'event is full';
    end if;
    insert into event_participants (event_id, user_id) values (p_event_id, v_user);
    update events set people = coalesce(people, 0) + 1
      where id = p_event_id returning people into v_people;
    return query select true, coalesce(v_people, 0);
  end if;
end;
$$;

grant execute on function public.toggle_join(uuid) to authenticated;
