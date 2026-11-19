// Медовая панель внизу: WebGL-мёд (honig-gl.ts) из овала панели, пилюли с итогом (жидкая перемычка) и нитей
// к медовым блокам [data-honig]. Блок, уходящий вверх из-под панели, тянет нить; на MAX px она рвётся,
// капли втягиваются. Под мёдом — размытие фона (backdrop-filter) по форме панели и пилюли.
// Без WebGL: html.no-gl, панель и пилюля получают CSS-заливку. prefers-reduced-motion: без нитей.
import { HonigGL, type Cap, type RRect } from './honig-gl';

const MAX = 110;
const SNAP_MS = 320;
const PILL_MS = 480;

type Strand = { el: HTMLElement; armed: boolean; snapAt: number; snapX: number };

const canvas = document.querySelector<HTMLCanvasElement>('[data-honig-canvas]');
const layer = canvas?.parentElement as HTMLElement | null;
const bar = document.querySelector<HTMLElement>('[data-bar]');
const pille = document.querySelector<HTMLElement>('[data-pille]');
const blurBar = document.querySelector<HTMLElement>('[data-blur-bar]');
const blurPille = document.querySelector<HTMLElement>('[data-blur-pille]');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
let gl: HonigGL | null = null;
let strands: Strand[] = [];
let raf = 0, animUntil = 0;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
function place(el: HTMLElement | null, r: DOMRect | null, top = 0) {
  if (!el) return;
  if (!r) { el.style.opacity = '0'; return; }
  el.style.opacity = '1';
  el.style.transform = `translate(${r.left}px, ${r.top - top}px)`;
  el.style.width = `${r.width}px`; el.style.height = `${r.height}px`;
}

function frame(now: number) {
  raf = 0;
  if (!layer || !bar) return;
  const top = layer.getBoundingClientRect().top;
  const b = bar.getBoundingClientRect();
  const rects: RRect[] = [{ x: b.left, y: b.top - top, w: b.width, h: b.height, r: b.height / 2 }];
  const caps: Cap[] = [];
  let T = { left: b.left, right: b.right, top: b.top, bottom: b.bottom, h: b.height };
  let pr: DOMRect | null = null;
  if (pille && !pille.hidden) {
    const p = pille.getBoundingClientRect();
    if (p.width > 4 && Number(getComputedStyle(pille).opacity) > 0.05) {
      pr = p;
      rects.push({ x: p.left, y: p.top - top, w: p.width, h: p.height, r: p.height / 2 });
      if (b.top - p.bottom > -4) {
        const cx = p.left + p.width / 2;
        caps.push({ x0: cx, y0: p.bottom - top - 6, r0: Math.min(16, p.height * 0.34), x1: cx, y1: b.top - top + 8, r1: Math.min(26, p.height * 0.55) });
      }
      T = { left: p.left, right: p.right, top: p.top, bottom: p.bottom, h: p.height };
    }
  }
  place(blurBar, b, top); place(blurPille, pr, top);

  if (!reduce.matches) {
    const tL = T.left + T.h / 2, tR = T.right - T.h / 2, ty = T.top - top;
    for (const s of strands) {
      const r = s.el.getBoundingClientRect();
      const visible = r.bottom > -60 && r.top < innerHeight && r.right > T.left && r.left < T.right;
      const dist = T.top - r.bottom;
      if (!visible) { s.armed = false; continue; }
      if (dist <= 2 && r.top < T.bottom) s.armed = true;
      const cx = Math.min(tR, Math.max(tL, Math.min(r.right - 34, Math.max(r.left + 34, (r.left + r.right) / 2))));
      const by = r.bottom - top;
      if (s.armed && dist > 0 && dist < MAX) {
        const t = dist / MAX;
        const rTop = lerp(26, 9, ease(t)), rMid = Math.max(1.1, lerp(12, 1.1, Math.pow(t, 0.7))), rBot = Math.min(T.h * 0.5, lerp(26, 12, t));
        const my = by + (ty - by) * 0.5;
        rects.push({ x: cx - rTop * 2.2, y: by - 10, w: rTop * 4.4, h: 12, r: 6 });
        caps.push({ x0: cx, y0: by - 2, r0: rTop, x1: cx, y1: my, r1: rMid });
        caps.push({ x0: cx, y0: my, r0: rMid, x1: cx, y1: ty + 6, r1: rBot });
        animUntil = Math.max(animUntil, now + 60);
      } else if (s.armed && dist >= MAX) {
        s.armed = false; s.snapAt = now; s.snapX = cx;
        animUntil = Math.max(animUntil, now + SNAP_MS);
      }
      const k = (now - s.snapAt) / SNAP_MS;
      if (k >= 0 && k < 1) {
        const e = ease(k), len = (1 - e) * MAX * 0.45;
        if (len > 1.5) {
          rects.push({ x: s.snapX - lerp(20, 8, e), y: by - 10, w: lerp(40, 16, e), h: 12, r: 6 });
          caps.push({ x0: s.snapX, y0: by - 2, r0: lerp(10, 3, e), x1: s.snapX, y1: by + len * 0.6, r1: lerp(4, 1, e) });
          caps.push({ x0: s.snapX, y0: ty + 6, r0: lerp(18, 6, e), x1: s.snapX, y1: ty - len, r1: lerp(5, 1.5, e) });
        }
      }
    }
  }
  gl?.draw({ rects, caps, k: 16, shadow: 0.3, bright: 1.08 });
  if (now < animUntil) raf = requestAnimationFrame(frame);
}

function kick(ms = 0) {
  animUntil = Math.max(animUntil, performance.now() + ms);
  if (!raf) raf = requestAnimationFrame(frame);
}

export const honig = {
  start() {
    if (!canvas || !layer) return;
    gl = new HonigGL(canvas, 2);
    if (!gl.ok) { document.documentElement.classList.add('no-gl'); gl = null; }
    strands = [...document.querySelectorAll<HTMLElement>('[data-honig]')].map((el) => ({ el, armed: false, snapAt: -1e9, snapX: 0 }));
    addEventListener('scroll', () => kick(90), { passive: true });
    addEventListener('resize', () => kick(90));
    visualViewport?.addEventListener('resize', () => kick(90));
    reduce.addEventListener?.('change', () => kick());
    document.fonts?.ready.then(() => kick(100));
    kick(200);
  },
  pulse() { kick(PILL_MS); },
};
