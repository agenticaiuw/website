-- Dates (due dates, meeting dates) are YYYY-MM-DD in club time (America/Chicago).
-- Timestamps are UTC ISO strings.

CREATE TABLE members (
	id INTEGER PRIMARY KEY,
	name TEXT NOT NULL,
	email TEXT NOT NULL UNIQUE COLLATE NOCASE,
	role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('exec', 'member')),
	discord TEXT NOT NULL DEFAULT '',
	active INTEGER NOT NULL DEFAULT 1,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- kind 'exec': only execs see its meetings and tasks. kind 'project': its members do too.
CREATE TABLE teams (
	id INTEGER PRIMARY KEY,
	name TEXT NOT NULL UNIQUE COLLATE NOCASE,
	kind TEXT NOT NULL DEFAULT 'project' CHECK (kind IN ('exec', 'project')),
	description TEXT NOT NULL DEFAULT '',
	archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE team_members (
	team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
	member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
	is_lead INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (team_id, member_id)
);
CREATE INDEX team_members_member ON team_members(member_id);

CREATE TABLE meetings (
	id INTEGER PRIMARY KEY,
	team_id INTEGER NOT NULL REFERENCES teams(id),
	title TEXT NOT NULL,
	date TEXT NOT NULL,
	time TEXT NOT NULL DEFAULT '',
	location TEXT NOT NULL DEFAULT '',
	doc_url TEXT NOT NULL DEFAULT '',
	agenda TEXT NOT NULL DEFAULT '',
	notes TEXT NOT NULL DEFAULT '',
	created_by INTEGER REFERENCES members(id),
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX meetings_team_date ON meetings(team_id, date);

CREATE TABLE attendance (
	meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
	member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
	status TEXT NOT NULL CHECK (status IN ('present', 'late', 'excused', 'absent')),
	PRIMARY KEY (meeting_id, member_id)
);
CREATE INDEX attendance_member ON attendance(member_id);

CREATE TABLE tasks (
	id INTEGER PRIMARY KEY,
	title TEXT NOT NULL,
	details TEXT NOT NULL DEFAULT '',
	assignee_id INTEGER NOT NULL REFERENCES members(id),
	assigned_by INTEGER REFERENCES members(id),
	team_id INTEGER REFERENCES teams(id),
	meeting_id INTEGER REFERENCES meetings(id) ON DELETE SET NULL,
	due_date TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'dropped')),
	completed_at TEXT,
	-- Club-time date of the last reminder email, so each day's run sends at most one.
	last_reminder_on TEXT,
	reminders_sent INTEGER NOT NULL DEFAULT 0,
	-- Set once the person who assigned it has been told it's overdue.
	escalated_on TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX tasks_assignee ON tasks(assignee_id, status);
CREATE INDEX tasks_status_due ON tasks(status, due_date);
CREATE INDEX tasks_meeting ON tasks(meeting_id);
CREATE INDEX tasks_team ON tasks(team_id);

-- Everything that happens to a task: comments, status and due date changes, reminders sent.
CREATE TABLE task_activity (
	id INTEGER PRIMARY KEY,
	task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
	member_id INTEGER REFERENCES members(id),
	kind TEXT NOT NULL,
	body TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX task_activity_task ON task_activity(task_id);

CREATE TABLE sessions (
	token_hash TEXT PRIMARY KEY,
	member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
	expires_at TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE login_links (
	token_hash TEXT PRIMARY KEY,
	member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
	redirect TEXT NOT NULL DEFAULT '/',
	expires_at TEXT NOT NULL,
	used_at TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX login_links_member ON login_links(member_id, created_at);

CREATE TABLE email_log (
	id INTEGER PRIMARY KEY,
	to_email TEXT NOT NULL,
	subject TEXT NOT NULL,
	kind TEXT NOT NULL,
	status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'logged')),
	error TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX email_log_created ON email_log(created_at);

CREATE TABLE meta (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
);

INSERT INTO teams (name, kind, description) VALUES
	('Exec Board', 'exec', 'Club leadership. Exec meetings and exec tasks are visible to execs only.'),
	('Wearable', 'project', 'Screenless voice wearable for talking to agents eyes-free.'),
	('Cloud', 'project', 'Central Hivemind node: server, model routing, VMs, database and multi-user support.'),
	('PC', 'project', 'Agent on the user''s computer: terminal tasks, files and computer use.'),
	('Browser', 'project', 'Browser extension agent: forms, navigation, DOM and JavaScript.'),
	('Research & Architecture', 'project', 'Harness, memory, context engineering, evals, and cost, speed and accuracy.'),
	('Product Design', 'project', 'Market research, UI/UX design and branding.'),
	('Business', 'project', 'Outreach, finance, marketing and operations.');
