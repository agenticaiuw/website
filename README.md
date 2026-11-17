# Agentic AI UW

Code for the Agentic AI UW club's website, member hub and Discord bot. All three run on Cloudflare.

| Folder | What it is | Live at |
| --- | --- | --- |
| [`website/`](website/) | Club website: SvelteKit on Cloudflare Pages; its text is edited in the hub | https://agenticaiuw.com |
| [`hub/`](hub/) | Task and meeting tracker for members, and the editor for the website's text: Cloudflare Workers + D1 | https://hub.agenticaiuw.com |
| [`badger-bot/`](badger-bot/) | Badger Bot, the club's Discord bot: Cloudflare Workers + Durable Objects | The club's Discord server |

Each folder is its own project with its own `package.json`. Run `npm install` inside the folder you're working on; its README covers development and deployment.

Club data (members, meetings, tasks) lives in the hub's D1 database, not in this repo. Secrets are set with `wrangler secret` or kept in ignored `.env` / `.dev.vars` files; the bot keeps its own in a file outside the repo (see its README).
