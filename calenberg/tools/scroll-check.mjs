// Плавность скролл-разбора: медленный палец (3 px за шаг) должен менять картинку почти на каждом шаге, без скачков.
// node tools/scroll-check.mjs [WxH]   (после DEMO_BASE=/ npx astro build)
import {chromium} from 'playwright-core'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const [W, H] = (process.argv[2] || '390x844').split('x').map(Number); const root = path.resolve('dist');
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'};
const srv = http.createServer((q, r) => { let f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, {'content-type': mime[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(r); }).listen(0);
const b = await chromium.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
const p = await (await b.newContext({viewport: {width: W, height: H}, hasTouch: true, isMobile: W < 700})).newPage();
await p.goto(`http://127.0.0.1:${srv.address().port}/`); await p.waitForTimeout(6000);
const sample = () => p.evaluate(() => { const c = document.querySelector('.bild canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const o = []; for (let i = 0; i < d.length; i += 4 * 997) o.push(d[i]); return o; });
const diff = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
let prev = await sample(), changed = 0, steps = 0, max = 0; const ds = [];
for (let y = 60; y < 60 + 3 * 220; y += 3) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(34); const s = await sample(); const d = diff(prev, s); ds.push(d); if (d > 0) changed++; max = Math.max(max, d); steps++; prev = s; }
const sorted = [...ds].sort((a, b) => a - b), med = sorted[sorted.length >> 1];
console.log(JSON.stringify({view: `${W}x${H}`, slowSteps: steps, stepsWithChange: changed, medianDiff: +med.toFixed(3), maxDiff: +max.toFixed(3), jumpRatio: +(max / (med || 1)).toFixed(1)}));
// быстрый бросок: от начала к 80 % плёнки, смотрим, что кадр доезжает плавно (много промежуточных состояний)
const span = await p.evaluate(() => document.querySelector('.film').offsetHeight - innerHeight);
await p.evaluate((y) => scrollTo(0, y), Math.round(span * 0.8)); let mids = 0; prev = await sample();
for (let i = 0; i < 20; i++) { await p.waitForTimeout(30); const s = await sample(); if (diff(prev, s) > 0) mids++; prev = s; }
console.log(JSON.stringify({flickIntermediateFrames: mids}));
await b.close(); srv.close();
