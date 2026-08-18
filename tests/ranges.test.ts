import { describe, expect, it } from 'vitest';
import { dateSeries, parseRange } from '../src/lib/ranges';

const now = new Date('2026-08-13T12:00:00.000Z');

describe('calendar ranges', () => {
  it('uses inclusive actual calendar days', () => {
    expect(parseRange('last30', [2024, 2025, 2026], now)).toMatchObject({ start: '2026-07-15', end: '2026-08-13' });
    expect(dateSeries('2024-02-28', '2024-03-01')).toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
  });

  it('makes completed years end on December 31', () => {
    expect(parseRange('year:2025', [2025, 2026], now)).toMatchObject({ start: '2025-01-01', end: '2025-12-31', years: [2025] });
  });

  it('starts lifetime at the earliest reported contribution year', () => {
    expect(parseRange('lifetime', [2026, 2021, 2024], now)).toMatchObject({ start: '2021-01-01', end: '2026-08-13' });
  });

  it('falls back safely for impossible years', () => {
    expect(parseRange('year:1999', [], now).key).toBe('year:2026');
    expect(parseRange('year:2099', [], now).key).toBe('year:2026');
  });

  it('defaults period filters to the current calendar year', () => {
    expect(parseRange(null, [], now).key).toBe('year:2026');
  });
});
