// What each block of public website content looks like, so the hub can show an editor
// for it, check what comes back and describe changes in the edit history.

export type Field =
	| { t: 'text' | 'long' | 'rich' | 'url' | 'date'; k: string; label: string; hint?: string; max?: number; optional?: boolean }
	| { t: 'number'; k: string; label: string; hint?: string }
	| { t: 'bool'; k: string; label: string; hint?: string }
	| { t: 'group'; k: string; label: string; fields: Field[] }
	| { t: 'list'; k: string; label: string; item: string; fields: Field[]; title?: string; hint?: string }
	| { t: 'strings'; k: string; label: string; item: string; hint?: string };

export type Section = { key: string; title: string; page: string; where: string; fields: Field[] };

const text = (k: string, label: string, hint?: string, optional = false): Field => ({ t: 'text', k, label, hint, optional });
const long = (k: string, label: string, hint?: string, optional = false): Field => ({ t: 'long', k, label, hint, optional });
const rich = (k: string, label: string, hint?: string, optional = false): Field => ({ t: 'rich', k, label, hint, optional });
const url = (k: string, label: string, hint?: string, optional = false): Field => ({ t: 'url', k, label, hint, optional });
const lines = (k: string, label: string, hint = 'Each new line starts a new line on the page.'): Field => ({ t: 'long', k, label, hint });
const card = (k: string, label: string): Field => ({ t: 'group', k, label, fields: [text('eyebrow', 'Label'), text('title', 'Title'), long('body', 'Text')] });

export const PAGES = ['Every page', 'Home', 'Teams', 'Events', 'Join', 'Partners', 'FAQ'];

export const SECTIONS: Section[] = [
	{
		key: 'club',
		title: 'Club basics',
		page: 'Every page',
		where: 'The name, university and motto used across the site, the footer and search results.',
		fields: [
			text('name', 'Club name'),
			text('shortName', 'Short name', 'Used in search results, like “Agentic AI at UW–Madison”.'),
			text('university', 'University'),
			{ t: 'number', k: 'founded', label: 'Year founded' },
			text('motto', 'Motto'),
			text('subMotto', 'Second motto line', 'Shown in the AI briefing at /llms.txt.'),
			long('summary', 'One-paragraph summary', 'What search engines and AI assistants show for the club.'),
			text('footerLine', 'Footer line')
		]
	},
	{
		key: 'links',
		title: 'Social links and contact',
		page: 'Every page',
		where: 'The footer’s Follow and Contact columns, and the Member hub button in the header.',
		fields: [
			{
				t: 'list',
				k: 'social',
				label: 'Social links',
				item: 'link',
				title: 'name',
				hint: 'Discord, Instagram, LinkedIn and X get their icons. Use {{social:Name}} in other text to reuse a link.',
				fields: [text('name', 'Name'), url('href', 'Link')]
			},
			text('contactHeading', 'Contact heading'),
			long('contactLede', 'Contact text'),
			text('email', 'Contact email'),
			text('hubLabel', 'Member hub button'),
			url('hubHref', 'Member hub link'),
			text('hubBlurb', 'Member hub tooltip')
		]
	},
	{
		key: 'pages',
		title: 'Page titles and search descriptions',
		page: 'Every page',
		where: 'Browser tab titles, search result snippets and link previews.',
		fields: [
			{ t: 'group', k: 'home', label: 'Home', fields: [text('title', 'Title'), long('description', 'Search description'), long('share', 'Link preview text'), text('blurb', 'One-line description')] },
			{ t: 'group', k: 'teams', label: 'Teams', fields: [text('title', 'Title'), long('description', 'Search description'), text('blurb', 'One-line description')] },
			{ t: 'group', k: 'events', label: 'Events', fields: [text('title', 'Title'), long('description', 'Search description'), text('blurb', 'One-line description')] },
			{ t: 'group', k: 'partners', label: 'Partners', fields: [text('title', 'Title'), long('description', 'Search description'), text('blurb', 'One-line description')] },
			{ t: 'group', k: 'join', label: 'Join', fields: [text('title', 'Title'), long('description', 'Search description')] },
			{ t: 'group', k: 'faq', label: 'FAQ', fields: [text('title', 'Title'), long('description', 'Search description')] }
		]
	},
	{
		key: 'vision',
		title: 'Vision',
		page: 'Home',
		where: 'The first thing a visitor reads on the home page.',
		fields: [
			text('label', 'Label'),
			rich('text', 'Vision', 'Wrap words in **double asterisks** to bold them. [^1] places the source marker.'),
			text('sourceLabel', 'Source'),
			url('sourceHref', 'Source link')
		]
	},
	{
		key: 'stats',
		title: 'Community numbers',
		page: 'Home',
		where: 'The numbers under the vision. Also used in the FAQ and wherever {{stat:key}} appears.',
		fields: [
			{
				t: 'list',
				k: 'items',
				label: 'Numbers',
				item: 'number',
				title: 'label',
				fields: [
					text('key', 'Key', 'Short id for reusing the number in text, like {{stat:discord}}.'),
					{ t: 'number', k: 'n', label: 'Number' },
					{ t: 'bool', k: 'approx', label: 'Approximate', hint: 'Shows as ~600, and “nearly 600” in sentences.' },
					text('label', 'Label'),
					text('prose', 'In a sentence', 'Like “members in its Discord”, for the FAQ.')
				]
			}
		]
	},
	{
		key: 'press',
		title: 'Press feature',
		page: 'Home',
		where: 'The news article card on the home page.',
		fields: [text('eyebrow', 'Label'), text('name', 'Publication'), long('headline', 'Headline'), text('credit', 'Credit'), { t: 'date', k: 'date', label: 'Date' }, url('href', 'Article link'), text('cta', 'Button')]
	},
	{
		key: 'reasons',
		title: 'Why we’re different',
		page: 'Home',
		where: 'The numbered reasons under the vision.',
		fields: [
			text('heading', 'Heading'),
			{
				t: 'list',
				k: 'items',
				label: 'Reasons',
				item: 'reason',
				title: 'title',
				fields: [text('title', 'Title'), long('body', 'Text'), text('linkLabel', 'Link text', undefined, true), url('linkHref', 'Link', undefined, true)]
			}
		]
	},
	{
		key: 'board',
		title: 'Board members',
		page: 'Home',
		where: 'The board cards on the home page and the office hours cards on Join.',
		fields: [
			text('heading', 'Heading'),
			{
				t: 'list',
				k: 'members',
				label: 'Members',
				item: 'member',
				title: 'name',
				fields: [
					text('name', 'Name'),
					text('title', 'Title'),
					text('leads', 'Team they lead'),
					text('subteam', 'Team key', 'The team’s key from Teams, like hardware. Links the card to that team.'),
					url('linkedin', 'LinkedIn'),
					url('officeHours', 'Office hours booking link'),
					url('photo', 'Photo', 'Optional. A square image link.', true),
					long('blurb', 'Blurb', 'Optional. A sentence or two in their own words.', true)
				]
			}
		]
	},
	{
		key: 'project',
		title: 'Hivemind: intro',
		page: 'Teams',
		where: 'The top of the Teams page: the project, its two ways in, hardware and software.',
		fields: [
			text('status', 'Status'),
			text('title', 'Project name'),
			text('tagline', 'Tagline'),
			text('taglineAccent', 'Tagline, colored part'),
			long('intro', 'Intro'),
			long('summary', 'Summary', 'Shown in the AI briefing at /llms.txt.'),
			long('accessNote', 'Note under the intro'),
			text('primaryCta', 'Main button'),
			url('primaryHref', 'Main button link'),
			text('secondaryCta', 'Second link'),
			url('secondaryHref', 'Second link target'),
			long('welcomeNote', 'Welcome note'),
			text('journeyEyebrow', 'Workflow label'),
			text('journeyLabel', 'Workflow tag'),
			{
				t: 'list',
				k: 'scenarios',
				label: 'Ways in',
				item: 'way in',
				title: 'label',
				fields: [
					text('label', 'Tab name'),
					text('prompt', 'Example request'),
					text('entry', 'Step 1'),
					long('entryDetail', 'Step 1 detail'),
					text('context', 'Step 2'),
					long('contextDetail', 'Step 2 detail'),
					text('action', 'Step 3'),
					long('actionDetail', 'Step 3 detail'),
					text('result', 'Step 4'),
					long('resultDetail', 'Step 4 detail')
				]
			},
			long('diagramNote', 'Note under the workflow'),
			card('hardware', 'Hardware card'),
			card('software', 'Software card')
		]
	},
	{
		key: 'project_why',
		title: 'Hivemind: why it exists',
		page: 'Teams',
		where: 'The “Why Hivemind if Hermes exists?” section and the engineering goals.',
		fields: [
			text('eyebrow', 'Label'),
			lines('heading', 'Heading'),
			lines('thesis', 'Thesis'),
			long('intent', 'Intent'),
			{ t: 'strings', k: 'path', label: 'Context steps', item: 'step' },
			card('base', 'Hermes card'),
			card('goal', 'Hivemind card'),
			long('answer', 'Answer'),
			text('sourceLabel', 'Source link text'),
			url('sourceHref', 'Source link'),
			text('goalsEyebrow', 'Goals label'),
			text('goalsLede', 'Goals intro'),
			{
				t: 'list',
				k: 'goals',
				label: 'Engineering goals',
				item: 'goal',
				title: 'verb',
				fields: [text('verb', 'Verb'), text('title', 'Title'), long('body', 'Text'), rich('mechanism', 'How it works', 'Optional. **Bold** the term it introduces.', true)]
			},
			long('note', 'Note under the goals'),
			text('researchTitle', 'Research box title'),
			text('researchSubtitle', 'Research box subtitle'),
			{
				t: 'list',
				k: 'research',
				label: 'Research proposals',
				item: 'proposal',
				title: 'title',
				fields: [text('title', 'Title'), long('body', 'Text'), long('limit', 'Limits'), text('linkLabel', 'Source link text'), url('linkHref', 'Source link')]
			},
			long('researchDate', 'Research note')
		]
	},
	{
		key: 'project_details',
		title: 'Hivemind: under the hood',
		page: 'Teams',
		where: 'The three expandable boxes: how the pieces fit, what each team builds and the hard parts.',
		fields: [
			text('eyebrow', 'Label'),
			text('heading', 'Heading'),
			lines('aside', 'Side note'),
			text('architectureTitle', 'First box title'),
			text('architectureSubtitle', 'First box subtitle'),
			{ t: 'list', k: 'architecture', label: 'How the pieces fit', item: 'piece', title: 'title', fields: [text('title', 'Title'), text('summary', 'Summary'), long('body', 'Text')] },
			text('buildTitle', 'Second box title'),
			text('buildSubtitle', 'Second box subtitle'),
			{ t: 'list', k: 'buildAreas', label: 'What each team will build', item: 'team', title: 'name', fields: [text('name', 'Team'), long('detail', 'What they build')] },
			text('prioritiesTitle', 'Third box title'),
			text('prioritiesSubtitle', 'Third box subtitle'),
			{ t: 'list', k: 'priorities', label: 'The hard parts', item: 'question', title: 'question', fields: [text('question', 'Question'), long('answer', 'Answer')] },
			long('status', 'Project status')
		]
	},
	{
		key: 'project_beginner',
		title: 'Hivemind: beginners welcome',
		page: 'Teams',
		where: 'The “Learn. Build. Belong.” card.',
		fields: [
			text('eyebrow', 'Label'),
			{ t: 'strings', k: 'words', label: 'Heading words', item: 'word' },
			rich('body', 'Text', '**Bold** with double asterisks.'),
			text('cta', 'Button'),
			url('ctaHref', 'Button link'),
			{ t: 'list', k: 'support', label: 'Support points', item: 'point', title: 'title', fields: [text('title', 'Title'), rich('body', 'Text', 'Links: [text](https://…).')] }
		]
	},
	{
		key: 'project_goals',
		title: 'Hivemind: goals and northstar',
		page: 'Teams',
		where: 'The semester targets and the northstar metrics.',
		fields: [
			text('label', 'Goals heading'),
			long('lede', 'Goals intro'),
			{
				t: 'list',
				k: 'items',
				label: 'Targets',
				item: 'target',
				title: 'when',
				fields: [text('when', 'When'), text('people', 'Number'), text('unit', 'Unit'), text('saving', 'Target')]
			},
			text('northstarLabel', 'Northstar heading'),
			long('northstarLede', 'Northstar intro'),
			{ t: 'list', k: 'northstar', label: 'Northstar metrics', item: 'metric', title: 'metric', fields: [text('metric', 'Metric'), long('body', 'Question')] }
		]
	},
	{
		key: 'teams',
		title: 'Project teams',
		page: 'Teams',
		where: 'The team picker on the Teams page. Also used in the FAQ.',
		fields: [
			text('label', 'Label'),
			text('heading', 'Heading'),
			long('lede', 'Intro'),
			{
				t: 'list',
				k: 'items',
				label: 'Teams',
				item: 'team',
				title: 'name',
				fields: [
					text('k', 'Key', 'Short id used in links and for the badger artwork: hardware, cloud, os, browser, architecture, ux or business.'),
					text('name', 'Name'),
					text('short', 'Short name'),
					text('lead', 'Lead'),
					long('line', 'Description')
				]
			}
		]
	},
	{
		key: 'events',
		title: 'Events',
		page: 'Events',
		where: 'The Events page. Events sort into Upcoming and Past by date on their own.',
		fields: [
			text('heading', 'Heading'),
			long('lede', 'Intro'),
			text('upcomingLabel', 'Upcoming heading'),
			text('pastLabel', 'Past heading'),
			long('empty', 'When nothing is scheduled'),
			text('discordCta', 'Discord link text'),
			{
				t: 'list',
				k: 'items',
				label: 'Events',
				item: 'event',
				title: 'name',
				hint: 'Order doesn’t matter.',
				fields: [
					text('name', 'Name'),
					text('kind', 'Kind', 'Like Fair, Kickoff or Workshop.'),
					{ t: 'date', k: 'date', label: 'Date' },
					{ t: 'date', k: 'dateEnd', label: 'Last day', hint: 'Optional, for events over several days.', optional: true },
					text('time', 'Time', 'Optional, like 5 to 8 PM.', true),
					text('location', 'Location', undefined, true),
					long('body', 'Description')
				]
			}
		]
	},
	{
		key: 'join',
		title: 'Join',
		page: 'Join',
		where: 'The Join page. The office hours cards come from Board members.',
		fields: [
			text('heading', 'Heading'),
			long('lede', 'Intro'),
			text('officeHoursHeading', 'Office hours heading', 'Read by screen readers.'),
			text('officeHoursCta', 'Office hours button'),
			text('discordTitle', 'Discord card title'),
			text('discordBody', 'Discord card text'),
			text('discordCta', 'Discord button'),
			url('discordHref', 'Discord link')
		]
	},
	{
		key: 'partners',
		title: 'Partners',
		page: 'Partners',
		where: 'The Partners page, for sponsors, companies and faculty.',
		fields: [
			text('heading', 'Heading'),
			long('lede', 'Intro'),
			{ t: 'list', k: 'ways', label: 'Ways to partner', item: 'way', title: 'title', fields: [text('title', 'Title'), long('body', 'Text')] },
			text('contactTitle', 'Contact card text')
		]
	},
	{
		key: 'faq',
		title: 'FAQ',
		page: 'FAQ',
		where: 'The FAQ page, its search data and the AI briefing at /llms.txt.',
		fields: [
			text('heading', 'Heading'),
			long('lede', 'Intro'),
			{
				t: 'list',
				k: 'items',
				label: 'Questions',
				item: 'question',
				title: 'q',
				fields: [
					text('q', 'Question'),
					long('a', 'Answer'),
					{ t: 'list', k: 'links', label: 'Links', item: 'link', title: 'label', fields: [text('label', 'Text'), url('href', 'Link')] }
				]
			}
		]
	}
];

export const sectionByKey = (key: string) => SECTIONS.find((s) => s.key === key);

/** Placeholders the website fills in, listed under every editor. */
export const TOKENS: [string, string][] = [
	['{{club}}', 'Club name'],
	['{{university}}', 'University'],
	['{{founded}}', 'Year founded'],
	['{{motto}}', 'Motto'],
	['{{summary}}', 'One-paragraph summary'],
	['{{email}}', 'Contact email'],
	['{{vision}}', 'The vision, as plain text'],
	['{{vision_source}}', 'The vision’s source link'],
	['{{stat:discord}}', 'A community number, by its key'],
	['{{stats_sentence}}', 'All community numbers in one sentence'],
	['{{teams_sentence}}', 'Every team and its lead'],
	['{{board_sentence}}', 'Every board member, title and team'],
	['{{social:Discord}}', 'A social link, by its name']
];
