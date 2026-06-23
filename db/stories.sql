-- Stories: lightweight ephemeral posts that expire after 24h, optionally linking
-- to an event. Run once in Supabase SQL Editor.

create table if not exists public.stories (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id)    on delete cascade,
  user_name  text,
  avatar_url text,
  emoji      text        not null default '✨',
  title      text        not null,
  event_id   uuid        references public.events(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
-- Optional photo/video for the story (stored in the event-photos bucket).
alter table public.stories add column if not exists media_url text;

create index if not exists stories_expires_idx on public.stories (expires_at);
create index if not exists stories_user_idx on public.stories (user_id, created_at desc);

alter table public.stories enable row level security;

-- Anyone signed in can read stories (the client filters out expired ones).
drop policy if exists stories_select on public.stories;
create policy stories_select on public.stories for select using (true);

-- Create only as yourself.
drop policy if exists stories_insert on public.stories;
create policy stories_insert on public.stories
  for insert to authenticated with check (auth.uid() = user_id);

-- Delete your own.
drop policy if exists stories_delete on public.stories;
create policy stories_delete on public.stories
  for delete using (auth.uid() = user_id);

notify pgrst, 'reload schema';
