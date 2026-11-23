-- The hub's Files page, which replaces the club's Google Drive: files for the whole club or for one
-- team. Removing a file only hides it; execs can put it back.
ALTER TABLE club_files ADD COLUMN team_id INTEGER REFERENCES teams(id);
ALTER TABLE club_files ADD COLUMN uploaded_by INTEGER REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE club_files ADD COLUMN removed_at TEXT NOT NULL DEFAULT '';
ALTER TABLE club_files ADD COLUMN removed_by INTEGER REFERENCES members(id) ON DELETE SET NULL;
CREATE INDEX club_files_place ON club_files(removed_at, team_id);
