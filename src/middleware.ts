import { defineMiddleware } from 'astro:middleware';

const securityHeaders: Record<string, string> = {
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; upgrade-insecure-requests",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  for (const [name, value] of Object.entries(securityHeaders)) response.headers.set(name, value);
  return response;
});
