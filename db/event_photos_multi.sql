-- Multiple photos per event. The files still live in the existing "event-photos"
-- storage bucket; this table tracks the gallery (order + which event). Run once.

create table if not exists public.event_photos (
  id         uuid        primary key default gen_random_uuid(),
  event_id   uuid        not null references public.events(id) on delete cascade,
  url        text        not null,
  sort       integer     not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists event_photos_event_idx on public.event_photos (event_id, sort);

alter table public.event_photos enable row level security;

-- Anyone can view the gallery
drop policy if exists event_photos_select on public.event_photos;
create policy event_photos_select on public.event_photos
  for select using (true);

-- Only the event's creator can add photos
drop policy if exists event_photos_cinsert on public.event_photos;
create policy event_photos_cinsert on public.event_photos
  for insert to authenticated
  with check (exists (select 1 from public.events e where e.id = event_id and e.creator_id = auth.uid()));

-- Only the event's creator can remove photos
drop policy if exists event_photos_cdelete on public.event_photos;
create policy event_photos_cdelete on public.event_photos
  for delete to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.creator_id = auth.uid()));

notify pgrst, 'reload schema';
