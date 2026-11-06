-- People invited to a meeting on top of its team: they see it, are on its attendance list and
-- get its reminder email.
CREATE TABLE meeting_invites (
	meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
	member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
	PRIMARY KEY (meeting_id, member_id)
);
CREATE INDEX meeting_invites_member ON meeting_invites(member_id);

-- Shown next to a person's name, like "Advisor". Permissions still come from role.
ALTER TABLE members ADD COLUMN title TEXT NOT NULL DEFAULT '';
