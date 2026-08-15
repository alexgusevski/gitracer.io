import type { APIRoute } from 'astro';
import { postHogRequestHeaders, postHogRoute } from '../../lib/posthog-proxy';
import { runtimeEnv } from '../../lib/server';

const proxy: APIRoute = async ({ params, request, url }) => {
  const env = runtimeEnv();
  const path = (params.path ?? '').replace(/^\/+/, '');
  const route = postHogRoute(path);
  if (!route) return new Response('Not found', { status: 404 });

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': url.origin,
        'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      },
    });
  }

  const base = new URL(route === 'asset' ? env.POSTHOG_ASSETS_HOST : env.POSTHOG_INGEST_HOST);
  const allowedHost = route === 'asset' ? 'eu-assets.i.posthog.com' : 'eu.i.posthog.com';
  if (base.protocol !== 'https:' || base.hostname !== allowedHost) {
    console.error(JSON.stringify({ event: 'posthog_proxy_invalid_origin', route }));
    return new Response('Analytics unavailable', { status: 503 });
  }
  const target = new URL(base);
  target.pathname = `/${path}`;
  target.search = url.search;
  const method = request.method.toUpperCase();
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers: postHogRequestHeaders(request.headers, url.host),
      body: method === 'GET' || method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'posthog_proxy_failed', path, message: error instanceof Error ? error.message : String(error) }));
    return new Response('Analytics unavailable', { status: 502 });
  }
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('set-cookie');
  responseHeaders.set('Access-Control-Allow-Origin', url.origin);
  const vary = responseHeaders.get('Vary');
  if (!vary?.split(',').some((value) => value.trim().toLowerCase() === 'origin')) responseHeaders.set('Vary', vary ? `${vary}, Origin` : 'Origin');
  responseHeaders.set('X-Content-Type-Options', 'nosniff');
  if (route === 'asset') responseHeaders.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
};

export const GET = proxy;
export const POST = proxy;
export const OPTIONS = proxy;
export const HEAD = proxy;
