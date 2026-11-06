# Agentic AI UW Hub

Task and meeting tracker for the club, live at https://hub.agenticaiuw.com.

- **Tasks** have one assignee and a due date. People are emailed when a task is assigned, and reminded until it's done.
- **Meetings** (exec and project) keep the agenda, notes, who attended and the action items that came out of them.
- **Forms**: a meeting can have one (feedback, say) that people open from a QR code without signing in. Show on screen puts the QR code and a live count on the projector; roster members who fill it out are checked off as there.
- **People** shows execs who has open and overdue work and each person's attendance.

Sign-in is by a 6-digit code sent to your email (no passwords). Only people on the roster can sign in. Exec meetings and exec tasks are visible to execs only; project team members see their team's meetings and tasks.

## Reminders

Every morning at 9 AM Central, each person gets at most one email listing their tasks:

- 2 days before the due date, once
- on the due date
- every day for the first 3 days overdue, then every 3 days
- at 3 days overdue, whoever assigned the task gets one follow-up email
- Monday mornings, execs get a digest of everything overdue
- tasks marked Urgent also get reminders from 7 PM the evening they're due, then every 2 hours while overdue, except 1–8 AM

Every email has a one-click "Mark done" link. Exec → Email shows the log and can run reminders on demand.

## Setup still needed

1. **Email password.** Sign in to team@agenticaiuw.com, turn on 2-Step Verification, create an app password at https://myaccount.google.com/apppasswords, then run `npx wrangler secret put SMTP_PASSWORD` here and paste it. Until then no email goes out, including sign-in codes.
2. **SPF record**, so club mail isn't marked as spam. In Cloudflare DNS for agenticaiuw.com, add a TXT record on `@`: `v=spf1 include:_spf.google.com ~all`.
3. **First sign-in** at https://hub.agenticaiuw.com with eliu59@wisc.edu (already an exec) or team@agenticaiuw.com; both are bootstrap admins in `ADMIN_EMAILS`. Add the execs on the People page (`Name, email, exec`, one per line). Turn off the club account on its profile page so it doesn't appear in attendance.

## Development

```
npm install
npm run db:migrate:local
npm run dev        # http://localhost:8787, emails are logged instead of sent
npm test
npm run typecheck
npm run deploy
```

Schema changes go in a new file in `migrations/`, applied with `npm run db:migrate`.

`import/fall-2026-exec-history.sql` loads the fall 2026 exec meetings and attendance from the club Drive. Run it once the execs are on the roster:

```
npx wrangler d1 execute agenticaiuw-hub --remote --file import/fall-2026-exec-history.sql
```
