import { describe, expect, it } from 'vitest';
import {
  BattleSimulation,
  BATTLE_HEIGHT,
  BATTLE_WIDTH,
  EMBEDDED_BATTLE_HORIZONTAL_INSET,
  FULL_DENSITY_CONTRIBUTIONS,
  calculateBattleViewScale,
  calculateContributionGridLayout,
  calculateUnitScale,
  createBattleScenario,
  createBattleScenarioFromRace,
  projectedFighterCount,
  targetFighterDensity,
  totalContributions,
  type BattleContributor,
  type BattleScenario,
} from '../src/lib/battle';
import type { RaceData } from '../src/lib/types';

function scenarioWithDailyCounts(counts: number[][], durationSeconds = 1): BattleScenario {
  const contributors: BattleContributor[] = counts.map((days, team) => ({
    id: `team-${team}`,
    login: `fighter-${team}`,
    avatarUrl: `https://example.com/fighter-${team}.png`,
    color: ['#f00', '#0f0', '#00f'][team] ?? '#fff',
    days: days.map((count, day) => ({ date: `2026-01-${String(day + 1).padStart(2, '0')}`, count })),
  }));
  return { id: 'test', label: 'Test battle', description: 'Fixture', durationSeconds, contributors };
}

describe('battle scaling', () => {
  it('insets the battlefield and pulls ultrawide layouts toward the center', () => {
    const standard = calculateBattleViewScale(1280, 720);
    const standalone = calculateBattleViewScale(1280, 720, EMBEDDED_BATTLE_HORIZONTAL_INSET);
    const ultrawide = calculateBattleViewScale(3440, 1440);
    const portrait = calculateBattleViewScale(720, 1280);
    expect(standard).toEqual({ x: 0.82, y: 0.82 });
    expect(standalone).toEqual({ x: 0.92, y: 0.82 });
    expect(ultrawide.x).toBeLessThan(standard.x);
    expect(ultrawide.y).toBe(standard.y);
    expect(portrait.x).toBe(standard.x);
    expect(portrait.y).toBeLessThan(standard.y);
    for (const scale of [standard, ultrawide, portrait]) {
      expect(scale.x).toBeGreaterThanOrEqual(0.533);
      expect(scale.y).toBeGreaterThanOrEqual(0.533);
    }
  });

  it('keeps one fighter per contribution for small battles', () => {
    const scenario = scenarioWithDailyCounts([[1, 0, 2], [0, 1, 1]]);
    expect(calculateUnitScale(scenario.contributors)).toBe(1);
    expect(projectedFighterCount(scenario.contributors, 1)).toBe(5);
  });

  it('keeps full fighter density for normal-sized battles', () => {
    expect(targetFighterDensity(FULL_DENSITY_CONTRIBUTIONS)).toBe(FULL_DENSITY_CONTRIBUTIONS);
    expect(targetFighterDensity(8_000)).toBe(8_000);
  });

  it('grows extreme armies sublinearly instead of flattening them at a fixed cap', () => {
    const scenario = scenarioWithDailyCounts(Array.from({ length: 8 }, () => Array.from({ length: 120 }, () => 1400)));
    const scale = calculateUnitScale(scenario.contributors);
    const projected = projectedFighterCount(scenario.contributors, scale);
    expect(scale).toBeGreaterThan(1);
    expect(totalContributions(scenario.contributors)).toBe(1_344_000);
    expect(projected).toBeGreaterThan(40_000);
    expect(projected).toBeLessThan(60_000);
    expect(targetFighterDensity(3_600_000)).toBeGreaterThan(targetFighterDensity(300_000));
  });
});

describe('race battle scenarios', () => {
  it('preserves every selected-range day and GitHub contribution level', () => {
    const days = Array.from({ length: 30 }, (_, index) => ({
      date: `2026-01-${String(index + 1).padStart(2, '0')}`,
      count: index % 5,
      level: (['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'] as const)[index % 5]!,
    }));
    const race = {
      slug: 'one+two',
      range: { key: 'last30', label: 'Last 30 days', start: days[0]!.date, end: days.at(-1)!.date, years: [2026] },
      racers: [{ githubId: '1', login: 'one', displayName: null, avatarUrl: '/avatar/one', profileUrl: '', color: '#f00', total: 60, activeDays: 24, longestStreak: 4, days, fetchedAt: null, canRefresh: false }],
      availableYears: [2026],
      leader: null,
      generatedAt: '2026-01-30T00:00:00Z',
      canRefresh: false,
    } satisfies RaceData;

    const scenario = createBattleScenarioFromRace(race);
    expect(scenario.durationSeconds).toBe(30);
    expect(scenario.contributors[0]?.days).toEqual(days);
    expect(scenario.description).toContain('30 days');
  });
});

describe('contribution graph layout', () => {
  it('keeps short ranges in one seven-day band with square cells', () => {
    const layout = calculateContributionGridLayout(30, 4);
    expect(layout).toMatchObject({ weekCount: 5, bandCount: 1 });
    expect(layout.cellSize).toBeLessThan(layout.step);
    expect(layout.cornerRadius).toBeGreaterThan(0);
    expect(layout.width).toBeLessThanOrEqual(152);
    expect(layout.height).toBeLessThanOrEqual(68);
  });

  it('keeps annual histories in one GitHub-style strip and wraps only lifetime histories', () => {
    const year = calculateContributionGridLayout(365, 4);
    const lifetime = calculateContributionGridLayout(20 * 365, 1);
    expect(year.bandCount).toBe(1);
    expect(lifetime.bandCount).toBeGreaterThan(year.bandCount);
    for (const layout of [year, lifetime]) {
      expect(layout.width).toBeLessThanOrEqual(152);
      expect(layout.height).toBeLessThanOrEqual(68);
      expect(layout.cellSize).toBeGreaterThan(0);
    }
  });
});

describe('battle simulation', () => {
  it('reserves an extra base position without adding a targetable team', () => {
    const scenario = scenarioWithDailyCounts([[2], [2], [2]]);
    const simulation = new BattleSimulation(scenario, 9);
    expect(simulation.teams).toHaveLength(3);
    expect(simulation.bases).toHaveLength(3);
    expect(simulation.emptySeat.team).toBe(-1);
    expect(simulation.emptySeat.x).toBeCloseTo(BATTLE_WIDTH / 2);
    expect(simulation.emptySeat.y).toBeGreaterThan(BATTLE_HEIGHT / 2);
    expect(simulation.teams.some((team) => team.base.x === simulation.emptySeat.x && team.base.y === simulation.emptySeat.y)).toBe(false);
  });

  it('is deterministic for the same scenario and seed', () => {
    const scenario = createBattleScenario('garage', 12);
    const first = new BattleSimulation(scenario, 99);
    const second = new BattleSimulation(scenario, 99);
    for (let step = 0; step < 300; step += 1) {
      first.step(1 / 60);
      second.step(1 / 60);
    }
    expect(first.getHudState().teams.map(({ alive, pending, kills, lost }) => ({ alive, pending, kills, lost })))
      .toEqual(second.getHudState().teams.map(({ alive, pending, kills, lost }) => ({ alive, pending, kills, lost })));
    expect(first.fighters.slice(0, 12)).toEqual(second.fighters.slice(0, 12));
  });

  it('plays every timeline day before entering overtime', () => {
    const scenario = scenarioWithDailyCounts([[1, 2, 3], [3, 2, 1]], 1);
    const simulation = new BattleSimulation(scenario, 3);
    for (let step = 0; step < 61; step += 1) simulation.step(1 / 60);
    const state = simulation.getHudState();
    expect(state.phase).toBe('overtime');
    expect(state.dayIndex).toBe(2);
    expect(state.teams.map((team) => team.contributionsSeen)).toEqual([6, 6]);
  });

  it('stops reinforcements after a contributor base reaches zero HP', () => {
    const scenario = scenarioWithDailyCounts([[100, 100], [1, 1], [1, 1]], 1);
    const simulation = new BattleSimulation(scenario, 3);
    simulation.teams[0]!.baseHp = 0;
    simulation.teams[0]!.pending = 0;
    for (let step = 0; step < 40; step += 1) simulation.step(1 / 60);
    expect(simulation.teams[0]).toMatchObject({ baseHp: 0, pending: 0, deployed: 0, contributionsSeen: 200 });
  });

  it('finishes a one-contributor battle after its timeline completes', () => {
    const simulation = new BattleSimulation(scenarioWithDailyCounts([[3]], 0.1), 4);
    for (let step = 0; step < 12; step += 1) simulation.step(1 / 60);
    expect(simulation.getHudState()).toMatchObject({ phase: 'finished', winnerTeam: 0, dayIndex: 0 });
  });
});
