// Считает точки лица для фото-моделей примерки и пишет src/data/models.json.
// Запуск из папки проекта (после npm install): node tools/landmarks.mjs
// Новая модель: положить public/img/modell-x.webp (анфас, без очков), добавить в LIST ниже, запустить.
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const LIST = [
  { id: 'a', src: 'img/modell-a.webp', alt: 'Modell mit zurückgebundenem Haar, frontal' },
  { id: 'b', src: 'img/modell-b.webp', alt: 'Modell mit kurzem Haar, frontal, Schwarz-Weiß-Foto' },
];
const IDX = [168, 33, 133, 362, 263, 127, 356];
const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.webp': 'image/webp' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end('<!doctype html><title>lm</title>'); }
  const f = u.startsWith('/nm/') ? path.join(root, 'node_modules', u.slice(4)) : path.join(root, 'public', u);
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(0);
const port = srv.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.error('browser:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/`);
const out = await page.evaluate(async ({ LIST, IDX }) => {
  const { FaceLandmarker, FilesetResolver } = await import('/nm/@mediapipe/tasks-vision/vision_bundle.mjs');
  const fs = await FilesetResolver.forVisionTasks('/nm/@mediapipe/tasks-vision/wasm');
  const lm = await FaceLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: '/mp/face_landmarker.task', delegate: 'CPU' }, runningMode: 'IMAGE', numFaces: 1, outputFacialTransformationMatrixes: true });
  const res = [];
  for (const m of LIST) {
    const img = new Image(); img.src = '/' + m.src; await img.decode();
    const r = lm.detect(img);
    if (!r.faceLandmarks.length) { res.push({ ...m, error: 'kein Gesicht' }); continue; }
    const pts = {}; for (const i of IDX) pts['p' + i] = [Math.round(r.faceLandmarks[0][i].x * 1e4) / 1e4, Math.round(r.faceLandmarks[0][i].y * 1e4) / 1e4];
    const d = r.facialTransformationMatrixes[0].data;
    res.push({ ...m, w: img.naturalWidth, h: img.naturalHeight, ...pts, yaw: Math.round(Math.atan2(d[8], d[10]) * 1e3) / 1e3 });
  }
  return res;
}, { LIST, IDX });
await browser.close(); srv.close();
fs.writeFileSync('src/data/models.json', JSON.stringify(out, null, 1) + '\n');
console.log(out);
