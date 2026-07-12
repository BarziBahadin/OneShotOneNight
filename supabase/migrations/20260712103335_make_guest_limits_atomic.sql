create or replace function public.find_or_create_guest_atomic(
  p_event_id text,
  p_device_token_hash text,
  p_display_name text,
  p_create boolean
)
returns setof public.guests
language plpgsql
security invoker
set search_path = ''
as $$
declare
  event_row public.events%rowtype;
  guest_row public.guests%rowtype;
begin
  select * into event_row
  from public.events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  select * into guest_row
  from public.guests
  where event_id = p_event_id
    and device_token_hash = p_device_token_hash;

  if found then
    if nullif(btrim(p_display_name), '') is not null
       and left(btrim(p_display_name), 100) <> guest_row.display_name then
      update public.guests
      set display_name = left(btrim(p_display_name), 100),
          last_seen_at = now()
      where id = guest_row.id
      returning * into guest_row;
    end if;
    return next guest_row;
    return;
  end if;

  if not p_create then
    return;
  end if;

  if nullif(btrim(p_display_name), '') is null then
    raise exception 'Guest name is required' using errcode = '22023';
  end if;

  if (select count(*) from public.guests where event_id = p_event_id) >= event_row.max_guests then
    raise exception 'Guest limit reached' using errcode = 'P0001';
  end if;

  insert into public.guests (
    id, event_id, device_token_hash, display_name,
    upload_count, message_count, created_at, last_seen_at, status
  ) values (
    upper(left(replace(gen_random_uuid()::text, '-', ''), 26)),
    p_event_id,
    p_device_token_hash,
    left(btrim(p_display_name), 100),
    0, 0, now(), now(), 'active'
  )
  returning * into guest_row;

  return next guest_row;
end;
$$;

create or replace function public.complete_guest_photo_atomic(
  p_photo_id text,
  p_guest_id text,
  p_upload_token_hash text,
  p_message text,
  p_width_px integer,
  p_height_px integer
)
returns setof public.photos
language plpgsql
security invoker
set search_path = ''
as $$
declare
  intent_row public.upload_intents%rowtype;
  guest_row public.guests%rowtype;
  event_row public.events%rowtype;
  photo_row public.photos%rowtype;
begin
  select * into intent_row
  from public.upload_intents
  where photo_id = p_photo_id
    and guest_id = p_guest_id
  for update;

  if not found
     or intent_row.used
     or intent_row.expires_at <= now()
     or intent_row.token_hash <> p_upload_token_hash then
    raise exception 'Invalid upload token' using errcode = '42501';
  end if;

  select * into guest_row
  from public.guests
  where id = p_guest_id
  for update;

  select * into event_row
  from public.events
  where id = intent_row.event_id;

  if guest_row.upload_count >= event_row.max_photos_per_guest then
    raise exception 'Photo limit reached' using errcode = 'P0001';
  end if;

  insert into public.photos (
    id, event_id, guest_id, object_key, content_type, size_bytes,
    message, status, is_developed, width_px, height_px, created_at, updated_at
  ) values (
    intent_row.photo_id,
    intent_row.event_id,
    intent_row.guest_id,
    intent_row.object_key,
    intent_row.content_type,
    intent_row.size_bytes,
    left(coalesce(p_message, ''), 500),
    case when event_row.auto_approve_photos then 'approved' else 'pending' end,
    event_row.mode <> 'disposable_camera',
    p_width_px,
    p_height_px,
    now(),
    now()
  )
  returning * into photo_row;

  update public.upload_intents set used = true where photo_id = intent_row.photo_id;
  update public.guests
  set upload_count = upload_count + 1,
      last_seen_at = now()
  where id = guest_row.id;

  return next photo_row;
end;
$$;

revoke all on function public.find_or_create_guest_atomic(text, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.complete_guest_photo_atomic(text, text, text, text, integer, integer)
  from public, anon, authenticated;

grant execute on function public.find_or_create_guest_atomic(text, text, text, boolean)
  to service_role;
grant execute on function public.complete_guest_photo_atomic(text, text, text, text, integer, integer)
  to service_role;
