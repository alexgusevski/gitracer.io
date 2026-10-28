# GitRacer

Race up to 12 public GitHub contribution histories on one shareable graph.

[See the saved races](https://gitracer.io) · [MIT license](./LICENSE)

GitRacer is now a static site. Every race page is prerendered from a saved snapshot
(`src/data/snapshot.json`, taken 27 Oct 2026). The backend that fetched new profiles
from GitHub is offline, so building a new lineup, refreshing, or switching periods
shows a short notice instead.

## Features

- Permanent race URLs such as `/levelsio+marclou` for every saved race
- Battle mode and cumulative graph mode
- Contribution totals, active days, streaks, and leader margins
- Responsive light, dark, and system themes
- No analytics, no cookies

## Stack

Astro (static output) served by Cloudflare Workers Static Assets with a tiny router
(`worker/index.js`) for the www and HTTPS redirects, `410 Gone` on old API paths,
and security headers.

## Run locally

Requires Node.js 22.12+.

```bash
npm ci
npm run dev
```

## Verify

```bash
npm test
npm run check
npm run build
```

## Deploy

Manual only:

```bash
npm run deploy:preview   # gitracer-static on workers.dev (noindex)
npm run deploy           # production Worker `gitracer` on gitracer.io + www
```

`scripts/export-snapshot.mjs` is the one-off, read-only export that produced the snapshot.

GitRacer is not affiliated with GitHub.
