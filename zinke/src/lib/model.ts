/**
 * Möbelmodell (cm): eine Konfiguration -> Liste von Bauteilen (parametrisch, keine Zeichnung "aus dem Kopf").
 * Wird von der 3D-Szene, der 2D-Ansicht (SVG) und der Kalkulation gemeinsam benutzt.
 */
import kalk from '../data/kalkulation.json';

export type Holz = 'e' | 'n' | 'a' | 'k';
export type Ober = 'g' | 'l' | 'b' | 'f';          // geölt, Klarlack, gebeizt (Maserung bleibt sichtbar), deckend lackiert
export interface Feld { s: number; d: number; t: boolean; b: boolean; g?: boolean }
export interface CfgKorpus {
  t: 's' | 'r' | 'k';      // s = Einbauschrank, r = Regal, k = Kommode/Sideboard
  n: number; fb: number; h: number; tf: number;
  holz: Holz; ober: Ober; farbe: number; fk: boolean;   // fk: deckende Farbe auch auf dem Korpus (sonst nur Fronten)
  sch: '0' | 'l' | 'r' | 'm'; sp: 'o' | 'u'; k: number; a: number;   // Schräge: l/r seitlich, m = beidseitig (Giebel); sp o = oben (Dach), u = unten (Treppe)
  felder: Feld[];
  x: boolean;              // Stahlschienen in breiten Fächern
  fu: 's' | 'b' | 'n';     // Fuß: Sockel, Beine, keiner
}
export interface CfgTisch {
  t: 't'; l: number; q: number; p: number; th: number;
  g: 'v' | 'k' | 'w' | 'x' | 'z' | 'b';                // Vier Beine, Kufen, Wangen, Kreuz, Zarge, Bock
  pf: 'r' | 'a' | 'o'; e: 'g' | 'f' | 'b';              // Platte: rechteckig, abgerundet, oval; Kante: gerade, gefast, Baumkante
  holz: Holz; ober: Ober; farbe: number; fk: boolean;
}
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
  polyXZ?: { pts: [number, number][]; y: number; dy: number; bevel?: number };
  cyl?: { x: number; y: number; z: number; r: number; len: number; axis: 'x' | 'y' | 'z' };
  mat?: 'wood' | 'end' | 'paint' | 'dowel' | 'steel' | 'cushion' | 'back';
  grain: 'x' | 'y' | 'z';
  front?: boolean;
}

export const T = 2;              // Plattenstärke Korpus
export const DH = 18;            // Schubladenfront
export const GAP = 0.3;
export const HOLZ: Record<Holz, string> = { e: 'Eiche', n: 'Nussbaum', a: 'Ahorn', k: 'Kiefer' };
export const OBER: Record<Ober, string> = { g: 'geölt', l: 'Klarlack', b: 'gebeizt', f: 'deckend lackiert' };
/** Deckende Lackfarben (mutig, passend zu jedem Holz) */
export const DECK = [
  { name: 'Salbei', hex: '#8fa58b' }, { name: 'Kreide', hex: '#ece6da' }, { name: 'Altrosa', hex: '#d3a39b' },
  { name: 'Senfgelb', hex: '#d1a02a' }, { name: 'Terrakotta', hex: '#b4573b' }, { name: 'Tannengrün', hex: '#2e5a44' },
  { name: 'Petrol', hex: '#1f5f68' }, { name: 'Tintenblau', hex: '#22437a' }, { name: 'Graphit', hex: '#383b41' },
];
/** Beizen: Farbe, durch die die Maserung sichtbar bleibt. Jede Holzart hat eigene Töne, die zu ihr passen. */
export const BEIZEN: Record<Holz, { name: string; hex: string }[]> = {
  e: [{ name: 'Rauchgrau', hex: '#9a9a96' }, { name: 'Tabak', hex: '#8a5a36' }, { name: 'Schwarzeiche', hex: '#34312e' }, { name: 'Tintenblau', hex: '#4a6586' }],
  n: [{ name: 'Ebenholz', hex: '#3d3835' }, { name: 'Bordeaux', hex: '#7a3b3d' }, { name: 'Kastanie', hex: '#9a6a46' }],
  a: [{ name: 'Indigo', hex: '#34527f' }, { name: 'Waldgrün', hex: '#3e6b52' }, { name: 'Bordeaux', hex: '#7c3340' }, { name: 'Ocker', hex: '#cf9a3c' }, { name: 'Schiefer', hex: '#59636d' }],
  k: [{ name: 'Weißlasur', hex: '#efe9dd' }, { name: 'Nordblau', hex: '#5d84a8' }, { name: 'Graugrün', hex: '#8ba08a' }, { name: 'Schwarz', hex: '#3a3b3d' }],
};
export function farbeOf(c: Cfg): { name: string; hex: string } | null {
  if (c.ober === 'f') return DECK[clamp(c.farbe, 0, DECK.length - 1)];
  if (c.ober === 'b') { const l = BEIZEN[c.holz]; return l[clamp(c.farbe, 0, l.length - 1)]; }
  return null;
}
export const TYP: Record<Cfg['t'], string> = { s: 'Einbauschrank', r: 'Regal', k: 'Sideboard', t: 'Esstisch' };
/** Anzeigename nach Maßen (Kommode, Couchtisch ...) */
export function label(c: Cfg): string {
  if (c.t === 't') return c.th <= 55 ? (c.q <= 50 ? 'Bank' : 'Couchtisch') : c.th >= 90 ? 'Stehtisch' : c.q <= 80 ? 'Schreibtisch' : 'Esstisch';
  if (c.t === 's') return c.felder.some((f) => f.g) ? 'Garderobe' : 'Einbauschrank';
  if (c.t === 'k') return c.n === 1 ? 'Nachttisch' : c.h >= 75 ? 'Kommode' : 'Sideboard';
  return 'Regal';
}

export const LIMITS = {
  n: [1, 6], fb: [40, 100, 10], h: [60, 260, 10], k: [60, 140, 10], a: [30, 50, 5],
  l: [100, 300, 20], q: [40, 110, 10],
} as const;
export const TIEFEN = { s: [40, 50, 60, 65], r: [25, 30, 35, 40], k: [35, 40, 45, 50] } as const;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const rad = (d: number) => (d * Math.PI) / 180;

/* ----------------------------------------------------------- Voreinstellungen */
const f = (s: number, d = 0, t = false, b = true, g = false): Feld => ({ s, d, t, b, ...(g ? { g } : {}) });
const K0 = { sch: '0' as const, sp: 'o' as const, k: 100, a: 45, x: false, farbe: 0, fk: false, fu: 's' as const };
export const PRESETS: Record<string, Cfg> = {
  schrank: { ...K0, t: 's', n: 4, fb: 60, h: 230, tf: 60, holz: 'e', ober: 'g', sch: 'r', k: 110,
    felder: [f(3, 0, true), f(3, 0, true), f(0, 3, true), f(2)] },
  regal: { ...K0, t: 'r', n: 3, fb: 60, h: 200, tf: 35, holz: 'a', ober: 'g', fu: 's',
    felder: [f(5), f(3, 2), f(5)] },
  garderobe: { ...K0, t: 's', n: 2, fb: 80, h: 200, tf: 40, holz: 'n', ober: 'g',
    felder: [f(0, 0, false, true, true), f(4, 0, true)] },
  sideboard: { ...K0, t: 'k', n: 3, fb: 60, h: 70, tf: 40, holz: 'e', ober: 'b', farbe: 0, fu: 'b',
    felder: [f(1, 0, true), f(0, 3), f(1, 0, true)] },
  kommode: { ...K0, t: 'k', n: 2, fb: 50, h: 90, tf: 45, holz: 'n', ober: 'g', fu: 'b',
    felder: [f(0, 4), f(0, 4)] },
  nachttisch: { ...K0, t: 'k', n: 1, fb: 50, h: 50, tf: 40, holz: 'a', ober: 'f', farbe: 0, fk: true, fu: 'b',
    felder: [f(1, 1, true)] },
  tisch: { t: 't', l: 220, q: 100, p: 4, th: 75, g: 'v', pf: 'r', e: 'g', holz: 'e', ober: 'g', farbe: 0, fk: true },
  tischoval: { t: 't', l: 220, q: 110, p: 4, th: 75, g: 'x', pf: 'o', e: 'g', holz: 'n', ober: 'g', farbe: 0, fk: true },
  schreibtisch: { t: 't', l: 160, q: 70, p: 3, th: 75, g: 'z', pf: 'r', e: 'f', holz: 'a', ober: 'g', farbe: 0, fk: true },
  couchtisch: { t: 't', l: 100, q: 60, p: 4, th: 45, g: 'k', pf: 'a', e: 'g', holz: 'e', ober: 'b', farbe: 2, fk: true },
  bank: { t: 't', l: 140, q: 40, p: 4, th: 46, g: 'b', pf: 'r', e: 'b', holz: 'e', ober: 'g', farbe: 0, fk: true },
  // Referenzen
  kniestock: { ...K0, t: 's', n: 5, fb: 60, h: 80, tf: 50, holz: 'a', ober: 'f', farbe: 0, fu: 's',
    felder: [f(0, 3), f(1, 0, true), f(0, 3), f(1, 0, true), f(0, 3)] },
  langtisch: { t: 't', l: 260, q: 100, p: 4, th: 75, g: 'k', pf: 'r', e: 'g', holz: 'n', ober: 'g', farbe: 0, fk: true },
};
/** Vorlagen für die Auswahl im Konstruktor: [Schlüssel, Name] */
export const VORLAGEN: [string, string][] = [
  ['schrank', 'Schrank unter Schräge'], ['regal', 'Bücherregal'], ['sideboard', 'Sideboard'], ['kommode', 'Kommode'],
  ['garderobe', 'Garderobe'], ['nachttisch', 'Nachttisch'], ['tisch', 'Esstisch'], ['tischoval', 'Esstisch oval'],
  ['schreibtisch', 'Schreibtisch'], ['couchtisch', 'Couchtisch'], ['bank', 'Bank'],
];

export const clone = <T>(c: T): T => JSON.parse(JSON.stringify(c));

/* --------------------------------------------------------------- Geometrie */
export function width(c: CfgKorpus) { return c.n * c.fb; }
const slopedBottom = (c: CfgKorpus) => c.sp === 'u' && (c.sch === 'l' || c.sch === 'r');
const slopedTop = (c: CfgKorpus) => c.sp === 'o' && c.sch !== '0';
export function plinth(c: CfgKorpus) {
  if (c.felder.some((x) => x.g) || slopedBottom(c)) return 0;
  return c.fu === 's' ? 8 : c.fu === 'b' ? 15 : 0;
}
const run = (c: CfgKorpus) => (c.h - c.k) / Math.tan(rad(c.a));       // Länge der Schräge in x (oben)
const runB = (c: CfgKorpus) => c.k / Math.tan(rad(c.a));              // Länge der Schräge in x (unten)

/** Oberkante des Korpus an Stelle x (cm) */
export function hTop(c: CfgKorpus, x: number) {
  if (!slopedTop(c)) return c.h;
  const W = width(c), ta = Math.tan(rad(c.a));
  if (c.sch === 'r') return Math.min(c.h, c.k + (W - x) * ta);
  if (c.sch === 'l') return Math.min(c.h, c.k + x * ta);
  return Math.min(c.h, c.k + Math.min(x, W - x) * ta);
}
/** Unterkante des Korpus an Stelle x (Treppenschrank: Unterkante steigt zur offenen Seite) */
export function hBot(c: CfgKorpus, x: number) {
  const pl = plinth(c);
  if (!slopedBottom(c)) return pl;
  const W = width(c), ta = Math.tan(rad(c.a));
  return Math.max(0, c.sch === 'r' ? c.k - (W - x) * ta : c.k - x * ta);
}
function topKinks(c: CfgKorpus): number[] {
  if (!slopedTop(c)) return [];
  const W = width(c), d = run(c);
  const cand = c.sch === 'r' ? [W - d] : c.sch === 'l' ? [d] : [d, W - d, W / 2];
  return [...new Set(cand.filter((x) => x > 0.5 && x < W - 0.5).map((x) => Math.round(x * 10) / 10))].sort((a, b) => a - b);
}
function botKinks(c: CfgKorpus): number[] {
  if (!slopedBottom(c)) return [];
  const W = width(c), d = runB(c);
  const x = c.sch === 'r' ? W - d : d;
  return x > 0.5 && x < W - 0.5 ? [x] : [];
}
/** Knickpunkt der Schräge (x) oder null (für Beschriftung) */
export function kink(c: CfgKorpus) {
  const k = slopedBottom(c) ? botKinks(c) : topKinks(c);
  if (!k.length) return null;
  return c.sch === 'l' ? k[0] : k[k.length - 1];
}
export function feldSpan(c: CfgKorpus, i: number): [number, number] {
  // offene Außenseite (Garderobe): Feld reicht bis zum Rand
  const l = i * c.fb + (i === 0 ? (c.felder[0]?.g ? 0 : T) : T / 2), r = (i + 1) * c.fb - (i === c.n - 1 ? (c.felder[c.n - 1]?.g ? 0 : T) : T / 2);
  return [l, r];
}
/** niedrigste Oberkante über einem Feld */
export function feldMinTop(c: CfgKorpus, i: number) {
  const [l, r] = feldSpan(c, i);
  return Math.min(hTop(c, l), hTop(c, r), ...topKinks(c).filter((x) => x > l && x < r).map((x) => hTop(c, x)));
}
/** Oberkante des Bodenbretts im Feld (nutzbarer Boden) */
export function feldBase(c: CfgKorpus, i: number) {
  const [l, r] = feldSpan(c, i);
  return Math.max(hBot(c, l), hBot(c, r)) + T;
}
function topLine(c: CfgKorpus, x0: number, x1: number, off: number): [number, number][] {
  const pts: [number, number][] = [[x0, hTop(c, x0) - off]];
  topKinks(c).forEach((kx) => { if (kx > x0 + 0.01 && kx < x1 - 0.01) pts.push([kx, hTop(c, kx) - off]); });
  pts.push([x1, hTop(c, x1) - off]);
  return pts;
}
function botLine(c: CfgKorpus, x0: number, x1: number, off: number): [number, number][] {
  const pts: [number, number][] = [[x0, hBot(c, x0) + off]];
  botKinks(c).forEach((kx) => { if (kx > x0 + 0.01 && kx < x1 - 0.01) pts.push([kx, hBot(c, kx) + off]); });
  pts.push([x1, hBot(c, x1) + off]);
  return pts;
}
export function maxDrawers(c: CfgKorpus, i: number) {
  const fd = c.felder[i];
  const free = feldMinTop(c, i) - T - feldBase(c, i) - (fd.t ? 40 : 0);
  return clamp(Math.floor(free / (DH + GAP)), 0, 6);
}
export function maxShelves(c: CfgKorpus, i: number) {
  const fd = c.felder[i];
  const free = feldMinTop(c, i) - T - feldBase(c, i) - fd.d * (DH + GAP);
  return clamp(Math.floor(free / 18) - 1, 0, 8);
}
/** Konfiguration in gültige Grenzen bringen (nach jeder Änderung) */
export function normalize(c: Cfg): Cfg {
  c.farbe = clamp(Math.round(c.farbe || 0), 0, (c.ober === 'b' ? BEIZEN[c.holz].length : DECK.length) - 1);
  if (c.t === 't') {
    c.l = clamp(c.l, LIMITS.l[0], LIMITS.l[1]); c.q = clamp(c.q, LIMITS.q[0], LIMITS.q[1]);
    c.th = clamp(Math.round(c.th / 5) * 5, 40, 110);
    c.p = c.p === 3 ? 3 : 4;
    if (c.e === 'b' && c.pf !== 'r') c.e = 'g';
    return c;
  }
  c.n = clamp(c.n, 1, 6); c.fb = clamp(c.fb, 40, 100);
  c.h = c.t === 'k' ? clamp(c.h, 40, 120) : clamp(c.h, 60, 260);
  if (c.t !== 's') { c.sch = '0'; c.sp = 'o'; }
  if (c.t === 'r' && !c.fu) c.fu = 'n';
  if (c.sp === 'u' && c.sch === 'm') c.sch = 'r';
  if (c.sp === 'u') { c.k = clamp(c.k, 30, Math.max(30, Math.min(100, c.h - 80))); }
  else c.k = clamp(c.k, 60, Math.min(140, c.h));
  c.a = clamp(c.a, 30, 50);
  while (c.felder.length < c.n) c.felder.push(f(2));
  c.felder.length = c.n;
  c.felder.forEach((fd, i) => {
    fd.d = clamp(fd.d, 0, maxDrawers(c, i));
    if (fd.t && feldMinTop(c, i) - feldBase(c, i) + T - fd.d * (DH + GAP) < 40) fd.t = false;
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
  const flatBottom = !slopedBottom(c);
  let o = 0;
  // 1 Seiten und Mittelwände
  for (let i = 0; i <= c.n; i++) {
    const outer = i === 0 || i === c.n;
    // Garderobe: Außenseite an der Bank-Seite bleibt offen (wie im Foto)
    if ((i === 0 && c.felder[0]?.g) || (i === c.n && c.felder[c.n - 1]?.g)) continue;
    const x = i === 0 ? T / 2 : i === c.n ? W - T / 2 : i * c.fb;
    const y0 = hBot(c, x) + (outer ? 0 : T);
    const y1 = hTop(c, x) - T;
    P.push({ id: `side-${i}`, kind: 'side', order: o++, box: { x, y: (y0 + y1) / 2, z: 0, w: T, h: y1 - y0, d: D }, grain: 'y' });
  }
  // 2 Fuß: Sockel oder Beine
  if (pl && c.fu === 's') P.push({ id: 'plinth', kind: 'plinth', order: o++, box: { x: W / 2, y: pl / 2, z: zf - 5 - T / 2, w: W - 2 * T, h: pl, d: T }, grain: 'x' });
  if (pl && c.fu === 'b') {
    const xs = W > 150 ? [5, W / 2, W - 5] : [5, W - 5];
    xs.forEach((lx, j) => [-1, 1].forEach((sz, k) =>
      P.push({ id: `fuss-${j}${k}`, kind: 'leg', order: o, box: { x: lx, y: pl / 2, z: sz * (D / 2 - 6), w: 4.5, h: pl, d: 4.5 }, grain: 'y' })));
    o++;
  }
  if (joints && flatBottom) [T, W - T].forEach((x, j) => [-D / 3, D / 3].forEach((z, k) =>
    P.push({ id: `dowel-b-${j}${k}`, kind: 'dowel', order: o, cyl: { x: j ? x - 1.5 : x + 1.5, y: pl + T / 2, z, r: 0.45, len: 4, axis: 'x' }, mat: 'dowel', grain: 'x' })));
  o++;
  // Boden: flach ein Brett, bei Treppenschräge je Feld folgend
  if (flatBottom) P.push({ id: 'bottom', kind: 'bottom', order: o++, box: { x: W / 2, y: pl + T / 2, z: -0.5, w: W - 2 * T, h: T, d: D - 1 }, grain: 'x' });
  else {
    for (let i = 0; i < c.n; i++) {
      const line = botLine(c, i * c.fb, (i + 1) * c.fb, 0);
      for (let s = 0; s < line.length - 1; s++) {
        const [ax, ay] = line[s], [bx, by] = line[s + 1];
        const L = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
        const nx = -Math.sin(ang) * (T / 2), ny = Math.cos(ang) * (T / 2);
        P.push({ id: `bottom-${i}-${s}`, kind: 'bottom', order: o, feld: i,
          box: { x: (ax + bx) / 2 + nx, y: (ay + by) / 2 + ny, z: -0.5, w: L, h: T, d: D - 1, rz: (ang * 180) / Math.PI }, grain: 'x' });
      }
    }
    o++;
  }
  // 3 Deckel (folgt der Schräge), je Feld ein Brett bzw. mehrere am Knick
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
    const yBase = feldBase(c, i), yTopMin = feldMinTop(c, i) - T;
    if (fd.b || fd.g) {
      const pts: [number, number][] = [...botLine(c, l, r, T), ...topLine(c, l, r, T).reverse()];
      P.push({ id: `back-${i}`, kind: 'back', order: o + 1, feld: i, poly: { pts, z: -D / 2, dz: 1 }, mat: fd.g ? 'wood' : 'back', grain: 'y' });
    }
    const drawTop = yBase + fd.d * (DH + GAP);
    if (fd.g) {
      // Garderobe: Bank, Kissen, Haken
      P.push({ id: `bench-${i}`, kind: 'bench', order: o + 2, feld: i, box: { x: xm, y: 44, z: 0, w: wi, h: 4, d: D - 2 }, grain: 'x' });
      P.push({ id: `bench-f-${i}`, kind: 'bench', order: o + 2, feld: i, box: { x: xm, y: 21, z: D / 2 - 6, w: wi, h: 42, d: T }, grain: 'x' });
      P.push({ id: `cushion-${i}`, kind: 'cushion', order: o + 3, feld: i, box: { x: xm, y: 48, z: 1, w: wi - 4, h: 4, d: D - 8 }, mat: 'cushion', grain: 'x' });
      // Hakenleiste: Brett an der Rückwand, Haken sitzen darauf (Montage: alles zusammen)
      const np = Math.max(3, Math.round(wi / 16)), rw = wi - 10;
      P.push({ id: `leiste-g-${i}`, kind: 'leiste', order: o + 3, feld: i, box: { x: xm, y: 165, z: -D / 2 + 1 + 1.5, w: rw, h: 7, d: 3 }, grain: 'x' });
      for (let k = 0; k < np; k++) P.push({ id: `peg-${i}-${k}`, kind: 'peg', order: o + 3, feld: i,
        cyl: { x: xm - rw / 2 + 6 + ((rw - 12) / (np - 1)) * k, y: 165, z: -D / 2 + 1 + 3 + 4, r: 1.4, len: 8, axis: 'z' }, grain: 'z' });
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
    const y00 = yBase - T;
    for (let k = 0; k < fd.d; k++) {
      const y0 = y00 + k * (DH + GAP) + GAP;
      P.push({ id: `drawer-${i}-${k}`, kind: 'drawer', order: o + 4, feld: i, front: true, box: { x: (fl + fr) / 2, y: y0 + DH / 2, z: zf + T / 2, w: fr - fl, h: DH, d: T }, grain: 'x' });
      P.push({ id: `knob-d-${i}-${k}`, kind: 'knob', order: o + 4, feld: i, cyl: { x: (fl + fr) / 2, y: y0 + DH / 2, z: zf + T + 1, r: 1.3, len: 2, axis: 'z' }, grain: 'z' });
    }
    // Tür (folgt der Schräge oben und unten)
    if (fd.t) {
      const y0 = y00 + fd.d * (DH + GAP) + GAP;
      const lower: [number, number][] = fd.d > 0 ? [[fl, y0], [fr, y0]] : botLine(c, fl, fr, GAP);
      const pts: [number, number][] = [...lower, ...topLine(c, fl, fr, T + GAP).reverse()];
      P.push({ id: `door-${i}`, kind: 'door', order: o + 5, feld: i, front: true, poly: { pts, z: zf, dz: T }, grain: 'y' });
      const hy = Math.min(y0 + 95, (y0 + Math.min(hTop(c, fl), hTop(c, fr)) - T) / 2);
      const kx = i < c.n / 2 ? fr - 5 : fl + 5;
      P.push({ id: `knob-t-${i}`, kind: 'knob', order: o + 5, feld: i, cyl: { x: kx, y: Math.max(hy, hBot(c, kx) + 20), z: zf + T + 1, r: 1.3, len: 2, axis: 'z' }, grain: 'z' });
    }
  });
  return P;
}

function wavyLamelle(L: number, z0: number, lw: number, outer: -1 | 1, seed: number): [number, number][] {
  // Baumkante: Außenkante unregelmäßig, Innenkante gerade
  const n = 28, pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const x = -L / 2 + (L * i) / n;
    const w = 1.6 + 1.4 * Math.sin(i * 0.55 + seed) + 0.9 * Math.sin(i * 1.7 + seed * 2) + 0.5 * Math.sin(i * 3.1);
    pts.push([x, outer < 0 ? z0 - w * 0.5 : z0 + lw + w * 0.5]);
  }
  const back: [number, number][] = [[L / 2, outer < 0 ? z0 + lw : z0], [-L / 2, outer < 0 ? z0 + lw : z0]];
  return [...pts, ...back];
}
function platePts(c: CfgTisch): [number, number][] {
  const a = c.l / 2, b = c.q / 2;
  if (c.pf === 'o') return Array.from({ length: 64 }, (_, i) => { const t = (i / 64) * Math.PI * 2; return [a * Math.cos(t), b * Math.sin(t)] as [number, number]; });
  if (c.pf === 'a') {
    const r = Math.min(14, b * 0.5), pts: [number, number][] = [];
    [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(([sx, sz], q) => {
      for (let i = 0; i <= 6; i++) { const t = (Math.PI / 2) * (i / 6) + (Math.PI / 2) * q; pts.push([sx * (a - r) + r * Math.cos(t) * 1, sz * (b - r) + r * Math.sin(t) * 1]); }
    });
    return pts;
  }
  return [[-a, -b], [a, -b], [a, b], [-a, b]];
}

function buildTisch(c: CfgTisch, joints: boolean): Part[] {
  const P: Part[] = [];
  const H = c.th, L = c.l, B = c.q, p = c.p, yt = H - p;
  let o = 0;
  const m = Math.max(4, Math.round(B / 13)), lw = B / m;
  const hl = yt - 3;
  // Gestell
  let gx = L / 2 - 32;
  if (c.g === 'v') {
    const lx = L / 2 - clamp(L * 0.143, 20, 34), lz = B / 2 - 9; gx = lx;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], k) =>
      P.push({ id: `leg-${k}`, kind: 'leg', order: o, box: { x: sx * lx, y: hl / 2, z: sz * lz, w: 7, h: hl, d: 7 }, grain: 'y' }));
  } else if (c.g === 'k') {
    const fx = L / 2 - Math.min(30, L / 4), pz = B / 2 - Math.min(14, B / 4); gx = fx;
    [-1, 1].forEach((sx, j) => {
      [-1, 1].forEach((sz, k) => P.push({ id: `leg-${j}${k}`, kind: 'leg', order: o, box: { x: sx * fx, y: hl / 2, z: sz * pz, w: 6, h: hl, d: 6 }, grain: 'y' }));
      P.push({ id: `rail-f-${j}`, kind: 'rail', order: o, box: { x: sx * fx, y: 3.5, z: 0, w: 6, h: 7, d: 2 * pz + 10 }, grain: 'z' });
    });
  } else if (c.g === 'w') {
    const wx = L / 2 - Math.min(32, L / 4); gx = wx;
    [-1, 1].forEach((sx, j) => P.push({ id: `leg-${j}`, kind: 'leg', order: o, box: { x: sx * wx, y: hl / 2, z: 0, w: 4, h: hl, d: B - 26 }, grain: 'y' }));
    P.push({ id: 'rail-t', kind: 'rail', order: o, box: { x: 0, y: Math.min(42, hl * 0.55), z: 0, w: 2 * wx - 4, h: 10, d: 4 }, grain: 'x' });
  } else if (c.g === 'x') {
    // Kreuzgestell: je Seite zwei gekreuzte Bretter + Mittelstrebe
    const x0 = L / 2 - Math.min(34, L / 4), s = Math.min(28, L / 6), len = Math.hypot(2 * s, hl), ang = (Math.atan2(2 * s, hl) * 180) / Math.PI; gx = x0;
    [-1, 1].forEach((sx, j) => [-1, 1].forEach((sg, k) =>
      P.push({ id: `leg-${j}${k}`, kind: 'leg', order: o, box: { x: sx * x0, y: hl / 2, z: 0, w: 5, h: len, d: B - 34 - k * 0.6, rz: sg * ang }, grain: 'y' })));
    P.push({ id: 'rail-x', kind: 'rail', order: o, box: { x: 0, y: hl * 0.5, z: 0, w: 2 * x0, h: 6, d: 3 }, grain: 'x' });
  } else if (c.g === 'z') {
    const lx = L / 2 - 8, lz = B / 2 - 8; gx = lx;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], k) =>
      P.push({ id: `leg-${k}`, kind: 'leg', order: o, box: { x: sx * lx, y: hl / 2, z: sz * lz, w: 6, h: hl, d: 6 }, grain: 'y' }));
    [-1, 1].forEach((sz, k) => P.push({ id: `rail-a-${k}`, kind: 'rail', order: o, box: { x: 0, y: hl - 5, z: sz * lz, w: 2 * lx - 6, h: 9, d: 2 }, grain: 'x' }));
    [-1, 1].forEach((sx, k) => P.push({ id: `rail-e-${k}`, kind: 'rail', order: o, box: { x: sx * lx, y: hl - 5, z: 0, w: 2, h: 9, d: 2 * lz - 6 }, grain: 'z' }));
  } else {
    // Bock: zwei A-Gestelle + Mittelstrebe
    const x0 = L / 2 - Math.min(30, L / 4), s = 10, len = Math.hypot(s, hl), ang = (Math.atan2(s, hl) * 180) / Math.PI; gx = x0;
    [-1, 1].forEach((sx, j) => [-1, 1].forEach((sg, k) =>
      P.push({ id: `leg-${j}${k}`, kind: 'leg', order: o, box: { x: sx * x0 - sg * (s / 2), y: hl / 2, z: 0, w: 5, h: len, d: B - 18, rz: -sg * ang }, grain: 'y' })));
    P.push({ id: 'rail-b', kind: 'rail', order: o, box: { x: 0, y: Math.min(18, hl * 0.3), z: 0, w: 2 * x0, h: 5, d: 3 }, grain: 'x' });
  }
  o++;
  // Gratleisten (gegen Verziehen) quer unter der Platte
  const lg = Math.min(gx, L / 2 - 10);
  [-1, 1].forEach((sx, j) => P.push({ id: `leiste-${j}`, kind: 'leiste', order: o, box: { x: sx * lg, y: yt - 1.5, z: 0, w: 8, h: 3, d: Math.min(B - 6, c.pf === 'r' ? B - 6 : B * 0.7) }, grain: 'z' }));
  o++;
  // Platte
  const single = c.pf !== 'r' || c.e === 'f';
  if (single) {
    P.push({ id: 'lamelle-0', kind: 'lamelle', order: o, polyXZ: { pts: platePts(c), y: yt, dy: p, bevel: c.e === 'f' ? 0.5 : 0 }, grain: 'x', mat: 'wood' });
    return P;
  }
  for (let k = 0; k < m; k++) {
    const z = -B / 2 + lw * (k + 0.5);
    if (joints && k > 0) for (let d = 0; d < 4; d++) P.push({ id: `dowel-l-${k}-${d}`, kind: 'dowel', order: o + k, mat: 'dowel', grain: 'z',
      cyl: { x: -L / 2 + (L / 5) * (d + 1), y: yt + p / 2, z: z - lw / 2, r: 0.5, len: 5, axis: 'z' } });
    if (c.e === 'b' && (k === 0 || k === m - 1)) {
      const z0 = -B / 2 + lw * k;
      P.push({ id: `lamelle-${k}`, kind: 'lamelle', order: o + k, polyXZ: { pts: wavyLamelle(L, z0, lw, k === 0 ? -1 : 1, k + 1), y: yt, dy: p }, grain: 'x', mat: 'wood' });
    } else
      P.push({ id: `lamelle-${k}`, kind: 'lamelle', order: o + k, box: { x: 0, y: yt + p / 2, z, w: L, h: p, d: lw - 0.04 }, grain: 'x' });
  }
  return P;
}

/* ---------------------------------------------------------- Bounding box */
export function bounds(c: Cfg) {
  if (c.t === 't') return { x0: -c.l / 2, x1: c.l / 2, y0: 0, y1: c.th, z0: -c.q / 2, z1: c.q / 2 };
  return { x0: 0, x1: width(c), y0: 0, y1: c.h, z0: -c.tf / 2, z1: c.tf / 2 + T };
}

/* ------------------------------------------------------- Meister-Hinweise */
export function sagLimit(h: Holz) { return h === 'k' ? 80 : 90; }
export interface Hinweis { id: string; short: string; text: string; fix?: { label: string; apply: (c: Cfg) => void }[]; info?: boolean }
export function checks(c: Cfg): Hinweis[] {
  const H: Hinweis[] = [];
  if (c.t === 't') {
    if (c.p === 3 && c.l > 240) H.push({ id: 'platte', short: 'Platte zu dünn', text: `Eine 3-cm-Platte über ${c.l} cm biegt sich mit der Zeit durch. Ich empfehle 4 cm.`,
      fix: [{ label: '4 cm nehmen', apply: (x) => { (x as CfgTisch).p = 4; } }] });
    if (c.l >= 240 && c.g === 'v') H.push({ id: 'beine', short: 'Beine weiter innen', info: true, text: 'Bei dieser Länge setze ich die Beine etwas weiter ein, damit an den Enden zwei Stühle Platz haben.' });
    if (c.e === 'b') H.push({ id: 'baum', short: 'Baumkante: jedes Brett ein Unikat', info: true, text: 'Baumkante: Die Kante bleibt so, wie der Baum gewachsen ist. Jede Platte wird ein Unikat, ich suche die Bohlen passend aus.' });
    if (c.pf === 'o' && c.l > 240) H.push({ id: 'oval', short: 'Ovalplatte aus mehreren Bohlen', info: true, text: 'Eine ovale Platte dieser Länge baue ich aus mehreren Bohlen und gleiche die Maserung an. Das dauert etwas länger.' });
    if (c.g === 'b' && c.l > 180) H.push({ id: 'bock', short: 'Bock: Zusatzstrebe', info: true, text: 'Bei Bock-Gestellen über 180 cm Länge verbinde ich die Böcke zusätzlich mit einer stärkeren Strebe.' });
    return H;
  }
  const lim = sagLimit(c.holz), wi = c.fb - T;
  const wide = c.felder.some((fd) => fd.s > 0 && !fd.g) && wi > lim;
  if (wide && !c.x) H.push({ id: 'durchbiegung', short: 'Fachböden zu breit', text: `Fachböden mit ${Math.round(wi)} cm Spannweite biegen sich unter Büchern durch (${HOLZ[c.holz]}, 2 cm).`,
    fix: [
      { label: 'Stahlschiene einlassen', apply: (x) => { (x as CfgKorpus).x = true; } },
      { label: `Felder auf ${Math.floor((lim + T) / 10) * 10} cm`, apply: (x) => { const k = x as CfgKorpus; const nb = Math.floor((lim + T) / 10) * 10; const W = k.n * k.fb; k.fb = nb; k.n = Math.min(6, Math.max(k.n, Math.round(W / nb))); } },
    ] });
  if (c.t === 'r' && c.h > 180 && c.tf <= 30) H.push({ id: 'kipp', short: 'Wandbefestigung nötig', info: true, text: 'Hoch und schmal: Ich befestige das Regal an der Wand (Kippschutz), ist im Preis drin.' });
  if (c.t === 's' && c.sch !== '0') H.push({ id: 'aufmass', short: 'Schräge wird vor Ort vermessen', info: true, text: 'Schräge, Kniestock und Wände messe ich vor Ort genau aus. Die Werte hier sind Ihr Startpunkt.' });
  if (c.t === 'k' && c.fu === 'b' && width(c) > 150) H.push({ id: 'mittelfuss', short: 'Zusätzliche Beine in der Mitte', info: true, text: 'Bei dieser Breite bekommt das Möbel in der Mitte zwei zusätzliche Beine, sonst biegt sich der Boden durch.' });
  return H;
}
export const openWarnings = (c: Cfg) => checks(c).filter((h) => !h.info).length;

/* ------------------------------------------------------------- Kalkulation */
export interface Preis { material: number; stunden: number; montage: number; total: number; lfm?: number }
const area = (p: Part) => {
  if (p.box) { const [a, b, cc] = [p.box.w, p.box.h, p.box.d].sort((x, y) => y - x); void cc; return (a * b) / 10000; }
  if (p.polyXZ) { let s = 0; const q = p.polyXZ.pts; for (let i = 0; i < q.length; i++) { const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % q.length]; s += x1 * y2 - x2 * y1; } return Math.abs(s) / 2 / 10000; }
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
    h = K.std.tischBasis + (c.l * c.q) / 10000 * K.std.tischProM2 + (K.std.gestell as Record<string, number>)[c.g];
    if (c.pf === 'a') h += K.std.plattenRund; if (c.pf === 'o') h += K.std.plattenOval;
    if (c.e === 'f') h += K.std.kanteFase; if (c.e === 'b') h += K.std.kanteBaum;
    if (c.ober !== 'g') h += c.ober === 'f' ? K.std.farbig : K.std.beize;
    mont = K.std.tischLieferung;
  } else {
    const n = (k: Kind) => parts.filter((p) => p.kind === k).length;
    h = K.std.korpusBasis + c.n * K.std.proFeld + n('shelf') * K.std.fach + n('door') * K.std.tuer + n('drawer') * K.std.schublade
      + parts.filter((p) => p.kind === 'back').length * K.std.rueckwand;
    if (c.sch !== '0') h += K.std.schraegeBasis + parts.filter((p) => p.kind === 'top').length * K.std.schraegeProBrett;
    if (c.ober === 'f') h += K.std.farbig; if (c.ober === 'b') h += K.std.beize;
    if (c.fu === 'b') h += K.std.beine;
    mont = c.t === 'k' ? K.std.montageKommode + c.n * K.std.montageKommodeFeld : c.t === 's' ? K.std.montageSchrankBasis + c.n * K.std.montageSchrankFeld : K.std.montageRegal + c.n * K.std.montageRegalFeld;
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
  u.set('t', c.t); u.set('w', c.holz); u.set('o', c.ober); if (c.ober === 'f' || c.ober === 'b') { u.set('c', String(c.farbe)); if (c.fk) u.set('fk', '1'); }
  if (c.t === 't') { u.set('l', String(c.l)); u.set('q', String(c.q)); u.set('p', String(c.p)); u.set('th', String(c.th)); u.set('g', c.g); u.set('pf', c.pf); u.set('e', c.e); }
  else {
    u.set('n', String(c.n)); u.set('b', String(c.fb)); u.set('h', String(c.h)); u.set('d', String(c.tf)); u.set('fu', c.fu);
    if (c.sch !== '0') { u.set('s', c.sch); u.set('sp', c.sp); u.set('k', String(c.k)); u.set('a', String(c.a)); }
    if (c.x) u.set('x', '1');
    u.set('f', c.felder.map((fd) => (fd.g ? 'g' : '') + (fd.t ? 't' : '') + (fd.d ? 'd' + fd.d : '') + 's' + fd.s + (fd.b ? 'r' : '')).join('.'));
  }
  return u.toString();
}
const pick = <T extends string>(v: string | null, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d);
export function decode(q: string): Cfg | null {
  try {
    const u = new URLSearchParams(q), t = u.get('t');
    const holz = pick(u.get('w'), ['e', 'n', 'a', 'k'] as const, 'e');
    const ober = pick(u.get('o'), ['g', 'l', 'b', 'f'] as const, 'g');
    const farbe = Math.max(0, Math.round(Number(u.get('c')) || 0));
    const fk = u.get('fk') === '1';
    const num = (k: string, d: number) => { const v = Number(u.get(k)); return Number.isFinite(v) && v > 0 ? v : d; };
    if (t === 't') {
      return normalize({ t: 't', l: num('l', 220), q: num('q', 100), p: num('p', 4), th: num('th', 75), g: pick(u.get('g'), ['v', 'k', 'w', 'x', 'z', 'b'] as const, 'v'),
        pf: pick(u.get('pf'), ['r', 'a', 'o'] as const, 'r'), e: pick(u.get('e'), ['g', 'f', 'b'] as const, 'g'), holz, ober, farbe, fk: true });
    }
    if (t !== 's' && t !== 'r' && t !== 'k') return null;
    const felder = (u.get('f') || '').split('.').filter(Boolean).map((s) => ({
      g: s.includes('g') || undefined, t: s.includes('t'), b: s.includes('r'),
      d: Number((s.match(/d(\d)/) || [])[1] || 0), s: Number((s.match(/s(\d)/) || [])[1] || 0),
    })).map((x) => { const o: Feld = { s: x.s, d: x.d, t: x.t, b: x.b }; if (x.g) o.g = true; return o; });
    return normalize({ t, n: num('n', 3), fb: num('b', 60), h: num('h', 200), tf: num('d', t === 's' ? 60 : t === 'k' ? 40 : 35), holz, ober, farbe, fk,
      sch: pick(u.get('s'), ['l', 'r', 'm'] as const, '0' as any) as CfgKorpus['sch'], sp: pick(u.get('sp'), ['o', 'u'] as const, 'o'), k: num('k', 100), a: num('a', 45),
      x: u.get('x') === '1', fu: pick(u.get('fu'), ['s', 'b', 'n'] as const, t === 'r' ? 'n' : 's'), felder });
  } catch { return null; }
}

/* ---------------------------------------------------------- Kurzbeschreibung */
const GESTELL = { v: 'Vier Beine', k: 'Kufen', w: 'Wangen', x: 'Kreuzgestell', z: 'Zargentisch', b: 'Bock' } as const;
const KANTE = { g: 'gerade Kante', f: 'gefaste Kante', b: 'Baumkante' } as const;
const PLATTE = { r: 'rechteckig', a: 'abgerundete Ecken', o: 'oval' } as const;
const FUSS = { s: 'Sockel', b: 'Beine', n: 'direkt auf dem Boden' } as const;
export function summary(c: Cfg): [string, string][] {
  const w: [string, string][] = [['Möbel', label(c)]];
  const fa = farbeOf(c);
  const holz = `${HOLZ[c.holz]}, ${OBER[c.ober]}${fa ? ' (' + fa.name + (c.ober === 'f' && c.t !== 't' ? (c.fk ? ', ganzes Möbel' : ', nur Fronten') : '') + ')' : ''}`;
  if (c.t === 't') {
    w.push(['Maße', `${c.l} × ${c.q} × ${c.th} cm (L × B × H), Platte ${c.p} cm`], ['Platte', `${PLATTE[c.pf]}, ${KANTE[c.e]}`], ['Gestell', GESTELL[c.g]], ['Holz', holz]);
    return w;
  }
  w.push(['Maße', `${width(c)} × ${c.h} × ${c.tf} cm (B × H × T)`]);
  if (c.sch !== '0') w.push(['Schräge', `${c.sch === 'm' ? 'beidseitig (Giebel)' : c.sch === 'r' ? 'rechts' : 'links'}, ${c.sp === 'u' ? 'unten (Treppe), Aussparung' : 'oben (Dach), Kniestock'} ${c.k} cm, ${c.a}°`]);
  if (c.t === 'k') w.push(['Fuß', FUSS[c.fu]]);
  w.push(['Felder', `${c.n} × ${c.fb} cm`]);
  const cnt = (k: keyof Feld) => c.felder.reduce((s, fd) => s + Number(fd[k] || 0), 0);
  const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  w.push(['Inhalt', [pl(cnt('s'), 'Fachboden', 'Fachböden'), pl(c.felder.filter((x) => x.t).length, 'Tür', 'Türen'), pl(cnt('d'), 'Schublade', 'Schubladen'), pl(c.felder.filter((x) => x.b).length, 'Rückwand', 'Rückwände')].join(', ')]);
  if (c.x) w.push(['Extra', 'Stahlschienen in breiten Fächern']);
  w.push(['Holz', holz]);
  return w;
}
