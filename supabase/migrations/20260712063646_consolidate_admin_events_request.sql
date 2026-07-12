create or replace function public.admin_events_snapshot(
  p_session_id text,
  p_query text default '',
  p_status text default ''
)
returns table (
  event jsonb,
  guest_count bigint,
  photo_count bigint,
  pending_photos bigint,
  storage_bytes bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.admin_sessions s
    where s.id = p_session_id
      and s.expires_at > now()
  ) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  return query
  with selected_events as (
    select e.*
    from public.events e
    where e.status <> 'deleted'
      and (p_query = '' or lower(e.name) like ('%' || lower(p_query) || '%') or lower(e.slug) like ('%' || lower(p_query) || '%'))
      and (p_status = '' or e.status = p_status)
  ),
  guest_stats as (
    select g.event_id, count(*) as count
    from public.guests g
    join selected_events e on e.id = g.event_id
    group by g.event_id
  ),
  photo_stats as (
    select
      p.event_id,
      count(*) filter (where p.status <> 'deleted') as count,
      count(*) filter (where p.status = 'pending') as pending,
      coalesce(sum(p.size_bytes) filter (where p.status <> 'deleted'), 0) as bytes
    from public.photos p
    join selected_events e on e.id = p.event_id
    group by p.event_id
  ),
  media_stats as (
    select
      m.event_id,
      count(*) filter (where m.upload_status = 'uploaded' and m.approval_status <> 'hidden') as count,
      count(*) filter (where m.approval_status = 'pending') as pending,
      coalesce(sum(m.file_size) filter (where m.upload_status = 'uploaded' and m.approval_status <> 'hidden'), 0) as bytes
    from public.event_media m
    join selected_events e on e.id = m.event_id
    group by m.event_id
  )
  select
    jsonb_build_object(
      'id', e.id,
      'slug', e.slug,
      'name', e.name,
      'description', e.description,
      'host_message', e.host_message,
      'mode', e.mode,
      'status', e.status,
      'starts_at', e.starts_at,
      'ends_at', e.ends_at,
      'reveal_at', e.reveal_at,
      'max_guests', e.max_guests,
      'max_photos_per_guest', e.max_photos_per_guest,
      'allow_gallery_uploads', e.allow_gallery_uploads,
      'prefer_camera_capture', e.prefer_camera_capture,
      'allow_immediate_gallery', e.allow_immediate_gallery,
      'auto_approve_photos', e.auto_approve_photos,
      'offline_upload_grace_hours', e.offline_upload_grace_hours,
      'created_at', e.created_at,
      'updated_at', e.updated_at
    ),
    coalesce(g.count, 0),
    coalesce(p.count, 0) + coalesce(m.count, 0),
    coalesce(p.pending, 0) + coalesce(m.pending, 0),
    coalesce(p.bytes, 0) + coalesce(m.bytes, 0)
  from selected_events e
  left join guest_stats g on g.event_id = e.id
  left join photo_stats p on p.event_id = e.id
  left join media_stats m on m.event_id = e.id
  order by e.created_at desc;
end;
$$;

revoke all on function public.admin_events_snapshot(text, text, text) from public, anon, authenticated;
grant execute on function public.admin_events_snapshot(text, text, text) to service_role;
