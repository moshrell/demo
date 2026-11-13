// @ts-check
import { defineConfig } from 'astro/config';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';

// Живая примерка: движок MediaPipe (WASM, ~15 МБ) не хранится в репозитории, а копируется из node_modules в public/mp при каждом запуске.
const mediapipe = {
  name: 'mediapipe-copy',
  hooks: {
    'astro:config:setup': () => {
      mkdirSync('public/mp', { recursive: true });
      for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) {
        const src = `node_modules/@mediapipe/tasks-vision/wasm/${f}`;
        if (existsSync(src)) copyFileSync(src, `public/mp/${f}`);
      }
    },
  },
};

export default defineConfig({
  site: 'https://kravets-webdesign.de',
  base: process.env.DEMO_BASE ?? '/vorschau/dienstleistung/fernpunkt/', // DEMO_BASE задаёт GitHub Actions (GitHub Pages); иначе подпапка портфолио
  trailingSlash: 'always',
  build: { inlineStylesheets: 'auto' },
  vite: { build: { assetsInlineLimit: 0 } }, // без data:-ресурсов: их не пропустит CSP
  integrations: [mediapipe],
});
