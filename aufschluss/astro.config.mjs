// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://kravets-webdesign.de',
  base: process.env.DEMO_BASE ?? '/vorschau/handwerk/aufschluss/', // DEMO_BASE задаёт GitHub Actions (GitHub Pages); иначе подпапка портфолио
  trailingSlash: 'always',
  build: { inlineStylesheets: 'auto' },
  vite: { build: { assetsInlineLimit: 0 } }, // без data:-ресурсов: их не пропустит CSP
});
