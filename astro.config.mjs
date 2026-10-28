// @ts-check
import { defineConfig } from 'astro/config';

// Fully static build: every page is prerendered from the saved snapshot in src/data/snapshot.json.
export default defineConfig({
  site: 'https://gitracer.io',
  output: 'static',
  // `how-it-works.html` and `levelsio+marclou.html`, so URLs keep no trailing slash.
  build: { format: 'file' },
  trailingSlash: 'never',
  vite: {
    build: { assetsInlineLimit: 0 },
  },
});
