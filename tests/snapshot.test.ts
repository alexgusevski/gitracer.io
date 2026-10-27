import { describe, expect, it } from 'vitest';
import { avatarFor, hasRace, latestRaces, personHref, raceData, snapshotSlugs, topContributors } from '../src/lib/snapshot';

const PROBE_WORDS = ['download', 'phpinfo', 'wp', 'console', 'n8n', 'foundation-models', 'x'];

describe('saved snapshot', () => {
  it('keeps the 139 saved races and none of the scanner probe words', () => {
    expect(snapshotSlugs()).toHaveLength(139);
    for (const word of PROBE_WORDS) expect(hasRace(word)).toBe(false);
  });

  it('renders every saved race without a backend', () => {
    for (const slug of snapshotSlugs()) {
      const data = raceData(slug.split('+'));
      expect(data.slug).toBe(slug);
      expect(data.canRefresh).toBe(false);
      for (const racer of data.racers) expect(racer.avatarUrl).toMatch(/^https:\/\/avatars\.githubusercontent\.com\//);
    }
  });

  it('links people to saved pages or GitHub, never to missing races', () => {
    for (const contributor of topContributors(10)) {
      const href = personHref(contributor.login);
      expect(href.startsWith('https://github.com/') || hasRace(href.slice(1))).toBe(true);
    }
    expect(latestRaces(10)).toHaveLength(10);
    expect(avatarFor('alexgusevski')).toMatch(/^https:\/\/avatars\.githubusercontent\.com\//);
  });
});
