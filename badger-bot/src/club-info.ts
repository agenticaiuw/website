// What the bot knows about the club. Sourced from agenticaiuw.com
// (src/lib/content.ts and src/lib/hivemind.ts in the website repo).
// Update this when club details change, then redeploy.

export const CLUB_INFO = `
# Agentic AI UW

Agentic AI UW is a registered student organization (RSO) at the University of Wisconsin Madison, founded in 2026.
Motto: "Build products that make a difference in everyday life." A community of builders, learners, entrepreneurs and techno optimists.
Website: https://agenticaiuw.com

## What agentic AI is
An agent doesn't just answer; it does the work. Ask a chatbot to clean up your files and it explains how. An agent opens the folder, does it, then checks that it worked. Same model underneath; the difference is what you connect it to.

## Who can join
Every major and every level. No CS major, prior AI experience, finished résumé or knowing anyone is required; workshops start from the beginning. The two traits that matter: you solve problems, and you push for better.

## How to join (no application, no cutoff)
1. Fill out the interest form (sign in with a Google account): https://docs.google.com/forms/d/e/1FAIpQLSf6kpJHGWLRwCyEqO3Iz6BpG1u_pand-IrY1me4mKOL8OLPFg/viewform
2. Join the Discord: https://discord.gg/qQwy2K4vW (the main channel for discussion and day-to-day updates)
3. Book office hours with a project team lead (see below).
More: https://agenticaiuw.com/join/

## Joining a project team
Interested in building Project Hivemind? Next steps:
1. Book office hours with a team you're interested in.
2. Complete the official project team membership form.
3. Attend project team meetings and engage with Project Hivemind.

## Office hours booking links (one per project team)
- Hardware (Evan Liu): https://cal.com/evan-liu-u8mnsi/evan-s-office-hours?overlayCalendar=true
- Browser (Bala Shukla): https://cal.com/bala-shukla-z5su5x/15min?overlayCalendar=true
- Product design / management (Joslyn DeGuzman): https://cal.com/joslyn-deguzman-thpsg1/15min?overlayCalendar=true
- Business (Zahra Moosani): https://calendly.com/zahrazmoosani/30min
- Research / Architecture (Ryan Khalili): https://cal.com/ryan-khalili2/30min?overlayCalendar=true
- Cloud (Anand Indukuri): https://cal.com/anand-indukuri-rbwhoj/cloud-team-office-hours?overlayCalendar=true
- PC (Ife Solarin): https://cal.com/ife-solarin-j1xfse/office-hours?overlayCalendar=true
All links are also on https://agenticaiuw.com/join/#office-hours

## Leadership
- Evan Liu: President / Hardware Lead
- Ryan Khalili: AI System Architecture / Research Lead
- Anand Indukuri: Cloud Engineering Lead
- Ife Solarin: PC Engineering Lead
- Bala Shukla: Browser Engineering Lead
- Joslyn DeGuzman: Design / Product Lead
- Zahra Moosani: Internal Outreach / Marketing / Operations Lead

## The project: Hivemind (in planning; come build it with us)
Open source software that connects agents, shared context and your devices, together with a planned screenless voice wristband. The idea: turn the context you choose to share into useful memory and coordinated action across your digital world. A cloud web app is planned as a starting point; a mobile app is being considered. Capabilities are a proposal, not a released product.
Goals: 30 people using Hivemind by the end of Fall (target: 2.5 hours saved per person per week), 200 by the end of Spring (target: 5 hours per person per week). Research measures: speed, accuracy and cost of agents completing tasks.

Seven technical subteams (you can contribute across areas as you learn):
- Agentic Wristband (lead Evan Liu): screenless voice wristband; microphones, speakers, Bluetooth, power, custom circuit board, enclosure.
- Agentic USB Stick (lead Evan Liu): a USB device that lets agents operate a Mac or PC through mouse, keyboard and screen.
- Cloud Agent (lead Anand Indukuri): the assistant's cloud service and web app; agent execution, memory, user separation, task routing; built around Hermes and tool connections such as MCP.
- PC / OS Agent (lead Ife Solarin): lives on your computer with permissioned access to local files and apps.
- Browser Extension Agent (lead Bala Shukla): Safari and Chrome extensions that act across your tabs.
- AI Architecture / Research (lead Ryan Khalili): memory, model choice, agent tools; compares models on quality, speed and cost.
- Design / Product (lead Joslyn DeGuzman): the dashboard (node registry, node detail, activity feed, command bar) and how Hivemind feels to use.
More: https://agenticaiuw.com/work/

## Past events (Fall 2026)
- Sep 9–10: Fall 2026 Student Organization Fair, Kohl Center, 5–8 PM
- Sep 15: CAI Student Organization Fair, Morgridge Hall 2516/2522/2532, 6–7:30 PM
- Sep 16: Fall kickoff meeting
No upcoming events are listed on the website right now. New events are posted in this Discord server and at https://agenticaiuw.com/events/ (don't guess channel names).

## Contact and socials
- Email: team@agenticaiuw.com (for companies, professors, students; the team replies within a day or two)
- Contact form: https://agenticaiuw.com/contact/
- Instagram: https://www.instagram.com/agenticaiuw/ (@agenticaiuw)
- LinkedIn: https://www.linkedin.com/company/agenticaiuw/
- X: https://x.com/AgenticAIUW
- Featured in The Daily Cardinal (Sep 3, 2026): https://www.dailycardinal.com/article/2026/09/agentic-ai-uw-brings-next-step-in-artificial-intelligence-to-uw-madison
`.trim();
