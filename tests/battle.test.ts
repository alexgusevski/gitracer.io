import { describe, expect, it } from 'vitest';
import {
  BattleSimulation,
  FULL_DENSITY_CONTRIBUTIONS,
  calculateUnitScale,
  createBattleScenario,
  projectedFighterCount,
  targetFighterDensity,
  totalContributions,
  type BattleContributor,
  type BattleScenario,
} from '../src/lib/battle';

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

describe('battle simulation', () => {
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
});
