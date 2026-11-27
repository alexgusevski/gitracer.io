import { describe, expect, it, vi } from 'vitest';
import { convertPage } from '../scripts/agent-markdown.mjs';
import worker from '../worker/index.js';
import { prefersMarkdown } from '../worker/prefers-markdown.js';

const SITE = 'https://gitracer.io';
const MARKDOWN = 'text/markdown';
const BROWSER = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const HTML_PAGE = '<main><h1>Methodology</h1></main>';
const MD_PAGE = '# Methodology\n';

describe('Accept negotiation', () => {
  it.each([
    ['text/markdown, text/html, */*', true],
    ['text/markdown,text/html;q=0.9,application/xhtml+xml;q=0.8,*/*;q=0.5', true],
    ['text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1', true],
    [BROWSER, false],
    ['*/*', false],
    ['text/plain', false],
    ['', false],
    [undefined, false],
    ['text/markdown;q=0', false],
    ['text/html, text/markdown;q=0.5', false],
    ['TEXT/X-MARKDOWN; Q=0.8, application/xhtml+xml;q=0.5', true],
    ['text/markdown;q=nope', false],
  ])('prefersMarkdown(%s) is %s', (accept, expected) => {
    expect(prefersMarkdown(accept)).toBe(expected);
  });
});

describe('Worker routing', () => {
  function setup(markdownStatus = 200) {
    const assets = vi.fn(async (request) => {
      const { pathname } = new URL(request.url);
      if (['/how-it-works.md', '/index.md', '/robj3d3%2Blevelsio%2Bmarclou.md'].includes(pathname)) {
        return new Response(markdownStatus === 200 ? MD_PAGE : HTML_PAGE, {
          status: markdownStatus === 'spa' ? 200 : markdownStatus,
          headers: { 'Content-Type': markdownStatus === 200 ? MARKDOWN : 'text/html', ETag: '"asset"' },
        });
      }
      if (['/', '/how-it-works', '/robj3d3%2Blevelsio%2Bmarclou'].includes(pathname)) {
        return new Response(HTML_PAGE, {
          headers: { 'Content-Type': 'text/html', Vary: 'Accept-Encoding', Link: '</style.css>; rel="preload"' },
        });
      }
      if (['/sitemap.xml', '/robots.txt', '/llms.txt', '/llms-full.txt', '/_astro/site.css', '/og/default.png', '/report.json', '/report.csv', '/auth/login', '/checkout', '/app', '/dashboard', '/.well-known/search'].includes(pathname)) {
        return new Response('other');
      }
      return new Response(HTML_PAGE, {
        status: markdownStatus === 'spa' ? 200 : 404,
        headers: { 'Content-Type': 'text/html' },
      });
    });
    const request = (path, accept = BROWSER, method = 'GET') =>
      worker.fetch(new Request(new URL(path, SITE), { method, headers: { Accept: accept } }), { ASSETS: { fetch: assets } });
    return { request, assets };
  }

  it.each(['/how-it-works.md', '/how-it-works/index.md', '/how-it-works', '/how-it-works/'])(
    'serves the same Markdown at %s', async (path) => {
      const { request } = setup();
      const explicit = path.endsWith('.md');
      const response = await request(path, explicit ? BROWSER : MARKDOWN);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(MD_PAGE);
      expect(response.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
      expect(response.headers.get('Vary')).toBe('Accept');
      expect(response.headers.get('Link')).toBe('<https://gitracer.io/how-it-works>; rel="canonical"');
      expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
      expect(response.headers.get('Content-Signal')).toBe('search=yes, ai-input=yes, ai-train=yes');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('ETag')).toBeNull();
      expect(response.headers.get('Cache-Control')).toBe(explicit ? null : 'private, max-age=0');
    },
  );

  it('preserves browser HTML, existing headers and both home discovery links', async () => {
    const { request } = setup();
    const response = await request('/');
    expect(await response.text()).toBe(HTML_PAGE);
    expect(response.headers.get('Content-Type')).toBe('text/html');
    expect(response.headers.get('Vary')).toBe('Accept-Encoding, Accept');
    expect(response.headers.get('Link')).toBe(
      '</style.css>; rel="preload", <https://gitracer.io/index.md>; rel="alternate"; type="text/markdown", </llms.txt>; rel="describedby"; type="text/plain"',
    );
    expect(await (await request('/index.md')).text()).toBe(MD_PAGE);
  });

  it.each([[BROWSER, MARKDOWN], [MARKDOWN, BROWSER]])('keeps variants separate for %s then %s', async (...accepts) => {
    const { request } = setup();
    for (const accept of accepts) {
      expect(await (await request('/how-it-works', accept)).text()).toBe(accept === MARKDOWN ? MD_PAGE : HTML_PAGE);
    }
  });

  it.each([
    ['/how-it-works', MARKDOWN], ['/how-it-works', BROWSER], ['/how-it-works.md', BROWSER],
    ['/unknown.md', BROWSER], ['/api/race', MARKDOWN], ['/og/old.png', MARKDOWN],
    ['/Robj3d3%2bLevelsio%2bMarclou/index.md', MARKDOWN],
  ])('matches GET status and headers for HEAD %s', async (path, accept) => {
    const { request } = setup();
    const get = await request(path, accept);
    const head = await request(path, accept, 'HEAD');
    expect(head.status).toBe(get.status);
    expect([...head.headers]).toEqual([...get.headers]);
    expect(await head.text()).toBe('');
  });

  it('preserves canonical race redirects and serves canonical plus-slug assets', async () => {
    const { request } = setup();
    const html = await request('/Robj3d3%2BLevelsio%2BMarclou');
    const markdown = await request('/Robj3d3%2BLevelsio%2BMarclou/index.md?from=agent');
    expect(html.status).toBe(301);
    expect(html.headers.get('Location')).toBe(SITE + '/robj3d3+levelsio+marclou');
    expect(markdown.status).toBe(301);
    expect(markdown.headers.get('Location')).toBe(SITE + '/robj3d3+levelsio+marclou.md?from=agent');
    expect(await (await request('/robj3d3+levelsio+marclou.md')).text()).toBe(MD_PAGE);
    expect(await (await request('/robj3d3+levelsio+marclou', MARKDOWN)).text()).toBe(MD_PAGE);
  });

  it.each([404, 'spa'])('handles missing Markdown with a %s asset fallback', async (fallback) => {
    const { request } = setup(fallback);
    for (const path of ['/unknown.md', '/how-it-works.md', '/404.md']) {
      const response = await request(path);
      expect(response.status).toBe(404);
      expect(response.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
      expect(await response.text()).toMatch(/\]\(\/llms\.txt\).+\]\(\/\)/);
    }
    const negotiated = await request('/how-it-works', MARKDOWN);
    expect(negotiated.status).toBe(200);
    expect(negotiated.headers.get('Content-Type')).toBe('text/html');
    expect(await negotiated.text()).toBe(HTML_PAGE);
  });

  it('leaves non-pages untouched without fetching Markdown assets', async () => {
    const { request, assets } = setup();
    for (const path of ['/sitemap.xml', '/robots.txt', '/llms.txt', '/llms-full.txt', '/_astro/site.css',
      '/og/default.png', '/report.json', '/report.csv', '/auth/login', '/checkout', '/app', '/dashboard', '/.well-known/search', '/404']) {
      const response = await request(path, MARKDOWN);
      expect(response.headers.get('Vary')).toBeNull();
      expect(response.headers.get('Content-Signal')).toBeNull();
      expect(new URL(assets.mock.calls.at(-1)[0].url).pathname).toBe(path);
    }
    for (const path of ['/api/race', '/api/race.md', '/ph/track']) {
      expect((await request(path, MARKDOWN)).status).toBe(410);
    }
  });
});

describe('HTML conversion', () => {
  it('keeps main content, metadata, GFM tables, fenced code and verbatim JSON-LD', () => {
    const schema = '{ "name": "fixture",\n "@type": "WebPage" }';
    const page = convertPage(`<!doctype html><html><head>
      <title>Test "page"</title><meta property="og:description" content="Description fallback">
      <meta property="og:image" content="/card.png"><meta property="article:modified_time" content="2026-10-20T10:00:00Z">
      <link rel="canonical" href="/test"><script type="application/ld+json">${schema}</script></head>
      <body><header>Site header</header><main><h1>Visible heading</h1><h1>Second heading</h1>
      <nav>Navigation</nav><div hidden>Hidden copy</div><div style="display: none">Inline hidden</div>
      <div aria-hidden="true">ARIA hidden</div><form>Form controls</form><button>Button copy</button>
      <p><em>read</em> <a href="../privacy">Privacy</a> <img src="/photo.png" alt="Photo"><img src="/icon.svg" alt=""></p>
      <table><thead><tr><th>Column</th><th>Value</th></tr></thead><tbody><tr><td>A</td><td>B | C</td></tr></tbody></table>
      <table><tr><td>D</td><td>E</td></tr></table>
      <pre><code class="language-js">const text = 'hi';</code></pre><script type="application/ld+json">{"extra":true}</script>
      </main><footer>Footer copy</footer></body></html>`, SITE);
    const markdown = page.markdown;
    expect(markdown).toMatch(/^---\nagent:\n/);
    expect(markdown).toContain('title: "Test \\"page\\""');
    expect(markdown).toContain('description: "Description fallback"');
    expect(markdown).toContain('image: "https://gitracer.io/card.png"');
    expect(markdown).toContain('url: "https://gitracer.io/test"');
    expect(markdown).toContain('last_updated: "2026-10-20"');
    expect(markdown).toContain('# Visible heading\n\n## Second heading');
    expect(markdown).toContain('_read_ [Privacy](https://gitracer.io/privacy) ![Photo](https://gitracer.io/photo.png)');
    expect(markdown).toContain('| Column | Value |\n| --- | --- |\n| A | B \\| C |');
    expect(markdown).toContain('| --- | --- |\n| D | E |');
    expect(markdown).toContain("```js\nconst text = 'hi';\n```");
    expect(markdown).toContain("```json\n" + schema + "\n```");
    expect(markdown).toMatch(/```json\n\{"extra":true\}\n```\n$/);
    expect(markdown).not.toMatch(/Site header|Navigation|Hidden copy|Inline hidden|ARIA hidden|Form controls|Button copy|icon\.svg|Footer copy|<script/);
  });

  it('skips noindex pages', () => {
    expect(convertPage('<meta name="robots" content="noindex, follow"><link rel="canonical" href="/404">', SITE)).toBeUndefined();
  });
});
