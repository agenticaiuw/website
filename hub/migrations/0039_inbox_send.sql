-- Inbox emails can go out with hidden recipients (Bcc), as forwards, and later at a set time.
ALTER TABLE inbox_messages ADD COLUMN bcc_emails TEXT NOT NULL DEFAULT '';

-- An email an exec set to send later. The cron sends it at send_at, then it becomes an 'out' message.
CREATE TABLE inbox_scheduled (
	id INTEGER PRIMARY KEY,
	thread_id INTEGER NOT NULL REFERENCES inbox_threads(id) ON DELETE CASCADE,
	-- 'reply' or 'forward'.
	mode TEXT NOT NULL DEFAULT 'reply',
	-- The email it answers or forwards.
	of_message INTEGER REFERENCES inbox_messages(id) ON DELETE SET NULL,
	-- Comma-separated addresses.
	to_emails TEXT NOT NULL DEFAULT '',
	cc_emails TEXT NOT NULL DEFAULT '',
	bcc_emails TEXT NOT NULL DEFAULT '',
	text TEXT NOT NULL DEFAULT '',
	-- JSON [{key, name, type, size}], the files kept in MAIL under sched/ until it sends.
	files TEXT NOT NULL DEFAULT '[]',
	-- UTC.
	send_at TEXT NOT NULL,
	created_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX inbox_scheduled_due ON inbox_scheduled(send_at);
CREATE INDEX inbox_scheduled_thread ON inbox_scheduled(thread_id);
