import type { APIRoute } from 'astro';
import { runtimeEnv } from '../../lib/server';

const proxy: APIRoute = async ({ params, request, url }) => {
  const env = runtimeEnv();
  const path = (params.path ?? '').replace(/^\/+/, '');
  const base = path.startsWith('static/') ? env.POSTHOG_ASSETS_HOST : env.POSTHOG_INGEST_HOST;
  const target = new URL(`/${path}`, base);
  target.search = url.search;
  const headers = new Headers(request.headers);
  headers.delete('cookie');
  headers.delete('host');
  headers.delete('cf-connecting-ip');
  headers.set('X-Forwarded-Host', url.host);
  const method = request.method.toUpperCase();
  const upstream = await fetch(target, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  });
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('set-cookie');
  responseHeaders.set('Access-Control-Allow-Origin', url.origin);
  responseHeaders.set('Vary', 'Origin');
  responseHeaders.set('X-Content-Type-Options', 'nosniff');
  if (path.startsWith('static/')) responseHeaders.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
};

export const GET = proxy;
export const POST = proxy;
export const OPTIONS = proxy;
export const HEAD = proxy;
