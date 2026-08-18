import type { ContributionLevel, RaceData } from './types';

export const BATTLE_WIDTH = 1280;
export const BATTLE_HEIGHT = 720;
export const FULL_DENSITY_CONTRIBUTIONS = 12_000;
const BATTLE_VIEW_INSET = 0.82;
const BATTLE_VIEW_MIN_AXIS_SCALE = 0.65;

export interface BattleViewScale {
  x: number;
  y: number;
}

export function calculateBattleViewScale(width: number, height: number, horizontalInset = BATTLE_VIEW_INSET): BattleViewScale {
  const logicalAspect = BATTLE_WIDTH / BATTLE_HEIGHT;
  const viewportAspect = Math.max(1, width) / Math.max(1, height);
  const aspectScaleX = Math.min(1, logicalAspect / viewportAspect);
  const aspectScaleY = Math.min(1, viewportAspect / logicalAspect);
  return {
    x: Math.max(BATTLE_VIEW_MIN_AXIS_SCALE, aspectScaleX) * horizontalInset,
    y: Math.max(BATTLE_VIEW_MIN_AXIS_SCALE, aspectScaleY) * BATTLE_VIEW_INSET,
  };
}

export interface BattleDay {
  date: string;
  count: number;
  level?: ContributionLevel;
}

export interface BattleContributor {
  id: string;
  login: string;
  avatarUrl: string;
  color: string;
  days: BattleDay[];
}

export interface BattleScenario {
  id: string;
  label: string;
  description: string;
  durationSeconds: number;
  contributors: BattleContributor[];
}

export interface BattlePreset {
  id: string;
  label: string;
  description: string;
}

export interface BattleBase {
  team: number;
  x: number;
  y: number;
  angle: number;
}

export interface BattleFighter {
  id: number;
  team: number;
  x: number;
  y: number;
  heading: number;
  hp: number;
  cooldown: number;
  targetId: number | null;
  baseTargetTeam: number | null;
  retargetIn: number;
  hitFlash: number;
}

export interface BattleTracer {
  team: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  ttl: number;
  maxTtl: number;
}

export interface BattleBurst {
  team: number;
  x: number;
  y: number;
  ttl: number;
  maxTtl: number;
  size: number;
}

export interface BattleTeamState {
  contributor: BattleContributor;
  base: BattleBase;
  contributionsSeen: number;
  pending: number;
  remainder: number;
  alive: number;
  deployed: number;
  kills: number;
  lost: number;
  baseHp: number;
}

export interface BattleHudState {
  phase: 'running' | 'overtime' | 'finished';
  elapsed: number;
  progress: number;
  dayIndex: number;
  dayCount: number;
  date: string;
  unitScale: number;
  totalContributions: number;
  activeFighters: number;
  winnerTeam: number | null;
  teams: BattleTeamState[];
}

export interface ContributionGridLayout {
  weekCount: number;
  bandCount: number;
  columnsPerBand: number;
  step: number;
  bandGap: number;
  cellSize: number;
  cornerRadius: number;
  width: number;
  height: number;
}

interface PresetDefinition extends BattlePreset {
  contributorCount: number;
  dayCount: number;
  minActivity: number;
  maxActivity: number;
  burstChance: number;
  burstMultiplier: number;
}

const COLORS = ['#7c6cff', '#42d6b4', '#ffb347', '#ff5f73', '#58b9ff', '#dc71ff', '#d6e74c', '#ff8c42'];
const LOGINS = ['steipete', 'sindresorhus', 'torvalds', 'antfu', 'yyx990803', 'gaearon', 'addyosmani', 'kentcdodds'];

const PRESET_DEFINITIONS: PresetDefinition[] = [
  {
    id: 'garage',
    label: 'Garage project',
    description: '3 contributors · 30 days · sparse commits',
    contributorCount: 3,
    dayCount: 30,
    minActivity: 0,
    maxActivity: 5,
    burstChance: 0.08,
    burstMultiplier: 3,
  },
  {
    id: 'release',
    label: 'Release crunch',
    description: '5 contributors · 90 days · steady activity',
    contributorCount: 5,
    dayCount: 90,
    minActivity: 4,
    maxActivity: 34,
    burstChance: 0.12,
    burstMultiplier: 4,
  },
  {
    id: 'monorepo',
    label: 'Mega monorepo',
    description: '8 contributors · 120 days · bursts up to the low thousands',
    contributorCount: 8,
    dayCount: 120,
    minActivity: 80,
    maxActivity: 520,
    burstChance: 0.1,
    burstMultiplier: 3.8,
  },
];

export const BATTLE_PRESETS: BattlePreset[] = PRESET_DEFINITIONS.map(({ id, label, description }) => ({ id, label, description }));

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDate(start: Date, dayOffset: number): string {
  const date = new Date(start);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

export function createBattleScenario(presetId = 'release', seed = 1): BattleScenario {
  const preset = PRESET_DEFINITIONS.find((candidate) => candidate.id === presetId) ?? PRESET_DEFINITIONS[1]!;
  const random = seededRandom(hashSeed(`${preset.id}:${seed}`));
  const start = new Date(Date.UTC(2026, 0, 5));
  const contributors = Array.from({ length: preset.contributorCount }, (_, contributorIndex): BattleContributor => {
    const aptitude = 0.58 + random() * 0.78;
    const phase = random() * Math.PI * 2;
    const days = Array.from({ length: preset.dayCount }, (_, dayIndex): BattleDay => {
      const date = isoDate(start, dayIndex);
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      const weekendFactor = weekday === 0 || weekday === 6 ? 0.34 : 1;
      const wave = 0.66 + Math.sin(dayIndex / 7.5 + phase) * 0.25;
      const activity = preset.minActivity + random() * (preset.maxActivity - preset.minActivity);
      const burst = random() < preset.burstChance ? preset.burstMultiplier * (0.7 + random() * 0.6) : 1;
      let count = Math.round(activity * aptitude * weekendFactor * wave * burst);
      if (preset.id === 'garage' && random() < 0.38) count = 0;
      return { date, count: Math.max(0, count) };
    });
    return {
      id: `team-${contributorIndex + 1}`,
      login: LOGINS[contributorIndex]!,
      avatarUrl: `/battle-avatar/${encodeURIComponent(LOGINS[contributorIndex]!)}`,
      color: COLORS[contributorIndex]!,
      days,
    };
  });

  return {
    id: `${preset.id}-${seed}`,
    label: preset.label,
    description: preset.description,
    durationSeconds: 30,
    contributors,
  };
}

export function createBattleScenarioFromRace(data: RaceData): BattleScenario {
  return {
    id: `${data.slug}:${data.range.key}`,
    label: data.range.label,
    description: `${data.racers.length} contributor${data.racers.length === 1 ? '' : 's'} · ${data.racers[0]?.days.length ?? 0} days`,
    durationSeconds: 30,
    contributors: data.racers.map((racer) => ({
      id: racer.githubId,
      login: racer.login,
      avatarUrl: racer.avatarUrl,
      color: racer.color,
      days: racer.days.map(({ date, count, level }) => ({ date, count, level })),
    })),
  };
}

export function totalContributions(contributors: BattleContributor[]): number {
  return contributors.reduce((total, contributor) => total + contributor.days.reduce((sum, day) => sum + day.count, 0), 0);
}

export function targetFighterDensity(contributionCount: number): number {
  if (contributionCount <= FULL_DENSITY_CONTRIBUTIONS) return contributionCount;
  return Math.floor(FULL_DENSITY_CONTRIBUTIONS + Math.sqrt(contributionCount - FULL_DENSITY_CONTRIBUTIONS) * 30);
}

export function calculateUnitScale(contributors: BattleContributor[]): number {
  const contributions = totalContributions(contributors);
  return Math.max(1, Math.ceil(contributions / Math.max(1, targetFighterDensity(contributions))));
}

export function projectedFighterCount(contributors: BattleContributor[], unitScale: number): number {
  return contributors.reduce((total, contributor) => {
    const contributions = contributor.days.reduce((sum, day) => sum + day.count, 0);
    return total + Math.floor(contributions / Math.max(1, unitScale));
  }, 0);
}

export function calculateContributionGridLayout(
  dayCount: number,
  firstWeekday: number,
  maxWidth = 152,
  maxHeight = 68,
): ContributionGridLayout {
  const normalizedDayCount = Math.max(0, Math.floor(dayCount));
  const normalizedWeekday = Math.max(0, Math.min(6, Math.floor(firstWeekday)));
  const weekCount = Math.max(1, Math.ceil((normalizedWeekday + normalizedDayCount) / 7));
  const gapRows = 1.35;
  let bandCount = 1;
  let columnsPerBand = weekCount;
  let step = Math.min(8, maxWidth / weekCount, maxHeight / 7);

  const maxBands = normalizedDayCount <= 366 ? 1 : Math.min(10, weekCount);
  for (let candidateBands = 2; candidateBands <= maxBands; candidateBands += 1) {
    const candidateColumns = Math.ceil(weekCount / candidateBands);
    const candidateRows = candidateBands * 7 + (candidateBands - 1) * gapRows;
    const candidateStep = Math.min(8, maxWidth / candidateColumns, maxHeight / candidateRows);
    if (candidateStep > step) {
      bandCount = candidateBands;
      columnsPerBand = candidateColumns;
      step = candidateStep;
    }
  }

  const cellSize = Math.max(0.7, step * 0.78);
  const bandGap = gapRows * step;
  const width = (columnsPerBand - 1) * step + cellSize;
  const height = bandCount * 7 * step + (bandCount - 1) * bandGap - (step - cellSize);

  return {
    weekCount,
    bandCount,
    columnsPerBand,
    step,
    bandGap,
    cellSize,
    cornerRadius: Math.min(1.4, cellSize * 0.2),
    width,
    height,
  };
}

export class BattleSimulation {
  readonly scenario: BattleScenario;
  readonly unitScale: number;
  readonly bases: BattleBase[];
  readonly emptySeat: BattleBase;
  readonly teams: BattleTeamState[];
  readonly fighters: BattleFighter[] = [];
  readonly tracers: BattleTracer[] = [];
  readonly bursts: BattleBurst[] = [];

  private readonly random: () => number;
  private readonly fighterById = new Map<number, BattleFighter>();
  private nextFighterId = 1;
  private elapsed = 0;
  private overtime = 0;
  private processedDay = -1;
  private spawnCredit = 0;
  private spawnCursor = 0;
  private winnerTeam: number | null = null;
  private lastBaseAttackerTeam: number | null = null;
  private phase: BattleHudState['phase'] = 'running';
  private readonly spatialCellSize = 52;
  private readonly spatialColumns = Math.ceil(BATTLE_WIDTH / 52);
  private readonly spatialRows = Math.ceil(BATTLE_HEIGHT / 52);
  private readonly spatialBuckets: BattleFighter[][];
  private spatialUpdateIn = 0;
  private readonly spawnRate: number;

  constructor(scenario: BattleScenario, seed = 1) {
    this.scenario = scenario;
    this.unitScale = calculateUnitScale(scenario.contributors);
    this.random = seededRandom(hashSeed(`${scenario.id}:simulation:${seed}`));
    const projected = projectedFighterCount(scenario.contributors, this.unitScale);
    this.spawnRate = Math.max(180, (projected / scenario.durationSeconds) * 1.8);
    this.spatialBuckets = Array.from({ length: this.spatialColumns * this.spatialRows }, () => []);
    this.bases = this.createBases(scenario.contributors.length);
    this.emptySeat = this.createBase(-1, Math.PI / 2);
    this.teams = scenario.contributors.map((contributor, team) => ({
      contributor,
      base: this.bases[team]!,
      contributionsSeen: 0,
      pending: 0,
      remainder: 0,
      alive: 0,
      deployed: 0,
      kills: 0,
      lost: 0,
      baseHp: 100,
    }));
    this.processTimelineThrough(0);
  }

  get isFinished(): boolean {
    return this.phase === 'finished';
  }

  step(deltaSeconds: number): void {
    if (this.phase === 'finished') return;
    const delta = Math.min(0.05, Math.max(0, deltaSeconds));
    if (!delta) return;

    if (this.phase === 'running') {
      this.elapsed = Math.min(this.scenario.durationSeconds, this.elapsed + delta);
      const dayCount = this.scenario.contributors[0]?.days.length ?? 0;
      const targetDay = Math.min(dayCount - 1, Math.floor((this.elapsed / this.scenario.durationSeconds) * dayCount));
      this.processTimelineThrough(targetDay);
      if (this.elapsed >= this.scenario.durationSeconds) this.phase = 'overtime';
    } else {
      this.overtime += delta;
    }

    this.spawnFighters(delta);
    this.updateFighters(delta);
    this.updateEffects(delta);
    this.checkForFinish();
  }

  getHudState(): BattleHudState {
    const dayCount = this.scenario.contributors[0]?.days.length ?? 0;
    const dayIndex = Math.max(0, Math.min(dayCount - 1, this.processedDay));
    return {
      phase: this.phase,
      elapsed: this.elapsed,
      progress: Math.min(1, this.elapsed / this.scenario.durationSeconds),
      dayIndex,
      dayCount,
      date: this.scenario.contributors[0]?.days[dayIndex]?.date ?? '',
      unitScale: this.unitScale,
      totalContributions: totalContributions(this.scenario.contributors),
      activeFighters: this.fighters.length,
      winnerTeam: this.winnerTeam,
      teams: this.teams,
    };
  }

  private createBases(count: number): BattleBase[] {
    const seatCount = count + 1;
    return Array.from({ length: count }, (_, team) => this.createBase(
      team,
      Math.PI / 2 + ((team + 1) / seatCount) * Math.PI * 2,
    ));
  }

  private createBase(team: number, angle: number): BattleBase {
    return {
      team,
      angle,
      x: BATTLE_WIDTH / 2 + Math.cos(angle) * (BATTLE_WIDTH * 0.4),
      y: BATTLE_HEIGHT / 2 + Math.sin(angle) * (BATTLE_HEIGHT * 0.37),
    };
  }

  private processTimelineThrough(targetDay: number): void {
    while (this.processedDay < targetDay) {
      this.processedDay += 1;
      for (const team of this.teams) {
        const count = team.contributor.days[this.processedDay]?.count ?? 0;
        team.contributionsSeen += count;
        if (team.baseHp <= 0) continue;
        team.remainder += count;
        const fighters = Math.floor(team.remainder / this.unitScale);
        team.remainder -= fighters * this.unitScale;
        team.pending += fighters;
      }
    }
  }

  private spawnFighters(delta: number): void {
    this.spawnCredit = Math.min(this.spawnRate * 0.5, this.spawnCredit + delta * this.spawnRate);
    let attempts = 0;
    while (this.spawnCredit >= 1 && attempts < this.teams.length * 3) {
      const team = this.teams[this.spawnCursor % this.teams.length]!;
      this.spawnCursor += 1;
      attempts += 1;
      if (team.pending <= 0 || team.baseHp <= 0) continue;
      this.spawnCredit -= 1;
      team.pending -= 1;
      team.alive += 1;
      team.deployed += 1;
      const inward = Math.atan2(BATTLE_HEIGHT / 2 - team.base.y, BATTLE_WIDTH / 2 - team.base.x);
      const spread = (this.random() - 0.5) * 46;
      const distance = 25 + this.random() * 24;
      const fighter: BattleFighter = {
        id: this.nextFighterId,
        team: team.base.team,
        x: team.base.x + Math.cos(inward) * distance + Math.cos(inward + Math.PI / 2) * spread,
        y: team.base.y + Math.sin(inward) * distance + Math.sin(inward + Math.PI / 2) * spread,
        heading: inward,
        hp: 3,
        cooldown: this.random() * 0.7,
        targetId: null,
        baseTargetTeam: null,
        retargetIn: this.random() * 0.2,
        hitFlash: 0,
      };
      this.nextFighterId += 1;
      this.fighters.push(fighter);
      this.fighterById.set(fighter.id, fighter);
      attempts = 0;
    }
  }

  private updateFighters(delta: number): void {
    this.spatialUpdateIn -= delta;
    if (this.spatialUpdateIn <= 0) {
      this.rebuildSpatialBuckets();
      this.spatialUpdateIn = 0.12;
    }
    for (const fighter of this.fighters) {
      if (fighter.hp <= 0) continue;
      fighter.cooldown -= delta;
      fighter.retargetIn -= delta;
      fighter.hitFlash = Math.max(0, fighter.hitFlash - delta);

      let target = fighter.targetId === null ? undefined : this.fighterById.get(fighter.targetId);
      if (!target || target.hp <= 0 || target.team === fighter.team || fighter.retargetIn <= 0) {
        target = this.nearbyEnemy(fighter);
        fighter.targetId = target?.id ?? null;
        fighter.retargetIn = 0.28 + this.random() * 0.18;
      }

      if (!target) {
        let baseTarget = fighter.baseTargetTeam === null ? undefined : this.teams[fighter.baseTargetTeam];
        if (!baseTarget || baseTarget.baseHp <= 0 || baseTarget.base.team === fighter.team) {
          baseTarget = this.nearestEnemyBase(fighter);
          fighter.baseTargetTeam = baseTarget?.base.team ?? null;
        }
        if (!baseTarget) continue;
        const dx = baseTarget.base.x - fighter.x;
        const dy = baseTarget.base.y - fighter.y;
        const distanceSquared = dx * dx + dy * dy;
        const angle = Math.atan2(dy, dx);
        fighter.heading = angle;
        if (distanceSquared > 94 * 94) this.moveFighter(fighter, angle, delta);
        else if (fighter.cooldown <= 0) {
          fighter.cooldown = 0.62;
          this.fireAtBase(fighter, baseTarget);
        }
        continue;
      }

      const dx = target.x - fighter.x;
      const dy = target.y - fighter.y;
      const distanceSquared = dx * dx + dy * dy;
      const angle = Math.atan2(dy, dx);
      fighter.heading = angle;
      if (distanceSquared > 102 * 102) {
        const pace = distanceSquared < 150 * 150 ? 0.68 : 1;
        this.moveFighter(fighter, angle, delta * pace);
      } else if (fighter.cooldown <= 0) {
        fighter.cooldown = 0.62;
        this.fire(fighter, target);
      }
    }

    for (let index = this.fighters.length - 1; index >= 0; index -= 1) {
      const fighter = this.fighters[index]!;
      if (fighter.hp > 0) continue;
      this.fighterById.delete(fighter.id);
      const last = this.fighters.pop();
      if (last && index < this.fighters.length) this.fighters[index] = last;
    }
  }

  private moveFighter(fighter: BattleFighter, angle: number, scaledDelta: number): void {
    const speed = 54;
    const wobble = Math.sin(this.elapsed * 2.1 + fighter.id * 0.83) * 0.11;
    fighter.x += Math.cos(angle + wobble) * speed * scaledDelta;
    fighter.y += Math.sin(angle + wobble) * speed * scaledDelta;
    fighter.x = Math.max(18, Math.min(BATTLE_WIDTH - 18, fighter.x));
    fighter.y = Math.max(18, Math.min(BATTLE_HEIGHT - 18, fighter.y));
  }

  private rebuildSpatialBuckets(): void {
    for (const bucket of this.spatialBuckets) bucket.length = 0;
    for (const fighter of this.fighters) {
      if (fighter.hp <= 0) continue;
      const column = Math.max(0, Math.min(this.spatialColumns - 1, Math.floor(fighter.x / this.spatialCellSize)));
      const row = Math.max(0, Math.min(this.spatialRows - 1, Math.floor(fighter.y / this.spatialCellSize)));
      this.spatialBuckets[row * this.spatialColumns + column]!.push(fighter);
    }
  }

  private nearbyEnemy(fighter: BattleFighter): BattleFighter | undefined {
    const originColumn = Math.max(0, Math.min(this.spatialColumns - 1, Math.floor(fighter.x / this.spatialCellSize)));
    const originRow = Math.max(0, Math.min(this.spatialRows - 1, Math.floor(fighter.y / this.spatialCellSize)));
    const maxRing = 5;

    for (let ring = 0; ring < maxRing; ring += 1) {
      const minColumn = Math.max(0, originColumn - ring);
      const maxColumn = Math.min(this.spatialColumns - 1, originColumn + ring);
      const minRow = Math.max(0, originRow - ring);
      const maxRow = Math.min(this.spatialRows - 1, originRow + ring);
      for (let row = minRow; row <= maxRow; row += 1) {
        for (let column = minColumn; column <= maxColumn; column += 1) {
          if (ring > 0 && column > minColumn && column < maxColumn && row > minRow && row < maxRow) continue;
          const bucket = this.spatialBuckets[row * this.spatialColumns + column]!;
          if (!bucket.length) continue;
          const sampleCount = Math.min(28, bucket.length);
          const start = (fighter.id * 17 + ring * 11) % bucket.length;
          for (let sample = 0; sample < sampleCount; sample += 1) {
            const candidate = bucket[(start + sample * 7) % bucket.length]!;
            if (candidate.team !== fighter.team && candidate.hp > 0) return candidate;
          }
        }
      }
    }
    return undefined;
  }

  private nearestEnemyBase(fighter: BattleFighter): BattleTeamState | undefined {
    let nearest: BattleTeamState | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const team of this.teams) {
      if (team.base.team === fighter.team || team.baseHp <= 0) continue;
      const dx = team.base.x - fighter.x;
      const dy = team.base.y - fighter.y;
      const distance = dx * dx + dy * dy;
      if (distance < nearestDistance) {
        nearest = team;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  private fire(attacker: BattleFighter, target: BattleFighter): void {
    const effectSampling = Math.min(1, 2400 / Math.max(1, this.fighters.length));
    if (this.random() < effectSampling) {
      this.tracers.push({
        team: attacker.team,
        x1: attacker.x,
        y1: attacker.y,
        x2: target.x,
        y2: target.y,
        ttl: 0.13,
        maxTtl: 0.13,
      });
    }
    target.hp -= 1;
    target.hitFlash = 0.09;
    if (target.hp > 0) return;
    const defendingTeam = this.teams[target.team]!;
    const attackingTeam = this.teams[attacker.team]!;
    defendingTeam.alive = Math.max(0, defendingTeam.alive - 1);
    defendingTeam.lost += 1;
    attackingTeam.kills += 1;
    if (this.random() < effectSampling) {
      this.bursts.push({
        team: target.team,
        x: target.x,
        y: target.y,
        ttl: 0.42,
        maxTtl: 0.42,
        size: 13 + this.random() * 9,
      });
    }
  }

  private fireAtBase(attacker: BattleFighter, target: BattleTeamState): void {
    const effectSampling = Math.min(1, 2400 / Math.max(1, this.fighters.length));
    if (this.random() < effectSampling) {
      this.tracers.push({
        team: attacker.team,
        x1: attacker.x,
        y1: attacker.y,
        x2: target.base.x,
        y2: target.base.y,
        ttl: 0.13,
        maxTtl: 0.13,
      });
    }
    target.baseHp = Math.max(0, target.baseHp - 1);
    this.lastBaseAttackerTeam = attacker.team;
    if (target.baseHp > 0) return;
    target.pending = 0;
    target.remainder = 0;
    let eliminatedFighters = 0;
    for (const fighter of this.fighters) {
      if (fighter.team !== target.base.team || fighter.hp <= 0) continue;
      fighter.hp = 0;
      eliminatedFighters += 1;
    }
    target.alive = 0;
    target.lost += eliminatedFighters;
    this.bursts.push({
      team: target.base.team,
      x: target.base.x,
      y: target.base.y,
      ttl: 0.8,
      maxTtl: 0.8,
      size: 38,
    });
  }

  private updateEffects(delta: number): void {
    for (let index = this.tracers.length - 1; index >= 0; index -= 1) {
      const tracer = this.tracers[index]!;
      tracer.ttl -= delta;
      if (tracer.ttl <= 0) this.tracers.splice(index, 1);
    }
    for (let index = this.bursts.length - 1; index >= 0; index -= 1) {
      const burst = this.bursts[index]!;
      burst.ttl -= delta;
      if (burst.ttl <= 0) this.bursts.splice(index, 1);
    }
  }

  private checkForFinish(): void {
    if (this.teams.length === 1 && this.phase === 'overtime') {
      this.winnerTeam = 0;
      this.phase = 'finished';
      return;
    }
    const survivingBases = this.teams.filter((team) => team.baseHp > 0);
    if (this.teams.length > 1 && survivingBases.length <= 1) {
      this.winnerTeam = survivingBases[0]?.base.team ?? this.lastBaseAttackerTeam;
      this.phase = 'finished';
      return;
    }
    if (this.phase !== 'overtime') return;
    const combatantsRemain = this.fighters.length > 0 || this.teams.some((team) => team.pending > 0);
    if (combatantsRemain) return;
    const ranked = [...this.teams].sort((a, b) => {
      const strength = (b.alive + b.pending) - (a.alive + a.pending);
      if (strength) return strength;
      if (b.baseHp !== a.baseHp) return b.baseHp - a.baseHp;
      if (b.kills !== a.kills) return b.kills - a.kills;
      return b.contributionsSeen - a.contributionsSeen;
    });
    this.winnerTeam = ranked[0]?.base.team ?? null;
    this.phase = 'finished';
  }
}
