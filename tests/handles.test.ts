import { describe, expect, it } from 'vitest';
import { InvalidRaceError, normalizeHandle, parseRaceSlug, raceSlug } from '../src/lib/handles';

describe('GitHub handle parsing', () => {
  it('normalizes public race URLs and removes duplicates', () => {
    expect(parseRaceSlug('@Octocat+DEFUNKT+octocat')).toEqual(['octocat', 'defunkt']);
    expect(raceSlug(['Octocat', '@defunkt'])).toBe('octocat+defunkt');
  });

  it('accepts GitHub-compatible handles', () => {
    expect(normalizeHandle('a')).toBe('a');
    expect(normalizeHandle('github-actions')).toBe('github-actions');
    expect(normalizeHandle('a1-b2')).toBe('a1-b2');
  });

  it.each(['-start', 'end-', 'two--hyphens', 'space name', '', '_octocat'])('rejects %s', (handle) => {
    expect(normalizeHandle(handle)).toBeNull();
  });

  it('accepts up to twelve unique people', () => {
    expect(parseRaceSlug('a+b+c+d+e+f+g+h+i+j+k+l')).toHaveLength(12);
  });

  it('rejects a thirteenth person', () => {
    expect(() => parseRaceSlug('a+b+c+d+e+f+g+h+i+j+k+l+m')).toThrow(InvalidRaceError);
  });

  it('accepts twelve maximum-length handles', () => {
    const slug = Array.from({ length: 12 }, (_, index) => `${String.fromCharCode(97 + index)}${'a'.repeat(38)}`).join('+');
    expect(parseRaceSlug(slug)).toHaveLength(12);
  });
});
