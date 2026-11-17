import { type Context, Hono, type MiddlewareHandler } from 'hono';
import type { FC } from 'hono/jsx';

type Out = ReturnType<FC>;
import { formatTimestamp } from '../dates';
import { id, readForm, str } from '../form';
import { isExec } from '../perm';
import { type Field, PAGES, type Section, SECTIONS, TOKENS, sectionByKey } from '../site/schema';
import { type Change, type VersionRow, coerce, defaultsFor, diffSection, history, latestRows, saveSection, sectionData, siteContent, versionById, wordDiff } from '../site/store';
import type { AppEnv } from '../types';
import { Notice, page } from '../views/layout';
import { Empty, PageHead } from '../views/ui';

/** Read by the public website on every page view. No sign-in, no personal data. */
export const publicSiteRoutes = new Hono<AppEnv>();

publicSiteRoutes.get('/api/site', async (c) => {
	const content = await siteContent(c.env.DB);
	c.header('Access-Control-Allow-Origin', '*');
	return c.json(content);
});

export const siteRoutes = new Hono<AppEnv>();

const execOnly: MiddlewareHandler<AppEnv> = async (c, next) => (isExec(c.get('viewer')) ? next() : c.redirect('/?error=forbidden'));
siteRoutes.use('/site', execOnly);
siteRoutes.use('/site/*', execOnly);

const PAGE_HREF: Record<string, string> = { 'Every page': '/', Home: '/', Teams: '/teams/', Events: '/events/', Join: '/join/', Partners: '/partners/', FAQ: '/faq/' };
const SITE = 'https://agenticaiuw.com';

function When({ iso, tz }: { iso: string; tz: string }) {
	return <time datetime={iso} title={iso}>{formatTimestamp(iso, tz)}</time>;
}

function Edited({ row, tz }: { row?: VersionRow | null; tz: string }) {
	if (!row) return <span class="muted">Original site text</span>;
	return (
		<span class="muted">
			{row.name ?? 'Someone'} · <When iso={row.edited_at} tz={tz} />
		</span>
	);
}

// ---------- overview ----------

siteRoutes.get('/site', async (c) => {
	const latest = await latestRows(c.env.DB);
	const tz = c.env.TIMEZONE;
	return page(
		c,
		{ title: 'Website', active: 'site' },
		<>
			<PageHead
				title="Website"
				sub={<>Everything on agenticaiuw.com. Changes go live within a minute, and every edit is kept with who made it.</>}
				actions={
					<>
						<a class="btn" href="/site/history">History</a>
						<a class="btn" href={SITE} target="_blank" rel="noopener noreferrer">Open the site ↗</a>
					</>
				}
			/>
			<div class="site-pages">
				{PAGES.map((p) => (
					<section class="site-page">
						<h2 class="site-page-title">
							{p}
							{p !== 'Every page' && (
								<a class="site-page-link" href={SITE + PAGE_HREF[p]} target="_blank" rel="noopener noreferrer">
									View ↗
								</a>
							)}
						</h2>
						<ul class="site-sections card">
							{SECTIONS.filter((s) => s.page === p).map((s) => (
								<li>
									<a href={`/site/${s.key}`} class="site-section-link">
										<span class="site-section-title">{s.title}</span>
										<span class="site-section-where">{s.where}</span>
										<span class="site-section-meta">
											<Edited row={latest.get(s.key)} tz={tz} />
										</span>
									</a>
								</li>
							))}
						</ul>
					</section>
				))}
			</div>
		</>
	);
});

// ---------- history ----------

const PER_PAGE = 25;

function ChangeList({ changes }: { changes: Change[] }) {
	if (!changes.length) return <p class="muted site-nochange">No differences.</p>;
	return (
		<ul class="site-changes">
			{changes.map((ch) => (
				<li>
					<p class="site-change-label">{ch.label}</p>
					<DiffText before={ch.before} after={ch.after} />
				</li>
			))}
		</ul>
	);
}

function DiffText({ before, after }: { before: string; after: string }) {
	if (!before) return <p class="site-diff"><ins>{after}</ins></p>;
	if (!after) return <p class="site-diff"><del>{before}</del></p>;
	return (
		<p class="site-diff">
			{wordDiff(before, after).map((p) => (p.t === 'same' ? p.s : p.t === 'del' ? <del>{p.s}</del> : <ins>{p.s}</ins>))}
		</p>
	);
}

function changesOf(r: VersionRow & { prev: string | null }) {
	const section = sectionByKey(r.section);
	if (!section) return [];
	const before = r.prev ? { ...defaultsFor(r.section), ...JSON.parse(r.prev) } : defaultsFor(r.section);
	return diffSection(section, before, { ...defaultsFor(r.section), ...JSON.parse(r.data) });
}

function HistoryEntry({ r, tz, showSection, latestId }: { r: VersionRow & { prev: string | null }; tz: string; showSection: boolean; latestId?: number }) {
	const section = sectionByKey(r.section);
	const changes = changesOf(r);
	return (
		<li class="card site-entry">
			<div class="site-entry-head">
				<div>
					<p class="site-entry-who">
						<strong>{r.name ?? 'Someone'}</strong> {r.restored_from ? <>restored version {r.restored_from} of</> : <>edited</>}{' '}
						{showSection ? <a href={`/site/${r.section}`}>{section?.title ?? r.section}</a> : section?.title ?? r.section}
					</p>
					<p class="muted site-entry-when">
						<When iso={r.edited_at} tz={tz} /> · Version {r.id} · {changes.length} {changes.length === 1 ? 'change' : 'changes'}
						{latestId === r.id && <span class="tag">Live</span>}
					</p>
					{r.note && <p class="site-entry-note">“{r.note}”</p>}
				</div>
				<a class="btn small" href={`/site/v/${r.id}`}>View</a>
			</div>
			<ChangeList changes={changes.slice(0, 12)} />
			{changes.length > 12 && (
				<p class="muted">
					<a href={`/site/v/${r.id}`}>{changes.length - 12} more changes</a>
				</p>
			)}
		</li>
	);
}

async function historyPage(c: Context<AppEnv>, section?: Section) {
	const before = id(c.req.query('before')) ?? undefined;
	const rows = await history(c.env.DB, { section: section?.key, before, limit: PER_PAGE + 1 });
	const more = rows.length > PER_PAGE;
	const shown = rows.slice(0, PER_PAGE);
	const latest = await latestRows(c.env.DB);
	const tz = c.env.TIMEZONE;
	const base = section ? `/site/${section.key}/history` : '/site/history';
	return page(
		c,
		{ title: section ? `${section.title} history` : 'Website history', active: 'site' },
		<>
			<PageHead
				eyebrow="Website"
				title={section ? `${section.title}: history` : 'History'}
				sub={<>Every edit to the website, newest first, with who made it and exactly what changed.</>}
				actions={<a class="btn" href={section ? `/site/${section.key}` : '/site'}>{section ? 'Back to editor' : 'All sections'}</a>}
			/>
			{shown.length ? (
				<ol class="site-history">
					{shown.map((r) => (
						<HistoryEntry r={r} tz={tz} showSection={!section} latestId={latest.get(r.section)?.id} />
					))}
					{section && !more && (
						<li class="card site-entry">
							<div class="site-entry-head">
								<div>
									<p class="site-entry-who">
										<strong>Original site text</strong>
									</p>
									<p class="muted site-entry-when">What this section said before editing moved to the hub.</p>
								</div>
								<form method="post" action={`/site/${section.key}/restore-original`} class="inline" data-confirm="Put back the original text? The current text stays in the history.">
									<button class="btn small">Restore</button>
								</form>
							</div>
						</li>
					)}
				</ol>
			) : (
				<Empty>No edits yet. The site still shows its original text.</Empty>
			)}
			{(more || before) && (
				<nav class="site-pager" aria-label="History pages">
					{before && <a class="btn" href={base}>Newest</a>}
					{more && <a class="btn" href={`${base}?before=${shown[shown.length - 1].id}`}>Older</a>}
				</nav>
			)}
		</>
	);
}

siteRoutes.get('/site/history', (c) => historyPage(c));

siteRoutes.get('/site/v/:id', async (c) => {
	const v = await versionById(c.env.DB, id(c.req.param('id')) ?? 0);
	const section = v && sectionByKey(v.section);
	if (!v || !section) return c.notFound();
	const latest = await latestRows(c.env.DB);
	const isLive = latest.get(v.section)?.id === v.id;
	const tz = c.env.TIMEZONE;
	return page(
		c,
		{ title: `Version ${v.id}`, active: 'site' },
		<>
			<PageHead
				eyebrow={section.title}
				title={`Version ${v.id}`}
				sub={
					<>
						{v.name ?? 'Someone'} · <When iso={v.edited_at} tz={tz} />
						{v.restored_from ? <> · restored from version {v.restored_from}</> : null}
						{v.note && <> · “{v.note}”</>}
					</>
				}
				actions={
					<>
						<a class="btn" href={`/site/${section.key}/history`}>History</a>
						{isLive ? (
							<span class="tag">Live</span>
						) : (
							<form method="post" action={`/site/${section.key}/restore/${v.id}`} class="inline" data-confirm="Make this version live again? The current text stays in the history.">
								<button class="btn primary">Restore this version</button>
							</form>
						)}
					</>
				}
			/>
			<section class="card">
				<h2 class="site-h2">What changed</h2>
				<ChangeList changes={changesOf(v)} />
			</section>
		</>
	);
});

siteRoutes.post('/site/:key/restore/:id', async (c) => {
	const section = sectionByKey(c.req.param('key'));
	const v = await versionById(c.env.DB, id(c.req.param('id')) ?? 0);
	if (!section || !v || v.section !== section.key) return c.notFound();
	const errors: string[] = [];
	const data = coerce(section.fields, { ...defaultsFor(section.key), ...JSON.parse(v.data) }, errors);
	await saveSection(c.env.DB, section.key, data, c.get('viewer').id, `Restored version ${v.id}`, v.id);
	return c.redirect(`/site/${section.key}?ok=restored`);
});

siteRoutes.post('/site/:key/restore-original', async (c) => {
	const section = sectionByKey(c.req.param('key'));
	if (!section) return c.notFound();
	await saveSection(c.env.DB, section.key, defaultsFor(section.key), c.get('viewer').id, 'Restored the original site text');
	return c.redirect(`/site/${section.key}?ok=restored`);
});

// ---------- editor ----------

siteRoutes.get('/site/:key/history', (c) => {
	const section = sectionByKey(c.req.param('key'));
	return section ? historyPage(c, section) : c.notFound();
});

siteRoutes.get('/site/:key', async (c) => {
	const section = sectionByKey(c.req.param('key'));
	if (!section) return c.notFound();
	const { row, data } = await sectionData(c.env.DB, section.key);
	const recent = await history(c.env.DB, { section: section.key, limit: 5 });
	return editor(c, section, data, row, recent);
});

siteRoutes.post('/site/:key', async (c) => {
	const section = sectionByKey(c.req.param('key'));
	if (!section) return c.notFound();
	const form = await readForm(c);
	const raw = str(form.data, 400_000);
	const note = str(form.note, 200);
	const base = id(form.base);
	let input: unknown;
	try {
		input = JSON.parse(raw);
	} catch {
		input = null;
	}
	const { row, data: current } = await sectionData(c.env.DB, section.key);
	const recent = await history(c.env.DB, { section: section.key, limit: 5 });
	if (!input) return editor(c, section, current, row, recent, { errors: ['The editor needs JavaScript turned on to save.'] });
	const errors: string[] = [];
	const data = coerce(section.fields, input, errors);
	if (errors.length) return editor(c, section, data, row, recent, { errors, note, base });
	// Someone else saved while this person was editing: show their work, don't overwrite it silently.
	if ((row?.id ?? null) !== base && str(form.force) !== '1') {
		return editor(c, section, data, row, recent, { stale: row, note, base });
	}
	const saved = await saveSection(c.env.DB, section.key, data, c.get('viewer').id, note);
	return c.redirect(`/site/${section.key}?ok=${saved ? 'site-saved' : 'site-unchanged'}`);
});

type EditorState = { errors?: string[]; stale?: VersionRow | null; note?: string; base?: number | null };

function editor(c: Context<AppEnv>, section: Section, data: Record<string, unknown>, row: VersionRow | null, recent: (VersionRow & { prev: string | null })[], state: EditorState = {}) {
	const tz = c.env.TIMEZONE;
	const status = state.errors?.length || state.stale ? 400 : 200;
	if (status !== 200) c.status(status);
	return page(
		c,
		{ title: section.title, active: 'site' },
		<>
			<PageHead
				eyebrow={`Website · ${section.page}`}
				title={section.title}
				sub={section.where}
				actions={
					<>
						<a class="btn" href={`/site/${section.key}/history`}>History</a>
						{section.page !== 'Every page' && (
							<a class="btn" href={SITE + PAGE_HREF[section.page]} target="_blank" rel="noopener noreferrer">
								View page ↗
							</a>
						)}
					</>
				}
			/>
			{state.errors?.length ? (
				<div class="system-notices site-notices">
					<Notice error>
						<p>Nothing was saved yet. Fix these first:</p>
						<ul>
							{state.errors.slice(0, 12).map((e) => (
								<li>{e}</li>
							))}
						</ul>
					</Notice>
				</div>
			) : null}
			{state.stale !== undefined && (
				<div class="system-notices site-notices">
					<Notice error>
						{state.stale ? (
							<>
								{state.stale.name ?? 'Someone'} saved this section at <When iso={state.stale.edited_at} tz={tz} /> while you were editing. Your text is still below. Check <a href={`/site/v/${state.stale.id}`}>their change</a>, then press Save again to replace it with yours.
							</>
						) : (
							<>This section changed while you were editing. Your text is still below; press Save again to keep it.</>
						)}
					</Notice>
				</div>
			)}
			<div class="site-editor-layout">
				<form method="post" action={`/site/${section.key}`} class="site-form" data-site-form>
					<input type="hidden" name="data" value="" />
					<input type="hidden" name="base" value={String(row?.id ?? '')} />
					{state.stale !== undefined && <input type="hidden" name="force" value="1" />}
					<div class="site-root card" data-site-root>
						<Fields fields={section.fields} data={data} />
					</div>
					<div class="site-savebar">
						<label class="site-note">
							<span class="sr-only">Note about this change</span>
							<textarea name="note" rows={1} maxlength={200} placeholder="What changed? (optional, shown in History)" data-note>
								{state.note ?? ''}
							</textarea>
						</label>
						<button class="btn primary">Save</button>
					</div>
				</form>
				<aside class="site-aside">
					<section class="card">
						<h2 class="site-h2">Last edit</h2>
						<p>
							<Edited row={row} tz={tz} />
						</p>
						{recent.length > 0 && (
							<ol class="site-recent">
								{recent.map((r) => (
									<li>
										<a href={`/site/v/${r.id}`}>Version {r.id}</a>
										<span class="muted">
											{' '}
											· {r.name ?? 'Someone'} · <When iso={r.edited_at} tz={tz} />
										</span>
									</li>
								))}
							</ol>
						)}
						<p>
							<a href={`/site/${section.key}/history`}>Full history →</a>
						</p>
					</section>
					<details class="card disclose site-tokens">
						<summary>Placeholders</summary>
						<p class="hint">Type these in any text and the site fills them in, so a number or name only has to change in one place.</p>
						<dl>
							{TOKENS.map(([t, d]) => (
								<>
									<dt>
										<code>{t}</code>
									</dt>
									<dd>{d}</dd>
								</>
							))}
						</dl>
					</details>
				</aside>
			</div>
		</>
	);
}

// ---------- form fields ----------

const rowsFor = (s: string, min = 2) => Math.min(14, Math.max(min, Math.ceil(s.length / 70) + s.split('\n').length - 1));

function Fields({ fields, data }: { fields: Field[]; data: Record<string, unknown> }): Out {
	return (
		<>
			{fields.map((f) => (
				<FieldInput f={f} value={data?.[f.k]} />
			))}
		</>
	);
}

function Hint({ text }: { text?: string }) {
	return text ? <span class="hint">{text}</span> : null;
}

function FieldInput({ f, value }: { f: Field; value: unknown }): Out {
	switch (f.t) {
		case 'group':
			return (
				<fieldset class="site-group" data-obj data-k={f.k}>
					<legend>{f.label}</legend>
					<Fields fields={f.fields} data={(value as Record<string, unknown>) ?? {}} />
				</fieldset>
			);
		case 'list': {
			const items = (value as Record<string, unknown>[]) ?? [];
			return (
				<div class="site-list" data-list data-k={f.k}>
					<div class="site-list-head">
						<span class="label">{f.label}</span>
						<span class="muted site-count" data-count>
							{items.length}
						</span>
					</div>
					<Hint text={f.hint} />
					<ol class="site-items" data-items>
						{items.map((item, i) => (
							<ListItem f={f} item={item} i={i} />
						))}
					</ol>
					<template data-tpl>
						<ListItem f={f} item={{}} i={-1} open />
					</template>
					<button type="button" class="btn small site-add" data-add>
						+ Add {f.item}
					</button>
				</div>
			);
		}
		case 'strings': {
			const items = (value as string[]) ?? [];
			const one = (s: string) => (
				<li class="site-string" data-item>
					<input data-k="" value={s} aria-label={f.item} maxlength={400} />
					<ItemTools item={f.item} />
				</li>
			);
			return (
				<div class="site-list" data-list data-strings data-k={f.k}>
					<div class="site-list-head">
						<span class="label">{f.label}</span>
					</div>
					<Hint text={f.hint} />
					<ol class="site-items" data-items>
						{items.map(one)}
					</ol>
					<template data-tpl>{one('')}</template>
					<button type="button" class="btn small site-add" data-add>
						+ Add {f.item}
					</button>
				</div>
			);
		}
		case 'bool':
			return (
				<label class="check site-check">
					<input type="checkbox" data-k={f.k} checked={!!value} /> {f.label}
					{f.hint && <span class="hint"> {f.hint}</span>}
				</label>
			);
		case 'number':
			return (
				<label class="field">
					<span class="label">{f.label}</span>
					<input type="number" step="any" data-k={f.k} value={String(value ?? '')} />
					<Hint text={f.hint} />
				</label>
			);
		case 'long':
		case 'rich': {
			const s = String(value ?? '');
			return (
				<label class="field">
					<span class="label">
						{f.label}
						{f.optional && <span class="muted"> (optional)</span>}
					</span>
					<textarea data-k={f.k} rows={rowsFor(s)}>
						{s}
					</textarea>
					<Hint text={f.hint} />
				</label>
			);
		}
		default:
			return (
				<label class="field">
					<span class="label">
						{f.label}
						{f.optional && <span class="muted"> (optional)</span>}
					</span>
					<input type={f.t === 'date' ? 'date' : 'text'} data-k={f.k} value={String(value ?? '')} inputmode={f.t === 'url' ? 'url' : undefined} />
					<Hint text={f.hint} />
				</label>
			);
	}
}

function ItemTools({ item }: { item: string }) {
	return (
		<span class="site-item-tools">
			<button type="button" class="icon-btn" data-move="-1" aria-label={`Move ${item} up`} title="Move up">
				↑
			</button>
			<button type="button" class="icon-btn" data-move="1" aria-label={`Move ${item} down`} title="Move down">
				↓
			</button>
			<button type="button" class="icon-btn site-remove" data-remove aria-label={`Remove ${item}`} title="Remove">
				×
			</button>
		</span>
	);
}

function ListItem({ f, item, i, open }: { f: Extract<Field, { t: 'list' }>; item: Record<string, unknown>; i: number; open?: boolean }) {
	const title = (f.title && String(item?.[f.title] ?? '').trim()) || (i >= 0 ? `${f.item.charAt(0).toUpperCase() + f.item.slice(1)} ${i + 1}` : `New ${f.item}`);
	return (
		<li class="site-item" data-item>
			<details open={open}>
				<summary>
					<span class="site-item-title" data-item-title data-title-key={f.title ?? ''} data-fallback={`New ${f.item}`}>
						{title}
					</span>
				</summary>
				<div class="site-item-body">
					<Fields fields={f.fields} data={item} />
				</div>
			</details>
			<ItemTools item={f.item} />
		</li>
	);
}
