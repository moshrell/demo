// @ts-check
import { defineConfig } from 'astro/config';
import { bilder } from './scripts/bilder.mjs';

export default defineConfig({
  site: 'https://kravets-webdesign.de',
  base: process.env.DEMO_BASE ?? '/vorschau/kosmetik/zuckerfaden/', // DEMO_BASE задаёт GitHub Actions (GitHub Pages); иначе подпапка портфолио
  trailingSlash: 'always',
  build: { inlineStylesheets: 'auto' },
  integrations: [bilder()],
  vite: { build: { assetsInlineLimit: 0 } }, // без data:-ресурсов: их не пропустит CSP
});
