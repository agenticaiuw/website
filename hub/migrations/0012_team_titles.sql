-- Each person's title on a team (e.g. "Firmware"), and execs are shown as execs, not leads.
ALTER TABLE team_members ADD COLUMN title TEXT NOT NULL DEFAULT '';
-- Execs already run every team; their lead flags were only standing in for that.
UPDATE team_members SET is_lead = 0 WHERE member_id IN (SELECT id FROM members WHERE role = 'exec');
