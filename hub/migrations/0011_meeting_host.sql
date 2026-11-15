-- Who's responsible for running each meeting.
ALTER TABLE meetings ADD COLUMN host_id INTEGER REFERENCES members(id) ON DELETE SET NULL;
