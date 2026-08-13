import { env } from 'cloudflare:workers';

export type GitRacerEnv = Env & { POSTHOG_KEY?: string };

export function runtimeEnv(): GitRacerEnv {
  return env as unknown as GitRacerEnv;
}

export function clientIp(request: Request): string | null {
  return request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
}

export function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}
