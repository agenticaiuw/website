-- Club events (visible to everyone), repeating meetings, and one task shared by several people.

-- 'meeting': a team's own meeting. 'event': a club-wide event the team runs; everyone sees it.
ALTER TABLE meetings ADD COLUMN kind TEXT NOT NULL DEFAULT 'meeting' CHECK (kind IN ('meeting', 'event'));
-- Repeating meetings are stored one row per date; they share the id of the first one.
ALTER TABLE meetings ADD COLUMN series_id INTEGER;
CREATE INDEX meetings_series ON meetings(series_id, date);

-- Each assignee still gets their own row (own reminders, own "done"). Rows assigned together
-- share the id of the first one, so lists can show them as one task with progress.
ALTER TABLE tasks ADD COLUMN group_id INTEGER;
CREATE INDEX tasks_group ON tasks(group_id);

-- Tasks assigned to several people before this existed: same title, assigner, due date, team
-- and meeting, created within a few minutes of each other.
UPDATE tasks SET group_id = (
	SELECT MIN(o.id) FROM tasks o
	WHERE o.title = tasks.title AND o.assigned_by IS tasks.assigned_by AND o.due_date = tasks.due_date
		AND o.team_id IS tasks.team_id AND o.meeting_id IS tasks.meeting_id
		AND abs(julianday(o.created_at) - julianday(tasks.created_at)) < 0.005
)
WHERE (
	SELECT COUNT(*) FROM tasks o
	WHERE o.title = tasks.title AND o.assigned_by IS tasks.assigned_by AND o.due_date = tasks.due_date
		AND o.team_id IS tasks.team_id AND o.meeting_id IS tasks.meeting_id
		AND abs(julianday(o.created_at) - julianday(tasks.created_at)) < 0.005
) > 1;
