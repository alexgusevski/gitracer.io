import { ImageResponse, cache } from '@cf-wasm/og/workerd';
import { t } from '@cf-wasm/og/html-to-react';
import type { APIRoute } from 'astro';
import { parseRaceSlug, raceSlug } from './handles';
import { loadRace } from './race';
import { clientIp, runtimeEnv } from './server';
import type { RaceData } from './types';

const colors = ['#9784ff', '#58a6ff', '#d56bff', '#55d6e8', '#ff9f6e', '#f778ba'];

function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

function cumulativePath(data: RaceData, index: number): string {
  const racer = data.racers[index];
  if (!racer) return '';
  const totals: number[] = [];
  let running = 0;
  for (const day of racer.days) totals.push((running += day.count));
  const max = Math.max(1, ...data.racers.map((item) => item.total));
  const points = ['0,240'];
  totals.forEach((value, pointIndex) => points.push(`${((pointIndex + 1) / Math.max(1, totals.length)) * 880},${240 - (value / max) * 210}`));
  return `M${points.join(' L')}`;
}

export const GET: APIRoute = async ({ params, request, url, locals }) => {
  cache.setExecutionContext(locals.cfContext);
  let data: RaceData | null = null;
  if (params.race !== 'default') {
    try {
      const handles = parseRaceSlug(params.race);
      const slug = raceSlug(handles);
      const env = runtimeEnv();
      data = await loadRace({
        db: env.DB,
        githubToken: env.GITHUB_TOKEN,
        rateLimitSecret: env.RATE_LIMIT_SECRET,
        handles,
        slug,
        rangeKey: url.searchParams.get('range'),
        clientIp: clientIp(request),
      });
    } catch (error) {
      console.error('og_race_load_failed', error);
    }
  }

  const headline = data
    ? data.racers.length === 1
      ? `@${data.racers[0]?.login}'s contribution run`
      : data.leader?.tied
        ? `${data.racers.map((racer) => `@${racer.login}`).join(' vs ')} are tied`
        : `@${data.leader?.login} leads by ${data.leader?.lead.toLocaleString()}`
    : 'Race your GitHub contribution history.';

  const chart = data
    ? `<div style="position:relative;display:flex;flex:1;margin-top:34px;border-top:1px solid #303166">
        <svg width="900" height="260" viewBox="0 0 900 260" style="position:absolute;left:0;bottom:0">
          ${[0, 1, 2, 3].map((line) => `<line x1="0" x2="880" y1="${30 + line * 70}" y2="${30 + line * 70}" stroke="#303166" stroke-dasharray="4 6"/>`).join('')}
          ${data.racers.map((racer, index) => `<path d="${cumulativePath(data, index)}" transform="translate(0 10)" fill="none" stroke="${racer.color || colors[index]}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}
        </svg>
        <div style="position:absolute;right:0;bottom:18px;display:flex;flex-direction:column;align-items:flex-end">
          ${data.racers.map((racer) => `<div style="display:flex;align-items:center;margin-top:8px;font-size:17px"><span style="width:10px;height:10px;margin-right:9px;border-radius:99px;background:${racer.color}"></span>@${escapeHtml(racer.login)}<b style="margin-left:12px">${racer.total.toLocaleString()}</b></div>`).join('')}
        </div>
      </div>`
    : '<div style="display:flex;align-items:center;flex:1;margin-top:48px;border-top:1px solid #303166;color:#d6d6e7;font-size:24px">type handles → pick a period → share the race</div>';
  const html = `<div style="width:100%;height:100%;display:flex;flex-direction:column;padding:62px 70px;border-top:10px solid #9784ff;background:#08082f;color:#ffffff;font-family:sans-serif">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center;font-size:26px;font-weight:700"><span style="display:flex;align-items:center;justify-content:center;width:52px;height:44px;margin-right:14px;border:1px solid #3d3e7a;border-radius:10px;background:#050522;color:#fff;font-family:monospace;font-size:18px"><span style="color:#fff">&gt;</span><span style="color:#9784ff">_</span></span>gitracer<span style="color:#9784ff">.io</span></div>
      <div style="display:flex;align-items:center;padding:8px 14px;border:1px solid #66679a;border-radius:8px;color:#d6d6e7;font-size:15px"><span style="color:#9784ff;margin-right:8px">●</span> public GitHub data</div>
    </div>
    <div style="display:flex;flex-direction:column;margin-top:42px">
      <div style="display:flex;color:#9784ff;font-size:15px;font-weight:700;letter-spacing:2px;text-transform:uppercase">${escapeHtml(data ? `${data.range.label} · race in progress` : 'up to 6 racers · one shareable graph')}</div>
      <div style="display:flex;max-width:1060px;margin-top:12px;font-size:${data && data.racers.length > 3 ? 54 : 66}px;font-weight:750;letter-spacing:-3.5px;line-height:1.04">${escapeHtml(headline)}</div>
    </div>
    ${chart}
  </div>`;

  return ImageResponse.async(t(html), { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400' } });
};
