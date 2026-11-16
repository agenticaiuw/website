CREATE TABLE meeting_library_links (
	id TEXT PRIMARY KEY,
	meeting_id INTEGER REFERENCES meetings(id) ON DELETE SET NULL,
	original_meeting_id INTEGER NOT NULL,
	author_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
	name TEXT NOT NULL,
	url TEXT NOT NULL,
	created_at TEXT NOT NULL,
	removed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX meeting_library_links_meeting ON meeting_library_links(meeting_id, removed);
