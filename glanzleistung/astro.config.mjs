// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://kravets-webdesign.de',
  base: process.env.GL_BASE || '/vorschau/auto/glanzleistung/', // демо лежит в подпапке портфолио
  trailingSlash: 'always',
  build: { inlineStylesheets: 'auto' },
  vite: { build: { assetsInlineLimit: 0 } }, // без data:-ресурсов: их не пропустит CSP
});
