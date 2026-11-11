# Badger Bot

The club's Discord bot. It answers questions in the club server and in DMs, using what it knows about the club (`src/club-info.ts`) and the club's public Google Drive folder.

It runs as one Cloudflare Worker with Durable Objects and a sandbox container the bot uses as a Linux workspace. `cloudflare.config.ts` lists every piece with a comment saying what it is for.

## Develop

```bash
npm install
node --test tests/*.test.mjs
BADGER_PUBLIC_URL=https://badger-bot.<account-subdomain>.workers.dev npm run typecheck
```

The Worker's own public address is not kept in this repo. Set `BADGER_PUBLIC_URL` (https, no trailing slash) for `npm run dev`, `npm run build`, `npm run typecheck` and every deploy. They stop with a message if it is missing.

## Deploy

Nothing deploys on a push.

1. `npm run signin` signs the bot in with a ChatGPT plan, asks for the Discord bot token and writes both to `~/.config/badger-bot/secrets.env`, outside the repo.
2. `BADGER_PUBLIC_URL=... npx cf deploy --secrets-file ~/.config/badger-bot/secrets.env`

## Data

Messages, memories and activity counts live in the Worker's Durable Object storage and R2, not in this repo. Never commit exports of them, tokens, or `.env` / `.dev.vars` files.
