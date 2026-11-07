-- People on a meeting's teams who were unticked for it: they aren't expected, listed or reminded.
CREATE TABLE meeting_skips (
	meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
	member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
	PRIMARY KEY (meeting_id, member_id)
);
