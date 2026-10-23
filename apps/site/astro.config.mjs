import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://kernel.fsociety.org',
  output: 'static',
  trailingSlash: 'ignore',
  build: { assets: '_astro' },
  compressHTML: true,
});
