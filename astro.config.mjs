// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://gitracer.io',
  output: 'server',
  adapter: cloudflare({ imageService: 'passthrough' }),
  security: { checkOrigin: true },
  vite: {
    build: { assetsInlineLimit: 0 },
  },
});
