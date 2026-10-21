/**
 * 2D-Frontansicht aus denselben Bauteilen wie die 3D-Szene (SVG-String).
 * 'wood' = farbige Ansicht (Fallback ohne WebGL), 'pencil' = Skizze für die Abnahme.
 * Maßketten in Handschrift (Caveat) und Tintenblau.
 */
import { type Cfg, type Part, buildParts, width, feldSpan, plinth, hTop, kink, T, FARBEN } from './model';

const WOOD: Record<string, [string, string]> = { e: ['#cfa877', '#a9824f'], n: ['#7a5539', '#5a3d27'], a: ['#ecdcbc', '#cdb88f'], k: ['#e2bd85', '#b8935a'] };
const n1 = (v: number) => Math.round(v * 10) / 10;

function shape(p: Part): string | null {
  if (p.box && !p.box.rz) {
    const b = p.box;
    return `M${n1(b.x - b.w / 2)} ${n1(-(b.y + b.h / 2))}h${n1(b.w)}v${n1(b.h)}h${n1(-b.w)}Z`;
  }
  if (p.box && p.box.rz) {
    const b = p.box, a = (b.rz! * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const pts = [[-b.w / 2, -b.h / 2], [b.w / 2, -b.h / 2], [b.w / 2, b.h / 2], [-b.w / 2, b.h / 2]].map(([x, y]) => [b.x + x * c - y * s, b.y + x * s + y * c]);
    return 'M' + pts.map(([x, y]) => `${n1(x)} ${n1(-y)}`).join('L') + 'Z';
  }
  if (p.poly) return 'M' + p.poly.pts.map(([x, y]) => `${n1(x)} ${n1(-y)}`).join('L') + 'Z';
  if (p.cyl && p.cyl.axis === 'z') return `M${n1(p.cyl.x - p.cyl.r)} ${n1(-p.cyl.y)}a${p.cyl.r} ${p.cyl.r} 0 1 0 ${n1(2 * p.cyl.r)} 0a${p.cyl.r} ${p.cyl.r} 0 1 0 ${n1(-2 * p.cyl.r)} 0Z`;
  return null;
}
const ORDER = ['back', 'side', 'top', 'bottom', 'plinth', 'shelf', 'steel', 'bench', 'cushion', 'peg', 'leg', 'rail', 'leiste', 'lamelle', 'drawer', 'door', 'knob'];

export function sketch(c: Cfg, style: 'wood' | 'pencil', opts: { picks?: boolean; marks?: boolean } = {}): string {
  const parts = buildParts(c, false).filter((p) => p.kind !== 'dowel' && p.kind !== 'zinke')
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || (a.box?.z ?? 0) - (b.box?.z ?? 0));
  const [fill, dark] = WOOD[c.holz];
  const paint = c.ober === 'f' ? FARBEN[c.farbe].hex : null;
  const pencil = style === 'pencil';
  const W = c.t === 't' ? c.l : width(c), H = c.t === 't' ? 75 : c.h;
  const x0 = c.t === 't' ? -W / 2 : 0;
  const m = 34;
  const vb = `${n1(x0 - m)} ${n1(-H - m)} ${n1(W + 2 * m)} ${n1(H + m + 14)}`;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" class="sk sk--${style}" role="img" aria-label="Frontansicht">`);
  out.push(`<line x1="${n1(x0 - m)}" y1="0" x2="${n1(x0 + W + m)}" y2="0" class="sk-floor"/>`);
  parts.forEach((p) => {
    const d = shape(p); if (!d) return;
    let f = fill;
    if (p.kind === 'back') f = pencil ? 'var(--sk-back)' : dark;
    else if (p.mat === 'steel') f = '#8a8d91';
    else if (p.kind === 'cushion') f = '#d8d1c2';
    else if ((p.front || p.kind === 'knob') && paint) f = paint;
    else if (p.kind === 'knob') f = dark;
    if (pencil) f = p.kind === 'back' ? 'var(--sk-back)' : (p.front && paint) ? paint : 'var(--sk-fill)';
    out.push(`<path d="${d}" fill="${f}" class="sk-p sk-${p.kind}"/>`);
  });
  if (opts.picks && c.t !== 't') {
    for (let i = 0; i < c.n; i++) {
      const [l, r] = feldSpan(c, i), top = Math.max(hTop(c, l), hTop(c, r));
      out.push(`<rect x="${n1(l)}" y="${n1(-top)}" width="${n1(r - l)}" height="${n1(top - plinth(c))}" class="sk-pick" data-feld="${i}"/>`);
    }
  }
  if (opts.marks !== false) {
    const y = -H - 14;
    out.push(`<g class="sk-dim"><path d="M${n1(x0)} ${y}H${n1(x0 + W)}M${n1(x0)} ${y - 5}v10M${n1(x0 + W)} ${y - 5}v10"/>`);
    out.push(`<text x="${n1(x0 + W / 2)}" y="${y - 5}" text-anchor="middle">${W} cm</text>`);
    const lx = x0 - 16;
    out.push(`<path d="M${lx} 0V${-H}M${lx - 5} 0h10M${lx - 5} ${-H}h10"/>`);
    out.push(`<text x="${lx - 4}" y="${n1(-H / 2)}" text-anchor="middle" transform="rotate(-90 ${lx - 4} ${n1(-H / 2)})">${H} cm</text>`);
    if (c.t !== 't' && c.sch !== '0') {
      const ex = c.sch === 'r' ? W + 14 : -14;
      out.push(`<path d="M${ex} 0V${-c.k}M${ex - 5} ${-c.k}h10"/>`);
      const kx = kink(c);
      out.push(`<text x="${c.sch === 'r' ? ex + 4 : ex - 4}" y="${n1(-c.k / 2)}" text-anchor="middle" transform="rotate(-90 ${c.sch === 'r' ? ex + 4 : ex - 4} ${n1(-c.k / 2)})">Kniestock ${c.k}</text>`);
      if (kx !== null) out.push(`<text x="${n1((kx + (c.sch === 'r' ? W : 0)) / 2 + (c.sch === 'r' ? 6 : -6))}" y="${n1(-(c.h + c.k) / 2 - 10)}" text-anchor="middle">${c.a}°</text>`);
    }
    if (c.t === 't') out.push(`<text x="${n1(x0 + W)}" y="${n1(-H - 30)}" text-anchor="end" class="sk-small">Tiefe ${c.q} cm</text>`);
    else out.push(`<text x="${n1(x0 + W)}" y="12" text-anchor="end" class="sk-small">Tiefe ${c.tf} cm</text>`);
    out.push(`</g>`);
  }
  out.push('</svg>');
  return out.join('');
}
export { T };
