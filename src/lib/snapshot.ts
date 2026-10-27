import snapshotJson from '../data/snapshot.json';
import { raceSlug } from './handles';
import { dateSeries, parseRange } from './ranges';
import { assembleRaceData } from './race';
import type { ContributionLevel, LatestRace, ProfileRecord, ProfileYearRecord, RaceData, RangeDefinition, TopContributor, TrendingRace } from './types';

interface SnapshotYear {
  start: string;
  fetchedAt: string;
  counts: number[];
  levels: string;
}

interface SnapshotProfile {
  githubId: string;
  login: string;
  displayName: string | null;
  avatarUrl: string;
  profileUrl: string;
  contributionYears: number[];
}

interface Snapshot {
  snapshotAt: string;
  races: TrendingRace[];
  profiles: Record<string, SnapshotProfile>;
  years: Record<string, Record<string, SnapshotYear>>;
}

const LEVELS: ContributionLevel[] = ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'];
const snapshot = snapshotJson as Snapshot;

/** The moment the saved results were captured. Every page is rendered as of this time. */
export const SNAPSHOT_AT = new Date(snapshot.snapshotAt);
export const SNAPSHOT_LABEL = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(SNAPSHOT_AT);

const raceSlugs = new Set(snapshot.races.map((race) => race.slug));

export function snapshotSlugs(): string[] {
  return snapshot.races.map((race) => race.slug);
}

export function hasRace(slug: string): boolean {
  return raceSlugs.has(slug);
}

export function avatarFor(login: string, size = 64): string {
  const profile = snapshot.profiles[login.toLowerCase()];
  if (!profile) return '/icon.svg';
  const url = new URL(profile.avatarUrl);
  url.searchParams.set('s', String(size));
  return url.toString();
}

/** Where a click on a person should go: their saved solo race, a saved race they are in, or their GitHub profile. */
export function personHref(login: string): string {
  const key = login.toLowerCase();
  if (raceSlugs.has(key)) return `/${key}`;
  const race = snapshot.races.find((entry) => entry.handles.includes(key));
  if (race) return `/${race.slug}`;
  return snapshot.profiles[key]?.profileUrl ?? `https://github.com/${encodeURIComponent(key)}`;
}

function profileRecord(login: string): ProfileRecord {
  const profile = snapshot.profiles[login];
  if (!profile) throw new Error(`Snapshot is missing the profile ${login}.`);
  return { ...profile, avatarUrl: avatarFor(login, 128), profileFetchedAt: snapshot.snapshotAt };
}

function yearRecords(login: string, githubId: string): ProfileYearRecord[] {
  return Object.entries(snapshot.years[login] ?? {}).map(([year, value]) => {
    const dates = dateSeries(value.start, `${year}-12-31`).slice(0, value.counts.length);
    return {
      githubId,
      year: Number(year),
      total: value.counts.reduce((sum, count) => sum + count, 0),
      fetchedAt: value.fetchedAt,
      days: dates.map((date, index) => ({ date, count: value.counts[index] ?? 0, level: LEVELS[Number(value.levels[index] ?? 0)] ?? 'NONE' })),
    };
  });
}

export function raceData(handles: string[], rangeKey: string | null = null): RaceData {
  const slug = raceSlug(handles);
  const profiles = handles.map((handle) => profileRecord(handle.toLowerCase()));
  const records = new Map<string, ProfileYearRecord>();
  for (const profile of profiles) {
    for (const record of yearRecords(profile.login.toLowerCase(), profile.githubId)) records.set(`${profile.githubId}:${record.year}`, record);
  }
  return assembleRaceData(slug, profiles, records, rangeKey, SNAPSHOT_AT);
}

export function latestRaces(limit = 10): LatestRace[] {
  return snapshot.races.slice(0, limit);
}

export function trendingRaces(limit = 10): TrendingRace[] {
  return snapshot.races
    .filter((race) => race.viewsLast24Hours > 0)
    .sort((a, b) => b.viewsLast24Hours - a.viewsLast24Hours || b.lastViewedAt.localeCompare(a.lastViewedAt))
    .slice(0, limit);
}

export function contributorRange(): RangeDefinition {
  return parseRange(null, [], SNAPSHOT_AT);
}

/** Top contributors for the default period (this calendar year), from the saved results. */
export function topContributors(limit = 10): TopContributor[] {
  const year = String(contributorRange().years[0]);
  return Object.entries(snapshot.profiles)
    .map(([login, profile]) => ({
      login: profile.login,
      displayName: profile.displayName,
      totalContributions: (snapshot.years[login]?.[year]?.counts ?? []).reduce((sum, count) => sum + count, 0),
      cachedYearCount: Object.keys(snapshot.years[login] ?? {}).length,
    }))
    .filter((entry) => entry.totalContributions > 0)
    .sort((a, b) => b.totalContributions - a.totalContributions || a.login.toLowerCase().localeCompare(b.login.toLowerCase()))
    .slice(0, limit);
}
