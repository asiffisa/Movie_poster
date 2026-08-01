# Movie Poster for Figma

[![Figma Plugin](https://img.shields.io/badge/Figma-Plugin-9747FF?logo=figma&logoColor=white)](https://www.figma.com/community/plugins)
[![TMDB API](https://img.shields.io/badge/TMDB-API-01B4E4)](https://www.themoviedb.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Find movie and TV posters in Figma, then place a high-quality image on your canvas in one click.

The plugin uses TMDB for title data and a small Cloudflare Worker for API requests. Your TMDB API key stays on the server and is never included in the Figma plugin.

<p align="center">
  <img src="assets/movie poter cover 11.jpg" width="960" alt="Movie Poster for Figma cover">
</p>

## Features

- 🔎 Search movies and TV shows as you type.
- 🧭 Switch between Trending this week, Popular, Upcoming movies, and Top rated lists.
- 🎲 Use **Pick for me** to add a random well-rated title.
- 🔀 Choose an alternative poster when a title has more than one artwork option.
- 🖼️ Insert the original TMDB poster when available, with a smaller-image fallback if needed.
- 🎯 Add a poster to a selected Figma frame or rectangle, or create a new 200 × 300 poster on the canvas.

## How it works

```text
Figma plugin → Cloudflare Worker → TMDB API
                    ↑
          TMDB key is stored as a secret
```

Poster images are downloaded from TMDB's public image CDN. The plugin does not put the TMDB API key in the plugin bundle or in Git.

## Set up the project

You need a current Node.js LTS version, a TMDB API key, and a Cloudflare account.

### 1. Install dependencies

```bash
npm install
```

### 2. Deploy the TMDB proxy

Log in to Cloudflare:

```bash
npx wrangler login
```

Store the TMDB key as a Cloudflare secret. Paste it only when the command asks for it:

```bash
npx wrangler secret put TMDB_API_KEY --config worker/wrangler.jsonc
```

Deploy the Worker:

```bash
npm run worker:deploy
```

Cloudflare will show a URL like this:

```text
https://movie-poster-tmdb-proxy.<your-subdomain>.workers.dev
```

### 3. Connect the plugin to the proxy

Copy `.env.example` to a new `.env` file. Add the Worker URL only:

```env
TMDB_PROXY_URL=https://movie-poster-tmdb-proxy.<your-subdomain>.workers.dev
```

Do not put `TMDB_API_KEY` in `.env`.

### 4. Build and load the plugin in Figma

```bash
npm run build
```

In the Figma desktop app, choose **Plugins → Development → Import plugin from manifest** and select this repository's `manifest.json`.

## Local development

To test the Worker before deployment, create `worker/.dev.vars` yourself with this one line:

```env
TMDB_API_KEY=your_tmdb_key_here
```

Then run:

```bash
npm run worker:dev
```

Set the root `.env` file to:

```env
TMDB_PROXY_URL=http://localhost:8787
```

Finally, run `npm run build` and launch the development plugin in Figma. The build adds only your exact Worker domain to `manifest.json`; rerun it and re-import the manifest if the Worker URL changes. `.env` and `.dev.vars` files are ignored by Git.

## Useful commands

```bash
npm run build          # Build the Figma plugin
npm run lint           # Check the plugin TypeScript
npm run worker:check   # Type-check the Cloudflare Worker
npm run worker:types:check # Verify generated Worker binding types
npm run worker:dev     # Run the Worker locally
npm run worker:deploy  # Deploy the Worker
```

## Project structure

```text
code.ts                 Figma plugin controller and poster insertion
ui.html                 Plugin interface
worker/src/index.ts     Restricted TMDB proxy
worker/wrangler.jsonc   Worker deployment settings
setup.js                Adds the public Worker URL and local UI assets at build time
worker/worker-configuration.d.ts  Generated Cloudflare binding types
.github/workflows/ci.yml          Clean-install verification for pull requests
```

## Privacy and security

- TMDB requests go through the Cloudflare Worker; search terms and title IDs are sent to TMDB to return results.
- The Worker caches successful TMDB responses for up to 10 minutes to reduce repeat requests.
- The proxy accepts only the TMDB paths and query values used by this plugin, and limits each client to 220 TMDB requests per minute.
- Cloudflare logs and traces are enabled so production failures can be diagnosed without logging search terms.
- Do not commit `.env`, `worker/.dev.vars`, API keys, or generated `code.js` files.
- If a key is ever shared publicly, revoke it in TMDB and create a new one before deploying again.

## Contributing

Contributions are welcome. Please keep changes focused, avoid adding secrets to Git, and run these before opening a pull request:

```bash
npm run lint
npm run worker:types:check
npm run worker:check
npm run build
```

## Attribution and license

This product uses the TMDB API but is not endorsed or certified by TMDB. Movie and TV data and artwork are provided by [TMDB](https://www.themoviedb.org/).

Released under the [MIT License](LICENSE).
