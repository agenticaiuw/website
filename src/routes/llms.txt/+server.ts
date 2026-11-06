import { club, vision, stats, team, work, join, contact, social, nav, faq, memberHub } from '$lib/content';
import { siteUrl } from '$lib/seo';

// /llms.txt (https://llmstxt.org): a plain-text briefing for AI assistants,
// built from the same copy as the site so the two never disagree.
export const prerender = true;
export const trailingSlash = 'never';

const page = (href: string) => `${siteUrl}${href.replace(/\/?$/, '/')}`;

export function GET() {
	const body = `# ${club.name}

> ${club.summary}

${club.name} is a student organization at the ${club.university}, founded in ${club.founded}. Its motto: “${club.motto}” ${club.subMotto}

## Vision

${vision.text}

Source for the quoted figure: ${vision.source.label} ${vision.source.href}

## Key facts

- University: ${club.university} (Madison, Wisconsin, USA)
- Founded: ${club.founded}
- Size: ${stats.items.map((i) => `${i.approx ? 'about ' : ''}${i.n} ${i.label}`).join('; ')}
- Project: ${work.heading}. ${work.lede}
- Teams: ${work.subteams.items.map((s) => `${s.name} (${s.lead})`).join('; ')}
- Who can join: every major and every level; no CS major or prior AI experience required
- How to join: ${join.lede} Book office hours: ${siteUrl}/join/#office-hours
- Email: ${contact.email}
- Press: The Daily Cardinal, September 3, 2026: https://www.dailycardinal.com/article/2026/09/agentic-ai-uw-brings-next-step-in-artificial-intelligence-to-uw-madison
${social.filter((s) => s.href).map((s) => `- ${s.name}: ${s.href}`).join('\n')}

## Founding board

${team.members.map((m) => `- ${m.name}, ${m.title}. Leads the ${m.leads} team. LinkedIn: ${m.linkedin}`).join('\n')}

## Pages

${nav.map((n) => `- [${n.label}](${page(n.href)}): ${n.blurb}`).join('\n')}
- [Join](${siteUrl}/join/): Book office hours with a team lead, or join the Discord
- [FAQ](${siteUrl}/faq/): ${faq.lede}
- [${memberHub.label}](${memberHub.href}): ${memberHub.blurb}

## FAQ

${faq.items.map((f) => `### ${f.q}\n\n${f.a}`).join('\n\n')}
`;

	return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
