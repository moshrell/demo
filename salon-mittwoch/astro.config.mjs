// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://kravets-webdesign.de',
  base: process.env.DEMO_BASE || '/vorschau/friseur/salon-mittwoch/', // демо лежит в подпапке портфолио
  trailingSlash: 'ignore',
  build: { inlineStylesheets: 'auto' },
  vite: { build: { assetsInlineLimit: 0 } }, // без data:-шрифтов — их не пропустит политика безопасности
});
