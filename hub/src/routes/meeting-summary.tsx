import { Hono } from 'hono';
import { formatTimestamp } from '../dates';
import { all } from '../db';
import { readForm, str } from '../form';
import type { AppEnv, MeetingRow } from '../types';
import { Field, Markdown } from '../views/ui';
import { loadMeeting } from './meeting-access';

type Revision = { id: number; entry_id: string; version: number; body: string; author_id: number | null; author_name: string; created_at: string };

export function summaryRevisions(db: D1Database, meeting: number) {
	return all<Revision>(db, 'SELECT * FROM meeting_summary_revisions WHERE meeting_id = ? ORDER BY id', meeting);
}

export function MeetingSummary({ m, revisions, zone }: { m: MeetingRow; revisions: Revision[]; zone: string }) {
	const entries = new Map<string, Revision[]>();
	for (const revision of revisions) {
		const history = entries.get(revision.entry_id) ?? [];
		history.push(revision);
		entries.set(revision.entry_id, history);
	}
	return <section class="card meeting-summary" aria-labelledby="summary">
		<div class="agenda-heading">
			<h2 class="section-title" id="summary">Meeting summary</h2>
			<button type="button" class="icon-btn agenda-add-button" aria-label="Add to meeting summary" title="Add to meeting summary"
				aria-haspopup="dialog" aria-controls="add-summary-dialog" data-members-dialog="add-summary-dialog"><span aria-hidden="true">+</span></button>
		</div>
		{m.notes && <Markdown text={m.notes} />}
		{!m.notes && !entries.size && <p class="hint">No meeting summary yet.</p>}
		{[...entries.values()].map((history) => {
			const original = history[0];
			const current = history[history.length - 1];
			return <article class="summary-entry">
				<Markdown text={current.body} />
				<p class="hint summary-attribution">Added by {original.author_name} · <time datetime={original.created_at}>{formatTimestamp(original.created_at, zone)}</time>
					{history.length > 1 && <> · Edited by {current.author_name} · <time datetime={current.created_at}>{formatTimestamp(current.created_at, zone)}</time></>}
				</p>
				<div class="inline-tools">
					<button type="button" class="link-btn small" aria-haspopup="dialog" aria-controls={`edit-summary-${current.entry_id}`} data-members-dialog={`edit-summary-${current.entry_id}`}>Edit</button>
				</div>
				{history.length > 1 && <details class="summary-history"><summary class="link-btn small">Edit history</summary>
					{history.map((revision) => <div class="summary-revision"><p class="hint">{revision.version === 1 ? 'Added' : 'Edited'} by {revision.author_name} · <time datetime={revision.created_at}>{formatTimestamp(revision.created_at, zone)}</time></p><Markdown text={revision.body} /></div>)}
				</details>}
				<dialog id={`edit-summary-${current.entry_id}`} class="members-dialog" aria-labelledby={`edit-summary-title-${current.entry_id}`}>
					<div class="members-dialog-content stack">
						<header><h2 id={`edit-summary-title-${current.entry_id}`}>Edit summary contribution</h2><form method="dialog"><button class="btn small">Close</button></form></header>
						<form method="post" action={`/meetings/${m.id}/summary/${current.entry_id}`} class="stack">
							<input type="hidden" name="version" value={current.version} />
							<Field label="Summary"><textarea name="body" rows={5} required maxlength={10000}>{current.body}</textarea></Field>
							<div><button class="btn primary small">Save changes</button></div>
						</form>
					</div>
				</dialog>
			</article>;
		})}
		<dialog id="add-summary-dialog" class="members-dialog" aria-labelledby="add-summary-title">
			<div class="members-dialog-content stack">
				<header><h2 id="add-summary-title">Add to meeting summary</h2><form method="dialog"><button class="btn small">Close</button></form></header>
				<form method="post" action={`/meetings/${m.id}/summary`} class="stack">
					<Field label="Summary"><textarea name="body" rows={5} required maxlength={10000} /></Field>
					<div><button class="btn primary small">Add to summary</button></div>
				</form>
			</div>
		</dialog>
	</section>;
}

export const meetingSummaryRoutes = new Hono<AppEnv>();

meetingSummaryRoutes.post('/meetings/:id/summary/:entry?', async (c) => {
	const viewer = c.get('viewer');
	const m = await loadMeeting(c, viewer, c.req.param('id'));
	if (!m) return c.notFound();
	const root = `/meetings/${m.id}?view=follow-up`;
	const form = await readForm(c);
	const raw = form.body;
	if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > 10000) return c.redirect(`${root}&error=summary#summary`);
	const body = raw.trim();
	const entry = c.req.param('entry');
	if (!entry) {
		await c.env.DB.prepare(`INSERT INTO meeting_summary_revisions (meeting_id, entry_id, version, body, author_id, author_name)
		 VALUES (?, ?, 1, ?, ?, ?)`).bind(m.id, crypto.randomUUID(), body, viewer.id, viewer.name).run();
		return c.redirect(`${root}&ok=created#summary`);
	}
	const version = Number(str(form.version));
	if (!Number.isSafeInteger(version) || version < 1) return c.redirect(`${root}&error=stale#summary`);
	const saved = await c.env.DB.prepare(`INSERT INTO meeting_summary_revisions (meeting_id, entry_id, version, body, author_id, author_name)
	 SELECT meeting_id, entry_id, version + 1, ?1, ?2, ?3 FROM meeting_summary_revisions r
	 WHERE meeting_id = ?4 AND entry_id = ?5 AND version = ?6
	 AND NOT EXISTS (SELECT 1 FROM meeting_summary_revisions newer WHERE newer.entry_id = r.entry_id AND newer.version > r.version)
	 ON CONFLICT(entry_id, version) DO NOTHING`).bind(body, viewer.id, viewer.name, m.id, entry, version).run();
	return c.redirect(`${root}&${saved.meta.changes ? 'ok=saved' : 'error=stale'}#summary`);
});
