// Проверка фильма на собранном сайте: CHROME=<путь к chrome> node tools/film-check.mjs <ширина>x<высота> <папка для снимков>
// Заводит кнопкой, снимает канвас по кадрам (ход), потом прокручивает к четырём остановкам разбора и снимает экран.
import { chromium } from 'playwright-core'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const [size = '390x844', out = 'film-check'] = process.argv.slice(2); const [vw, vh] = size.split('x').map(Number);
fs.mkdirSync(out, { recursive: true });
const root = path.resolve('dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { let f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0);
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const mobile = vw < 700;
const ctx = await b.newContext({ viewport: { width: vw, height: vh }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: mobile ? 3 : 1 });
const p = await ctx.newPage(); const logs = [], reqs = []; p.on('pageerror', (e) => logs.push(e.message)); p.on('console', (m) => m.type() === 'error' && logs.push(m.text()));
p.on('response', (r) => { if (r.url().includes('/seq/')) reqs.push(r.url().replace(/^.*\/seq\//, '')); });
await p.goto(`http://127.0.0.1:${srv.address().port}/`); await p.waitForTimeout(6000);
const res = { size, canvas: await p.evaluate(() => { const c = document.querySelector('.bild canvas'); return [c.width, c.height, c.clientWidth]; }), hd: reqs.some((r) => r.startsWith('hd/')), loaded: reqs.length };
const grab = async (name) => fs.writeFileSync(path.join(out, name + '.png'), Buffer.from((await p.evaluate(() => document.querySelector('.bild canvas').toDataURL('image/png'))).split(',')[1], 'base64'));
await grab('00_still');
const k = p.locator('[data-wind]'); const bb = await k.boundingBox();
await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down();
for (let i = 0; i < 6; i++) { await p.waitForTimeout(140); await grab('01_wind_' + i); }
await p.waitForTimeout(1500); res.reserve = await p.textContent('[data-reserve]'); await p.mouse.up(); await p.waitForTimeout(900);
res.status = await p.textContent('[data-status]');
for (let i = 0; i < 8; i++) { await grab('02_run_' + i); await p.waitForTimeout(125); }
await p.screenshot({ path: path.join(out, '03_hero.png') });
for (const [i, t] of [0.2, 0.45, 0.7, 0.95].entries()) {
  await p.evaluate((t) => { const f = document.querySelector('.film'); scrollTo(0, f.offsetTop + (0.05 + 0.83 * t) * (f.offsetHeight - innerHeight)); }, t);
  await p.waitForTimeout(1600);
  res['station' + (i + 1)] = await p.evaluate(() => [...document.querySelectorAll('[data-station].ist-da h2')].map((e) => e.textContent).join());
  await p.screenshot({ path: path.join(out, `04_station_${i + 1}.png`) });
}
await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(1200); await grab('05_back');
res.logs = logs; console.log(JSON.stringify(res, null, 1)); await b.close(); srv.close();
