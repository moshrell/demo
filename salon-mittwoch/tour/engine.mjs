// Покадровая съёмка сайта: время страницы виртуальное (Playwright clock + Web Animations),
// поэтому итог ровный 60 fps, даже если один кадр считается секунду. Работает с GPU через настоящий Chrome.
import {chromium} from 'playwright-core';
import {spawn, spawnSync} from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {once} from 'node:events';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);

export const CARD = process.env.MODE === 'card'; // ролик для карточки на /arbeiten: экран ПК 1280×800 → 800×500, без рамки
export const FPS = Number(process.env.FPS || (CARD ? 24 : 60));
export const VW = CARD ? 1280 : 390, VH = CARD ? 800 : 844, DPR = Number(process.env.DPR || (CARD ? 1.5 : 2));
const MAX_FRAMES = Number(process.env.MAX_SECONDS || 0) * FPS;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
export const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  soft: (t) => 0.5 - Math.cos(Math.PI * t) / 2,
  out: (t) => 1 - (1 - t) ** 3,
};

export function ffmpegPath() {
  try { return require('ffmpeg-static'); } catch { return 'ffmpeg'; }
}

// ---------- статический сервер для dist ----------
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.txt': 'text/plain', '.mp4': 'video/mp4', '.webm': 'video/webm'};
export function serve(dir, base) {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.startsWith(base)) p = '/' + p.slice(base.length);
    let f = path.join(dir, p);
    if (!f.startsWith(dir)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f) && !path.extname(f)) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404).end('not found'); return; }
    const ct = MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', size = fs.statSync(f).size;
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || ''); // Range нужен видео: без него перемотка (seek) не работает
    if (m) {
      const a = m[1] ? +m[1] : 0, b = m[2] ? Math.min(+m[2], size - 1) : size - 1;
      res.writeHead(206, {'Content-Type': ct, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': b - a + 1});
      fs.createReadStream(f, {start: a, end: b}).pipe(res); return;
    }
    res.writeHead(200, {'Content-Type': ct, 'Accept-Ranges': 'bytes', 'Content-Length': size});
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({srv, port: srv.address().port})));
}

export async function launch() {
  const args = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-zero-copy',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
  const headless = process.env.HEADLESS === '1';
  if (process.env.CHROME_PATH) return chromium.launch({executablePath: process.env.CHROME_PATH, headless, args});
  for (const channel of [process.env.CHROME_CHANNEL, 'chrome', 'msedge'].filter(Boolean)) {
    try { return await chromium.launch({channel, headless, args}); } catch (e) { console.log(`  (${channel}: ${String(e.message).split('\n')[0]})`); }
  }
  throw new Error('Не нашёл установленный Google Chrome или Edge.');
}

// ---------- код внутри страницы ----------
const PAGE_INIT = () => {
  const mk = (css) => { const d = document.createElement('div'); d.style.cssText = css; return d; };
  const boot = () => {
    if (document.getElementById('__dot')) return;
    const st = document.createElement('style'); st.textContent = '.demo-pill,#skip{display:none!important} html{scrollbar-width:none!important} ::-webkit-scrollbar{display:none!important;width:0!important}'; document.head.append(st); // для ролика: без служебных плашек
    const dot = mk('position:fixed;left:0;top:0;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(255,255,255,.30);border:2px solid rgba(255,255,255,.9);box-shadow:0 3px 14px rgba(0,0,0,.4);pointer-events:none;z-index:2147483647;opacity:0');
    dot.id = '__dot';
    const rip = mk('position:fixed;left:0;top:0;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:2px solid rgba(255,255,255,.9);pointer-events:none;z-index:2147483646;opacity:0');
    rip.id = '__rip';
    document.documentElement.append(rip, dot);
  };
  document.addEventListener('DOMContentLoaded', boot);
  // якорные ссылки не должны прыгать сами: все перемотки делает съёмка
  document.addEventListener('click', (e) => { const a = e.target.closest && e.target.closest('a[href^="#"]'); if (a) e.preventDefault(); }, true);
  const t = new WeakMap();
  window.__tour = {
    ui(s) {
      const dot = document.getElementById('__dot'), rip = document.getElementById('__rip');
      if (!dot) return;
      dot.style.opacity = String(s.op);
      dot.style.transform = `translate(${s.x}px,${s.y}px) scale(${(1 - 0.2 * s.press) * (window.__DOTK || 1)})`;
      rip.style.opacity = String(s.rip > 0 && s.rip < 1 ? 0.7 * (1 - s.rip) : 0);
      rip.style.transform = `translate(${s.x}px,${s.y}px) scale(${(0.6 + 1.6 * s.rip) * (window.__DOTK || 1)})`;
    },
    advance(dt) {
      for (const a of document.getAnimations()) {
        if (a.timeline !== document.timeline) continue; // scroll-driven не трогаем
        if (a.id === '__skip') continue;
        const cur = t.get(a) ?? 0, next = cur + dt;
        t.set(a, next);
        const end = a.effect && a.effect.getComputedTiming().endTime;
        if (isFinite(end) && next >= end) { try { a.finish(); } catch {} }
        else { a.pause(); a.currentTime = next; }
      }
    },
    setValue(sel, v) { const el = document.querySelector(sel); if (!el) return; el.value = v; el.dispatchEvent(new Event('input', {bubbles: true})); },
  };
};

// ---------- режиссёр ----------
export class Tour {
  constructor(page, cdp, ffIn) {
    this.page = page; this.cdp = cdp; this.ff = ffIn;
    this.ui = {x: VW / 2, y: VH + 60, op: 0, press: 0, rip: 1};
    this.sy = 0; this.val = null; this.frames = 0; this.t0 = Date.now(); this.total = 0;
    this.dt = 1000 / FPS;
  }
  get vh() { return VH; }
  async frame() {
    if (MAX_FRAMES && this.frames >= MAX_FRAMES) throw new Error('STOP');
    const a = {ui: this.ui, sy: this.sy, val: this.val, dt: this.dt};
    this.val = null;
    await this.page.evaluate((a) => {
      window.scrollTo({left: 0, top: a.sy, behavior: 'instant'});
      window.__tour.ui(a.ui);
      if (a.val) window.__tour.setValue(a.val.sel, a.val.v);
    }, a);
    await sleep(22); // реальный кадр: события scroll / IntersectionObserver дойдут до скриптов
    await this.page.clock.runFor(this.dt);
    const vp = await this.page.evaluate((dt) => { window.__tour.advance(dt); const v = window.visualViewport; return {x: v.pageLeft, y: v.pageTop, d: window.devicePixelRatio}; }, this.dt);
    const {data} = await this.cdp.send('Page.captureScreenshot', {format: 'jpeg', quality: 92, clip: {x: vp.x, y: vp.y, width: VW, height: VH, scale: DPR}});
    const buf = Buffer.from(data, 'base64');
    if (!this.ff.stdin.write(buf)) await once(this.ff.stdin, 'drain');
    this.frames++;
    if (this.frames % 120 === 0) {
      const el = (Date.now() - this.t0) / 1000;
      console.log(`  кадр ${this.frames} (${(this.frames / FPS).toFixed(1)} с видео), ${(this.frames / el).toFixed(1)} кадр/с съёмки`);
    }
  }
  async anim(sec, fn) {
    const n = Math.max(1, Math.round(sec * FPS));
    for (let i = 1; i <= n; i++) { fn(i / n); await this.frame(); }
  }
  hold(sec) { // на длинных паузах палец плавно исчезает
    const op0 = this.ui.op;
    return this.anim(sec, (t) => { if (sec >= 0.8 && op0 > 0) this.ui.op = Math.max(0, op0 * (1 - t * sec / 0.3)); });
  }
  async waitReady() {
    await this.page.waitForFunction(() => (window.__salon ? window.__salon.ready : true) && document.fonts.status === 'loaded', null, {timeout: 60000});
  }
  async docY(target, offset = 0) {
    if (typeof target === 'number') return target;
    return this.page.evaluate(({s, o}) => {
      const el = document.querySelector(s); if (!el) return null;
      return Math.max(0, Math.min(el.getBoundingClientRect().top + scrollY - o, document.documentElement.scrollHeight - innerHeight));
    }, {s: target, o: offset});
  }
  // плавная прокрутка к позиции/элементу (offset — сколько пикселей оставить сверху)
  async scroll(target, sec, {offset = 0, e = 'soft'} = {}) {
    const y1 = await this.docY(target, offset);
    if (y1 == null) { console.log(`  ! нет элемента ${target}`); return; }
    const y0 = this.sy, op0 = this.ui.op, f = ease[e] || e;
    await this.anim(sec, (t) => { this.sy = lerp(y0, y1, f(t)); this.ui.op = Math.max(0, op0 * (1 - t * sec / 0.25)); });
  }
  // заставка: p — прогресс интро 0..1
  async introY(p) {
    return this.page.evaluate((p) => {
      const intro = document.querySelector('#intro'), pin = document.querySelector('#pin');
      return intro.offsetTop + p * (intro.offsetHeight - pin.clientHeight);
    }, p);
  }
  async intro(p0, p1, sec, e = 'soft') {
    const y0 = await this.introY(p0), y1 = await this.introY(p1), f = ease[e] || e;
    await this.anim(sec, (t) => { this.sy = lerp(y0, y1, f(t)); });
  }
  // прогресс p (0..1) внутри "липкой" секции sel: прокрутка от p0 к p1
  async prog(sel, p0, p1, sec, e = 'soft') {
    const get = (p) => this.page.evaluate(({s, p}) => { const el = document.querySelector(s); if (!el) return null; const top = el.getBoundingClientRect().top + scrollY; return top + p * (el.offsetHeight - innerHeight); }, {s: sel, p});
    const y0 = await get(p0), y1 = await get(p1), f = ease[e] || e;
    if (y0 == null) { console.log(`  ! нет элемента ${sel}`); return; }
    await this.anim(sec, (t) => { this.sy = lerp(y0, y1, f(t)); });
  }
  // перетаскивание: от центра from по точкам pts (каждая {x,y} в px окна или {sel,dx,dy}), sec секунд на весь путь
  async drag(from, pts, sec, {idx = 0, e = 'soft', move = 0.5} = {}) {
    const center = (s, i = 0) => this.page.evaluate(({s, i}) => { const el = document.querySelectorAll(s)[i]; if (!el) return null; const r = el.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height}; }, {s, i});
    const a = await center(from, idx); if (!a) { console.log(`  ! нет элемента ${from}`); return false; }
    const path = [a];
    for (const p of pts) { if (p.sel) { const c = await center(p.sel, p.idx || 0); if (c) path.push({x: c.x + (p.dx || 0), y: c.y + (p.dy || 0)}); } else path.push(p); }
    const u = this.ui; if (u.op === 0) { u.x = a.x; u.y = Math.min(VH + 30, a.y + 160); }
    const sx = u.x, sy = u.y;
    await this.anim(move, (t) => { const f = ease.soft(t); u.x = lerp(sx, a.x, f); u.y = lerp(sy, a.y, f); u.op = Math.min(1, t * 6); });
    await this.page.mouse.move(a.x, a.y); await this.page.mouse.down();
    u.press = 1;
    const n = path.length - 1, f = ease[e] || e;
    await this.anim(sec, (t) => {
      const q = f(t) * n, k = Math.min(n - 1, Math.floor(q)), l = q - k;
      u.x = lerp(path[k].x, path[k + 1].x, l); u.y = lerp(path[k].y, path[k + 1].y, l);
      this.page.mouse.move(u.x, u.y).catch(() => {});
    });
    await this.page.mouse.up(); u.press = 0;
    return true;
  }
  // видео, которое в странице идёт само: ведём по кадрам (seek), rate — скорость (1 = как есть)
  async video(sel, sec, {rate = 1} = {}) {
    await this.page.evaluate((s) => { const v = document.querySelector(s); v.pause(); v.__p = true; }, sel);
    const n = Math.max(1, Math.round(sec * FPS));
    for (let i = 1; i <= n; i++) {
      await this.page.evaluate(({s, t}) => new Promise((res) => {
        const v = document.querySelector(s); if (!v || v.ended) return res();
        const done = () => { v.removeEventListener('seeked', done); res(); };
        v.addEventListener('seeked', done); setTimeout(done, 400);
        v.currentTime = Math.min(t, (v.duration || t) - 0.001);
      }), {s: sel, t: i / FPS * rate});
      await new Promise((r) => setTimeout(r, 90)); // кадр видео должен дойти до композитора
      await this.frame();
    }
  }
  // переход на другую страницу того же демо (путь относительно текущего адреса)
  async go(rel, pause = 0.5) {
    const u = new URL(rel, this.page.url()).href;
    await this.page.goto(u, {waitUntil: 'load'});
    await this.page.waitForFunction(() => document.fonts.status === 'loaded', null, {timeout: 30000}).catch(() => {});
    this.sy = 0; this.ui.op = 0;
    await this.hold(pause);
  }
  // палец: подъехать, нажать, (клик в странице), короткая пауза
  async tap(sel, {idx = 0, move = 0.55, after = 0.45, click = true} = {}) {
    const probe = () => this.page.evaluate(({s, i}) => {
      const el = document.querySelectorAll(s)[i]; if (!el) return null;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return null;
      return {x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom};
    }, {s: sel, i: idx});
    let r = await probe();
    if (!r) { console.log(`  ! нет элемента ${sel}`); return false; }
    if (r.top < 90 || r.bottom > VH - 40) { // не на экране: докрутить так, чтобы был в центре
      await this.scroll(this.sy + r.y - VH * 0.5, 0.7);
      r = await probe();
    }
    const u = this.ui, x0 = u.x, y0 = u.y;
    if (u.op === 0) { u.x = x0; u.y = Math.min(VH + 30, r.y + 160); }
    const sx = u.x, sy = u.y;
    await this.anim(move, (t) => { const f = ease.soft(t); u.x = lerp(sx, r.x, f); u.y = lerp(sy, r.y, f); u.op = Math.min(1, t * 6); });
    await this.anim(0.1, (t) => { u.press = t; });
    if (click) await this.page.evaluate(({s, i}) => document.querySelectorAll(s)[i].click(), {s: sel, i: idx});
    u.rip = 0;
    await this.anim(0.12, (t) => { u.press = 1 - t; u.rip = t * 0.4; });
    await this.anim(after, (t) => { u.rip = 0.4 + t * 0.6; });
    return true;
  }
  async choose(sel, index) { // выпадающий список: показываем выбор, нативное меню не рисуем
    await this.tap(sel, {click: false, after: 0.2});
    await this.page.evaluate(({s, i}) => { const el = document.querySelector(s); el.selectedIndex = i; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }, {s: sel, i: index});
    await this.hold(0.5);
  }
  async type(sel, text, cps = 11) {
    await this.tap(sel, {after: 0.2});
    await this.page.evaluate((s) => document.querySelector(s).focus({preventScroll: true}), sel);
    const n = text.length;
    await this.anim(n / cps, (t) => { this.val = {sel, v: text.slice(0, Math.max(1, Math.round(t * n)))}; });
    await this.hold(0.25);
  }
}

// ---------- запуск съёмки: возвращает путь к «сырому» видео ----------
export async function record({url, outDir, name, scenario, onGpu}) {
  fs.mkdirSync(outDir, {recursive: true});
  const raw = path.join(outDir, CARD ? `${name}.mp4` : `${name}-raw.mp4`);
  const ff = spawn(ffmpegPath(), ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-vf', CARD ? 'scale=1280:800:flags=lanczos' : 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', CARD ? 'slow' : 'veryfast', '-crf', CARD ? '23' : '14', '-pix_fmt', 'yuv420p', '-r', String(FPS), ...(CARD ? ['-movflags', '+faststart', '-an'] : []), raw], {stdio: ['pipe', 'inherit', 'inherit']});
  ff.on('close', (c) => { if (c) { console.log('ffmpeg завершился с ошибкой'); process.exit(1); } });
  const browser = await launch();
  try {
    const ctx = await browser.newContext({viewport: {width: VW, height: VH}, deviceScaleFactor: DPR, isMobile: !CARD, hasTouch: !CARD, locale: 'de-DE', reducedMotion: 'no-preference'});
    const page = await ctx.newPage();
    await page.addInitScript(PAGE_INIT);
    if (CARD) await page.addInitScript(() => { window.__DOTK = 0.55; });
    await page.clock.install();
    page.on('pageerror', (e) => console.log('  [страница] ошибка:', String(e.message).slice(0, 160)));
    const cdp = await ctx.newCDPSession(page);
    await page.goto(url, {waitUntil: 'load'});
    const gpu = await page.evaluate(() => { try { const g = document.createElement('canvas').getContext('webgl2'); const x = g.getExtension('WEBGL_debug_renderer_info'); return g.getParameter(x.UNMASKED_RENDERER_WEBGL); } catch { return 'нет WebGL'; } });
    console.log('Видеокарта в браузере:', gpu);
    if (/swiftshader|basic render|llvmpipe/i.test(gpu)) console.log('  ! Похоже на программный рендер, не на видеокарту. Съёмка пройдёт, но медленно.');
    const tour = new Tour(page, cdp, ff);
    await tour.waitReady();
    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(now + 50);
    try { await scenario(tour); } catch (e) { if (e.message !== 'STOP') throw e; console.log('  (остановлено по MAX_SECONDS)'); }
    ff.stdin.end();
    await once(ff, 'close');
    console.log(`Готово: ${tour.frames} кадров = ${(tour.frames / FPS).toFixed(1)} с видео`);
  } finally { await browser.close(); }
  return raw;
}

// ---------- рамка телефона, фон, форматы ----------
export async function compose({raw, outDir, name, meta}) {
  const browser = await launch();
  const ffm = ffmpegPath();
  const run = (args) => { const r = spawnSync(ffm, ['-nostdin', '-y', '-loglevel', 'error', ...args], {stdio: 'inherit'}); if (r.status !== 0) throw new Error('ffmpeg: ' + args.slice(-1)); };
  const info = spawnSync(ffm, ['-i', raw], {encoding: 'utf8'}).stderr || '';
  const m = info.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const dur = m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0;
  if (!dur) throw new Error('не смог узнать длительность ' + raw);
  const layouts = {
    '16x9': {w: 1920, h: 1080, sw: 444, sx: 1150, sy: 60, r: 56, bz: 16, text: 'left'},
  };
  try {
    for (const [key, L] of Object.entries(layouts)) {
      const sh = Math.round(L.sw * 844 / 390);
      const pg = await browser.newPage({viewport: {width: L.w, height: L.h}});
      const caption = L.text === 'left'
        ? `<div style="position:absolute;left:150px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;gap:18px;color:${meta.ink}"><div style="font:600 22px/1 system-ui;letter-spacing:.28em;text-transform:uppercase;opacity:.7">${meta.kicker}</div><div style="font:700 96px/1.02 Georgia,serif;max-width:760px">${meta.title}</div><div style="font:400 30px/1.4 system-ui;opacity:.75;max-width:640px">${meta.sub}</div></div>`
        : `<div style="position:absolute;left:0;right:0;bottom:64px;text-align:center;color:${meta.ink}"><div style="font:700 56px/1.1 Georgia,serif">${meta.title}</div><div style="font:400 26px/1.4 system-ui;opacity:.7;margin-top:10px">${meta.kicker} · ${meta.sub}</div></div>`;
      await pg.setContent(`<body style="margin:0;width:${L.w}px;height:${L.h}px;background:radial-gradient(120% 90% at 70% 20%,${meta.bg1},${meta.bg2});position:relative;overflow:hidden">${caption}</body>`);
      await pg.screenshot({path: path.join(outDir, `.bg-${key}.png`)});
      await pg.setContent(`<body style="margin:0;background:#000"><div style="position:absolute;left:${L.sx}px;top:${L.sy}px;width:${L.sw}px;height:${sh}px;border-radius:${L.r}px;background:#fff"></div></body>`);
      await pg.screenshot({path: path.join(outDir, `.mask-${key}.png`)});
      await pg.setContent(`<body style="margin:0;background:transparent"><div style="position:absolute;left:${L.sx}px;top:${L.sy}px;width:${L.sw}px;height:${sh}px;border-radius:${L.r}px;box-shadow:0 0 0 ${L.bz}px #0b0b0c,0 0 0 ${L.bz + 2}px #3b3b40,0 50px 120px rgba(0,0,0,.55)"><div style="position:absolute;left:50%;top:${Math.round(L.sw * 0.03)}px;width:${Math.round(L.sw * 0.27)}px;height:${Math.round(L.sw * 0.075)}px;margin-left:-${Math.round(L.sw * 0.135)}px;border-radius:99px;background:#050506"></div></div></body>`);
      await pg.screenshot({path: path.join(outDir, `.ring-${key}.png`), omitBackground: true});
      await pg.close();
      const o = path.join(outDir, `${name}-${key}.mp4`);
      const d = (f) => path.join(outDir, f);
      run(['-loop', '1', '-i', d(`.bg-${key}.png`), '-i', raw, '-loop', '1', '-i', d(`.mask-${key}.png`), '-loop', '1', '-i', d(`.ring-${key}.png`),
        '-filter_complex', `[1:v]scale=${L.sw}:${sh}:flags=lanczos,format=rgba[v];` +
          `[2:v]crop=${L.sw}:${sh}:${L.sx}:${L.sy},format=gray[m];[v][m]alphamerge[vm];` +
          `[0:v][vm]overlay=${L.sx}:${L.sy}[a];[a][3:v]overlay=0:0,format=yuv420p[out]`,
        '-map', '[out]', '-t', dur.toFixed(3), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-movflags', '+faststart', o]);
      if (key === '16x9') run(['-i', o, '-vf', 'select=eq(n\\,' + Math.round(FPS * (meta.posterAt ?? 14)) + ')', '-frames:v', '1', '-q:v', '2', d(`${name}-poster.jpg`)]);
      for (const f of ['.bg-', '.mask-', '.ring-']) fs.rmSync(d(`${f}${key}.png`), {force: true});
    }
    // контактный лист для проверки: кадр каждые 4 секунды
    run(['-i', raw, '-vf', 'fps=1/4,scale=200:-1,tile=8x3', '-frames:v', '1', '-q:v', '3', path.join(outDir, `${name}-contact.jpg`)]);
  } finally { await browser.close(); }
}
