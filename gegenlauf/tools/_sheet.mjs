import sharp from 'sharp';
import fs from 'node:fs';
const [dir, per] = [process.argv[2], +process.argv[3] || 4];
const files = fs.readdirSync(dir).filter(f => /^\d+\.png$/.test(f)).sort();
for (let i = 0; i < files.length; i += per) {
  const grp = files.slice(i, i + per); const ims = await Promise.all(grp.map(f => sharp(`${dir}/${f}`).toBuffer({resolveWithObject: true})));
  const gap = 8, H = Math.max(...ims.map(x => x.info.height)); const W = ims.reduce((a, x) => a + x.info.width + gap, -gap);
  await sharp({create: {width: W, height: H, channels: 3, background: '#ff00ff'}}).composite(ims.map((x, k) => ({input: x.data, left: ims.slice(0, k).reduce((a, y) => a + y.info.width + gap, 0), top: 0}))).png().toFile(`${dir}/sheet_${String(i / per).padStart(2, '0')}.png`);
}
console.log(files.length);
