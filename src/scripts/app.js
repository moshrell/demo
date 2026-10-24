// Glanzleistung — Box (Demo). Ein Bildschirm, der eine Werkstatt ist:
// Intro → Box (Auto) → Kamera fährt zu Stationen (Pflege, Zeiten, Anfahrt …) → Auftrag.
// Drei Ebenen im Bild: Box, Nahaufnahmen der Stationen (gleiche Kamera, schärfer),
// Kamerafahrten aus Blender (Clips) mit Standbild zum Polieren. Kein Framework.
// Zwei Bühnen aus Blender: Handy hochkant (9:16, Box 1440×2560) und Desktop/Tablet quer (16:9, Box 2560×1440).
import site from '../data/site.json';
import data from '../data/services.json';
import content from '../data/content.json';
import media from '../data/media.json';
import { parseCode } from './quersteher/code.js';

const DESK_Q = '(min-width: 640px) and (min-aspect-ratio: 5/4)'; // Querformat (auch Handy quer) = Desktop-Bühne
const G = { desk: false };
let M = media.mobile, W = M.W, H = M.H, CW = M.clip[0], CH = M.clip[1];
const MEDIA = import.meta.env.BASE_URL + 'media/';
const mdir = () => MEDIA + (G.desk ? 'd/' : '');
function setMode(desk) {
  G.desk = desk; M = desk ? media.desktop : media.mobile; W = M.W; H = M.H; [CW, CH] = M.clip;
  document.documentElement.classList.toggle('desk', desk);
}
setMode(matchMedia(DESK_Q).matches);
const STATE_KEY = 'gl:state:v2';
const FORM_KEY = 'form:gl-auftrag';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const euro = (n) => fmt.format(n);
const priceFor = (base, mult) => Math.ceil((base * mult) / 10) * 10 - 1;
const svcById = Object.fromEntries(data.services.map((s) => [s.id, s]));
const clsById = Object.fromEntries(data.classes.map((c) => [c.id, c]));
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const store = {
  get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { sessionStorage.removeItem(k); } catch {} },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const loadImg = (img) => (img.complete && img.naturalWidth ? Promise.resolve() : img.decode().catch(() => new Promise((r) => { img.onload = r; img.onerror = r; })));

/* ================= Zustand ================= */
const fresh = () => ({ v: 2, vehicles: [{ id: 1, cls: null, items: {} }], active: 0, code: null });
let state = store.get(STATE_KEY);
if (!state || state.v !== 2 || !Array.isArray(state.vehicles) || !state.vehicles.length) state = fresh();
const save = () => store.set(STATE_KEY, state);
const veh = () => state.vehicles[state.active];
const folieSvc = svcById.folie;
const colorById = (id) => folieSvc.colors.find((c) => c.id === id);

function lineItems(v) {
  const mult = clsById[v.cls]?.mult ?? 1;
  const out = [];
  for (const [sid, sel] of Object.entries(v.items)) {
    const s = svcById[sid]; if (!s) continue;
    const lvl = s.levels.find((l) => l.id === sel.level) ?? s.levels[0];
    let price = priceFor(lvl.base, mult);
    const label = s.levels.length > 1 ? `${s.name}: ${lvl.name}` : s.name;
    const extra = [];
    if (sid === 'folie' && sel.color) {
      const c = colorById(sel.color);
      if (c) { extra.push(`${c.name}${sel.finish ? `, ${sel.finish}` : ''}`); if (c.special) price = Math.ceil((price * (1 + s.specialSurcharge)) / 10) * 10 - 1; }
    }
    if (s.options && sel.opt) extra.push(`${s.options.label}: ${sel.opt}`);
    out.push({ sid, label, extra: extra.join(' · '), price, dur: lvl.dur, points: lvl.points });
    for (const aid of sel.addons ?? []) {
      const a = (s.addons ?? []).find((x) => x.id === aid);
      if (a) out.push({ sid, label: `+ ${a.name}`, extra: '', price: priceFor(a.base, mult), dur: a.dur, points: 0 });
    }
  }
  return out;
}
// Aktionscode: fester Code (site.discount.code) oder Spiel-Code „QS-…“ aus der Quersteher-Challenge
const normCode = (t) => String(t ?? '').trim().toUpperCase().replace(/\s+/g, '');
function resolveCode(raw) {
  const n = normCode(raw); if (!n) return null;
  if (n === site.discount.code) return { code: n, kind: 'aktion' };
  const g = parseCode(n);
  return g ? { code: g.code, kind: 'spiel', seconds: g.seconds } : null;
}
function totals() {
  let sum = 0, discount = 0;
  const d = site.discount;
  const codeOk = !!resolveCode(state.code);
  for (const v of state.vehicles) for (const li of lineItems(v)) {
    sum += li.price;
    if (codeOk && !d.exclude.includes(li.sid)) discount += li.price * d.percent / 100;
  }
  discount = Math.round(discount);
  return { sum, discount, total: sum - discount, count: state.vehicles.reduce((n, v) => n + Object.keys(v.items).length, 0) };
}

/* ================= HUD ================= */
let shownSum = 0, sumAnim = 0;
function renderHud(animate = true) {
  const t = totals();
  const target = t.total;
  cancelAnimationFrame(sumAnim);
  const el = $('[data-sum]');
  if (!animate || reduced()) { shownSum = target; el.textContent = euro(target); }
  else {
    const from = shownSum, t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / 500); const e = 1 - Math.pow(1 - p, 3);
      shownSum = Math.round(from + (target - from) * e); el.textContent = euro(shownSum);
      if (p < 1) sumAnim = requestAnimationFrame(step);
    };
    sumAnim = requestAnimationFrame(step);
  }
  const gt = $('[data-glanz-text]');
  gt.textContent = 'Termin anfragen ›';
  for (const b of $$('[data-count]')) { b.textContent = t.count || ''; b.hidden = !t.count; }
  const v = veh();
  const c = clsById[v.cls];
  const multi = state.vehicles.length > 1 ? `${state.active + 1}/${state.vehicles.length} · ` : '';
  $('[data-car-label]').textContent = multi + (c ? c.short : 'Klasse?');
  for (const b of $$('[data-rail]')) b.classList.toggle('is-done', !!v.items[b.dataset.rail]);
  for (const b of $$('[data-hs]')) b.classList.toggle('is-done', !!v.items[b.dataset.hs]);
  const mult = c?.mult ?? 1;
  for (const s of data.services) {
    const from = Math.min(...s.levels.map((l) => priceFor(l.base, mult)));
    for (const pe of $$(`[data-from="${s.id}"]`)) pe.textContent = `ab ${euro(from)}`;
    const st = $(`[data-state="${s.id}"]`); if (st) st.textContent = v.items[s.id] ? 'Eingebaut' : '';
  }
  renderBon();
}

/* ================= Toast / Tipp ================= */
let toastT = 0;
function toast(text, action) {
  const el = $('[data-toast]');
  el.innerHTML = '';
  el.append(document.createTextNode(text));
  if (action) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'toast__btn'; b.textContent = action.label;
    b.addEventListener('click', () => { hideToast(); action.run(); });
    el.append(b);
  }
  el.classList.add('is-on');
  clearTimeout(toastT); toastT = setTimeout(hideToast, action ? 7000 : 3200);
}
function hideToast() { $('[data-toast]').classList.remove('is-on'); }

/* ================= Perspektive: Inhalte auf Requisiten ================= */
// Homographie: Rechteck (0,0,w,h) → vier Ecken (TL, TR, BR, BL) als CSS matrix3d
function quadMatrix(w, h, q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den, hh = (dx1 * sy - sx * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3, c = x0;
  const d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3, f = y0;
  // Einheitsquadrat → Quad; davor Skalierung 1/w, 1/h
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, c, f, 0, 1];
  return `matrix3d(${m.map((n) => +n.toFixed(9)).join(',')})`;
}
function placeSurfaces() {
  for (const el of $$('[data-surf]')) {
    el.style.width = `${el.dataset.cw}px`; el.style.height = `${el.dataset.ch}px`;
    el.style.transform = quadMatrix(+el.dataset.cw, +el.dataset.ch, M.surfaces[el.dataset.surf]);
  }
  // Inhalt der Station hat je Bühne eine eigene Größe (Gästebuch-Seite ist am Desktop schmal und hoch)
  for (const el of $$('[data-ov]')) {
    const id = el.dataset.ov; const [ow, oh] = M.ov[id];
    el.style.width = `${ow}px`; el.style.height = `${oh}px`;
    el.style.transform = quadMatrix(ow, oh, M.stations[id].corners);
  }
}
// Knöpfe in der Szene: am Handy vier Punkte am Auto, am Desktop beschriftete Knöpfe an Auto und Wänden
function pinPos(el) {
  if (G.desk) return M.pins[el.dataset.pin] ?? null;
  const key = el.dataset.hsKey; if (!key) return null;
  if (key === 'seat') return [505, 1255]; // Fahrersitz (Sichtprüfung)
  const h = M.hotspots[key]; if (h) return h;
  const q = M.surfaces[key]; if (!q) return null;
  return [q.reduce((n, p) => n + p[0], 0) / q.length, q.reduce((n, p) => n + p[1], 0) / q.length];
}
function placeHotspots() {
  for (const el of $$('[data-pin]')) {
    const p = pinPos(el); el.hidden = !p; if (!p) continue;
    el.style.left = `${p[0]}px`; el.style.top = `${p[1]}px`; el.dataset.side = p[2] || 'r';
  }
}

/* ================= Wischen / Polieren ================= */
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
class Scrub {
  // canvas: sichtbare Ebene über dem Schmutzbild; clean: Bild „sauber“; zone: Bild mit Alpha (wo Schmutz liegt)
  constructor(canvas, w, h, res, fade) {
    Object.assign(this, { canvas, w, h, res, fade, ctx: canvas.getContext('2d'), clean: null, zone: null, zoneAlpha: 0, zoneTarget: 0, raf: 0, last: 0, has: false, moves: 0,
      gw: 48, gh: Math.round(48 * h / w), zcells: null, cells: null, total: 0, done: 0, completed: false, shine: null, onComplete: null, onRelease: null });
    this.strokes = mk(w * res, h * res); this.sctx = this.strokes.getContext('2d');
    this.mask = mk(w * res, h * res); this.mctx = this.mask.getContext('2d');
  }
  // Zone setzen und daraus ein grobes Raster bauen: so wissen wir, wie viel schon gewischt ist
  setZone(img) {
    this.zone = img; this.completed = false; this.done = 0; this.zoneAlpha = 0; this.zoneTarget = 0;
    if (!img) { this.zcells = this.cells = null; this.total = 0; return; }
    const c = mk(this.gw, this.gh).getContext('2d', { willReadFrequently: true });
    c.drawImage(img, 0, 0, this.gw, this.gh);
    const d = c.getImageData(0, 0, this.gw, this.gh).data;
    this.zcells = new Uint8Array(this.gw * this.gh); let n = 0;
    for (let i = 0; i < this.zcells.length; i++) if (d[i * 4 + 3] > 110) { this.zcells[i] = 1; n++; }
    this.total = n; this.cells = this.zcells.slice();
  }
  reset() {
    this.sctx.clearRect(0, 0, this.strokes.width, this.strokes.height);
    this.has = false; this.moves = 0; this.done = 0; this.completed = false; this.shine = null;
    if (this.zcells) this.cells = this.zcells.slice();
    this.kick();
  }
  brush(p, rad) {
    const x = p.x * this.res, y = p.y * this.res, r = rad * this.res;
    const g = this.sctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.6, 'rgba(0,0,0,.9)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    this.sctx.fillStyle = g; this.sctx.beginPath(); this.sctx.arc(x, y, r, 0, Math.PI * 2); this.sctx.fill();
    this.has = true; this.last = performance.now(); this.mark(p, rad); this.kick();
  }
  mark(p, r) {
    if (!this.cells || this.completed || this.total < 20) return;
    const gx = this.gw / this.w, gy = this.gh / this.h, r2 = (r * 0.8) * (r * 0.8);
    const x0 = Math.max(0, Math.floor((p.x - r) * gx)), x1 = Math.min(this.gw - 1, Math.ceil((p.x + r) * gx));
    const y0 = Math.max(0, Math.floor((p.y - r) * gy)), y1 = Math.min(this.gh - 1, Math.ceil((p.y + r) * gy));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * this.gw + x;
      if (this.cells[i] !== 1) continue;
      const dx = (x + 0.5) / gx - p.x, dy = (y + 0.5) / gy - p.y;
      if (dx * dx + dy * dy < r2) { this.cells[i] = 2; this.done++; }
    }
    if (this.done / this.total >= 0.5) this.complete();
  }
  // Genug gewischt: den Rest macht ein Glanz-Schwung sauber (so kann man nichts „malen“)
  complete() {
    if (this.completed) return; this.completed = true;
    this.zoneTarget = 1; this.shine = reduced() ? null : performance.now();
    this.kick(); this.onComplete?.();
  }
  release() { // Box: der Staub kommt zurück
    this.completed = false; this.sctx.clearRect(0, 0, this.strokes.width, this.strokes.height); this.has = false; this.done = 0; this.moves = 0;
    if (this.zcells) this.cells = this.zcells.slice();
    this.onRelease?.(); this.kick();
  }
  draw() {
    const { ctx, mctx, w, h } = this;
    const mw = this.mask.width, mh = this.mask.height;
    mctx.globalCompositeOperation = 'source-over'; mctx.clearRect(0, 0, mw, mh);
    if (this.has) {
      mctx.drawImage(this.strokes, 0, 0);
      // Striche gelten nur dort, wo wirklich Schmutz ist
      if (this.zone) { mctx.globalCompositeOperation = 'destination-in'; mctx.drawImage(this.zone, 0, 0, mw, mh); mctx.globalCompositeOperation = 'source-over'; }
    }
    if (this.zone && this.zoneAlpha > 0.001) { mctx.globalCompositeOperation = 'lighter'; mctx.globalAlpha = this.zoneAlpha; mctx.drawImage(this.zone, 0, 0, mw, mh); mctx.drawImage(this.zone, 0, 0, mw, mh); mctx.globalAlpha = 1; mctx.globalCompositeOperation = 'source-over'; }
    ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, w, h);
    if (!this.clean || (!this.has && this.zoneAlpha <= 0.001)) return;
    ctx.drawImage(this.clean, 0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(this.mask, 0, 0, w, h);
    if (this.shine != null) {
      const t = (performance.now() - this.shine) / 950;
      if (t < 1) {
        const x = (-0.3 + 1.6 * t) * w; const g = ctx.createLinearGradient(x - w * 0.22, 0, x + w * 0.22, h * 0.45);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${0.5 * Math.sin(Math.PI * t)})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  loop() {
    let busy = false;
    const dz = this.zoneTarget - this.zoneAlpha;
    if (Math.abs(dz) > 0.002) { this.zoneAlpha += reduced() ? dz : dz * 0.09; busy = true; } else this.zoneAlpha = this.zoneTarget;
    if (this.shine != null) { if (performance.now() - this.shine > 1000) this.shine = null; busy = true; }
    if (this.fade && this.has && !this.completed && performance.now() - this.last > 900) {
      this.sctx.globalCompositeOperation = 'destination-out';
      this.sctx.fillStyle = 'rgba(0,0,0,0.035)'; this.sctx.fillRect(0, 0, this.strokes.width, this.strokes.height);
      this.sctx.globalCompositeOperation = 'source-over';
      if (performance.now() - this.last > 4500) { this.sctx.clearRect(0, 0, this.strokes.width, this.strokes.height); this.has = false; this.done = 0; if (this.zcells) this.cells = this.zcells.slice(); }
      busy = true;
    }
    this.draw();
    this.raf = busy ? requestAnimationFrame(() => this.loop()) : 0;
  }
  kick() { if (!this.raf) this.raf = requestAnimationFrame(() => this.loop()); }
}

/* ================= Folie: fertige Blender-Renders (Farbe × Finish) =================
   Früher wurde die Farbe im Browser auf die Box gerechnet (Pässe + tintCanvas). Jetzt gibt es für jede der 8 Farben und
   3 Finishs ein echtes Render: ganze Box (Wechsel im Canvas, kurze Überblendung) und die Haube für den Lack-Flug. */
const wrapOf = (sel) => (sel && sel.color && sel.color !== 'original' ? { color: sel.color, finish: sel.finish || colorById(sel.color)?.finish || 'glanz' } : null);
const boxUrl = (w) => (w ? `${MEDIA}wrap/${G.desk ? 'd' : 'm'}/box-${w.color}-${w.finish}.webp` : `${MEDIA}${G.desk ? 'd/box-clean' : 'box-clean'}.webp`);
const hoodUrl = (w) => `${MEDIA}wrap/${G.desk ? 'd' : 'm'}/hood-${w.color}-${w.finish}.webp`;
const boxes = { cur: null, url: '', from: null, mix: 1, raf: 0, token: 0 };
let boxReadyRes; const boxReady = new Promise((r) => { boxReadyRes = r; });
// Box-Bild wechseln. Das alte Bild bleibt stehen, bis das neue geladen ist (nie ein leeres Bild), dann kurze Überblendung.
function setBox(url, instant = false) {
  if (url === boxes.url && boxes.cur) return Promise.resolve();
  const prevUrl = boxes.url; const tk = ++boxes.token; boxes.url = url;
  const img = new Image(); img.decoding = 'async'; img.src = url;
  return loadImg(img).then(() => {
    if (tk !== boxes.token) return;
    if (!img.naturalWidth) { boxes.url = prevUrl; boxReadyRes(); return; } // Laden fehlgeschlagen: altes Bild behalten
    boxes.from = boxes.cur; boxes.cur = img; stage.box = img;
    if (!boxes.from || instant || reduced()) { boxes.from = null; boxes.mix = 1; drawBg(); boxReadyRes(); return; }
    boxes.mix = 0; const t0 = performance.now(); cancelAnimationFrame(boxes.raf);
    const step = (now) => {
      boxes.mix = Math.min(1, (now - t0) / 280); drawBg();
      if (boxes.mix < 1) boxes.raf = requestAnimationFrame(step); else boxes.from = null;
    };
    boxes.raf = requestAnimationFrame(step); boxReadyRes();
  });
}
// Welche Farbe zeigt das Auto gerade? Vorschau an der Station, sonst die eingebaute Folie
function syncPaint() {
  let sel = null;
  if (view.kind === 'svc' && view.id === 'folie' && draft) sel = draft;
  else if (veh().items.folie) sel = veh().items.folie;
  return setBox(boxUrl(wrapOf(sel)));
}
// Alle Farben im Hintergrund in den HTTP-Cache holen (nur bei gutem Netz, ohne Datensparmodus). Entpackt wird erst bei Bedarf.
let wrapsWarm = false;
function warmWraps() {
  if (wrapsWarm) return; wrapsWarm = true;
  const c = navigator.connection;
  if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return;
  const urls = folieSvc.colors.filter((x) => x.id !== 'original').map((x) => boxUrl(wrapOf({ color: x.id, finish: x.finish })));
  const next = () => { const u = urls.shift(); if (u) fetch(u, { priority: 'low' }).then((r) => r.blob()).catch(() => {}).finally(() => setTimeout(next, 120)); };
  (window.requestIdleCallback || setTimeout)(next);
}

/* ================= Bühne + Kamera ================= */
let flying = 0;
const stage = { frame: null, world: null, stWorld: null, clipWorld: null, box: null, clip: null, base: null, cam: null, clipBase: null, clipCam: null, mode: 'off' };
const view = { kind: 'box', id: null };
let camToken = 0;
const frameRect = () => stage.frame.getBoundingClientRect();
// Handy: Bild mittig. Desktop: Bild links bündig (rechts liegt die dunkle Wand für das Panel; schmalere Fenster schneiden rechts ab)
function cover(w, h, r) { const s = Math.max(r.width / w, r.height / h); return { s, tx: G.desk ? 0 : (r.width - w * s) / 2, ty: (r.height - h * s) / 2 }; }
// Das Bild muss immer die ganze Bühne decken, sonst blitzt unten ein grauer Streifen auf
function clampCam(c, w, h, r) {
  const s = Math.max(c.s, r.width / w, r.height / h);
  return { s, tx: Math.min(0, Math.max(r.width - w * s, c.tx)), ty: Math.min(0, Math.max(r.height - h * s, c.ty)) };
}
// Sichtbarer Bereich der Bühne: unter dem HUD, über einem offenen Bottom-Sheet
function visible() {
  const r = frameRect();
  const top = 64 + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-t')) || 0);
  let bottom = r.height, left = 0, right = r.width;
  const d = current ? sheet(current) : null;
  if (G.desk) {
    // Desktop: das Panel steht rechts an der Wand, die Kamera nimmt den Platz links davon
    bottom = r.height - 20;
    if (d && d.open && d.classList.contains('sheet--cam')) right = Math.max(left + 360, d.getBoundingClientRect().left - r.left - 24);
  } else if (d && d.open && d.classList.contains('sheet--cam')) {
    const dr = d.getBoundingClientRect();
    const overlaps = dr.left < r.right - 1 && dr.right > r.left + 1;
    if (overlaps) bottom = Math.min(bottom, window.innerHeight - d.offsetHeight - r.top);
  }
  return { top, bottom: Math.max(top + 120, bottom), left, right };
}
// Kamera so stellen, dass ein Bildbereich gut im sichtbaren Teil steht
function fitRect(rect, w, h, maxMul) {
  const r = frameRect(); const v = visible(); const c0 = cover(w, h, r);
  let s = Math.min(((v.right - v.left) * 0.92) / rect.w, ((v.bottom - v.top) * 0.9) / rect.h);
  s = Math.min(c0.s * maxMul, Math.max(c0.s, s));
  const tx = (v.left + v.right) / 2 - (rect.x + rect.w / 2) * s;
  const ty = (v.top + v.bottom) / 2 - (rect.y + rect.h / 2) * s;
  return clampCam({ s, tx, ty }, w, h, r);
}
const bbox = (q) => { const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]); const x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; };

/* ---------- Box-Bild als Canvas ----------
   Früher war das 1440×2560-Bild ein <img> in einer per transform skalierten Ebene (will-change).
   Bei Zoom-Sprüngen bis ×7 hat Chrome (Android und Desktop) dessen Kacheln mit falscher Raster-Auflösung
   gezeigt oder verworfen → schwarze/verkleinerte Box. Jetzt zeichnen wir Box und Stations-Nahaufnahme
   selbst in ein Canvas in Bildschirmgröße: Speicher konstant, scharf bei jedem Zoom, nichts kann „verloren“ gehen. */
const bgcv = { el: null, ctx: null, dpr: 1 };
function sizeBg() {
  const el = bgcv.el; if (!el) return;
  const r = frameRect(); let dpr = Math.min(window.devicePixelRatio || 1, G.desk ? 2 : 2.5);
  dpr = Math.min(dpr, Math.sqrt(8.4e6 / Math.max(1, r.width * r.height))); // höchstens ~4K Pixel im Canvas
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (el.width !== w || el.height !== h) { el.width = w; el.height = h; }
  bgcv.dpr = dpr;
}
function drawBg() {
  const { ctx, dpr, el } = bgcv; if (!ctx || !stage.cam) return;
  const c = stage.cam;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  ctx.fillStyle = '#0b0b0e'; ctx.fillRect(0, 0, el.width, el.height);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const box = boxes.cur;
  if (box && box.naturalWidth) {
    ctx.setTransform(dpr * c.s, 0, 0, dpr * c.s, dpr * c.tx, dpr * c.ty);
    const fr = boxes.from;
    if (fr && fr.naturalWidth && boxes.mix < 1) { ctx.drawImage(fr, 0, 0, W, H); ctx.globalAlpha = boxes.mix; ctx.drawImage(box, 0, 0, W, H); ctx.globalAlpha = 1; }
    else ctx.drawImage(box, 0, 0, W, H);
  }
  if (view.kind === 'info' && view.st && stage.stOp > 0.002 && stage.stImg && stage.stImg.naturalWidth) {
    const st = M.stations[view.id]; const [cx, cy, , ch] = st.crop; const ss = c.s / (H / ch);
    ctx.globalAlpha = stage.stOp;
    ctx.setTransform(dpr * ss, 0, 0, dpr * ss, dpr * (c.tx + c.s * cx), dpr * (c.ty + c.s * cy));
    ctx.drawImage(stage.stImg, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}
function applyCam() {
  const c = stage.cam;
  stage.world.style.transform = `translate(${c.tx}px, ${c.ty}px) scale(${c.s})`;
  if (!flying) stage.world.style.setProperty('--ws', String(c.s));
  // Nahaufnahme: exakter 2D-Zoom der Box → aus der Box-Kamera ableiten
  if (view.kind === 'info' && view.st) {
    const st = M.stations[view.id]; const [cx, cy, , ch] = st.crop; const k = H / ch;
    const s = c.s / k;
    stage.stWorld.style.transform = `translate(${c.tx + c.s * cx}px, ${c.ty + c.s * cy}px) scale(${s})`;
    const u = Math.log(c.s / stage.base.s) / Math.log(view.endS / stage.base.s);
    stage.stOp = view.stReady ? smooth(0.5, 0.88, u) : 0;
    stage.stWorld.style.opacity = String(stage.stOp);
  } else stage.stOp = 0;
  drawBg();
}
function applyClipCam() {
  const c = stage.clipCam;
  stage.clipWorld.style.transform = `translate(${c.tx}px, ${c.ty}px) scale(${c.s})`;
}
function tween(get, set, to, ms, token) {
  const from = { ...get() };
  if (reduced() || ms <= 0) { set(to); return Promise.resolve(); }
  return new Promise((res) => {
    const t0 = performance.now();
    const step = (now) => {
      if (token !== camToken) return res();
      const p = Math.min(1, (now - t0) / ms); const e = ease(p);
      // Zoom logarithmisch, damit die Fahrt gleichmäßig wirkt
      const s = from.s * Math.pow(to.s / from.s, e);
      const k = (s - from.s) / ((to.s - from.s) || 1);
      const kk = Math.abs(to.s - from.s) < 1e-6 ? e : k;
      set({ s, tx: from.tx + (to.tx - from.tx) * kk, ty: from.ty + (to.ty - from.ty) * kk });
      if (p < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
}
// Während einer Kamerafahrt: Hotspots ausblenden und --ws nicht pro Frame ändern.
// Sonst muss der Browser die ganze Box-Ebene (1440×2560) in jedem Frame neu rastern → auf Android schwarze Kacheln.
const camTo = (to, ms, token) => {
  flying++; document.body.classList.add('is-flying');
  return tween(() => stage.cam, (c) => { stage.cam = c; applyCam(); }, to, ms, token).finally(() => {
    flying = Math.max(0, flying - 1);
    if (!flying) { document.body.classList.remove('is-flying'); stage.world.style.setProperty('--ws', String(stage.cam.s)); }
  });
};
const clipCamTo = (to, ms, token) => tween(() => stage.clipCam, (c) => { stage.clipCam = c; applyClipCam(); }, to, ms, token);

// Alles, was von der Bühne (Handy / Desktop) abhängt: Größen, Positionen, Scrub-Ebene
function applyStageMode() {
  stage.clipWorld.style.width = `${CW}px`; stage.clipWorld.style.height = `${CH}px`;
  for (const k of ['[data-clip-canvas]', '[data-clip-tint]']) { const c = $(k); if (c) { c.width = CW; c.height = CH; } }
  stage.clip = new Scrub($('[data-clip-canvas]'), CW, CH, 1, false);
  for (const w of [stage.world, stage.stWorld]) { w.style.width = `${W}px`; w.style.height = `${H}px`; }
  $('[data-clip-video]').dataset.name = '';
  placeSurfaces(); placeHotspots();
}
async function initStage() {
  stage.frame = $('[data-frame]'); stage.world = $('[data-world]');
  stage.stWorld = $('[data-stworld]'); stage.clipWorld = $('[data-clipworld]');
  bgcv.el = $('[data-bgcv]'); bgcv.ctx = bgcv.el.getContext('2d', { alpha: false });
  bgcv.el.addEventListener('contextrestored', drawBg);
  applyStageMode();
  layout(true);
  new ResizeObserver(() => layout(true)).observe(stage.frame);
  await setBox(boxUrl(wrapOf(veh().items.folie)), true);
  drawBg();
}
// Wechsel zwischen Handy- und Desktop-Bühne (Fenster ziehen, Tablet drehen): alles zurück in die Box, andere Bilder laden
async function switchMode(desk) {
  camToken++;
  if (current) closeSheet({ silent: true, keepView: true });
  under = null; stationId = null; draft = null; pending = null;
  document.body.classList.remove('at-station');
  view.kind = 'box'; view.id = null; view.st = false;
  $$('[data-st]').forEach((x) => { x.hidden = true; const im = $('[data-st-img]', x); if (im) im.removeAttribute('src'); });
  stage.stImg = null; stage.stOp = 0; stage.stWorld.style.opacity = '0';
  stage.clipWorld.hidden = true; $('[data-clip-video]').pause();
  setMode(desk); applyStageMode(); sizeBg();
  stage.base = cover(W, H, frameRect()); stage.cam = { ...stage.base };
  boxes.url = ''; boxes.cur = null; boxes.from = null;
  await syncPaint(); layout(true); syncHud();
}
function layout(instant) {
  if (stage.frame && matchMedia(DESK_Q).matches !== G.desk) { switchMode(!G.desk); return; }
  const r = frameRect();
  sizeBg();
  stage.base = cover(W, H, r);
  stage.clipBase = cover(CW, CH, r);
  if (view.kind === 'box' || instant) {
    if (view.kind === 'box') { stage.cam = { ...stage.base }; applyCam(); }
    else refit();
  }
  drawBg();
}
// Bei Größenänderung an einer Station neu ausrichten (ohne Animation)
function refit() {
  if (view.kind === 'info') { const t = infoTarget(view.id); view.endS = t.s; stage.cam = t; applyCam(); }
  else if (view.kind === 'svc') {
    const sv = svcView(svcById[view.id]);
    if (sv.clip) { stage.clipCam = clipTarget(sv.clip); applyClipCam(); stage.cam = { ...stage.base }; applyCam(); }
    else { stage.cam = zoomTarget(sv.zoom); applyCam(); }
  }
}
// Welche Ansicht hat die Leistung auf dieser Bühne? Desktop: eigene Clips (viewD). Mit Folie ersetzt ein Zoom das Radhaus-Video.
function svcView(s) {
  const v = (G.desk && s.viewD) || s.view;
  if (v.wrapZoom && wrapOf(veh().items.folie)) return { zoom: v.wrapZoom };
  return v;
}
/* ---------- Stationen: Zielkameras ---------- */
function infoTarget(id) {
  const st = M.stations[id]; const [cx, cy, , ch] = st.crop; const k = H / ch;
  if (G.desk) { // Nahaufnahme ist für den Vollbild-Ausschnitt gerendert: Objekt links, Platz für das Panel rechts
    const r = frameRect(); const c0 = cover(W, H, r); const s = c0.s * k; const v = visible();
    // Schmale Fenster (4:3): das Objekt rückt unters Panel. Dann die Kamera nach rechts schieben, soweit das Nahaufnahme-Bild reicht.
    const mx = st.corners.reduce((n, p) => n + p[0], 0) / 4; const sx = c0.tx + c0.s * mx;
    const limit = v.right - Math.max(80, 0.12 * (v.right - v.left));
    const shift = sx > limit ? Math.min(sx - limit, Math.max(0, W * c0.s + c0.tx - r.width)) : 0;
    return { s, tx: c0.tx - s * cx - shift, ty: c0.ty - s * cy };
  }
  const stc = fitRect(bbox(st.corners), W, H, 2.4);
  const s = stc.s * k;
  return { s, tx: stc.tx - s * cx, ty: stc.ty - s * cy };
}
function zoomTarget(z) {
  if (typeof z === 'string') { const [x, y, w, h] = M.zooms[z]; return fitRect({ x, y, w, h }, W, H, 2.6); }
  const r = frameRect(); const v = visible();
  // Ganze Karosserie (Unterkante z.yb) soll über dem Panel stehen, ohne dass die Welt unten endet
  const yb = z.yb ?? z.y; const vb = v.bottom - 8;
  const need = (r.height - vb) / (H - yb);
  const s = Math.min(stage.base.s * 1.7, Math.max(stage.base.s * z.z, need));
  // Front des Autos (rechts) bleibt im Bild; hinten ist das Render ohnehin angeschnitten
  const tx = z.xr ? r.width * 0.97 - z.xr * s : r.width / 2 - z.x * s;
  return clampCam({ s, tx, ty: vb - yb * s }, W, H, r);
}
// Welcher Streifen des Standbilds (Anteil der Höhe) soll über dem Panel sichtbar sein?
const CLIP_WIN = { lack: [0.02, 0.5], wheel: [0.06, 0.66], interior: [0.0, 0.62] };
function clipTarget(name = 'lack') {
  if (G.desk) return cover(CW, CH, frameRect()); // Desktop-Clips sind für das ganze Bild gerendert, das Panel liegt rechts darüber
  const r = frameRect(); const v = visible(); const [y0, y1] = CLIP_WIN[name] ?? [0, 0.6];
  const s = Math.max(r.width / 720, r.height / 1280, (v.bottom - v.top) / (1280 * (y1 - y0)));
  return clampCam({ s, tx: (r.width - 720 * s) / 2, ty: v.top - y0 * 1280 * s }, 720, 1280, r);
}

/* ---------- Clips (Kamerafahrten aus Blender) ---------- */
const clipSrc = (name) => `${mdir()}clip-${name}.mp4`;
function warmClips() {
  // Nach dem Intro die Kamerafahrten im Hintergrund laden, damit der erste Klick nicht wartet
  for (const n of G.desk ? ['lack', 'wheel', 'interior'] : ['lack', 'interior']) {
    const u = clipSrc(n);
    if (warmClips[u]) continue;
    warmClips[u] = true; fetch(u, { cache: 'force-cache' }).then((r) => r.blob()).catch(() => {});
  }
}
const once = (el, ev) => new Promise((r) => el.addEventListener(ev, r, { once: true }));
const imgOf = (url) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
async function playClip(s, token) {
  const cv = svcView(s); const still = $('[data-clip-still]'); const lamp = $('[data-clip-lamp]'); const video = $('[data-clip-video]'); const tint = $('[data-clip-tint]');
  const base = mdir();
  const wrapSel = wrapOf(veh().items.folie);
  // Mit Folie passt das Video (gedreht auf schwarzem Lack) nicht mehr: nur Überblendung zum fertigen Standbild.
  // Beim Lack ist das Standbild die Haube als Render in der Folienfarbe, sonst „stumpf“ → „sauber“.
  const wrapHood = !!(wrapSel && cv.zone === 'lack');
  stage.clip.reset(); stage.clip.clean = null; stage.clip.setZone(null);
  lamp.hidden = true; lamp.style.opacity = '0'; still.style.opacity = '0'; tint.hidden = true;
  const hasZone = !!cv.zone && !wrapHood;
  // Ohne Zone (Innenraum) gibt es nur ein Bild
  still.src = wrapHood ? hoodUrl(wrapSel) : `${base}${cv.still}-${hasZone ? 'dirty' : 'clean'}.webp`;
  let cleanImg = null, zoneImg = null;
  if (hasZone) { cleanImg = new Image(); cleanImg.src = `${base}${cv.still}-clean.webp`; zoneImg = new Image(); zoneImg.src = `${base}zone-${cv.zone}.png`; }
  stage.clipCam = { ...stage.clipBase }; applyClipCam();
  const cw = stage.clipWorld;
  cw.hidden = false; cw.style.transition = 'none'; cw.style.opacity = '0';
  video.hidden = false; video.style.opacity = '1';
  let ready = false;
  if (!reduced() && !wrapSel) {
    if (video.dataset.name !== cv.clip) { video.src = clipSrc(cv.clip); video.dataset.name = cv.clip; }
    try { video.currentTime = 0; } catch {}
    ready = await Promise.race([
      (async () => { if (video.readyState < 3) await once(video, 'canplay'); if (video.seeking) await once(video, 'seeked'); return true; })(),
      sleep(2200).then(() => false),
    ]);
  } else video.hidden = true;
  if (token !== camToken) return false;
  void cw.offsetWidth;
  cw.style.transition = `opacity ${reduced() ? 1 : 450}ms ease`; cw.style.opacity = '1';
  const end = clipTarget(cv.clip);
  let played = false;
  if (ready) { try { await video.play(); played = true; } catch { played = false; } }
  if (played) {
    await Promise.all([
      new Promise((r) => { video.addEventListener('ended', r, { once: true }); setTimeout(r, 2600); }),
      clipCamTo(end, G.desk ? 0 : 1500, token),
    ]);
  } else { stage.clipCam = end; applyClipCam(); }
  if (token !== camToken) return false;
  await loadImg(still);
  const [zoneOk, cleanOk] = await Promise.all([zoneImg ? loadImg(zoneImg) : null, cleanImg ? loadImg(cleanImg) : null]);
  if (token !== camToken) return false;
  still.style.opacity = '1';
  await sleep(reduced() ? 0 : 240);
  video.style.opacity = '0'; video.pause();
  if (token !== camToken) return false;
  // Nahaufnahme putzt sich selbst: kurz stumpf, nach einer Sekunde Glanz-Schwung und sauber
  if (hasZone) {
    stage.clip.clean = cleanImg; stage.clip.setZone(zoneImg);
    stage.clip.zoneTarget = 0;
    stage.clip.kick();
    const done = !!veh().items[s.id];
    if (done) { stage.clip.zoneTarget = 1; stage.clip.zoneAlpha = 1; stage.clip.kick(); }
    else { setTimeout(() => { if (token === camToken) { stage.clip.complete(); } }, reduced() ? 0 : 1000); }
  }
  return true;
}
function hideClip() {
  const cw = stage.clipWorld; const video = $('[data-clip-video]');
  if (cw.hidden) return Promise.resolve();
  cw.style.transition = `opacity ${reduced() ? 1 : 360}ms ease`; cw.style.opacity = '0';
  return sleep(reduced() ? 0 : 380).then(() => { cw.hidden = true; video.pause(); });
}

/* ---------- Ansicht wechseln ---------- */
async function goBox() {
  const token = ++camToken;
  stage.mode = 'off';
  const was = { ...view };
  view.kind = 'box'; view.id = null;
  document.body.classList.remove('at-station');
  syncHud();
  syncPaint();
  if (was.kind === 'svc' && svcView(svcById[was.id]).clip) await hideClip();
  if (was.kind === 'info') {
    // Rückwärts: Nahaufnahme blendet über die Box-Fahrt aus
    view.kind = 'info'; view.id = was.id; view.st = true; view.endS = was.endS; view.stReady = was.stReady;
    await camTo(stage.base, 800, token);
    if (token !== camToken) return;
    view.kind = 'box'; view.id = null; view.st = false;
    $$('[data-st]').forEach((x) => { x.hidden = true; const im = $('[data-st-img]', x); if (im && im.src) im.removeAttribute('src'); });
    stage.stWorld.style.opacity = '0'; stage.stOp = 0; stage.stImg = null; drawBg();
  } else await camTo(stage.base, 700, token);
  if (token !== camToken) return false;
  softRecover();
  return true;
}
async function goInfo(id) {
  if (view.kind !== 'box') await goBox();
  const token = ++camToken;
  stage.mode = 'off';
  const el = $(`[data-st="${id}"]`); const img = $('[data-st-img]', el);
  if (!img.getAttribute('src')) img.src = `${mdir()}st-${id}.webp`;
  stage.stImg = img;
  $$('[data-st]').forEach((x) => { x.hidden = x !== el; });
  view.kind = 'info'; view.id = id; view.st = true; view.stReady = false;
  const target = infoTarget(id); view.endS = target.s;
  loadImg(img).then(() => { if (view.id === id) { view.stReady = true; applyCam(); } });
  document.body.classList.add('at-station');
  await camTo(target, 950, token);
  if (token !== camToken) return false;
  await loadImg(img); view.stReady = true; applyCam();
  return true;
}
async function goSvc(id) {
  if (view.kind !== 'box') await goBox();
  const token = ++camToken;
  const s = svcById[id];
  view.kind = 'svc'; view.id = id;
  document.body.classList.add('at-station');
  stage.mode = 'off';
  const sv = svcView(s);
  if (sv.clip) return await playClip(s, token);
  syncPaint();
  await camTo(zoomTarget(sv.zoom), 900, token);
  if (token !== camToken) return false;
  return true;
}

/* ================= Sheets ================= */
let current = null, under = null, skipPop = false;
const sheet = (id) => document.getElementById(`sheet-${id}`);
const CAM = new Set(['zeiten', 'anfahrt', 'funk', 'auftrag', 'gaestebuch', 'recht']);
function openSheet(id) {
  if (CAM.has(id)) { openInfo(id); return; }
  const d = sheet(id); if (!d) return;
  let stack = false;
  if (current && current !== id) {
    // Liegt eine Station darunter (Lack, Felgen …), bleibt sie bestehen: nach dem Schließen sind wir wieder dort
    if (sheet(current).classList.contains('sheet--cam') && !d.classList.contains('sheet--cam')) { under = current; stack = true; }
    else closeSheet({ silent: true, keepView: true });
  }
  renderSheet(id);
  if (!d.open) d.showModal();
  d.scrollTop = 0;
  current = id;
  if (history.state?.gl && !stack) history.replaceState({ gl: id }, ''); else history.pushState({ gl: id }, '');
}
function syncHud() {
  const cam = !!(current && sheet(current)?.classList.contains('sheet--cam')) || !!under || view.kind !== 'box';
  $('[data-back]').hidden = !cam; $('[data-menu-btn]').hidden = cam;
  document.body.classList.toggle('has-cam-sheet', cam);
}
function showCamSheet(id, pre = false) {
  hideToast();
  const d = sheet(id);
  under = null;
  clearSize(d);
  d.classList.toggle('is-pre', pre);
  qsHint(true, id);
  if (pre) setTimeout(() => reveal(id), 5000); // Sicherung: Panel nie dauerhaft unsichtbar
  if (current && current !== id) closeSheet({ silent: true, keepView: true });
  if (id !== 'station') renderSheet(id);
  if (!d.open) d.show();
  d.scrollTop = 0;
  current = id;
  if (history.state?.gl) history.replaceState({ gl: id }, ''); else history.pushState({ gl: id }, '');
  syncHud();
  setTimeout(() => $('.sheet__x', d)?.focus({ preventScroll: true }), 50);
}
// Panel erst zeigen, wenn die Kamera angekommen ist
function reveal(id) { if (current === id) sheet(id)?.classList.remove('is-pre'); }
function openInfo(id) {
  showCamSheet(id, true);
  goInfo(id).then((ok) => ok && reveal(id));
}
function closeSheet({ fromPop = false, silent = false, keepView = false } = {}) {
  if (!current) return;
  const id = current;
  qsHint(false, id); const d = sheet(id);
  if (id === 'klasse') pending = null;
  setTimeout(() => { if (current !== id) clearSize(d); }, 200);
  d.classList.add('is-closing');
  const finish = () => { d.classList.remove('is-closing'); if (d.open) d.close(); };
  if (reduced()) finish(); else setTimeout(finish, 180);
  current = null;
  const restore = !silent && under && !d.classList.contains('sheet--cam') ? under : null;
  if (restore) {
    under = null; current = restore;
    if (restore === 'station' && stationId) renderStation();
    syncHud();
    if (!fromPop && history.state?.gl) { skipPop = true; history.back(); }
    return;
  }
  if (d.classList.contains('sheet--cam')) {
    syncHud();
    if (id === 'station') { stationId = null; draft = null; }
    if (!keepView) goBox();
  }
  if (!fromPop && !silent && history.state?.gl) history.back();
}
// Rückkehr zum Tab / aus dem Verlauf: Bild sicherstellen und neu zeichnen
function softRecover() {
  const bg = boxes.cur;
  if (!bg || !bg.complete || !bg.naturalWidth) { const u = boxes.url; boxes.url = ''; boxes.cur = null; if (u) setBox(u, true); } else drawBg();
}
function recoverTextures() { if (!stage.world) return; softRecover(); try { syncPaint(); } catch {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') recoverTextures(); });
window.addEventListener('pageshow', recoverTextures);
window.addEventListener('popstate', () => { if (window.__qsOpen) return; if (skipPop) { skipPop = false; return; } if (current) closeSheet({ fromPop: true }); else if (view.kind !== 'box') goBox(); });

/* ---------- Panel ziehen: voll / normal / eingeklappt ---------- */
const wideLayout = () => G.desk; // Desktop: Panel steht fest an der Wand, kein Ziehen
function clearSize(d) {
  d.style.transition = ''; d.style.height = ''; d.style.maxHeight = ''; d.style.overflow = ''; delete d.dataset.pos;
}
function refitAnimated(ms = 420) {
  if (current == null) return;
  const token = ++camToken;
  if (view.kind === 'info') { const t = infoTarget(view.id); view.endS = t.s; camTo(t, ms, token); }
  else if (view.kind === 'svc') {
    const sv = svcView(svcById[view.id]);
    if (sv.clip) clipCamTo(clipTarget(sv.clip), ms, token);
    else camTo(zoomTarget(sv.zoom), ms, token);
  }
}
function bindSheetDrag() {
  for (const d of $$('dialog.sheet--cam')) {
    const head = $('.sheet__head', d); if (!head) continue;
    let st = null;
    head.addEventListener('pointerdown', (e) => {
      if (wideLayout() || d.classList.contains('is-pre') || e.target.closest('.sheet__x')) return;
      const pos = d.dataset.pos || 'def';
      const cur = d.offsetHeight;
      // Normalhöhe messen
      let defH = cur;
      if (pos !== 'def') {
        const keep = [d.style.height, d.style.maxHeight, d.style.overflow];
        d.style.transition = 'none'; d.style.height = ''; d.style.maxHeight = ''; d.style.overflow = '';
        defH = d.offsetHeight;
        [d.style.height, d.style.maxHeight, d.style.overflow] = keep;
      }
      st = { y0: e.clientY, cur, defH, pos, moved: false, id: e.pointerId };
      head.setPointerCapture(e.pointerId);
    });
    head.addEventListener('pointermove', (e) => {
      if (!st || e.pointerId !== st.id) return;
      const dy = e.clientY - st.y0;
      if (!st.moved && Math.abs(dy) < 6) return;
      st.moved = true;
      const fullH = Math.round(window.innerHeight * 0.92); const minH = head.offsetHeight + 8;
      const h = Math.max(minH, Math.min(fullH, st.cur - dy));
      d.style.transition = 'none'; d.style.maxHeight = 'none'; d.style.overflow = 'hidden'; d.style.height = `${h}px`;
      st.last = h;
    });
    const end = (e) => {
      if (!st || e.pointerId !== st.id) return;
      const s0 = st; st = null;
      const fullH = Math.round(window.innerHeight * 0.92); const minH = head.offsetHeight + 8;
      let to;
      if (!s0.moved) { if (s0.pos === 'def') return; to = 'def'; }
      else {
        const h = s0.last ?? s0.cur; const dy = e.clientY - s0.y0;
        if (s0.pos === 'def') to = dy < -24 ? 'full' : dy > 24 ? 'min' : 'def';
        else if (s0.pos === 'full') to = dy > 24 ? 'def' : 'full';
        else to = dy < -24 ? 'def' : 'min';
        if (to !== 'def' && Math.abs(h - s0.cur) < 6) to = s0.pos;
      }
      const T = to === 'full' ? fullH : to === 'min' ? minH : s0.defH;
      d.style.transition = 'height 320ms var(--ease)'; d.style.maxHeight = 'none'; d.style.overflow = 'hidden'; d.style.height = `${T}px`;
      d.dataset.pos = to;
      setTimeout(() => {
        if (d.dataset.pos !== to) return;
        if (to === 'def') clearSize(d); else { d.style.transition = ''; d.style.overflow = to === 'full' ? 'auto' : 'hidden'; }
        if (to !== 'full') refitAnimated();
      }, reduced() ? 0 : 340);
    };
    head.addEventListener('pointerup', end); head.addEventListener('pointercancel', end);
  }
}
function bindSheets() {
  bindSheetDrag();
  for (const d of $$('dialog.sheet')) {
    d.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(); });
    d.addEventListener('click', (e) => {
      if (e.target !== d || d.classList.contains('sheet--cam')) return;
      const r = d.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) closeSheet();
    });
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !window.__qsOpen && current && sheet(current).classList.contains('sheet--cam')) closeSheet(); });
  document.addEventListener('click', (e) => {
    const o = e.target.closest('[data-open],[data-pin-open]'); if (o) { openSheet(o.dataset.open || o.dataset.pinOpen); return; }
    if (e.target.closest('[data-close]')) { closeSheet(); return; }
    if (e.target.closest('[data-back]')) { if (current) closeSheet(); else goBox(); return; }
    const st = e.target.closest('[data-station],[data-hs]'); if (st) { openStation(st.dataset.station || st.dataset.hs); return; }
  });
}
function renderSheet(id) {
  if (id === 'fahrzeug') renderFahrzeug();
  if (id === 'auftrag') renderTicket(true);
  if (id === 'zeiten') renderStatus();
  if (id === 'klasse') renderKlasse();
}

/* ================= Leistungs-Stationen ================= */
let draft = null, stationId = null, pending = null;
function openStation(id) {
  const s = svcById[id]; if (!s) return;
  // Erst die Klasse, dann die Leistung: so stehen überall echte Preise
  if (!veh().cls) { pending = () => openStation(id); openSheet('klasse'); return; }
  if (current && !sheet(current).classList.contains('sheet--cam')) closeSheet({ silent: true, keepView: true });
  stationId = id;
  const have = veh().items[id];
  draft = have ? JSON.parse(JSON.stringify(have)) : {
    level: s.levels[Math.min(1, s.levels.length - 1)].id, addons: [],
    ...(s.options ? { opt: s.options.default } : {}),
    ...(id === 'folie' ? { color: 'nordlicht', finish: 'glanz', level: 'voll' } : {}),
  };
  $('[data-st-title]').textContent = s.name;
  sheet('station').dataset.size = id === 'folie' ? 'f' : 'm';
  renderStation();
  showCamSheet('station', true);
  goSvc(id).then((ok) => ok && reveal('station'));
}
function draftPrice(s, cls) {
  const tmp = { cls, items: { [s.id]: draft } };
  return lineItems(tmp).reduce((n, li) => n + li.price, 0);
}
function renderStation() {
  const s = svcById[stationId]; const v = veh(); const body = $('[data-st-body]');
  const c = clsById[v.cls]; const mult = c?.mult ?? 1;
  const inOrder = !!v.items[s.id];
  const lvl = s.levels.find((l) => l.id === draft.level) ?? s.levels[0];
  let h = '';
  if (s.hint && !inOrder) h += `<p class="st__hint">${esc(s.hint)}</p>`;
  const wrap = s.id === 'folie'; // Folie: immer Vollfolierung; Teil-Folierung steht unter den Preisen
  if (s.colors) {
    const cur = colorById(draft.color) ?? s.colors[0];
    h += `<div class="swrow" role="radiogroup" aria-label="Farbe">` +
      s.colors.map((col) => `<label class="swc"><input type="radio" name="st-color" value="${col.id}" ${draft.color === col.id ? 'checked' : ''}><i data-bg="${col.id}" aria-hidden="true"></i><span class="sr-only">${esc(col.name)}</span></label>`).join('') + `</div>` +
      `<p class="sw__cap"><b>${esc(cur.name)}</b>${cur.special ? ' <em>+30 %</em>' : ''}</p>` +
      `<div class="seg seg--tight">` + s.finishes.map((f) => `<label class="seg__opt"><input type="radio" name="st-finish" value="${f}" ${draft.finish === f ? 'checked' : ''}><span>${f}</span></label>`).join('') + `</div>`;
  }
  if (s.levels.length > 1 && !wrap) {
    h += `<div class="seg3" role="radiogroup" aria-label="${s.id === 'folie' ? 'Umfang' : 'Stufe'}">` +
      s.levels.map((l) => `<label class="seg3__o"><input type="radio" name="st-level" value="${l.id}" ${draft.level === l.id ? 'checked' : ''}><span class="seg3__n">${esc(l.name)}</span><span class="seg3__p">${euro(priceFor(l.base, mult))}</span></label>`).join('') + `</div>`;
  }
  h += `<p class="st__desc">${esc(lvl.desc)} · ${esc(lvl.dur)}</p>`;
  if (s.addons) h += s.addons.map((a) => `<label class="check"><input type="checkbox" name="st-addon" value="${a.id}" ${draft.addons?.includes(a.id) ? 'checked' : ''}><span>${esc(a.name)} <span class="opt">${esc(a.dur)} · ${euro(priceFor(a.base, mult))}</span></span></label>`).join('');
  if (s.options) h += `<div class="seg seg--tight" aria-label="${esc(s.options.label)}"><span class="seg__l">${esc(s.options.label)}</span>` +
    s.options.values.map((o) => `<label class="seg__opt"><input type="radio" name="st-opt" value="${o}" ${draft.opt === o ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('') + `</div>`;
  h += `<details class="allcls"><summary>Preise und Wissenswertes</summary><p class="muted small">${esc(s.tip)}</p><table><tbody>` +
    data.classes.map((k) => `<tr${k.id === v.cls ? ' class="is-cur"' : ''}><th scope="row">${esc(k.name)}</th><td>${euro(draftPrice(s, k.id))}</td></tr>`).join('') + `</tbody></table>` +
    (wrap ? `<p class="muted small">Auch möglich: ${s.levels.filter((l) => l.id !== 'voll').map((l) => `${esc(l.name)} ab ${euro(priceFor(l.base, mult))}`).join(', ')}. Sag uns das bei der Terminanfrage in der Nachricht.</p>` : '') + `</details>`;
  h += `<div class="st__bar"><p class="st__price"><span>${esc(c.name)}</span><strong data-st-price>${euro(draftPrice(s, v.cls))}</strong></p>
    <div class="st__btns">${inOrder ? `<button type="button" class="btn btn--ghost" data-st-remove>Ausbauen</button>` : ''}
    <button type="button" class="btn" data-st-add>${inOrder ? 'Übernehmen' : 'Hinzufügen'}</button></div></div>`;
  body.innerHTML = h;
  // Farben per CSSOM setzen (Inline-Styles aus innerHTML blockiert die CSP)
  for (const i of $$('[data-bg]', body)) i.style.background = colorById(i.dataset.bg)?.css ?? '';
}
function bindStation() {
  const body = $('[data-st-body]');
  body.addEventListener('change', (e) => {
    const t = e.target; const s = svcById[stationId]; if (!s) return;
    if (t.name === 'st-level') draft.level = t.value;
    if (t.name === 'st-opt') draft.opt = t.value;
    if (t.name === 'st-color') { draft.color = t.value; const c = colorById(t.value); if (c?.finish) draft.finish = c.finish; }
    if (t.name === 'st-finish') draft.finish = t.value;
    if (t.name === 'st-addon') draft.addons = $$('input[name="st-addon"]:checked', body).map((x) => x.value);
    const open = $('details.allcls', body)?.open; const y = sheet('station').scrollTop; const sx = $('.swrow', body)?.scrollLeft ?? 0;
    renderStation();
    if (open) $('details.allcls', body).open = true;
    sheet('station').scrollTop = y;
    const row = $('.swrow', body); if (row) row.scrollLeft = sx;
    $(`input[name="${t.name}"][value="${t.value}"]`, body)?.focus({ preventScroll: true });
    if (t.name === 'st-color' && row) row.scrollTo({ left: Math.max(0, $('.swc:has(input:checked)', row).offsetLeft - row.clientWidth / 2 + 24), behavior: 'auto' });
    if (s.id === 'folie') syncPaint();
  });
  body.addEventListener('click', (e) => {
    if (e.target.closest('[data-st-add]')) {
      const s = svcById[stationId];
      veh().items[s.id] = draft; save(); renderHud();
      const li = lineItems({ cls: veh().cls, items: { [s.id]: draft } })[0];
      closeSheet();
      toast(`${li.label} · ${euro(li.price)} hinzugefügt`, { label: 'Termin anfragen', run: () => openSheet('auftrag') });
    }
    if (e.target.closest('[data-st-remove]')) {
      const s = svcById[stationId]; delete veh().items[s.id]; save(); renderHud();
      closeSheet(); toast(`${s.name} entfernt.`);
    }
  });
}

/* ================= Fahrzeuge ================= */
const silSvg = (id) => `<img src="${import.meta.env.BASE_URL}media/klassen/${id}.webp" width="520" height="256" alt="" loading="lazy" decoding="async">`;
function renderFahrzeug() {
  const body = $('[data-fz-body]'); const v = veh();
  let h = `<fieldset class="st__group"><legend>Klasse von Fahrzeug ${state.active + 1}</legend><div class="cls">` +
    data.classes.map((k) => `<label class="cls__opt"><input type="radio" name="fz-cls" value="${k.id}" ${v.cls === k.id ? 'checked' : ''}>
      ${silSvg(k.id)}
      <span>${esc(k.name)} <small>×${String(k.mult).replace('.', ',')}</small></span></label>`).join('') + `</div></fieldset>`;
  h += `<h3 class="fz__h">Deine Fahrzeuge</h3><ul class="fz">` + state.vehicles.map((x, i) => {
    const li = lineItems(x); const sum = li.reduce((n, l) => n + l.price, 0);
    return `<li class="fz__item${i === state.active ? ' is-cur' : ''}">
      <button type="button" class="fz__pick" data-fz-pick="${i}" aria-pressed="${i === state.active}">
        <strong>Fahrzeug ${i + 1}</strong><span>${esc(clsById[x.cls]?.name ?? 'Klasse offen')}</span><span class="fz__sum">${Object.keys(x.items).length ? `${esc(Object.keys(x.items).map((k) => svcById[k]?.name).filter(Boolean).join(', '))} · zusammen ${euro(sum)}` : 'noch nichts gewählt'}</span></button>
      ${state.vehicles.length > 1 ? `<button type="button" class="fz__del" data-fz-del="${i}" aria-label="Fahrzeug ${i + 1} entfernen">✕</button>` : ''}</li>`;
  }).join('') + `</ul>`;
  if (state.vehicles.length < 4) h += `<button type="button" class="btn btn--ghost" data-fz-add>Weiteres Fahrzeug</button>`;
  body.innerHTML = h;
}
function renderKlasse() {
  $('[data-kl-body]').innerHTML = `<div class="cls">` + data.classes.map((k) => `<button type="button" class="cls__opt cls__btn" data-kl="${k.id}">
      ${silSvg(k.id)}
      <span>${esc(k.name)}</span><small>${esc(k.ex)}</small></button>`).join('') + `</div>`;
}
function bindKlasse() {
  $('[data-kl-body]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kl]'); if (!b) return;
    veh().cls = b.dataset.kl; save(); renderHud();
    const go = pending; pending = null;
    closeSheet();
    setTimeout(() => go?.(), 240);
  });
}
function vehicleChanged() { save(); renderHud(false); syncPaint(); renderFahrzeug(); }
function bindFahrzeug() {
  const body = $('[data-fz-body]');
  body.addEventListener('change', (e) => {
    if (e.target.name === 'fz-cls') { veh().cls = e.target.value; save(); renderHud(); renderFahrzeug(); setTimeout(() => { if (current === 'fahrzeug') closeSheet(); }, 320); }
  });
  body.addEventListener('click', (e) => {
    const p = e.target.closest('[data-fz-pick]');
    if (p) { state.active = +p.dataset.fzPick; vehicleChanged(); return; }
    const d = e.target.closest('[data-fz-del]');
    if (d) { const i = +d.dataset.fzDel; state.vehicles.splice(i, 1); state.active = Math.min(state.active, state.vehicles.length - 1); vehicleChanged(); return; }
    if (e.target.closest('[data-fz-add]')) {
      const id = Math.max(...state.vehicles.map((x) => x.id)) + 1;
      state.vehicles.push({ id, cls: veh().cls, items: {} }); state.active = state.vehicles.length - 1;
      vehicleChanged();
      toast(`Fahrzeug ${state.active + 1} steht jetzt in der Box.`);
    }
  });
}

/* ================= Auftrag ================= */
function ticketHtml() {
  const t = totals(); let h = '';
  state.vehicles.forEach((v, i) => {
    const li = lineItems(v); if (!li.length) return;
    h += `<div class="tk__veh"><p class="tk__vh">Fahrzeug ${i + 1} · ${esc(clsById[v.cls]?.name ?? 'Klasse offen')}</p><ul>` +
      li.map((l) => `<li><span>${esc(l.label)}${l.extra ? `<small>${esc(l.extra)}</small>` : ''}</span><b>${euro(l.price)}</b></li>`).join('') + `</ul></div>`;
  });
  if (!h) return `<p class="tk__empty">Noch keine Leistung gewählt. Du kannst trotzdem einen Termin anfragen, etwa für eine Beratung, oder vorher in der Box Leistungen und Preise ansehen.</p>`;
  if (t.discount) h += `<p class="tk__line"><span>Rabatt ${esc(resolveCode(state.code)?.code ?? '')}</span><b>−${euro(t.discount)}</b></p>`;
  h += `<p class="tk__line tk__sum"><span>Summe (ab)</span><b>${euro(t.total)}</b></p>`;
  return h;
}
// Kassenbon an der Kasse in der Box
function renderBon() {
  const list = $('[data-bon-list]'); if (!list) return;
  const items = state.vehicles.flatMap((v) => lineItems(v));
  list.innerHTML = items.length
    ? items.slice(0, 6).map((l) => `<li><span>${esc(l.label.replace(/^\+ /, '+'))}</span><b>${l.price}</b></li>`).join('') + (items.length > 6 ? `<li><span>… und ${items.length - 6} mehr</span></li>` : '')
    : '<li><span>noch leer</span></li>';
  $('[data-bon-sum]').textContent = euro(totals().total);
}
function printBon(el) {
  el.classList.remove('is-print'); void el.offsetWidth; if (!reduced()) el.classList.add('is-print');
}
function renderTicket(print = false) {
  const tk = $('[data-ticket]'); tk.innerHTML = ticketHtml();
  if (print) printBon(tk);
  const t = totals();
  $('[data-o-sum]').textContent = euro(t.total);
  $('[data-o-count]').textContent = t.count ? `${t.count} Leistung${t.count === 1 ? '' : 'en'}` : 'Noch nichts gewählt';
  paintCodeMsg();
}
// Aktionscode-Feld: prüft live, setzt state.code nur bei gültigem Code und zeigt das Ergebnis neben dem Feld
const CODE_HINT = 'Hast du einen Code, etwa von einer Aktion oder aus dem Spiel? Hier eintragen, der Rabatt erscheint in der Summe.';
function paintCodeMsg(final = false, submit = false) {
  const el = $('#o-code'), msg = $('[data-code-msg]'); if (!el) return false;
  const raw = el.value, rc = resolveCode(raw);
  let bad = false, txt = CODE_HINT, cls = '';
  if (!raw.trim()) { /* leer: Hinweis */ }
  else if (rc) {
    const t = totals();
    txt = t.discount
      ? `✓ Code gültig: −${site.discount.percent} % auf Pflegeleistungen (nicht auf Folie), Ersparnis ${euro(t.discount)}.`
      : `✓ Code gültig: −${site.discount.percent} % auf Pflegeleistungen (nicht auf Folie). Der Rabatt erscheint, sobald eine Pflegeleistung im Auftrag ist.`;
    cls = 'is-ok';
  } else if (final || submit || raw.trim().length >= 9) { txt = 'Dieser Code wird nicht erkannt. Bitte prüfe die Schreibweise oder leere das Feld.'; cls = 'is-bad'; bad = final || submit; }
  if (final || submit) el.setAttribute('aria-invalid', cls === 'is-bad' ? 'true' : 'false'); else if (cls !== 'is-bad') el.setAttribute('aria-invalid', 'false');
  msg.textContent = txt; msg.className = `hint ${cls}`.trim();
  return bad;
}
function applyCodeField(final = false, submit = false) {
  const el = $('#o-code'); if (!el) return false;
  const rc = resolveCode(el.value), prev = state.code;
  state.code = rc ? rc.code : null;
  if (rc && final && el.value !== rc.code) el.value = rc.code;
  if (state.code !== prev) { save(); renderHud(); }
  const bad = paintCodeMsg(final, submit);
  renderTicket();
  return submit && bad;
}
function bindOrder() {
  const f = $('[data-order]');
  const date = $('#o-date');
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  date.min = tomorrow.toISOString().slice(0, 10);
  const saved = store.get(FORM_KEY) || {};
  for (const [k, val] of Object.entries(saved)) {
    const el = f.elements[k]; if (!el || k === 'privacy') continue;
    if (el.type === 'checkbox') el.checked = !!val; else el.value = val;
  }
  f.addEventListener('input', () => {
    const o = {};
    for (const el of f.elements) if (el.name && el.name !== 'privacy') o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    store.set(FORM_KEY, o);
  });
  const codeEl = f.elements.code;
  codeEl.addEventListener('input', () => applyCodeField());
  codeEl.addEventListener('blur', () => applyCodeField(true));
  applyCodeField();
  const setErr = (el, errId, bad) => { el?.setAttribute('aria-invalid', bad ? 'true' : 'false'); $(`#${errId}`).hidden = !bad; return bad; };
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const els = f.elements; let bad = false;
    bad = setErr(els.name, 'e-name', !els.name.value.trim()) || bad;
    bad = setErr(els.tel, 'e-tel', els.tel.value.replace(/\D/g, '').length < 6) || bad;
    bad = setErr(els.email, 'e-mail', !!els.email.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(els.email.value)) || bad;
    const d = els.date.value ? new Date(`${els.date.value}T12:00:00`) : null;
    bad = setErr(els.date, 'e-date', !d || d.getDay() === 0 || els.date.value < date.min) || bad;
    bad = setErr(els.privacy, 'e-privacy', !els.privacy.checked) || bad;
    bad = applyCodeField(true, true) || bad;
    if (bad) { f.querySelector('[aria-invalid="true"]')?.focus(); return; }
    const when = d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    const nr = `GL-${String(Math.floor(1000 + Math.random() * 9000))}`;
    const today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    $('[data-done-list]').innerHTML = `<div class="slot"><div class="slot__win"><div class="ticket" data-bon>` +
      `<p class="tk__brand">${esc(site.name ?? 'Deister Autopflege')}</p><p class="tk__sub">Anfrage ${nr} · ${today}</p>` +
      (totals().count ? ticketHtml() : `<p class="tk__line"><span>Anfrage</span><b>Beratung vor Ort</b></p>`) +
      `<p class="tk__thanks">Danke für deine Anfrage! Wir melden uns innerhalb eines Werktags und bestätigen den Termin. Alle Preise sind Richtpreise („ab“), den genauen Preis nennen wir nach Sichtung des Fahrzeugs.</p></div></div></div>` +
      `<p class="tk__line"><span>Wunschtermin</span><b>${esc(when)}</b></p>` +
      (els.holbring.checked ? `<p class="tk__line"><span>Hol- und Bringservice</span><b>ja</b></p>` : '');
    f.hidden = true; $('[data-ticket]').closest('.slot').hidden = true;
    const done = $('[data-done]'); done.hidden = false; done.focus({ preventScroll: true }); $('#sheet-auftrag').scrollTop = 0; printBon($('[data-bon]'));
    store.del(FORM_KEY); f.reset();
    state = fresh(); save(); renderHud(); syncPaint(); applyCodeField();
  });
  $('[data-new-order]').addEventListener('click', () => {
    $('[data-done]').hidden = true; f.hidden = false; $('[data-ticket]').closest('.slot').hidden = false; renderTicket(true);
  });
}

/* ================= Quersteher-Challenge (Pasterei) ================= */
// Auto in der Spiel-Farbe: gewählte Folie des aktiven Fahrzeugs, sonst Silber
function carColor() {
  const sel = state.vehicles[state.active]?.items?.folie ?? state.vehicles.map((v) => v.items.folie).find(Boolean);
  const c = sel?.color && sel.color !== 'original' ? colorById(sel.color) : null;
  if (!c) return null;
  return c.ramp?.[c.ramp.length >> 1] ?? /#[0-9a-f]{6}/i.exec(c.css || '')?.[0] ?? null;
}
function claimCode(code) {
  const inp = $('#o-code'); if (!inp) return;
  inp.value = code; inp.dispatchEvent(new Event('input', { bubbles: true }));
  openSheet('auftrag');
  toast(`Code ${code} übernommen: −${site.discount.percent} % auf Pflegeleistungen.`);
  setTimeout(() => { try { inp.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); } catch {} }, 1500);
}
let qsLoading = false;
async function launchGame() {
  if (window.__qsOpen || qsLoading) return;
  qsLoading = true;
  try {
    const mod = await import('./quersteher/game.js');
    await mod.start({ color: carColor(), assetBase: `${import.meta.env.BASE_URL}media/quersteher/`, onClaim: claimCode, debug: location.search.includes('qsdebug') });
  } catch (err) { toast('Das Spiel konnte nicht geladen werden. Bitte versuch es noch einmal.'); }
  qsLoading = false;
}
// Versteckter Einstieg: geparktes Auto im Hinterhof auf der Karte (Station „Anfahrt“), 1 s halten = Handbremse
let qsHintT = 0;
function bindQs() {
  const hook = $('[data-qs-hook]'); if (!hook) return;
  let t = 0;
  const cancel = () => { clearTimeout(t); hook.classList.remove('is-press'); };
  hook.addEventListener('pointerdown', (e) => { e.stopPropagation(); cancel(); hook.classList.add('is-press'); try { navigator.vibrate?.(10); } catch {} t = setTimeout(() => { hook.classList.remove('is-press'); try { navigator.vibrate?.([20, 40, 20]); } catch {} launchGame(); }, 1000); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) hook.addEventListener(ev, cancel);
  hook.addEventListener('contextmenu', (e) => e.preventDefault());
  hook.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); launchGame(); } });
}
function qsHint(on, id) {
  clearTimeout(qsHintT);
  const hook = $('[data-qs-hook]'); if (!hook) return;
  hook.classList.remove('is-blink');
  if (on && id === 'anfahrt') qsHintT = setTimeout(() => hook.classList.add('is-blink'), 20000);
}

/* ================= Zeiten ================= */
function berlinNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  const idx = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday);
  return { day: idx, min: (+p.hour % 24) * 60 + +p.minute };
}
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
function openState() {
  const { day, min } = berlinNow(); const today = site.hours[day];
  if (today.open && min >= toMin(today.open) && min < toMin(today.close)) return { open: true, text: `Jetzt geöffnet, bis ${today.close} Uhr`, day };
  for (let i = 0; i < 8; i++) {
    const d = (day + i) % 7; const h = site.hours[d];
    if (!h.open) continue;
    if (i === 0 && min >= toMin(h.open)) continue;
    return { open: false, text: `Gerade geschlossen. Wieder offen ${i === 0 ? 'heute' : i === 1 ? 'morgen' : `am ${h.day}`} ab ${h.open} Uhr`, day };
  }
  return { open: false, text: 'Gerade geschlossen', day };
}
function renderStatus() {
  const s = openState();
  const el = $('[data-status]'); el.textContent = s.text; el.classList.toggle('is-open', s.open);
  $$('#sheet-zeiten tr[data-day]').forEach((tr) => tr.classList.toggle('is-today', +tr.dataset.day === s.day));
  for (const n of $$('[data-neon-state]')) { n.textContent = s.open ? 'Offen' : 'Zu'; n.classList.toggle('is-closed', !s.open); }
}

/* ================= Boxenfunk ================= */
function bindFunk() {
  const chat = $('[data-chat]'); const led = $('[data-led]');
  $('[data-chat-q]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]'); if (!b || b.disabled) return;
    const f = content.faq[+b.dataset.q]; b.disabled = true;
    const q = document.createElement('p'); q.className = 'msg msg--me'; q.textContent = f.q; chat.append(q);
    const a = document.createElement('p'); a.className = 'msg msg--box'; a.innerHTML = `<b>Box:</b> <span class="typing">…</span>`; chat.append(a);
    a.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    led.textContent = 'Empfange …'; led.classList.add('is-busy');
    setTimeout(() => { a.innerHTML = `<b>Box:</b> ${esc(f.a)}`; led.textContent = f.a; led.classList.remove('is-busy'); }, reduced() ? 0 : 650);
  });
}

/* ================= Gästebuch ================= */
let page = 0;
function bindBook() {
  const n = content.reviews.length;
  const show = () => {
    const r = content.reviews[page];
    $('[data-page-q]').textContent = r.text; $('[data-page-w]').textContent = r.who;
    $('[data-page-n]').textContent = `${page + 1} / ${n}`;
    $('[data-pager-n]').textContent = `Eintrag ${page + 1} von ${n}`;
    const ov = $('[data-ov="gaestebuch"]'); ov.classList.remove('is-flip'); void ov.offsetWidth; ov.classList.add('is-flip');
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-page]'); if (!b) return;
    page = (page + +b.dataset.page + n) % n; show();
  });
}

/* ================= Intro ================= */
function intro() {
  const box = $('[data-intro]'); const v = $('[data-intro-video]');
  const play = $('[data-intro-play]'); const skip = $('[data-intro-skip]');
  let ended = false;
  const end = async () => {
    if (ended) return; ended = true;
    v.pause();
    // Nie auf ein leeres Bild überblenden: warten, bis die Box gezeichnet ist (höchstens 1,5 s)
    await Promise.race([boxReady, sleep(1500)]);
    box.classList.add('is-out');
    setTimeout(() => { box.hidden = true; }, reduced() ? 0 : 360);
    document.body.classList.remove('in-intro');
    stage.mode = 'off';
    $('[data-stage]').removeAttribute('inert');
    document.body.classList.add('is-ready');
    // Nahaufnahmen und Kamerafahrten im Hintergrund vorladen
    setTimeout(() => { warmClips(); warmWraps(); }, 1200);
  };
  const begin = () => {
    const src = `${MEDIA}intro-${G.desk ? 'd' : 'm'}.mp4`;
    if (v.dataset.src !== src) { v.dataset.src = src; v.poster = `${MEDIA}poster-${G.desk ? 'd' : 'm'}.webp`; v.src = src; }
    ended = false; box.hidden = false; box.classList.remove('is-out'); play.hidden = true; document.body.classList.remove('is-ready');
    document.body.classList.add('in-intro'); $('[data-stage]').setAttribute('inert', '');
    stage.mode = 'off';
    if (reduced()) { end(); return; }
    try { v.currentTime = 0; } catch {}
    const p = v.play();
    if (p?.catch) p.catch(() => { play.hidden = false; });
  };
  // Letzte 0,3 s: Intro blendet in die Box über (letztes Intro-Bild und Box-Bild sind fast gleich)
  v.addEventListener('timeupdate', () => { if (!ended && v.duration && v.duration - v.currentTime < 0.3) end(); });
  v.addEventListener('ended', end);
  v.addEventListener('error', end);
  skip.addEventListener('click', end);
  play.addEventListener('click', () => { play.hidden = true; v.play().catch(end); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !ended) end(); });
  $('[data-replay]').addEventListener('click', () => { closeSheet(); setTimeout(begin, 200); });
  begin();
}

/* ================= Klassische Ansicht ================= */
function bindClassic() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-classic-on]')) { closeSheet(); document.documentElement.classList.add('mode-classic'); document.body.classList.replace('is-game', 'is-doc'); scrollTo(0, 0); }
    if (e.target.closest('[data-classic-off]')) { document.documentElement.classList.remove('mode-classic'); document.body.classList.replace('is-doc', 'is-game'); layout(true); }
  });
}

/* ================= Start ================= */
export async function start() {
  bindSheets(); bindStation(); bindFahrzeug(); bindKlasse(); bindOrder(); bindQs(); bindFunk(); bindBook(); bindClassic();
  renderHud(false); renderStatus(); setInterval(renderStatus, 60000);
  intro();
  await initStage();
  // Fürs Spiel später: Rabattcode setzen (z. B. aus der Drift-Challenge)
  if (location.search.includes('gltest')) window.__gl = { stage, boxes, view, G, get M() { return M; }, state: () => state }; // nur für tests/*.cjs
  window.glanzleistung = { setCode(code) { const r = resolveCode(code); if (!r) return false; state.code = r.code; save(); renderHud(); renderTicket(); return true; } };
}
