#!/usr/bin/env node
// One-off, read-only export of the frozen GitRacer snapshot from D1 (SELECT statements only).
// Usage: node scripts/export-snapshot.mjs <races-classification.json> [wrangler-bin]
// Writes src/data/snapshot.json. Only races classified "legit" or "demo-mascot" are kept.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const [classificationPath, wrangler = 'wrangler'] = process.argv.slice(2);
if (!classificationPath) throw new Error('Pass the race classification JSON path.');
const classification = JSON.parse(readFileSync(classificationPath, 'utf8'));
const keep = classification.races.filter((race) => race.klass === 'legit' || race.klass === 'demo-mascot');
const slugs = keep.map((race) => race.slug);
const logins = [...new Set(keep.flatMap((race) => race.handles.map((handle) => handle.toLowerCase())))];

const LEVELS = ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'];
const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
function select(sql) {
  if (!/^\s*SELECT\b/i.test(sql)) throw new Error('Only SELECT statements are allowed.');
  const out = execFileSync(wrangler, ['d1', 'execute', 'gitracer-db', '--remote', '--json', '--command', sql], { maxBuffer: 512 * 1024 * 1024, encoding: 'utf8' });
  return JSON.parse(out)[0].results;
}

const snapshotAt = new Date().toISOString();
const races = select(`SELECT slug, handles_json, last_viewed_at, view_count FROM races WHERE slug IN (${slugs.map(q).join(',')})`);
const cutoff = new Date(Date.parse(snapshotAt) - 24 * 60 * 60 * 1000).toISOString();
const recent = select(`SELECT slug, SUM(view_count) AS views FROM race_view_buckets WHERE bucket_start >= ${q(cutoff)} AND slug IN (${slugs.map(q).join(',')}) GROUP BY slug`);
const recentBySlug = new Map(recent.map((row) => [row.slug, Number(row.views)]));
const profiles = select(`SELECT github_id, login, display_name, avatar_url, profile_url, contribution_years_json FROM profiles WHERE lower(login) IN (${logins.map(q).join(',')})`);
const ids = profiles.map((profile) => profile.github_id);
const years = [];
for (let index = 0; index < ids.length; index += 20) {
  const batch = ids.slice(index, index + 20);
  years.push(...select(`SELECT github_id, year, days_json, fetched_at FROM profile_years WHERE github_id IN (${batch.map(q).join(',')})`));
}

const profileById = new Map(profiles.map((profile) => [profile.github_id, profile]));
const snapshot = {
  snapshotAt,
  races: races
    .map((row) => ({ slug: row.slug, handles: JSON.parse(row.handles_json), lastViewedAt: row.last_viewed_at, viewCount: row.view_count, viewsLast24Hours: recentBySlug.get(row.slug) ?? 0 }))
    .sort((a, b) => b.lastViewedAt.localeCompare(a.lastViewedAt)),
  profiles: Object.fromEntries(profiles.map((row) => [row.login.toLowerCase(), {
    githubId: row.github_id,
    login: row.login,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    profileUrl: row.profile_url,
    contributionYears: JSON.parse(row.contribution_years_json),
  }])),
  years: {},
};
for (const row of years) {
  const login = profileById.get(row.github_id).login.toLowerCase();
  const days = JSON.parse(row.days_json);
  const start = days[0]?.date ?? `${row.year}-01-01`;
  snapshot.years[login] ??= {};
  // levels: one digit per day, 0 = NONE … 4 = FOURTH_QUARTILE (GitHub's own quartiles).
  snapshot.years[login][row.year] = { start, fetchedAt: row.fetched_at, counts: days.map((day) => day.count), levels: days.map((day) => Math.max(0, LEVELS.indexOf(day.level))).join('') };
}
const missing = logins.filter((login) => !snapshot.profiles[login]);
if (missing.length) console.warn('profiles missing from D1:', missing.join(', '));
mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/snapshot.json', JSON.stringify(snapshot));
console.log(JSON.stringify({ snapshotAt, races: snapshot.races.length, profiles: profiles.length, years: years.length }));
