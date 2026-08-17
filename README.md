# GitRacer

Race up to 12 public GitHub contribution histories on one shareable graph.

[Try GitRacer](https://gitracer.io) · [MIT license](./LICENSE)

## Features

- Permanent race URLs such as `/octocat+torvalds`
- Calendar year, last 30 days, last 365 days, and lifetime views
- Contribution totals, active days, streaks, leader margins, and hover details
- D1-backed GitHub data caching and R2-backed avatar caching
- Dynamic Open Graph images for shared races
- Optional cookieless PostHog analytics
- Responsive light, dark, and system themes

## Stack

Astro, TypeScript, Cloudflare Workers, D1, R2, and the GitHub GraphQL API.

## Run locally

Requires Node.js 22.12+ and a GitHub token that can read public contribution data.

```bash
npm install
cp .env.example .dev.vars
npm run db:migrate:local
npm run dev
```

Set `GITHUB_TOKEN` and a long random `RATE_LIMIT_SECRET` in `.dev.vars`. `POSTHOG_KEY` is optional; analytics remain disabled when it is absent.

### Battle lab

This branch includes a development-only contribution battle prototype. While running `npm run dev`, `/` opens the lab directly (the production homepage is unchanged). The presets use synthetic contribution histories and need no database data; avatar images are fetched through a local-only proxy.

## Verify

```bash
npm test
npm run check
npm run build
```

## Deploy

The project targets Cloudflare Workers. `wrangler.jsonc` declares the D1 and R2 bindings, and `.github/workflows/deploy.yml` deploys `main` after verification.

Production requires the Worker secrets `GITHUB_TOKEN` and `RATE_LIMIT_SECRET`, plus the GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. `POSTHOG_KEY` is optional.

GitRacer is not affiliated with GitHub.
