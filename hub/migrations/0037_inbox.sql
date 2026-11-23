-- The club's shared inbox. Cloudflare Email Routing hands each email to the Worker, which keeps the
-- raw message and its attachments in R2 (MAIL) and the parts people read here. Execs read and reply.
CREATE TABLE inbox_threads (
	id INTEGER PRIMARY KEY,
	subject TEXT NOT NULL,
	-- 'open' until someone marks it done; a new email in it opens it again.
	status TEXT NOT NULL DEFAULT 'open',
	-- 1 until an exec opens it after its newest incoming email.
	unread INTEGER NOT NULL DEFAULT 1,
	last_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX inbox_threads_list ON inbox_threads(status, last_at);

CREATE TABLE inbox_messages (
	id INTEGER PRIMARY KEY,
	thread_id INTEGER NOT NULL REFERENCES inbox_threads(id) ON DELETE CASCADE,
	-- 'in' from outside, 'out' a reply sent from the hub.
	direction TEXT NOT NULL,
	-- Without the angle brackets.
	message_id TEXT NOT NULL DEFAULT '',
	in_reply_to TEXT NOT NULL DEFAULT '',
	refs TEXT NOT NULL DEFAULT '',
	from_name TEXT NOT NULL DEFAULT '',
	from_email TEXT NOT NULL DEFAULT '',
	reply_to TEXT NOT NULL DEFAULT '',
	-- Comma-separated addresses.
	to_emails TEXT NOT NULL DEFAULT '',
	cc_emails TEXT NOT NULL DEFAULT '',
	subject TEXT NOT NULL DEFAULT '',
	text TEXT NOT NULL DEFAULT '',
	html TEXT NOT NULL DEFAULT '',
	-- The whole message as received, in MAIL. '' for replies.
	raw_key TEXT NOT NULL DEFAULT '',
	sent_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
	-- For replies: '' once sent, or why it failed.
	error TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX inbox_messages_thread ON inbox_messages(thread_id, created_at);
CREATE INDEX inbox_messages_message_id ON inbox_messages(message_id);

CREATE TABLE inbox_attachments (
	id INTEGER PRIMARY KEY,
	message_id INTEGER NOT NULL REFERENCES inbox_messages(id) ON DELETE CASCADE,
	-- In MAIL.
	key TEXT NOT NULL,
	name TEXT NOT NULL,
	media_type TEXT NOT NULL,
	size INTEGER NOT NULL,
	-- An image the email shows in its body (cid:), not listed as a file.
	content_id TEXT NOT NULL DEFAULT '',
	inline INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX inbox_attachments_message ON inbox_attachments(message_id);
