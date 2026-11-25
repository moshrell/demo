// Sechsgang: Schalthebel-Navigation. Geometrie (viewBox 300 x 200) muss zu index.astro passen.
const VW = 300, VH = 200;
const COLS = [40, 113.33, 186.67, 260];
const Y = [40, 100, 160];
const NX = (COLS[1] + COLS[2]) / 2;
const ORDER = ['R', 'N', '1', '2', '3', '4', '5', '6'];
const ID = { R: 'r', N: 'n', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6' };
const KEY_OF_ID = Object.fromEntries(Object.entries(ID).map(([k, v]) => [v, k]));
const SLOT = {
  R: { x: COLS[0], y: Y[0], c: 0 },
  1: { x: COLS[1], y: Y[0], c: 1 }, 2: { x: COLS[1], y: Y[2], c: 1 },
  3: { x: COLS[2], y: Y[0], c: 2 }, 4: { x: COLS[2], y: Y[2], c: 2 },
  5: { x: COLS[3], y: Y[0], c: 3 }, 6: { x: COLS[3], y: Y[2], c: 3 },
  N: { x: NX, y: Y[1], c: -1 },
};
const PARTNER = { 1: '2', 2: '1', 3: '4', 4: '3', 5: '6', 6: '5' };
const SPEED = { R: 'rückwärts', N: '0 km/h', 1: '20 km/h', 2: '40 km/h', 3: '60 km/h', 4: '80 km/h', 5: '110 km/h', 6: '130 km/h' };
const REV = { R: 0.28, N: 0.12, 1: 0.26, 2: 0.38, 3: 0.5, 4: 0.62, 5: 0.76, 6: 0.9 };

const root = document.querySelector('[data-cockpit]');
const gate = document.querySelector('[data-gate]');
const knob = document.querySelector('[data-knob]');
if (root && gate && knob) init();

function init() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const panels = [...document.querySelectorAll('.panel[data-gear]')];
  const tabs = [...document.querySelectorAll('[data-tab]')];
  const labels = [...gate.querySelectorAll('[data-gl]')];
  const el = {
    big: document.querySelector('[data-big]'),
    name: document.querySelector('[data-name]'),
    speed: document.querySelector('[data-speed]'),
    knobD: knob.querySelector('[data-knob-d]'),
    rev: document.querySelector('[data-rev]'),
    list: document.querySelector('[data-list]'),
    listBtn: document.querySelector('[data-list-toggle]'),
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
  };

  let gear = 'N';
  let pos = { x: NX, y: Y[1] };
  let mode = 'lane';
  let col = -1;
  let dragging = false;
  let grab = { dx: 0, dy: 0 };
  let anim = 0;
  let interacted = false;
  let nudgeTimer = 0;

  /* ---------- Haptik ---------- */
  const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };

  /* ---------- Knauf setzen ---------- */
  const setKnob = (x, y) => {
    pos = { x, y };
    knob.style.setProperty('--kx', (x / VW * 100).toFixed(2));
    knob.style.setProperty('--ky', (y / VH * 100).toFixed(2));
    knob.style.setProperty('--lx', ((x - NX) / 110).toFixed(3));
    knob.style.setProperty('--ly', ((y - Y[1]) / 60).toFixed(3));
  };
  const deriveMode = () => {
    let c = 0;
    COLS.forEach((cx, i) => { if (Math.abs(pos.x - cx) < Math.abs(pos.x - COLS[c])) c = i; });
    if (Math.abs(pos.y - Y[1]) > 1.5 && Math.abs(pos.x - COLS[c]) < 3) { mode = 'col'; col = c; } else { mode = 'lane'; col = -1; }
  };

  /* ---------- Gang einlegen: Seite wechseln ---------- */
  const paintLabels = () => labels.forEach((l) => l.classList.toggle('is-active', l.dataset.gl === gear));
  function setGear(key, opts = {}) {
    if (!ORDER.includes(key)) return;
    const changed = key !== gear;
    gear = key;
    if (changed) { setMini(false); lastTop = 0; anchor = 0; }
    const idx = ORDER.indexOf(key);
    const dist = Math.abs(idx - Number(root.style.getPropertyValue('--i') || 1));
    root.style.setProperty('--dur', (reduce.matches || opts.instant) ? '0ms' : `${clamp(380 + dist * 70, 380, 800)}ms`);
    root.style.setProperty('--i', String(idx));
    panels.forEach((p) => {
      const on = p.dataset.gear === key;
      p.inert = !on;
      p.setAttribute('aria-hidden', on ? 'false' : 'true');
    });
    tabs.forEach((t) => {
      const on = t.dataset.tab === key;
      t.setAttribute('aria-selected', String(on));
      if (on && el.name) el.name.textContent = t.dataset.title;
    });
    el.big.textContent = key;
    el.knobD.textContent = key;
    el.speed.textContent = SPEED[key];
    paintLabels();
    if (changed && !opts.instant) {
      el.rev.classList.add('is-dip');
      el.rev.style.setProperty('--rev', '0.1');
      setTimeout(() => { el.rev.classList.remove('is-dip'); el.rev.style.setProperty('--rev', String(REV[key])); }, 110);
    } else {
      el.rev.style.setProperty('--rev', String(REV[key]));
    }
    if (changed && opts.user) {
      buzz(key === 'N' ? 6 : 14);
      const h = `#${ID[key]}`;
      if (location.hash !== h) { try { history.pushState(null, '', h); } catch {} }
    }
  }

  /* ---------- Bewegung entlang der Kulisse ---------- */
  const cancelAnim = () => { if (anim) { cancelAnimationFrame(anim); anim = 0; } };
  function run(points, duration, onProgress, done) {
    cancelAnim();
    const segs = [];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const l = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      segs.push(l); total += l;
    }
    if (total < 0.5 || duration <= 0) { const p = points[points.length - 1]; setKnob(p.x, p.y); deriveMode(); onProgress && onProgress(1); done && done(); return; }
    const t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const tick = (now) => {
      const t = clamp((now - t0) / duration, 0, 1);
      let d = ease(t) * total;
      let i = 0;
      while (i < segs.length - 1 && d > segs[i]) { d -= segs[i]; i++; }
      const k = segs[i] ? d / segs[i] : 1;
      const a = points[i], b = points[i + 1];
      setKnob(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k);
      onProgress && onProgress(t, i, segs.length);
      if (t < 1) anim = requestAnimationFrame(tick);
      else { anim = 0; deriveMode(); done && done(); }
    };
    anim = requestAnimationFrame(tick);
  }
  function pathTo(key) {
    const s = SLOT[key];
    const pts = [{ x: pos.x, y: pos.y }];
    deriveMode();
    if (mode === 'col') pts.push({ x: COLS[col], y: Y[1] });
    if (key === 'N') { pts.push({ x: NX, y: Y[1] }); return pts; }
    pts.push({ x: s.x, y: Y[1] });
    if (s.y !== Y[1]) pts.push({ x: s.x, y: s.y });
    return pts;
  }
  /** Programmatisch schalten (Karte, Tab, Tastatur, Zurück-Taste). */
  function goTo(key, { user = true } = {}) {
    if (!ORDER.includes(key)) return;
    if (user) markInteracted();
    closeList();
    if (reduce.matches) { const s = SLOT[key]; setKnob(s.x, s.y); deriveMode(); setGear(key, { user }); return; }
    const pts = pathTo(key);
    let fired = false;
    const total = pts.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);
    const dur = clamp(260 + total * 2.4, 320, 900);
    run(pts, dur, (t, i, n) => {
      // Seite wechselt, sobald der Hebel in die letzte Gasse einbiegt (bei N kurz vor dem Ziel)
      if (!fired && (key === 'N' ? t > 0.7 : i >= n - 1 || t >= 1)) { fired = true; setGear(key, { user }); }
    }, () => { if (!fired) setGear(key, { user }); });
  }

  /* ---------- Ziehen ---------- */
  const toVB = (e) => {
    const r = gate.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * VW, y: (e.clientY - r.top) / r.height * VH };
  };
  function step(t) {
    const T = 7;
    let { x, y } = pos;
    if (mode === 'col') {
      const yMax = col === 0 ? Y[1] : Y[2];
      y = clamp(t.y, Y[0], yMax);
      if (Math.abs(t.y - Y[1]) <= T) { mode = 'lane'; y = Y[1]; x = COLS[col]; col = -1; }
      else x = COLS[col];
    } else {
      y = Y[1];
      x = clamp(x + (t.x - x) * 0.6, COLS[0], COLS[3]);
      if (Math.abs(x - NX) < 9) x = NX + (x - NX) * 0.4;
      for (let i = 0; i < COLS.length; i++) {
        if (Math.abs(x - COLS[i]) < 16) {
          const up = t.y - Y[1] < -T * 1.4;
          const down = t.y - Y[1] > T * 1.4 && i > 0;
          if (up || down) { mode = 'col'; col = i; x = COLS[i]; y = clamp(t.y, Y[0], i === 0 ? Y[1] : Y[2]); break; }
        }
      }
    }
    setKnob(x, y);
    if (mode === 'col') {
      let k = null;
      if (y <= Y[0] + 3) k = col === 0 ? 'R' : String(col * 2 - 1);
      else if (col > 0 && y >= Y[2] - 3) k = String(col * 2);
      if (k && k !== gear) setGear(k, { user: true });
    }
  }
  knob.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    cancelAnim(); deriveMode();
    dragging = true;
    try { knob.setPointerCapture(e.pointerId); } catch {}
    knob.classList.add('is-drag');
    const p = toVB(e);
    grab = { dx: pos.x - p.x, dy: pos.y - p.y };
    markInteracted();
    e.preventDefault();
  });
  knob.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const p = toVB(e);
    step({ x: p.x + grab.dx, y: p.y + grab.dy });
    e.preventDefault();
  });
  const release = () => {
    if (!dragging) return;
    dragging = false;
    knob.classList.remove('is-drag');
    if (mode === 'col') {
      const toTop = pos.y - Y[0];
      const toBot = col > 0 ? Y[2] - pos.y : 999;
      if (Math.min(toTop, toBot) <= 22) {
        const k = toTop <= toBot ? (col === 0 ? 'R' : String(col * 2 - 1)) : String(col * 2);
        if (k !== gear) setGear(k, { user: true });
        run([{ x: pos.x, y: pos.y }, { x: SLOT[k].x, y: SLOT[k].y }], 160);
      } else goTo(gear, { user: false });
    } else if (Math.abs(pos.x - NX) <= 14) {
      if (gear !== 'N') setGear('N', { user: true });
      run([{ x: pos.x, y: pos.y }, { x: NX, y: Y[1] }], 140);
    } else goTo(gear, { user: false });
  };
  knob.addEventListener('pointerup', release);
  knob.addEventListener('pointercancel', release);
  knob.addEventListener('lostpointercapture', release);

  /* ---------- Tastatur ---------- */
  knob.addEventListener('keydown', (e) => {
    const i = ORDER.indexOf(gear);
    let next = null;
    if (e.key === 'ArrowRight') next = ORDER[Math.min(ORDER.length - 1, i + 1)];
    else if (e.key === 'ArrowLeft') next = ORDER[Math.max(0, i - 1)];
    else if (e.key === 'ArrowUp' && PARTNER[gear] && SLOT[gear].y === Y[2]) next = PARTNER[gear];
    else if (e.key === 'ArrowDown' && PARTNER[gear] && SLOT[gear].y === Y[0]) next = PARTNER[gear];
    else if (e.key === 'Home') next = 'R';
    else if (e.key === 'End') next = '6';
    else if (e.key === 'Escape') next = 'N';
    if (next) { e.preventDefault(); markInteracted(); goTo(next); }
  });

  /* ---------- Karten, Tabs, Links, Liste ---------- */
  function closeList() { el.list.classList.remove('is-open'); el.listBtn?.setAttribute('aria-expanded', 'false'); }
  el.listBtn?.addEventListener('click', () => {
    const open = !el.list.classList.contains('is-open');
    el.list.classList.toggle('is-open', open);
    el.listBtn.setAttribute('aria-expanded', String(open));
    markInteracted();
  });
  tabs.forEach((t) => t.addEventListener('click', () => { markInteracted(); goTo(t.dataset.tab); }));
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-goto]');
    if (!a) return;
    const key = KEY_OF_ID[a.dataset.goto];
    if (!key) return;
    e.preventDefault();
    markInteracted();
    goTo(key);
  });
  document.addEventListener('click', (e) => {
    if (el.list.classList.contains('is-open') && !e.target.closest('[data-list], [data-list-toggle]')) closeList();
  });

  /* ---------- Adresse (#1, #r, ...) ---------- */
  const fromHash = () => KEY_OF_ID[location.hash.replace('#', '').toLowerCase()] || null;
  window.addEventListener('popstate', () => { const k = fromHash() || 'N'; goTo(k, { user: false }); });

  /* ---------- Tastatur am Handy: Dock weg, solange getippt wird ---------- */
  const small = window.matchMedia('(max-width: 899px)');
  document.addEventListener('focusin', (e) => { if (small.matches && e.target.matches('input:not([type=radio]):not([type=checkbox]):not([type=range]), textarea, select')) document.body.classList.add('kbd'); });
  document.addEventListener('focusout', () => setTimeout(() => {
    if (!document.activeElement || !document.activeElement.matches('input:not([type=radio]):not([type=checkbox]):not([type=range]), textarea, select')) document.body.classList.remove('kbd');
  }, 60));

  /* ---------- Dock beim Lesen einklappen (Handy-Layout) ---------- */
  const dock = document.querySelector('.dock');
  const wide = window.matchMedia('(min-width: 900px)');
  let mini = false, lock = 0, lastTop = 0, anchor = 0;
  const setMini = (v) => {
    if (!dock || mini === v) return;
    mini = v; dock.classList.toggle('is-min', v); lock = performance.now() + 500;
    if (v) closeList();
  };
  panels.forEach((p) => p.addEventListener('scroll', () => {
    if (wide.matches || p.dataset.gear !== gear) return;
    const t = p.scrollTop;
    if (performance.now() < lock) { lastTop = t; anchor = t; return; }
    if (t > lastTop) anchor = t;
    if (!mini && t > 90 && t > lastTop + 1) setMini(true);
    else if (mini && (t < 24 || anchor - t > 70)) setMini(false);
    lastTop = t;
  }, { passive: true }));
  document.querySelector('[data-dock-open]')?.addEventListener('click', () => { setMini(false); knob.focus({ preventScroll: true }); });
  wide.addEventListener?.('change', () => setMini(false));

  /* ---------- Hinweis: Hebel zuckt (bei jedem Laden), bis er benutzt wurde ---------- */
  function markInteracted() {
    if (interacted) return;
    interacted = true;
    clearTimeout(nudgeTimer);
    knob.classList.remove('is-tease');
    document.querySelector('.shifthint')?.setAttribute('data-done', '');
  }
  function nudge() {
    if (interacted) return;
    if (dragging || gear !== 'N' || anim || document.hidden) { nudgeTimer = setTimeout(nudge, 3000); return; }
    knob.classList.add('is-tease');
    const c = COLS[1];
    const pts = reduce.matches
      ? [{ x: NX, y: Y[1] }]
      : [{ x: NX, y: Y[1] }, { x: c, y: Y[1] }, { x: c, y: 68 }, { x: c, y: Y[1] }, { x: NX, y: Y[1] }];
    run(pts, 2300, null, () => { nudgeTimer = setTimeout(nudge, 4500); });
  }

  /* ---------- Start ---------- */
  root.classList.add('no-anim');
  const startKey = fromHash() || 'N';
  const s0 = SLOT[startKey];
  setKnob(s0.x, s0.y); deriveMode();
  setGear(startKey, { instant: true });
  requestAnimationFrame(() => requestAnimationFrame(() => { root.classList.remove('no-anim'); root.style.setProperty('--dur', '560ms'); }));
  if (startKey === 'N') nudgeTimer = setTimeout(nudge, 900);

  // Test- und Debug-Zugang (nur lesend)
  window.sgGear = () => gear;
}
