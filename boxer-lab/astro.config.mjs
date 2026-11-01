// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://kravets-webdesign.de',
  base: process.env.DEMO_BASE ?? '/vorschau/lab/boxer-lab/', // DEMO_BASE задаёт GitHub Actions (GitHub Pages)
  trailingSlash: 'always',
  vite: { build: { assetsInlineLimit: 0 } },
});
