// Astro-Integration: wandelt public/img/*.jpg|png (Fotos von Степан aus Gemini) beim Build in
// public/img/opt/<name>-<w>.webp um und schreibt public/img/opt/manifest.json (Breite/Höhe/Varianten).
// Läuft in jedem `astro build`/`astro dev`, also auch auf GitHub Pages. Idempotent: nur wenn Quelle neuer.
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import sharp from 'sharp';

const SRC = 'public/img';
const OUT = 'public/img/opt';
const WIDTHS = [640, 1024, 1600];

export async function optimize() {
  if (!existsSync(SRC)) return {};
  mkdirSync(OUT, { recursive: true });
  const manPath = join(OUT, 'manifest.json');
  const old = existsSync(manPath) ? JSON.parse(readFileSync(manPath, 'utf8')) : {};
  const man = {};
  const files = readdirSync(SRC).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  for (const f of files) {
    const src = join(SRC, f);
    const { name } = parse(f);
    const mtime = statSync(src).mtimeMs;
    const prev = old[name];
    if (prev && prev.mtime === mtime && prev.variants.every((v) => existsSync(join(OUT, v.file)))) { man[name] = prev; continue; }
    const meta = await sharp(src).metadata();
    const variants = [];
    for (const w of WIDTHS) {
      if (w > meta.width && variants.length) break;
      const width = Math.min(w, meta.width);
      const file = `${name}-${width}.webp`;
      await sharp(src).resize({ width }).webp({ quality: 74 }).toFile(join(OUT, file));
      variants.push({ w: width, file });
    }
    man[name] = { w: meta.width, h: meta.height, mtime, variants };
  }
  writeFileSync(manPath, JSON.stringify(man, null, 1));
  console.log(`[images] ${Object.keys(man).length} Fotos → ${OUT}`);
  return man;
}

export default function images() {
  return { name: 'kl-images', hooks: { 'astro:config:setup': async () => { await optimize(); } } };
}
