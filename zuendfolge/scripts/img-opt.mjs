// Nach dem Build: Fotos in dist/img auf max. 1200 px Breite verkleinern (Originale in public/img bleiben unberührt).
import { readdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
const dir = 'dist/img';
if (!existsSync(dir)) process.exit(0);
let saved = 0;
for (const f of readdirSync(dir).filter((n) => /\.jpe?g$/i.test(n))) {
  const p = join(dir, f);
  const old = statSync(p).size;
  const buf = await sharp(p).rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
  if (buf.length < old) { writeFileSync(p, buf); saved += old - buf.length; }
}
console.log(`[img-opt] ${Math.round(saved / 1024)} KB gespart`);
