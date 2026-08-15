import { describe, expect, it } from 'vitest';
import { postHogRequestHeaders, postHogRoute } from '../src/lib/posthog-proxy';

describe('PostHog proxy', () => {
  it('allows SDK assets and event ingestion routes', () => {
    expect(postHogRoute('static/array.js')).toBe('asset');
    expect(postHogRoute('array/project/config')).toBe('asset');
    expect(postHogRoute('e/')).toBe('ingest');
    expect(postHogRoute('flags/?v=2')).toBe('ingest');
    expect(postHogRoute('i/v1/metrics')).toBe('ingest');
  });

  it('rejects unrelated or ambiguous upstream paths', () => {
    expect(postHogRoute('api/projects')).toBeNull();
    expect(postHogRoute('../api/projects')).toBeNull();
    expect(postHogRoute('')).toBeNull();
  });

  it('forwards only analytics headers and uses Cloudflare as the IP authority', () => {
    const source = new Headers({
      authorization: 'Bearer private',
      cookie: 'session=private',
      'content-type': 'application/json',
      'cf-connecting-ip': '192.0.2.4',
      'x-forwarded-for': '198.51.100.9',
    });
    const headers = postHogRequestHeaders(source, 'gitracer.io');

    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('x-forwarded-for')).toBe('192.0.2.4');
    expect(headers.get('x-forwarded-host')).toBe('gitracer.io');
  });
});
