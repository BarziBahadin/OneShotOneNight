create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table private.events (
  id text primary key check (char_length(id) = 26),
  slug text not null unique,
  name text not null check (char_length(name) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  guest_url text not null default '',
  access_token_hash text not null,
  access_token_version text not null,
  organizer_token_hash text not null default '',
  mode text not null check (mode in ('standard_upload','disposable_camera','live_gallery','delayed_reveal')),
  status text not null check (status in ('open','locked','deleted')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reveal_at timestamptz not null,
  max_guests integer not null check (max_guests between 1 and 10000),
  max_photos_per_guest integer not null check (max_photos_per_guest between 1 and 1000),
  allow_gallery_uploads boolean not null default true,
  prefer_camera_capture boolean not null default true,
  allow_immediate_gallery boolean not null default false,
  auto_approve_photos boolean not null default true,
  offline_upload_grace_hours integer not null default 24 check (offline_upload_grace_hours between 0 and 168),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (reveal_at >= starts_at)
);

create index events_created_at_idx on private.events (created_at desc);

create table private.guests (
  id text primary key check (char_length(id) = 26),
  event_id text not null references private.events(id) on delete cascade,
  device_token_hash text not null,
  display_name text not null default '' check (char_length(display_name) <= 100),
  upload_count integer not null default 0 check (upload_count >= 0),
  message_count integer not null default 0 check (message_count >= 0),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active','blocked')),
  unique (event_id, device_token_hash)
);

create index guests_event_id_created_at_idx on private.guests (event_id, created_at);

create table private.photos (
  id text primary key check (char_length(id) = 26),
  event_id text not null references private.events(id) on delete cascade,
  guest_id text not null references private.guests(id) on delete cascade,
  object_key text not null unique,
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp','image/heic','image/heif')),
  size_bytes bigint not null check (size_bytes > 0),
  message text not null default '' check (char_length(message) <= 500),
  status text not null check (status in ('pending','approved','hidden','deleted')),
  is_developed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index photos_event_created_at_idx on private.photos (event_id, created_at desc);
create index photos_event_status_created_at_idx on private.photos (event_id, status, created_at desc);
create index photos_guest_id_idx on private.photos (guest_id);
create index photos_pending_idx on private.photos (event_id, created_at desc) where status = 'pending';

create table private.idempotency_keys (
  scope text not null,
  idempotency_key text not null,
  expires_at timestamptz not null,
  primary key (scope, idempotency_key)
);
create index idempotency_keys_expires_at_idx on private.idempotency_keys (expires_at);

create table private.upload_intents (
  photo_id text primary key,
  event_id text not null references private.events(id) on delete cascade,
  guest_id text not null references private.guests(id) on delete cascade,
  object_key text not null unique,
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  token_hash text not null,
  expires_at timestamptz not null,
  used boolean not null default false
);
create index upload_intents_event_id_idx on private.upload_intents (event_id);
create index upload_intents_guest_id_idx on private.upload_intents (guest_id);
create index upload_intents_expires_at_idx on private.upload_intents (expires_at);

create table private.admin_sessions (
  id text primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index admin_sessions_expires_at_idx on private.admin_sessions (expires_at);

create table private.rate_limits (
  rate_key text not null,
  window_start timestamptz not null,
  count integer not null default 1 check (count > 0),
  expires_at timestamptz not null,
  primary key (rate_key, window_start)
);
create index rate_limits_expires_at_idx on private.rate_limits (expires_at);

revoke all on all tables in schema private from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'oneshotonenight',
  'oneshotonenight',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
