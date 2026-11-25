// Gemeinsame Helfer für die Playwright-Tests (Cloud-Container). Aufruf siehe README.md, Abschnitt Tests.
// Umgebung: HOST (Standard http://127.0.0.1:4400, csp-serve.cjs), PW (Pfad zu playwright), CHROME (Browser-Datei, optional), SHOTS (Ordner für Screenshots, optional)
const fs = require('fs');
function pw() {
  for (const p of [process.env.PW, 'playwright', '/opt/npm-tools/node_modules/playwright']) { if (!p) continue; try { return require(p); } catch {} }
  throw new Error('playwright nicht gefunden (PW=/pfad/zu/playwright setzen)');
}
const BASE = (process.env.HOST || 'http://127.0.0.1:4400') + '/vorschau/auto/glanzleistung/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0, passes = 0;
const ok = (c, m) => { c ? passes++ : fails++; console.log((c ? 'OK   ' : 'FAIL ') + m); return c; };
const done = () => { console.log(`\n${passes} ok, ${fails} fehlgeschlagen`); process.exit(fails ? 1 : 0); };
async function launch() { const { chromium } = pw(); return chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}); }
// Seite im Handy- oder Desktop-Fenster öffnen, Intro überspringen
async function open(browser, { w, h, mobile = w < 700, dpr = 1 }, query = '') {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: dpr });
  const page = await ctx.newPage(); page.setDefaultTimeout(9000); page.errs = [];
  page.on('pageerror', (e) => page.errs.push('PAGEERR ' + e.message));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) page.errs.push(m.text()); });
  page.on('requestfailed', (r) => { if (!/\.mp4/.test(r.url())) page.errs.push('REQFAIL ' + r.url()); });
  page.on('response', (r) => { if (r.status() >= 400) page.errs.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto(BASE + '?gltest=1' + query, { waitUntil: 'load' }); await sleep(700);
  await page.click('[data-intro-skip]'); await sleep(1800);
  return page;
}
// Echte Pixel des Bühnen-Canvas: mittlere Helligkeit, Anteil fast schwarzer Pixel, mittlere Farbe im Ausschnitt (Anteile 0..1)
async function px(page, region = [0, 0, 1, 1]) {
  return page.evaluate((reg) => {
    const cv = document.querySelector('[data-bgcv]'); const W = cv.width, H = cv.height;
    const x0 = Math.floor(reg[0] * W), y0 = Math.floor(reg[1] * H), w = Math.max(1, Math.floor((reg[2] - reg[0]) * W)), h = Math.max(1, Math.floor((reg[3] - reg[1]) * H));
    const t = document.createElement('canvas'); t.width = 48; t.height = Math.max(8, Math.round(48 * h / w)); const c = t.getContext('2d', { willReadFrequently: true });
    c.drawImage(cv, x0, y0, w, h, 0, 0, t.width, t.height);
    const d = c.getImageData(0, 0, t.width, t.height).data; let r = 0, g = 0, b = 0, dark = 0; const n = d.length / 4; const th = [];
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; th.push(d[i], d[i + 1], d[i + 2]); if (d[i] + d[i + 1] + d[i + 2] < 24) dark++; }
    r /= n; g /= n; b /= n;
    return { r, g, b, luma: 0.2126 * r + 0.7152 * g + 0.0722 * b, dark: dark / n, cw: W, ch: H, th };
  }, region);
}
// mittlerer Pixelunterschied zweier Ausschnitte (0..255), erkennt auch Farbwechsel mit gleichem Durchschnitt
const dist = (a, b) => { let s = 0; const n = Math.min(a.th.length, b.th.length); for (let i = 0; i < n; i++) s += Math.abs(a.th[i] - b.th[i]); return s / n; };
// Region des Autos im Box-Bild (Anteile des Canvas) für die Box-Ansicht: aus der Kamera des Bühnen-Objekts
async function carRegion(page) {
  return page.evaluate(() => {
    const { stage, M, G } = window.__gl; const c = stage.cam; const r = stage.frame.getBoundingClientRect();
    const box = G.desk ? [200, 640, 1330, 500] : [90, 1210, 900, 330]; // x, y, w, h im Box-Bild (Auto)
    const x0 = (box[0] * c.s + c.tx) / r.width, y0 = (box[1] * c.s + c.ty) / r.height, x1 = ((box[0] + box[2]) * c.s + c.tx) / r.width, y1 = ((box[1] + box[3]) * c.s + c.ty) / r.height;
    return [Math.max(0, x0), Math.max(0, y0), Math.min(1, x1), Math.min(1, y1)];
  });
}
async function shot(page, name) { if (process.env.SHOTS) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); } }
const settle = async (page, ms = 3200) => { await sleep(ms); await page.evaluate(() => window.__gl.boxes.url); };
module.exports = { BASE, sleep, ok, done, launch, open, px, dist, carRegion, shot, settle };
