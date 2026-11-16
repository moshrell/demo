// Вырезать одну область из нескольких кадров и сложить в контактный лист: node tools/crop.mjs <out.jpg> <колонок> x,y,w,h <масштаб> <файлы...>
import sharp from 'sharp';
const [out, cols, rect, scale, ...files] = process.argv.slice(2); const [x, y, w, h] = rect.split(',').map(Number); const C = +cols, k = +scale;
const cw = Math.round(w * k), ch = Math.round(h * k), rows = Math.ceil(files.length / C);
const comp = await Promise.all(files.map(async (f, i) => ({ input: await sharp(f).extract({ left: x, top: y, width: w, height: h }).resize(cw, ch).flatten({ background: '#402030' }).toBuffer(), left: (i % C) * cw, top: Math.floor(i / C) * ch })));
await sharp({ create: { width: C * cw, height: rows * ch, channels: 3, background: '#000' } }).composite(comp).jpeg({ quality: 88 }).toFile(out);
console.log(out, C * cw, rows * ch);
