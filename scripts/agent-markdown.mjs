import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import domino from '@mixmark-io/domino';
import TurndownService from 'turndown';
import snapshot from '../src/data/snapshot.json' with { type: 'json' };
import { CORE_PAGES, markdownPath } from '../src/lib/page-paths.mjs';

const INSTRUCTIONS = 'Use this search API to find relevant content across this site with keywords or natural-language queries, instead of crawling individual pages. Results are returned in Markdown.';
const SEARCH_DOCS = 'https://developers.cloudflare.com/ai-search/how-to/search-for-agents/';
const EXCLUDED = [
  'nav', 'header', 'footer', 'script', 'style', 'svg', 'canvas', 'template',
  'form', 'button', 'input', 'select', '[hidden]', '[aria-hidden="true"]', '[inert]', '[data-cookie-banner]',
  '.sr-only', '.eyebrow', '.wordmark', '.race-builder', '.race-actions', '.race-list__rank',
  '.race-toolbar label',
].join(', ');

function fenced(text, language) {
  const size = Math.max(2, ...(text.match(/`+/g) ?? []).map((run) => run.length)) + 1;
  const fence = '`'.repeat(size);
  return `${fence}${language}\n${text}${text.endsWith('\n') ? '' : '\n'}${fence}`;
}

const converter = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
// GFM pipe tables. prepareTables() gives every table a header row.
converter.addRule('table', {
  filter: 'table',
  replacement: (content) => `\n\n${content.replace(/\n+/g, '\n').trim()}\n\n`,
});
converter.addRule('tableSection', { filter: ['thead', 'tbody', 'tfoot'], replacement: (content) => content });
converter.addRule('tableRow', {
  filter: 'tr',
  replacement(content, node) {
    const divider = node.parentNode.nodeName === 'THEAD' ? `\n|${' --- |'.repeat(node.cells.length)}` : '';
    return `\n${content}${divider}`;
  },
});
converter.addRule('tableCell', {
  filter: ['th', 'td'],
  replacement(content, node) {
    const cell = content.trim().replace(/\n+/g, ' ').replace(/(?<!\\)\|/g, '\\|');
    return `${node === node.parentNode.firstElementChild ? '|' : ''} ${cell} |`;
  },
});
converter.addRule('fencedCode', {
  filter: 'pre',
  replacement(_content, node) {
    const language = node.querySelector('code')?.className.match(/\blanguage-([\w+-]+)/)?.[1] ?? 'text';
    return `\n\n${fenced(node.textContent, language)}\n\n`;
  },
});

function prepareTables(document, main) {
  for (const table of Array.from(main.querySelectorAll('table'))) {
    const [firstRow] = Array.from(table.rows);
    if (!firstRow?.cells.length) {
      table.parentNode.removeChild(table);
      continue;
    }
    if (table.tHead?.rows.length) continue;
    const head = table.tHead ?? document.createElement('thead');
    if (!head.parentNode) table.insertBefore(head, table.firstChild);
    const cells = Array.from(firstRow.cells);
    if (cells.every((cell) => cell.nodeName === 'TH')) {
      head.appendChild(firstRow);
    } else {
      const header = document.createElement('tr');
      head.appendChild(header);
      for (const _ of cells) header.appendChild(document.createElement('th'));
    }
  }
}

function formatRaceLists(document, main) {
  // Astro uses CSS to separate these inline labels and lay out these lists.
  const labels = '.race-list__meta, .race-list__meta > span, .racer-card__person > span, .racer-card__person small, .racer-card__stats small';
  for (const label of Array.from(main.querySelectorAll(labels))) {
    label.parentNode.insertBefore(document.createTextNode(' '), label);
  }
  for (const element of Array.from(main.querySelectorAll('.race-list, .racer-card__stats'))) {
    const list = document.createElement('ul');
    for (const child of Array.from(element.children)) {
      const item = document.createElement('li');
      item.appendChild(child);
      list.appendChild(item);
    }
    element.parentNode.replaceChild(list, element);
  }
}

export function convertPage(html, site, snapshotDate) {
  const document = domino.createDocument(html);
  const meta = (selector) => document.querySelector(selector)?.getAttribute('content')?.trim();
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
  const robots = meta('meta[name="robots"]')?.toLowerCase().split(/[\s,]+/);
  if (!canonical || robots?.includes('noindex') || robots?.includes('none')) return;

  const url = new URL(canonical, site);
  const pageType = meta('meta[property="og:type"]');
  const title = document.title.trim() || meta('meta[property="og:title"]');
  const description = meta('meta[name="description"]') || meta('meta[property="og:description"]');
  const image = meta('meta[property="og:image"]');
  const lastUpdated = meta('meta[property="article:modified_time"]') ||
    (url.pathname === '/' || pageType === 'profile' ? snapshotDate : undefined);
  const fields = {
    title,
    description,
    image: image && new URL(image, url).href,
    url: url.href,
    last_updated: lastUpdated?.match(/^\d{4}-\d{2}-\d{2}/)?.[0],
  };
  const metadata = Object.entries(fields).filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  const frontMatter = [
    '---',
    'agent:',
    `  instructions: ${JSON.stringify(INSTRUCTIONS)}`,
    `  endpoint: "${url.origin}/.well-known/search?q={query}"`,
    '  method: "GET"',
    `  documentation: "${SEARCH_DOCS}"`,
    ...metadata,
    '---',
  ].join('\n');

  const jsonLd = Array.from(document.querySelectorAll('script[type]'))
    .filter((script) => script.getAttribute('type').trim().toLowerCase() === 'application/ld+json')
    .map((script) => fenced(script.textContent, 'json'));
  const main = document.querySelector('main') ?? document.querySelector('article');
  if (!main) throw new Error(`Missing main content for ${url.href}`);
  for (const node of Array.from(main.querySelectorAll(EXCLUDED))) node.parentNode?.removeChild(node);
  for (const node of Array.from(main.querySelectorAll('[style]'))) {
    if (/(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\s*(?:!important\s*)?(?:;|$)/i.test(node.getAttribute('style'))) {
      node.parentNode?.removeChild(node);
    }
  }
  for (const image of Array.from(main.querySelectorAll('img'))) {
    if (!image.getAttribute('alt')?.trim() || !image.getAttribute('src')) image.parentNode?.removeChild(image);
    else image.setAttribute('src', new URL(image.getAttribute('src'), url).href);
  }
  for (const link of Array.from(main.querySelectorAll('a[href]'))) {
    link.setAttribute('href', new URL(link.getAttribute('href'), url).href);
  }
  formatRaceLists(document, main);
  prepareTables(document, main);
  const [h1, ...otherH1s] = Array.from(main.querySelectorAll('h1'));
  if (!h1?.textContent.trim()) throw new Error(`Missing H1 for ${url.href}`);
  for (const heading of otherH1s) {
    const h2 = document.createElement('h2');
    while (heading.firstChild) h2.appendChild(heading.firstChild);
    heading.parentNode.replaceChild(h2, heading);
  }
  main.insertBefore(h1, main.firstChild);

  const markdown = [
    frontMatter,
    `> Site index for agents: ${url.origin}/llms.txt`,
    converter.turndown(main),
    ...jsonLd,
  ].join('\n\n').replace(/\r\n?/g, '\n') + '\n';
  const header = /^---\n([\s\S]*?)\n---\n/.exec(markdown)?.[1];
  if (!header || !/^title: ".+"$/m.test(header) || !/^url: ".+"$/m.test(header) ||
      /<(?:script|nav|style|html)\b/i.test(markdown)) {
    throw new Error(`Invalid generated Markdown for ${url.href}`);
  }
  return { url, title, description, markdown };
}

export default function agentMarkdown() {
  let site;
  return {
    name: 'agent-markdown',
    hooks: {
      'astro:config:done': ({ config }) => { site = config.site; },
      'astro:build:done': async ({ dir, logger }) => {
        const dist = fileURLToPath(dir);
        const sitemap = await readFile(join(dist, 'sitemap.xml'), 'utf8');
        const sitemapUrls = [...sitemap.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((match) => match[1]);
        const files = (await readdir(dist, { recursive: true, withFileTypes: true }))
          .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
          .map((entry) => relative(dist, join(entry.parentPath, entry.name)).split(sep).join('/'))
          .sort();
        const pages = new Map();
        for (const file of files) {
          const page = convertPage(await readFile(join(dist, file), 'utf8'), site, snapshot.snapshotAt);
          if (!page) continue;
          const pagePath = file === 'index.html' ? '/' : `/${file.slice(0, -5)}`;
          if (page.url.href !== new URL(pagePath, site).href || pages.has(page.url.href)) {
            throw new Error(`Unexpected canonical URL for ${file}: ${page.url.href}`);
          }
          pages.set(page.url.href, page);
        }
        const expected = new Set([...CORE_PAGES, ...snapshot.races.map(({ slug }) => `/${slug}`)]
          .map((path) => new URL(path, site).href));
        for (const url of new Set([...sitemapUrls, ...expected])) {
          if (!pages.has(url)) throw new Error(`Missing Markdown for ${url}`);
        }
        for (const url of pages.keys()) {
          if (!expected.has(url)) throw new Error(`Markdown route is missing from the Worker for ${url}`);
        }

        const core = sitemapUrls.map((url) => pages.get(url));
        const races = [...pages.values()].filter((page) => !sitemapUrls.includes(page.url.href));
        const home = pages.get(new URL('/', site).href);
        const line = ({ title, description, url }) => {
          const label = title.replace(/([\\[\]])/g, '\\$1');
          return `- [${label}](${url.href})${description ? `: ${description.replace(/\s+/g, ' ')}` : ''}`;
        };
        const index = [
          '# GitRacer',
          `> ${home.description.replace(/\s+/g, ' ')}`,
          'Every page is also available as Markdown: request it with `Accept: text/markdown` or add `.md` to the URL.',
          `## Pages\n\n${core.map(line).join('\n')}`,
          `## Saved races\n\n${races.map(line).join('\n')}`,
        ].join('\n\n') + '\n';

        for (const page of pages.values()) {
          await writeFile(join(dist, markdownPath(page.url.pathname).slice(1)), page.markdown, 'utf8');
        }
        await writeFile(join(dist, 'llms.txt'), index, 'utf8');
        await writeFile(join(dist, 'llms-full.txt'), [...core, ...races].map((page) => page.markdown).join('\n---\n\n'), 'utf8');
        logger.info(`Generated Markdown for ${pages.size} pages and checked all ${sitemapUrls.length} sitemap URLs.`);
      },
    },
  };
}
