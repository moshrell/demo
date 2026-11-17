// PNG-кадры из ../uhren/film.py  ->  public/seq (800x1000) + public/seq/hd (1200x1500) + src/data/seq.json
//   node tools/seq.mjs <папка с PNG> [--only explode,wind,run,f4,t3,rs] [--small <папка с телефонными кадрами разбора>]
//
// Что делает:
//   explode_NNN  полные кадры скролл-разбора. explode_000 = неподвижный кадр, из него вырезаны первые кадры wind и run.
//   wind_NNN     только прямоугольники, где при заводе что-то меняется (остальной кадр = explode_000), склеены в один файл.
//   run_NNN      то же для хода; run_000 = неподвижный кадр, петля = run_001..072.
//   f4, t3, rs   листы спрайтов с прозрачностью: секундное колесо, третье колесо, винт храпового колеса.
// Прямоугольники ищутся сами: по разнице с неподвижным кадром. Их координаты уходят в src/data/seq.json.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2];
const onlyArg = process.argv.indexOf('--only');
const ONLY = onlyArg > 0 ? process.argv[onlyArg + 1].split(',') : null;
const want = (k) => !ONLY || ONLY.includes(k);
const W = 1200, H = 1500, G = 12;                      // G: сетка выравнивания; 12 px в большом размере = 8 px в малом
const TIERS = [{ dir: 'public/seq', k: 2 / 3, q: 74 }, { dir: 'public/seq/hd', k: 1, q: 76 }];   // q: качество webp (подобрано по весу: телефонный набор около 7 МБ)
const N = { wind: 12, run: 73 };                       // число кадров разбора берётся из explode_t.json
const SPR = { f4: { n: 60, cols: 10 }, t3: { n: 150, cols: 15 }, rs: { n: 90, cols: 10 } };
const THR = 7, PAD = 2, FEATHER = 10;
const MAN = 'src/data/seq.json';
const man = fs.existsSync(MAN) ? JSON.parse(fs.readFileSync(MAN, 'utf8')) : {};
man.w = W; man.h = H; man.small = { w: W * 2 / 3, h: H * 2 / 3 }; man.grid = G;
for (const t of TIERS) fs.mkdirSync(t.dir, { recursive: true });

const png = (name) => path.join(SRC, name + '.png');
const nm = (s, i) => `${s}_${String(i).padStart(3, '0')}`;
const raw = async (file, ch = 3) => {
  let im = sharp(file); im = ch === 3 ? im.removeAlpha() : im.ensureAlpha();
  const { data, info } = await im.raw().toBuffer({ resolveWithObject: true });
  if (info.width !== W || info.height !== H) throw new Error(`${file}: ${info.width}x${info.height}, нужно ${W}x${H}`);
  return data;
};
const webp = (buf, w, h, ch, file, k, q) => {
  let im = sharp(buf, { raw: { width: w, height: h, channels: ch } });
  if (k !== 1) im = im.resize(Math.round(w * k), Math.round(h * k), { kernel: 'lanczos3' });
  return im.webp({ quality: q, alphaQuality: 92, effort: 6, smartSubsample: true }).toFile(file);
};
const sizeOf = (dir, prefix) => fs.readdirSync(dir).filter((f) => f.startsWith(prefix)).reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);
const report = (prefix) => console.log(prefix.padEnd(9), TIERS.map((t) => `${t.dir.replace('public/', '')}: ${(sizeOf(t.dir, prefix) / 1024).toFixed(0)} KB`).join('   '));

const still = await raw(png(nm('explode', 0)));

// ---------- полные кадры разбора ----------
// Два набора с разным числом кадров: большой из SRC, телефонный из --small <папка> (PNG 800x1000 или готовые webp).
// Рядом с кадрами лежит explode_t.json из film.py: время плёнки каждого кадра (кадры расставлены по равному изменению картинки).
// Кадр 0 телефона всегда = уменьшенный большой explode_000: из него же вырезаны завод и ход.
if (want('explode')) {
  const table = (dir) => { const f = path.join(dir, 'explode_t.json'); if (!fs.existsSync(f)) throw new Error(`нет ${f}`); const j = JSON.parse(fs.readFileSync(f, 'utf8')); return { n: j.n, t: j.t }; };
  const clean = (dir, n) => { for (const f of fs.readdirSync(dir)) { const m = /^explode_(\d+)\.webp$/.exec(f); if (m && +m[1] >= n) fs.unlinkSync(path.join(dir, f)); } };
  const [small, hd] = TIERS, big = table(SRC), sArg = process.argv.indexOf('--small'), SM = sArg > 0 ? process.argv[sArg + 1] : null;
  for (let i = 0; i < big.n; i++) {
    const b = i === 0 ? still : await raw(png(nm('explode', i)));
    await webp(b, W, H, 3, path.join(hd.dir, nm('explode', i) + '.webp'), hd.k, hd.q - 4);
    if (!SM || i === 0) await webp(b, W, H, 3, path.join(small.dir, nm('explode', i) + '.webp'), small.k, small.q - 4);
  }
  let sm = big;
  if (SM) {
    sm = table(SM); const sw = W * small.k, sh = H * small.k;
    for (let i = 1; i < sm.n; i++) {
      const out = path.join(small.dir, nm('explode', i) + '.webp'), ready = path.join(SM, nm('explode', i) + '.webp');
      if (fs.existsSync(ready)) { fs.copyFileSync(ready, out); continue; }
      const { data, info } = await sharp(path.join(SM, nm('explode', i) + '.png')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      if (info.width !== sw || info.height !== sh) throw new Error(`${SM}/${nm('explode', i)}: ${info.width}x${info.height}, нужно ${sw}x${sh}`);
      await webp(data, sw, sh, 3, out, 1, small.q - 4);
    }
  }
  clean(hd.dir, big.n); clean(small.dir, sm.n);
  man.explode = { hd: big, small: sm }; report('explode_');
}

// ---------- прямоугольники с движением ----------
function rects(frames, label) {
  const gw = W / G, gh = H / G, act = new Uint8Array(gw * gh), peak = new Uint16Array(gw * gh);
  for (const f of frames) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (y * W + x) * 3; const d = Math.max(Math.abs(f[p] - still[p]), Math.abs(f[p + 1] - still[p + 1]), Math.abs(f[p + 2] - still[p + 2]));
    if (d > THR) { const c = ((y / G) | 0) * gw + ((x / G) | 0); act[c] = 1; if (d > peak[c]) peak[c] = d; }
  }
  const seen = new Uint8Array(gw * gh), out = [];
  for (let s = 0; s < gw * gh; s++) {
    if (!act[s] || seen[s]) continue;
    const st = [s]; seen[s] = 1; let x0 = gw, y0 = gh, x1 = 0, y1 = 0, cells = 0, pk = 0;
    while (st.length) {
      const c = st.pop(), cx = c % gw, cy = (c / gw) | 0; cells++; pk = Math.max(pk, peak[c]);
      x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const n = ny * gw + nx; if (act[n] && !seen[n]) { seen[n] = 1; st.push(n); }
      }
    }
    out.push({ x0, y0, x1, y1, cells, pk });
  }
  let rs = out.filter((r) => { const keep = r.cells >= 2 || r.pk > 24; if (!keep) console.log(`  ${label}: отброшено пятно ${r.cells} кл., макс. разница ${r.pk}`); return keep; })
    .map((r) => ({ x0: Math.max(0, r.x0 - PAD), y0: Math.max(0, r.y0 - PAD), x1: Math.min(gw - 1, r.x1 + PAD), y1: Math.min(gh - 1, r.y1 + PAD) }));
  for (let merged = true; merged;) {
    merged = false;
    outer: for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      if (a.x0 <= b.x1 + 1 && b.x0 <= a.x1 + 1 && a.y0 <= b.y1 + 1 && b.y0 <= a.y1 + 1) {
        rs[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }; rs.splice(j, 1); merged = true; break outer;
      }
    }
  }
  let sy = 0;
  return rs.map((r) => { const o = { x: r.x0 * G, y: r.y0 * G, w: (r.x1 - r.x0 + 1) * G, h: (r.y1 - r.y0 + 1) * G, sy }; sy += o.h; return o; });
}
async function patches(seq, first, count) {
  const frames = [];
  for (let i = first; i < count; i++) {          // кадры wind/run считаются только в рамке вокруг движения: вне рамки альфа 0, там берётся неподвижный кадр
    const f4 = await raw(png(nm(seq, i)), 4), f = Buffer.from(still);
    for (let p = 0, q = 0; p < f4.length; p += 4, q += 3) if (f4[p + 3] === 255) { f[q] = f4[p]; f[q + 1] = f4[p + 1]; f[q + 2] = f4[p + 2]; }
    frames.push(f);
  }
  const rs = rects(frames, seq); const aw = Math.max(...rs.map((r) => r.w)), ah = rs.reduce((s, r) => s + r.h, 0);
  console.log(seq, 'прямоугольники:', rs.map((r) => `${r.w}x${r.h}@${r.x},${r.y}`).join('  '), `-> лист ${aw}x${ah}`);
  const build = (f) => {
    const out = Buffer.alloc(aw * ah * 3);
    for (const r of rs) for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const e = Math.min(x, y, r.w - 1 - x, r.h - 1 - y), k = f ? Math.min(1, e / FEATHER) : 0;       // края прямоугольника плавно переходят в неподвижный кадр
      const p = ((r.y + y) * W + r.x + x) * 3, o = ((r.sy + y) * aw + x) * 3;
      for (let c = 0; c < 3; c++) out[o + c] = f ? Math.round(still[p + c] + (f[p + c] - still[p + c]) * k) : still[p + c];
    }
    return out;
  };
  for (let i = 0; i < count; i++) {
    const b = build(i < first ? null : frames[i - first]);
    for (const t of TIERS) await webp(b, aw, ah, 3, path.join(t.dir, nm(seq, i) + '.webp'), t.k, t.q);
  }
  man[seq] = { n: count, rects: rs }; report(seq + '_');
}
if (want('wind')) await patches('wind', 0, N.wind);
if (want('run')) await patches('run', 1, N.run);

// ---------- листы спрайтов ----------
for (const [key, cfg] of Object.entries(SPR)) {
  if (!want(key)) continue;
  const fr = []; for (let i = 0; i < cfg.n; i++) fr.push(await raw(png(nm(key, i)), 4));
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (const f of fr) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (f[(y * W + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  x0 = Math.max(0, Math.floor((x0 - 2) / G) * G); y0 = Math.max(0, Math.floor((y0 - 2) / G) * G);
  const w = Math.min(W, Math.ceil((x1 + 3) / G) * G) - x0, h = Math.min(H, Math.ceil((y1 + 3) / G) * G) - y0, rows = Math.ceil(cfg.n / cfg.cols);
  for (const t of TIERS) {
    const cw = Math.round(w * t.k), ch = Math.round(h * t.k), comp = [];
    for (let i = 0; i < cfg.n; i++) {
      const cell = await sharp(fr[i], { raw: { width: W, height: H, channels: 4 } }).extract({ left: x0, top: y0, width: w, height: h })
        .resize(cw, ch, { kernel: 'lanczos3' }).png().toBuffer();
      comp.push({ input: cell, left: (i % cfg.cols) * cw, top: Math.floor(i / cfg.cols) * ch });
    }
    await sharp({ create: { width: cfg.cols * cw, height: rows * ch, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comp)
      .webp({ quality: t.q + 4, alphaQuality: 92, effort: 6, smartSubsample: true }).toFile(path.join(t.dir, key + '.webp'));
  }
  man[key] = { n: cfg.n, cols: cfg.cols, x: x0, y: y0, w, h };
  console.log(key, `спрайт ${w}x${h}@${x0},${y0}, лист ${cfg.cols * w}x${rows * h}`); report(key + '.');
}

fs.writeFileSync(MAN, JSON.stringify(man, null, 1) + '\n');
const total = (d) => fs.readdirSync(d).filter((f) => f.endsWith('.webp')).reduce((s, f) => s + fs.statSync(path.join(d, f)).size, 0);
console.log('ИТОГО', TIERS.map((t) => `${t.dir.replace('public/', '')}: ${(total(t.dir) / 1048576).toFixed(2)} MB`).join('   '));
