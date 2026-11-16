import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { all, first, run } from '../db';
import { id, isHttpUrl, readForm, str } from '../form';
import { FILE_LIMIT, FILE_PART, MEETING_FILE_BUDGET, TOTAL_FILE_BUDGET, meetingFileType, meetingTiming } from '../meeting-content';
import { canEditMeeting, isExec } from '../perm';
import type { AppEnv, MeetingRow, Viewer } from '../types';
import { Field, Markdown, PostButton } from '../views/ui';
import { loadMeeting } from './meeting-access';

type Agenda = { id: number; title: string; duration_minutes: number; author_id: number | null; author_name: string; position: number; version: number; removed: number; body: string | null; note_version: number | null };
type Attachment = { id: string; agenda_id: number | null; author_id: number | null; author_name: string | null; created_at: string | null; name: string; original_name: string; media_type: string; size: number; url: string | null };
type Content = { agenda: Agenda[]; files: Attachment[] };
type Props = { m: MeetingRow; viewer: Viewer; content: Content; zone: string };

export const meetingContentRoutes = new Hono<AppEnv>();

export async function meetingContent(db: D1Database, meetingId: number): Promise<Content> {
	const [agenda, files] = await Promise.all([
		all<Agenda>(db, `SELECT a.*, n.body, n.version AS note_version FROM meeting_agenda a
		 LEFT JOIN meeting_speaker_notes n ON n.agenda_id = a.id
		 WHERE a.meeting_id = ? ORDER BY a.position, a.id`, meetingId),
		all<Attachment>(db, `SELECT f.id, f.agenda_id, f.author_id, m.name AS author_name, f.created_at, COALESCE(f.display_name, f.name) AS name, f.media_type, f.size, NULL AS url, f.name AS original_name
		 FROM meeting_attachments f LEFT JOIN members m ON m.id = f.author_id WHERE f.meeting_id = ?1 AND f.removed = 0
		 UNION ALL SELECT l.id, NULL, l.author_id, m.name, l.created_at, l.name, 'text/uri-list', 0, l.url, l.name
		 FROM meeting_library_links l LEFT JOIN members m ON m.id = l.author_id WHERE l.meeting_id = ?1 AND l.removed = 0
		 ORDER BY 5 DESC, 1 DESC`, meetingId)
	]);
	return { agenda, files };
}

function canWrite(m: MeetingRow, viewer: Viewer, zone: string, author: number | null) {
	return isExec(viewer) || author === viewer.id;
}

export function fileKind(name: string): string {
	const ext = name.split('.').pop()?.toLowerCase() ?? '';
	if (['doc', 'docx'].includes(ext)) return 'Word document';
	if (['ppt', 'pptx'].includes(ext)) return 'PowerPoint';
	if (['xls', 'xlsx'].includes(ext)) return 'Excel spreadsheet';
	if (ext === 'pdf') return 'PDF';
	if (ext === 'txt') return 'Text file';
	if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'Image';
	if (['wav', 'mp3', 'ogg', 'flac', 'm4a'].includes(ext)) return 'Audio';
	return 'File';
}

function FileList({ m, files, writable, zone }: { m: MeetingRow; files: Attachment[]; writable: (file: Attachment) => boolean; zone: string }) {
	return (
		<ul class="att-list library-list">
			{files.map((file) => {
				const path = `/meetings/${m.id}/${file.url ? 'library-links' : 'files'}/${file.id}`;
				const kind = file.url ? 'Link' : fileKind(file.original_name);
				return (
					<li class="library-file" data-library-item data-library-type={kind} data-library-author={file.author_id === null ? 'unknown' : String(file.author_id)}>
						<span class="library-icon" aria-hidden="true">{kind === 'Link' ? '↗' : kind === 'Image' ? '▧' : kind === 'Audio' ? '♫' : kind === 'PowerPoint' ? 'P' : kind === 'Word document' ? 'W' : kind === 'Excel spreadsheet' ? 'X' : kind === 'PDF' ? 'PDF' : '≡'}</span>
						<div class="library-file-info"><a href={file.url ?? path} target={file.url ? '_blank' : undefined} rel={file.url ? 'noopener noreferrer' : undefined}>{file.name}</a>
							<span class="hint">{kind} · Added by {file.author_name ?? 'Unknown'} · {file.created_at ? <time datetime={file.created_at}>{new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: zone }).format(new Date(file.created_at))}</time> : 'Date unknown'}</span></div>
						{file.media_type.startsWith('audio/') && <audio controls preload="none" src={`${path}?play=1`} />}
						{writable(file) && <PostButton action={`${path}/remove`} label="Remove" removeLabel={`Remove ${file.name}`} confirm={`Remove ${file.name}?`} />}
					</li>
				);
			})}
		</ul>
	);
}

function Upload({ root, agenda }: { root: string; agenda?: number }) {
	return (
		<form class="inline-tools" method="post" enctype="multipart/form-data" action={`${root}/files`}>
			{agenda !== undefined && <input type="hidden" name="agenda" value={agenda} />}
			<input type="file" name="file" aria-label="Attachments" multiple required />
			<button class="btn small">Upload files</button>
		</form>
	);
}

export function MeetingAgenda({ m, viewer, content, zone }: Props) {
	const root = `/meetings/${m.id}`;
	const agenda = content.agenda.filter((a) => !a.removed);
	const ended = meetingTiming(m, zone).ended;
	const editor = canEditMeeting(viewer, m);
	return (
		<section class="meeting-agenda" aria-label="Agenda" id="agenda">
			<div class="agenda-heading">
				<h2 class="section-title">Agenda</h2>
				{!ended && <button type="button" class="btn small" aria-haspopup="dialog" aria-controls="add-agenda-dialog" data-members-dialog="add-agenda-dialog">+ Add item</button>}
			</div>
			{m.agenda.trim() && <Markdown text={m.agenda} />}
			{!agenda.length && !m.agenda.trim() && <p class="hint">No agenda items yet.</p>}
			{agenda.length > 0 && <ol class="stack agenda-items">
				{agenda.map((item, i) => {
					const path = `${root}/agenda/${item.id}`;
					const writable = canWrite(m, viewer, zone, item.author_id);
					const files = content.files.filter((f) => f.agenda_id === item.id);
					const hasNotes = !!item.body?.trim();
					const expandable = hasNotes || files.length > 0;
					const row = <><span class="agenda-number" aria-hidden="true">{i + 1}.</span>
						<span class="agenda-row-text"><strong class="agenda-item-title">{item.title}</strong>{item.author_name?.trim() && <span class="agenda-author">{item.author_name}</span>}</span>
						{item.duration_minutes > 0 && <span class="agenda-duration">~{item.duration_minutes} min</span>}
						{expandable && <svg class="agenda-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>}</>;
					return (
						<li class="agenda-item">
							<div class="agenda-item-layout">
								{expandable ? <details class="agenda-expand"><summary class="agenda-row">{row}</summary><div class="agenda-notes">{hasNotes && <Markdown text={item.body ?? ''} />}{files.length > 0 && <><p class="agenda-files-label">Attachments</p><FileList m={m} files={files} writable={(file) => canWrite(m, viewer, zone, file.author_id)} zone={zone} /></>}</div></details> : <div class="agenda-row agenda-static">{row}</div>}
								{writable && <button type="button" class="btn small agenda-edit" aria-label={`Edit ${item.title}`} aria-haspopup="dialog" aria-controls={`agenda-edit-${item.id}`} data-members-dialog={`agenda-edit-${item.id}`}>Edit</button>}
							</div>
							{writable && <dialog id={`agenda-edit-${item.id}`} class="members-dialog" aria-labelledby={`agenda-edit-${item.id}-title`}>
								<div class="members-dialog-content stack">
									<header><h2 id={`agenda-edit-${item.id}-title`}>Edit agenda item</h2><form method="dialog"><button type="submit" class="icon-btn" aria-label="Close" title="Close">?</button></form></header>
									<form class="stack" method="post" action={path}>
										<input type="hidden" name="version" value={item.version} />
										<Field label="Title"><input name="title" maxlength={200} required value={item.title} /></Field>
										<Field label="Duration (minutes)"><input type="number" name="duration_minutes" required min={1} max={1440} step={1} value={item.duration_minutes} /></Field>
										<div><button class="btn small primary">Save item</button></div>
									</form>
									<form class="stack" method="post" action={`${path}/notes`}>
										<input type="hidden" name="version" value={item.note_version ?? 0} />
										<Field label="Speaker notes"><textarea name="notes" maxlength={10000} rows={3}>{item.body ?? ''}</textarea></Field>
										<div><button class="btn small">Save notes</button></div>
									</form>
									{files.length > 0 && <FileList m={m} files={files} writable={(file) => canWrite(m, viewer, zone, file.author_id)} zone={zone} />}
									<Upload root={root} agenda={item.id} />
									<div class="inline-tools">
										{editor && i > 0 && <PostButton action={`${path}/up`} label="Move up" cls="btn small" name="version" value={String(item.version)} />}
										<PostButton action={`${path}/remove`} label="Remove item" removeLabel={`Remove ${item.title}`} name="version" value={String(item.version)} confirm="Remove this agenda item? Its notes and files will stay with the meeting." />
									</div>
								</div>
							</dialog>}
						</li>
					);
				})}
			</ol>}
			{!ended && <dialog id="add-agenda-dialog" class="members-dialog" aria-labelledby="add-agenda-title">
				<div class="members-dialog-content stack">
					<header>
						<h2 id="add-agenda-title">Add agenda item</h2>
						<form method="dialog"><button class="icon-btn" aria-label="Close" title="Close" type="submit">×</button></form>
					</header>
				<form class="stack" method="post" enctype="multipart/form-data" action={`${root}/agenda`}>
					<Field label="Title"><input name="title" maxlength={200} required /></Field>
					<Field label="Duration (minutes)"><input type="number" name="duration_minutes" required min={1} max={1440} step={1} value={2} /></Field>
					<Field label="Speaker notes"><textarea name="notes" maxlength={10000} rows={2}></textarea></Field>
					<Field label="Attachments (optional)" hint="PDF, Word, PowerPoint, Excel, text, images or audio. Up to 8 MiB combined.">
						<input type="file" name="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.gif,.webp,.wav,.mp3,.ogg,.flac,.m4a" />
					</Field>
					<div><button class="btn small primary">Save item</button></div>
				</form>
				</div>
			</dialog>}
		</section>
	);
}

export function MeetingFiles({ m, viewer, content, zone }: Props) {
	const canUpload = canWrite(m, viewer, zone, viewer.id);
	const authors = [...new Map(content.files.map((file) => [file.author_id === null ? 'unknown' : String(file.author_id), file.author_name ?? 'Unknown'])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
	const kinds = [...new Set(content.files.map((file) => file.url ? 'Link' : fileKind(file.original_name)))].sort();
	return (
		<section id="files" class="card meeting-library" aria-labelledby="library-title">
			<div class="agenda-heading library-heading">
				<h2 id="library-title" class="section-title">Library</h2>
				{canUpload && <button type="button" class="btn small" aria-haspopup="dialog" aria-controls="add-library-file" data-members-dialog="add-library-file">+ Add file or link</button>}
			</div>
			{content.agenda.filter((item) => item.removed && item.body).map((item) => (
				<div class="card"><strong>{item.title}</strong><Markdown text={item.body ?? ''} /></div>
			))}
			{content.files.length > 0 && <div class="library-filters" data-library-filters>
				<label>Added by <select data-library-author-filter><option value="">Everyone</option>{authors.map(([value, name]) => <option value={value}>{name}</option>)}</select></label>
				<label>Type <select data-library-type-filter><option value="">All types</option>{kinds.map((kind) => <option value={kind}>{kind}</option>)}</select></label>
			</div>}
			{content.files.length ? <FileList m={m} files={content.files} zone={zone} writable={(file) => canWrite(m, viewer, zone, file.author_id)} /> : <p class="hint">No files yet.</p>}
			{content.files.length > 0 && <p class="hint" data-library-no-results hidden>No items match these filters.</p>}
			{canUpload && <dialog id="add-library-file" class="members-dialog" aria-labelledby="add-library-file-title">
				<div class="members-dialog-content stack">
					<header><h2 id="add-library-file-title">Add file to library</h2><form method="dialog"><button type="submit" class="icon-btn" aria-label="Close" title="Close">×</button></form></header>
					<div data-library-tabs>
					<div class="seg library-add-tabs" role="tablist" aria-label="Library item type">
						<button type="button" role="tab" id="library-file-tab" aria-controls="library-file-panel" aria-selected="true" tabindex={0}>Add file</button>
						<button type="button" role="tab" id="library-link-tab" aria-controls="library-link-panel" aria-selected="false" tabindex={-1}>Add link</button>
					</div>
					<form id="library-file-panel" role="tabpanel" aria-labelledby="library-file-tab" class="stack" method="post" enctype="multipart/form-data" action={`/meetings/${m.id}/files`}>
						<Field label="Name"><input name="name" required maxlength={200} /></Field>
						<Field label="File" hint="PDF, Word, PowerPoint, Excel, text, images or audio. Up to 8 MiB."><input type="file" name="file" required accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.gif,.webp,.wav,.mp3,.ogg,.flac,.m4a" /></Field>
						<div><button class="btn small primary">Save</button></div>
					</form>
					<form id="library-link-panel" role="tabpanel" aria-labelledby="library-link-tab" hidden class="stack" method="post" action={`/meetings/${m.id}/library-links`}>
						<Field label="Name"><input name="name" required maxlength={200} /></Field>
						<Field label="Link"><input type="url" name="url" required maxlength={2048} placeholder="https://example.com" /></Field>
						<div><button class="btn small primary">Save</button></div>
					</form>
					</div>
				</div>
			</dialog>}
		</section>
	);
}

meetingContentRoutes.post('/meetings/:id/library-links', async (c) => {
	const viewer = c.get('viewer');
	const meeting = await loadMeeting(c, viewer, c.req.param('id'));
	if (!meeting || !canWrite(meeting, viewer, c.env.TIMEZONE, viewer.id)) return c.notFound();
	const form = await readForm(c);
	const name = str(form.name, 200);
	const url = str(form.url, 2048);
	const path = `/meetings/${meeting.id}`;
	if (!name) return c.redirect(`${path}?error=missing#files`);
	if (!isHttpUrl(url)) return c.redirect(`${path}?error=library-link#files`);
	await run(c.env.DB, `INSERT INTO meeting_library_links (id, meeting_id, original_meeting_id, author_id, name, url, created_at)
	 VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`, crypto.randomUUID(), meeting.id, meeting.id, viewer.id, name, url);
	return c.redirect(`${path}?ok=saved#files`);
});

meetingContentRoutes.post('/meetings/:id/library-links/:link/remove', async (c) => {
	const viewer = c.get('viewer');
	const meeting = await loadMeeting(c, viewer, c.req.param('id'));
	if (!meeting) return c.notFound();
	const link = await first<{ author_id: number | null }>(c.env.DB, 'SELECT author_id FROM meeting_library_links WHERE id = ? AND meeting_id = ? AND removed = 0', c.req.param('link'), meeting.id);
	if (!link || !canWrite(meeting, viewer, c.env.TIMEZONE, link.author_id)) return c.notFound();
	await run(c.env.DB, 'UPDATE meeting_library_links SET removed = 1 WHERE id = ? AND meeting_id = ?', c.req.param('link'), meeting.id);
	return c.redirect(`/meetings/${meeting.id}?ok=deleted#files`);
});

async function attachmentFiles(value: unknown): Promise<{ name: string; bytes: ArrayBuffer; type: string }[] | null> {
	const values = value === undefined ? [] : Array.isArray(value) ? value : [value];
	const files: { name: string; bytes: ArrayBuffer; type: string }[] = [];
	let total = 0;
	for (const file of values) {
		if (file === '') continue;
		if (typeof file === 'string' || !(file instanceof File)) return null;
		if (!file.name && !file.size) continue;
		total += file.size;
		if (!file.size || total > FILE_LIMIT) return null;
		const bytes = await file.arrayBuffer();
		const type = meetingFileType(file.name, bytes);
		if (!type) return null;
		files.push({ name: file.name, bytes, type });
	}
	return files;
}

export const meetingUploadLimit = (section: 'agenda' | 'files') => bodyLimit({
	maxSize: FILE_LIMIT + 65536,
	onError: (c) => c.redirect(`/meetings/${id(c.req.param('id'))}?error=file#${section}`)
});

meetingContentRoutes.post('/meetings/:id/agenda', meetingUploadLimit('agenda'), async (c) => {
	const v = c.get('viewer');
	const m = await loadMeeting(c, v, c.req.param('id'));
	if (!m) return c.notFound();
	const form = await readForm(c);
	const title = str(form.title, 200);
	const durationText = str(form.duration_minutes);
	const duration = Number(durationText);
	const notes = str(form.notes, 10000);
	const path = `/meetings/${m.id}`;
	if (!title) return c.redirect(`${path}?error=missing#agenda`);
	if (meetingTiming(m, c.env.TIMEZONE).ended) return c.redirect(`${path}?error=forbidden#agenda`);
	if (!/^\d+$/.test(durationText) || !Number.isInteger(duration) || duration < 1 || duration > 1440) return c.redirect(`${path}?error=duration#agenda`);
	const db = c.env.DB;
	const files = await attachmentFiles(form.file);
	if (!files) return c.redirect(`${path}?error=file#agenda`);
	if (files.length) {
		const [{ name, bytes, type }] = files;
		const total = files.reduce((sum, file) => sum + file.bytes.byteLength, 0);
		const fileId = crypto.randomUUID();
		// One transaction saves the file, agenda and notes together. A full storage
		// budget creates none of them, so retrying cannot leave a partial agenda.
		const writes = [
			db.prepare(`INSERT INTO meeting_attachments (id, meeting_id, original_meeting_id, author_id, name, media_type, size, created_at)
			 SELECT ?1, ?2, ?2, ?3, ?4, ?5, ?6, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
			 WHERE (SELECT COALESCE(SUM(size), 0) FROM meeting_attachments WHERE meeting_id = ?2) + ?9 <= ?7
			 AND (SELECT COALESCE(SUM(size), 0) FROM meeting_attachments) + ?9 <= ?8`)
				.bind(fileId, m.id, v.id, name, type, bytes.byteLength, MEETING_FILE_BUDGET, TOTAL_FILE_BUDGET, total),
			db.prepare(`INSERT INTO meeting_agenda (meeting_id, author_id, author_name, title, position, duration_minutes)
			 SELECT ?1, ?2, ?3, ?4, (SELECT COALESCE(MAX(position), 0) + 1 FROM meeting_agenda WHERE meeting_id = ?1), ?6
			 WHERE EXISTS (SELECT 1 FROM meeting_attachments WHERE id = ?5)`)
				.bind(m.id, v.id, v.name, title, fileId, duration),
			db.prepare('UPDATE meeting_attachments SET agenda_id = last_insert_rowid(), original_agenda_id = last_insert_rowid() WHERE id = ?')
				.bind(fileId)
		];
		if (notes) writes.push(db.prepare(`INSERT INTO meeting_speaker_notes (meeting_id, agenda_id, body)
		 SELECT meeting_id, agenda_id, ? FROM meeting_attachments WHERE id = ?`).bind(notes, fileId));
		for (let offset = 0; offset < bytes.byteLength; offset += FILE_PART) {
			writes.push(db.prepare(`INSERT INTO meeting_attachment_chunks (file_id, part, data)
			 SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM meeting_attachments WHERE id = ?1)`)
				.bind(fileId, offset / FILE_PART, bytes.slice(offset, offset + FILE_PART)));
		}
		for (const file of files.slice(1)) {
			const nextId = crypto.randomUUID();
			writes.push(db.prepare(`INSERT INTO meeting_attachments (id, meeting_id, agenda_id, original_meeting_id, original_agenda_id, author_id, name, media_type, size, created_at)
			 SELECT ?1, meeting_id, agenda_id, original_meeting_id, original_agenda_id, ?2, ?3, ?4, ?5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM meeting_attachments WHERE id = ?6`)
				.bind(nextId, v.id, file.name, file.type, file.bytes.byteLength, fileId));
			for (let offset = 0; offset < file.bytes.byteLength; offset += FILE_PART) {
				writes.push(db.prepare(`INSERT INTO meeting_attachment_chunks (file_id, part, data)
				 SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM meeting_attachments WHERE id = ?1)`)
					.bind(nextId, offset / FILE_PART, file.bytes.slice(offset, offset + FILE_PART)));
			}
		}
		const [saved] = await db.batch(writes);
		return c.redirect(`${path}?${saved.meta.changes ? 'ok=created' : 'error=file-space'}#agenda`);
	}
	const insert = db.prepare(`INSERT INTO meeting_agenda (meeting_id, author_id, author_name, title, position, duration_minutes)
	 SELECT ?1, ?2, ?3, ?4, COALESCE(MAX(position), 0) + 1, ?5 FROM meeting_agenda WHERE meeting_id = ?1`)
		.bind(m.id, v.id, v.name, title, duration);
	if (notes) {
		await db.batch([insert, db.prepare('INSERT INTO meeting_speaker_notes (meeting_id, agenda_id, body) VALUES (?, last_insert_rowid(), ?)').bind(m.id, notes)]);
	} else {
		await insert.run();
	}
	return c.redirect(`${path}?ok=created#agenda`);
});

meetingContentRoutes.post('/meetings/:id/agenda/:item/:operation?', async (c) => {
	const v = c.get('viewer');
	const m = await loadMeeting(c, v, c.req.param('id'));
	if (!m) return c.notFound();
	const db = c.env.DB;
	const item = await first<Agenda>(db, 'SELECT * FROM meeting_agenda WHERE meeting_id = ? AND id = ? AND removed = 0', m.id, id(c.req.param('item')));
	if (!item || !canWrite(m, v, c.env.TIMEZONE, item.author_id)) return c.notFound();
	const form = await readForm(c);
	const path = `/meetings/${m.id}`;
	const version = Number(str(form.version));
	const operation = c.req.param('operation');
	let result;
	if (operation === 'notes') {
		const notes = str(form.notes, 10000);
		if (version === 0 && !notes) return c.redirect(`${path}#agenda`);
		result = version === 0
			? await run(db, `INSERT INTO meeting_speaker_notes (meeting_id, agenda_id, body)
			 SELECT meeting_id, id, ? FROM meeting_agenda WHERE id = ? AND removed = 0
			 ON CONFLICT(agenda_id) DO NOTHING`, notes, item.id)
			: notes
				? await run(db, `UPDATE meeting_speaker_notes SET body = ?, version = version + 1
				 WHERE agenda_id = ? AND version = ? AND EXISTS (SELECT 1 FROM meeting_agenda WHERE id = ? AND removed = 0)`, notes, item.id, version, item.id)
				: await run(db, `DELETE FROM meeting_speaker_notes WHERE agenda_id = ? AND version = ?
				 AND EXISTS (SELECT 1 FROM meeting_agenda WHERE id = ? AND removed = 0)`, item.id, version, item.id);
	} else if (operation === 'up') {
		if (!canEditMeeting(v, m)) return c.notFound();
		// Both positions change in one statement. The selected item's version gates the swap.
		result = await run(db, `WITH pair AS MATERIALIZED (
		 SELECT a.id AS current, a.position AS current_pos, b.id AS previous, b.position AS previous_pos
		 FROM meeting_agenda a JOIN meeting_agenda b ON b.id = (
			SELECT id FROM meeting_agenda WHERE meeting_id = a.meeting_id AND removed = 0
			AND position < a.position ORDER BY position DESC LIMIT 1
		 ) WHERE a.id = ? AND a.version = ? AND a.removed = 0
		) UPDATE meeting_agenda SET position = CASE WHEN id = (SELECT current FROM pair)
		 THEN (SELECT previous_pos FROM pair) ELSE (SELECT current_pos FROM pair) END, version = version + 1
		 WHERE id IN (SELECT current FROM pair UNION ALL SELECT previous FROM pair)`, item.id, version);
	} else if (operation === 'remove') {
		result = await run(db, 'UPDATE meeting_agenda SET removed = 1, version = version + 1 WHERE id = ? AND version = ? AND removed = 0', item.id, version);
	} else if (!operation) {
		const title = str(form.title, 200);
		const durationText = str(form.duration_minutes);
		const duration = Number(durationText);
		if (!title) return c.redirect(`${path}?error=missing#agenda`);
		if (!/^\d+$/.test(durationText) || !Number.isInteger(duration) || duration < 1 || duration > 1440) return c.redirect(`${path}?error=duration#agenda`);
		result = await run(db, 'UPDATE meeting_agenda SET title = ?, duration_minutes = ?, version = version + 1 WHERE id = ? AND version = ? AND removed = 0', title, duration, item.id, version);
	} else {
		return c.notFound();
	}
	return c.redirect(`${path}?${result.meta.changes ? 'ok=saved' : 'error=stale'}#agenda`);
});

meetingContentRoutes.post('/meetings/:id/files', meetingUploadLimit('files'), async (c) => {
	const v = c.get('viewer');
	const m = await loadMeeting(c, v, c.req.param('id'));
	if (!m) return c.notFound();
	const form = await readForm(c);
	const db = c.env.DB;
	const agenda = id(form.agenda);
	const displayName = str(form.name, 200);
	const item = agenda === null ? null : await first<Agenda>(db, 'SELECT * FROM meeting_agenda WHERE id = ? AND meeting_id = ? AND removed = 0', agenda, m.id);
	if (agenda !== null && !item) return c.notFound();
	if (!canWrite(m, v, c.env.TIMEZONE, item ? item.author_id : v.id)) return c.notFound();
	const path = `/meetings/${m.id}`;
	if (agenda === null && !displayName) return c.redirect(`${path}?error=missing#files`);
	const files = await attachmentFiles(form.file);
	if (!files?.length || (agenda === null && files.length !== 1)) return c.redirect(`${path}?error=file#files`);
	const total = files.reduce((sum, file) => sum + file.bytes.byteLength, 0);
	const firstId = crypto.randomUUID();
	const writes: D1PreparedStatement[] = [];
	for (const [index, file] of files.entries()) {
		const fileId = index === 0 ? firstId : crypto.randomUUID();
		writes.push(db.prepare(`INSERT INTO meeting_attachments (id, meeting_id, agenda_id, original_meeting_id, original_agenda_id, author_id, name, media_type, size, created_at, display_name)
		 SELECT ?1, ?2, ?3, ?2, ?3, ?4, ?5, ?6, ?7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?10 WHERE (?3 IS NULL OR EXISTS (
		 SELECT 1 FROM meeting_agenda WHERE id = ?3 AND meeting_id = ?2 AND removed = 0))
		 AND (?11 = 0 OR EXISTS (SELECT 1 FROM meeting_attachments WHERE id = ?12))
		 AND (?11 != 0 OR ((SELECT COALESCE(SUM(size), 0) FROM meeting_attachments WHERE meeting_id = ?2) + ?13 <= ?8
		 AND (SELECT COALESCE(SUM(size), 0) FROM meeting_attachments) + ?13 <= ?9))`)
			.bind(fileId, m.id, agenda, v.id, file.name, file.type, file.bytes.byteLength, MEETING_FILE_BUDGET, TOTAL_FILE_BUDGET, displayName || null, index, firstId, total));
		for (let offset = 0; offset < file.bytes.byteLength; offset += FILE_PART) {
			writes.push(db.prepare(`INSERT INTO meeting_attachment_chunks (file_id, part, data)
			 SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM meeting_attachments WHERE id = ?1)`)
				.bind(fileId, offset / FILE_PART, file.bytes.slice(offset, offset + FILE_PART)));
		}
	}
	const [result] = await db.batch(writes);
	if (result.meta.changes) return c.redirect(`${path}?ok=saved#files`);
	const stale = agenda !== null && !await first(db, 'SELECT 1 FROM meeting_agenda WHERE id = ? AND meeting_id = ? AND removed = 0', agenda, m.id);
	return c.redirect(`${path}?error=${stale ? 'stale' : 'file-space'}#files`);
});

meetingContentRoutes.get('/meetings/:id/files/:file', async (c) => {
	const m = await loadMeeting(c, c.get('viewer'), c.req.param('id'));
	if (!m) return c.notFound();
	const db = c.env.DB;
	const file = await first<Attachment>(db, 'SELECT * FROM meeting_attachments WHERE meeting_id = ? AND id = ? AND removed = 0', m.id, c.req.param('file'));
	if (!file) return c.notFound();
	const chunks = await all<{ data: number[] }>(db, 'SELECT data FROM meeting_attachment_chunks WHERE file_id = ? ORDER BY part', file.id);
	const bytes = new Uint8Array(file.size);
	let offset = 0;
	for (const { data } of chunks) {
		bytes.set(data, offset);
		offset += data.length;
	}
	if (offset !== file.size) return c.text('File unavailable.', 500);
	const inline = c.req.query('play') === '1' && file.media_type.startsWith('audio/');
	const filename = encodeURIComponent(file.name).replace(/['()*]/g, (char) => '%' + char.charCodeAt(0).toString(16));
	return c.body(bytes.buffer, 200, {
		'Content-Type': file.media_type,
		'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${filename}`,
		'Content-Security-Policy': "sandbox; default-src 'none'"
	});
});

meetingContentRoutes.post('/meetings/:id/files/:file/remove', async (c) => {
	const v = c.get('viewer');
	const m = await loadMeeting(c, v, c.req.param('id'));
	if (!m) return c.notFound();
	const db = c.env.DB;
	const file = await first<Attachment & { agenda_author: number | null }>(db, `SELECT f.*, a.author_id AS agenda_author
	 FROM meeting_attachments f LEFT JOIN meeting_agenda a ON a.id = f.agenda_id
	 WHERE f.meeting_id = ? AND f.id = ? AND f.removed = 0`, m.id, c.req.param('file'));
	if (!file || !canWrite(m, v, c.env.TIMEZONE, file.author_id)) return c.notFound();
	await run(db, 'UPDATE meeting_attachments SET removed = 1 WHERE id = ?', file.id);
	return c.redirect(`/meetings/${m.id}?ok=saved#files`);
});
