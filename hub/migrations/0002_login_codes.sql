-- Sign-in moves from emailed links to emailed 6-digit codes.
DROP TABLE login_links;

CREATE TABLE login_codes (
	id INTEGER PRIMARY KEY,
	member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
	code_hash TEXT NOT NULL,
	attempts INTEGER NOT NULL DEFAULT 0,
	expires_at TEXT NOT NULL,
	used_at TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX login_codes_member ON login_codes(member_id, created_at);
