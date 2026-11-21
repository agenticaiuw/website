-- The club's rulebook: every official decision, however small, plus the ones still open. Execs decide
-- them one at a time on the Decisions page, and each answer is saved here right away.
CREATE TABLE decisions (
	id INTEGER PRIMARY KEY,
	-- Topic it's listed under, e.g. "Meetings", "Newsletter", "Who's responsible".
	area TEXT NOT NULL DEFAULT '',
	-- Short name. Optional for a rule that reads fine on its own.
	title TEXT NOT NULL DEFAULT '',
	-- The decision as it stands. For an open question with choices, empty until one is picked.
	body TEXT NOT NULL DEFAULT '',
	-- Background for whoever decides: where it came from, what conflicts.
	context TEXT NOT NULL DEFAULT '',
	-- JSON list of answers to pick from, for an open question.
	options TEXT NOT NULL DEFAULT '[]',
	-- open (not decided yet), official, or dropped.
	status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'official', 'dropped')),
	-- Who's responsible for it, and when it starts (YYYY-MM-DD).
	owner_id INTEGER REFERENCES members(id),
	starts_on TEXT NOT NULL DEFAULT '',
	-- 1 when only execs may see it.
	exec_only INTEGER NOT NULL DEFAULT 0,
	sort INTEGER NOT NULL DEFAULT 0,
	decided_by INTEGER REFERENCES members(id),
	decided_at TEXT NOT NULL DEFAULT '',
	created_by INTEGER REFERENCES members(id),
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX decisions_status ON decisions (status, sort);
-- What each decision said before every change, so nothing decided is ever lost.
CREATE TABLE decision_history (
	id INTEGER PRIMARY KEY,
	decision_id INTEGER NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
	status TEXT NOT NULL,
	body TEXT NOT NULL,
	owner_id INTEGER,
	starts_on TEXT NOT NULL DEFAULT '',
	changed_by INTEGER REFERENCES members(id),
	changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX decision_history_decision ON decision_history (decision_id, id);
