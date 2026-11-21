-- Each member's major(s) and GitHub username, copied from the club's sign-up forms.
ALTER TABLE members ADD COLUMN major TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN github TEXT NOT NULL DEFAULT '';
