ALTER TABLE meeting_agenda ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 2
 CHECK (typeof(duration_minutes) = 'integer' AND duration_minutes BETWEEN 1 AND 1440);
