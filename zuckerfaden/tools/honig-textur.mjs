// Rechnet die Honig-Texturen EINMAL offline mit dem WebGL-Shader (src/scripts/honig-gl.ts) und legt sie als PNG ab:
//   (PNG danach mit Pillow nach .webp, Qualität 92, umwandeln und die PNG löschen)
//   public/img/honig-leiste.png  (Kapsel für Leiste, Pille, Menüleiste: per border-image gedehnt)
//   public/img/honig-band.png    (Honigkante oben im Hero mit Tropfen, kachelbar in x)
//   public/img/honig-tropfen.png (fallender Tropfen, per CSS bewegt)
// Zur Laufzeit gibt es dadurch kein WebGL mehr (stabil und sparsam auf Handys).
// Aufruf: node tools/honig-textur.mjs   (braucht playwright-core, Node ≥ 22.13, Chrome mit swiftshader)
import {chromium} from 'playwright-core';
import {stripTypeScriptTypes} from 'node:module';
import fs from 'node:fs';
const js = stripTypeScriptTypes(fs.readFileSync('src/scripts/honig-gl.ts', 'utf8')).replace(/^export /gm, '') + '\nwindow.HonigGL = HonigGL;';
const browser = await chromium.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const jobs = [
  { file: 'honig-leiste', w: 480, h: 64, dpr: 3, scene: () => ({ rects: [{x: 0, y: 0, w: 480, h: 64, r: 32}], caps: [], k: 16, shadow: 0, bright: 1.12, abs: 0.5, a0: 0.9 }) },
  { file: 'honig-tropfen', w: 30, h: 46, dpr: 3, scene: () => ({ rects: [], caps: [{x0: 15, y0: 6, r0: 2.4, x1: 15, y1: 30, r1: 11}], k: 10, shadow: 0, bright: 1.2, abs: 0.7, a0: 0.9 }) },
  { file: 'honig-band', w: 1600, h: 320, dpr: 1.5, scene: () => {
    const band = 30, rects = [{x: -60, y: -120, w: 1720, h: 120 + band, r: 28}], caps = [];
    for (let i = 0; i < 24; i++) { const x = (i + 0.5) / 24 * 1600 + Math.sin(i * 2.1) * 16, r = 9 + ((i * 37) % 11); caps.push({x0: x - r, y0: band - 2, r0: r * 0.7, x1: x + r, y1: band - 2 + Math.sin(i) * 3, r1: r * 0.75}); }
    // [x, Länge, Radius]: auf Handybreite (erste 390 px) liegen zwei Tropfen
    for (const [x, L, r] of [[96, 124, 13], [292, 70, 11], [790, 200, 15], [1005, 110, 12], [905, 214, 17], [1100, 84, 11], [1235, 170, 14], [1400, 132, 13], [1540, 80, 11]]) {
      const mid = band + L * 0.5, y1 = band + L;
      caps.push({x0: x, y0: band - 4, r0: r * 0.9, x1: x, y1: mid, r1: Math.max(1.6, r * 0.34)});
      caps.push({x0: x, y0: mid, r0: Math.max(1.6, r * 0.34), x1: x, y1: y1 - r * 0.4, r1: r * 0.85});
      caps.push({x0: x, y0: y1 - r * 0.6, r0: r * 0.8, x1: x, y1: y1, r1: r});
    }
    return { rects, caps, k: 18, shadow: 0, bright: 1.15, abs: 0.6, a0: 0.9 };
  } },
];
for (const j of jobs) {
  const ctx = await browser.newContext({viewport: {width: j.w, height: j.h}, deviceScaleFactor: j.dpr});
  const page = await ctx.newPage();
  await page.setContent(`<body style="margin:0;background:transparent"><canvas id="c" style="display:block;width:${j.w}px;height:${j.h}px"></canvas></body>`);
  await page.addScriptTag({content: js});
  const ok = await page.evaluate(([scene, dpr]) => { const g = new window.HonigGL(document.getElementById('c'), dpr); if (!g.ok) return false; g.draw(scene); return true; }, [j.scene(), j.dpr]);
  if (!ok) throw new Error('WebGL nicht verfügbar');
  fs.writeFileSync(`public/img/${j.file}.png`, await page.screenshot({omitBackground: true, clip: {x: 0, y: 0, width: j.w, height: j.h}}));
  console.log(j.file, fs.statSync(`public/img/${j.file}.png`).size);
  await ctx.close();
}
await browser.close();
