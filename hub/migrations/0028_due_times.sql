-- Tasks can have a due time. Tasks with one, and every meeting and event, get reminders a day
-- before and then 4 hours (tasks) or 1 hour (meetings) before. Each reminded_*_for column holds
-- the "date time" it was sent for, so moving the date or time sets it up again.
ALTER TABLE tasks ADD COLUMN due_time TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN reminded_day_for TEXT;
ALTER TABLE tasks ADD COLUMN reminded_soon_for TEXT;
ALTER TABLE meetings ADD COLUMN reminded_day_for TEXT;
ALTER TABLE meetings ADD COLUMN reminded_soon_for TEXT;
-- Meetings already reminded the old way don't get a second day-before email.
UPDATE meetings SET reminded_day_for = date || ' ' || time WHERE reminded_on IS NOT NULL;
