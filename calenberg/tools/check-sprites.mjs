// Проверка слоёв: node tools/check-sprites.mjs <база без колёс.png> <t3.png> <f4.png> <эталон с колёсами.png> <out.jpg>
// Складывает базу и спрайты так же, как сайт, и сравнивает с честным рендером.
import sharp from 'sharp';
const [base, t3, f4, real, out] = process.argv.slice(2);
const rd = async (f, ch) => { const { data, info } = await (ch === 4 ? sharp(f).ensureAlpha() : sharp(f).removeAlpha()).raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };
const B = await rd(base, 3), R = await rd(real, 3), W = B.w, H = B.h, comp = Buffer.from(B.data);
for (const s of [t3, f4]) {
  const S = await rd(s, 4); let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0;
  for (let i = 0; i < W * H; i++) { const a = S.data[i * 4 + 3] / 255; if (a > 0.01) { n++; const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } for (let c = 0; c < 3; c++) comp[i * 3 + c] = Math.round(S.data[i * 4 + c] * a + comp[i * 3 + c] * (1 - a)); }
  console.log(s.split('/').pop(), 'альфа-пикселей', n, 'рамка', x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}
let mx = 0, sum = 0, big = 0, bx0 = W, by0 = H, bx1 = 0, by1 = 0; const diff = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H; i++) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(comp[i * 3 + c] - R.data[i * 3 + c])); mx = Math.max(mx, d); sum += d; if (d > 12) { big++; const x = i % W, y = (i / W) | 0; bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); } const v = Math.min(255, d * 6); diff[i * 3] = diff[i * 3 + 1] = diff[i * 3 + 2] = v; }
console.log('разница: макс', mx, 'средняя', (sum / W / H).toFixed(3), 'пикселей >12:', big, 'их рамка', bx0, by0, bx1 - bx0 + 1, by1 - by0 + 1);
const X = 300, Y = 560, w = 600, h = 400;
const crop = (buf) => sharp(buf, { raw: { width: W, height: H, channels: 3 } }).extract({ left: X, top: Y, width: w, height: h }).toBuffer({ resolveWithObject: false });
const parts = await Promise.all([comp, R.data, diff].map(async (b, i) => ({ input: await sharp(await crop(b), { raw: { width: w, height: h, channels: 3 } }).png().toBuffer(), left: i * w, top: 0 })));
await sharp({ create: { width: 3 * w, height: h, channels: 3, background: '#000' } }).composite(parts).jpeg({ quality: 90 }).toFile(out);
