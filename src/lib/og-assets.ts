/*
 * Dynamic font fallback behavior adapted from @cf-wasm/og 0.4.1.
 * Copyright (c) 2025-present Deo Kumar. Used under the MIT License.
 */

interface FallbackFont {
  name: string;
  data: ArrayBuffer;
  weight: 400;
  style: 'normal';
  lang?: string;
}

type CodePointRange = number | [number, number];

const languageFonts: Record<string, string[]> = {
  symbol: ['Noto+Sans+Symbols', 'Noto+Sans+Symbols+2'],
  math: ['Noto+Sans+Math'],
  unknown: ['Noto+Sans'],
};
const detectorUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36';
const fontUserAgent = 'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1';
const assetCache = new Map<string, Promise<FallbackFont[]>>();
const fontCache = new Map<string, Promise<ArrayBuffer>>();

function parseUnicodeRanges(input: string): CodePointRange[] {
  return input.split(', ').map((entry) => {
    const [start, end] = entry.replaceAll('U+', '').split('-').map((hex) => Number.parseInt(hex, 16));
    return end === undefined || Number.isNaN(end) ? start! : [start!, end];
  });
}

function includesCodePoint(segment: string, ranges: CodePointRange[]): boolean {
  const codePoint = segment.codePointAt(0);
  if (!codePoint) return false;
  return ranges.some((range) => typeof range === 'number' ? codePoint === range : range[0] <= codePoint && codePoint <= range[1]);
}

async function fetchOk(url: string, userAgent?: string): Promise<Response> {
  const response = await fetch(url, userAgent ? { headers: { 'User-Agent': userAgent } } : undefined);
  if (!response.ok) throw new Error(`Font request failed with status ${response.status}`);
  return response;
}

class FontDetector {
  private readonly rangesByFont: Record<string, CodePointRange[]> = {};

  private add(css: string): void {
    for (const match of css.matchAll(/font-family:\s*'(.+?)';.+?unicode-range:\s*(.+?);/gms)) {
      const font = match[1]?.replaceAll(' ', '+');
      const range = match[2];
      if (!font || !range) continue;
      this.rangesByFont[font] ??= [];
      this.rangesByFont[font].push(...parseUnicodeRanges(range));
    }
  }

  async detect(text: string, fonts: string[]): Promise<Record<string, string>> {
    const missing = fonts.filter((font) => !Object.hasOwn(this.rangesByFont, font));
    if (missing.length) {
      const query = `${missing.map((font) => `family=${font}`).join('&')}&display=swap`;
      this.add(await (await fetchOk(`https://fonts.googleapis.com/css2?${query}`, detectorUserAgent)).text());
    }

    const result: Record<string, string> = {};
    for (const character of text) {
      const font = fonts.find((candidate) => includesCodePoint(character, this.rangesByFont[candidate] ?? []));
      if (font) result[font] = `${result[font] ?? ''}${character}`;
    }
    return result;
  }
}

const detector = new FontDetector();

function loadGoogleFont(family: string, text: string): Promise<ArrayBuffer> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${family}:wght@400&text=${encodeURIComponent(text)}`;
  const existing = fontCache.get(cssUrl);
  if (existing) return existing;
  const promise = (async () => {
    const css = await (await fetchOk(cssUrl, fontUserAgent)).text();
    const fontUrl = css.match(/src: url\((.+)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!fontUrl) throw new Error('Google Fonts did not return a TrueType font');
    return (await fetchOk(fontUrl)).arrayBuffer();
  })();
  fontCache.set(cssUrl, promise);
  return promise;
}

async function loadFonts(languageCode: string, segment: string): Promise<FallbackFont[]> {
  if (languageCode === 'emoji') return [];
  const codes = languageCode.split('|');
  const candidates = codes.flatMap((code) => languageFonts[code] ?? []);
  if (!candidates.length) return [];
  const textByFont = await detector.detect(segment, candidates);
  return Promise.all(Object.entries(textByFont).map(async ([font, text], index) => ({
    name: `satori_${codes[index]}_fallback_${segment}`,
    data: await loadGoogleFont(font, text),
    weight: 400 as const,
    style: 'normal' as const,
    ...(codes[index] && codes[index] !== 'unknown' ? { lang: codes[index] } : {}),
  })));
}

export function loadAdditionalAsset(languageCode: string, segment: string): Promise<FallbackFont[]> {
  const key = JSON.stringify([languageCode, segment]);
  const existing = assetCache.get(key);
  if (existing) return existing;
  const promise = loadFonts(languageCode, segment).catch((error: unknown) => {
    assetCache.delete(key);
    console.warn(JSON.stringify({ event: 'og_font_load_failed', languageCode, message: error instanceof Error ? error.message : String(error) }));
    return [];
  });
  assetCache.set(key, promise);
  return promise;
}
