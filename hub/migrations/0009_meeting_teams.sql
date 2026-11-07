-- A meeting can be for several teams, like a joint Browser and PC meeting. Everyone on any of
-- them sees it, is on its attendance list and gets its reminder. meetings.team_id stays as the
-- main team: club events are run by it, and action items fall back to it.
CREATE TABLE meeting_teams (
	meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
	team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
	PRIMARY KEY (meeting_id, team_id)
);
CREATE INDEX meeting_teams_team ON meeting_teams(team_id);

INSERT INTO meeting_teams (meeting_id, team_id) SELECT id, team_id FROM meetings;
