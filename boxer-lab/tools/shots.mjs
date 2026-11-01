// Стоп-кадры для цикла проверки. Сначала: DEMO_BASE=/ npx astro build
// node tools/shots.mjs out.png "th:cam,th:cam,..." [cols] [WxH]
import {chromium} from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const [out, spec, colsArg, size = '1280x720'] = process.argv.slice(2);
const [W, H] = size.split('x').map(Number);
const shots = spec.split(',').map((s) => { const [th, cam] = s.split(':'); return {th: +th, cam: cam || 'hero'}; });
const root = path.resolve('dist');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css'};
const srv = http.createServer((q, r) => {
  let f = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, {'content-type': types[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(r);
}).listen(0);
const port = srv.address().port;
const browser = await chromium.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const page = await browser.newPage({viewport: {width: W, height: H}});
const logs = [];
page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
await page.addInitScript(() => { window.__still = true; });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction('window.__ready === true', null, {timeout: 120000});
const tmp = [];
for (const [i, s] of shots.entries()) {
  await page.evaluate((st) => window.__shot(st), s);
  await page.waitForTimeout(150);
  const f = `/tmp/_shot_${i}.png`; await page.screenshot({path: f}); tmp.push(f);
}
await browser.close(); srv.close();
if (logs.length) console.log(logs.slice(0, 12).join('\n'));
if (tmp.length === 1) { fs.copyFileSync(tmp[0], out); console.log('saved', out); process.exit(0); }
const cols = +colsArg || 3;
const filt = tmp.map((_, i) => `[${i}:v]drawtext=text='${shots[i].cam} th=${shots[i].th}':x=12:y=10:fontsize=26:fontcolor=black:box=1:boxcolor=white@0.7[v${i}]`).join(';')
  + ';' + tmp.map((_, i) => `[v${i}]`).join('') + `xstack=inputs=${tmp.length}:layout=` + tmp.map((_, i) => `${(i % cols) * W}_${Math.floor(i / cols) * H}`).join('|') + '[o]';
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...tmp.flatMap((f) => ['-i', f]), '-filter_complex', filt, '-map', '[o]', '-frames:v', '1', out]);
console.log('saved', out, tmp.length, 'tiles');
