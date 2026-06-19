ALTER TABLE events
  ADD COLUMN auto_approve_photos BOOLEAN NOT NULL DEFAULT FALSE AFTER allow_immediate_gallery;

ALTER TABLE events
  ALTER COLUMN auto_approve_photos SET DEFAULT TRUE;
