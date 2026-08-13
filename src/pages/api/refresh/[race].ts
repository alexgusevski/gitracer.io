import type { APIRoute } from 'astro';
import { parseRaceSlug, raceSlug } from '../../../lib/handles';
import { loadRace, RaceLoadError } from '../../../lib/race';
import { clientIp, jsonResponse, runtimeEnv } from '../../../lib/server';

export const POST: APIRoute = async ({ params, request, url }) => {
  try {
    const handles = parseRaceSlug(params.race);
    const slug = raceSlug(handles);
    const env = runtimeEnv();
    const data = await loadRace({
      db: env.DB,
      githubToken: env.GITHUB_TOKEN,
      rateLimitSecret: env.RATE_LIMIT_SECRET,
      handles,
      slug,
      rangeKey: url.searchParams.get('range'),
      clientIp: clientIp(request),
      forceRefresh: true,
    });
    return jsonResponse(data, 200, { 'Cache-Control': 'no-store' });
  } catch (error) {
    const status = error instanceof RaceLoadError || (error instanceof Error && 'status' in error) ? Number((error as { status: number }).status) : 500;
    const message = error instanceof Error ? error.message : 'Could not refresh this race.';
    return jsonResponse({ error: message }, status, { 'Cache-Control': 'no-store' });
  }
};
