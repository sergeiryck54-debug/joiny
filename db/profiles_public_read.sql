-- Allow reading other users' public profiles (name, avatar, bio, city, interests)
-- so event cards and creator profile pages can show the organizer.
-- The profiles table has no email/sensitive columns. Run once.

drop policy if exists profiles_public_read on public.profiles;
create policy profiles_public_read on public.profiles
  for select using (true);

notify pgrst, 'reload schema';
