// Медовая нить к панели (только телефон): блок [data-honig], уходящий вверх из-под панели, тянет за собой нить.
// На MAX px она рвётся и втягивается. Нить — один SVG-путь, обновляется только пока идёт прокрутка (без WebGL, без постоянного цикла).
// Сама панель и пилюля — готовая текстура (CSS border-image), поэтому всегда стоят на месте.
const MAX = 110;
const SNAP_MS = 320;

type Strand = { el: HTMLElement; armed: boolean; snapAt: number; snapX: number };
const bar = document.querySelector<HTMLElement>('[data-bar]');
const pille = document.querySelector<HTMLElement>('[data-pille]');
const pfad = document.querySelector<SVGPathElement>('[data-faden-pfad]');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const wide = matchMedia('(min-width: 64rem)');
let strands: Strand[] = [];
let raf = 0, animUntil = 0;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
// Стержень: сверху радиус r0 (y0), посередине rm (ym), снизу r1 (y1)
const stab = (x: number, y0: number, r0: number, ym: number, rm: number, y1: number, r1: number) =>
  `M${x - r0} ${y0}Q${x - rm} ${ym} ${x - r1} ${y1}L${x + r1} ${y1}Q${x + rm} ${ym} ${x + r0} ${y0}Z`;

function frame(now: number) {
  raf = 0;
  if (!bar || !pfad) return;
  if (wide.matches || reduce.matches) { pfad.setAttribute('d', ''); return; }
  const b = bar.getBoundingClientRect();
  let T = b;
  if (pille && !pille.hidden) { const p = pille.getBoundingClientRect(); if (p.width > 4 && Number(getComputedStyle(pille).opacity) > 0.5) T = p; }
  const tL = T.left + T.height / 2, tR = T.right - T.height / 2, ty = T.top;
  let d = '';
  for (const s of strands) {
    const r = s.el.getBoundingClientRect();
    const visible = r.bottom > -60 && r.top < innerHeight && r.right > T.left && r.left < T.right;
    const dist = T.top - r.bottom;
    if (!visible) { s.armed = false; continue; }
    if (dist <= 2 && r.top < T.bottom) s.armed = true;
    const cx = Math.min(tR, Math.max(tL, Math.min(r.right - 34, Math.max(r.left + 34, (r.left + r.right) / 2))));
    const by = r.bottom;
    if (s.armed && dist > 0 && dist < MAX) {
      const t = dist / MAX;
      d += stab(cx, by - 2, lerp(24, 8, ease(t)), by + (ty - by) * 0.5, Math.max(1.4, lerp(11, 1.4, Math.pow(t, 0.7))), ty + 8, lerp(24, 11, t));
      animUntil = Math.max(animUntil, now + 60);
    } else if (s.armed && dist >= MAX) {
      s.armed = false; s.snapAt = now; s.snapX = cx; animUntil = Math.max(animUntil, now + SNAP_MS);
    }
    const k = (now - s.snapAt) / SNAP_MS;
    if (k >= 0 && k < 1) {
      const e = ease(k), len = (1 - e) * MAX * 0.45;
      if (len > 1.5) {
        d += stab(s.snapX, by - 2, lerp(14, 4, e), by + len * 0.3, lerp(4, 1, e), by + len * 0.6, lerp(3, 1, e));
        d += stab(s.snapX, ty + 8, lerp(18, 6, e), ty - len * 0.3, lerp(5, 1.4, e), ty - len, lerp(3, 1, e));
      }
    }
  }
  pfad.setAttribute('d', d);
  if (now < animUntil) raf = requestAnimationFrame(frame);
}

function kick(ms = 0) {
  animUntil = Math.max(animUntil, performance.now() + ms);
  if (!raf) raf = requestAnimationFrame(frame);
}

export const honig = {
  start() {
    strands = [...document.querySelectorAll<HTMLElement>('[data-honig]')].map((el) => ({ el, armed: false, snapAt: -1e9, snapX: 0 }));
    addEventListener('scroll', () => kick(90), { passive: true });
    addEventListener('resize', () => kick(90));
    kick(100);
  },
  pulse() { kick(300); },
};
