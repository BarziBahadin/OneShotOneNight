alter table public.events
  add column if not exists title text,
  add column if not exists host_id uuid,
  add column if not exists host_message text not null default '',
  add column if not exists guest_upload_enabled boolean not null default true,
  add column if not exists guest_upload_token_hash text;

update public.events
set
  title = coalesce(title, name),
  host_message = coalesce(nullif(host_message, ''), description),
  guest_upload_enabled = status = 'open',
  guest_upload_token_hash = coalesce(guest_upload_token_hash, access_token_hash)
where title is null
  or guest_upload_token_hash is null;

alter table public.events
  alter column title set not null,
  alter column guest_upload_token_hash set not null;

create table if not exists public.guest_upload_sessions (
  id text primary key check (char_length(id) = 26),
  event_id text not null references public.events(id) on delete cascade,
  guest_name text not null check (char_length(guest_name) between 1 and 100),
  guest_message text not null default '' check (char_length(guest_message) <= 500),
  status text not null default 'pending' check (status in ('pending','uploading','completed','expired','failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists guest_upload_sessions_event_created_at_idx
  on public.guest_upload_sessions (event_id, created_at desc);

create table if not exists public.event_media (
  id text primary key check (char_length(id) = 26),
  event_id text not null references public.events(id) on delete cascade,
  guest_upload_session_id text not null references public.guest_upload_sessions(id) on delete cascade,
  guest_name text not null check (char_length(guest_name) between 1 and 100),
  file_name text not null check (char_length(file_name) between 1 and 255),
  file_type text not null check (char_length(file_type) between 1 and 120),
  file_size bigint not null check (file_size > 0),
  storage_path text not null unique,
  media_type text not null check (media_type in ('photo','video')),
  upload_status text not null default 'pending' check (upload_status in ('pending','uploaded','failed')),
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected','hidden')),
  created_at timestamptz not null default now()
);

create index if not exists event_media_event_created_at_idx
  on public.event_media (event_id, created_at desc);

create index if not exists event_media_session_idx
  on public.event_media (guest_upload_session_id);

alter table public.guest_upload_sessions enable row level security;
alter table public.event_media enable row level security;

revoke all on public.guest_upload_sessions from anon, authenticated;
revoke all on public.event_media from anon, authenticated;
grant all on public.guest_upload_sessions to service_role;
grant all on public.event_media to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'oneshotonenight',
  'oneshotonenight',
  false,
  104857600,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on table public.guest_upload_sessions is
  'Guest upload attempts created by Edge Functions only. No anon/authenticated RLS policies are defined.';

comment on table public.event_media is
  'Uploaded guest media metadata created by Edge Functions after signed Storage uploads complete.';
