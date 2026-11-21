-- A copy of each email as it was sent (never sign-in codes), and who it was BCC'd to.
ALTER TABLE email_log ADD COLUMN html TEXT NOT NULL DEFAULT '';
ALTER TABLE email_log ADD COLUMN bcc TEXT NOT NULL DEFAULT '';
