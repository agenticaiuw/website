-- Meetings get an end time next to the start time ('' when not set).
ALTER TABLE meetings ADD COLUMN end_time TEXT NOT NULL DEFAULT '';
