create or replace function public.admin_event_stats(p_event_ids text[])
returns table (
  event_id text,
  guest_count bigint,
  photo_count bigint,
  pending_photos bigint,
  storage_bytes bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with requested as (
    select unnest(p_event_ids) as event_id
  ),
  guest_stats as (
    select g.event_id, count(*) as guest_count
    from public.guests g
    where g.event_id = any(p_event_ids)
    group by g.event_id
  ),
  photo_stats as (
    select
      p.event_id,
      count(*) filter (where p.status <> 'deleted') as photo_count,
      count(*) filter (where p.status = 'pending') as pending_photos,
      coalesce(sum(p.size_bytes) filter (where p.status <> 'deleted'), 0) as storage_bytes
    from public.photos p
    where p.event_id = any(p_event_ids)
    group by p.event_id
  ),
  media_stats as (
    select
      m.event_id,
      count(*) filter (where m.upload_status = 'uploaded' and m.approval_status <> 'hidden') as photo_count,
      count(*) filter (where m.approval_status = 'pending') as pending_photos,
      coalesce(sum(m.file_size) filter (where m.upload_status = 'uploaded' and m.approval_status <> 'hidden'), 0) as storage_bytes
    from public.event_media m
    where m.event_id = any(p_event_ids)
    group by m.event_id
  )
  select
    requested.event_id,
    coalesce(guest_stats.guest_count, 0),
    coalesce(photo_stats.photo_count, 0) + coalesce(media_stats.photo_count, 0),
    coalesce(photo_stats.pending_photos, 0) + coalesce(media_stats.pending_photos, 0),
    coalesce(photo_stats.storage_bytes, 0) + coalesce(media_stats.storage_bytes, 0)
  from requested
  left join guest_stats using (event_id)
  left join photo_stats using (event_id)
  left join media_stats using (event_id);
$$;

revoke all on function public.admin_event_stats(text[]) from public, anon, authenticated;
grant execute on function public.admin_event_stats(text[]) to service_role;
