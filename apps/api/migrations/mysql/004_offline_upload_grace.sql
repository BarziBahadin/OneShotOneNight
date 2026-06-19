ALTER TABLE events
  ADD COLUMN offline_upload_grace_hours INT NOT NULL DEFAULT 24 AFTER auto_approve_photos;
