// Силуэты для калькулятора зон: фигура из «выкроек» (мягкие детали с зазорами).
// Всё строится кодом из параметров, viewBox 0 0 240 480. Каждая деталь: { zone, d } или { zone: null } (не выбирается).
const r1 = (n) => Math.round(n * 10) / 10;

// Скруглённый многоугольник: на каждом углу квадратичная кривая.
export function rp(pts, rad = 6) {
  const n = pts.length; let d = '';
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p = pts[i], p1 = pts[(i + 1) % n];
    const a = toward(p, p0, rad), b = toward(p, p1, rad);
    d += (i === 0 ? 'M' : 'L') + r1(a[0]) + ' ' + r1(a[1]) + 'Q' + r1(p[0]) + ' ' + r1(p[1]) + ' ' + r1(b[0]) + ' ' + r1(b[1]);
  }
  return d + 'Z';
}
function toward(p, q, rad) {
  const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, k = Math.min(rad, L / 2) / L;
  return [p[0] + dx * k, p[1] + dy * k];
}
const mx = (p) => [240 - p[0], p[1]];
// Капсула-конечность от p0 до p1 с шириной w0 → w1 (закруглённые концы).
export function limb(p0, p1, w0, w1) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L, ux = dx / L, uy = dy / L;
  const a = [p0[0] + nx * w0 / 2, p0[1] + ny * w0 / 2], b = [p1[0] + nx * w1 / 2, p1[1] + ny * w1 / 2];
  const c = [p1[0] - nx * w1 / 2, p1[1] - ny * w1 / 2], e = [p0[0] - nx * w0 / 2, p0[1] - ny * w0 / 2];
  const k1 = w1 * 0.66, k0 = w0 * 0.66;
  return `M${r1(a[0])} ${r1(a[1])}L${r1(b[0])} ${r1(b[1])}C${r1(b[0] + ux * k1)} ${r1(b[1] + uy * k1)} ${r1(c[0] + ux * k1)} ${r1(c[1] + uy * k1)} ${r1(c[0])} ${r1(c[1])}L${r1(e[0])} ${r1(e[1])}C${r1(e[0] - ux * k0)} ${r1(e[1] - uy * k0)} ${r1(a[0] - ux * k0)} ${r1(a[1] - uy * k0)} ${r1(a[0])} ${r1(a[1])}Z`;
}
const ell = (cx, cy, rx, ry) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
const both = (fn) => fn(false) + fn(true);

// Контур туловища: левая половина как список [y, x]; кусок между y0 и y1.
function xAt(cont, y) {
  for (let i = 0; i < cont.length - 1; i++) {
    const [ya, xa] = cont[i], [yb, xb] = cont[i + 1];
    if (y >= ya && y <= yb) return xa + (xb - xa) * ((y - ya) / (yb - ya || 1));
  }
  return cont[y < cont[0][0] ? 0 : cont.length - 1][1];
}
function torso(cont, y0, y1, rad = 7) {
  const ys = [y0, ...cont.map((c) => c[0]).filter((y) => y > y0 && y < y1), y1];
  const left = ys.map((y) => [xAt(cont, y), y]);
  const right = left.map(mx).reverse();
  return rp([...left, ...right], rad);
}

const P = {
  damen: {
    cont: [[94, 91], [100, 85], [112, 89], [128, 92], [160, 96], [188, 98.5], [212, 94], [234, 89], [250, 88]],
    shoulder: [78, 100], elbow: [57, 192], wrist: [43, 270], armW: [19, 16, 13],
    hip: [101, 292], knee: [104, 372], ankle: [106, 448], legW: [31, 23, 15],
  },
  herren: {
    cont: [[94, 86], [100, 78], [112, 84], [126, 88], [150, 92], [200, 95], [230, 93], [250, 93]],
    shoulder: [70, 100], elbow: [50, 192], wrist: [38, 270], armW: [23, 19, 15],
    hip: [102, 292], knee: [104, 372], ankle: [105, 448], legW: [32, 25, 16],
  },
};

// Детали ног и рук (общие для вида спереди и сзади).
function limbs(p, g) {
  const pre = g === 'damen' ? 'd' : 'h';
  const [sa, se, sw] = [p.shoulder, p.elbow, p.wrist];
  const arm = both((m) => {
    const f = m ? mx : (q) => q;
    const e1 = f([se[0] + (sa[0] - se[0]) * 0.06, se[1] - 9]);
    return limb(f(sa), e1, p.armW[0], p.armW[1]) + limb(f([se[0] - 1, se[1] + 9]), f(sw), p.armW[1], p.armW[2]);
  });
  const hands = both((m) => { const f = m ? mx : (q) => q; const c = f([sw[0] - 3, sw[1] + 22]); return ell(r1(c[0]), r1(c[1]), 7, 12); });
  const thigh = both((m) => { const f = m ? mx : (q) => q; return limb(f(p.hip), f([p.knee[0], p.knee[1] - 11]), p.legW[0], p.legW[1]); });
  const shin = both((m) => { const f = m ? mx : (q) => q; return limb(f([p.knee[0], p.knee[1] + 9]), f(p.ankle), p.legW[1], p.legW[2]); });
  const feet = both((m) => { const f = m ? mx : (q) => q; const c = f([p.ankle[0] - 2, p.ankle[1] + 20]); return ell(r1(c[0]), r1(c[1]), 9, 7); });
  return [
    { zone: `${pre}-arme`, d: arm },
    { zone: null, d: hands },
    { zone: `${pre}-oberschenkel`, d: thigh, cover: `${pre}-beine` },
    { zone: `${pre}-unterschenkel`, d: shin, cover: `${pre}-beine` },
    { zone: null, d: feet },
  ];
}

const head = (g) => ell(120, 42, g === 'damen' ? 21 : 22, 26);
const neck = rp([[111, 70], [129, 70], [131, 84], [109, 84]], 4);

export function figur(g, seite) {
  const p = P[g], c = p.cont, pre = g === 'damen' ? 'd' : 'h';
  const parts = [];
  parts.push({ zone: g === 'damen' && seite === 'vorne' ? 'kopf' : null, d: head(g), label: 'Gesicht' });
  parts.push({ zone: g === 'damen' ? 'd-hals' : null, d: neck, cover: 'd-gesicht' });
  if (seite === 'vorne') {
    if (g === 'damen') {
      parts.push({ zone: null, d: torso(c, 90, 248) });
    } else {
      parts.push({ zone: 'h-brust', d: torso(c, 90, 166) });
      parts.push({ zone: 'h-bauch', d: torso(c, 171, 248) });
    }
    // Bikinilinie: «трусы»-клин, верх прямой, низ углом
    const yb = 253, xl = xAt(c, 250) + 1;
    parts.push({ zone: `${pre}-bikini`, d: rp([[xl, yb], [240 - xl, yb], [240 - xl - 2, yb + 14], [128, yb + 32], [112, yb + 32], [xl + 2, yb + 14]], 5) });
  } else {
    if (g === 'damen') {
      parts.push({ zone: null, d: torso(c, 90, 228) });
      parts.push({ zone: null, d: torso(c, 233, 272, 10) });
    } else {
      parts.push({ zone: 'h-schultern', d: torso(c, 90, 110) });
      parts.push({ zone: 'h-ruecken', d: torso(c, 115, 224) });
      parts.push({ zone: 'h-gesaess', d: torso(c, 229, 274, 12) });
    }
  }
  parts.push(...limbs(p, g));
  if (seite === 'vorne') {
  // Achseln: маленькие капли между рукой и туловищем
    const ax = g === 'damen' ? 87 : 84;
    parts.push({ zone: `${pre}-achseln`, d: ell(ax, 118, 4.5, 10) + ell(240 - ax, 118, 4.5, 10), hit: [[ax - 4, 118], [244 - ax, 118]] });
  }
  return parts;
}

// Лицо крупно (панель «Gesicht»), viewBox 0 0 200 240.
export function gesicht() {
  return [
    { zone: null, d: ell(100, 96, 58, 74), base: true },
    { zone: 'd-nase', d: ell(40, 100, 8, 16) + ell(160, 100, 8, 16) + rp([[94, 92], [106, 92], [110, 124], [90, 124]], 6), label: 'Nase oder Ohren' },
    { zone: 'd-brauen', d: rp([[62, 70], [90, 66], [91, 73], [63, 78]], 4) + rp([[110, 66], [138, 70], [137, 78], [109, 73]], 4), label: 'Augenbrauen' },
    { zone: 'd-oberlippe', d: rp([[80, 132], [120, 132], [118, 142], [82, 142]], 5), label: 'Oberlippe' },
    { zone: 'd-kinn', d: rp([[78, 156], [122, 156], [114, 166], [86, 166]], 5), label: 'Kinn' },
    { zone: 'd-hals', d: rp([[72, 178], [128, 178], [132, 236], [68, 236]], 8), label: 'Hals' },
  ];
}
