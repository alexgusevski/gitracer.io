import type { APIRoute } from 'astro';
import { getProfileByLogin } from '../../lib/db';
import { normalizeHandle } from '../../lib/handles';
import { runtimeEnv } from '../../lib/server';

const CACHE_CONTROL = 'public, max-age=31536000, s-maxage=31536000, immutable';

function fallbackAvatar(login: string, status = 200): Response {
  const initial = login.slice(0, 1).toUpperCase().replace(/[^A-Z0-9]/g, '?');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" rx="32" fill="#08082f"/><text x="80" y="103" text-anchor="middle" font-family="monospace" font-size="72" fill="#9784ff">${initial}</text></svg>`;
  return new Response(svg, { status, headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': status === 200 ? CACHE_CONTROL : 'public, max-age=300' } });
}

export const GET: APIRoute = async ({ params }) => {
  const login = normalizeHandle(params.login ?? '');
  if (!login) return fallbackAvatar('?', 404);
  const env = runtimeEnv();
  const profile = await getProfileByLogin(env.DB, login);
  if (!profile) return fallbackAvatar(login, 404);
  const key = `avatar/${profile.githubId}`;
  const cached = await env.AVATARS.get(key);
  if (cached) {
    const headers = new Headers();
    cached.writeHttpMetadata(headers);
    headers.set('Cache-Control', CACHE_CONTROL);
    headers.set('ETag', cached.httpEtag);
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(cached.body, { headers });
  }

  const response = await fetch(profile.avatarUrl, {
    headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg' },
    redirect: 'follow',
    signal: AbortSignal.timeout(10_000),
  });
  const contentType = response.headers.get('content-type') ?? '';
  const declaredSize = Number(response.headers.get('content-length') ?? '0');
  if (!response.ok || !contentType.startsWith('image/') || declaredSize > 5_000_000) return fallbackAvatar(login);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 5_000_000) return fallbackAvatar(login);
  await env.AVATARS.put(key, bytes, { httpMetadata: { contentType } });
  return new Response(bytes, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': CACHE_CONTROL,
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
