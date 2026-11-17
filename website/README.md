# Agentic AI UW website

The club website uses SvelteKit, Svelte 5, TypeScript, Tailwind CSS and GSAP. It runs on Cloudflare Pages and reads its text from the member hub, so execs can edit the site without a code change.

## Run or edit

Use Node.js 24 LTS and the included lockfile.

```sh
npm ci
npm run dev -- --open
```

```sh
npm run check
npm run build
npm run preview -- --host localhost
```

`npm run build` writes the site to `.svelte-kit/cloudflare`. Deploy it with:

```sh
npx wrangler pages deploy .svelte-kit/cloudflare --project-name agenticaiuw --branch main
```

`_redirects` sends the removed and renamed pages (/premise, /why-now, /who-fits, /work, /contact) to their replacements, and `src/hooks.server.ts` does the same for pages the server renders. Do not open `src/app.html` directly. That file is an unprocessed framework template. Do not rewrite missing JavaScript or model URLs to an HTML page.

## Site text

All of the site's words, links and numbers (the vision, board, teams, events, partners, FAQ, social links and each page's title) are edited in the hub at https://hub.agenticaiuw.com/site by any exec. Every save is kept with who made it and what changed, and any version can be restored. Pages pick up an edit within about a minute.

* `src/lib/server/site.ts` fetches the text from `https://hub.agenticaiuw.com/api/site` (or `HUB_API`) on each request, keeping it for 10 seconds.
* `src/lib/site/build.ts` fills in placeholders such as `{{club}}` and `{{stat:discord}}`.
* `src/lib/site/fallback.json` is a copy shown only when the hub can't be reached. Refresh it with `npm run snapshot:content`.
* Components read the text with `site()` from `$lib/site`.

## Where to make changes

* `src/routes/`: the home, Project, Join and FAQ pages, plus generated `llms.txt` and `sitemap.xml`.
* `src/lib/components/`: page components.
* `src/app.css`: shared styling and theme tokens.
* `src/app.html`: HTML template and initial theme setup.
* `static/`: fonts, logos and images.
* `vite.config.ts`: SvelteKit Cloudflare adapter and Tailwind configuration. This project intentionally supplies its SvelteKit configuration here.

## Fonts

Fonts are self hosted in `static/fonts/`, with licenses and source information included there.

## Joining

Joining is by booking office hours with a team lead; each board member's booking link is their office hours link in the hub's Board members section and appears only on the Join page.
