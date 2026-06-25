alter table public.photos
  add column if not exists width_px integer check (width_px is null or width_px > 0),
  add column if not exists height_px integer check (height_px is null or height_px > 0);

