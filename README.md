# Agentic AI UW

Code for the Agentic AI UW club's web presence. Both apps run on Cloudflare.

| Folder | What it is | Live at |
| --- | --- | --- |
| [`website/`](website/) | Club website: SvelteKit static site | https://agenticaiuw.com |
| [`hub/`](hub/) | Task and meeting tracker for members: Cloudflare Workers + D1 | https://hub.agenticaiuw.com |

Each folder is its own project with its own `package.json`. Run `npm install` inside the folder you're working on; its README covers development and deployment.

Club data (members, meetings, tasks) lives in the hub's D1 database, not in this repo. Secrets are set with `wrangler secret` or kept in ignored `.env` / `.dev.vars` files.
