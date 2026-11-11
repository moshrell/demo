// Bilder: public/img/<name>.webp (voll) + <name>-s.webp (halbe Breite). Fehlt ein Bild, wird der Block weggelassen (keine Platzhalter).
import fs from 'node:fs';
import path from 'node:path';
const base = import.meta.env.BASE_URL;
const dir = path.join(process.cwd(), 'public', 'img');
export const has = (name: string) => fs.existsSync(path.join(dir, `${name}.webp`));
export const src = (name: string) => `${base}img/${name}.webp`;
/** portrait: 896×1200, landscape: 1200×896 (Gemini 3:4 / 4:3) */
export const srcset = (name: string, portrait = true) =>
  `${base}img/${name}-s.webp ${portrait ? 448 : 600}w, ${base}img/${name}.webp ${portrait ? 896 : 1200}w`;
export const dims = (portrait = true) => (portrait ? { width: 896, height: 1200 } : { width: 1200, height: 896 });
