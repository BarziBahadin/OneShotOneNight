alter table public.events
add column cover_object_key text
check (
  cover_object_key is null
  or cover_object_key ~ '^events/[A-Z0-9]{26}/cover/[A-Z0-9]{26}\.(jpg|png|webp)$'
);

comment on column public.events.cover_object_key is
  'Private Storage object used as the event hero and album cover.';
