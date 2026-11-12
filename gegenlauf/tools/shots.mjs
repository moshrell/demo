// Стоп-кадры сцены: контактные листы для самопроверки, постер и кадры запасного режима.
// Сначала: DEMO_BASE=/ npx astro build
//   node tools/shots.mjs sheet out.png '<json: [{label,t,zone,teile,view}]>' [cols] [WxH]
//   node tools/shots.mjs assets            → public/img/szene/*.webp (постер + кадры зон), прозрачный фон
import {chromium} from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';

const [mode, ...rest] = process.argv.slice(2);
const root = path.resolve('dist');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json'};
const srv = http.createServer((q, r) => {
  let f = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, {'content-type': types[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(r);
}).listen(0);
const port = srv.address().port;
const browser = await chromium.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const logs = [];
async function open(W, H, dpr = 1) {
  const page = await browser.newPage({viewport: {width: W, height: H}, deviceScaleFactor: dpr});
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
  await page.goto(`http://127.0.0.1:${port}/studio/?still=1`);
  await page.waitForFunction('window.__ready === true', null, {timeout: 180000});
  return page;
}
const png = async (page, s) => { const info = await page.evaluate((s) => { const i = window.__stage.shot(s); return {i, d: window.__png()}; }, s); return {buf: Buffer.from(info.d.split(',')[1], 'base64'), info: info.i}; };

if (mode === 'sheet') {
  const [out, spec, colsArg, size = '800x500'] = rest; const [W, H] = size.split('x').map(Number);
  const shots = JSON.parse(spec); const page = await open(W, H); const tmp = [];
  for (const [i, s] of shots.entries()) {
    const {buf, info} = await png(page, s);
    const f = `/tmp/_gs_${i}.png`; await sharp(buf).flatten({background: '#131416'}).png().toFile(f); tmp.push(f);
    console.log(s.label || i, JSON.stringify(info));
  }
  const cols = +colsArg || 3;
  if (tmp.length === 1) fs.copyFileSync(tmp[0], out); else {
    const filt = tmp.map((_, i) => `[${i}:v]drawtext=text='${shots[i].label || i}':x=10:y=8:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.55[v${i}]`).join(';')
      + ';' + tmp.map((_, i) => `[v${i}]`).join('') + `xstack=inputs=${tmp.length}:layout=` + tmp.map((_, i) => `${(i % cols) * W}_${Math.floor(i / cols) * H}`).join('|') + '[o]';
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...tmp.flatMap((f) => ['-i', f]), '-filter_complex', filt, '-map', '[o]', '-frames:v', '1', out]);
  }
  console.log('saved', out);
} else if (mode === 'assets') {
  // соотношение 1.6 = A0 в stage.js: <img object-fit: contain> совпадает с живой сценой на любом экране
  const dir = 'public/img/szene'; fs.mkdirSync(dir, {recursive: true});
  const page = await open(1280, 800);
  const list = [['poster', {t: 0}, 1280, 78], ['xray', {t: 1}, 720, 70],
    ...['motor', 'getriebe', 'bremsen', 'fahrwerk', 'abgas', 'elektrik'].map((z) => [z, {t: 1, zone: z}, 720, 70]),
    ...JSON.parse(fs.readFileSync('src/data/betrieb.json', 'utf8')).faelle.map((f) => ['fall-' + f.id, {t: 1, zone: f.zone, teile: f.teile}, 640, 70])];
  for (const [name, s, w, q] of list) {
    const {buf} = await png(page, s);
    let quality = q, out;
    do { out = await sharp(buf).resize(w).webp({quality, alphaQuality: 80, effort: 6}).toBuffer(); quality -= 6; } while (out.length > (name === 'poster' ? 90 : 70) * 1024 && quality > 30);
    fs.writeFileSync(`${dir}/${name}.webp`, out); console.log(name, (out.length / 1024).toFixed(1) + ' KB', 'q', quality + 6);
    if (name === 'poster') await sharp(buf).resize(1200).flatten({background: '#17181a'}).extract({left: 0, top: 60, width: 1200, height: 630}).jpeg({quality: 82}).toFile(`${dir}/og.jpg`);
  }
}
else if (mode === 'page') {
  // node tools/shots.mjs page out.png WxH '<json steps>' [cols] [query]
  // шаг: {label, y (px) | to (селектор), click (селектор), wait (мс), eval (js)} — снимок экрана после шага
  const [out, size, spec, colsArg, query = ''] = rest; const [W, H] = size.split('x').map(Number);
  const mobile = W < 700;
  const ctx = await browser.newContext({viewport: {width: W, height: H}, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile, reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference', javaScriptEnabled: !process.env.NOJS});
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
  await page.goto(`http://127.0.0.1:${port}/${query}`);
  if (!process.env.NOJS) await page.waitForFunction('window.__szeneFertig === true', null, {timeout: 180000});
  await page.waitForTimeout(process.env.NOJS ? 300 : 2200);
  const steps = JSON.parse(spec), tmp = [];
  for (const [i, s] of steps.entries()) {
    if (s.y != null) await page.evaluate((y) => scrollTo({top: y, behavior: 'instant'}), s.y);
    if (s.to) await page.evaluate((q) => document.querySelector(q).scrollIntoView({block: 'start', behavior: 'instant'}), s.to);
    if (s.click) await page.evaluate((q) => document.querySelector(q).click(), s.click);
    if (s.eval) await page.evaluate(s.eval);
    await page.waitForTimeout(s.wait ?? 1400);
    const f = `/tmp/_gp_${i}.png`; await page.screenshot({path: f}); tmp.push(f);
    const m = await page.evaluate(() => ({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, y: Math.round(scrollY), sum: document.querySelector('[data-leiste-summe]')?.textContent, live: document.querySelector('#szene')?.dataset.live}));
    console.log(s.label || i, JSON.stringify(m), m.sw > m.cw ? '!! ГОРИЗОНТАЛЬНАЯ ПРОКРУТКА' : '');
  }
  const cols = +colsArg || steps.length;
  if (tmp.length === 1) fs.copyFileSync(tmp[0], out); else {
    const filt = tmp.map((_, i) => `[${i}:v]drawtext=text='${steps[i].label || i}':x=8:y=6:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6[v${i}]`).join(';')
      + ';' + tmp.map((_, i) => `[v${i}]`).join('') + `xstack=inputs=${tmp.length}:layout=` + tmp.map((_, i) => `${(i % cols) * W}_${Math.floor(i / cols) * H}`).join('|') + '[o]';
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...tmp.flatMap((f) => ['-i', f]), '-filter_complex', filt, '-map', '[o]', '-frames:v', '1', out]);
  }
  console.log('saved', out);
}
await browser.close(); srv.close();
if (logs.length) console.log([...new Set(logs)].slice(0, 15).join('\n'));
