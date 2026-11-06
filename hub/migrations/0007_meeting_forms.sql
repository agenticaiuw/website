-- A form for a meeting, like feedback at a club-wide meeting. People open it from a link or
-- QR code without signing in and give their name and email.
CREATE TABLE forms (
	id INTEGER PRIMARY KEY,
	meeting_id INTEGER NOT NULL UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
	-- In the public link (/f/<token>), so one meeting's form can't be found from another's.
	token TEXT NOT NULL UNIQUE,
	title TEXT NOT NULL DEFAULT 'Feedback',
	-- JSON list of { "id": "q1", "label": "…", "kind": "rating" | "text" }.
	questions TEXT NOT NULL DEFAULT '[]',
	closed INTEGER NOT NULL DEFAULT 0,
	created_by INTEGER REFERENCES members(id),
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- One per email per form; sending the form again replaces the answers.
CREATE TABLE form_responses (
	id INTEGER PRIMARY KEY,
	form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	email TEXT NOT NULL COLLATE NOCASE,
	-- The roster member with that email, if any. They're also marked as at the meeting.
	member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
	-- JSON object of question id → answer.
	answers TEXT NOT NULL DEFAULT '{}',
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	UNIQUE (form_id, email)
);
