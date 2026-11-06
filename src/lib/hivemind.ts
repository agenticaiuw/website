/** Public project copy. Capabilities are a proposal, not a released product. */
export const hivemind = {
	status: 'In planning · Come build it with us',
	intro: 'We’re building an open source architecture for personal AI, together with a voice wristband. The ambition: turn the context you choose to share into useful memory and coordinated action across your digital world.',
	benefits: [
		{ title: 'Less briefing. More continuity.', body: 'Bring permitted context from your conversations and connected sources into the same assistant. Organize useful details in the background, so your next request can start with what matters.' },
		{ title: 'One request, across your devices.', body: 'Let the cloud coordinate, the browser work with a page and your computer reach a local file. We want the task and its context to travel together, with one dashboard to follow the work.' },
		{ title: 'Personal by design. Shared by choice.', body: 'Keep your personal context separate from the team spaces you choose. Define what enters memory, who can use it and when an action needs your approval.' }
	],
	scenarios: [
		{
			label: 'Software Architecture', prompt: '“What do I need for our next project meeting?”',
			entry: 'Ask in the web application', entryDetail: 'A planned home for your assistant, connected nodes and task activity.',
			context: 'Connect what you already shared', contextDetail: 'Find the relevant decisions, notes and updates in your chosen sources.',
			action: 'Work through connected tools', actionDetail: 'The cloud agent gathers material it has permission to access.',
			result: 'Review your meeting brief', resultDetail: 'See the result, activity and any approval requests in one dashboard.'
		},
		{
			label: 'Voice wristband', prompt: '“What do I need for our next project meeting?”',
			entry: 'Ask while walking to class', entryDetail: 'The wristband we’re building will carry your voice request through your phone.',
			context: 'Connect what you already shared', contextDetail: 'Recall a permitted conversation and the latest update in your team space.',
			action: 'Coordinate across devices', actionDetail: 'The browser checks a project page; your computer retrieves a permitted local file.',
			result: 'Review your meeting brief', resultDetail: 'Follow the same task in one dashboard, wherever it ran.'
		}
	],
	priorities: [
		{ question: 'Will it remember what matters?', answer: 'Explore selective retrieval: bring in relevant facts, update outdated context and keep personal and shared memory properly scoped.' },
		{ question: 'Can I understand what it’s doing?', answer: 'Design a clear activity trail and approval steps for consequential actions. A confident answer still needs to be checked against the actual result.' },
		{ question: 'Will it save more than it costs?', answer: 'Measure task completion time, correctness and model usage together. Test model choices and context size instead of assuming a cheaper model is enough.' }
	],
	architecture: [
		{ title: 'Nodes & coordination', summary: 'Different environments, one task.', body: 'A node is a connected part of the system with its own context and abilities, such as the wristband, cloud, browser or computer. Hivemind is the software architecture connecting these parts. We plan cloud execution and a web application for requests, connected nodes and activity, with a mobile application under consideration. A node contract is a shared format for capabilities, status and results, so teams can build parts that work together.' },
		{ title: 'Memory & context', summary: 'Useful continuity, with a choice about sharing.', body: 'The proposal separates your personal memory from explicitly chosen team spaces. Retrieval means finding the pieces of past context that matter for a request. We’re exploring a background process that organizes useful facts, connects related information and updates outdated details, with consent and deletion rules to define before external use.' },
		{ title: 'Tools & permissions', summary: 'Access you understand and control.', body: 'The cloud proposal builds around Hermes and tool connections such as MCP, a common way for an agent to communicate with other software. We plan credentials limited to the access each task needs, approval before irreversible actions and a record of tool activity. Testing these controls is part of the engineering work ahead.' },
		{ title: 'One dashboard', summary: 'A place to ask, follow and review.', body: 'The web application will bring together four core views: a registry of connected nodes, a detail page for each node, an activity feed and a command bar for requests. Shared status labels and panels for each device should make the whole system understandable as each team’s integration arrives.' }
	],
	buildAreas: [
		{ name: 'Hardware', detail: 'Build a small, screenless voice wristband: microphones and speakers, Bluetooth connectivity, efficient power use, a custom circuit board and a comfortable enclosure. Also explore a USB device for mouse, keyboard and screen interaction on Mac and Windows, coordinated with the PC agent.' },
		{ name: 'Cloud', detail: 'Build the cloud side of Hivemind: agent execution, memory, user separation and task routing. Work with Design/Product on the web application and explore a possible mobile application. Research reliable tool connections and websites that restrict traffic from data centers.' },
		{ name: 'PC', detail: 'Connect local files and applications with permission. Account for OS restrictions and the fact that this node is available only while the computer is running.' },
		{ name: 'Browser', detail: 'Explore Chrome and Safari extensions using page and tab context. Work on finding relevant content, choosing between direct software connections (APIs) and actions on the page, and completing tasks efficiently.' },
		{ name: 'Research', detail: 'Design memory, agent tools and context handling. Compare models for task quality, speed and cost, and test the system against real outcomes.' },
		{ name: 'Design / Product', detail: 'Create the dashboard’s four views and reusable interface components. Define the data each view needs, design device panels and help teams resolve integration gaps.' },
		{ name: 'Business', detail: 'Run outreach, marketing, finance and operations, and keep the club running smoothly.' }
	]
};
