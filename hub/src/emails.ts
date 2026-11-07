// Email bodies. Plain HTML with inline styles so they render the same in Gmail, Outlook and Apple Mail.

import { addDays, dueLabel, formatDate, formatTimeRange } from './dates.ts';

export const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const RED = '#c5050c';
const INK = '#111317';
const MUTED = '#585f69';
const LINE = '#e3e1de';

function layout(body: string, footer: string) {
	return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f2f0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2f0;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:12px;">
<tr><td style="padding:20px 28px;border-bottom:1px solid ${LINE};font:600 13px/1 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:${RED};">Agentic AI UW · Hub</td></tr>
<tr><td style="padding:24px 28px 28px;font:15px/1.55 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:${INK};">${body}</td></tr>
</table>
<p style="max-width:560px;margin:14px auto 0;font:12px/1.5 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:${MUTED};">${footer}</p>
</td></tr></table></body></html>`;
}

const p = (html: string) => `<p style="margin:0 0 14px;">${html}</p>`;
const h = (text: string) => `<h2 style="margin:22px 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};">${esc(text)}</h2>`;

function button(href: string, label: string, primary = true) {
	const style = primary
		? `background:${RED};color:#ffffff;border:1px solid ${RED};`
		: `background:#ffffff;color:${INK};border:1px solid ${LINE};`;
	return `<a href="${esc(href)}" style="display:inline-block;${style}padding:9px 16px;border-radius:8px;font-weight:600;font-size:14px;text-decoration:none;">${esc(label)}</a>`;
}

const toneColor = { overdue: RED, today: '#b45309', soon: INK, later: MUTED, done: MUTED } as const;

export type EmailTask = {
	id: number;
	title: string;
	due_date: string;
	team_name: string | null;
	meeting_title: string | null;
	assignee_name?: string;
	url: string;
	/** Signed one-click link; only included in the assignee's own emails. */
	doneUrl?: string;
};

function taskBlock(t: EmailTask, today: string) {
	const due = dueLabel(t.due_date, today);
	const where = [t.assignee_name, t.team_name, t.meeting_title && `from “${t.meeting_title}”`].filter(Boolean).map((s) => esc(s!)).join(' · ');
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:10px;margin:0 0 10px;">
<tr><td style="padding:14px 16px;">
<div style="font-weight:600;font-size:15px;"><a href="${esc(t.url)}" style="color:${INK};text-decoration:none;">${esc(t.title)}</a></div>
<div style="font-size:13px;margin-top:2px;"><span style="color:${toneColor[due.tone]};font-weight:600;">${esc(due.text)}</span><span style="color:${MUTED};"> · ${esc(formatDate(t.due_date, today))}${where ? ' · ' + where : ''}</span></div>
${t.doneUrl ? `<div style="margin-top:12px;">${button(t.doneUrl, 'Mark done')}&nbsp; ${button(t.url, 'Open', false)}</div>` : ''}
</td></tr></table>`;
}

function taskText(t: EmailTask, today: string) {
	const due = dueLabel(t.due_date, today);
	return `- ${t.title} (${due.text}, ${formatDate(t.due_date, today)}${t.assignee_name ? `, ${t.assignee_name}` : ''})\n  ${t.doneUrl ? `Mark done: ${t.doneUrl}\n  ` : ''}Open: ${t.url}`;
}

const footerFor = (appUrl: string) =>
	`Sent by the club's task tracker at <a href="${esc(appUrl)}" style="color:${MUTED};">${esc(appUrl.replace(/^https?:\/\//, ''))}</a>. Reminders stop once a task is marked done. Questions? Reply to this email.`;

// ---------- sign-in ----------

// The code stays out of the subject: subjects are kept in the exec-visible email log.
export function loginEmail(name: string, code: string, appUrl: string) {
	return {
		subject: 'Your sign-in code for the Agentic AI UW Hub',
		text: `Hi ${name},\n\nYour sign-in code for the Agentic AI UW Hub is ${code}\n\nIt works once and expires in 10 minutes. If you didn't ask for it, ignore this email.`,
		html: layout(
			p(`Hi ${esc(name)},`) +
				p('Enter this code to sign in to the Agentic AI UW Hub.') +
				`<div style="margin:20px 0;font:600 32px/1 ui-monospace,'SF Mono',Menlo,Consolas,monospace;letter-spacing:.2em;color:${INK};">${code}</div>` +
				p(`<span style="color:${MUTED};font-size:13px;">It works once and expires in 10 minutes. If you didn't ask for it, you can ignore this email.</span>`),
			footerFor(appUrl)
		)
	};
}

// ---------- sign-in invite ----------

export function inviteEmail(member: { name: string; email: string }, appUrl: string) {
	const first = member.name.split(' ')[0];
	const loginUrl = `${appUrl}/login`;
	const about = 'It’s where the club will keep track of tasks and meetings. There isn’t much there yet, but more will be added soon.';
	return {
		subject: 'You’ve been added to the Agentic AI UW Hub',
		text: `Hi ${first},\n\nYou’ve been added to the Agentic AI UW Hub. ${about}\n\nSign in at ${loginUrl} with ${member.email} and we’ll email you a 6-digit code. No password needed.`,
		html: layout(
			p(`Hi ${esc(first)},`) +
				p(`You’ve been added to the Agentic AI UW Hub. ${esc(about)}`) +
				p(`Sign in with <b>${esc(member.email)}</b> and we’ll email you a 6-digit code. No password needed.`) +
				`<div style="margin:6px 0 4px;">${button(loginUrl, 'Sign in to the hub')}</div>`,
			`Sent from <a href="${esc(appUrl)}" style="color:${MUTED};">${esc(appUrl.replace(/^https?:\/\//, ''))}</a>.`
		)
	};
}

// ---------- new assignments ----------

/** `assigner` is null when someone assigned the task to themselves. */
export function assignedEmail(name: string, assigner: string | null, tasks: EmailTask[], today: string, appUrl: string) {
	const one = tasks.length === 1;
	const subject = one ? `New task: ${tasks[0].title} (due ${formatDate(tasks[0].due_date, today)})` : `${tasks.length} new tasks assigned to you`;
	const who = assigner ? `${assigner} assigned you` : 'You assigned yourself';
	return {
		subject,
		text: `Hi ${name},\n\n${who} ${one ? 'a task' : `${tasks.length} tasks`}:\n\n${tasks.map((t) => taskText(t, today)).join('\n\n')}\n\nYou'll get reminders before each due date and after it until it's marked done.`,
		html: layout(
			p(`Hi ${esc(name)},`) +
				p(`${esc(who)} ${one ? 'a task' : `${tasks.length} tasks`}. You'll get a reminder before ${one ? 'it is' : 'each is'} due, and after, until ${one ? "it's" : "they're"} marked done.`) +
				tasks.map((t) => taskBlock(t, today)).join(''),
			footerFor(appUrl)
		)
	};
}

// ---------- daily reminders ----------

export type ReminderGroups = { overdue: EmailTask[]; today: EmailTask[]; soon: EmailTask[]; followUp: EmailTask[] };

export function reminderEmail(name: string, g: ReminderGroups, today: string, appUrl: string) {
	const mine = g.overdue.length + g.today.length + g.soon.length;
	const first = g.overdue[0] ?? g.today[0] ?? g.soon[0];
	const more = mine > 1 ? ` (+${mine - 1} more)` : '';
	const subject = g.overdue.length
		? `Overdue: ${first.title}${more}`
		: g.today.length
			? `Due today: ${first.title}${more}`
			: g.soon.length
				? `Coming up: ${first.title}${more}`
				: `Following up: ${g.followUp.length} overdue task${g.followUp.length === 1 ? '' : 's'} you assigned`;

	const sections: [string, EmailTask[]][] = [
		['Overdue', g.overdue],
		['Due today', g.today],
		['Due soon', g.soon],
		['Tasks you assigned that are overdue', g.followUp]
	];
	const htmlSections = sections
		.filter(([, list]) => list.length)
		.map(([title, list]) => h(title) + list.map((t) => taskBlock(t, today)).join(''))
		.join('');
	const textSections = sections
		.filter(([, list]) => list.length)
		.map(([title, list]) => `${title.toUpperCase()}\n${list.map((t) => taskText(t, today)).join('\n')}`)
		.join('\n\n');

	const intro = mine
		? g.overdue.length
			? "These are past their due date. If one is finished, mark it done. If it's stuck, reply or tell whoever assigned it."
			: 'A quick heads-up on what is coming due.'
		: 'These tasks you assigned are a few days overdue. It may be worth checking in.';
	return {
		subject,
		text: `Hi ${name},\n\n${intro}\n\n${textSections}\n\nAll your tasks: ${appUrl}/`,
		html: layout(p(`Hi ${esc(name)},`) + p(esc(intro)) + htmlSections + `<div style="margin-top:22px;">${button(appUrl + '/', 'See all my tasks', false)}</div>`, footerFor(appUrl))
	};
}

// ---------- urgent reminders ----------

/** The extra reminders for urgent tasks: the evening they're due, then every 2 hours while overdue. */
export function urgentEmail(name: string, tonight: EmailTask[], overdue: EmailTask[], today: string, appUrl: string) {
	const first = name.split(' ')[0];
	const tasks = [...overdue, ...tonight];
	const one = tasks.length === 1;
	const subject = `${overdue.length ? 'Overdue' : 'Due tonight'}: ${tasks[0].title}${one ? '' : ` (+${tasks.length - 1} more)`}`;
	const when = overdue.length ? (tonight.length ? 'due tonight or past due' : 'past due') : 'due tonight';
	const intro = one
		? `This is ${when} and isn't marked done yet. If you've finished it, hit Mark done and these reminders stop.`
		: `These are ${when} and aren't marked done yet. Hit Mark done on any you've finished and its reminders stop.`;
	return {
		subject,
		text: `Hi ${first},\n\n${intro}\n\n${tasks.map((t) => taskText(t, today)).join('\n\n')}`,
		html: layout(p(`Hi ${esc(first)},`) + p(esc(intro)) + tasks.map((t) => taskBlock(t, today)).join(''), footerFor(appUrl))
	};
}

// ---------- weekly exec digest ----------

export type DigestData = {
	overdueByPerson: { name: string; tasks: EmailTask[] }[];
	dueThisWeek: EmailTask[];
	doneLastWeek: number;
	meetings: { title: string; team_name: string; date: string; time: string; end_time: string; present: number; total: number; url: string }[];
};

export function digestEmail(name: string, d: DigestData, today: string, appUrl: string) {
	const overdueCount = d.overdueByPerson.reduce((n, p) => n + p.tasks.length, 0);
	const stat = (label: string, value: number) =>
		`<td style="padding:12px 14px;border:1px solid ${LINE};border-radius:10px;"><div style="font-size:22px;font-weight:700;">${value}</div><div style="font-size:12px;color:${MUTED};">${esc(label)}</div></td>`;
	const meetingRows = d.meetings
		.map(
			(m) =>
				`<tr><td style="padding:6px 0;border-bottom:1px solid ${LINE};"><a href="${esc(m.url)}" style="color:${INK};">${esc(m.title)}</a> <span style="color:${MUTED};">· ${esc(m.team_name)} · ${esc(formatDate(m.date, today))}${m.time ? ' ' + esc(formatTimeRange(m.time, m.end_time)) : ''}</span></td><td align="right" style="padding:6px 0;border-bottom:1px solid ${LINE};white-space:nowrap;">${m.total ? `${m.present}/${m.total} present` : 'No attendance'}</td></tr>`
		)
		.join('');
	const html =
		p(`Hi ${esc(name)}, here's where the club's tasks stand this week.`) +
		`<table role="presentation" cellpadding="0" cellspacing="6" style="margin:0 -6px 6px;"><tr>${stat('Overdue', overdueCount)}${stat('Due this week', d.dueThisWeek.length)}${stat('Done last 7 days', d.doneLastWeek)}</tr></table>` +
		(d.overdueByPerson.length
			? h('Overdue, by person') +
				d.overdueByPerson.map((p) => `<div style="font-weight:600;margin:12px 0 6px;">${esc(p.name)} (${p.tasks.length})</div>` + p.tasks.map((t) => taskBlock(t, today)).join('')).join('')
			: h('Overdue') + p('Nothing overdue. Nice.')) +
		(d.dueThisWeek.length ? h('Due in the next 7 days') + d.dueThisWeek.map((t) => taskBlock(t, today)).join('') : '') +
		(d.meetings.length ? h('Meetings last week') + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">${meetingRows}</table>` : '') +
		`<div style="margin-top:22px;">${button(appUrl + '/people', 'Open the accountability board', false)}</div>`;
	const text =
		`Hi ${name},\n\nOverdue: ${overdueCount} · Due this week: ${d.dueThisWeek.length} · Done last 7 days: ${d.doneLastWeek}\n\n` +
		d.overdueByPerson.map((p) => `${p.name}\n${p.tasks.map((t) => taskText(t, today)).join('\n')}`).join('\n\n') +
		(d.dueThisWeek.length ? `\n\nDUE THIS WEEK\n${d.dueThisWeek.map((t) => taskText(t, today)).join('\n')}` : '') +
		(d.meetings.length ? `\n\nMEETINGS LAST WEEK\n${d.meetings.map((m) => `- ${m.title} (${m.team_name}, ${formatDate(m.date, today)}): ${m.present}/${m.total} present`).join('\n')}` : '') +
		`\n\n${appUrl}/people`;
	return { subject: `Weekly exec digest: ${overdueCount} overdue, ${d.dueThisWeek.length} due this week`, text, html: layout(html, footerFor(appUrl)) };
}

// ---------- meeting reminders ----------

/** "A", "A and B", "A, B and C". */
export function andList(items: string[]) {
	return items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

type EmailMeeting = {
	id: number;
	kind: 'meeting' | 'event';
	title: string;
	/** Every team it's for, main team first. */
	team_names: string[];
	date: string;
	time: string;
	end_time: string;
	location: string;
	doc_url: string;
	agenda: string;
};

/**
 * `today` is the day it's sent, which makes the meeting "Today" or "Tomorrow". A null `name` greets
 * everyone, for one email to the whole list. `announce`: sent as soon as it's scheduled, instead of
 * as the reminder before it; `repeats` then says how often it happens.
 */
export function meetingEmail(name: string | null, m: EmailMeeting, today: string, appUrl: string, opts: { announce?: boolean; repeats?: string } = {}) {
	const first = name ? name.split(' ')[0] : 'everyone';
	const day = m.date === today ? 'Today' : m.date === addDays(today, 1) ? 'Tomorrow' : formatDate(m.date, today);
	const on = m.date === today || m.date === addDays(today, 1) ? day.toLowerCase() : `on ${day}`;
	const when = [day, m.time && formatTimeRange(m.time, m.end_time), m.location].filter(Boolean).join(' · ');
	const teams = andList(m.team_names);
	const several = m.team_names.length > 1;
	const intro =
		m.kind === 'event'
			? `There’s ${opts.announce ? 'a new' : 'a'} club event ${on}. It’s open to everyone.`
			: opts.announce
				? `${teams} ${several ? 'have' : 'has'} a new meeting ${on}.`
				: `${teams} ${several ? 'meet' : 'meets'} ${on}.`;
	const repeats = opts.repeats ? ` ${opts.repeats}` : '';
	const url = `${appUrl}/meetings/${m.id}`;
	const agenda = m.agenda.trim();
	const html =
		p(`Hi ${esc(first)},`) +
		p(esc(intro + repeats)) +
		`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:10px;margin:0 0 10px;">
<tr><td style="padding:14px 16px;">
<div style="font-weight:600;font-size:16px;"><a href="${esc(url)}" style="color:${INK};text-decoration:none;">${esc(m.title)}</a></div>
<div style="font-size:14px;color:${MUTED};margin-top:2px;">${esc(when)}</div>
${agenda ? `<div style="font-size:14px;margin-top:12px;"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};margin-bottom:4px;">Agenda</div>${esc(agenda).replace(/\n/g, '<br>')}</div>` : ''}
<div style="margin-top:14px;">${m.doc_url ? `${button(m.doc_url, 'Open the meeting doc')}&nbsp; ` : ''}${button(url, 'Meeting page', !m.doc_url)}</div>
</td></tr></table>`;
	const text =
		`Hi ${first},\n\n${intro}${repeats}\n\n${m.title}\n${when}` +
		(agenda ? `\n\nAgenda\n${agenda}` : '') +
		(m.doc_url ? `\n\nMeeting doc: ${m.doc_url}` : '') +
		`\nMeeting page: ${url}`;
	const to = m.kind === 'event' ? 'everyone in the club' : `everyone on ${esc(teams)}`;
	const at = `${day}${m.time ? `, ${formatTimeRange(m.time, m.end_time)}` : ''}`;
	return {
		subject: opts.announce ? `New ${m.kind === 'event' ? 'club event' : 'meeting'}: ${m.title}, ${at}` : `${day}: ${m.title}${m.time ? `, ${formatTimeRange(m.time, m.end_time)}` : ''}`,
		text,
		html: layout(html, `Sent by the club hub at <a href="${esc(appUrl)}" style="color:${MUTED};">${esc(appUrl.replace(/^https?:\/\//, ''))}</a> to ${to}. Questions? Reply to this email.`)
	};
}

export function testEmail(name: string, appUrl: string) {
	return {
		subject: 'Test email from the Agentic AI UW Hub',
		text: `Hi ${name},\n\nEmail sending works. Reminders will come from this address.\n\n${appUrl}`,
		html: layout(p(`Hi ${esc(name)},`) + p('Email sending works. Task reminders will come from this address.'), footerFor(appUrl))
	};
}
