/**
 * Möbelmodell (cm): eine Konfiguration -> Liste von Bauteilen (parametrisch, keine Zeichnung "aus dem Kopf").
 * Wird von der 3D-Szene, der 2D-Ansicht (SVG) und der Kalkulation gemeinsam benutzt.
 */
import kalk from '../data/kalkulation.json';

export type Holz = 'e' | 'n' | 'a' | 'k';
export type Ober = 'g' | 'l' | 'f';
export interface Feld { s: number; d: number; t: boolean; b: boolean; g?: boolean }
export interface CfgKorpus {
  t: 's' | 'r';            // s = Einbauschrank, r = Regal
  n: number; fb: number; h: number; tf: number;
  holz: Holz; ober: Ober; farbe: number;
  sch: '0' | 'l' | 'r'; k: number; a: number;
  felder: Feld[];
  x: boolean;              // Stahlschienen in breiten Fächern
}
export interface CfgTisch { t: 't'; l: number; q: number; p: number; g: 'v' | 'k' | 'w'; holz: Holz; ober: Ober; farbe: number }
export type Cfg = CfgKorpus | CfgTisch;

export type Kind = 'side' | 'top' | 'bottom' | 'plinth' | 'shelf' | 'door' | 'drawer' | 'knob' | 'back' | 'dowel' | 'zinke'
  | 'lamelle' | 'leiste' | 'leg' | 'rail' | 'peg' | 'bench' | 'cushion' | 'steel';
export interface Part {
  id: string; kind: Kind; order: number; feld?: number;
  /** Quader: Mitte + Maße, optional um z gedreht (Grad) */
  box?: { x: number; y: number; z: number; w: number; h: number; d: number; rz?: number };
  /** Frontfläche als Polygon (x,y), von z bis z+dz extrudiert */
  poly?: { pts: [number, number][]; z: number; dz: number };
  /** Zinken: Polygon in (x,z), von y bis y+dy */
  polyXZ?: { pts: [number, number][]; y: number; dy: number };
  cyl?: { x: number; y: number; z: number; r: number; len: number; axis: 'x' | 'y' | 'z' };
  mat?: 'wood' | 'end' | 'paint' | 'dowel' | 'steel' | 'cushion' | 'back';
  grain: 'x' | 'y' | 'z';
  front?: boolean;
}

export const T = 2;              // Plattenstärke Korpus
export const DH = 18;            // Schubladenfront
export const GAP = 0.3;
export const HOLZ: Record<Holz, string> = { e: 'Eiche', n: 'Nussbaum', a: 'Ahorn', k: 'Kiefer' };
export const OBER: Record<Ober, string> = { g: 'geölt', l: 'lackiert', f: 'farbig lackiert' };
export const FARBEN = [
  { name: 'Salbei', hex: '#9aa892' },
  { name: 'Kreide', hex: '#ece6da' },
  { name: 'Taubenblau', hex: '#8e9ba6' },
  { name: 'Graphit', hex: '#4a4b4f' },
];
export const TYP: Record<Cfg['t'], string> = { s: 'Einbauschrank', r: 'Regal', t: 'Esstisch' };

export const LIMITS = {
  n: [1, 6], fb: [40, 100, 10], h: [60, 260, 10], k: [60, 140, 10], a: [30, 50, 5],
  l: [140, 300, 20], q: [80, 110, 10],
} as const;
export const TIEFEN = { s: [40, 50, 60, 65], r: [25, 30, 35, 40] } as const;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const rad = (d: number) => (d * Math.PI) / 180;

/* ----------------------------------------------------------- Voreinstellungen */
const f = (s: number, d = 0, t = false, b = true, g = false): Feld => ({ s, d, t, b, ...(g ? { g } : {}) });
export const PRESETS: Record<string, Cfg> = {
  schrank: { t: 's', n: 4, fb: 60, h: 230, tf: 60, holz: 'e', ober: 'g', farbe: 0, sch: 'r', k: 100, a: 45, x: false,
    felder: [f(3, 0, true), f(3, 0, true), f(1, 3), f(2)] },
  regal: { t: 'r', n: 3, fb: 60, h: 200, tf: 35, holz: 'a', ober: 'g', farbe: 0, sch: '0', k: 100, a: 45, x: false,
    felder: [f(4), f(3, 2), f(4)] },
  tisch: { t: 't', l: 220, q: 100, p: 4, g: 'v', holz: 'e', ober: 'g', farbe: 0 },
  garderobe: { t: 's', n: 2, fb: 80, h: 200, tf: 40, holz: 'n', ober: 'g', farbe: 0, sch: '0', k: 100, a: 45, x: false,
    felder: [f(0, 0, false, true, true), f(4, 0, true)] },
  // Referenzen
  kniestock: { t: 's', n: 5, fb: 60, h: 80, tf: 50, holz: 'a', ober: 'f', farbe: 0, sch: '0', k: 100, a: 45, x: false,
    felder: [f(0, 3), f(1, 0, true), f(0, 3), f(1, 0, true), f(0, 3)] },
  langtisch: { t: 't', l: 260, q: 100, p: 4, g: 'k', holz: 'n', ober: 'g', farbe: 0 },
};

export const clone = <T>(c: T): T => JSON.parse(JSON.stringify(c));

/* --------------------------------------------------------------- Geometrie */
export function width(c: CfgKorpus) { return c.n * c.fb; }
export function plinth(c: CfgKorpus) { return c.t === 's' && !c.felder.some((x) => x.g) ? 8 : 0; }

/** Oberkante des Korpus an Stelle x (cm) */
export function hTop(c: CfgKorpus, x: number) {
  const W = width(c), ta = Math.tan(rad(c.a));
  if (c.sch === 'r') return Math.min(c.h, c.k + (W - x) * ta);
  if (c.sch === 'l') return Math.min(c.h, c.k + x * ta);
  return c.h;
}
/** Knickpunkt der Schräge (x) oder null */
export function kink(c: CfgKorpus) {
  if (c.sch === '0') return null;
  const W = width(c), d = (c.h - c.k) / Math.tan(rad(c.a));
  const x = c.sch === 'r' ? W - d : d;
  return x > 0 && x < W ? x : null;
}
export function feldSpan(c: CfgKorpus, i: number): [number, number] {
  const l = i * c.fb + (i === 0 ? T : T / 2), r = (i + 1) * c.fb - (i === c.n - 1 ? T : T / 2);
  return [l, r];
}
/** niedrigste Oberkante über einem Feld */
export function feldMinTop(c: CfgKorpus, i: number) {
  const [l, r] = feldSpan(c, i);
  return Math.min(hTop(c, l), hTop(c, r));
}
function topLine(c: CfgKorpus, x0: number, x1: number, off: number): [number, number][] {
  const pts: [number, number][] = [[x0, hTop(c, x0) - off]];
  const kx = kink(c);
  if (kx !== null && kx > x0 && kx < x1) pts.push([kx, hTop(c, kx) - off]);
  pts.push([x1, hTop(c, x1) - off]);
  return pts;
}
export function maxDrawers(c: CfgKorpus, i: number) {
  const fd = c.felder[i];
  const free = feldMinTop(c, i) - T - plinth(c) - T - (fd.t ? 40 : 0);
  return clamp(Math.floor(free / (DH + GAP)), 0, 6);
}
export function maxShelves(c: CfgKorpus, i: number) {
  const fd = c.felder[i];
  const free = feldMinTop(c, i) - T - plinth(c) - T - fd.d * (DH + GAP);
  return clamp(Math.floor(free / 18) - 1, 0, 8);
}
/** Konfiguration in gültige Grenzen bringen (nach jeder Änderung) */
export function normalize(c: Cfg): Cfg {
  if (c.t === 't') {
    c.l = clamp(c.l, LIMITS.l[0], LIMITS.l[1]); c.q = clamp(c.q, LIMITS.q[0], LIMITS.q[1]);
    c.p = c.p === 3 ? 3 : 4; return c;
  }
  c.n = clamp(c.n, 1, 6); c.fb = clamp(c.fb, 40, 100); c.h = clamp(c.h, 60, 260);
  c.k = clamp(c.k, 60, Math.min(140, c.h)); c.a = clamp(c.a, 30, 50);
  if (c.t === 'r') c.sch = '0';
  while (c.felder.length < c.n) c.felder.push(f(2));
  c.felder.length = c.n;
  c.felder.forEach((fd, i) => {
    fd.d = clamp(fd.d, 0, maxDrawers(c, i));
    if (fd.t && feldMinTop(c, i) - plinth(c) - fd.d * (DH + GAP) < 40) fd.t = false;
    fd.s = clamp(fd.s, 0, maxShelves(c, i));
  });
  return c;
}

export function buildParts(c: Cfg, joints = false): Part[] {
  return c.t === 't' ? buildTisch(c, joints) : buildKorpus(c, joints);
}

function buildKorpus(c: CfgKorpus, joints: boolean): Part[] {
  const P: Part[] = [];
  const W = width(c), D = c.tf, pl = plinth(c), zf = D / 2;
  let o = 0;
  // 1 Seiten und Mittelwände
  for (let i = 0; i <= c.n; i++) {
    const outer = i === 0 || i === c.n;
    const x = i === 0 ? T / 2 : i === c.n ? W - T / 2 : i * c.fb;
    const y0 = outer ? 0 : pl + T;
    const y1 = hTop(c, x) - T;
    P.push({ id: `side-${i}`, kind: 'side', order: o++, box: { x, y: (y0 + y1) / 2, z: 0, w: T, h: y1 - y0, d: D }, grain: 'y' });
  }
  // 2 Boden + Sockel
  if (pl) P.push({ id: 'plinth', kind: 'plinth', order: o++, box: { x: W / 2, y: pl / 2, z: zf - 5 - T / 2, w: W - 2 * T, h: pl, d: T }, grain: 'x' });
  if (joints) [T, W - T].forEach((x, j) => [-D / 3, D / 3].forEach((z, k) =>
    P.push({ id: `dowel-b-${j}${k}`, kind: 'dowel', order: o, cyl: { x: j ? x - 1.5 : x + 1.5, y: pl + T / 2, z, r: 0.45, len: 4, axis: 'x' }, mat: 'dowel', grain: 'x' })));
  o++;
  P.push({ id: 'bottom', kind: 'bottom', order: o++, box: { x: W / 2, y: pl + T / 2, z: -0.5, w: W - 2 * T, h: T, d: D - 1 }, grain: 'x' });
  // 3 Deckel (folgt der Schräge), je Feld ein Brett bzw. zwei am Knick
  for (let i = 0; i < c.n; i++) {
    const x0 = i * c.fb, x1 = (i + 1) * c.fb;
    const line = topLine(c, x0, x1, 0);
    for (let s = 0; s < line.length - 1; s++) {
      const [ax, ay] = line[s], [bx, by] = line[s + 1];
      const L = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
      const nx = Math.sin(ang) * (T / 2), ny = -Math.cos(ang) * (T / 2);
      P.push({ id: `top-${i}-${s}`, kind: 'top', order: o, feld: i,
        box: { x: (ax + bx) / 2 + nx, y: (ay + by) / 2 + ny, z: 0, w: L, h: T, d: D, rz: (ang * 180) / Math.PI }, grain: 'x' });
    }
  }
  o++;
  // Zinken an den oberen Ecken (nur wo der Deckel waagerecht ist)
  if (joints) {
    [0, W].forEach((ex, j) => {
      if (Math.abs(hTop(c, ex) - c.h) > 0.1) return;
      const n = Math.max(3, Math.round(D / 10)), step = D / n;
      for (let k = 0; k < n; k++) {
        const z0 = -D / 2 + k * step + step * 0.2, z1 = z0 + step * 0.6;
        const xo = j ? W : 0, xi = j ? W - T : T, sp = step * 0.12;
        P.push({ id: `zinke-${j}-${k}`, kind: 'zinke', order: o, mat: 'end', grain: 'y',
          polyXZ: { pts: [[xo, z0 - sp], [xo, z1 + sp], [xi, z1 - sp], [xi, z0 + sp]], y: c.h - T, dy: T + 0.06 } });
      }
    });
    o++;
  }
  // 4 Rückwände, Böden, Fronten je Feld
  c.felder.forEach((fd, i) => {
    const [l, r] = feldSpan(c, i), xm = (l + r) / 2, wi = r - l;
    const yBase = pl + T, yTopMin = feldMinTop(c, i) - T;
    if (fd.b || fd.g) {
      const pts: [number, number][] = [[l, yBase], [r, yBase], ...topLine(c, l, r, T).reverse()];
      P.push({ id: `back-${i}`, kind: 'back', order: o + 1, feld: i, poly: { pts, z: -D / 2, dz: 1 }, mat: fd.g ? 'wood' : 'back', grain: 'y' });
    }
    const drawTop = yBase + fd.d * (DH + GAP);
    if (fd.g) {
      // Garderobe: Bank, Kissen, Haken
      P.push({ id: `bench-${i}`, kind: 'bench', order: o + 2, feld: i, box: { x: xm, y: 44, z: 0, w: wi, h: 4, d: D - 2 }, grain: 'x' });
      P.push({ id: `bench-f-${i}`, kind: 'bench', order: o + 2, feld: i, box: { x: xm, y: 21, z: D / 2 - 6, w: wi, h: 42, d: T }, grain: 'x' });
      P.push({ id: `cushion-${i}`, kind: 'cushion', order: o + 3, feld: i, box: { x: xm, y: 48, z: 1, w: wi - 4, h: 4, d: D - 8 }, mat: 'cushion', grain: 'x' });
      const np = Math.max(3, Math.round(wi / 16));
      for (let k = 0; k < np; k++) P.push({ id: `peg-${i}-${k}`, kind: 'peg', order: o + 3, feld: i,
        cyl: { x: l + (wi / (np + 1)) * (k + 1), y: 165, z: -D / 2 + 1 + 4, r: 1.4, len: 8, axis: 'z' }, grain: 'z' });
      P.push({ id: `shelf-${i}-0`, kind: 'shelf', order: o + 2, feld: i, box: { x: xm, y: 182, z: -1.5, w: wi, h: T, d: D - 3 }, grain: 'x' });
      return;
    }
    // Fachböden
    const zone0 = drawTop, zone1 = yTopMin;
    for (let s = 0; s < fd.s; s++) {
      const y = zone0 + ((zone1 - zone0) / (fd.s + 1)) * (s + 1);
      if (joints) [-1, 1].forEach((side) => [-D / 3, D / 3].forEach((z, k) => P.push({ id: `dowel-${i}-${s}-${side}${k}`, kind: 'dowel', order: o + 2, feld: i,
        cyl: { x: side < 0 ? l + 1.5 : r - 1.5, y, z, r: 0.45, len: 4, axis: 'x' }, mat: 'dowel', grain: 'x' })));
      P.push({ id: `shelf-${i}-${s}`, kind: 'shelf', order: o + 3, feld: i, box: { x: xm, y, z: -1.5, w: wi, h: T, d: D - 3 }, grain: 'x' });
      if (c.x && wi > sagLimit(c.holz)) P.push({ id: `steel-${i}-${s}`, kind: 'steel', order: o + 3, feld: i, box: { x: xm, y: y - T / 2 - 0.3, z: D / 2 - 6, w: wi - 2, h: 0.6, d: 3 }, mat: 'steel', grain: 'x' });
    }
    // Schubladen (Aufschlag-Fronten) von unten
    const fl = i * c.fb + (i === 0 ? 0 : GAP / 2), fr = (i + 1) * c.fb - (i === c.n - 1 ? 0 : GAP / 2);
    for (let k = 0; k < fd.d; k++) {
      const y0 = pl + k * (DH + GAP) + GAP;
      P.push({ id: `drawer-${i}-${k}`, kind: 'drawer', order: o + 4, feld: i, front: true, box: { x: (fl + fr) / 2, y: y0 + DH / 2, z: zf + T / 2, w: fr - fl, h: DH, d: T }, grain: 'x' });
      P.push({ id: `knob-d-${i}-${k}`, kind: 'knob', order: o + 4, feld: i, cyl: { x: (fl + fr) / 2, y: y0 + DH / 2, z: zf + T + 1, r: 1.3, len: 2, axis: 'z' }, grain: 'z' });
    }
    // Tür (folgt der Schräge)
    if (fd.t) {
      const y0 = pl + fd.d * (DH + GAP) + GAP;
      const pts: [number, number][] = [[fl, y0], [fr, y0], ...topLine(c, fl, fr, T + GAP).reverse()];
      P.push({ id: `door-${i}`, kind: 'door', order: o + 5, feld: i, front: true, poly: { pts, z: zf, dz: T }, grain: 'y' });
      const hy = Math.min(y0 + 95, (y0 + Math.min(hTop(c, fl), hTop(c, fr)) - T) / 2);
      const kx = i < c.n / 2 ? fr - 5 : fl + 5;
      P.push({ id: `knob-t-${i}`, kind: 'knob', order: o + 5, feld: i, cyl: { x: kx, y: hy, z: zf + T + 1, r: 1.3, len: 2, axis: 'z' }, grain: 'z' });
    }
  });
  return P;
}

function buildTisch(c: CfgTisch, joints: boolean): Part[] {
  const P: Part[] = [];
  const H = 75, L = c.l, B = c.q, p = c.p, yt = H - p;
  let o = 0;
  const m = Math.max(4, Math.round(B / 13)), lw = B / m;
  // Gestell
  if (c.g === 'v') {
    const lx = L / 2 - 20, lz = B / 2 - 9;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], k) =>
      P.push({ id: `leg-${k}`, kind: 'leg', order: o, box: { x: sx * lx, y: (yt - 3) / 2, z: sz * lz, w: 7, h: yt - 3, d: 7 }, grain: 'y' }));
  } else if (c.g === 'k') {
    const fx = L / 2 - 30, pz = B / 2 - 14;
    [-1, 1].forEach((sx, j) => {
      [-1, 1].forEach((sz, k) => P.push({ id: `leg-${j}${k}`, kind: 'leg', order: o, box: { x: sx * fx, y: (yt - 3) / 2, z: sz * pz, w: 6, h: yt - 3, d: 6 }, grain: 'y' }));
      P.push({ id: `rail-f-${j}`, kind: 'rail', order: o, box: { x: sx * fx, y: 3.5, z: 0, w: 6, h: 7, d: 2 * pz + 10 }, grain: 'z' });
    });
  } else {
    const wx = L / 2 - 32;
    [-1, 1].forEach((sx, j) => P.push({ id: `leg-${j}`, kind: 'leg', order: o, box: { x: sx * wx, y: (yt - 3) / 2, z: 0, w: 4, h: yt - 3, d: B - 26 }, grain: 'y' }));
    P.push({ id: 'rail-t', kind: 'rail', order: o, box: { x: 0, y: 42, z: 0, w: 2 * wx - 4, h: 10, d: 4 }, grain: 'x' });
  }
  o++;
  // Gratleisten (gegen Verziehen) quer unter der Platte
  const gx = c.g === 'v' ? L / 2 - 20 : c.g === 'k' ? L / 2 - 30 : L / 2 - 32;
  [-1, 1].forEach((sx, j) => P.push({ id: `leiste-${j}`, kind: 'leiste', order: o, box: { x: sx * gx, y: yt - 1.5, z: 0, w: 8, h: 3, d: B - 6 }, grain: 'z' }));
  o++;
  // Lamellen der Platte, mit Dübeln
  for (let k = 0; k < m; k++) {
    const z = -B / 2 + lw * (k + 0.5);
    if (joints && k > 0) for (let d = 0; d < 4; d++) P.push({ id: `dowel-l-${k}-${d}`, kind: 'dowel', order: o + k, mat: 'dowel', grain: 'z',
      cyl: { x: -L / 2 + (L / 5) * (d + 1), y: yt + p / 2, z: z - lw / 2, r: 0.5, len: 5, axis: 'z' } });
    P.push({ id: `lamelle-${k}`, kind: 'lamelle', order: o + k, box: { x: 0, y: yt + p / 2, z, w: L, h: p, d: lw - 0.04 }, grain: 'x' });
  }
  return P;
}

/* ---------------------------------------------------------- Bounding box */
export function bounds(c: Cfg) {
  if (c.t === 't') return { x0: -c.l / 2, x1: c.l / 2, y0: 0, y1: 75, z0: -c.q / 2, z1: c.q / 2 };
  return { x0: 0, x1: width(c), y0: 0, y1: c.h, z0: -c.tf / 2, z1: c.tf / 2 + T };
}

/* ------------------------------------------------------- Meister-Hinweise */
export function sagLimit(h: Holz) { return h === 'k' ? 80 : 90; }
export interface Hinweis { id: string; text: string; fix?: { label: string; apply: (c: Cfg) => void }[]; info?: boolean }
export function checks(c: Cfg): Hinweis[] {
  const H: Hinweis[] = [];
  if (c.t === 't') {
    if (c.p === 3 && c.l > 240) H.push({ id: 'platte', text: `Eine 3-cm-Platte über ${c.l} cm biegt sich mit der Zeit durch. Ich empfehle 4 cm.`,
      fix: [{ label: '4 cm nehmen', apply: (x) => { (x as CfgTisch).p = 4; } }] });
    if (c.l >= 240 && c.g === 'v') H.push({ id: 'beine', info: true, text: 'Bei dieser Länge setze ich die Beine etwas weiter ein, damit an den Enden zwei Stühle Platz haben.' });
    return H;
  }
  const lim = sagLimit(c.holz), wi = c.fb - T;
  const wide = c.felder.some((fd) => fd.s > 0 && !fd.g) && wi > lim;
  if (wide && !c.x) H.push({ id: 'durchbiegung', text: `Fachböden mit ${Math.round(wi)} cm Spannweite biegen sich unter Büchern durch (${HOLZ[c.holz]}, 2 cm).`,
    fix: [
      { label: 'Stahlschiene einlassen', apply: (x) => { (x as CfgKorpus).x = true; } },
      { label: `Felder auf ${Math.floor((lim + T) / 10) * 10} cm`, apply: (x) => { const k = x as CfgKorpus; const nb = Math.floor((lim + T) / 10) * 10; const W = k.n * k.fb; k.fb = nb; k.n = Math.min(6, Math.max(k.n, Math.round(W / nb))); } },
    ] });
  if (c.t === 'r' && c.h > 180 && c.tf <= 30) H.push({ id: 'kipp', info: true, text: 'Hoch und schmal: Ich befestige das Regal an der Wand (Kippschutz), ist im Preis drin.' });
  if (c.t === 's' && c.sch !== '0') H.push({ id: 'aufmass', info: true, text: 'Schräge, Kniestock und Wände messe ich vor Ort genau aus. Die Werte hier sind Ihr Startpunkt.' });
  return H;
}
export const openWarnings = (c: Cfg) => checks(c).filter((h) => !h.info).length;

/* ------------------------------------------------------------- Kalkulation */
export interface Preis { material: number; stunden: number; montage: number; total: number; lfm?: number }
const area = (p: Part) => {
  if (p.box) { const [a, b, cc] = [p.box.w, p.box.h, p.box.d].sort((x, y) => y - x); void cc; return (a * b) / 10000; }
  if (p.poly) { let s = 0; const q = p.poly.pts; for (let i = 0; i < q.length; i++) { const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % q.length]; s += x1 * y2 - x2 * y1; } return Math.abs(s) / 2 / 10000; }
  return 0;
};
export function price(c: Cfg): Preis {
  const K = kalk;
  const parts = buildParts(c, false);
  const holzM2 = K.holzM2[c.holz], oberM2 = K.oberM2[c.ober];
  let m2 = 0, backM2 = 0, beschlag = 0;
  parts.forEach((p) => {
    if (p.kind === 'back' && p.mat === 'back') backM2 += area(p);
    else if (['side', 'top', 'bottom', 'plinth', 'shelf', 'door', 'drawer', 'lamelle', 'leiste', 'leg', 'rail', 'bench', 'back'].includes(p.kind)) m2 += area(p);
    if (p.kind === 'drawer') beschlag += K.beschlag.schublade;
    if (p.kind === 'door') beschlag += K.beschlag.tuer;
    if (p.kind === 'steel') beschlag += K.beschlag.stahl;
    if (p.kind === 'peg') beschlag += K.beschlag.haken;
    if (p.kind === 'cushion') beschlag += K.beschlag.kissen;
  });
  if (c.t === 't') m2 *= (c.p / 3) * K.tischDicke;
  const material = m2 * K.verschnitt * holzM2 + m2 * 1.6 * oberM2 + backM2 * K.rueckwandM2 + beschlag;
  let h = 0, mont = 0;
  if (c.t === 't') {
    h = K.std.tischBasis + (c.l * c.q) / 10000 * K.std.tischProM2 + K.std.gestell[c.g];
    mont = K.std.tischLieferung;
  } else {
    const n = (k: Kind) => parts.filter((p) => p.kind === k).length;
    h = K.std.korpusBasis + c.n * K.std.proFeld + n('shelf') * K.std.fach + n('door') * K.std.tuer + n('drawer') * K.std.schublade
      + parts.filter((p) => p.kind === 'back').length * K.std.rueckwand;
    if (c.sch !== '0') h += K.std.schraegeBasis + parts.filter((p) => p.kind === 'top').length * K.std.schraegeProBrett;
    if (c.ober === 'f') h += K.std.farbig;
    mont = c.t === 's' ? K.std.montageSchrankBasis + c.n * K.std.montageSchrankFeld : K.std.montageRegal + c.n * K.std.montageRegalFeld;
  }
  const mw = 1 + K.mwst;
  const r = (v: number) => Math.round(v * mw);
  const mat = r(material), std = r(h * K.stundensatz), mo = r(mont * K.montagesatz);
  const total = Math.max(K.minimum, Math.round((mat + std + mo) / 50) * 50);
  return { material: mat, stunden: std, montage: mo, total, ...(c.t !== 't' ? { lfm: Math.round(total / (width(c) / 100) / 10) * 10 } : {}) };
}

/* --------------------------------------------------- URL / Speicher-Format */
export function encode(c: Cfg): string {
  const u = new URLSearchParams();
  u.set('t', c.t); u.set('w', c.holz); u.set('o', c.ober); if (c.ober === 'f') u.set('c', String(c.farbe));
  if (c.t === 't') { u.set('l', String(c.l)); u.set('q', String(c.q)); u.set('p', String(c.p)); u.set('g', c.g); }
  else {
    u.set('n', String(c.n)); u.set('b', String(c.fb)); u.set('h', String(c.h)); u.set('d', String(c.tf));
    if (c.sch !== '0') { u.set('s', c.sch); u.set('k', String(c.k)); u.set('a', String(c.a)); }
    if (c.x) u.set('x', '1');
    u.set('f', c.felder.map((fd) => (fd.g ? 'g' : '') + (fd.t ? 't' : '') + (fd.d ? 'd' + fd.d : '') + 's' + fd.s + (fd.b ? 'r' : '')).join('.'));
  }
  return u.toString();
}
export function decode(q: string): Cfg | null {
  try {
    const u = new URLSearchParams(q), t = u.get('t');
    const holz = (['e', 'n', 'a', 'k'].includes(u.get('w') || '') ? u.get('w') : 'e') as Holz;
    const ober = (['g', 'l', 'f'].includes(u.get('o') || '') ? u.get('o') : 'g') as Ober;
    const farbe = clamp(Number(u.get('c')) || 0, 0, FARBEN.length - 1);
    const num = (k: string, d: number) => { const v = Number(u.get(k)); return Number.isFinite(v) && v > 0 ? v : d; };
    if (t === 't') {
      const g = (['v', 'k', 'w'].includes(u.get('g') || '') ? u.get('g') : 'v') as CfgTisch['g'];
      return normalize({ t: 't', l: num('l', 220), q: num('q', 100), p: num('p', 4), g, holz, ober, farbe });
    }
    if (t !== 's' && t !== 'r') return null;
    const felder = (u.get('f') || '').split('.').filter(Boolean).map((s) => ({
      g: s.includes('g') || undefined, t: s.includes('t'), b: s.includes('r'),
      d: Number((s.match(/d(\d)/) || [])[1] || 0), s: Number((s.match(/s(\d)/) || [])[1] || 0),
    })).map((x) => { const o: Feld = { s: x.s, d: x.d, t: x.t, b: x.b }; if (x.g) o.g = true; return o; });
    const sch = (['l', 'r'].includes(u.get('s') || '') ? u.get('s') : '0') as CfgKorpus['sch'];
    return normalize({ t, n: num('n', 3), fb: num('b', 60), h: num('h', 200), tf: num('d', t === 's' ? 60 : 35), holz, ober, farbe,
      sch, k: num('k', 100), a: num('a', 45), x: u.get('x') === '1', felder });
  } catch { return null; }
}

/* ---------------------------------------------------------- Kurzbeschreibung */
export function summary(c: Cfg): [string, string][] {
  const w: [string, string][] = [['Möbel', TYP[c.t]]];
  const holz = `${HOLZ[c.holz]}, ${OBER[c.ober]}${c.ober === 'f' ? ' (' + FARBEN[c.farbe].name + ')' : ''}`;
  if (c.t === 't') {
    w.push(['Maße', `${c.l} × ${c.q} cm, Platte ${c.p} cm`], ['Gestell', { v: 'Vier Beine', k: 'Kufen', w: 'Wangen' }[c.g]], ['Holz', holz]);
    return w;
  }
  w.push(['Maße', `${width(c)} × ${c.h} × ${c.tf} cm (B × H × T)`]);
  if (c.sch !== '0') w.push(['Schräge', `${c.sch === 'r' ? 'rechts' : 'links'}, Kniestock ${c.k} cm, ${c.a}°`]);
  w.push(['Felder', `${c.n} × ${c.fb} cm`]);
  const cnt = (k: keyof Feld) => c.felder.reduce((s, fd) => s + Number(fd[k] || 0), 0);
  const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  w.push(['Inhalt', [pl(cnt('s'), 'Fachboden', 'Fachböden'), pl(c.felder.filter((x) => x.t).length, 'Tür', 'Türen'), pl(cnt('d'), 'Schublade', 'Schubladen'), pl(c.felder.filter((x) => x.b).length, 'Rückwand', 'Rückwände')].join(', ')]);
  if (c.x) w.push(['Extra', 'Stahlschienen in breiten Fächern']);
  w.push(['Holz', holz]);
  return w;
}
