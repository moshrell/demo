// Quersteher-Challenge: Draufsicht-Rennen gegen ein Geister-Auto. Wird nur beim Start der Pasterei geladen.
// Steuerung: linke/rechte Bildschirmhälfte halten = lenken, beide = bremsen (danach rückwärts). Gas ist automatisch.
import { buildTrack, makeCones, W, WALL, edge } from './track.js';
import { makeCar, step, DT, P } from './sim.js';
import { GHOST } from './ghost.js';
import { makeCode } from './code.js';

const GHOST_BASE = 1.17;    // Geist-Zeit = Ideal-Runde × Faktor (≈ 29 s); durch Messung mit Bots festgelegt
const EASY_STEP = 0.10;     // jede „Leichter“-Stufe macht den Geist 10 % langsamer
const BEST_KEY = 'gl:qs:best';
const CAR_W = 22.8, CAR_H = 44;
const SILVER = '#aeb3c2';
const BOARDS = [[380, 384, 388], [534, 538, 542]];   // Bremstafeln vor Slalom und Haarnadel (Stützpunkt-Index)
const CAR_COLORS = ['#34416b', '#6b3445', '#3f5f50', '#7d8190', '#6b5a37', '#2a3a5c', '#5a3f66', '#8a6d2f'];

const fmt = (t) => t.toFixed(2).replace('.', ',');
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.error('[quersteher]', e); } };

/* ---------- Geist ---------- */
function ghostAt(t, scale) {
  const d = GHOST.d, n = d.length / 4;
  const f = Math.min(n - 1, Math.max(0, t / scale / GHOST.dt));
  const i = Math.floor(f), j = Math.min(n - 1, i + 1), u = f - i;
  let a = d[j * 4 + 2] - d[i * 4 + 2];
  while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI;
  return { x: d[i * 4] + (d[j * 4] - d[i * 4]) * u, y: d[i * 4 + 1] + (d[j * 4 + 1] - d[i * 4 + 1]) * u, th: d[i * 4 + 2] + a * u, done: f >= n - 1 };
}
// Zeit, zu der der Geist die Strecke `prog` erreicht
function ghostTimeAt(prog, scale) {
  const d = GHOST.d, n = d.length / 4;
  let lo = 0, hi = n - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (d[m * 4 + 3] < prog) lo = m + 1; else hi = m; }
  const i = Math.max(1, lo), p0 = d[(i - 1) * 4 + 3], p1 = d[i * 4 + 3];
  const u = p1 > p0 ? Math.min(1, Math.max(0, (prog - p0) / (p1 - p0))) : 0;
  return ((i - 1 + u) * GHOST.dt) * scale;
}

/* ---------- Auto-Sprite ---------- */
function loadImg(src) {
  return new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
}
function hex(c) { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); const n = parseInt(m ? m[1] : SILVER.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
// Notlösung, bis die Blender-Renderings da sind: Auto aus Formen (Nase oben)
function drawFallback(color) {
  const S = 4, w = Math.round(CAR_W * S), h = Math.round(CAR_H * S);
  const cv = document.createElement('canvas'); cv.width = w + 16; cv.height = h + 16;
  const c = cv.getContext('2d'); c.translate(8, 8);
  c.fillStyle = '#0b0c10';                                      // Räder
  for (const [x, y] of [[-1.5, 7], [w - 7.5, 7], [-1.5, h - 31], [w - 7.5, h - 31]]) { rr(c, x, y, 9, 24, 3); c.fill(); }
  const g = c.createLinearGradient(0, 0, w, 0);
  const [r, gr, b] = hex(color);
  const sh = (k) => `rgb(${Math.min(255, r * k) | 0},${Math.min(255, gr * k) | 0},${Math.min(255, b * k) | 0})`;
  g.addColorStop(0, sh(0.72)); g.addColorStop(0.5, sh(1.12)); g.addColorStop(1, sh(0.72));
  c.fillStyle = g; rr(c, 0, 0, w, h, 18); c.fill();
  c.fillStyle = 'rgba(8,10,16,.88)'; rr(c, w * 0.14, h * 0.22, w * 0.72, h * 0.14, 8); c.fill();            // Frontscheibe
  c.fillStyle = sh(0.9); rr(c, w * 0.16, h * 0.38, w * 0.68, h * 0.26, 6); c.fill();                          // Dach
  c.fillStyle = 'rgba(8,10,16,.88)'; rr(c, w * 0.15, h * 0.66, w * 0.7, h * 0.1, 7); c.fill();               // Heckscheibe
  c.fillStyle = '#fff6d6'; rr(c, w * 0.08, 2, w * 0.2, 7, 3); c.fill(); rr(c, w * 0.72, 2, w * 0.2, 7, 3); c.fill();   // Licht vorn
  c.fillStyle = '#ff3b4d'; rr(c, w * 0.06, h - 9, w * 0.22, 6, 3); c.fill(); rr(c, w * 0.72, h - 9, w * 0.22, 6, 3); c.fill();  // Licht hinten
  return cv;
}
// Echte Renderings: car_base.png (neutral hellgrau) + car_mask.png (weiß = lackierte Fläche); Farbe per Multiplikation
async function carSprite(base, mask, color, ghost) {
  if (base && mask) {
    const w = base.naturalWidth, h = base.naturalHeight;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d'); c.drawImage(base, 0, 0);
    const m = document.createElement('canvas'); m.width = w; m.height = h;
    const mc = m.getContext('2d'); mc.drawImage(mask, 0, 0);
    const id = mc.getImageData(0, 0, w, h), px = id.data, [r, g, b] = hex(color);
    for (let i = 0; i < px.length; i += 4) {
      const a = (px[i] + px[i + 1] + px[i + 2]) / 765 * (px[i + 3] / 255);
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a * 255;
    }
    mc.putImageData(id, 0, 0);
    c.globalCompositeOperation = 'multiply'; c.drawImage(m, 0, 0);
    c.globalCompositeOperation = 'destination-in'; c.drawImage(base, 0, 0);   // Alpha der Silhouette behalten
    if (ghost) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(120,230,255,.55)'; c.fillRect(0, 0, w, h); }
    return cv;
  }
  const cv = drawFallback(ghost ? '#8fe9ff' : color);
  return cv;
}

/* ---------- Hilfs-Sprites ---------- */
function coneSprite(col) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 56;
  const c = cv.getContext('2d'); c.translate(28, 28);
  const main = col ? '#ff4fb8' : '#35f2ff';
  const g = c.createRadialGradient(0, 0, 2, 0, 0, 26); g.addColorStop(0, main + 'aa'); g.addColorStop(1, main + '00');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, 26, 0, 7); c.fill();
  c.fillStyle = main; c.beginPath(); c.arc(0, 0, 11, 0, 7); c.fill();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 5, 0, 7); c.fill();
  return cv;
}
function glowSprite() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,238,200,.55)'); g.addColorStop(0.35, 'rgba(255,226,170,.18)'); g.addColorStop(1, 'rgba(255,220,160,0)');
  c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  return cv;
}

/* ---------- Dekor (feste Zufallswerte, nur Optik) ---------- */
function rng32(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function buildDecor(tr) {
  const rnd = rng32(20261011), N = tr.N;
  const minDist = (x, y) => { let m = 1e9; for (let i = 0; i < N; i += 2) { const p = tr.pts[i], d = Math.hypot(p.x - x, p.y - y); if (d < m) m = d; } return m; };
  const clear = W / 2 + WALL;
  const cars = [], lamps = [], tires = [], stains = [], arrows = [];
  // geparkte Autos in Reihen neben der Strecke
  for (let i = 0; i < N; i += 4) for (const side of [1, -1]) for (const row of [0, 1]) {
    if (rnd() < 0.3) continue;
    const p = tr.pts[i], off = clear + 44 + row * 58;
    const x = p.x + p.nx * side * off, y = p.y + p.ny * side * off;
    if (minDist(x, y) < clear + 30) continue;
    if (cars.some((c) => Math.abs(c.x - x) < 26 && Math.abs(c.y - y) < 26)) continue;
    cars.push({ x, y, a: p.th + (rnd() < 0.5 ? 1 : -1) * Math.PI / 2 + (rnd() - 0.5) * 0.06, c: Math.floor(rnd() * CAR_COLORS.length) });
  }
  // Laternen
  for (let i = 8; i < N; i += 40) { const side = (i / 40 | 0) % 2 ? 1 : -1; const p = tr.pts[i], off = clear + 12; lamps.push({ x: p.x + p.nx * side * off, y: p.y + p.ny * side * off }); }
  // Reifenstapel an den Außenseiten enger Kurven
  for (let i = 0; i < N; i += 2) {
    const k = tr.pts[i].k; if (Math.abs(k) < 1 / 175) continue;
    const side = k > 0 ? -1 : 1, p = tr.pts[i], off = clear - 4;
    tires.push({ x: p.x + p.nx * side * off, y: p.y + p.ny * side * off, w: (i / 2 | 0) % 2 });
  }
  // Ölflecken, Pfützen
  for (let n = 0; n < 46; n++) { const p = tr.pts[Math.floor(rnd() * N)], o = (rnd() - 0.5) * W * 0.7; stains.push({ x: p.x + p.nx * o, y: p.y + p.ny * o, rx: 10 + rnd() * 22, ry: 6 + rnd() * 12, a: rnd() * 3.14, p: rnd() < 0.4 }); }
  // Richtungspfeile auf dem Asphalt
  for (let i = 12; i < N; i += 36) arrows.push(i);
  return { cars, lamps, tires, stains, arrows };
}

/* ---------- Spiel ---------- */
export async function start(opts = {}) {
  const tr = buildTrack();
  const color = opts.color || SILVER;
  const assetBase = opts.assetBase || '';
  const best0 = lsGet(BEST_KEY);

  // Oberfläche
  const dlg = document.createElement('dialog');
  dlg.className = 'qs'; dlg.setAttribute('aria-label', 'Quersteher-Challenge');
  dlg.innerHTML = `
    <canvas class="qs__cv" aria-hidden="true"></canvas>
    <div class="qs__pad" data-pad></div>
    <div class="qs__hud" data-hud hidden>
      <p class="qs__time" data-time>0,00</p>
      <p class="qs__delta" data-delta></p>
      <p class="qs__meta" data-meta></p>
    </div>
    <div class="qs__zones" data-zones hidden aria-hidden="true">
      <span class="qs__zone" data-zl><b>◀</b><i>links lenken</i></span>
      <span class="qs__zone" data-zr><b>▶</b><i>rechts lenken</i></span>
      <span class="qs__brake" data-zb>BREMSE</span>
    </div>
    <button class="qs__x" type="button" data-x aria-label="Spiel schließen">✕</button>
    <p class="qs__count" data-count aria-live="assertive"></p>
    <p class="qs__flash" data-flash aria-live="polite"></p>
    <section class="qs__panel" data-panel aria-live="polite"></section>`;
  document.body.appendChild(dlg);
  const $ = (s) => dlg.querySelector(s);
  const cv = $('.qs__cv'), ctx = cv.getContext('2d'), pad = $('[data-pad]');
  const elHud = $('[data-hud]'), elTime = $('[data-time]'), elDelta = $('[data-delta]'), elMeta = $('[data-meta]');
  const elZones = $('[data-zones]'), zl = $('[data-zl]'), zr = $('[data-zr]'), zb = $('[data-zb]');
  const elCount = $('[data-count]'), elFlash = $('[data-flash]'), panel = $('[data-panel]');
  try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
  window.__qsOpen = true;
  try { history.pushState({ gl: 'qs' }, ''); } catch (e) { console.error('[quersteher]', e); }

  // Assets (optional): Blender-Renderings; ohne sie läuft die Notlösung
  const [baseImg, maskImg] = await Promise.all([loadImg(`${assetBase}car_base.png`), loadImg(`${assetBase}car_mask.png`)]);
  const hasAssets = !!(baseImg && maskImg);
  const sprCar = await carSprite(baseImg, maskImg, color, false);
  const sprGhost = await carSprite(baseImg, maskImg, color, true);
  const sprCone = [coneSprite(0), coneSprite(1)], sprGlow = glowSprite();
  const sprParked = await Promise.all(CAR_COLORS.map((c) => carSprite(baseImg, maskImg, c, false)));
  const decor = buildDecor(tr);

  // Zustand
  const ghostScale = GHOST_BASE;
  let easy = 0, losses = 0;
  let cones, car, state = 'intro', countT = 0, raf = 0, last = 0, acc = 0, camTh = 0, closing = false;
  let marks = [], lastHits = 0, lastWall = false, lastResp = 0, w = 0, h = 0, dpr = 1, flashT = 0, tAll = 0;
  const input = { l: false, r: false };
  const keys = new Set(), ptrs = new Map();
  const ghostTime = () => GHOST.time * ghostScale * (1 + EASY_STEP * easy);
  const gScale = () => ghostScale * (1 + EASY_STEP * easy);

  function reset() {
    cones = makeCones(tr); car = makeCar(tr, cones);
    marks = []; lastHits = 0; lastWall = false; lastResp = 0; acc = 0; camTh = car.th;
  }
  reset();

  /* ----- Größe ----- */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = Math.max(1, pad.clientWidth || window.innerWidth); h = Math.max(1, pad.clientHeight || window.innerHeight);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(pad); resize();

  /* ----- Eingabe ----- */
  function readInput() {
    let l = false, r = false;
    for (const x of ptrs.values()) { if (x < w / 2) l = true; else r = true; }
    if (keys.has('ArrowLeft') || keys.has('a')) l = true;
    if (keys.has('ArrowRight') || keys.has('d')) r = true;
    if (keys.has('ArrowDown') || keys.has('s') || keys.has(' ')) { l = true; r = true; }
    input.l = l; input.r = r;
    zl.classList.toggle('is-on', l && !r); zr.classList.toggle('is-on', r && !l); zb.classList.toggle('is-on', l && r);
  }
  pad.addEventListener('pointerdown', (e) => { if (state === 'intro' || state === 'done') return; try { pad.setPointerCapture(e.pointerId); } catch (e) { console.error('[quersteher]', e); } ptrs.set(e.pointerId, e.clientX - pad.getBoundingClientRect().left); readInput(); e.preventDefault(); });
  pad.addEventListener('pointermove', (e) => { if (ptrs.has(e.pointerId)) { ptrs.set(e.pointerId, e.clientX - pad.getBoundingClientRect().left); readInput(); } });
  const up = (e) => { ptrs.delete(e.pointerId); readInput(); };
  pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up); pad.addEventListener('lostpointercapture', up);
  const onKey = (e, down) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (['ArrowLeft', 'ArrowRight', 'ArrowDown', ' ', 'a', 'd', 's'].includes(k)) { if (down) keys.add(k); else keys.delete(k); readInput(); if (state === 'race' || state === 'count') e.preventDefault(); }
  };
  const kd = (e) => onKey(e, true), ku = (e) => onKey(e, false);
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  const blur = () => { ptrs.clear(); keys.clear(); readInput(); if (state === 'race') pause(); };
  window.addEventListener('blur', blur);
  const vis = () => { if (document.visibilityState === 'hidden' && state === 'race') pause(); };
  document.addEventListener('visibilitychange', vis);

  /* ----- Schließen ----- */
  function teardown() {
    cancelAnimationFrame(raf); ro?.disconnect();
    window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', blur);
    document.removeEventListener('visibilitychange', vis);
    try { dlg.close(); } catch (e) { console.error('[quersteher]', e); }
    dlg.remove();
  }
  let closeP = null;
  function close(viaPop = false) {
    if (closeP) return closeP;
    closing = true; teardown();
    closeP = new Promise((res) => {
      const done = () => { window.__qsOpen = false; opts.onClose?.(); res(); };
      if (viaPop) { done(); return; }
      // eigenen Verlaufseintrag zurücknehmen; __qsOpen bleibt bis zum popstate gesetzt, damit die App nicht mitschließt
      const onPop = () => { window.removeEventListener('popstate', onPop); done(); };
      window.addEventListener('popstate', onPop);
      try { history.back(); } catch { window.removeEventListener('popstate', onPop); done(); return; }
      setTimeout(() => { if (window.__qsOpen) { window.removeEventListener('popstate', onPop); done(); } }, 600);
    });
    return closeP;
  }
  $('[data-x]').addEventListener('click', () => close());
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  const onPopGame = () => { if (!closing) close(true); window.removeEventListener('popstate', onPopGame); };
  window.addEventListener('popstate', onPopGame);

  /* ----- Ablauf ----- */
  function flash(t, ms = 1400) { elFlash.textContent = t; elFlash.classList.add('is-on'); flashT = ms / 1000; }
  function showIntro() {
    state = 'intro'; elHud.hidden = true; elZones.hidden = true;
    const b = lsGet(BEST_KEY);
    panel.hidden = false;
    panel.innerHTML = `
      <h2 class="qs__h">Quersteher-Challenge</h2>
      <p class="qs__lead">Eine Runde auf dem Nachtparkplatz, gegen den Geist. Bist du schneller, bekommst du einen Rabattcode für deinen Auftrag.</p>
      <ul class="qs__how">
        <li><b class="qs__k">◀</b><span>Linke Hälfte halten: nach links lenken</span></li>
        <li><b class="qs__k">▶</b><span>Rechte Hälfte halten: nach rechts lenken</span></li>
        <li><b class="qs__k">◀▶</b><span>Beide halten: bremsen, danach rückwärts</span></li>
      </ul>
      <p class="qs__small">Gas gibt das Auto selbst. Vor engen Kurven bremsen, Hütchen kosten Tempo.</p>
      <div class="qs__btns"><button class="btn" type="button" data-go>Los geht’s</button><button class="btn btn--ghost" type="button" data-cancel>Abbrechen</button></div>
      ${b ? `<p class="qs__small">Deine Bestzeit: <b>${fmt(b.time)} s</b></p>` : ''}`;
    $('[data-go]').addEventListener('click', startCountdown);
    $('[data-cancel]').addEventListener('click', () => close());
    $('[data-go]').focus({ preventScroll: true });
  }
  function startCountdown() {
    reset(); state = 'count'; countT = 0; panel.hidden = true; panel.innerHTML = '';
    elHud.hidden = false; elZones.hidden = false; elTime.textContent = '0,00'; elDelta.textContent = ''; elDelta.className = 'qs__delta'; elMeta.textContent = '';
    elZones.classList.add('is-hint'); setTimeout(() => elZones.classList.remove('is-hint'), 7000);
    elCount.textContent = '3'; elCount.classList.remove('is-go'); elCount.classList.add('is-on');
  }
  function pause() {
    if (state !== 'race') return;
    state = 'pause'; panel.hidden = false;
    panel.innerHTML = `<h2 class="qs__h">Pause</h2><div class="qs__btns"><button class="btn" type="button" data-resume>Weiter</button><button class="btn btn--ghost" type="button" data-cancel>Beenden</button></div>`;
    $('[data-resume]').addEventListener('click', () => { panel.hidden = true; panel.innerHTML = ''; state = 'count'; countT = 1.6; elCount.textContent = '1'; elCount.classList.add('is-on'); });
    $('[data-cancel]').addEventListener('click', () => close());
    $('[data-resume]').focus({ preventScroll: true });
  }
  function finish() {
    state = 'done'; ptrs.clear(); keys.clear(); readInput();
    const t = car.finishT, g = ghostTime(), won = t < g;
    elZones.hidden = true;
    elTime.textContent = fmt(t);
    const b = lsGet(BEST_KEY);
    if (!b || t < b.time) lsSet(BEST_KEY, { time: +t.toFixed(2) });
    panel.hidden = false;
    const pen = car.penalty ? ` (inkl. ${fmt(car.penalty)} s Strafe fürs Zurücksetzen)` : '';
    if (won) {
      const code = makeCode(t);
      panel.innerHTML = `
        <h2 class="qs__h">Geschafft!</h2>
        <p class="qs__lead">Du: <b>${fmt(t)} s</b>${pen}. Der Geist: ${fmt(g)} s.</p>
        <p class="qs__codeLabel">Dein Rabattcode</p>
        <p class="qs__code" data-code>${code}</p>
        <p class="qs__small">−10 % auf Pflegeleistungen im Auftrag (nicht auf Folie). In der Demo nur ein Beispiel.</p>
        <div class="qs__btns"><button class="btn" type="button" data-claim>In den Auftrag übernehmen</button><button class="btn btn--ghost" type="button" data-again>Nochmal fahren</button></div>`;
      $('[data-claim]').addEventListener('click', () => { close().then(() => opts.onClaim?.(code)); });
      $('[data-claim]').focus({ preventScroll: true });
    } else {
      losses++;
      panel.innerHTML = `
        <h2 class="qs__h">${t - g < 3 ? 'Knapp daneben' : 'Noch nicht schnell genug'}</h2>
        <p class="qs__lead">Du: <b>${fmt(t)} s</b>${pen}. Der Geist: ${fmt(g)} s. Dir fehlen ${fmt(t - g)} s.</p>
        <p class="qs__small">Tipp: Vor der Haarnadel und der Schikane bremsen (beide Hälften), die Linie innen halten.</p>
        <div class="qs__btns"><button class="btn" type="button" data-again>Nochmal</button>${losses >= 3 && easy < 3 ? '<button class="btn btn--ghost" type="button" data-easy>Geist langsamer</button>' : ''}<button class="btn btn--ghost" type="button" data-cancel>Aufhören</button></div>`;
      $('[data-easy]')?.addEventListener('click', () => { easy++; losses = 0; startCountdown(); });
      $('[data-cancel]').addEventListener('click', () => close());
      $('[data-again]').focus({ preventScroll: true });
    }
    $('[data-again]').addEventListener('click', startCountdown);
  }

  /* ----- Zeichnen ----- */
  const N = tr.N;
  function render() {
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#06070b'; c.fillRect(0, 0, w, h);
    // Kamera
    const sp = car.speed;
    let da = car.th - camTh; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    camTh += da * Math.min(1, 7 * Math.max(0.001, frameDt));
    const zoom = Math.min(w / 330, h / 560) * (1.04 - 0.2 * Math.min(1, sp / P.vmax));
    const px = w / 2, py = h * 0.68;
    const lead = 0.18 * sp;
    const camX = car.x + Math.cos(camTh) * lead, camY = car.y + Math.sin(camTh) * lead;
    c.save();
    c.translate(px, py); c.rotate(-Math.PI / 2 - camTh); c.scale(zoom, zoom); c.translate(-camX, -camY);
    const R = Math.hypot(w, h) / zoom * 0.62 + 60;   // sichtbarer Radius in Weltkoordinaten
    const R2 = R * R;

    // Parkplatz-Markierungen (Raster, nur im Sichtbereich)
    c.lineWidth = 1.4; c.strokeStyle = 'rgba(255,255,255,.07)'; c.setLineDash([30, 22]);
    const gx0 = Math.floor((camX - R) / 54) * 54, gx1 = camX + R, gy0 = camY - R, gy1 = camY + R;
    c.beginPath(); for (let x = gx0; x < gx1; x += 54) { c.moveTo(x, gy0); c.lineTo(x, gy1); } c.stroke();
    c.setLineDash([]); c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 2;
    c.beginPath(); for (let y = Math.floor(gy0 / 270) * 270; y < gy1; y += 270) { c.moveTo(camX - R, y); c.lineTo(camX + R, y); } c.stroke();

    // geparkte Autos (dunkel, außerhalb der Strecke)
    for (const cr of decor.cars) {
      const dx = cr.x - camX, dy = cr.y - camY; if (dx * dx + dy * dy > R2) continue;
      c.save(); c.translate(cr.x, cr.y); c.rotate(cr.a + Math.PI / 2);
      c.fillStyle = 'rgba(0,0,0,.4)'; rr(c, -CAR_W / 2 + 2, -CAR_H / 2 + 3, CAR_W, CAR_H, 6); c.fill();
      c.drawImage(sprParked[cr.c], -CAR_W / 2, -CAR_H / 2, CAR_W, CAR_H); c.restore();
    }

    // sichtbare Läufe der Mittellinie
    const visF = new Uint8Array(N);
    let any = false;
    for (let i = 0; i < N; i++) { const p = tr.pts[i], dx = p.x - camX, dy = p.y - camY; if (dx * dx + dy * dy < R2) { visF[i] = 1; any = true; } }
    const runs = [];
    if (any) {
      let s0 = -1;
      for (let i = 0; i < N; i++) if (!visF[i]) { s0 = i; break; }
      if (s0 < 0) runs.push([0, N]);
      else {
        let a = -1;
        for (let k = 1; k <= N; k++) {
          const i = (s0 + k) % N;
          if (visF[i]) { if (a < 0) a = k; } else if (a >= 0) { runs.push([s0 + a - 1, s0 + k]); a = -1; }
        }
      }
    }
    const ribbon = (off, fill) => {
      c.fillStyle = fill;
      for (const [a, b] of runs) {
        c.beginPath();
        for (let i = a; i <= b; i++) { const [x, y] = edge(tr, i, 1, off); i === a ? c.moveTo(x, y) : c.lineTo(x, y); }
        for (let i = b; i >= a; i--) { const [x, y] = edge(tr, i, -1, off); c.lineTo(x, y); }
        c.closePath(); c.fill();
      }
    };
    ribbon(W / 2 + WALL, '#0d1019');
    ribbon(W / 2, '#171b27');
    // Ölflecken und Pfützen
    for (const st of decor.stains) {
      const dx = st.x - camX, dy = st.y - camY; if (dx * dx + dy * dy > R2) continue;
      c.fillStyle = st.p ? 'rgba(90,120,190,.14)' : 'rgba(0,0,0,.28)';
      c.beginPath(); c.ellipse(st.x, st.y, st.rx, st.ry, st.a, 0, 7); c.fill();
    }
    // Richtungspfeile (aufgemalt)
    c.strokeStyle = 'rgba(255,255,255,.09)'; c.lineWidth = 5; c.lineJoin = 'round'; c.lineCap = 'round';
    for (const i of decor.arrows) {
      const p = tr.pts[i], dx = p.x - camX, dy = p.y - camY; if (dx * dx + dy * dy > R2) continue;
      c.beginPath();
      c.moveTo(p.x - p.hx * 8 + p.nx * 18, p.y - p.hy * 8 + p.ny * 18); c.lineTo(p.x + p.hx * 14, p.y + p.hy * 14); c.lineTo(p.x - p.hx * 8 - p.nx * 18, p.y - p.hy * 8 - p.ny * 18); c.stroke();
    }
    // Laternenlicht (additiv)
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5;
    for (const l of decor.lamps) { const dx = l.x - camX, dy = l.y - camY; if (dx * dx + dy * dy < R2 + 40000) c.drawImage(sprGlow, l.x - 190, l.y - 190, 380, 380); }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    // Ränder und Mittellinie
    c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,.22)';
    for (const side of [1, -1]) for (const [a, b] of runs) { c.beginPath(); for (let i = a; i <= b; i++) { const [x, y] = edge(tr, i, side); i === a ? c.moveTo(x, y) : c.lineTo(x, y); } c.stroke(); }
    c.lineWidth = 2.5; c.strokeStyle = 'rgba(255,255,255,.14)'; c.setLineDash([18, 26]);
    for (const [a, b] of runs) { c.beginPath(); for (let i = a; i <= b; i++) { const p = tr.pts[i % N]; i === a ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y); } c.stroke(); }
    c.setLineDash([]);
    // Bremstafeln
    c.strokeStyle = 'rgba(255,92,120,.7)'; c.lineWidth = 4;
    for (const grp of BOARDS) grp.forEach((idx, k) => {
      const p = tr.pts[idx], dx = p.x - camX, dy = p.y - camY; if (dx * dx + dy * dy > R2) return;
      const [x1, y1] = edge(tr, idx, 1, W / 2 - 6 - k * 12), [x2, y2] = edge(tr, idx, -1, W / 2 - 6 - k * 12);
      c.globalAlpha = 0.5 + k * 0.2; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    });
    c.globalAlpha = 1;
    // Start/Ziel
    {
      const p = tr.pts[0], dx = p.x - camX, dy = p.y - camY;
      if (dx * dx + dy * dy < R2) {
        const sq = W / 10;
        for (let r = 0; r < 2; r++) for (let q = 0; q < 10; q++) {
          c.fillStyle = (q + r) % 2 ? '#f3f1ec' : '#0b0c10';
          const [ax, ay] = edge(tr, 0, 1, W / 2 - q * sq);
          const ox = p.hx * (r * 9 - 9), oy = p.hy * (r * 9 - 9);
          c.beginPath(); c.moveTo(ax + ox, ay + oy);
          c.lineTo(ax - p.nx * sq + ox, ay - p.ny * sq + oy);
          c.lineTo(ax - p.nx * sq + ox + p.hx * 9, ay - p.ny * sq + oy + p.hy * 9);
          c.lineTo(ax + ox + p.hx * 9, ay + oy + p.hy * 9); c.closePath(); c.fill();
        }
      }
    }
    // Reifenspuren
    if (marks.length) {
      c.lineWidth = 3; c.lineCap = 'round';
      for (const m of marks) { c.strokeStyle = `rgba(0,0,0,${Math.max(0, 0.5 * (1 - (tAll - m.t) / 5))})`; c.beginPath(); c.moveTo(m.a, m.b); c.lineTo(m.c, m.d); c.stroke(); }
    }
    // Hütchen
    for (const cn of cones) {
      const x = cn.hit ? cn.ox : cn.x, y = cn.hit ? cn.oy : cn.y, dx = x - camX, dy = y - camY;
      if (dx * dx + dy * dy > R2) continue;
      if (cn.hit) { c.globalAlpha = 0.5; c.save(); c.translate(x, y); c.rotate(cn.rot); c.scale(1.2, 0.5); c.drawImage(sprCone[cn.col], -7, -7, 14, 14); c.restore(); c.globalAlpha = 1; }
      else c.drawImage(sprCone[cn.col], x - 8, y - 8, 16, 16);
    }
    // Reifenstapel an engen Kurven
    for (const t of decor.tires) {
      const dx = t.x - camX, dy = t.y - camY; if (dx * dx + dy * dy > R2) continue;
      c.fillStyle = '#0a0b10'; c.beginPath(); c.arc(t.x, t.y, 9, 0, 7); c.fill();
      c.strokeStyle = t.w ? '#d9d9e0' : '#ff5c78'; c.lineWidth = 3; c.beginPath(); c.arc(t.x, t.y, 6, 0, 7); c.stroke();
    }
    // Laternenmasten
    for (const l of decor.lamps) { const dx = l.x - camX, dy = l.y - camY; if (dx * dx + dy * dy > R2) continue; c.fillStyle = '#10121a'; c.beginPath(); c.arc(l.x, l.y, 4, 0, 7); c.fill(); c.fillStyle = '#fff1c7'; c.beginPath(); c.arc(l.x, l.y, 2, 0, 7); c.fill(); }
    // Geist
    if (state === 'race' || state === 'done' || state === 'pause') {
      const gh = ghostAt(state === 'done' ? 1e6 : car.t, gScale());
      c.save(); c.translate(gh.x, gh.y); c.rotate(gh.th + Math.PI / 2); c.globalAlpha = 0.6;
      c.drawImage(sprGhost, -CAR_W / 2, -CAR_H / 2, CAR_W, CAR_H); c.restore(); c.globalAlpha = 1;
    }
    // Auto + Scheinwerfer
    c.save(); c.translate(car.x, car.y); c.rotate(car.th + Math.PI / 2);
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5;
    c.drawImage(sprGlow, -70, -CAR_H / 2 - 120, 140, 150);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    c.fillStyle = 'rgba(0,0,0,.35)'; rr(c, -CAR_W / 2 + 2, -CAR_H / 2 + 3, CAR_W, CAR_H, 6); c.fill();
    c.drawImage(sprCar, -CAR_W / 2 - 1, -CAR_H / 2 - 1, CAR_W + 2, CAR_H + 2);
    c.restore();
    // Startbogen mit Schriftzug (lesbar aus Fahrersicht)
    {
      const p = tr.pts[0], dx = p.x - camX, dy = p.y - camY;
      if (dx * dx + dy * dy < R2) {
        const [ax, ay] = edge(tr, 0, 1, W / 2 + 14), [bx, by] = edge(tr, 0, -1, W / 2 + 14);
        c.fillStyle = '#10121a'; for (const [x, y] of [[ax, ay], [bx, by]]) { c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill(); }
        c.save(); c.translate(p.x + p.hx * 34, p.y + p.hy * 34); c.rotate(p.th + Math.PI / 2); c.globalAlpha = 0.88;
        c.fillStyle = 'rgba(16,18,26,.92)'; rr(c, -W / 2 - 12, -9, W + 24, 18, 5); c.fill();
        c.strokeStyle = '#35f2ff'; c.lineWidth = 1.5; rr(c, -W / 2 - 12, -9, W + 24, 18, 5); c.stroke();
        c.fillStyle = '#f3f1ec'; c.font = '700 11px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('START · ZIEL', 0, 1);
        c.restore();
      }
    }
    c.restore();
  }

  /* ----- Schleife ----- */
  let frameDt = 0.016;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; frameDt = dt; tAll += dt;
    if (flashT > 0) { flashT -= dt; if (flashT <= 0) elFlash.classList.remove('is-on'); }
    if (state === 'count') {
      countT += dt;
      const n = 3 - Math.floor(countT / 0.8);
      if (countT >= 2.4) { state = 'race'; elCount.textContent = 'LOS!'; elCount.classList.add('is-go'); setTimeout(() => { elCount.classList.remove('is-on', 'is-go'); }, 650); acc = 0; }
      else if (elCount.textContent !== String(n)) elCount.textContent = String(n);
    }
    if (state === 'race') {
      acc += dt;
      let guard = 0;
      while (acc >= DT && guard++ < 12 && !car.finished) {
        step(car, tr, input, DT); acc -= DT;
        if (Math.abs(car.slip) > 26 && car.speed > 60) {
          const c0 = Math.cos(car.th), s0 = Math.sin(car.th);
          const rx = car.x - c0 * 15, ry = car.y - s0 * 15;
          if (!marks.length || (marks[marks.length - 1].t + 0.03 < tAll)) {
            const lx = -s0 * 8, ly = c0 * 8;
            marks.push({ a: rx + lx - car.vx * 0.02, b: ry + ly - car.vy * 0.02, c: rx + lx, d: ry + ly, t: tAll });
            marks.push({ a: rx - lx - car.vx * 0.02, b: ry - ly - car.vy * 0.02, c: rx - lx, d: ry - ly, t: tAll });
            if (marks.length > 260) marks.splice(0, 2);
          }
        }
      }
      if (marks.length && tAll - marks[0].t > 5) marks.splice(0, 2);
      if (car.hits !== lastHits) { lastHits = car.hits; try { navigator.vibrate?.(14); } catch (e) { console.error('[quersteher]', e); } }
      if (car.wall && !lastWall) { try { navigator.vibrate?.(30); } catch (e) { console.error('[quersteher]', e); } }
      lastWall = car.wall;
      if ((car.respawned || 0) !== lastResp) { lastResp = car.respawned || 0; flash('Zurückgesetzt, +3 s', 1600); }
      const tn = car.t + car.penalty;
      elTime.textContent = fmt(tn);
      if (car.prog > 140) {
        const dlt = tn - ghostTimeAt(car.prog, gScale());
        elDelta.textContent = `${dlt <= 0 ? '−' : '+'}${fmt(Math.abs(dlt))} s`;
        elDelta.className = 'qs__delta ' + (dlt <= 0 ? 'is-ahead' : 'is-behind');
      }
      elMeta.textContent = car.hits ? `Hütchen: ${car.hits}` : '';
      if (car.finished) finish();
    }
    render();
  }

  // Start
  last = performance.now(); raf = requestAnimationFrame(frame);
  showIntro();
  if (opts.debug) window.__qs = { fakeFinish(t) { car.finished = true; car.finishT = t; }, get car() { return car; }, get state() { return state; }, tr, input, ghostTime, startCountdown, setEasy: (n) => { easy = n; }, close };
  return { close };
}
