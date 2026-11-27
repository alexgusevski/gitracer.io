export const CONTENT_SIGNAL = 'search=yes, ai-input=yes, ai-train=yes';
export const CORE_PAGES = ['/', '/how-it-works', '/privacy', '/sponsor'];

/** @param {string} pagePath */
export function markdownPath(pagePath) {
  return pagePath === '/' ? '/index.md' : `${pagePath}.md`;
}
