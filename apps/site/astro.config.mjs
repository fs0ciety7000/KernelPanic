import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://kernel.fs0ciety.org',
  output: 'static',
  trailingSlash: 'ignore',
  build: { assets: '_astro' },
  compressHTML: true,
  vite: {
    build: {
      // Never inline fonts as data: URLs — the production CSP only allows font-src 'self'.
      assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
    },
  },
});
