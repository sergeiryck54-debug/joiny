-- Store the human-readable address the creator typed, alongside the geocoded coords.
-- Run once in Supabase SQL Editor.
alter table public.events add column if not exists location text;
