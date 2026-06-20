-- Human-readable event date/time (free text, e.g. "Завтра в 18:00"). Run once.
alter table public.events add column if not exists starts_at text;
notify pgrst, 'reload schema';
