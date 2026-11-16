// Кадры подъёма по станциям: node tools/shots.mjs <WxH> <outDir> [p1,p2,...]  (p = доля подъёма 0..1; значения >1 = экраны после потолка)
import {chromium} from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const [size, out, list = '0,0.167,0.333,0.5,0.667,0.833,1'] = process.argv.slice(2); const [W, H] = size.split('x').map(Number);
const root = path.resolve('dist');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff'};
const srv = http.createServer((q, r) => {
  let f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, {'content-type': types[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(r);
}).listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const ctx = await browser.newContext({viewport: {width: W, height: H}, deviceScaleFactor: Number(process.env.DPR || 1), hasTouch: W < 900, isMobile: W < 900});
const page = await ctx.newPage(); const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
await page.goto(`http://127.0.0.1:${srv.address().port}/`, {waitUntil: 'load'});
await page.waitForFunction(() => ['1', '0'].includes(document.querySelector('#sky')?.dataset.live), null, {timeout: 120000}).catch(() => logs.push('scene not live'));
fs.mkdirSync(out, {recursive: true});
for (const s of list.split(',')) {
  const p = Number(s);
  await page.evaluate((p) => { const a = document.querySelector('#ascent'); const span = a.offsetHeight - innerHeight; scrollTo(0, a.offsetTop + (p <= 1 ? p * span : span + (p - 1) * innerHeight)); }, p);
  await page.waitForTimeout(2600);
  await page.screenshot({path: `${out}/p${s.replace('.', '_')}.png`});
}
console.log(JSON.stringify({live: await page.evaluate(() => document.querySelector('#sky').dataset.live), logs}));
await browser.close(); srv.close();
