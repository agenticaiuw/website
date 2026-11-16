-- Repeating tasks: every repeat_days days until repeat_until (or until stopped). On each one's due
-- date the next is made for everyone still on it; repeated marks that it's been made.
ALTER TABLE tasks ADD COLUMN repeat_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN repeat_until TEXT;
ALTER TABLE tasks ADD COLUMN repeated INTEGER NOT NULL DEFAULT 0;
CREATE INDEX tasks_repeat ON tasks(repeat_days, repeated, due_date);
