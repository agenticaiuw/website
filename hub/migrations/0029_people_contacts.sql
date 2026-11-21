-- Everyone the club can reach: people who filled in a club form, signed up for or came to an
-- event, or emailed the club, with the major and year they gave. Copied from the Drive sheets
-- before those were deleted. Roster members are in members as well.
CREATE TABLE people (
	id INTEGER PRIMARY KEY,
	name TEXT NOT NULL DEFAULT '',
	email TEXT NOT NULL UNIQUE COLLATE NOCASE,
	major TEXT NOT NULL DEFAULT '',
	year TEXT NOT NULL DEFAULT '',
	discord TEXT NOT NULL DEFAULT '',
	phone TEXT NOT NULL DEFAULT '',
	company TEXT NOT NULL DEFAULT '',
	position TEXT NOT NULL DEFAULT '',
	-- Where they came from, oldest first, e.g. "New member form 2026-05-04; Fall kickoff sign-in 2026-09-17".
	sources TEXT NOT NULL DEFAULT '',
	first_seen TEXT NOT NULL DEFAULT '',
	notes TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- People and organizations outside the club: companies, investors, faculty, campus offices, other clubs.
CREATE TABLE contacts (
	id INTEGER PRIMARY KEY,
	name TEXT NOT NULL DEFAULT '',
	organization TEXT NOT NULL DEFAULT '',
	kind TEXT NOT NULL DEFAULT '',
	region TEXT NOT NULL DEFAULT '',
	email TEXT NOT NULL DEFAULT '',
	phone TEXT NOT NULL DEFAULT '',
	link TEXT NOT NULL DEFAULT '',
	purpose TEXT NOT NULL DEFAULT '',
	-- The club member who handles them.
	owner TEXT NOT NULL DEFAULT '',
	status TEXT NOT NULL DEFAULT '',
	priority TEXT NOT NULL DEFAULT '',
	notes TEXT NOT NULL DEFAULT '',
	source TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
