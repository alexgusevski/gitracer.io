export type ContributionLevel = 'NONE' | 'FIRST_QUARTILE' | 'SECOND_QUARTILE' | 'THIRD_QUARTILE' | 'FOURTH_QUARTILE';

export interface ContributionDay {
  date: string;
  count: number;
  level: ContributionLevel;
}

export interface ProfileRecord {
  githubId: string;
  login: string;
  displayName: string | null;
  avatarUrl: string;
  profileUrl: string;
  contributionYears: number[];
  profileFetchedAt: string;
}

export interface ProfileYearRecord {
  githubId: string;
  year: number;
  total: number;
  days: ContributionDay[];
  fetchedAt: string;
}

export interface RacerSeries {
  githubId: string;
  login: string;
  displayName: string | null;
  avatarUrl: string;
  profileUrl: string;
  color: string;
  total: number;
  activeDays: number;
  longestStreak: number;
  days: ContributionDay[];
  fetchedAt: string | null;
  canRefresh: boolean;
}

export type RangeKey = 'last30' | 'last365' | 'lifetime' | `year:${number}`;

export interface RangeDefinition {
  key: RangeKey;
  label: string;
  start: string;
  end: string;
  years: number[];
}

export interface RaceData {
  slug: string;
  racers: RacerSeries[];
  range: RangeDefinition;
  availableYears: number[];
  leader: { login: string; lead: number; tied: boolean } | null;
  generatedAt: string;
  canRefresh: boolean;
}

export interface LatestRace {
  slug: string;
  handles: string[];
  lastViewedAt: string;
  viewCount: number;
}

export interface TopContributor {
  login: string;
  displayName: string | null;
  totalContributions: number;
  cachedYearCount: number;
}
