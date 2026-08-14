import type { LatestRace, ProfileRecord, ProfileYearRecord, TopContributor } from './types';

interface ProfileRow {
  github_id: string;
  login: string;
  display_name: string | null;
  avatar_url: string;
  profile_url: string;
  contribution_years_json: string;
  profile_fetched_at: string;
}

interface YearRow {
  github_id: string;
  year: number;
  total: number;
  days_json: string;
  fetched_at: string;
}

const placeholders = (count: number) => Array.from({ length: count }, () => '?').join(',');

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function profileFromRow(row: ProfileRow): ProfileRecord {
  return {
    githubId: row.github_id,
    login: row.login,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    profileUrl: row.profile_url,
    contributionYears: parseJson<number[]>(row.contribution_years_json, []),
    profileFetchedAt: row.profile_fetched_at,
  };
}

function yearFromRow(row: YearRow): ProfileYearRecord {
  return {
    githubId: row.github_id,
    year: row.year,
    total: row.total,
    days: parseJson(row.days_json, []),
    fetchedAt: row.fetched_at,
  };
}

export async function getProfiles(db: D1Database, logins: string[]): Promise<Map<string, ProfileRecord>> {
  if (!logins.length) return new Map();
  const result = await db
    .prepare(`SELECT github_id, login, display_name, avatar_url, profile_url, contribution_years_json, profile_fetched_at FROM profiles WHERE login IN (${placeholders(logins.length)})`)
    .bind(...logins)
    .all<ProfileRow>();
  return new Map(result.results.map((row) => [row.login.toLowerCase(), profileFromRow(row)]));
}

export async function getProfileByLogin(db: D1Database, login: string): Promise<ProfileRecord | null> {
  const row = await db
    .prepare('SELECT github_id, login, display_name, avatar_url, profile_url, contribution_years_json, profile_fetched_at FROM profiles WHERE login = ? COLLATE NOCASE')
    .bind(login)
    .first<ProfileRow>();
  return row ? profileFromRow(row) : null;
}

export async function upsertProfiles(db: D1Database, profiles: ProfileRecord[]): Promise<void> {
  if (!profiles.length) return;
  const statement = db.prepare(`
    INSERT INTO profiles (github_id, login, display_name, avatar_url, profile_url, contribution_years_json, profile_fetched_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(github_id) DO UPDATE SET
      login = excluded.login,
      display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      profile_url = excluded.profile_url,
      contribution_years_json = excluded.contribution_years_json,
      profile_fetched_at = excluded.profile_fetched_at,
      updated_at = excluded.updated_at
  `);
  const now = new Date().toISOString();
  await db.batch(
    profiles.map((profile) =>
      statement.bind(
        profile.githubId,
        profile.login,
        profile.displayName,
        profile.avatarUrl,
        profile.profileUrl,
        JSON.stringify(profile.contributionYears),
        profile.profileFetchedAt,
        now,
      ),
    ),
  );
}

export async function getProfileYears(db: D1Database, githubIds: string[], years: number[]): Promise<Map<string, ProfileYearRecord>> {
  if (!githubIds.length || !years.length) return new Map();
  const result = await db
    .prepare(`SELECT github_id, year, total, days_json, fetched_at FROM profile_years WHERE github_id IN (${placeholders(githubIds.length)}) AND year IN (${placeholders(years.length)})`)
    .bind(...githubIds, ...years)
    .all<YearRow>();
  return new Map(result.results.map((row) => [`${row.github_id}:${row.year}`, yearFromRow(row)]));
}

export async function upsertProfileYears(db: D1Database, years: ProfileYearRecord[]): Promise<void> {
  if (!years.length) return;
  const statement = db.prepare(`
    INSERT INTO profile_years (github_id, year, total, days_json, fetched_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(github_id, year) DO UPDATE SET
      total = excluded.total,
      days_json = excluded.days_json,
      fetched_at = excluded.fetched_at
  `);
  await db.batch(
    years.map((year) => statement.bind(year.githubId, year.year, year.total, JSON.stringify(year.days), year.fetchedAt)),
  );
}

export async function recordRaceView(db: D1Database, slug: string, handles: string[], now = new Date()): Promise<void> {
  const iso = now.toISOString();
  const threshold = new Date(now.getTime() - 60_000).toISOString();
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO races (slug, handles_json, first_viewed_at, last_viewed_at, view_count) VALUES (?, ?, ?, ?, 1)').bind(slug, JSON.stringify(handles), iso, iso),
    db.prepare('UPDATE races SET last_viewed_at = ?, view_count = view_count + 1 WHERE slug = ? AND last_viewed_at < ?').bind(iso, slug, threshold),
  ]);
}

export async function getLatestRaces(db: D1Database, limit = 10): Promise<LatestRace[]> {
  const result = await db
    .prepare('SELECT slug, handles_json, last_viewed_at, view_count FROM races ORDER BY last_viewed_at DESC LIMIT ?')
    .bind(Math.max(1, Math.min(limit, 20)))
    .all<{ slug: string; handles_json: string; last_viewed_at: string; view_count: number }>();
  return result.results.map((row) => ({
    slug: row.slug,
    handles: parseJson<string[]>(row.handles_json, []),
    lastViewedAt: row.last_viewed_at,
    viewCount: row.view_count,
  }));
}

export async function getTopContributors(db: D1Database, limit = 10): Promise<TopContributor[]> {
  const result = await db
    .prepare(`
      SELECT
        p.login,
        p.display_name,
        SUM(py.total) AS total_contributions,
        COUNT(py.year) AS cached_year_count
      FROM profiles p
      INNER JOIN profile_years py ON py.github_id = p.github_id
      GROUP BY p.github_id, p.login, p.display_name
      ORDER BY total_contributions DESC, p.login COLLATE NOCASE ASC
      LIMIT ?
    `)
    .bind(Math.max(1, Math.min(limit, 20)))
    .all<{ login: string; display_name: string | null; total_contributions: number; cached_year_count: number }>();
  return result.results.map((row) => ({
    login: row.login,
    displayName: row.display_name,
    totalContributions: row.total_contributions,
    cachedYearCount: row.cached_year_count,
  }));
}

export async function getInvalidProfiles(db: D1Database, logins: string[], now = new Date()): Promise<Set<string>> {
  if (!logins.length) return new Set();
  const result = await db
    .prepare(`SELECT login FROM invalid_profiles WHERE login IN (${placeholders(logins.length)}) AND expires_at > ?`)
    .bind(...logins, now.toISOString())
    .all<{ login: string }>();
  return new Set(result.results.map((row) => row.login.toLowerCase()));
}

export async function cacheInvalidProfiles(db: D1Database, logins: string[], reason: string, now = new Date()): Promise<void> {
  if (!logins.length) return;
  const expiresAt = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
  const statement = db.prepare('INSERT INTO invalid_profiles (login, reason, expires_at) VALUES (?, ?, ?) ON CONFLICT(login) DO UPDATE SET reason = excluded.reason, expires_at = excluded.expires_at');
  await db.batch(logins.map((login) => statement.bind(login, reason, expiresAt)));
}

export async function consumeRateLimit(db: D1Database, keyHash: string, bucket: string, limit: number, expiresAt: string): Promise<boolean> {
  await db.batch([
    db.prepare('DELETE FROM rate_limits WHERE expires_at <= ?').bind(new Date().toISOString()),
    db
      .prepare('INSERT INTO rate_limits (key_hash, bucket, count, expires_at) VALUES (?, ?, 1, ?) ON CONFLICT(key_hash, bucket) DO UPDATE SET count = count + 1, expires_at = excluded.expires_at')
      .bind(keyHash, bucket, expiresAt),
  ]);
  const count = await db.prepare('SELECT count FROM rate_limits WHERE key_hash = ? AND bucket = ?').bind(keyHash, bucket).first<number>('count');
  return (count ?? limit + 1) <= limit;
}

export async function acquireRefreshLock(db: D1Database, cacheKey: string, now = new Date()): Promise<boolean> {
  const lockUntil = new Date(now.getTime() + 30_000).toISOString();
  const result = await db
    .prepare('INSERT INTO refresh_locks (cache_key, lock_until) VALUES (?, ?) ON CONFLICT(cache_key) DO UPDATE SET lock_until = excluded.lock_until WHERE refresh_locks.lock_until <= ?')
    .bind(cacheKey, lockUntil, now.toISOString())
    .run();
  return Number(result.meta.changes ?? 0) > 0;
}

export async function releaseRefreshLocks(db: D1Database, cacheKeys: string[]): Promise<void> {
  if (!cacheKeys.length) return;
  await db.prepare(`DELETE FROM refresh_locks WHERE cache_key IN (${placeholders(cacheKeys.length)})`).bind(...cacheKeys).run();
}
