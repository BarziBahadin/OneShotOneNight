CREATE TABLE events (
  id CHAR(26) PRIMARY KEY,
  slug VARCHAR(180) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  access_token_hash VARCHAR(128) NOT NULL,
  organizer_token_hash VARCHAR(128) NOT NULL,
  mode ENUM('standard_upload','disposable_camera','live_gallery','delayed_reveal') NOT NULL,
  status ENUM('open','locked','deleted') NOT NULL,
  starts_at DATETIME(6) NOT NULL,
  ends_at DATETIME(6) NOT NULL,
  reveal_at DATETIME(6) NOT NULL,
  max_guests INT NOT NULL,
  max_photos_per_guest INT NOT NULL,
  allow_gallery_uploads BOOLEAN NOT NULL,
  prefer_camera_capture BOOLEAN NOT NULL,
  allow_immediate_gallery BOOLEAN NOT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  INDEX idx_events_reveal_at (reveal_at)
);

CREATE TABLE guests (
  id CHAR(26) PRIMARY KEY,
  event_id CHAR(26) NOT NULL,
  device_token_hash VARCHAR(128) NOT NULL,
  display_name VARCHAR(255),
  upload_count INT NOT NULL DEFAULT 0,
  message_count INT NOT NULL DEFAULT 0,
  status ENUM('active','blocked') NOT NULL,
  created_at DATETIME(6) NOT NULL,
  last_seen_at DATETIME(6) NOT NULL,
  UNIQUE KEY uniq_guest_device (event_id, device_token_hash),
  CONSTRAINT fk_guests_event FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE TABLE photos (
  id CHAR(26) PRIMARY KEY,
  event_id CHAR(26) NOT NULL,
  guest_id CHAR(26) NOT NULL,
  object_key VARCHAR(512) NOT NULL,
  content_type VARCHAR(120) NOT NULL,
  size_bytes BIGINT NOT NULL,
  message TEXT,
  status ENUM('pending','approved','hidden','deleted') NOT NULL,
  is_developed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  INDEX idx_photos_event_status (event_id, status),
  CONSTRAINT fk_photos_event FOREIGN KEY (event_id) REFERENCES events(id),
  CONSTRAINT fk_photos_guest FOREIGN KEY (guest_id) REFERENCES guests(id)
);

CREATE TABLE idempotency_keys (
  scope VARCHAR(255) NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  PRIMARY KEY (scope, idempotency_key),
  INDEX idx_idempotency_expires_at (expires_at)
);
