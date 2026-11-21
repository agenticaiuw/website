-- A meeting can have a second host.
ALTER TABLE meetings ADD COLUMN cohost_id INTEGER REFERENCES members(id) ON DELETE SET NULL;
