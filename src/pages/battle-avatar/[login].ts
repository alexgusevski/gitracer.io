import type { APIRoute } from 'astro';

const HANDLE = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;

export const GET: APIRoute = async ({ params }) => {
  if (!import.meta.env.DEV) return new Response('Not found', { status: 404 });
  const login = params.login ?? '';
  if (!HANDLE.test(login)) return new Response('Invalid handle', { status: 400 });

  const response = await fetch(`https://github.com/${encodeURIComponent(login)}.png?size=64`, {
    headers: { Accept: 'image/avif,image/webp,image/png,image/*' },
    redirect: 'follow',
  });
  if (!response.ok || !response.body) return new Response('Avatar unavailable', { status: 502 });

  return new Response(response.body, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': response.headers.get('Content-Type') || 'image/png',
    },
  });
};
