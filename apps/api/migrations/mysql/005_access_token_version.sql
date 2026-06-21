ALTER TABLE events
  ADD COLUMN access_token_version VARCHAR(128) NULL AFTER access_token_hash;

-- Existing rows must receive a random version and a newly derived access-token
-- hash during application migration before this column is made NOT NULL.
