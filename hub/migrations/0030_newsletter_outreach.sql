-- Two separate lists that never mix:
-- newsletter: people who gave the club their email themselves (club forms, event sign-ups and
--   sign-ins, RSVPs, the website contact form). Only this list goes to the newsletter and the
--   Google Group.
-- outreach: people and organizations the club found and contacts itself (companies, investors,
--   faculty, campus offices, other clubs). Never added to the newsletter or the Google Group.
ALTER TABLE people RENAME TO newsletter;
ALTER TABLE contacts RENAME TO outreach;
UPDATE outreach SET notes = trim(replace(replace(notes, ' | On the newsletter.', ''), 'On the newsletter.', ''))
	WHERE notes LIKE '%On the newsletter.%';
