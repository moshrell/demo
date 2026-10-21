// Liest das Manifest von scripts/images.mjs (zur Build-Zeit). Fehlt ein Foto → null.
import { existsSync, readFileSync } from 'node:fs';
export type Img = { w: number; h: number; src: string; srcset: string };
export function img(name: string): Img | null {
  const p = 'public/img/opt/manifest.json';
  if (!existsSync(p)) return null;
  const m = JSON.parse(readFileSync(p, 'utf8'))[name.replace(/\.(jpe?g|png|webp)$/i, '')];
  if (!m) return null;
  const base = import.meta.env.BASE_URL;
  return {
    w: m.w, h: m.h,
    src: `${base}img/opt/${m.variants[Math.min(1, m.variants.length - 1)].file}`,
    srcset: m.variants.map((v: { w: number; file: string }) => `${base}img/opt/${v.file} ${v.w}w`).join(', '),
  };
}
