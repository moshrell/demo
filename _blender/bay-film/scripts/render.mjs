// render.mjs — офлайн-рендер и проверки.
//   node scripts/render.mjs check
//   node scripts/render.mjs video [--scale 0.6667] [--out out/bay-part1.mp4] [--from 0] [--to 8]
//   node scripts/render.mjs sheet [--n 16] [--cols 4] [--out out/sheet.png]
//   node scripts/render.mjs still --t 3.2 [--scale 0.5] [--out out/still.png]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const mode = args[0];
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const scale = parseFloat(opt('scale', '0.6667'));

const browser = await chromium.launch({ args: ['--disable-gpu', '--force-color-profile=srgb'] });
const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('file://' + path.join(root, 'index.html') + '?t=0&scale=' + scale);
await page.waitForFunction(() => window.Film && window.__setT);

const FPS = await page.evaluate(() => Film.FPS);
const DUR = await page.evaluate(() => Film.DURATION);
const subFor = (t) => (t >= 3.8 ? 4 : 1);

async function frameBuf(t) {
  const data = await page.evaluate(({ t, sub }) => {
    const cv = document.getElementById('c');
    Film.render(cv, t, { scale: cv.width / Film.W, sub, shutter: 0.8 / Film.FPS });
    return cv.toDataURL('image/png');
  }, { t, sub: subFor(t) });
  return Buffer.from(data.split(',')[1], 'base64');
}

function ffmpeg(argv) {
  return new Promise((res, rej) => {
    const p = spawn('ffmpeg', argv, { stdio: ['pipe', 'inherit', 'inherit'] });
    p.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c))));
    res.p = p;
  });
}

async function main() {
  fs.mkdirSync(path.join(root, 'out'), { recursive: true });

  if (mode === 'still') {
    const t = parseFloat(opt('t', '0'));
    const out = path.resolve(root, opt('out', `out/still_${t.toFixed(2)}.png`));
    fs.writeFileSync(out, await frameBuf(t)); console.log('wrote', out);
  }

  if (mode === 'video') {
    const from = parseFloat(opt('from', '0')), to = parseFloat(opt('to', String(DUR)));
    const out = path.resolve(root, opt('out', 'out/bay.mp4'));
    const n = Math.round((to - from) * FPS);
    const p = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((res, rej) => p.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
    for (let i = 0; i < n; i++) {
      const buf = await frameBuf(from + i / FPS);
      if (!p.stdin.write(buf)) await new Promise((r) => p.stdin.once('drain', r));
      if (i % 30 === 0) console.log('frame', i, '/', n);
    }
    p.stdin.end(); await done; console.log('wrote', out);
  }

  if (mode === 'sheet') {
    const nf = parseInt(opt('n', '16')), cols = parseInt(opt('cols', '4'));
    const out = path.resolve(root, opt('out', 'out/sheet.png'));
    const tmp = fs.mkdtempSync(path.join(root, 'out', 'tmp_'));
    for (let i = 0; i < nf; i++) {
      const t = (DUR * (i + 0.5)) / nf;
      fs.writeFileSync(path.join(tmp, `f${String(i).padStart(3, '0')}.png`), await frameBuf(t));
    }
    const rows = Math.ceil(nf / cols);
    await new Promise((res, rej) => {
      const p = spawn('ffmpeg', ['-y', '-framerate', '1', '-i', path.join(tmp, 'f%03d.png'), '-vf', `scale=270:-1,tile=${cols}x${rows}:padding=6:color=0x222222`, '-frames:v', '1', out], { stdio: 'inherit' });
      p.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c))));
    });
    fs.rmSync(tmp, { recursive: true, force: true }); console.log('wrote', out);
  }

  if (mode === 'check') {
    // числовые проверки (без просмотра картинок)
    const res = await page.evaluate(({ FPS, DUR }) => {
      const out = { frames: 0, nan: 0, penOut: 0, ink: [], car: [], pen: [] };
      const cv = document.createElement('canvas'); cv.width = 270; cv.height = 480;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      const paper = [0xEC, 0xE8, 0xDF];
      const n = Math.round(DUR * FPS);
      for (let i = 0; i <= n; i++) {
        const t = Math.min(DUR, i / FPS);
        const d = Film.debug(t);
        if (![d.cam.s, d.cam.cx, d.cam.cy, d.car.x, d.car.pitch, d.pen[0], d.pen[1]].every(Number.isFinite)) out.nan++;
        if (d.pen[0] < -5 || d.pen[0] > 1085 || d.pen[1] < -5 || d.pen[1] > 1925) out.penOut++;
        if (i % 15 === 0) {
          Film.render(cv, t, { scale: 0.25, sub: 1 });
          const px = ctx.getImageData(0, 0, 270, 480).data; let nonPaper = 0, mag = 0;
          for (let k = 0; k < px.length; k += 4) {
            const dd = Math.abs(px[k] - paper[0]) + Math.abs(px[k + 1] - paper[1]) + Math.abs(px[k + 2] - paper[2]);
            if (dd > 60) nonPaper++;
            if (px[k] > 200 && px[k + 1] < 110 && px[k + 2] < 160) mag++;
          }
          out.ink.push([+t.toFixed(2), +(nonPaper / (270 * 480) * 100).toFixed(2), mag]);
        }
        if (i % 30 === 0) out.car.push([+t.toFixed(2), +d.car.x.toFixed(1), +d.cam.s.toFixed(3), +(d.car.pitch * 57.3).toFixed(2)]);
        out.frames++;
      }
      return out;
    }, { FPS, DUR });
    console.log('frames', res.frames, 'NaN', res.nan, 'penOut', res.penOut);
    console.log('t, ink%, thread-px:', JSON.stringify(res.ink));
    console.log('t, carX, zoom, pitch°:', JSON.stringify(res.car));
    // утверждения
    const fail = [];
    if (res.nan) fail.push('NaN в состоянии');
    if (res.penOut) fail.push('перо вышло за кадр: ' + res.penOut);
    const ink = Object.fromEntries(res.ink.map((r) => [r[0], r[1]]));
    if (!(ink[0] < 1.5)) fail.push('кадр 0 не пуст (ink ' + ink[0] + '%)');
    if (!(ink[4] > ink[1])) fail.push('рисунок не растёт к такту 3');
    const lastCar = res.car[res.car.length - 1];
    if (Math.abs(lastCar[1] - 1150) > 1) fail.push('машина не припарковалась: ' + lastCar[1]);
    if (errors.length) fail.push(...errors);
    console.log(fail.length ? 'FAIL:\n - ' + fail.join('\n - ') : 'CHECK OK');
    process.exitCode = fail.length ? 1 : 0;
  }
}

try { await main(); } finally { await browser.close(); }
