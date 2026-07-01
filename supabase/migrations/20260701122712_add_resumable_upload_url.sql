alter table public.upload_intents
add column if not exists resumable_url text;

comment on column public.upload_intents.resumable_url is
  'Server-only upstream TUS upload URL. Never returned directly to a guest client.';
