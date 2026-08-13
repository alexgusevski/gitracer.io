import type { APIRoute } from 'astro';

const pages = ['', 'how-it-works', 'privacy', 'sponsor'];
export const GET: APIRoute = () => {
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map((page) => `\n  <url><loc>https://gitracer.io/${page}</loc></url>`).join('')}\n</urlset>`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=86400' } });
};
