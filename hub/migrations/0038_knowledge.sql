-- The knowledge base: everything the club knows (culture, expectations, how we work, each team,
-- meetings, money, decisions), each thing written once. It replaces the single handbook text,
-- which stays in handbook_versions as history. Pages are Markdown, edited in the hub, and every
-- save is a new version. What the public website says stays in the website editor; pages show it
-- live where they need it instead of copying it.
CREATE TABLE kb_pages (
	id INTEGER PRIMARY KEY,
	slug TEXT NOT NULL UNIQUE,
	title TEXT NOT NULL,
	-- The group it's listed under on the Handbook page, like "The club" or "How we work".
	area TEXT NOT NULL DEFAULT '',
	-- A team's own page, shown on that team's page. One per team.
	team_id INTEGER UNIQUE REFERENCES teams(id) ON DELETE SET NULL,
	-- members: everyone signed in to the hub; execs: execs only.
	audience TEXT NOT NULL DEFAULT 'members' CHECK (audience IN ('members', 'execs')),
	sort INTEGER NOT NULL DEFAULT 0,
	created_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	-- Set when an exec takes a page off the Handbook. Its versions are kept.
	removed_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE kb_versions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	page_id INTEGER NOT NULL REFERENCES kb_pages(id) ON DELETE CASCADE,
	body TEXT NOT NULL,
	edited_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
	edited_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX kb_versions_page ON kb_versions (page_id, id);
