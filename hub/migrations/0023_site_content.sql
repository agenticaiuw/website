-- Public website content edited in the hub. Every save is a new row, so the full
-- history of who changed what is kept. The newest row per section is live.
CREATE TABLE site_content_versions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	section TEXT NOT NULL,
	data TEXT NOT NULL CHECK (json_valid(data)),
	edited_by INTEGER REFERENCES members(id),
	edited_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	note TEXT NOT NULL DEFAULT '',
	restored_from INTEGER REFERENCES site_content_versions(id)
);
CREATE INDEX site_content_section ON site_content_versions (section, id);

-- The site owner: highest authority. Set by hand, never by the app.
ALTER TABLE members ADD COLUMN is_owner INTEGER NOT NULL DEFAULT 0;
