import { Hono } from 'hono';
import { formatTimestamp } from '../dates';
import { all, first, run } from '../db';
import { id, readForm, str } from '../form';
import { isExec } from '../perm';
import type { AppEnv } from '../types';
import { page } from '../views/layout';
import { Empty, Field, Markdown, PageHead } from '../views/ui';

/**
 * The handbook: the club's current goals, rules and how things run. Every member can read it;
 * execs edit it. Each save is a new version, and older versions stay readable.
 */
export const handbookRoutes = new Hono<AppEnv>();

type Version = { id: number; body: string; edited_at: string; note: string; name: string | null };

const VERSION_SELECT = `SELECT v.id, v.body, v.edited_at, v.note, m.name FROM handbook_versions v LEFT JOIN members m ON m.id = v.edited_by`;

handbookRoutes.get('/handbook', async (c) => {
	const v = c.get('viewer');
	const tz = c.env.TIMEZONE;
	const latest = await first<Version>(c.env.DB, `${VERSION_SELECT} ORDER BY v.id DESC LIMIT 1`);
	const askedFor = id(c.req.query('v'));
	const shown = askedFor && askedFor !== latest?.id ? await first<Version>(c.env.DB, `${VERSION_SELECT} WHERE v.id = ?`, askedFor) : latest;
	if (askedFor && !shown) return c.notFound();
	const old = !!shown && shown.id !== latest?.id;
	const history = isExec(v) ? await all<Omit<Version, 'body'>>(c.env.DB, `SELECT v.id, v.edited_at, v.note, m.name FROM handbook_versions v LEFT JOIN members m ON m.id = v.edited_by ORDER BY v.id DESC LIMIT 50`) : [];

	return page(
		c,
		{ title: 'Handbook', active: 'handbook' },
		<>
			<PageHead
				title="Handbook"
				sub={
					shown
						? <>The club's goals and rules as they stand now. If a Drive doc says something else, this page is right. Last changed by {shown.name ?? 'someone'}, {formatTimestamp(shown.edited_at, tz)}.</>
						: "The club's goals and rules as they stand now."
				}
			/>
			{old && (
				<p class="card handbook-old">
					This is an older version. <a href="/handbook">See the current handbook</a>.
				</p>
			)}
			<article class="card handbook">
				{shown ? <Markdown text={shown.body} /> : <Empty>Nothing here yet.</Empty>}
			</article>
			{isExec(v) && !old && (
				<details class="card disclose">
					<summary>Edit handbook</summary>
					<form method="post" action="/handbook" class="stack">
						<input type="hidden" name="base" value={String(latest?.id ?? 0)} />
						<Field label="Text" hint="# Heading, - bullet, **bold**, [link](https://…)">
							<textarea name="body" rows={28} maxlength={50000} required>{latest?.body ?? ''}</textarea>
						</Field>
						<Field label="What changed" hint="Optional. Shown in the history.">
							<input name="note" maxlength={200} />
						</Field>
						<div>
							<button class="btn primary">Save</button>
						</div>
					</form>
				</details>
			)}
			{history.length > 1 && (
				<details class="card disclose">
					<summary>History</summary>
					<ol class="handbook-history">
						{history.map((h) => (
							<li>
								<a href={h.id === latest?.id ? '/handbook' : `/handbook?v=${h.id}`} aria-current={h.id === shown?.id ? 'page' : undefined}>
									{formatTimestamp(h.edited_at, tz)}
								</a>
								<span class="muted"> · {h.name ?? 'Someone'}{h.note && ` · ${h.note}`}</span>
							</li>
						))}
					</ol>
				</details>
			)}
		</>
	);
});

handbookRoutes.post('/handbook', async (c) => {
	const v = c.get('viewer');
	if (!isExec(v)) return c.redirect('/handbook?error=forbidden');
	const form = await readForm(c);
	const body = str(form.body, 50000).replace(/\r\n/g, '\n').trim();
	if (!body) return c.redirect('/handbook?error=missing');
	const latest = await first<{ id: number; body: string }>(c.env.DB, 'SELECT id, body FROM handbook_versions ORDER BY id DESC LIMIT 1');
	if ((latest?.id ?? 0) !== (id(form.base) ?? 0)) return c.redirect('/handbook?error=stale');
	if (latest?.body === body) return c.redirect('/handbook?ok=site-unchanged');
	await run(c.env.DB, 'INSERT INTO handbook_versions (body, edited_by, note) VALUES (?, ?, ?)', body, v.id, str(form.note, 200));
	return c.redirect('/handbook?ok=saved');
});
