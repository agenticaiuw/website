CREATE TABLE meeting_summary_revisions (
 id INTEGER PRIMARY KEY,
 meeting_id INTEGER NOT NULL REFERENCES meetings(id),
 entry_id TEXT NOT NULL,
 version INTEGER NOT NULL CHECK (version >= 1),
 body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
 author_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
 author_name TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
 UNIQUE(entry_id, version)
);
CREATE INDEX meeting_summary_order ON meeting_summary_revisions(meeting_id, id);
