// Превью-видео для портфолио (16:9): node tools/preview-video.mjs [out.mp4]   (после DEMO_BASE=/ npx astro build)
// Скролл с остановками: дольше на механизме, быстро на остальном. Нужен playwright-core + chrome + ffmpeg.
import { chromium } from 'playwright-core'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const OUT = path.resolve(process.argv[2] || '/tmp/calenberg-preview.mp4'); const root = path.resolve('dist'); const tmp = '/tmp/cvid'; fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
const srv = http.createServer((q, r) => { let f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0);
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: tmp, size: { width: 1920, height: 1080 } } });
const p = await ctx.newPage(); await p.goto(`http://127.0.0.1:${srv.address().port}/`);
const wait = (ms) => p.waitForTimeout(ms);
const scrollTo = (y, ms) => p.evaluate(([y, ms]) => new Promise((res) => { const y0 = scrollY, t0 = performance.now(); const e = (t) => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; const f = (n) => { const t = Math.min(1, (n - t0) / ms); scrollTo(0, y0 + (y - y0) * e(t)); t < 1 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); }), [y, ms]);
const lin = (y, ms) => p.evaluate(([y, ms]) => new Promise((res) => { const y0 = scrollY, t0 = performance.now(); const f = (n) => { const t = Math.min(1, (n - t0) / ms); scrollTo(0, y0 + (y - y0) * t); t < 1 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); }), [y, ms]);
const top = (sel) => p.evaluate((s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top + scrollY) : 0; }, sel);
await wait(7000);                                    // загрузка (обрежем начало)
const T0 = Date.now();
await wait(3500);                                    // первый экран: часы, цена
const film = await top('.film'), span = await p.evaluate(() => document.querySelector('.film').offsetHeight - innerHeight);
await scrollTo(film, 1800); await wait(4500);        // механизм идёт сам
await lin(film + span, 15000); await wait(800);      // разбор по скроллу
await scrollTo(await top('#daten'), 1800); await wait(500);
await lin((await top('#daten')) + 1500, 5500);       // характеристики
await scrollTo((await top('#finissage')) + 100, 1800);
const lp = await p.$('[data-lupe]'); await wait(600);
for (let i = 0; i <= 80; i++) { const bb = await lp.boundingBox(); await p.mouse.move(bb.x + bb.width * (0.15 + 0.7 * i / 80), bb.y + bb.height * (0.5 + 0.1 * Math.sin(i / 10))); await wait(30); } await wait(600);
await p.mouse.move(5, 5);
await scrollTo((await top('#eins')) + 60, 1800); await wait(900);
for (const t of ['Roségold', 'Waldgrün', 'Cognac']) { const l = p.locator(`label.f__opt:has-text("${t}")`).first(); try { await l.click({ timeout: 4000 }); } catch (e) { console.log('opt', t, e.message.split('\n')[0]); } await wait(1300); }
await scrollTo(await p.evaluate(() => document.documentElement.scrollHeight), 3000); await wait(2200);
const T1 = Date.now();
await ctx.close(); await b.close(); srv.close();
const webm = fs.readdirSync(tmp).find((f) => f.endsWith('.webm'));
execFileSync('ffmpeg', ['-y', '-v', 'error', '-sseof', `-${((T1 - T0) / 1000 + 0.6).toFixed(1)}`, '-i', path.join(tmp, webm), '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', OUT]);
console.log(OUT, ((T1 - T0) / 1000).toFixed(0) + ' s', (fs.statSync(OUT).size / 1e6).toFixed(1) + ' MB');
