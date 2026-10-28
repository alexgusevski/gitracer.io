// Tiny router in front of the static GitRacer build (Workers Static Assets).
// No bindings besides ASSETS, no network requests, no storage.

const APEX = 'gitracer.io';
const GONE = /^\/(?:api|ph|avatar|battle-avatar)(?:\/|$)|^\/analytics\.js$|^\/battle-lab$/;
const OG_IMAGE = /^\/og\/[^/]+\.png$/;
const RACE_PATH = /^\/[A-Za-z0-9+%-]+$/;

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

export default {
  async fetch(request, env) {
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

    // Race slugs: `%2B` and upper-case handles go to the canonical lower-case `+` form.
    if (RACE_PATH.test(url.pathname) && url.pathname !== '/') {
      let canonical = url.pathname;
      try {
        canonical = decodeURIComponent(canonical);
      } catch {}
      canonical = canonical.toLowerCase();
      if (canonical !== url.pathname && /^\/[a-z0-9+-]+$/.test(canonical)) {
        url.pathname = canonical;
        return redirect(url.toString(), url);
      }
    }

    // The asset server keys `a+b.html` as `/a%2Bb` and would 307 a literal `+` there.
    // Serve the `+` URL (the canonical one) directly instead.
    if (url.pathname.includes('+')) {
      const assetUrl = new URL(url);
      assetUrl.pathname = url.pathname.replaceAll('+', '%2B');
      return withHeaders(await env.ASSETS.fetch(new Request(assetUrl, request)), url);
    }

    return withHeaders(await env.ASSETS.fetch(request), url);
  },
};
