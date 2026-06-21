-- Upgrade friendships to request/accept model.
-- Row = directional request: user_id (requester) -> friend_id (target), status pending|accepted.
-- Run once in Supabase SQL Editor.

alter table public.friendships add column if not exists status text not null default 'pending';

-- Existing rows were instant one-way adds → treat them as accepted.
update public.friendships set status = 'accepted' where status = 'pending';

-- Both sides can see the row (so the target sees incoming requests).
drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships
  for select using (auth.uid() = user_id or auth.uid() = friend_id);

-- You can only create a request as yourself, to someone else.
drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships
  for insert to authenticated
  with check (auth.uid() = user_id and user_id <> friend_id);

-- Only the target can accept (update status) a request addressed to them.
drop policy if exists friendships_update on public.friendships;
create policy friendships_update on public.friendships
  for update to authenticated
  using (auth.uid() = friend_id)
  with check (auth.uid() = friend_id);

-- Either side can remove (cancel / decline / unfriend).
drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships
  for delete using (auth.uid() = user_id or auth.uid() = friend_id);

notify pgrst, 'reload schema';
