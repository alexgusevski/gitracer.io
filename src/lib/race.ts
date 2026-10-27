import { dateSeries, parseRange } from './ranges';
import type { ContributionDay, ProfileRecord, ProfileYearRecord, RaceData, RacerSeries } from './types';

const COLORS = [
  '#9784ff',
  '#58a6ff',
  '#d56bff',
  '#55d6e8',
  '#ff9f6e',
  '#f778ba',
  '#7ee787',
  '#ffd166',
  '#ff6b6b',
  '#2dd4bf',
  '#b8a1ff',
  '#a3d65c',
];

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
    return {
      githubId: profile.githubId,
      login: profile.login,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      profileUrl: profile.profileUrl,
      color: COLORS[index % COLORS.length]!,
      total: days.reduce((sum, day) => sum + day.count, 0),
      activeDays: days.filter((day) => day.count > 0).length,
      longestStreak: calculateLongestStreak(days),
      days,
      fetchedAt,
      canRefresh: false,
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
    canRefresh: false,
  };
}
