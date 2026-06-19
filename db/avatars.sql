-- Avatars: public Storage bucket + per-user upload policies + profiles.avatar_url.
-- Run once in Supabase SQL Editor.

-- 1) Public bucket "avatars"
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- 2) Policies on storage.objects for this bucket.
--    Files live under "<userId>/..." so a user can only touch their own folder.

-- Public read (bucket is public, but an explicit select policy is good hygiene)
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

-- Upload only as an authenticated user, into your own "<userId>/" folder
drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Replace your own avatar
drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Delete your own avatar
drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3) Where we store the resulting public URL
alter table public.profiles add column if not exists avatar_url text;

-- Refresh API schema cache so avatar_url is visible immediately
notify pgrst, 'reload schema';
