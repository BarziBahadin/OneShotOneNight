alter table private.events set schema public;
alter table private.guests set schema public;
alter table private.photos set schema public;
alter table private.idempotency_keys set schema public;
alter table private.upload_intents set schema public;
alter table private.admin_sessions set schema public;
alter table private.rate_limits set schema public;

create table public.app_config (
  id boolean primary key default true check (id),
  admin_password_hash text not null,
  token_pepper text not null default encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.app_config (id, admin_password_hash)
values (true, '1d95c93bc09290aa8bc5cdd80a10af85fc993285e9c5021bd1bf8db79964af27');

alter table public.app_config enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;

comment on table public.app_config is
  'Server-only OneShotOneNight configuration. RLS intentionally has no client policies.';
