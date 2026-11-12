// Обход страницы по экранам: скрины каждого вьюпорта сверху вниз + числовые проверки (переполнение, обрезка, зоны нажатия).
// Сначала: DEMO_BASE=/ npx astro build
//   node tools/pagecheck.mjs <WxH> <outDir> [path=/] [live=1]
// Запуск для каждого экрана: 390x844, 360x740, 768x1024, 844x390 (альбомная), 1440x900. Скрины смотреть только если числа чистые, а вид важен.
// Если на странице есть живая сцена: поставить на неё data-live="1" (работает) или "0" (запасной режим) — скрипт дождётся; без неё просто ждёт 2,5 с.
// Нужен пакет: npm i -D playwright-core; браузер: CHROME=/путь/к/chrome (по умолчанию /usr/bin/google-chrome)
import {chromium} from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const [size, out, p = '/', live = '1'] = process.argv.slice(2); const [W, H] = size.split('x').map(Number);
const root = path.resolve('dist');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg'};
const srv = http.createServer((q, r) => {
  let f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, {'content-type': types[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(r);
}).listen(0);
const port = srv.address().port;
const browser = await chromium.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const ctx = await browser.newContext({viewport: {width: W, height: H}, deviceScaleFactor: 1, hasTouch: W < 900, isMobile: W < 900, reducedMotion: live === '0' ? 'reduce' : 'no-preference'});
const page = await ctx.newPage(); const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
await page.goto(`http://127.0.0.1:${port}${p}`, {waitUntil: 'load'});
if (live === '1' && await page.$('[data-live]')) await page.waitForFunction(() => ['1', '0'].includes(document.querySelector('[data-live]')?.dataset.live), null, {timeout: 120000}).catch(() => logs.push('scene did not report live state'));
await page.waitForTimeout(2500);
fs.mkdirSync(out, {recursive: true});
// проверка: повторное открытие после прокрутки начинается сверху
await page.evaluate(() => scrollTo(0, 1500)); await page.waitForTimeout(300); await page.reload({waitUntil: 'load'}); await page.waitForTimeout(1500);
const topAfterReload = await page.evaluate(() => scrollY);
const m = await page.evaluate(() => {
  const de = document.documentElement; const bad = [];
  document.querySelectorAll('a,button,input,select,textarea,label,summary').forEach((e) => { const r = e.getBoundingClientRect(); if (!r.width || !r.height) return; const cs = getComputedStyle(e); if (cs.visibility === 'hidden') return;
    if (r.right > innerWidth + 0.5 || r.left < -0.5) bad.push('off-screen-x:' + (e.textContent || e.id || e.tagName).trim().slice(0, 30) + ' ' + Math.round(r.left) + '..' + Math.round(r.right)); });
  document.querySelectorAll('h1,h2,h3,p,li,span,div,td,th,label').forEach((e) => { if (e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible' && e.clientWidth) bad.push('clipped:' + e.tagName + '.' + e.className + ' ' + (e.textContent || '').trim().slice(0, 30)); });
  return {sw: de.scrollWidth, cw: de.clientWidth, h: de.scrollHeight, bad: bad.slice(0, 25)};
});
await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(400);
let y = 0, i = 0; const step = Math.round(H * 0.85);
while (y < m.h) { await page.evaluate((y) => scrollTo(0, y), y); await page.waitForTimeout(700); await page.screenshot({path: `${out}/${String(i).padStart(2, '0')}.png`}); i++; y += step; if (i > 40) break; }
console.log(JSON.stringify({size, topAfterReload, ...m, shots: i, logs}, null, 1));
await browser.close(); srv.close();
