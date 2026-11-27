// Tiny router in front of the static GitRacer build (Workers Static Assets).
// No bindings besides ASSETS, no network requests, no storage.

import { races } from '../src/data/snapshot.json';
import { CONTENT_SIGNAL, CORE_PAGES, markdownPath } from '../src/lib/page-paths.mjs';
import { prefersMarkdown } from './prefers-markdown.js';

const APEX = 'gitracer.io';
const GONE = /^\/(?:api|ph|avatar|battle-avatar)(?:\/|$)|^\/analytics\.js$|^\/battle-lab$/;
const OG_IMAGE = /^\/og\/[^/]+\.png$/;
const RACE_PATH = /^\/[A-Za-z0-9+%-]+$/;
const INDEXABLE = new Set([...CORE_PAGES, ...races.map(({ slug }) => `/${slug}`)]);
const MARKDOWN_TYPE = 'text/markdown; charset=utf-8';

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: https://avatars.githubusercontent.com; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; upgrade-insecure-requests",
  'Strict-Transport-Security': 'max-age=31536000',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

function withHeaders(response, url) {
  const res = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.headers.set(name, value);
  if (url.hostname.endsWith('.workers.dev')) res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  if (url.pathname.startsWith('/_astro/')) res.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return res;
}

function redirect(location, url) {
  return withHeaders(new Response(null, { status: 301, headers: { Location: location } }), url);
}

function raceCanonical(pathname) {
  if (!RACE_PATH.test(pathname)) return pathname;
  try {
    const decoded = decodeURIComponent(pathname).toLowerCase();
    if (/^\/[a-z0-9+-]+$/.test(decoded)) return decoded;
  } catch {}
  return pathname;
}

function encodedAssetUrl(url) {
  // The asset server keys a literal `+` as `%2B` and would otherwise redirect.
  const assetUrl = new URL(url);
  assetUrl.pathname = url.pathname.replaceAll('+', '%2B');
  return assetUrl;
}

function varyOnAccept(headers) {
  const vary = headers.get('Vary')?.split(',').map((value) => value.trim().toLowerCase());
  if (!vary?.includes('*') && !vary?.includes('accept')) headers.append('Vary', 'Accept');
}

function markdownResponse(asset, url, pagePath, explicit) {
  const missing = '# Page not found\n\nSee the [site index for agents](/llms.txt) or visit the [home page](/).\n';
  const response = withHeaders(asset ?? new Response(missing, { status: 404 }), url);
  response.headers.set('Content-Type', MARKDOWN_TYPE);
  response.headers.set('X-Robots-Tag', 'noindex');
  response.headers.set('Content-Signal', CONTENT_SIGNAL);
  if (asset) response.headers.set('Link', `<https://${APEX}${pagePath}>; rel="canonical"`);
  if (!explicit) response.headers.set('Cache-Control', 'private, max-age=0');
  response.headers.delete('ETag');
  response.headers.delete('Last-Modified');
  varyOnAccept(response.headers);
  return response;
}

async function route(request, env) {
  const url = new URL(request.url);

  if (url.protocol === 'http:') {
    url.protocol = 'https:';
    if (url.hostname === `www.${APEX}`) url.hostname = APEX;
    return redirect(url.toString(), url);
  }
  if (url.hostname === `www.${APEX}`) {
    url.hostname = APEX;
    return redirect(url.toString(), url);
  }

  if (GONE.test(url.pathname)) {
    return withHeaders(new Response('Gone. The GitRacer backend is offline.\n', { status: 410, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } }), url);
  }

  // Old per-race share cards all fall back to the default card.
  if (OG_IMAGE.test(url.pathname) && url.pathname !== '/og/default.png') {
    return withHeaders(await env.ASSETS.fetch(new Request(new URL('/og/default.png', url), request)), url);
  }

  const readableMethod = request.method === 'GET';
  const explicit = readableMethod && url.pathname.endsWith('.md');
  const pagePath = explicit
    ? url.pathname.replace(/(?:\/index)?\.md$/, '') || '/'
    : url.pathname.replace(/\/$/, '') || '/';
  const canonical = raceCanonical(pagePath);

  // Preserve existing redirects for HTML. Markdown aliases go to the canonical .md URL.
  if (canonical !== pagePath && (explicit || url.pathname === pagePath)) {
    url.pathname = explicit ? markdownPath(canonical) : canonical;
    return redirect(url.toString(), url);
  }

  const eligible = INDEXABLE.has(canonical) && url.pathname !== '/.md';
  const negotiated = eligible && readableMethod && !explicit && prefersMarkdown(request.headers.get('Accept'));
  if (eligible && (explicit || negotiated)) {
    const markdownUrl = new URL(markdownPath(canonical), url);
    const asset = await env.ASSETS.fetch(new Request(encodedAssetUrl(markdownUrl)));
    // Asset fallbacks can return HTML, including a 200 SPA shell.
    if (asset.status === 200 && /^text\/markdown(?:;|$)/i.test(asset.headers.get('Content-Type') ?? '')) {
      return markdownResponse(asset, url, canonical, explicit);
    }
    await asset.body?.cancel();
  }
  if (explicit) return markdownResponse(null, url, canonical, true);

  const assetRequest = url.pathname.includes('+') ? new Request(encodedAssetUrl(url), request) : request;
  const html = withHeaders(await env.ASSETS.fetch(assetRequest), url);
  if (readableMethod && eligible && (html.ok || html.status === 304)) {
    varyOnAccept(html.headers);
    html.headers.append('Link', `<https://${APEX}${markdownPath(canonical)}>; rel="alternate"; type="text/markdown"`);
    if (canonical === '/') html.headers.append('Link', '</llms.txt>; rel="describedby"; type="text/plain"');
  }
  return html;
}

export default {
  async fetch(request, env) {
    if (request.method !== 'HEAD') return route(request, env);
    const response = await route(new Request(request, { method: 'GET' }), env);
    await response.body?.cancel();
    return new Response(null, response);
  },
};
