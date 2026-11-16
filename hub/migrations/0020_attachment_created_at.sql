-- Existing attachments have no recorded upload time; leave it unknown.
ALTER TABLE meeting_attachments ADD COLUMN created_at TEXT;
