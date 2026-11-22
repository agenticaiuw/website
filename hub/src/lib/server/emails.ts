// Email bodies. Plain HTML with inline styles so they render the same in Gmail, Outlook and Apple Mail.

import { addDays, dueLabel, formatDate, formatDue, formatTime, formatTimeRange, isTime } from '../dates.ts';
import { TASK_SOON_HOURS } from './schedule.ts';

export { andList, esc } from '../text.ts';
import { andList, esc } from '../text.ts';

// The emails' original light colors. Outlook's dark mode turns these into a clean dark look;
// dark colors here came out grey there. Fonts are the hub's.
const BG = '#f4f2f0';
const SURFACE = '#ffffff';
const RAISED = '#ffffff';
const FG = '#111317';
const MUTED = '#585f69';
const ACCENT = '#c5050c';
const PRIMARY = '#c5050c';
const WARN = '#b45309';
const LINE = '#e3e1de';
const LINE_STRONG = '#e3e1de';
const FONT = "'Figtree',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const DISPLAY = "'Baloo 2','Figtree',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

/** The club's social links, as on the website. */
const SOCIAL: [string, string][] = [
	['Discord', 'https://discord.gg/qQwy2K4vW'],
	['Instagram', 'https://www.instagram.com/agenticaiuw/'],
	['LinkedIn', 'https://www.linkedin.com/company/agenticaiuw/'],
	['X', 'https://x.com/AgenticAIUW']
];

function layout(body: string, appUrl: string) {
	const social = SOCIAL.map(
		([name, href]) =>
			`<a href="${esc(href)}" style="display:inline-block;margin:0 2px 8px;padding:6px 11px;border:1px solid ${LINE_STRONG};border-radius:999px;color:${FG};font:600 13px/1.2 ${FONT};text-decoration:none;">${name}</a>`
	).join('');
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="${esc(appUrl)}/fonts/fonts.css"></head>
<body style="margin:0;padding:0;background:${BG};" bgcolor="${BG}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BG}" style="background:${BG};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 4px 16px;"><a href="${esc(appUrl)}/" style="text-decoration:none;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:10px;"><img src="${esc(appUrl)}/apple-touch-icon.png" width="34" height="34" alt="" style="display:block;border:0;border-radius:8px;"></td>
<td style="font:700 18px/1.2 ${DISPLAY};color:${FG};white-space:nowrap;">Agentic AI UW <span style="color:${ACCENT};">Hub</span></td>
</tr></table></a></td></tr>
<tr><td bgcolor="${SURFACE}" style="background:${SURFACE};border:1px solid ${LINE};border-radius:16px;padding:26px 26px 28px;font:15px/1.6 ${FONT};color:${FG};">${body}</td></tr>
<tr><td align="center" style="padding:20px 4px 0;">${social}</td></tr>
</table>
</td></tr></table></body></html>`;
}

const p = (html: string) => `<p style="margin:0 0 14px;color:${FG};">${html}</p>`;
const h = (text: string) => `<h2 style="margin:24px 0 10px;font:700 12px/1.3 ${FONT};letter-spacing:.1em;text-transform:uppercase;color:${MUTED};">${esc(text)}</h2>`;
/** A raised box inside the card, like the hub's cards. */
const box = (inner: string, pad = '14px 16px') =>
	`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${RAISED}" style="background:${RAISED};border:1px solid ${LINE};border-radius:12px;margin:0 0 10px;">
<tr><td style="padding:${pad};">${inner}</td></tr></table>`;

function button(href: string, label: string, primary = true) {
	const style = primary
		? `background:${PRIMARY};color:#ffffff;border:1px solid ${PRIMARY};`
		: `background:${RAISED};color:${FG};border:1px solid ${LINE_STRONG};`;
	return `<a href="${esc(href)}" style="display:inline-block;${style}padding:9px 16px;border-radius:10px;font:600 14px/1.3 ${FONT};text-decoration:none;">${esc(label)}</a>`;
}

const toneColor = { overdue: ACCENT, today: WARN, soon: FG, later: MUTED, done: MUTED } as const;

export type EmailTask = {
	id: number | string;
	title: string;
	due_date: string;
	/** "HH:MM", or '' (or missing) for no time. */
	due_time?: string;
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
	// "Due Fri, Nov 20" already has the date; "Due tomorrow" needs it after.
	const rest = [esc(dueWhen(t, due.tone === 'later', today)), where].filter(Boolean).join(' · ');
	return box(`<div style="font-weight:600;font-size:15px;"><a href="${esc(t.url)}" style="color:${FG};text-decoration:none;">${esc(t.title)}</a></div>
<div style="font-size:13px;margin-top:2px;"><span style="color:${toneColor[due.tone]};font-weight:600;">${esc(due.text)}</span>${rest ? `<span style="color:${MUTED};"> · ${rest}</span>` : ''}</div>
${t.doneUrl ? `<div style="margin-top:12px;">${button(t.doneUrl, 'Mark done')}&nbsp; ${button(t.url, 'Open', false)}</div>` : ''}`);
}

/** The date after the due label ("Sat, Nov 21, 5:00 PM"), or just the time when the label already has the date. */
function dueWhen(t: EmailTask, labelHasDate: boolean, today: string) {
	return labelHasDate ? (isTime(t.due_time) ? formatTime(t.due_time) : '') : formatDue(t.due_date, t.due_time, today);
}

function taskText(t: EmailTask, today: string) {
	const due = dueLabel(t.due_date, today);
	const info = [due.text, dueWhen(t, due.tone === 'later', today), t.assignee_name].filter(Boolean).join(', ');
	return `- ${t.title} (${info})\n  ${t.doneUrl ? `Mark done: ${t.doneUrl}\n  ` : ''}Open: ${t.url}`;
}

// ---------- sign-in ----------

// The code stays out of the subject: subjects are kept in the exec-visible email log.
export function loginEmail(name: string, code: string, appUrl: string) {
	return {
		subject: 'Your sign-in code for the Agentic AI UW Hub',
		text: `Hi ${name},\n\nYour sign-in code for the Agentic AI UW Hub is ${code}\n\nIt works once and expires in 10 minutes. If you didn't ask for it, ignore this email.`,
		html: layout(
			p(`Hi ${esc(name)},`) +
				p('Enter this code to sign in to the Agentic AI UW Hub.') +
				`<div style="margin:20px 0;font:600 32px/1 ui-monospace,'SF Mono',Menlo,Consolas,monospace;letter-spacing:.2em;color:${FG};">${code}</div>` +
				p(`<span style="color:${MUTED};font-size:13px;">It works once and expires in 10 minutes. If you didn't ask for it, you can ignore this email.</span>`),
			appUrl
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
			appUrl
		)
	};
}

// ---------- new assignments ----------

/** `assigner` is null when someone assigned the task to themselves. */
export function assignedEmail(name: string, assigner: string | null, tasks: EmailTask[], today: string, appUrl: string) {
	const one = tasks.length === 1;
	const subject = one ? `New task: ${tasks[0].title} (due ${formatDue(tasks[0].due_date, tasks[0].due_time, today)})` : `${tasks.length} new tasks assigned to you`;
	const who = assigner ? `${assigner} assigned you` : 'You assigned yourself';
	return {
		subject,
		text: `Hi ${name},\n\n${who} ${one ? 'a task' : `${tasks.length} tasks`}:\n\n${tasks.map((t) => taskText(t, today)).join('\n\n')}\n\nYou'll get reminders before each due date and after it until it's marked done.`,
		html: layout(
			p(`Hi ${esc(name)},`) +
				p(`${esc(who)} ${one ? 'a task' : `${tasks.length} tasks`}. You'll get a reminder before ${one ? 'it is' : 'each is'} due, and after, until ${one ? "it's" : "they're"} marked done.`) +
				tasks.map((t) => taskBlock(t, today)).join(''),
			appUrl
		)
	};
}

// ---------- daily reminders ----------

/** `hours`: tasks with a due time, 4 hours before it. */
export type ReminderGroups = { overdue: EmailTask[]; hours: EmailTask[]; today: EmailTask[]; soon: EmailTask[]; followUp: EmailTask[] };

/** Sent to people already on a task when someone else moves its due date or time. */
export function dueChangedEmail(name: string, changer: string, task: EmailTask, old: { date: string; time: string }, today: string, appUrl: string) {
	const was = formatDue(old.date, old.time, today);
	const now = formatDue(task.due_date, task.due_time, today);
	const what = old.date === task.due_date ? 'time' : 'date';
	return {
		subject: `New due ${what}: ${task.title} (now ${now})`,
		text: `Hi ${name},\n\n${changer} moved the due ${what} of a task you're on from ${was} to ${now}:\n\n${taskText(task, today)}`,
		html: layout(p(`Hi ${esc(name)},`) + p(`${esc(changer)} moved the due ${what} of a task you’re on from <b>${esc(was)}</b> to <b>${esc(now)}</b>.`) + taskBlock(task, today), appUrl)
	};
}

/** A short heads-up about one task: someone took you off it, or dropped it. */
export function taskNoticeEmail(name: string, subject: string, line: string, task: EmailTask, today: string, appUrl: string, link = true) {
	return {
		subject,
		text: `Hi ${name},\n\n${line}\n\n- ${task.title} (was due ${formatDue(task.due_date, task.due_time, today)})${link ? `\n  Open: ${task.url}` : ''}`,
		html: layout(p(`Hi ${esc(name)},`) + p(esc(line)) + p(`<b>${link ? `<a href="${esc(task.url)}" style="color:${FG};">${esc(task.title)}</a>` : esc(task.title)}</b> <span style="color:${MUTED};">· was due ${esc(formatDue(task.due_date, task.due_time, today))}</span>`), appUrl)
	};
}

/** A reminder someone sent from the task page, with their own message. `name` is 'everyone' for one BCC email. */
export function taskReminderEmail(name: string, sender: string, message: string, task: EmailTask, today: string, appUrl: string) {
	return {
		subject: `Reminder: ${task.title} (due ${formatDue(task.due_date, task.due_time, today)})`,
		text: `Hi ${name},\n\n${sender} sent a reminder about a task you're on:\n\n${message}\n— ${sender}\n\n${taskText(task, today)}`,
		html: layout(
			p(`Hi ${esc(name)},`) +
				p(`${esc(sender)} sent a reminder about a task you’re on:`) +
				p(`${esc(message).replace(/\r?\n/g, '<br>')}<br><span style="color:${MUTED};">— ${esc(sender)}</span>`) +
				taskBlock(task, today),
			appUrl
		)
	};
}

export function reminderEmail(name: string, g: ReminderGroups, today: string, appUrl: string) {
	const mine = g.overdue.length + g.hours.length + g.today.length + g.soon.length;
	const first = g.overdue[0] ?? g.hours[0] ?? g.today[0] ?? g.soon[0];
	const more = mine > 1 ? ` (+${mine - 1} more)` : '';
	const subject = g.overdue.length
		? `Overdue: ${first.title}${more}`
		: g.hours.length
		? `Due in ${TASK_SOON_HOURS} hours: ${first.title}${more}`
		: g.today.length
			? `Due today: ${first.title}${more}`
			: g.soon.length
				? `Coming up: ${first.title}${more}`
				: `Following up: ${g.followUp.length} overdue task${g.followUp.length === 1 ? '' : 's'} you assigned`;

	const sections: [string, EmailTask[]][] = [
		['Overdue', g.overdue],
		[`Due in ${TASK_SOON_HOURS} hours`, g.hours],
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
		html: layout(p(`Hi ${esc(name)},`) + p(esc(intro)) + htmlSections + `<div style="margin-top:22px;">${button(appUrl + '/', 'See all my tasks', false)}</div>`, appUrl)
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
		html: layout(p(`Hi ${esc(first)},`) + p(esc(intro)) + tasks.map((t) => taskBlock(t, today)).join(''), appUrl)
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
		`<td bgcolor="${RAISED}" style="padding:12px 14px;background:${RAISED};border:1px solid ${LINE};border-radius:12px;color:${FG};"><div style="font:700 22px/1.2 ${DISPLAY};">${value}</div><div style="font-size:12px;color:${MUTED};">${esc(label)}</div></td>`;
	const meetingRows = d.meetings
		.map(
			(m) =>
				`<tr><td style="padding:6px 0;border-bottom:1px solid ${LINE};"><a href="${esc(m.url)}" style="color:${FG};">${esc(m.title)}</a> <span style="color:${MUTED};">· ${esc(m.team_name)} · ${esc(formatDate(m.date, today))}${m.time ? ' ' + esc(formatTimeRange(m.time, m.end_time)) : ''}</span></td><td align="right" style="padding:6px 0;border-bottom:1px solid ${LINE};white-space:nowrap;">${m.total ? `${m.present}/${m.total} present` : 'No attendance'}</td></tr>`
		)
		.join('');
	const html =
		p(`Hi ${esc(name)}, here's where the club's tasks stand this week.`) +
		`<table role="presentation" cellpadding="0" cellspacing="6" style="margin:0 -6px 6px;"><tr>${stat('Overdue', overdueCount)}${stat('Due this week', d.dueThisWeek.length)}${stat('Done last 7 days', d.doneLastWeek)}</tr></table>` +
		(d.overdueByPerson.length
			? h('Overdue, by person') +
				d.overdueByPerson.map((p) => `<div style="font-weight:600;margin:12px 0 6px;color:${FG};">${esc(p.name)} (${p.tasks.length})</div>` + p.tasks.map((t) => taskBlock(t, today)).join('')).join('')
			: h('Overdue') + p('Nothing overdue. Nice.')) +
		(d.dueThisWeek.length ? h('Due in the next 7 days') + d.dueThisWeek.map((t) => taskBlock(t, today)).join('') : '') +
		(d.meetings.length ? h('Meetings last week') + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:${FG};">${meetingRows}</table>` : '') +
		`<div style="margin-top:22px;">${button(appUrl + '/people', 'Open the accountability board', false)}</div>`;
	const text =
		`Hi ${name},\n\nOverdue: ${overdueCount} · Due this week: ${d.dueThisWeek.length} · Done last 7 days: ${d.doneLastWeek}\n\n` +
		d.overdueByPerson.map((p) => `${p.name}\n${p.tasks.map((t) => taskText(t, today)).join('\n')}`).join('\n\n') +
		(d.dueThisWeek.length ? `\n\nDUE THIS WEEK\n${d.dueThisWeek.map((t) => taskText(t, today)).join('\n')}` : '') +
		(d.meetings.length ? `\n\nMEETINGS LAST WEEK\n${d.meetings.map((m) => `- ${m.title} (${m.team_name}, ${formatDate(m.date, today)}): ${m.present}/${m.total} present`).join('\n')}` : '') +
		`\n\n${appUrl}/people`;
	return { subject: `Weekly exec digest: ${overdueCount} overdue, ${d.dueThisWeek.length} due this week`, text, html: layout(html, appUrl) };
}

// ---------- meeting reminders ----------

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
	host_name?: string | null;
};

/** What an edit changed about a meeting: its own date, time or place, or its series. */
export type MeetingChanges = {
	date?: boolean;
	time?: boolean;
	place?: boolean;
	/** A one-off that now repeats. */
	repeating?: boolean;
	/** The later meetings in its series moved to new dates. */
	laterDates?: boolean;
};

/**
 * `today` is the day it's sent, which makes the meeting "Today" or "Tomorrow". A null `name` greets
 * everyone, for one email to the whole list. `announce`: sent as soon as it's scheduled, instead of
 * as the reminder before it; `repeats` then says how often it happens. `changed`: what an edit
 * changed, which the email names (a new room never reads as a new date).
 */
export function meetingEmail(name: string | null, m: EmailMeeting, today: string, appUrl: string, opts: { announce?: boolean; soon?: boolean; changed?: MeetingChanges; added?: boolean; hosting?: boolean; cohost?: string; repeats?: string; why?: { reason: string; by: string } } = {}) {
	const first = name ? name.split(' ')[0] : 'everyone';
	const day = m.date === today ? 'Today' : m.date === addDays(today, 1) ? 'Tomorrow' : formatDate(m.date, today);
	const on = opts.soon ? 'in an hour' : m.date === today || m.date === addDays(today, 1) ? day.toLowerCase() : `on ${day}`;
	const when = [day, m.time && formatTimeRange(m.time, m.end_time), m.location].filter(Boolean).join(' · ');
	const teams = andList(m.team_names);
	const several = m.team_names.length > 1;
	const which = m.kind === 'event' ? 'a club event' : `the ${teams} meeting`;
	const intro = opts.hosting
		? opts.cohost
			? `You’re hosting ${which} ${on} with ${opts.cohost}: you two are responsible for running it.`
			: `You’re hosting ${which} ${on}: you’re the one responsible for running it.`
		: opts.added
		? `You’ve been added to ${which} ${on}.`
		: opts.changed
		? changedLine(m, opts.changed, day, on, teams)
		: m.kind === 'event'
			? `There’s ${opts.announce ? 'a new' : 'a'} club event ${on}. It’s open to everyone.`
			: opts.announce
				? `${teams} ${several ? 'have' : 'has'} a new meeting ${on}.`
				: `${teams} ${several ? 'meet' : 'meets'} ${on}.`;
	const repeats = opts.repeats ? ` ${opts.repeats}` : '';
	const url = `${appUrl}/meetings/${m.id}`;
	const agenda = m.agenda.trim();
	// Reminders ask for a written update before the meeting.
	const askUpdate = m.kind !== 'event' && !opts.announce && !opts.changed && !opts.added && !opts.hosting;
	const updateUrl = `${appUrl}/meetings/${m.id}?view=preparation#updates`;
	const html =
		p(`Hi ${esc(first)},`) +
		p(esc(intro + repeats)) +
		(askUpdate ? p(`Before the meeting, <a href="${esc(updateUrl)}" style="color:${FG};">write a couple of sentences</a> on what you’ve actually done.`) : '') +
		(opts.why ? p(`<b>Reason:</b> ${esc(opts.why.reason)}${opts.why.by ? `<br><span style="color:${MUTED};">— ${esc(opts.why.by)}</span>` : ''}`) : '') +
		box(`<div style="font:700 17px/1.3 ${DISPLAY};"><a href="${esc(url)}" style="color:${FG};text-decoration:none;">${esc(m.title)}</a></div>
<div style="font-size:14px;color:${MUTED};margin-top:2px;">${esc(when)}</div>
${m.host_name ? `<div style="font-size:14px;color:${MUTED};margin-top:2px;">Hosted by ${esc(m.host_name)}</div>` : ''}
${agenda ? `<div style="font-size:14px;margin-top:12px;color:${FG};"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};margin-bottom:4px;">Agenda</div>${esc(agenda).replace(/\n/g, '<br>')}</div>` : ''}
<div style="margin-top:14px;">${m.doc_url ? `${button(m.doc_url, 'Open the meeting doc')}&nbsp; ` : ''}${button(url, 'Meeting page', !m.doc_url)}</div>`, '16px 18px');
	const text =
		`Hi ${first},\n\n${intro}${repeats}${askUpdate ? `\n\nBefore the meeting, write a couple of sentences on what you’ve actually done: ${updateUrl}` : ''}${opts.why ? `\n\nReason: ${opts.why.reason}${opts.why.by ? `\n— ${opts.why.by}` : ''}` : ''}\n\n${m.title}\n${when}${m.host_name ? `\nHosted by ${m.host_name}` : ''}` +
		(agenda ? `\n\nAgenda\n${agenda}` : '') +
		(m.doc_url ? `\n\nMeeting doc: ${m.doc_url}` : '') +
		`\nMeeting page: ${url}`;
	const at = `${day}${m.time ? `, ${formatTimeRange(m.time, m.end_time)}` : ''}`;
	return {
		subject: opts.hosting ? `You’re hosting: ${m.title}, ${at}` : opts.added ? `Added: ${m.title}, ${at}` : opts.changed ? `Updated: ${m.title}, ${at}` : opts.announce ? `New ${m.kind === 'event' ? 'club event' : 'meeting'}: ${m.title}, ${at}` : `${opts.soon ? 'In an hour' : day}: ${m.title}${m.time ? `, ${formatTimeRange(m.time, m.end_time)}` : ''}`,
		text,
		html: layout(html, appUrl)
	};
}

// ---------- added to a team ----------

/**
 * Sent when someone puts you on a team: the team's upcoming meetings, which you're now on, and how
 * to sign in if you never have.
 */
export function teamAddedEmail(member: { name: string; email: string }, team: { id: number; name: string }, by: string, meetings: EmailMeeting[], today: string, appUrl: string, firstTime: boolean) {
	const first = member.name.split(' ')[0];
	const teamUrl = `${appUrl}/teams/${team.id}`;
	const shown = meetings.slice(0, 6);
	const more = meetings.length - shown.length;
	const day = (d: string) => (d === today ? 'Today' : d === addDays(today, 1) ? 'Tomorrow' : formatDate(d, today));
	const when = (m: EmailMeeting) => [day(m.date), m.time && formatTimeRange(m.time, m.end_time), m.location].filter(Boolean).join(' · ');
	const intro = `${by} added you to the ${team.name} team on the Agentic AI UW Hub.`;
	const about = meetings.length ? 'You’re on its upcoming meetings and will get a reminder before each one.' : `${team.name} has no meetings scheduled yet.`;
	const rows = shown
		.map(
			(m) => box(`<div style="font-weight:600;font-size:15px;"><a href="${esc(`${appUrl}/meetings/${m.id}`)}" style="color:${FG};text-decoration:none;">${esc(m.title)}</a></div>
<div style="font-size:14px;color:${MUTED};margin-top:2px;">${esc(when(m))}</div>`, '12px 16px')
		)
		.join('');
	return {
		subject: `Added to the ${team.name} team`,
		text:
			`Hi ${first},\n\n${intro} ${about}` +
			(shown.length ? `\n\n${shown.map((m) => `- ${m.title}: ${when(m)}\n  ${appUrl}/meetings/${m.id}`).join('\n')}${more ? `\nPlus ${more} more on the team page.` : ''}` : '') +
			(firstTime ? `\n\nSign in with ${member.email} and we’ll email you a 6-digit code. No password needed.` : '') +
			`\n\nTeam page: ${teamUrl}`,
		html: layout(
			p(`Hi ${esc(first)},`) +
				p(esc(`${intro} ${about}`)) +
				(shown.length ? h('Upcoming meetings') + rows + (more ? p(`<span style="color:${MUTED};font-size:14px;">Plus ${more} more on the team page.</span>`) : '') : '') +
				(firstTime ? p(`Sign in with <b>${esc(member.email)}</b> and we’ll email you a 6-digit code. No password needed.`) : '') +
				`<div style="margin:6px 0 4px;">${button(teamUrl, 'Open the team page')}</div>`,
			appUrl
		)
	};
}

/**
 * The first line of a changed-meeting email, naming only what changed and its new value:
 * "The Exec Board meeting today has a new place: Morgridge 2nd Floor Org Suite." or
 * "The Business meeting has a new date and time: Sun, Nov 15, 6:00–7:00 PM."
 */
function changedLine(m: EmailMeeting, c: MeetingChanges, day: string, on: string, teams: string) {
	const the = m.kind === 'event' ? 'The club event' : `The ${teams} meeting`;
	const range = m.time ? formatTimeRange(m.time, m.end_time) : '';
	const what = andList([c.date && 'date', c.time && 'time', c.place && 'place'].filter((x): x is string => !!x));
	if (what) {
		const values = [c.date && (on.startsWith('on ') ? day : on), c.time && range, c.place && m.location].filter((x): x is string => !!x).join(', ');
		// A new date is said in the values; otherwise the meeting is still on its day.
		return `${the}${c.date ? '' : ` ${on}`} has a new ${what}${values ? `: ${values}` : ''}.`;
	}
	if (c.repeating) return `${the} ${on} is now part of a series.`;
	if (c.laterDates) return `The later ${m.kind === 'event' ? 'club events' : `${teams} meetings`} in this series have new dates.`;
	return `${the} ${on} has been updated.`;
}

/** Sent to everyone on a meeting when it's canceled; `later` are the dates of later ones in its series canceled with it. */
export function canceledEmail(m: EmailMeeting, today: string, appUrl: string, later: string[] = [], why: { reason: string; by: string } = { reason: '', by: '' }) {
	const day = m.date === today ? 'Today' : m.date === addDays(today, 1) ? 'Tomorrow' : formatDate(m.date, today);
	const at = `${day}${m.time ? `, ${formatTimeRange(m.time, m.end_time)}` : ''}`;
	const which = m.kind === 'event' ? 'The club event' : `The ${andList(m.team_names)} meeting`;
	const on = m.date === today || m.date === addDays(today, 1) ? day.toLowerCase() : `on ${day}`;
	const last = later.length ? formatDate(later[later.length - 1], today) : '';
	const rest = later.length === 1 ? ` So is the next one, on ${last}.` : later.length ? ` So are the ${later.length} after it, through ${last}.` : '';
	const line = `${which} ${on}${m.time ? ` (${formatTimeRange(m.time, m.end_time)})` : ''} is canceled.${rest}`;
	const what = [m.title, m.location].filter(Boolean).join(' · ');
	return {
		subject: `Canceled: ${m.title}, ${at}${later.length ? ` and ${later.length === 1 ? 'the next one' : `the ${later.length} after it`}` : ''}`,
		text: `Hi everyone,\n\n${line}\n\nReason: ${why.reason}${why.by ? `\n— ${why.by}` : ''}\n\n${what}`,
		html: layout(p('Hi everyone,') + p(esc(line)) + p(`<b>Reason:</b> ${esc(why.reason)}${why.by ? `<br><span style="color:${MUTED};">— ${esc(why.by)}</span>` : ''}`) + p(`<span style="color:${MUTED};">${esc(what)}</span>`), appUrl)
	};
}

export function testEmail(name: string, appUrl: string) {
	return {
		subject: 'Test email from the Agentic AI UW Hub',
		text: `Hi ${name},\n\nEmail sending works. Reminders will come from this address.\n\n${appUrl}`,
		html: layout(p(`Hi ${esc(name)},`) + p('Email sending works. Task reminders will come from this address.'), appUrl)
	};
}
