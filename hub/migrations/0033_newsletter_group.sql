-- Website signups are added to the Google Group agenticaiuw@g-groups.wisc.edu by the hub.
-- group_added_at: when the hub added them (or found them already in it). group_error: why Google
-- refused, for an exec to see on the Email page; the hub doesn't retry those.
ALTER TABLE newsletter ADD COLUMN group_added_at TEXT NOT NULL DEFAULT '';
ALTER TABLE newsletter ADD COLUMN group_error TEXT NOT NULL DEFAULT '';
