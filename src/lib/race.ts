import {
  acquireRefreshLock,
  cacheInvalidProfiles,
  consumeRateLimit,
  getInvalidProfiles,
  getProfileYears,
  getProfiles,
  releaseRefreshLocks,
  upsertProfiles,
  upsertProfileYears,
} from './db';
import { fetchGithubProfiles, fetchGithubYears, GitHubApiError } from './github';
import { dateSeries, parseRange } from './ranges';
import type { ContributionDay, ProfileRecord, ProfileYearRecord, RaceData, RacerSeries, RangeKey } from './types';

const COLORS = ['#9784ff', '#58a6ff', '#d56bff', '#55d6e8', '#ff9f6e', '#f778ba'];
const PROFILE_REFRESH_MS = 24 * 60 * 60 * 1000;
const MANUAL_REFRESH_MS = 3 * 60 * 60 * 1000;
const RATE_LIMIT_PER_HOUR = 30;

export class RaceLoadError extends Error {
  constructor(
    message: string,
    readonly status = 500,
  ) {
    super(message);
  }
}

interface LoadRaceOptions {
  db: D1Database;
  githubToken: string;
  rateLimitSecret: string;
  handles: string[];
  slug: string;
  rangeKey?: RangeKey | string | null;
  clientIp?: string | null;
  forceRefresh?: boolean;
  now?: Date;
}

function sameUtcDay(value: string, now: Date): boolean {
  return value.slice(0, 10) === now.toISOString().slice(0, 10);
}

function ageMs(value: string | null | undefined, now: Date): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.max(0, now.getTime() - parsed) : Number.POSITIVE_INFINITY;
}

function activeYears(profiles: ProfileRecord[], currentYear = new Date().getUTCFullYear()): number[] {
  const values = profiles.flatMap((profile) => profile.contributionYears).filter((year) => year >= 2008 && year <= currentYear);
  const earliest = values.length ? Math.min(...values) : currentYear;
  return Array.from({ length: currentYear - earliest + 1 }, (_, index) => currentYear - index);
}

function calculateLongestStreak(days: ContributionDay[]): number {
  let best = 0;
  let current = 0;
  for (const day of days) {
    current = day.count > 0 ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return best;
}

export function assembleRaceData(
  slug: string,
  profiles: ProfileRecord[],
  cachedYears: Map<string, ProfileYearRecord>,
  rangeKey: string | null | undefined,
  now = new Date(),
): RaceData {
  const availableYears = activeYears(profiles, now.getUTCFullYear());
  const range = parseRange(rangeKey, availableYears, now);
  const dates = dateSeries(range.start, range.end);
  const currentYear = now.getUTCFullYear();

  const racers: RacerSeries[] = profiles.map((profile, index) => {
    const byDate = new Map<string, ContributionDay>();
    const relevantRecords: ProfileYearRecord[] = [];
    for (const year of range.years) {
      const record = cachedYears.get(`${profile.githubId}:${year}`);
      if (!record) continue;
      relevantRecords.push(record);
      for (const day of record.days) byDate.set(day.date, day);
    }
    const days = dates.map((date) => byDate.get(date) ?? { date, count: 0, level: 'NONE' as const });
    const fetchedAt = relevantRecords.length
      ? relevantRecords.reduce((oldest, record) => (record.fetchedAt < oldest ? record.fetchedAt : oldest), relevantRecords[0]!.fetchedAt)
      : null;
    const currentRecord = cachedYears.get(`${profile.githubId}:${currentYear}`);
    const canRefresh = range.years.includes(currentYear) && ageMs(currentRecord?.fetchedAt, now) >= MANUAL_REFRESH_MS;
    return {
      githubId: profile.githubId,
      login: profile.login,
      displayName: profile.displayName,
      avatarUrl: `/avatar/${encodeURIComponent(profile.login)}`,
      profileUrl: profile.profileUrl,
      color: COLORS[index % COLORS.length]!,
      total: days.reduce((sum, day) => sum + day.count, 0),
      activeDays: days.filter((day) => day.count > 0).length,
      longestStreak: calculateLongestStreak(days),
      days,
      fetchedAt,
      canRefresh,
    };
  });

  const ranked = [...racers].sort((a, b) => b.total - a.total || a.login.localeCompare(b.login));
  const first = ranked[0];
  const second = ranked[1];
  const leader = first
    ? {
        login: first.login,
        lead: second ? first.total - second.total : first.total,
        tied: Boolean(second && first.total === second.total),
      }
    : null;

  return {
    slug,
    racers,
    range,
    availableYears,
    leader,
    generatedAt: now.toISOString(),
    canRefresh: racers.some((racer) => racer.canRefresh),
  };
}

async function rateLimitKey(secret: string, clientIp: string, now: Date): Promise<{ hash: string; bucket: string; expiresAt: string }> {
  const bucket = now.toISOString().slice(0, 13);
  const payload = new TextEncoder().encode(`${secret}:${clientIp}:${bucket}`);
  const digest = await crypto.subtle.digest('SHA-256', payload);
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const expiresAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() + 2)).toISOString();
  return { hash, bucket, expiresAt };
}

async function permitUpstreamFetch(db: D1Database, secret: string, clientIp: string | null | undefined, now: Date): Promise<void> {
  const key = await rateLimitKey(secret, clientIp || 'unknown', now);
  const allowed = await consumeRateLimit(db, key.hash, key.bucket, RATE_LIMIT_PER_HOUR, key.expiresAt);
  if (!allowed) throw new RaceLoadError('Too many new GitHub profiles were requested from this connection. Try again in an hour.', 429);
}

async function hydrateProfiles(options: LoadRaceOptions): Promise<ProfileRecord[]> {
  const { db, handles, githubToken, rateLimitSecret, clientIp, now = new Date(), forceRefresh = false } = options;
  const cached = await getProfiles(db, handles);
  const invalid = await getInvalidProfiles(db, handles, now);
  const knownInvalid = handles.filter((handle) => invalid.has(handle));
  if (knownInvalid.length) throw new RaceLoadError(`GitHub user${knownInvalid.length > 1 ? 's' : ''} not found: ${knownInvalid.join(', ')}`, 404);

  const needMetadata = handles.filter((handle) => {
    const profile = cached.get(handle);
    return !profile || (forceRefresh && ageMs(profile.profileFetchedAt, now) >= MANUAL_REFRESH_MS) || ageMs(profile.profileFetchedAt, now) >= PROFILE_REFRESH_MS || !sameUtcDay(profile.profileFetchedAt, now);
  });

  if (needMetadata.length) {
    await permitUpstreamFetch(db, rateLimitSecret, clientIp, now);
    const acquired: string[] = [];
    try {
      for (const handle of needMetadata) {
        if (await acquireRefreshLock(db, `profile:${handle}`, now)) acquired.push(handle);
      }
      if (acquired.length) {
        const fetched = await fetchGithubProfiles(githubToken, acquired, now.toISOString());
        const valid = [...fetched.values()].filter((profile): profile is ProfileRecord => profile !== null);
        const missing = acquired.filter((handle) => !fetched.get(handle));
        await Promise.all([upsertProfiles(db, valid), cacheInvalidProfiles(db, missing, 'not_found', now)]);
        for (const handle of acquired) {
          const value = fetched.get(handle);
          if (value) cached.set(handle, value);
        }
        if (missing.length) throw new RaceLoadError(`GitHub user${missing.length > 1 ? 's' : ''} not found: ${missing.join(', ')}`, 404);
      }
    } finally {
      await releaseRefreshLocks(db, acquired.map((handle) => `profile:${handle}`));
    }
  }

  const refreshed = await getProfiles(db, handles);
  const profiles = handles.map((handle) => cached.get(handle) ?? refreshed.get(handle)).filter((profile): profile is ProfileRecord => Boolean(profile));
  if (profiles.length !== handles.length) throw new RaceLoadError('This race is already being refreshed. Try again in a moment.', 503);
  return profiles;
}

export async function loadRace(options: LoadRaceOptions): Promise<RaceData> {
  const now = options.now ?? new Date();
  try {
    const profiles = await hydrateProfiles({ ...options, now });
    const availableYears = activeYears(profiles, now.getUTCFullYear());
    const range = parseRange(options.rangeKey, availableYears, now);
    let years = await getProfileYears(options.db, profiles.map((profile) => profile.githubId), range.years);
    const currentYear = now.getUTCFullYear();
    const pairs: Array<{ profile: ProfileRecord; year: number }> = [];

    for (const profile of profiles) {
      const contributed = new Set(profile.contributionYears);
      for (const year of range.years) {
        if (!contributed.has(year) && year !== currentYear) continue;
        const cached = years.get(`${profile.githubId}:${year}`);
        const staleToday = year === currentYear && cached && !sameUtcDay(cached.fetchedAt, now);
        const manuallyStale = options.forceRefresh && year === currentYear && ageMs(cached?.fetchedAt, now) >= MANUAL_REFRESH_MS;
        if (!cached || staleToday || manuallyStale) pairs.push({ profile, year });
      }
    }

    if (pairs.length) {
      await permitUpstreamFetch(options.db, options.rateLimitSecret, options.clientIp, now);
      const acquiredPairs: typeof pairs = [];
      const lockKeys: string[] = [];
      try {
        for (const pair of pairs) {
          const key = `year:${pair.profile.githubId}:${pair.year}`;
          if (await acquireRefreshLock(options.db, key, now)) {
            acquiredPairs.push(pair);
            lockKeys.push(key);
          }
        }
        if (acquiredPairs.length) {
          const fetched = await fetchGithubYears(options.githubToken, acquiredPairs, now.toISOString());
          await upsertProfileYears(options.db, fetched);
        }
      } finally {
        await releaseRefreshLocks(options.db, lockKeys);
      }
      years = await getProfileYears(options.db, profiles.map((profile) => profile.githubId), range.years);
      const unresolved = pairs.some((pair) => !years.has(`${pair.profile.githubId}:${pair.year}`));
      if (unresolved) throw new RaceLoadError('This race is already being refreshed. Try again in a moment.', 503);
    }

    return assembleRaceData(options.slug, profiles, years, options.rangeKey, now);
  } catch (error) {
    if (error instanceof RaceLoadError) throw error;
    if (error instanceof GitHubApiError) throw new RaceLoadError(error.message, error.status);
    console.error(JSON.stringify({ event: 'race_load_error', message: error instanceof Error ? error.message : String(error) }));
    throw new RaceLoadError('GitRacer could not load this race. Please try again.', 500);
  }
}
