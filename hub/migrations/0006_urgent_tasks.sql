-- Urgent tasks get extra reminders: a few the evening they're due, then every 2 hours while overdue.
ALTER TABLE tasks ADD COLUMN urgent INTEGER NOT NULL DEFAULT 0;
-- UTC timestamp after which an urgent task goes back to the daily schedule (NULL: until it's done).
ALTER TABLE tasks ADD COLUMN urgent_until TEXT;
-- UTC timestamp of the last reminder email of any kind, so urgent reminders stay 2 hours apart.
ALTER TABLE tasks ADD COLUMN reminded_at TEXT;
