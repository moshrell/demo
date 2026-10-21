// @ts-check
import { defineConfig } from 'astro/config';
import images from './scripts/images.mjs';

export default defineConfig({
  site: 'https://kravets-webdesign.de',
  base: process.env.DEMO_BASE ?? '/vorschau/handwerk/kupferlauf/', // DEMO_BASE задаёт GitHub Actions (GitHub Pages); иначе подпапка портфолио
  trailingSlash: 'always',
  integrations: [images()],
  build: { inlineStylesheets: 'auto' },
  vite: { build: { assetsInlineLimit: 0 } }, // без data:-ресурсов: их не пропустит CSP
});
