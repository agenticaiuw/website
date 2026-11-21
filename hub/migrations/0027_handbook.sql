-- The club handbook: current goals, rules and how things run, in one place. Execs edit it in
-- the hub. Every save is a new row, so the history of who changed what is kept. The newest row is live.
CREATE TABLE handbook_versions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	body TEXT NOT NULL,
	edited_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
	edited_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	note TEXT NOT NULL DEFAULT ''
);
