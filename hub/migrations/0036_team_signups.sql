-- The public team sign-up form at /join. Replaces the Google "Official Project Membership Form".
CREATE TABLE team_signups (
	id INTEGER PRIMARY KEY,
	name TEXT NOT NULL,
	major TEXT NOT NULL,
	team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX team_signups_team ON team_signups(team_id, created_at);
CREATE INDEX team_signups_created ON team_signups(created_at);
