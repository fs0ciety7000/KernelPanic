import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    // SPA: the whole OS is client-side. index.html is the fallback for nginx and Tauri.
    adapter: adapter({ fallback: 'index.html', pages: 'build', assets: 'build' }),
    // KP_BASE=/play for the web image (kernel.fs0ciety.org/play/), empty for Tauri.
    paths: { base: process.env.KP_BASE ?? '', relative: true },
  },
};
