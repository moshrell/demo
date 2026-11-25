// Alle Bilder in dist/media: laden, Maße plausibel, nicht schwarz/leer. Aufruf: node tests/media.cjs (Server csp-serve.cjs auf :4400, vorher npm run build)
const fs = require('fs'), path = require('path');
const { launch, open, ok, done } = require('./lib.cjs');
const root = path.join(__dirname, '..', 'dist', 'media');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(root).filter((f) => /\.(webp|png|jpe?g)$/.test(f)).map((f) => path.relative(root, f).split(path.sep).join('/'));
(async () => {
  const b = await launch(); const page = await open(b, { w: 390, h: 844 });
  const res = await page.evaluate(async (list) => {
    const out = [];
    for (const f of list) {
      try {
        const bm = await createImageBitmap(await (await fetch('/vorschau/auto/glanzleistung/media/' + f)).blob());
        const c = document.createElement('canvas'); c.width = 32; c.height = 32; const x = c.getContext('2d'); x.drawImage(bm, 0, 0, 32, 32);
        const d = x.getImageData(0, 0, 32, 32).data; let s = 0, a = 0; for (let i = 0; i < d.length; i += 4) { s += d[i] + d[i + 1] + d[i + 2]; a += d[i + 3]; }
        out.push({ f, w: bm.width, h: bm.height, luma: s / (d.length / 4) / 3, alpha: a / (d.length / 4) });
      } catch (e) { out.push({ f, err: String(e) }); }
    }
    return out;
  }, files);
  for (const r of res) {
    if (r.err) { ok(false, r.f + ' lädt nicht ' + r.err); continue; }
    const isMask = /(^|\/)zone-/.test(r.f);
    ok(r.w >= 64 && r.h >= 64 && (isMask || r.luma > 6 || r.alpha < 250 && false), `${r.f} ${r.w}x${r.h} Helligkeit ${r.luma.toFixed(0)}`);
  }
  // Folienrender je Gerät: gleiche Maße pro Satz
  for (const set of ['wrap/m', 'wrap/d']) {
    const dims = new Set(res.filter((r) => r.f.startsWith(set + '/')).map((r) => r.w + 'x' + r.h));
    const kinds = new Set(res.filter((r) => r.f.startsWith(set + '/')).map((r) => r.f.split('/')[2].split('-')[0]));
    ok(res.filter((r) => r.f.startsWith(set + '/')).length === 48, `${set}: 48 Bilder (8 Farben × 3 Finish × Box+Haube)`);
    ok(dims.size <= kinds.size, `${set}: einheitliche Maße je Art (${[...dims]})`);
  }
  await b.close(); done();
})();
