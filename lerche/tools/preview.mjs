// Превью-видео 16:9: node tools/preview.mjs <outDir> [fps=24] [WxH=1920x1080] [from=0] [to=конец]
// Куски можно рендерить подряд (from/to в кадрах): перед куском идёт прогрев без снимков, чтобы плавность высоты совпадала.
// Кадры снимаются детерминированно (часы страницы стоят, шагаем по кадрам), потом ffmpeg собирает mp4.
import {chromium} from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const [out, fpsA = '24', sizeA = '1920x1080', fromA = '0', toA] = process.argv.slice(2);
const FPS = Number(fpsA), [W, H] = sizeA.split('x').map(Number), FROM = Number(fromA), TO = toA ? Number(toA) : Infinity;
const root = path.resolve('dist');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml'};
const srv = http.createServer((q, r) => {
  let f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, {'content-type': types[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(r);
}).listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', ...(process.env.GPU ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), '--ignore-gpu-blocklist']});
const ctx = await browser.newContext({viewport: {width: W, height: H}, deviceScaleFactor: 1});
const page = await ctx.newPage();
await page.clock.install();
await page.goto(`http://127.0.0.1:${srv.address().port}/`, {waitUntil: 'load'});
await page.waitForFunction(() => document.querySelector('#sky')?.dataset.live === '1', null, {timeout: 120000});
await page.clock.pauseAt(new Date(Date.now() + 60000));
const g = await page.evaluate(() => { const a = document.querySelector('#ascent'); const r = document.querySelector('#reserve').getBoundingClientRect();
  return {top: a.offsetTop, span: a.offsetHeight - innerHeight, vh: innerHeight, reserve: r.top + scrollY, hours: document.querySelector('#hours').getBoundingClientRect().top + scrollY, max: document.documentElement.scrollHeight - innerHeight}; });
const ascY = (p) => g.top + p * g.span;           // p 0..1 подъём
const postY = (k) => g.top + g.span + k * g.vh;   // k экранов после потолка
// раскадровка: [секунда, scrollY]. Долго на фирменном (подъём, капсула, потолок, взгляд вверх, бронь), быстро между
const K = process.env.CARD ? [   // карточка портфолио: 1280x800, ~14,6 с
  [0, ascY(0)], [1.2, ascY(0)], [3.0, ascY(0.34)], [4.6, ascY(0.5)], [5.2, ascY(0.52)],
  [6.4, ascY(0.667)], [7.6, ascY(0.70)], [9.2, ascY(1)], [10.0, ascY(1)],
  [11.8, postY(1.0)], [12.8, g.reserve - 40], [14.6, g.reserve - 40],
] : [
  [0, ascY(0)], [2.4, ascY(0)],            // старт, заголовок
  [4.6, ascY(0.30)],                       // быстро сквозь облака
  [6.4, ascY(0.34)],                       // завтрак над погодой
  [8.4, ascY(0.50)], [9.8, ascY(0.52)],    // выше самолётов
  [11.2, ascY(0.667)], [13.0, ascY(0.70)],  // капсула и шильдик
  [14.6, ascY(0.97)], [16.4, ascY(1)],     // потолок, шар над кромкой Земли
  [18.6, postY(0.95)], [20.0, postY(1.0)],  // взгляд вверх в звёзды
  [21.2, g.hours - 60],                    // профиль полёта, быстро
  [22.4, g.reserve - 40],                  // бронь
  [27.6, g.reserve - 40],                  // клики: окно, места, итог
  [28.4, g.reserve + 120],
];
const S = process.env.CARD ? 1 : 0.9; K.forEach((k) => { k[0] *= S; });
const T = K[K.length - 1][0], N = Math.min(Math.round(T * FPS), TO);
const ease = (x) => x * x * (3 - 2 * x);
const yAt = (t) => { for (let i = 1; i < K.length; i++) if (t <= K[i][0]) { const [t0, y0] = K[i - 1], [t1, y1] = K[i]; return y0 + (y1 - y0) * ease((t - t0) / (t1 - t0)); } return K[K.length - 1][1]; };
const clicks = process.env.CARD ? [[13.3, '.dawn', 1], [13.9, '.seat', 0]] : [[23.3 * S, '.dawn', 1], [24.6 * S, '.seat', 0], [25.4 * S, '.seat', 3]];
if (FROM === 0) fs.rmSync(out, {recursive: true, force: true}); fs.mkdirSync(out, {recursive: true});
const t0 = Date.now(); const done = new Set();
for (let f = Math.max(0, FROM - 36); f < N; f++) {
  const t = f / FPS;
  for (const [ct, sel, n] of clicks) if (t >= ct && !done.has(sel + n)) { done.add(sel + n); await page.evaluate(([s, n]) => { const e = document.querySelectorAll(s)[n]; e.querySelector('input')?.click(); }, [sel, n]); }
  await page.evaluate((y) => scrollTo(0, y), yAt(t));
  await page.clock.runFor(1000 / FPS);
  if (f >= FROM) await page.screenshot({path: `${out}/f${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92});
  if (f % 30 === 0) console.log('total frames', Math.round(T * FPS), f, '/', N, ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
await browser.close(); srv.close();
