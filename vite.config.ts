import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// relative base so the same build works at a domain root or under a sub-path (e.g. github pages)
export default defineConfig({
  base: './',
  // shown in the debug report, so a pasted error can be matched to the build that produced it
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  // maps are published next to the bundle without being linked from it: stack traces from a phone can be
  // turned back into source lines, while the app itself never downloads them (they are not precached)
  build: {
    sourcemap: 'hidden',
  },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Faden',
        short_name: 'Faden',
        description: 'Read books one word at a time, offline.',
        lang: 'en',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0F141B',
        theme_color: '#0F141B',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // the service worker is bundled in a temp folder, so its map would publish the builder's local paths
        sourcemap: false,
        // woff fallbacks are skipped: every target browser takes woff2
        globPatterns: ['**/*.{js,mjs,css,html,woff2,svg,png,ico,webmanifest}'],
        // the pdf.js worker is ~1.3 MB and must be cached for offline pdf import
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
