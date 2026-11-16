ALTER TABLE teams ADD COLUMN discord_url TEXT NOT NULL DEFAULT '';
ALTER TABLE teams ADD COLUMN drive_url TEXT NOT NULL DEFAULT '';
ALTER TABLE teams ADD COLUMN github_url TEXT NOT NULL DEFAULT '';
ALTER TABLE team_members ADD COLUMN can_manage_page INTEGER NOT NULL DEFAULT 0 CHECK (can_manage_page IN (0, 1));

CREATE TABLE subteams (
	id INTEGER PRIMARY KEY,
	team_id INTEGER NOT NULL REFERENCES teams(id),
	name TEXT NOT NULL COLLATE NOCASE,
	description TEXT NOT NULL DEFAULT '',
	archived INTEGER NOT NULL DEFAULT 0,
	UNIQUE (team_id, name),
	UNIQUE (id, team_id)
);

CREATE TABLE subteam_members (
	subteam_id INTEGER NOT NULL,
	team_id INTEGER NOT NULL,
	member_id INTEGER NOT NULL,
	PRIMARY KEY (subteam_id, member_id),
	FOREIGN KEY (subteam_id, team_id) REFERENCES subteams(id, team_id),
	FOREIGN KEY (team_id, member_id) REFERENCES team_members(team_id, member_id) ON DELETE CASCADE
);

CREATE TABLE board_tasks (
	id TEXT PRIMARY KEY,
	team_id INTEGER NOT NULL REFERENCES teams(id),
	created_by INTEGER NOT NULL REFERENCES members(id),
	title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
	details TEXT NOT NULL DEFAULT '',
	due_date TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'dropped')),
	version INTEGER NOT NULL DEFAULT 1,
	change_token TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	UNIQUE (id, team_id)
);
CREATE INDEX board_tasks_team ON board_tasks(team_id, status, due_date);

CREATE TABLE board_task_people (
	task_id TEXT NOT NULL,
	team_id INTEGER NOT NULL,
	member_id INTEGER NOT NULL,
	PRIMARY KEY (task_id, member_id),
	FOREIGN KEY (task_id, team_id) REFERENCES board_tasks(id, team_id) ON DELETE CASCADE,
	FOREIGN KEY (team_id, member_id) REFERENCES team_members(team_id, member_id) ON DELETE CASCADE
);

CREATE TABLE board_task_subteams (
	task_id TEXT NOT NULL,
	team_id INTEGER NOT NULL,
	subteam_id INTEGER NOT NULL,
	PRIMARY KEY (task_id, subteam_id),
	FOREIGN KEY (task_id, team_id) REFERENCES board_tasks(id, team_id) ON DELETE CASCADE,
	FOREIGN KEY (subteam_id, team_id) REFERENCES subteams(id, team_id)
);

CREATE VIEW board_task_recipients AS
	SELECT task_id, member_id FROM board_task_people
	UNION
	SELECT x.task_id, m.member_id FROM board_task_subteams x
	JOIN subteam_members m ON m.subteam_id = x.subteam_id
	JOIN subteams s ON s.id = x.subteam_id WHERE s.archived = 0;

CREATE TABLE board_task_reminders (
	task_id TEXT NOT NULL REFERENCES board_tasks(id) ON DELETE CASCADE,
	member_id INTEGER NOT NULL REFERENCES members(id),
	last_reminder_on TEXT NOT NULL,
	PRIMARY KEY (task_id, member_id)
);

CREATE TABLE board_task_activity (
	id INTEGER PRIMARY KEY,
	task_id TEXT NOT NULL REFERENCES board_tasks(id) ON DELETE CASCADE,
	member_id INTEGER NOT NULL REFERENCES members(id),
	kind TEXT NOT NULL CHECK (kind IN ('created', 'claimed', 'moved', 'edited', 'comment')),
	body TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX board_activity_task ON board_task_activity(task_id, id);

ALTER TABLE tasks ADD COLUMN board_in_progress INTEGER NOT NULL DEFAULT 0 CHECK (board_in_progress IN (0, 1));
