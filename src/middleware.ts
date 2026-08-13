import { defineMiddleware } from 'astro:middleware';

const securityHeaders: Record<string, string> = {
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; upgrade-insecure-requests",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.url.hostname === 'www.gitracer.io') {
    const canonical = new URL(context.url.pathname + context.url.search, 'https://gitracer.io');
    return context.redirect(canonical.toString(), 308);
  }

  const response = await next();
  for (const [name, value] of Object.entries(securityHeaders)) response.headers.set(name, value);
  return response;
});
