-- The club-time date a meeting's reminder email went out, so a meeting is only reminded once.
ALTER TABLE meetings ADD COLUMN reminded_on TEXT;
