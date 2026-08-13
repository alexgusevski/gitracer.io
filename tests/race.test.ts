import { describe, expect, it } from 'vitest';
import { assembleRaceData } from '../src/lib/race';
import type { ProfileRecord, ProfileYearRecord } from '../src/lib/types';

const now = new Date('2026-08-13T12:00:00.000Z');
const profiles: ProfileRecord[] = [
  { githubId: 'A', login: 'alpha', displayName: 'Alpha', avatarUrl: 'https://avatars.example/a', profileUrl: 'https://github.com/alpha', contributionYears: [2026, 2025], profileFetchedAt: '2026-08-13T08:00:00.000Z' },
  { githubId: 'B', login: 'beta', displayName: null, avatarUrl: 'https://avatars.example/b', profileUrl: 'https://github.com/beta', contributionYears: [2026], profileFetchedAt: '2026-08-13T08:00:00.000Z' },
];

function year(githubId: string, entries: Array<[string, number]>, fetchedAt = '2026-08-13T08:00:00.000Z'): ProfileYearRecord {
  return { githubId, year: 2026, total: entries.reduce((sum, [, count]) => sum + count, 0), fetchedAt, days: entries.map(([date, count]) => ({ date, count, level: count ? 'FIRST_QUARTILE' : 'NONE' })) };
}

describe('race assembly', () => {
  it('sums only the chosen period and reports the leader margin', () => {
    const records = new Map([
      ['A:2026', year('A', [['2026-08-12', 4], ['2026-08-13', 3]])],
      ['B:2026', year('B', [['2026-08-12', 2], ['2026-08-13', 1]])],
    ]);
    const data = assembleRaceData('alpha+beta', profiles, records, 'last30', now);
    expect(data.racers.map((racer) => racer.total)).toEqual([7, 3]);
    expect(data.leader).toEqual({ login: 'alpha', lead: 4, tied: false });
    expect(data.racers[0]?.days).toHaveLength(30);
    expect(data.racers[0]?.days[0]?.date).toBe('2026-07-15');
  });

  it('fills missing dates with zero and detects streaks', () => {
    const records = new Map([['A:2026', year('A', [['2026-08-11', 2], ['2026-08-12', 1], ['2026-08-13', 0]])]]);
    const data = assembleRaceData('alpha', [profiles[0]!], records, 'last30', now);
    expect(data.racers[0]).toMatchObject({ total: 3, activeDays: 2, longestStreak: 2, avatarUrl: '/avatar/alpha' });
    expect(data.racers[0]?.days.filter((day) => day.count === 0)).toHaveLength(28);
  });

  it('permits manual refresh only when current-year data is at least three hours old', () => {
    const fresh = new Map([['A:2026', year('A', [], '2026-08-13T10:00:00.000Z')]]);
    const stale = new Map([['A:2026', year('A', [], '2026-08-13T08:00:00.000Z')]]);
    expect(assembleRaceData('alpha', [profiles[0]!], fresh, 'year:2026', now).canRefresh).toBe(false);
    expect(assembleRaceData('alpha', [profiles[0]!], stale, 'year:2026', now).canRefresh).toBe(true);
    expect(assembleRaceData('alpha', [profiles[0]!], stale, 'year:2025', now).canRefresh).toBe(false);
  });
});
