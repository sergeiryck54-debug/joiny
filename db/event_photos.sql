-- Event photos + photo reports. Run once in Supabase SQL Editor.

-- 1) Public bucket "event-photos" (files live under "<userId>/..." so only the owner can write)
insert into storage.buckets (id, name, public)
values ('event-photos', 'event-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "event_photos_public_read" on storage.objects;
create policy "event_photos_public_read" on storage.objects
  for select using (bucket_id = 'event-photos');

drop policy if exists "event_photos_insert_own" on storage.objects;
create policy "event_photos_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "event_photos_update_own" on storage.objects;
create policy "event_photos_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'event-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'event-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "event_photos_delete_own" on storage.objects;
create policy "event_photos_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'event-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- 2) Column for the event photo URL
alter table public.events add column if not exists photo_url text;

-- 3) Creator-only replace/clear of an event's photo (events has no RLS; guard via definer)
create or replace function public.set_event_photo(p_event_id uuid, p_url text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_owner uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select creator_id into v_owner from events where id = p_event_id;
  if v_owner is null or v_owner <> v_user then raise exception 'not allowed'; end if;
  update events set photo_url = p_url where id = p_event_id;
end;
$$;
grant execute on function public.set_event_photo(uuid, text) to authenticated;

-- 4) Photo reports (anyone signed-in can report; only inserts, no read for users)
create table if not exists public.photo_reports (
  id          uuid        primary key default gen_random_uuid(),
  reporter_id uuid        not null references auth.users(id) on delete cascade,
  event_id    uuid        references public.events(id) on delete set null,
  photo_url   text,
  reason      text,
  created_at  timestamptz not null default now()
);
alter table public.photo_reports enable row level security;

drop policy if exists photo_reports_insert on public.photo_reports;
create policy photo_reports_insert on public.photo_reports
  for insert to authenticated with check (auth.uid() = reporter_id);

notify pgrst, 'reload schema';
