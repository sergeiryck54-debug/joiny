-- Let event creators delete their own events. Run once in Supabase SQL Editor.

-- 1) Track who created each event (existing/seeded events stay null = not deletable)
alter table public.events add column if not exists creator_id uuid
  references auth.users(id) on delete set null;

-- 2) Creator-only delete via a SECURITY DEFINER function (no RLS changes needed,
--    so existing select/insert/join behaviour is untouched). Cascades to
--    event_participants and event_messages via their FK on delete cascade.
create or replace function public.delete_event(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_owner uuid;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select creator_id into v_owner from events where id = p_event_id;
  if v_owner is null or v_owner <> v_user then
    raise exception 'not allowed';
  end if;
  delete from events where id = p_event_id;
  return true;
end;
$$;

grant execute on function public.delete_event(uuid) to authenticated;
