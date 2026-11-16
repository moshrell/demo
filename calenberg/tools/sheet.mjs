// Контактный лист: node tools/sheet.mjs <out.jpg> <колонок> <ширина ячейки> <файлы...>
import sharp from 'sharp';
const [out, cols, cw, ...files] = process.argv.slice(2); const C = +cols, CW = +cw;
const metas = await Promise.all(files.map((f) => sharp(f).metadata())); const ch = Math.round(CW * metas[0].height / metas[0].width);
const rows = Math.ceil(files.length / C);
const comp = await Promise.all(files.map(async (f, i) => ({ input: await sharp(f).resize(CW, ch, { fit: 'fill' }).flatten({ background: '#203040' }).toBuffer(), left: (i % C) * CW, top: Math.floor(i / C) * ch })));
await sharp({ create: { width: C * CW, height: rows * ch, channels: 3, background: '#000' } }).composite(comp).jpeg({ quality: 86 }).toFile(out);
console.log(out, C * CW, rows * ch);
