import type { RangeDefinition, RangeKey } from './types';

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

function yearsBetween(start: string, end: string): number[] {
  const from = Number(start.slice(0, 4));
  const to = Number(end.slice(0, 4));
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

export function parseRange(raw: string | null | undefined, availableYears: number[], now = new Date()): RangeDefinition {
  const today = isoDate(now);
  const currentYear = now.getUTCFullYear();
  const requested = raw ?? `year:${currentYear}`;

  if (requested === 'last30') {
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - 29);
    const startDate = isoDate(start);
    return { key: 'last30', label: 'Last 30 days', start: startDate, end: today, years: yearsBetween(startDate, today) };
  }

  if (requested === 'last365') {
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - 364);
    const startDate = isoDate(start);
    return { key: 'last365', label: 'Last 365 days', start: startDate, end: today, years: yearsBetween(startDate, today) };
  }

  if (requested === 'lifetime') {
    const earliest = availableYears.length ? Math.min(...availableYears) : currentYear;
    const start = `${earliest}-01-01`;
    return { key: 'lifetime', label: 'Lifetime', start, end: today, years: yearsBetween(start, today) };
  }

  const match = /^year:(\d{4})$/.exec(requested);
  const year = match ? Number(match[1]) : currentYear;
  const safeYear = year >= 2008 && year <= currentYear ? year : currentYear;
  const end = safeYear === currentYear ? today : `${safeYear}-12-31`;
  return {
    key: `year:${safeYear}`,
    label: String(safeYear),
    start: `${safeYear}-01-01`,
    end,
    years: [safeYear],
  };
}

export function dateSeries(start: string, end: string): string[] {
  const result: string[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  while (cursor <= last) {
    result.push(isoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

export function githubYearBounds(year: number): { from: string; to: string } {
  return {
    from: utcDate(year, 0, 1).toISOString(),
    to: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)).toISOString(),
  };
}

export function isRangeKey(value: string): value is RangeKey {
  return value === 'last30' || value === 'last365' || value === 'lifetime' || /^year:\d{4}$/.test(value);
}
