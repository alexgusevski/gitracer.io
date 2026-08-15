export type PostHogRoute = 'asset' | 'ingest';

const ingestRoots = new Set(['batch', 'decide', 'e', 'engage', 'flags', 'g', 'i', 's']);
const forwardedHeaders = ['accept', 'accept-language', 'content-encoding', 'content-type', 'origin', 'referer', 'user-agent'];

export function postHogRoute(path: string): PostHogRoute | null {
  if (!path || path.length > 2048 || path.includes('\\') || path.split('/').some((segment) => segment === '.' || segment === '..')) return null;
  const root = path.split('/', 1)[0];
  if (root === 'static' || root === 'array') return 'asset';
  return root && ingestRoots.has(root) ? 'ingest' : null;
}

export function postHogRequestHeaders(source: Headers, publicHost: string): Headers {
  const headers = new Headers();
  for (const name of forwardedHeaders) {
    const value = source.get(name);
    if (value) headers.set(name, value);
  }

  const clientIp = source.get('cf-connecting-ip');
  if (clientIp) headers.set('X-Forwarded-For', clientIp);
  headers.set('X-Forwarded-Host', publicHost);
  headers.set('X-Forwarded-Proto', 'https');
  return headers;
}
