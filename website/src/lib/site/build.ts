/**
 * Site text comes from the member hub (hub.agenticaiuw.com/site), where execs edit it
 * with a full history. This turns the hub's sections into what the pages render:
 * placeholders like {{club}} filled in, the vision split into bold runs, and so on.
 * content.json is the hub's text as of the last build; scripts/snapshot-content.mjs saves it.
 */
import fallback from './content.json';

export type Sections = typeof fallback;

type Link = { label: string; href: string };
export type Run = { t: string; strong?: boolean; cite?: boolean };
export type ClubEvent = { date: string; dateEnd?: string; time?: string; kind: string; name: string; location?: string; body: string };
/** A team's people come from the hub's own team: its head (the exec on it) and its leads. */
export type TeamLead = { name: string; title: string };
/** A folder in the project's repository, linked on GitHub. */
export type CodeLink = { label: string; href: string };
export type Team = { k: string; name: string; short: string; line: string; heads: string[]; leads: TeamLead[]; goals: string[]; code: CodeLink[] };
type RawTeam = Omit<Team, 'heads' | 'leads' | 'goals' | 'code'> & { heads?: string[]; leads?: TeamLead[]; lead?: string; goals?: string[]; code?: string[] };
const toTeam =
	(repo: string) =>
	(t: RawTeam): Team => ({
		k: t.k,
		name: t.name,
		short: t.short,
		line: t.line,
		heads: t.heads ?? (t.lead ? [t.lead] : []),
		leads: t.leads ?? [],
		goals: t.goals ?? [],
		code: (t.code ?? []).map((folder) => {
			const path = folder.replace(/^\/+|\/+$/g, '');
			return { label: `${path}/`, href: repo ? `${repo.replace(/\/+$/, '')}/tree/main/${path}` : '#' };
		})
	});

export type Exec = { name: string; title: string; leads: string; subteam: string; linkedin: string; officeHours: string; photo?: string; blurb?: string };

/** "a, b and c". */
const andList = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/** Links from the hub are checked there too; this keeps anything odd off the page. */
export const safeHref = (href: string) => (/^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(href) ? href : '#');

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Lines of plain text joined with line breaks, as HTML. */
export const linesHtml = (s: string) => s.split('\n').map(escape).join('<br /> ');

/** **bold**, [text](link) and line breaks, as HTML. Everything else is escaped. */
export function richHtml(s: string) {
	return s
		.split('\n')
		.map((line) =>
			escape(line)
				.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
				.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text: string, href: string) => {
					const url = safeHref(href.replace(/&amp;/g, '&'));
					const external = /^https?:\/\//i.test(url);
					return `<a href="${escape(url)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${text}</a>`;
				})
		)
		.join('<br /> ');
}

/** The vision with its **bold** phrases and the [^1] source marker. */
export function visionRuns(text: string): Run[] {
	const runs: Run[] = [];
	for (const part of text.split(/(\*\*.+?\*\*|\[\^1\])/)) {
		if (!part) continue;
		if (part === '[^1]') {
			if (runs.length) runs[runs.length - 1].cite = true;
		} else if (part.startsWith('**') && part.endsWith('**') && part.length > 4) runs.push({ t: part.slice(2, -2), strong: true });
		else runs.push({ t: part });
	}
	return runs;
}

/** Replaces every string inside a value, keeping its shape. */
function mapStrings<T>(value: T, fn: (s: string) => string): T {
	if (typeof value === 'string') return fn(value) as T;
	if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn)) as T;
	if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn)])) as T;
	return value;
}

const opt = (s: string | undefined) => (s ? s : undefined);

export function buildContent(input: Partial<Sections>) {
	// A section the hub didn't send falls back to the snapshot.
	const raw = { ...fallback, ...input } as Sections;

	const base: Record<string, string> = {
		club: raw.club.name,
		short_name: raw.club.shortName,
		university: raw.club.university,
		founded: String(raw.club.founded),
		motto: raw.club.motto,
		email: raw.links.email,
		vision_source: raw.vision.sourceHref
	};
	const tokens = (s: string, extra: Record<string, string> = {}) =>
		s.replace(/\{\{\s*([a-z_]+)(?::([^}]+))?\s*\}\}/gi, (m, name: string, arg?: string) => {
			const key = name.toLowerCase();
			if (key === 'stat' && arg) {
				const st = raw.stats.items.find((i) => i.key === arg.trim());
				return st ? String(st.n) : m;
			}
			if (key === 'social' && arg) {
				const so = raw.links.social.find((i) => i.name.toLowerCase() === arg.trim().toLowerCase());
				return so ? so.href : m;
			}
			return extra[key] ?? base[key] ?? m;
		});

	const visionText = tokens(raw.vision.text);
	/* The club's one-line summary (search results, AI briefing) is the vision itself. */
	base.summary = visionText.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\[\^1\]/g, '');
	const all: Record<string, string> = {
		vision: base.summary,
		stats_sentence: andList(raw.stats.items.map((i) => `${i.approx ? 'nearly ' : ''}${i.n} ${i.prose}`)),
		teams_sentence: andList((raw.teams.items as RawTeam[]).map(toTeam('')).map((t) => (t.heads.length ? `${t.name} (headed by ${andList(t.heads)})` : t.name))),
		board_sentence: andList(raw.board.members.map((m) => `${m.name} (${m.title}, heads the ${m.leads} team)`))
	};
	const s = mapStrings(raw, (x) => tokens(x, all));

	const club = { ...s.club };
	const social = s.links.social.map((l) => ({ name: l.name, href: safeHref(l.href) }));
	const team = {
		heading: s.board.heading,
		members: s.board.members.map((m): Exec => ({ ...m, linkedin: safeHref(m.linkedin), officeHours: safeHref(m.officeHours), photo: opt(m.photo), blurb: opt(m.blurb) }))
	};
	const pages = { ...mapStrings(fallback.pages, (x) => tokens(x, all)), ...s.pages };
	const pressDate = new Date(`${s.press.date}T12:00:00Z`);

	return {
		club,
		vision: { label: s.vision.label.replace(/\*\*(.+?)\*\*/g, '$1'), labelRuns: visionRuns(s.vision.label), runs: visionRuns(visionText), text: all.vision, source: { label: s.vision.sourceLabel, href: safeHref(s.vision.sourceHref) } },
		stats: s.stats,
		press: {
			...s.press,
			href: safeHref(s.press.href),
			dateLabel: Number.isNaN(pressDate.getTime()) ? s.press.date : pressDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
		},
		reasons: {
			heading: s.reasons.heading,
			items: s.reasons.items.map((r) => ({ title: r.title, body: r.body, link: r.linkLabel && r.linkHref ? { label: r.linkLabel, href: safeHref(r.linkHref) } : undefined }))
		},
		team,
		project: { ...s.project, repoHref: safeHref(s.project.repoHref) },
		work: { subteams: { ...s.teams, items: (s.teams.items as RawTeam[]).map(toTeam(safeHref(s.project.repoHref))) } },
		events: { ...s.events, items: s.events.items.map((e): ClubEvent => ({ date: e.date, dateEnd: opt(e.dateEnd), time: opt(e.time), kind: e.kind, name: e.name, location: opt(e.location), body: e.body })) },
		join: { ...s.join, discordLabel: s.join.discordLabel ?? '', discordHref: safeHref(s.join.discordHref) },
		partners: s.partners,
		faq: { ...s.faq, items: s.faq.items.map((f) => ({ q: f.q, a: f.a, links: f.links.length ? f.links.map((l): Link => ({ label: l.label, href: safeHref(l.href) })) : undefined })) },
		social,
		contact: { heading: s.links.contactHeading, lede: s.links.contactLede, email: s.links.email },
		memberHub: { label: s.links.hubLabel, href: safeHref(s.links.hubHref), blurb: s.links.hubBlurb },
		/* A page the hub doesn't have text for yet uses the snapshot's. */
		pages,
		nav: [
			{ label: 'Home', id: 'home', href: '/', blurb: pages.home.blurb },
			{ label: s.project.title, id: 'hive', href: '/hive', blurb: pages.hive.blurb },
			{ label: 'Teams', id: 'teams', href: '/teams', blurb: pages.teams.blurb },
			{ label: 'Events', id: 'events', href: '/events', blurb: pages.events.blurb },
			{ label: 'Partners', id: 'partners', href: '/partners', blurb: pages.partners.blurb }
		]
	};
}

export type Site = ReturnType<typeof buildContent>;
