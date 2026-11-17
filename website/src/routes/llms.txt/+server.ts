import { loadSite } from '$lib/server/site';
import { siteUrl } from '$lib/seo';

// /llms.txt (https://llmstxt.org): a plain-text briefing for AI assistants,
// built from the same copy as the site so the two never disagree.
export const trailingSlash = 'never';

const page = (href: string) => `${siteUrl}${href.replace(/\/?$/, '/')}`;

export async function GET({ platform }) {
	const { club, vision, stats, team, project, work, join, contact, social, nav, faq, memberHub, press } = await loadSite(platform);
	const body = `# ${club.name}

> ${vision.text}

${club.name} is a student organization at the ${club.university}, founded in ${club.founded}. Its motto: “${club.motto}” ${club.subMotto}

## Key facts

- University: ${club.university} (Madison, Wisconsin, USA)
- Founded: ${club.founded}
- Size: ${stats.items.map((i) => `${i.approx ? 'about ' : ''}${i.n} ${i.label}`).join('; ')}
- Project: ${project.title}. ${project.summary} Page: ${page('/hive')}
- Project goal: ${project.goal.replace(/\*\*/g, '')}
- Code: ${project.repoHref}
- Teams: ${work.subteams.items.map((s) => `${s.name} (${[s.heads.length ? `${s.heads.length > 1 ? 'heads' : 'head'}: ${s.heads.join(', ')}` : '', s.leads.length ? `${s.leads.length > 1 ? 'leads' : 'lead'}: ${s.leads.map((l) => (l.title ? `${l.name} (${l.title})` : l.name)).join(', ')}` : ''].filter(Boolean).join('; ')})`).join('; ')}
- Who can join: every major and every level; no CS major or prior AI experience required
- How to join: ${join.lede} Discord (${join.discordLabel.toLowerCase()}): ${join.discordHref} Book office hours: ${siteUrl}/join/#office-hours
- Email: ${contact.email}
- Press: ${press.name}, ${press.dateLabel}: ${press.href}
${social.filter((s) => s.href).map((s) => `- ${s.name}: ${s.href}`).join('\n')}

## Teams

${work.subteams.items.map((t) => [`### ${t.name}`, '', t.line, `Page: ${siteUrl}/teams/${t.k}/`, ...(t.goals.length ? ['', `${work.subteams.goalsLabel}:`, ...t.goals.map((g) => `- ${g}`)] : [])].join('\n')).join('\n\n')}

## Founding board

${team.members.map((m) => `- ${m.name}, ${m.title}. Heads the ${m.leads} team. LinkedIn: ${m.linkedin}`).join('\n')}

## Pages

${nav.map((n) => `- [${n.label}](${page(n.href)}): ${n.blurb}`).join('\n')}
- [Join](${siteUrl}/join/): ${join.discordTitle}, then ${join.officeHoursHeading.charAt(0).toLowerCase()}${join.officeHoursHeading.slice(1)}
- [FAQ](${siteUrl}/faq/): ${faq.lede}
- [${memberHub.label}](${memberHub.href}): ${memberHub.blurb}

## FAQ

${faq.items.map((f) => `### ${f.q}\n\n${f.a}`).join('\n\n')}
`;

	return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
