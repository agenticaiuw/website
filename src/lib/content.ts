/**
 * ============================================================================
 *  AGENTIC AI UW — SINGLE SOURCE OF TRUTH FOR ALL SITE CONTENT
 * ============================================================================
 *
 *  Shared site copy lives here; detailed Hivemind copy lives in hivemind.ts
 *  and its overview component. See WEBSITE-UPDATES.md for the editing map.
 *
 *  ANYTHING MARKED `placeholder: true` IS NOT REAL AND MUST NOT SHIP.
 *  Run `npm run check:placeholders` to list everything still outstanding.
 * ============================================================================
 */

export type Placeholder<T> = T & { placeholder?: boolean };

/* -------------------------------------------------------------------------- */
/*  CLUB IDENTITY — confirmed                                                 */
/* -------------------------------------------------------------------------- */

export const club = {
	name: 'Agentic AI UW',
	shortName: 'Agentic AI',
	university: 'University of Wisconsin–Madison',
	founded: 2026,
	rso: true,
	motto: 'Build products that make a difference in everyday life.',
	subMotto: 'A community of builders, learners, entrepreneurs, techno optimists.',
	/* The one-paragraph summary search engines and AI assistants show for the club. */
	summary: 'Agentic AI UW is a UW–Madison student club building for a new way to use computers: capable AI agents that run on everyday machines. Every major welcome.'
};

/* -------------------------------------------------------------------------- */
/*  VISION — the first thing a visitor reads on the homepage                  */
/* -------------------------------------------------------------------------- */

/* The club's own wording, split into runs so key phrases can be bolded and the
   source marker placed after the closing quote. Joining the runs gives the
   plain sentence back (no marker). */
const visionRuns: { t: string; strong?: boolean; cite?: boolean }[] = [
	{ t: 'With ' },
	{ t: 'Moore’s Law', strong: true },
	{ t: ' and the fact “' },
	{ t: 'models with the same capability are decreasing in size many times a year', strong: true },
	{ t: '”', cite: true },
	{ t: ', we predict that we’ll be able to run capable agents locally on mass-consumer hardware in a few years. With this, we believe there’s going to be a whole new way to interact with computers and do work, and ' },
	{ t: 'Agentic AI UW is building for the future.', strong: true }
];

export const vision = {
	label: 'Our vision',
	runs: visionRuns,
	text: visionRuns.map((r) => r.t).join(''),
	/* Where the quoted figure comes from; shown as footnote [1] on the home page. */
	source: {
		label: 'Xiao et al., “Densing law of LLMs,” Nature Machine Intelligence 7, 1823–1833 (2025)',
		href: 'https://doi.org/10.1038/s42256-025-01137-0'
	}
};

/* -------------------------------------------------------------------------- */
/*  STATS — community size under the vision. Update each term; `approx`     */
/*  shows as ~600 on the page and "nearly 600" in the FAQ.                   */
/* -------------------------------------------------------------------------- */

export const stats = {
	items: [
		{ n: 600, approx: true, label: 'Discord members', prose: 'members in its Discord' },
		{ n: 400, approx: true, label: 'on the mailing list', prose: 'people on its mailing list' },
		{ n: 80, approx: false, label: 'project team members', prose: 'members on its project teams' }
	]
};

/* -------------------------------------------------------------------------- */
/*  REASONS — what sets the club apart, on the home page under the vision     */
/* -------------------------------------------------------------------------- */

export const reasons = {
	heading: 'Five reasons we’re different',
	items: [
		{
			title: 'One club, one large-scale project',
			body: 'We’re the only CS club on campus where the whole club collaborates on one large-scale project.',
			link: { label: 'See the project', href: '/teams/' }
		},
		{
			title: 'An industry-like environment',
			body: 'Just like a real company, we have product, engineering, research and business teams working together on the same product.'
		},
		{
			title: 'Real value for people outside the club',
			body: 'Most project-based clubs build projects for competitions or demos. We’re building something that actually creates value for people outside the club.'
		},
		{
			title: 'An iterative design process',
			body: 'Products in the industry usually don’t stop after the first version, so why should student projects? We’re continually trying to improve the system.'
		},
		{
			title: 'We shoot for the moon',
			body: 'We’re trying to push the frontier of AI and attempt things that even the industry hasn’t figured out how to solve.'
		}
	] as { title: string; body: string; link?: { label: string; href: string } }[]
};

/* -------------------------------------------------------------------------- */
/*  TEAMS : Hivemind and the teams building it (/teams)                      */
/* -------------------------------------------------------------------------- */

export const work = {
	heading: 'Hivemind',
	lede: 'We’re building open source software that connects agents, shared context and your devices. A planned wristband brings voice access into your day, while a cloud web app offers a starting point of its own. A mobile app is also being considered.',
	goals: {
		label: 'What we’re aiming for',
		items: [
			{ when: 'End of Fall', people: '30', unit: 'people using Hivemind', saving: 'Target: 2.5 hours saved per person, per week on average' },
			{ when: 'End of Spring', people: '200', unit: 'people using Hivemind', saving: 'Target: 5 hours saved per person, per week on average' }
		]
	},
	northstar: {
		label: 'Northstar',
		lede: 'We’ll measure task speed, accuracy and cost against real outcomes. These are research goals, not proven gains.',
		items: [
			{ k: 'fast', metric: 'Speed', body: 'How fast can we have agents complete tasks?' },
			{ k: 'accurate', metric: 'Accuracy', body: 'How accurately can agents complete tasks?' },
			{ k: 'cheap', metric: 'Cost', body: 'How cheaply can agents complete tasks?' }
		]
	},
	subteams: {
		label: 'Teams',
		lede: 'Seven teams, one per board member, building one connected system. Explore a team below; you can contribute across areas as you learn.',
		items: [
			{
				k: 'hardware',
				name: 'Hardware',
				short: 'Hardware',
				lead: 'Evan Liu',
				initials: 'EL',
				line: 'Build a screenless wristband for talking to agents, and a USB device that lets agents operate a Mac or PC through mouse, keyboard and screen.',
				placeholder: false
			},
			{
				k: 'cloud',
				name: 'Cloud Agent',
				short: 'Cloud',
				lead: 'Anand Indukuri',
				initials: 'AI',
				line: 'Build the assistant’s cloud service and web app, with a mobile app also being considered.',
				placeholder: false
			},
			{
				k: 'os',
				name: 'PC Agent',
				short: 'PC',
				lead: 'Ife Solarin',
				initials: 'IS',
				line: 'Lives on your computer with access to your files, doing what the cloud cannot reach.',
				placeholder: false
			},
			{
				k: 'browser',
				name: 'Browser Extension Agent',
				short: 'Browser',
				lead: 'Bala Shukla',
				initials: 'BS',
				line: 'Safari and Chrome extensions that act across your tabs, in sessions you are already signed into.',
				placeholder: false
			},
			{
				k: 'architecture',
				name: 'Research',
				short: 'Research',
				lead: 'Ryan Khalili',
				initials: 'RK',
				line: 'Design memory, choose models and build the tools that help the connected agents work together.',
				placeholder: false
			},
			{
				k: 'ux',
				name: 'Design / Product',
				short: 'Design',
				lead: 'Joslyn DeGuzman',
				initials: 'JD',
				line: 'Shape the dashboard, views for connected devices and how the whole Hivemind feels to use.',
				placeholder: false
			},
			{
				k: 'business',
				name: 'Business',
				short: 'Business',
				lead: 'Zahra Moosani',
				initials: 'ZM',
				line: 'Outreach, marketing, finance and operations: keeping the club running smoothly.',
				placeholder: false
			}
		] as Placeholder<{
			k: string; name: string; short: string; lead: string; initials: string; line: string;
		}>[]
	}
};

/* -------------------------------------------------------------------------- */
/*  JOIN                                                                      */
/* -------------------------------------------------------------------------- */

export const join = {
	label: 'Join',
	heading: 'Join any time of year.',
	lede: 'Book office hours with the lead of the team you want to join. That’s the only step: no application, no cutoff, no recruiting season. Every major and every level is welcome.',
	discord: {
		title: 'Join the Discord',
		body: 'Where day-to-day discussion and questions happen.',
		cta: 'Join Discord',
		href: 'https://discord.gg/qQwy2K4vW'
	}
};

/* -------------------------------------------------------------------------- */
/*  EVENTS — /events. Add new events here, oldest first; the page sorts them   */
/*  into Upcoming and Past by date. `time` and `location` are optional.       */
/* -------------------------------------------------------------------------- */

export type ClubEvent = {
	date: string;
	dateEnd?: string;
	time?: string;
	kind: string;
	name: string;
	location?: string;
	body: string;
};

export const events = {
	label: 'Events',
	heading: 'Events',
	lede: 'Meetings, workshops, speaker events and socials.',
	empty: 'Nothing is scheduled right now. New events are announced in the Discord first.',
	items: [
		{
			date: '2026-09-09',
			dateEnd: '2026-09-10',
			time: '5 to 8 PM',
			kind: 'Fair',
			name: 'Fall 2026 Student Organization Fair',
			location: 'Kohl Center',
			body: 'We had a table both nights to meet students and answer questions about the club.'
		},
		{
			date: '2026-09-15',
			time: '6 to 7:30 PM',
			kind: 'Fair',
			name: 'CAI Student Organization Fair',
			location: 'Morgridge Hall',
			body: 'A table alongside the 40+ clubs in the College of Computing and Artificial Intelligence.'
		},
		{
			date: '2026-09-16',
			kind: 'Kickoff',
			name: 'Fall kickoff meeting',
			body: 'Members met the team, saw what we’re building and found their starting point.'
		}
	] as ClubEvent[]
};

/* -------------------------------------------------------------------------- */
/*  PARTNERS — /partners, for sponsors, companies and faculty                 */
/* -------------------------------------------------------------------------- */

export const partners = {
	label: 'Partners',
	heading: 'Partner with us',
	lede: 'Sponsor the club, bring us a real problem or speak to our members.',
	ways: [
		{ title: 'Sponsors', body: `Fund an open source AI project built by UW–Madison students, and reach a community of nearly ${stats.items[0].n}.` },
		{ title: 'Companies', body: 'Bring a problem worth solving. Our teams build agents meant for people outside the club.' },
		{ title: 'Faculty and researchers', body: 'Work with our Research team on memory, model choice and agent tools.' },
		{ title: 'Speakers', body: 'Run a talk or workshop for students building agentic AI.' }
	]
};

/* -------------------------------------------------------------------------- */
/*  TEAM — the founding board, shown on the home page                         */
/* -------------------------------------------------------------------------- */

/* The board cards on the home page show name, title, team and LinkedIn.
   `officeHours` is the lead's booking link, shown only on the Join page.
   Optional fields; a card leaves out whatever isn't set:
     photo     a square image saved as static/images/team/<first-last>.jpg,
               set as photo: '/images/team/<first-last>.jpg'. Initials show
               until it's set.
     blurb     a sentence or two in their own words */
export type Exec = {
	name: string;
	title: string;
	/** The project team they run, shown as "Leads <leads> team". */
	leads: string;
	/** That team's `k` in work.subteams; the team name links to it on /teams. */
	subteam: string;
	linkedin: string;
	officeHours: string;
	photo?: string;
	blurb?: string;
};

export const team = {
	heading: 'Meet the founding board',
	members: [
		{ name: 'Evan Liu', title: 'Founder and President', leads: 'Hardware', subteam: 'hardware', linkedin: 'https://www.linkedin.com/in/evan1liu/', officeHours: 'https://cal.com/evan-liu-u8mnsi/evan-s-office-hours?overlayCalendar=true' },
		{ name: 'Joslyn DeGuzman', title: 'Vice President', leads: 'Design / Product', subteam: 'ux', linkedin: 'https://www.linkedin.com/in/joslyn-deguzman/', officeHours: 'https://cal.com/joslyn-deguzman-thpsg1/15min?overlayCalendar=true&date=2026-09-23' },
		{ name: 'Ryan Khalili', title: 'Founding Member', leads: 'Research', subteam: 'architecture', linkedin: 'https://www.linkedin.com/in/ryan-khalili/', officeHours: 'https://cal.com/ryan-khalili2/30min?overlayCalendar=true' },
		{ name: 'Anand Indukuri', title: 'Founding Member', leads: 'Cloud', subteam: 'cloud', linkedin: 'https://www.linkedin.com/in/anandindukuri/', officeHours: 'https://cal.com/anand-indukuri-rbwhoj/cloud-team-office-hours?overlayCalendar=true' },
		{ name: 'Ife Solarin', title: 'Founding Member', leads: 'PC', subteam: 'os', linkedin: 'https://www.linkedin.com/in/ifesol/', officeHours: 'https://cal.com/ife-solarin-j1xfse/office-hours?overlayCalendar=true' },
		{ name: 'Bala Shukla', title: 'Founding Member', leads: 'Browser', subteam: 'browser', linkedin: 'https://www.linkedin.com/in/bala-shukla/', officeHours: 'https://cal.com/bala-shukla-z5su5x/15min?overlayCalendar=true' },
		{ name: 'Zahra Moosani', title: 'Founding Member', leads: 'Business', subteam: 'business', linkedin: 'https://www.linkedin.com/in/zahramoosani/', officeHours: 'https://calendly.com/zahrazmoosani/30min' }
	] as Exec[]
};

/* -------------------------------------------------------------------------- */
/*  SOCIAL + CONTACT                                                         */
/* -------------------------------------------------------------------------- */

export const social = [
	{ name: 'Discord', href: 'https://discord.gg/qQwy2K4vW', handle: 'Join the server', placeholder: false },
	{ name: 'Instagram', href: 'https://www.instagram.com/agenticaiuw/', handle: '@agenticaiuw', placeholder: false },
	{ name: 'LinkedIn', href: 'https://www.linkedin.com/company/agenticaiuw/', handle: 'Agentic AI UW', placeholder: false },
	{ name: 'X', href: 'https://x.com/AgenticAIUW', handle: '@AgenticAIUW', placeholder: false }
] as Placeholder<{ name: string; href: string; handle: string }>[];

/* The members-only project management app (the hub/ Worker), linked from the footer. */
export const memberHub = {
	label: 'Member hub',
	href: 'https://hub.agenticaiuw.com/',
	blurb: 'Where members track the project’s tasks. Sign-in required.'
};

export const contact = {
	heading: 'Contact',
	lede: 'Reach out with questions about the club, collaborations or speaking.',
	email: 'team@agenticaiuw.com',
	placeholder: false
};

/* -------------------------------------------------------------------------- */
/*  FAQ — the /faq page, its FAQPage structured data and /llms.txt            */
/*  Answers are plain sentences so search engines and AI assistants can quote */
/*  them as written. Only restate facts already on the site.                  */
/* -------------------------------------------------------------------------- */

const subteamsSentence = (() => {
	const names = work.subteams.items.map((s) => `${s.name} (led by ${s.lead})`);
	return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
})();

const statsSentence = (() => {
	const parts = stats.items.map((i) => `${i.approx ? 'nearly ' : ''}${i.n} ${i.prose}`);
	return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
})();

const execSentence = (() => {
	const names = team.members.map((m) => `${m.name} (${m.title}, leads the ${m.leads} team)`);
	return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
})();

export const faq = {
	label: 'FAQ',
	heading: 'Questions, answered.',
	lede: 'The short version of what the club is, what we build and how to get involved.',
	items: [
		{
			q: 'What is Agentic AI UW?',
			a: `${club.name} is a student organization at the ${club.university}, founded in ${club.founded}. We build agentic AI products that make a difference in everyday life. We are a community of builders, learners, entrepreneurs and techno optimists, open to every major.`
		},
		{
			q: 'How big is Agentic AI UW?',
			a: `${club.name} has ${statsSentence}.`
		},
		{
			q: 'What is the club’s vision?',
			a: vision.text,
			links: [{ label: 'Source', href: vision.source.href }]
		},
		{
			q: 'What is agentic AI?',
			a: 'An AI agent doesn’t just answer; it does the work. Ask a chatbot to clean up your files and it will explain how. An agent opens the folder, does it, then checks that it worked. The model underneath can be the same. The difference is the tools and systems it is connected to.'
		},
		{
			q: 'What is the club building?',
			a: 'Hivemind, an open source AI assistant in development. It connects agents, shared context and your devices: a planned screenless wristband for voice access, a cloud service and web app, an agent on your computer and browser extensions. A mobile app is also being considered.',
			links: [{ label: 'See the project', href: '/teams/' }]
		},
		{
			q: 'What are the project teams?',
			a: `Seven teams build Hivemind, one per board member: ${subteamsSentence}. Members can contribute across areas as they learn.`,
			links: [{ label: 'Book office hours with a team', href: '/join/#office-hours' }]
		},
		{
			q: 'Who runs Agentic AI UW?',
			a: `A seven-person founding board: ${execSentence}. Each board member leads a project team and holds office hours.`,
			links: [{ label: 'Meet the founding board', href: '/#team' }]
		},
		{
			q: 'Do I need to be a computer science major or have AI experience?',
			a: 'No. Every major and every level is welcome, and no prior AI experience is needed. Business and design teams build alongside engineers.'
		},
		{
			q: 'How do I join Agentic AI UW?',
			a: 'Book office hours with the lead of the team you want to join. You can join any time of year; there is no application, no cutoff and no recruiting season.',
			links: [
				{ label: 'Book office hours', href: '/join/#office-hours' },
				{ label: 'Discord', href: 'https://discord.gg/qQwy2K4vW' }
			]
		},
		{
			q: 'How can a company, professor or researcher work with the club?',
			a: `Email ${contact.email}. We welcome sponsors, companies with a problem worth solving, faculty with an idea and anyone curious about what we build.`,
			links: [{ label: 'Partner with us', href: '/partners/' }]
		},
		{
			q: 'Has Agentic AI UW been in the news?',
			a: 'Yes. The Daily Cardinal, UW–Madison’s student newspaper, covered the club on September 3, 2026.',
			links: [{ label: 'Read the article', href: 'https://www.dailycardinal.com/article/2026/09/agentic-ai-uw-brings-next-step-in-artificial-intelligence-to-uw-madison' }]
		},
		{
			q: 'Where can I follow Agentic AI UW?',
			a: 'On Instagram (@agenticaiuw), LinkedIn (Agentic AI UW) and X (@AgenticAIUW). Day-to-day discussion happens in the club Discord.',
			links: social.filter((s) => s.href).map((s) => ({ label: s.name, href: s.href }))
		}
	] as { q: string; a: string; links?: { label: string; href: string }[] }[]
};

export const nav = [
	{ label: 'Home', id: 'home', href: '/', blurb: club.motto },
	{ label: 'Teams', id: 'teams', href: '/teams', blurb: 'Hivemind, and the seven teams building it' },
	{ label: 'Events', id: 'events', href: '/events', blurb: 'Meetings, workshops, speaker events and socials' },
	{ label: 'Partners', id: 'partners', href: '/partners', blurb: 'For sponsors, companies and faculty' }
];
