import { githubYearBounds } from './ranges';
import type { ContributionDay, ContributionLevel, ProfileRecord, ProfileYearRecord } from './types';

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';
const MAX_COLLECTIONS_PER_QUERY = 36;

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

interface GraphQlResponse {
  data?: Record<string, unknown>;
  errors?: Array<{ message: string; type?: string }>;
}

async function githubRequest(token: string, query: string, variables: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'gitracer.io',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    console.error(JSON.stringify({ event: 'github_api_error', status: response.status, remaining }));
    if (response.status === 401 || response.status === 403) throw new GitHubApiError('GitHub data is temporarily unavailable.', 503);
    throw new GitHubApiError(`GitHub returned ${response.status}.`);
  }

  const payload = (await response.json()) as GraphQlResponse;
  if (payload.errors?.length) {
    console.error(JSON.stringify({ event: 'github_graphql_error', errors: payload.errors.map((error) => error.type ?? error.message) }));
    throw new GitHubApiError('GitHub could not load this contribution graph.');
  }
  return payload.data ?? {};
}

export async function fetchGithubProfiles(token: string, logins: string[], fetchedAt = new Date().toISOString()): Promise<Map<string, ProfileRecord | null>> {
  const definitions = logins.map((_, index) => `$login${index}: String!`).join(', ');
  const fields = logins
    .map(
      (_, index) => `u${index}: user(login: $login${index}) {
        id
        login
        name
        avatarUrl(size: 160)
        url
        contributionsCollection { contributionYears }
      }`,
    )
    .join('\n');
  const variables = Object.fromEntries(logins.map((login, index) => [`login${index}`, login]));
  const data = await githubRequest(token, `query GitRacerProfiles(${definitions}) { ${fields} }`, variables);
  const result = new Map<string, ProfileRecord | null>();

  logins.forEach((requested, index) => {
    const value = data[`u${index}`] as
      | {
          id: string;
          login: string;
          name: string | null;
          avatarUrl: string;
          url: string;
          contributionsCollection: { contributionYears: number[] };
        }
      | null
      | undefined;
    result.set(
      requested.toLowerCase(),
      value
        ? {
            githubId: value.id,
            login: value.login,
            displayName: value.name,
            avatarUrl: value.avatarUrl,
            profileUrl: value.url,
            contributionYears: [...new Set(value.contributionsCollection.contributionYears)].sort((a, b) => b - a),
            profileFetchedAt: fetchedAt,
          }
        : null,
    );
  });
  return result;
}

interface YearPair {
  profile: ProfileRecord;
  year: number;
}

function validLevel(level: string): ContributionLevel {
  const levels: ContributionLevel[] = ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'];
  return levels.includes(level as ContributionLevel) ? (level as ContributionLevel) : 'NONE';
}

async function fetchYearChunk(token: string, pairs: YearPair[], fetchedAt: string): Promise<ProfileYearRecord[]> {
  const grouped = new Map<string, { profile: ProfileRecord; pairs: Array<{ year: number; alias: string; fromVar: string; toVar: string }> }>();
  const variables: Record<string, string> = {};
  const variableDefinitions: string[] = [];

  pairs.forEach((pair, index) => {
    const group = grouped.get(pair.profile.githubId) ?? { profile: pair.profile, pairs: [] };
    const alias = `y${pair.year}_${index}`;
    const fromVar = `from${index}`;
    const toVar = `to${index}`;
    const bounds = githubYearBounds(pair.year);
    variables[fromVar] = bounds.from;
    variables[toVar] = bounds.to;
    variableDefinitions.push(`$${fromVar}: DateTime!`, `$${toVar}: DateTime!`);
    group.pairs.push({ year: pair.year, alias, fromVar, toVar });
    grouped.set(pair.profile.githubId, group);
  });

  const userFields: string[] = [];
  let userIndex = 0;
  for (const group of grouped.values()) {
    const loginVar = `login${userIndex}`;
    variables[loginVar] = group.profile.login;
    variableDefinitions.push(`$${loginVar}: String!`);
    userFields.push(`u${userIndex}: user(login: $${loginVar}) {
      ${group.pairs
        .map(
          (pair) => `${pair.alias}: contributionsCollection(from: $${pair.fromVar}, to: $${pair.toVar}) {
            contributionCalendar {
              totalContributions
              weeks { contributionDays { date contributionCount contributionLevel } }
            }
          }`,
        )
        .join('\n')}
    }`);
    userIndex += 1;
  }

  const data = await githubRequest(token, `query GitRacerYears(${variableDefinitions.join(', ')}) { ${userFields.join('\n')} }`, variables);
  const results: ProfileYearRecord[] = [];
  userIndex = 0;
  for (const group of grouped.values()) {
    const user = data[`u${userIndex}`] as Record<string, { contributionCalendar: { totalContributions: number; weeks: Array<{ contributionDays: Array<{ date: string; contributionCount: number; contributionLevel: string }> }> } }> | null;
    if (user) {
      for (const pair of group.pairs) {
        const calendar = user[pair.alias]?.contributionCalendar;
        if (!calendar) continue;
        const days: ContributionDay[] = calendar.weeks.flatMap((week) =>
          week.contributionDays.map((day) => ({ date: day.date, count: day.contributionCount, level: validLevel(day.contributionLevel) })),
        );
        results.push({ githubId: group.profile.githubId, year: pair.year, total: calendar.totalContributions, days, fetchedAt });
      }
    }
    userIndex += 1;
  }
  return results;
}

export async function fetchGithubYears(token: string, pairs: YearPair[], fetchedAt = new Date().toISOString()): Promise<ProfileYearRecord[]> {
  const results: ProfileYearRecord[] = [];
  for (let index = 0; index < pairs.length; index += MAX_COLLECTIONS_PER_QUERY) {
    const chunk = pairs.slice(index, index + MAX_COLLECTIONS_PER_QUERY);
    results.push(...(await fetchYearChunk(token, chunk, fetchedAt)));
  }
  return results;
}
