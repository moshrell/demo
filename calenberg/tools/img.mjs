// Кадры из ../uhren/renders -> public/img (webp):  node tools/img.mjs [../uhren/renders]
// Макро: 900 и 1800 для страницы, 3000 для лупы (увеличение 2,4x: на телефоне 390 px * 2,4 * dpr 3 = 2800 px). Вид сверху: 900 и 1500.
import sharp from 'sharp';
import fs from 'node:fs';
const SRC = process.argv[2] || '../uhren/renders';
const JOBS = [['macro_balance', [900, 1800, 3000]], ['macro_train', [900, 1800, 3000]], ['macro_winding', [900, 1800, 3000]], ['top', [900, 1500]]];
for (const [name, sizes] of JOBS) for (const w of sizes) {
  const out = `public/img/${name}-${w}.webp`;
  await sharp(`${SRC}/${name}.png`).resize(w, null, { kernel: 'lanczos3' }).webp({ quality: w >= 3000 ? 78 : 80, effort: 6, smartSubsample: true }).toFile(out);
  console.log(out, (fs.statSync(out).size / 1024).toFixed(0), 'KB');
}
