CREATE TABLE meeting_agenda (
	id INTEGER PRIMARY KEY,
	meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
	author_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
	author_name TEXT NOT NULL,
	title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
	position INTEGER NOT NULL,
	version INTEGER NOT NULL DEFAULT 1,
	removed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX meeting_agenda_order ON meeting_agenda(meeting_id, removed, position, id);

CREATE TABLE meeting_speaker_notes (
	id INTEGER PRIMARY KEY,
	meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
	agenda_id INTEGER NOT NULL UNIQUE REFERENCES meeting_agenda(id) ON DELETE CASCADE,
	body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
	version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX meeting_speaker_notes_agenda ON meeting_speaker_notes(meeting_id, agenda_id);

CREATE TABLE meeting_attachments (
	id TEXT PRIMARY KEY,
	-- Keep retired file bytes recoverable, even when the original meeting is removed.
	meeting_id INTEGER REFERENCES meetings(id) ON DELETE SET NULL,
	agenda_id INTEGER REFERENCES meeting_agenda(id) ON DELETE SET NULL,
	original_meeting_id INTEGER NOT NULL,
	original_agenda_id INTEGER,
	author_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
	name TEXT NOT NULL,
	media_type TEXT NOT NULL,
	size INTEGER NOT NULL CHECK (size BETWEEN 1 AND 8388608),
	removed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX meeting_attachments_meeting ON meeting_attachments(meeting_id, removed);

CREATE TABLE meeting_attachment_chunks (
	file_id TEXT NOT NULL REFERENCES meeting_attachments(id),
	part INTEGER NOT NULL,
	data BLOB NOT NULL CHECK (length(data) BETWEEN 1 AND 1048576),
	PRIMARY KEY (file_id, part)
);

ALTER TABLE attendance ADD COLUMN self_report INTEGER NOT NULL DEFAULT 0 CHECK (self_report IN (0, 1));
