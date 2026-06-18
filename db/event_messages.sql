-- In-event chat. Only participants of an event can read or post its messages.
-- Run once in Supabase SQL Editor.

create table if not exists public.event_messages (
  id         uuid        primary key default gen_random_uuid(),
  event_id   uuid        not null references public.events(id) on delete cascade,
  user_id    uuid        not null references auth.users(id)    on delete cascade,
  user_name  text,
  text       text        not null,
  created_at timestamptz not null default now()
);

create index if not exists event_messages_event_idx
  on public.event_messages (event_id, created_at);

alter table public.event_messages enable row level security;

-- Read: only if you're a participant of that event
drop policy if exists event_messages_select on public.event_messages;
create policy event_messages_select on public.event_messages
  for select using (
    exists (
      select 1 from public.event_participants ep
      where ep.event_id = event_messages.event_id and ep.user_id = auth.uid()
    )
  );

-- Write: only as yourself, and only if you're a participant
drop policy if exists event_messages_insert on public.event_messages;
create policy event_messages_insert on public.event_messages
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.event_participants ep
      where ep.event_id = event_messages.event_id and ep.user_id = auth.uid()
    )
  );

-- Enable realtime so new messages stream live to clients
do $$
begin
  alter publication supabase_realtime add table public.event_messages;
exception when others then null;  -- already added → ignore
end $$;
