# Agentic AI UW Hub

Task and meeting tracker for the club, live at https://hub.agenticaiuw.com.

- **Tasks** have one assignee and a due date. People are emailed when a task is assigned, and reminded until it's done.
- **Meetings** (exec and project) keep the agenda, notes, who attended and the action items that came out of them.
- **Forms**: a meeting can have one (feedback, say) that people open from a QR code without signing in. Show on screen puts the QR code and a live count on the projector; roster members who fill it out are checked off as there.
- **Inbox** (`/inbox`, execs only) is the club's shared email: what's sent to @agenticaiuw.com, threaded, with replies sent from team@agenticaiuw.com.
- **People** shows execs who has open and overdue work and each person's attendance.
- **Website** (`/site`, execs only) edits every word, link and number on agenticaiuw.com. Each save is a new row in `site_content_versions`, so History shows who changed what and any version can be restored. The website is built from the newest versions, read from the public `/api/site`, and `src/lib/server/website.ts` starts a rebuild whenever they change; `src/lib/server/site/defaults.ts` holds the original text. The owner (`members.is_owner`) is the only one who can change roles.

Sign-in is by a 6-digit code sent to your email (no passwords). Only people on the roster can sign in. Exec meetings and exec tasks are visible to execs only; project team members see their team's meetings and tasks.

## Reminders

Meetings and club events: everyone on them is emailed a day before and an hour before. A meeting with no time is reminded at 9 AM the day before and 9 AM the day of.

Tasks can have a due time. With one, the person gets a reminder a day before and 4 hours before. Without one, the 9 AM Central email covers it. Every morning at 9 AM Central, each person gets at most one email listing their tasks:

- the day before the due date (tasks with no time)
- on the due date (tasks with no time)
- every day for the first 3 days overdue, then every 3 days
- at 3 days overdue, whoever assigned the task gets one follow-up email
- Monday mornings, execs get a digest of everything overdue
- tasks marked Urgent also get reminders every 2 hours from their due time (7 PM that evening if they have none) while overdue, except 1–8 AM

The cron runs every 5 minutes; the 9 AM email, urgent reminders and repeating tasks run on the hour.

Every email has a one-click "Mark done" link. Exec → Email shows the log and can run reminders on demand.

## Setup still needed

1. **Sending email.** The hub sends everything from team@agenticaiuw.com through Cloudflare Email Sending (the `EMAIL` binding in `wrangler.jsonc`). In the Cloudflare dashboard, Compute → Email Service → Email Sending → Onboard Domain, pick agenticaiuw.com. It adds its own records on `cf-bounce.agenticaiuw.com` and doesn't touch the domain's MX. Sending to anyone (not only verified addresses) needs the Workers Paid plan. Lists longer than 50 people go out in batches.
2. **Receiving email (the Inbox).** Email Routing for agenticaiuw.com, with a catch-all rule that sends to the `agenticaiuw-hub` Worker. That replaces the domain's MX records, so mail stops reaching Google. Execs read and reply at /inbox.
3. **Website rebuilds.** Create a fine-grained GitHub token for the `agenticaiuw/website` repository with Actions: Read and write, then save it as the `GITHUB_DISPATCH_TOKEN` secret on this Worker (`npx wrangler secret put GITHUB_DISPATCH_TOKEN`, or the Worker's Settings in the Cloudflare dashboard). Without it, saved text reaches the website only with the nightly rebuild. The website's GitHub Action also needs a `CLOUDFLARE_API_TOKEN` repository secret to deploy at all.
4. **First sign-in** at https://hub.agenticaiuw.com with eliu59@wisc.edu (already an exec) or team@agenticaiuw.com; both are bootstrap admins in `ADMIN_EMAILS`. Add the execs on the People page (`Name, email, exec`, one per line). Turn off the club account on its profile page so it doesn't appear in attendance.

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

## Collaboration workspace (local preparation)

The exec-only Collaboration page is integrated into the Hub's normal roster session and supports sessions, Codex thread bindings, task queuing, dispatch, stop controls, and run output. It is disabled until a dedicated HTTPS endpoint, backend bridge secret, and Cloudflare Access service-token pair are configured in Worker secrets (`COLLAB_ORIGIN`, `COLLAB_SERVICE_TOKEN`, `COLLAB_ACCESS_CLIENT_ID`, `COLLAB_ACCESS_CLIENT_SECRET`). The bridge is server-side; the browser never receives these credentials. The backend also needs a matching dedicated bridge token and a protected tunnel configured to preserve its loopback Host header. No tunnel, Access policy or Worker secrets are created by this code.

The backend is a local prototype, not a production-ready multi-tenant system. Exec access shares the workspace data; broader member/team isolation, recovery operations, operational backups, resource limits and an independent security review are needed before production. Run `npm test`, `npm run typecheck`, and, after building the separate local portal binary, `node test/hub-collaboration-integration.mjs` for a fixture-D1, locally intercepted bridge test. This test does not exercise a real Access policy or production sign-in.
