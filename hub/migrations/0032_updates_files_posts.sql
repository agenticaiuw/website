-- Written updates before a meeting: a couple of sentences from each person on what they actually did.
CREATE TABLE meeting_updates (
	meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
	member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
	body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	PRIMARY KEY (meeting_id, member_id)
);

-- Club files the handbook links to, like the constitution, stored in chunks.
CREATE TABLE club_files (
	key TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	media_type TEXT NOT NULL,
	size INTEGER NOT NULL CHECK (size BETWEEN 1 AND 16777216),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE club_file_chunks (
	file_key TEXT NOT NULL REFERENCES club_files(key) ON DELETE CASCADE,
	part INTEGER NOT NULL,
	data BLOB NOT NULL CHECK (length(data) BETWEEN 1 AND 1048576),
	PRIMARY KEY (file_key, part)
);

-- When each social media post goes out, where, and who posts it.
CREATE TABLE social_posts (
	id INTEGER PRIMARY KEY,
	platform TEXT NOT NULL,
	post_date TEXT NOT NULL,
	post_time TEXT NOT NULL DEFAULT '',
	body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
	owner_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
	status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'posted')),
	link TEXT NOT NULL DEFAULT '',
	created_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX social_posts_when ON social_posts(post_date, post_time);
