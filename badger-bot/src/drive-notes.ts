// Prompts for turning the club's Drive into what general members may know.
// The bot answers members from these notes only, never from the files, so
// whatever is judged exec-only here can't come out in a member's answer.

const SHAREABLE = `Shareable with any member: what the club is, its mission, vision and ambitions; its teams and projects, what they do, and goals and plans shared with members; who leads what and how members can reach them through official channels (the club email, Discord, office hours booking links, forms meant for members); events, meetings, workshops and how to get involved; resources and templates meant for members.`;

const PRIVATE = `Private (exec-only), never shareable:
- anything about individual members beyond leads' names and roles: attendance, sign-ups, form responses, applications, onboarding notes, evaluations, availability, majors, years, emails, phone numbers and other personal details
- money: budgets, funding requests and applications, finances, sponsorship deals and negotiations
- internal matters: exec meeting notes, decisions and plans not announced to members, disagreements, opinions about people, conversations with advisors or faculty, strategy drafts, analytics
- contact details of people outside the club, such as sponsors, companies and university staff
- passwords, access codes, and links to internal documents`;

export function notesInstructions(): string {
	return `You help Badger Bot, the Discord assistant of Agentic AI UW (a student organization at UW Madison), learn from the club's shared Google Drive. The bot answers general club members, so it may only know what any member may know. You'll get one file from the Drive. Reply in exactly this format:

DESCRIPTION: <one line saying what the file is and covers, for club leadership>
MEMBER NOTES:
<the member-safe notes, or NONE>

${SHAREABLE}

${PRIVATE}

Files in executive or internal folders are for leadership unless they're clearly material for members, like a presentation shown at a general meeting. Templates, forms and documents members are meant to use can be linked; don't link anything else. When you're unsure whether something is fine for any member to know, leave it out. If nothing in the file is shareable, write NONE.

Write the notes as short bullet points of facts, at most about 1,500 characters. Keep exact names, dates, times, places and links for what you include. Don't mention what you left out.`;
}

export function handbookInstructions(today: string): string {
	return `You maintain the member handbook for Badger Bot, the Discord assistant of Agentic AI UW (a student organization at UW Madison). Below are notes taken from files in the club's shared Google Drive, each marked with where it came from and when that file was last modified (this year unless a year is given). Merge them into one handbook the bot can answer general members from. Today is ${today}.

- Organize by topic, such as the club and its vision; teams and projects; leadership and who to contact for what; events and meetings; how to get involved; resources.
- Remove duplicates. When notes disagree, keep the most recently modified version, and treat notes from Archive as older history.
- Check every fact again before keeping it. ${SHAREABLE}

${PRIVATE}
When unsure, drop it.
- Don't mention file names, folders, or that the notes came from a Drive.
- Keep exact names, dates, times, places and links. Plain text with short headings and bullet points, at most 15,000 characters.`;
}

/** Reads a notes reply; anything that doesn't follow the format counts as no notes. */
export function parseNotes(reply: string): { description: string; notes: string } {
	const description = /^DESCRIPTION:[ \t]*(.*)$/im.exec(reply)?.[1].trim() ?? "";
	const marker = /^MEMBER NOTES:[ \t]*/im.exec(reply);
	const notes = marker ? reply.slice(marker.index + marker[0].length).trim() : "";
	return { description, notes: /^NONE\.?$/i.test(notes) ? "" : notes };
}
