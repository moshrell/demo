// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://kravets-webdesign.de',
  base: process.env.DEMO_BASE || '/vorschau/cafe/artisanal-bakery/', // адрес как у остальных демо в портфолио: /vorschau/<slug>/
  trailingSlash: 'always',
  build: { inlineStylesheets: 'auto' },
  vite: { build: { assetsInlineLimit: 0 } }, // без data:-ресурсов: их не пропустит CSP
});
