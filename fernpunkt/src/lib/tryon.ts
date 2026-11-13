// Рисование оправы на лице: общее для фото-модели (точки посчитаны заранее) и живой камеры.
import { build, HAVANNA, type Frame, type Paint } from './frames';

export type Pt = [number, number];
/** Точки лица MediaPipe в пикселях кадра: 168 переносица, 33/133 и 362/263 углы глаз, 127/356 виски у ушей. */
export type Face = { p168: Pt; p33: Pt; p133: Pt; p362: Pt; p263: Pt; p127: Pt; p356: Pt; yaw: number };
export type Pose = { x: number; y: number; s: number; cos: number; roll: number; earA: Pt; earB: Pt };

export const IDX = { p168: 168, p33: 33, p133: 133, p362: 362, p263: 263, p127: 127, p356: 356 } as const;
const PD = 63; // средний межзрачковый размер, мм

export function pose(f: Face): Pose {
  const eA: Pt = [(f.p33[0] + f.p133[0]) / 2, (f.p33[1] + f.p133[1]) / 2];
  const eB: Pt = [(f.p362[0] + f.p263[0]) / 2, (f.p362[1] + f.p263[1]) / 2];
  const dx = eB[0] - eA[0], dy = eB[1] - eA[1];
  const cos = Math.max(0.55, Math.cos(f.yaw));
  const s = Math.hypot(dx, dy) / (PD * cos);
  const roll = Math.atan2(dy, dx);
  // оправа сидит на переносице; чуть ниже точки 168 по оси лица
  const down = 5 * s;
  return { x: f.p168[0] - Math.sin(roll) * down, y: f.p168[1] + Math.cos(roll) * down, s, cos, roll, earA: f.p127, earB: f.p356 };
}

const patterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();
function havanna(ctx: CanvasRenderingContext2D): CanvasPattern {
  let p = patterns.get(ctx);
  if (p) return p;
  const k = 4, c = document.createElement('canvas'); c.width = c.height = 26 * k;
  const g = c.getContext('2d')!; g.fillStyle = '#8a4a18'; g.fillRect(0, 0, c.width, c.height);
  for (const [x, y, rx, ry, dk] of HAVANNA) for (const ox of [-26, 0, 26]) for (const oy of [-26, 0, 26]) {
    g.globalAlpha = dk ? 0.72 : 0.5; g.fillStyle = dk ? '#2b1206' : '#d9994a';
    g.beginPath(); g.ellipse((x + ox) * k, (y + oy) * k, rx * k, ry * k, 0, 0, Math.PI * 2); g.fill();
  }
  p = ctx.createPattern(c, 'repeat')!; p.setTransform(new DOMMatrix().scale(1 / k));
  patterns.set(ctx, p);
  return p;
}

const cache = new Map<string, { b: ReturnType<typeof build>; paths: Path2D[] }>();
function built(f: Frame) {
  let c = cache.get(f.id);
  if (!c) { const b = build(f); c = { b, paths: b.layers.map((l) => new Path2D(l.d)) }; cache.set(f.id, c); }
  return c;
}

/** Рисует оправу в текущей системе координат canvas (пиксели кадра). */
export function paintFrame(ctx: CanvasRenderingContext2D, f: Frame, paint: Paint, ps: Pose) {
  const { b, paths } = built(f);
  const rim = paint.pattern ? havanna(ctx) : paint.rim;
  const acet = f.material === 'Acetat';
  const sx = ps.s * ps.cos, sy = ps.s;
  const cr = Math.cos(ps.roll), sr = Math.sin(ps.roll);
  const map = (mx: number, my: number): Pt => [ps.x + mx * sx * cr - my * sy * sr, ps.y + mx * sx * sr + my * sy * cr];

  // заушники: от шарнира к виску у уха, под оправой
  ctx.save();
  ctx.lineCap = 'round'; ctx.strokeStyle = paint.rim; ctx.lineWidth = (acet ? 3.2 : 1.5) * ps.s;
  const hA = map(-b.hinge.x, b.hinge.y), hB = map(b.hinge.x, b.hinge.y);
  for (const [h, e, dir] of [[hA, ps.earA, -1], [hB, ps.earB, 1]] as [Pt, Pt, number][]) {
    // рисуем только если ухо дальше шарнира наружу: иначе заушник спрятан за оправой
    const out = ((e[0] - h[0]) * cr + (e[1] - h[1]) * sr) * dir;
    if (out > 1.5 * ps.s) { ctx.beginPath(); ctx.moveTo(h[0], h[1]); ctx.lineTo(e[0], e[1] - 2 * ps.s); ctx.stroke(); }
  }
  ctx.restore();

  ctx.save();
  ctx.translate(ps.x, ps.y); ctx.rotate(ps.roll); ctx.scale(sx, sy);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // тень оправы на лице
  ctx.save();
  ctx.shadowColor = 'rgba(20,10,25,.32)'; ctx.shadowBlur = 5 * ps.s; ctx.shadowOffsetY = 2.2 * ps.s;
  b.layers.forEach((l, i) => {
    if (l.kind === 'rim') { ctx.strokeStyle = rim; ctx.lineWidth = l.width!; ctx.stroke(paths[i]); }
    if (l.kind === 'fill') { ctx.fillStyle = rim; ctx.fill(paths[i]); }
  });
  ctx.restore();
  b.layers.forEach((l, i) => {
    if (l.kind === 'glass') {
      const g = ctx.createLinearGradient(-b.half, -b.h / 2, b.half, b.h / 2);
      g.addColorStop(0, 'rgba(255,255,255,.2)'); g.addColorStop(0.42, 'rgba(210,235,245,.03)'); g.addColorStop(1, 'rgba(183,168,255,.14)');
      ctx.fillStyle = g; ctx.fill(paths[i]);
    } else if (l.kind === 'fill') { ctx.fillStyle = rim; ctx.fill(paths[i]); }
    else if (l.kind === 'rim') { ctx.strokeStyle = rim; ctx.lineWidth = l.width!; ctx.stroke(paths[i]); }
    else if (l.kind === 'shine') { ctx.globalAlpha = 0.5; ctx.strokeStyle = paint.rim2 ?? '#fff'; ctx.lineWidth = l.width!; ctx.stroke(paths[i]); ctx.globalAlpha = 1; }
    else if (l.kind === 'pad') { ctx.globalAlpha = 0.55; ctx.strokeStyle = paint.rim; ctx.lineWidth = l.width!; ctx.stroke(paths[i]); ctx.globalAlpha = 1; }
  });
  ctx.restore();
}
