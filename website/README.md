# Agentic AI UW website

The club website uses SvelteKit, Svelte 5, TypeScript, Tailwind CSS and GSAP. It is plain files on Cloudflare Pages, built with the text from the member hub, so execs can edit the site without a code change.

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

`npm run build` saves the hub's current text to `src/lib/site/content.json`, then writes every page to `build/`. Deploy it with:

```sh
npx wrangler pages deploy build --project-name agenticaiuw --branch main
```

The GitHub Action in `.github/workflows/website.yml` (at the repository root) does this build and deploy on its own: when `website/` changes on main, when the hub's text changes, and each night. It needs a `CLOUDFLARE_API_TOKEN` repository secret to deploy.

`static/_redirects` sends the removed and renamed pages (/premise, /why-now, /who-fits, /work, /contact) to their replacements. `static/_headers` keeps the pages.dev copy out of search results. Any other address gets `src/routes/404`, built as `404.html`. Do not open `src/app.html` directly. That file is an unprocessed framework template. Do not rewrite missing JavaScript or model URLs to an HTML page.

## Site text

All of the site's words, links and numbers (the vision, board, teams, events, partners, FAQ, social links and each page's title) are edited in the hub at https://hub.agenticaiuw.com/site by any exec. Every save is kept with who made it and what changed, and any version can be restored. Each change starts a rebuild, so it shows on the site within a few minutes.

* `scripts/snapshot-content.mjs` (run by `npm run build`, or `npm run snapshot:content`) saves the text from `https://hub.agenticaiuw.com/api/site` (or `HUB_API`) to `src/lib/site/content.json`. If the hub can't be reached, the build stops and the live site keeps its last text.
* The hub starts the GitHub Action when the text changes (`hub/src/lib/server/website.ts`). It needs a `GITHUB_DISPATCH_TOKEN` secret on the hub Worker.
* `src/lib/site/build.ts` fills in placeholders such as `{{club}}` and `{{stat:discord}}`.
* Components read the text with `site()` from `$lib/site`.

## Where to make changes

* `src/routes/`: the home, Project, Join and FAQ pages, plus generated `llms.txt` and `sitemap.xml`.
* `src/lib/components/`: page components.
* `src/app.css`: shared styling and theme tokens.
* `src/app.html`: HTML template and initial theme setup.
* `static/`: fonts, logos and images.
* `vite.config.ts`: SvelteKit static adapter and Tailwind configuration. This project intentionally supplies its SvelteKit configuration here.

## Fonts

Fonts are self hosted in `static/fonts/`, with licenses and source information included there.

## Joining

Joining is by booking office hours with a team lead; each board member's booking link is their office hours link in the hub's Board members section and appears only on the Join page.
