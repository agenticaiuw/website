// What each block of public website content looks like, so the hub can show an editor
// for it, check what comes back and describe changes in the edit history.

export type Field =
	| { t: 'text' | 'long' | 'rich' | 'url' | 'date'; k: string; label: string; hint?: string; max?: number; optional?: boolean }
	| { t: 'number'; k: string; label: string; hint?: string }
	| { t: 'bool'; k: string; label: string; hint?: string }
	/** A project team in the hub, stored by its id. */
	| { t: 'team'; k: string; label: string; hint?: string }
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
			text('subMotto', 'Second motto line', 'Shown in the AI briefing at /llms.txt.')
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
			{ t: 'group', k: 'hive', label: 'Hive', fields: [text('title', 'Title'), long('description', 'Search description'), text('blurb', 'One-line description')] },
			{ t: 'group', k: 'teams', label: 'Teams', fields: [text('title', 'Title'), long('description', 'Search description'), text('blurb', 'One-line description')] },
			{ t: 'group', k: 'events', label: 'Events', fields: [text('title', 'Title'), long('description', 'Search description'), text('blurb', 'One-line description')] },
			{ t: 'group', k: 'partners', label: 'Partners', fields: [text('title', 'Title'), long('description', 'Search description'), text('blurb', 'One-line description')] },
			{ t: 'group', k: 'join', label: 'Join', fields: [text('title', 'Title'), long('description', 'Search description')] },
			{ t: 'group', k: 'faq', label: 'FAQ', fields: [text('title', 'Title'), long('description', 'Search description')] }
		]
	},
	{
		key: 'vision',
		title: 'Home headline',
		page: 'Home',
		where: 'The first thing a visitor reads on the home page: a short label and the statement under it. Search results and link previews use the statement too.',
		fields: [
			text('label', 'Label', 'Shown small above the statement.'),
			rich('text', 'Statement', 'Wrap words in **double asterisks** to bold them. [^1] places a source marker that links to the source below.'),
			text('sourceLabel', 'Source', 'Only needed with a [^1] marker.', true),
			url('sourceHref', 'Source link', undefined, true)
		]
	},
	{
		key: 'stats',
		title: 'Community numbers',
		page: 'Home',
		where: 'The numbers under the home headline. Also used in the FAQ and wherever {{stat:key}} appears.',
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
		title: 'Why we started',
		page: 'Home',
		where: 'The numbered reasons on the home page.',
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
					text('leads', 'Team they head'),
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
		title: 'Hive',
		page: 'Teams',
		where: 'The top of the Teams page: the project’s goal, this semester’s plan and the link to the code.',
		fields: [
			text('eyebrow', 'Label'),
			text('title', 'Project name'),
			rich('goal', 'Goal', 'Wrap words in **double asterisks** to bold them.'),
			long('why', 'Why it’s needed', 'Optional. Shown under the goal.', true),
			long('summary', 'Summary', 'Shown in the AI briefing at /llms.txt.'),
			text('semesterLabel', 'This semester heading'),
			{ t: 'strings', k: 'semester', label: 'This semester', item: 'point' },
			text('repoCta', 'Code link text'),
			url('repoHref', 'Code link', 'The GitHub repository. Team code folders link into it.')
		]
	},
	{
		key: 'teams',
		title: 'Project teams',
		page: 'Teams',
		where: 'The team picker and team goals on the Teams page, and each team’s own page. Also used in the FAQ.',
		fields: [
			text('label', 'Label'),
			text('heading', 'Heading'),
			long('lede', 'Intro'),
			text('goalsLabel', 'Goals heading'),
			text('codeLabel', 'Code heading'),
			{
				t: 'list',
				k: 'items',
				label: 'Teams',
				item: 'team',
				title: 'name',
				fields: [
					text('k', 'Key', 'Short id for the team’s page (/teams/key/) and its badger artwork: hardware, automation, cloud, research, design or business.'),
					text('name', 'Name'),
					text('short', 'Short name'),
					{ t: 'team', k: 'team', label: 'Hub team', hint: 'The site shows this team’s head (its exec) and leads, as set on the team’s page in the hub.' },
					long('line', 'Description'),
					{ t: 'strings', k: 'goals', label: 'Goals this semester', item: 'goal' },
					{ t: 'strings', k: 'code', label: 'Code folders', item: 'folder', hint: 'Folders in the project’s repository, like desktop. Each links to it on GitHub.' }
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
		where: 'The Join page: the Discord card first, then the office hours cards (which come from Board members).',
		fields: [
			text('heading', 'Heading'),
			long('lede', 'Intro'),
			text('officeHoursHeading', 'Office hours heading', 'Shown above the office hours cards.'),
			text('officeHoursCta', 'Office hours button'),
			text('discordLabel', 'Discord card label', 'Shown small above the Discord card title.'),
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
	['{{email}}', 'Contact email'],
	['{{vision}}', 'The home statement, as plain text'],
	['{{vision_source}}', 'The home statement’s source link'],
	['{{stat:discord}}', 'A community number, by its key'],
	['{{stats_sentence}}', 'All community numbers in one sentence'],
	['{{teams_sentence}}', 'Every team and its head'],
	['{{board_sentence}}', 'Every board member, title and team'],
	['{{social:Discord}}', 'A social link, by its name']
];
