# GitRacer

GitRacer puts one to six public GitHub contribution histories on a cumulative, shareable race graph.

Examples: `/octocat`, `/octocat+torvalds`, or `/octocat+torvalds?range=last30`.

## What is implemented

- Enter-to-chip race creator with a six-profile cap and permanent public URLs.
- Calendar-year, last-30-day, last-365-day, and lifetime filters. Every line starts at zero for the chosen period.
- Daily cumulative SVG lines, load animation, actual date labels, crosshair, and exact hover values.
- Leader margin, contribution totals, active days, best streak, profile links, share, and guarded refresh.
- Shared D1 profile/year cache. Completed years are reused permanently; the current year refreshes once per UTC day. Manual refresh unlocks after three hours.
- R2 avatar cache keyed by immutable GitHub node ID. The browser only receives a first-party `/avatar/:login` URL.
- Six desktop sponsor rail slots plus a responsive mobile placement.
- Optional cookieless PostHog analytics through a first-party `/ph` reverse proxy.
- Dynamic race OG images, canonical metadata, JSON-LD, sitemap, robots, CSP, responsive light/dark/system themes, and reduced-motion support.
- No accounts, payments, repository access, session replay, or analytics cookies.

## Stack

- Astro server output on Cloudflare Workers
- Cloudflare D1 for profiles, year blocks, race recency, refresh locks, and short-lived abuse counters
- Cloudflare R2 for avatar bytes
- GitHub GraphQL API for `contributionCalendar`
- Vanilla browser JavaScript and a custom SVG chart
- `@cf-wasm/og` for Worker-native PNG generation
- PostHog EU, optional and cookieless

## Cache flow

1. Parse and normalize the one-to-six handles in the URL.
2. Read every profile from D1 in one query.
3. Refresh only missing or new-day profile metadata, behind per-profile locks and a short negative cache.
4. Resolve the selected calendar years and read all needed profile-year blocks in one query.
5. Fetch only missing active years. A zero-activity historic year never needs an upstream request.
6. Assemble exact daily dates, zero-fill gaps, and calculate period-local totals and streaks.

Concurrent misses use D1 refresh locks, so a viral URL does not fan out into duplicate GitHub calls. New upstream work is also limited per hourly, secret-hashed connection bucket. Raw client IPs are not written to D1.

## Local development

Requirements: Node.js 22.12+ and an authenticated GitHub token that can call the GraphQL API.

```bash
npm install
cp .env.example .dev.vars
npm run db:migrate:local
npm run dev
```

Set these in `.dev.vars`:

```dotenv
GITHUB_TOKEN=...
RATE_LIMIT_SECRET=use-a-long-random-value
POSTHOG_KEY=phc_optional_public_project_key
```

`POSTHOG_KEY` is optional. Without it, `/analytics.js` returns a disabled stub and the site performs no product analytics.

## PostHog setup

1. Create a dedicated EU PostHog project.
2. In **Project settings → Web analytics**, enable **Cookieless server hash mode**. PostHog ignores cookieless events until this is enabled.
3. Add the project token as the Worker secret `POSTHOG_KEY`.
4. Keep the existing configuration: `cookieless_mode: 'always'`, `person_profiles: 'never'`, autocapture/recordings/heatmaps off, and pageview/pageleave plus Web Vitals on.

Tracked product events are `race_created`, `race_range_changed`, `race_refreshed`, `race_shared`, `profile_opened`, `latest_race_opened`, `sponsor_impression`, and `sponsor_click`. PostHog's `$pageleave` event provides time-on-page without a five-second heartbeat. Do Not Track and Global Privacy Control skip initialization entirely.

Cookieless mode is useful for aggregate page views, daily anonymous visitors, acquisition, performance, and sponsor placement metrics. It intentionally cannot provide reliable cross-day person retention or identified user journeys.

## Cloudflare deployment

`wrangler.jsonc` declares a D1 database named `gitracer-db` and an R2 bucket named `gitracer-avatars`. Current Wrangler versions can provision missing resources; production should commit the generated IDs afterward for predictable CI.

```bash
npm test
npm run build
npx wrangler d1 migrations apply gitracer-db --remote
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put RATE_LIMIT_SECRET
npx wrangler secret put POSTHOG_KEY # optional
npx wrangler deploy
```

The GitHub Actions workflow runs tests/builds, applies remote migrations, and deploys on `main`. Add repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` before relying on it.

`gitracer.io` and `www.gitracer.io` are declared as Worker custom domains. The domain is registered at Vercel and delegates DNS to Cloudflare; `www` permanently redirects to the canonical apex URL.

## Verification

```bash
npm test
npm run check
npm run build
```

The browser verification covers a real three-profile race, hover details, dynamic period filtering, URL updates, Enter-to-chip creation, mobile containment, and system dark mode.

## License

MIT. GitRacer is not affiliated with GitHub.
