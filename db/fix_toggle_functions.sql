-- Fix: "column reference is ambiguous" in toggle_join / toggle_like.
-- The RETURNS TABLE out-columns (people / likes) collided with the table columns
-- inside the UPDATE. Qualify every column reference with its table name.
-- Run once in Supabase SQL Editor.

create or replace function public.toggle_join(p_event_id uuid)
returns table (joined boolean, people integer)
language plpgsql security definer set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_exists boolean;
  v_people integer;
  v_max    integer;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select exists(
    select 1 from event_participants where event_id = p_event_id and user_id = v_user
  ) into v_exists;

  if v_exists then
    delete from event_participants where event_id = p_event_id and user_id = v_user;
    update events set people = greatest(0, coalesce(events.people, 0) - 1)
      where events.id = p_event_id returning events.people into v_people;
    return query select false, coalesce(v_people, 0);
  else
    select events.people, events.max_people into v_people, v_max
      from events where events.id = p_event_id for update;
    if v_max is not null and coalesce(v_people, 0) >= v_max then
      raise exception 'event is full';
    end if;
    insert into event_participants (event_id, user_id) values (p_event_id, v_user);
    update events set people = coalesce(events.people, 0) + 1
      where events.id = p_event_id returning events.people into v_people;
    return query select true, coalesce(v_people, 0);
  end if;
end;
$$;

create or replace function public.toggle_like(p_post_id uuid)
returns table (liked boolean, likes integer)
language plpgsql security definer set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_exists boolean;
  v_likes  integer;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select exists(
    select 1 from post_likes where post_id = p_post_id and user_id = v_user
  ) into v_exists;

  if v_exists then
    delete from post_likes where post_id = p_post_id and user_id = v_user;
    update posts set likes = greatest(0, coalesce(posts.likes, 0) - 1)
      where posts.id = p_post_id returning posts.likes into v_likes;
    return query select false, coalesce(v_likes, 0);
  else
    insert into post_likes (post_id, user_id) values (p_post_id, v_user);
    update posts set likes = coalesce(posts.likes, 0) + 1
      where posts.id = p_post_id returning posts.likes into v_likes;
    return query select true, coalesce(v_likes, 0);
  end if;
end;
$$;
