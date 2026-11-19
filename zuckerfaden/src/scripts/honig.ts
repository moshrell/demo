// Медовая панель: одно «стекло» (backdrop-filter) обрезается контуром clip-path: path(), в котором
// объединены овал панели, пилюля с итогом (с перемычкой) и нити к медовым блокам [data-honig].
// Блок, ушедший из-под панели вверх, тянет за собой нить; на расстоянии MAX она рвётся и капли втягиваются.
// Всё считается только во время прокрутки/анимации; prefers-reduced-motion — без нитей.

const MAX = 104;           // px: длина, после которой нить рвётся
const SNAP_MS = 300;
const PILL_MS = 420;

type Strand = { el: HTMLElement; armed: boolean; snapAt: number; snapX: number; snapTop: number; snapW: number };

const glas = document.querySelector<HTMLElement>('[data-glas]');
const kontur = document.querySelector<SVGPathElement>('[data-kontur]');
const layer = glas?.parentElement as HTMLElement | null;
const bar = document.querySelector<HTMLElement>('[data-bar]');
const pille = document.querySelector<HTMLElement>('[data-pille]');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

let strands: Strand[] = [];
let raf = 0;
let animUntil = 0;
let lastPath = '';

const f = (n: number) => Math.round(n * 10) / 10;
function rrect(x: number, y: number, w: number, h: number, r = h / 2) {
  r = Math.min(r, h / 2, w / 2);
  return `M${f(x + r)} ${f(y)}H${f(x + w - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(y + r)}V${f(y + h - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w - r)} ${f(y + h)}H${f(x + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + h - r)}V${f(y + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)}Z`;
}
// Перемычка-«песочные часы» между yT (сверху) и yB (снизу); по часовой, как и овалы, чтобы nonzero объединял.
function neck(cx: number, yT: number, yB: number, wT: number, wM: number, wB: number) {
  const h = yB - yT, ym = yT + h * 0.5;
  const R = (w: number) => cx + w / 2, L = (w: number) => cx - w / 2;
  return `M${f(R(wT))} ${f(yT)}C${f(R(wT))} ${f(yT + h * 0.32)} ${f(R(wM))} ${f(ym - h * 0.2)} ${f(R(wM))} ${f(ym)}C${f(R(wM))} ${f(ym + h * 0.2)} ${f(R(wB))} ${f(yB - h * 0.32)} ${f(R(wB))} ${f(yB)}`
    + `L${f(L(wB))} ${f(yB)}C${f(L(wB))} ${f(yB - h * 0.32)} ${f(L(wM))} ${f(ym + h * 0.2)} ${f(L(wM))} ${f(ym)}C${f(L(wM))} ${f(ym - h * 0.2)} ${f(L(wT))} ${f(yT + h * 0.32)} ${f(L(wT))} ${f(yT)}Z`;
}
// Капля-конус: широкое основание на yBase, вершина на yTip (вверх или вниз).
function cone(cx: number, yBase: number, yTip: number, w: number) {
  const h = yTip - yBase;
  return `M${f(cx + w / 2)} ${f(yBase)}C${f(cx + w / 2)} ${f(yBase + h * 0.45)} ${f(cx + w * 0.12)} ${f(yTip - h * 0.08)} ${f(cx)} ${f(yTip)}C${f(cx - w * 0.12)} ${f(yTip - h * 0.08)} ${f(cx - w / 2)} ${f(yBase + h * 0.45)} ${f(cx - w / 2)} ${f(yBase)}Z`;
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

function frame(now: number) {
  raf = 0;
  if (!layer || !bar || !glas || !kontur) return;
  const top = layer.getBoundingClientRect().top;
  const b = bar.getBoundingClientRect();
  const by = b.top - top;
  let d = rrect(b.left, by, b.width, b.height);

  // Пилюля с итогом + перемычка к панели. Нити цепляются за самый верхний медовый элемент (пилюля или панель).
  let T = { left: b.left, right: b.right, top: b.top, bottom: b.bottom, height: b.height };
  if (pille && !pille.hidden) {
    const p = pille.getBoundingClientRect();
    if (p.width > 4 && getComputedStyle(pille).visibility !== 'hidden') {
      const py = p.top - top;
      d += rrect(p.left, py, p.width, p.height);
      const gap = by - (py + p.height);
      if (gap > 0) {
        const cx = p.left + p.width / 2, w = Math.min(p.width * 0.42, 64);
        d += neck(cx, py + p.height - 8, by + 8, w, w * 0.7, w * 1.1);
      }
      if (p.height > 20) T = { left: p.left, right: p.right, top: p.top, bottom: p.bottom, height: p.height };
    }
  }

  // Нити к медовым блокам
  if (!reduce.matches) {
    const bL = T.left + T.height / 2, bR = T.right - T.height / 2, ty = T.top - top;
    for (const s of strands) {
      const r = s.el.getBoundingClientRect();
      const visible = r.bottom > -50 && r.top < innerHeight && r.right > T.left && r.left < T.right;
      const dist = T.top - r.bottom; // >0: нижний край блока выше пилюли/панели
      if (!visible) { s.armed = false; continue; }
      if (dist <= 2 && r.top < T.bottom) s.armed = true; // блок касается панели или под ней
      const cx = Math.min(bR, Math.max(bL, Math.min(r.right - 30, Math.max(r.left + 30, (r.left + r.right) / 2))));
      const wBlock = Math.min(r.width - 8, 132);
      if (s.armed && dist > 0 && dist < MAX) {
        const t = dist / MAX;
        const wT = lerp(wBlock, 30, ease(t)), wB = Math.min(T.height * 1.9, lerp(124, 48, t)), wM = Math.max(1.6, wT * 0.62 * Math.pow(1 - t, 1.35));
        d += neck(cx, r.bottom - top - 4, ty + 8, wT, wM, wB);
        animUntil = Math.max(animUntil, now + 60);
      } else if (s.armed && dist >= MAX) {
        s.armed = false; s.snapAt = now; s.snapX = cx; s.snapTop = r.bottom - top; s.snapW = wBlock;
        animUntil = Math.max(animUntil, now + SNAP_MS);
      }
      // Разрыв: верхняя капля уходит к блоку, нижняя втягивается в панель
      const k = (now - s.snapAt) / SNAP_MS;
      if (k >= 0 && k < 1) {
        const e = ease(k), len = (1 - e) * MAX * 0.42;
        const topNow = r.bottom - top;
        if (len > 1) {
          d += cone(s.snapX, topNow - 3, topNow - 3 + len * 0.7, lerp(34, 6, e));
          d += cone(s.snapX, ty + 6, ty + 6 - len, lerp(48, 10, e));
        }
      }
    }
  }

  if (d !== lastPath) {
    lastPath = d;
    glas.style.clipPath = `path('${d}')`;
    kontur.setAttribute('d', d);
  }
  if (now < animUntil) raf = requestAnimationFrame(frame);
}

function kick(ms = 0) {
  animUntil = Math.max(animUntil, performance.now() + ms);
  if (!raf) raf = requestAnimationFrame(frame);
}

export const honig = {
  start() {
    if (!layer) return;
    strands = [...document.querySelectorAll<HTMLElement>('[data-honig]')].map((el) => ({ el, armed: false, snapAt: -1e9, snapX: 0, snapTop: 0, snapW: 0 }));
    addEventListener('scroll', () => kick(80), { passive: true });
    addEventListener('resize', () => kick(80));
    visualViewport?.addEventListener('resize', () => kick(80));
    reduce.addEventListener?.('change', () => kick());
    document.fonts?.ready.then(() => kick());
    kick(120);
  },
  pulse() { kick(PILL_MS); },
};
