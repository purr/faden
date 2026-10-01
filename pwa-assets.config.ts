import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// the svg already keeps its content inside the maskable safe zone, so no extra padding
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    apple: { sizes: [180], padding: 0, resizeOptions: { background: '#0F141B' } },
    maskable: { sizes: [512], padding: 0, resizeOptions: { background: '#0F141B' } },
  },
  images: ['public/icon.svg'],
});
