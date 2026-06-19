ALTER TABLE events
  MODIFY status ENUM('open','locked','deleted') NOT NULL;

ALTER TABLE photos
  ADD COLUMN is_developed BOOLEAN NOT NULL DEFAULT FALSE AFTER status;

UPDATE photos
JOIN events ON events.id = photos.event_id
SET photos.is_developed = events.allow_immediate_gallery OR UTC_TIMESTAMP(6) >= events.reveal_at;
