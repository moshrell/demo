// Геометрия оправ в миллиметрах. Начало координат — середина переносицы, x вправо, y вниз.
// Один источник для каталога (SVG при сборке) и примерки (Path2D на canvas): слои отдают строку пути d.
// Размеры по системе Boxing: «50□19» = ширина линзы 50 мм, мост (расстояние между линзами) 19 мм.

export type Shape = 'rund' | 'panto' | 'eckig' | 'cat' | 'pilot' | 'hexa';
export type Paint = { id: string; name: string; rim: string; rim2?: string; pattern?: 'havanna'; glass?: string };
export type Frame = {
  id: string; name: string; form: string; material: 'Acetat' | 'Metall';
  shape: Shape; lens: number; height: number; bridge: number; temple: number; rim: number;
  price: number; note: string; paints: Paint[];
};

export const PAINTS: Record<string, Paint> = {
  schwarz: { id: 'schwarz', name: 'Schwarz', rim: '#1b1a1f', rim2: '#55525e' },
  havanna: { id: 'havanna', name: 'Havanna', rim: '#8a4a17', rim2: '#d9a05a', pattern: 'havanna' },
  kristall: { id: 'kristall', name: 'Kristall', rim: '#b9bcc9', rim2: '#f4f5fa' },
  navy: { id: 'navy', name: 'Nachtblau', rim: '#1d2c4d', rim2: '#5b6e9c' },
  bordeaux: { id: 'bordeaux', name: 'Bordeaux', rim: '#651b2c', rim2: '#a8566a' },
  gold: { id: 'gold', name: 'Gold', rim: '#a8843f', rim2: '#ecd596' },
  silber: { id: 'silber', name: 'Silber', rim: '#8b9098', rim2: '#e3e6ea' },
  mattschwarz: { id: 'mattschwarz', name: 'Mattschwarz', rim: '#232227', rim2: '#6a6872' },
};
const P = PAINTS;

export const FRAMES: Frame[] = [
  { id: 'linden', name: 'Linden', form: 'Panto', material: 'Acetat', shape: 'panto', lens: 48, height: 42, bridge: 21, temple: 145, rim: 3.4, price: 189, note: 'Der Klassiker: oben flach, unten rund. Passt zu kantigen und ovalen Gesichtern.', paints: [P.havanna, P.schwarz, P.kristall] },
  { id: 'list', name: 'List', form: 'Rechteck', material: 'Acetat', shape: 'eckig', lens: 53, height: 36, bridge: 17, temple: 145, rim: 3.6, price: 169, note: 'Klare Kante, ruhige Linie. Gibt runden Gesichtern Kontur.', paints: [P.schwarz, P.navy, P.havanna] },
  { id: 'eilenriede', name: 'Eilenriede', form: 'Rund', material: 'Metall', shape: 'rund', lens: 47, height: 47, bridge: 22, temple: 145, rim: 1.1, price: 219, note: 'Dünner Rand, 14 Gramm. Fällt kaum auf und wirkt weich.', paints: [P.gold, P.silber, P.mattschwarz] },
  { id: 'maschsee', name: 'Maschsee', form: 'Pilot', material: 'Metall', shape: 'pilot', lens: 55, height: 47, bridge: 16, temple: 140, rim: 1.2, price: 229, note: 'Tropfenform mit Doppelsteg. Auch als Sonnenbrille mit Ihrer Stärke.', paints: [P.gold, P.silber] },
  { id: 'oststadt', name: 'Oststadt', form: 'Cat-Eye', material: 'Acetat', shape: 'cat', lens: 51, height: 40, bridge: 18, temple: 140, rim: 3.2, price: 199, note: 'Außen nach oben gezogen. Hebt die Wangenknochen.', paints: [P.bordeaux, P.schwarz, P.havanna] },
  { id: 'nordstadt', name: 'Nordstadt', form: 'Sechseck', material: 'Metall', shape: 'hexa', lens: 49, height: 44, bridge: 20, temple: 145, rim: 1.2, price: 209, note: 'Sechs weiche Ecken. Für alle, denen Rund zu brav ist.', paints: [P.silber, P.gold, P.mattschwarz] },
];

const sgn = (v: number) => (v < 0 ? -1 : 1);
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Контур правой (на картинке) линзы вокруг своего центра; +x = к виску. */
function outline(shape: Shape, a: number, b: number, n = 96): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    let ex = 2, ey = 2;
    if (shape === 'panto') { ex = 2.25; ey = 2.25; }
    if (shape === 'eckig') { ex = 4.6; ey = 4.2; }
    if (shape === 'cat') { ex = 2.9; ey = 2.9; }
    if (shape === 'pilot') { ex = 2.5; ey = 2.3; }
    let x = sgn(c) * Math.pow(Math.abs(c), 2 / ex);
    let y = sgn(s) * Math.pow(Math.abs(s), 2 / ey);
    if (shape === 'hexa') { // скруглённый шестиугольник: вершины слева и справа
      const seg = Math.PI / 3; const d = ((t % seg) + seg) % seg - seg / 2;
      const k = 0.42 * (Math.cos(seg / 2) / Math.cos(d)) + 0.58 * 0.93;
      x = c * k * 1.06; y = s * k * 1.06;
    }
    const up = -y; // 1 вверху, −1 внизу
    if (shape === 'panto') { x *= 1 + 0.07 * up; if (y < 0) y *= 0.9; }
    if (shape === 'eckig') { x *= 1 + 0.035 * up; }
    if (shape === 'cat') { x *= 1 + 0.16 * up; if (x > 0 && y < 0) y -= 0.42 * x * x * -y; if (x > 0) x *= 1 + 0.1 * Math.max(0, up); if (y > 0) y *= 0.94; }
    if (shape === 'pilot') { x *= 1 + 0.13 * up; if (y > 0) { y *= 1.06; x += 0.1 * y * y; } if (y < 0) y *= 0.92; }
    pts.push([x * a, y * b]);
  }
  // нормировка: габарит ровно 2a × 2b, центр в нуле
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  return pts.map(([x, y]) => [((x - minx) / (maxx - minx) - 0.5) * 2 * a, ((y - miny) / (maxy - miny) - 0.5) * 2 * b]);
}

const toD = (pts: [number, number][]) => 'M' + pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join('L') + 'Z';

export type Layer = { d: string; kind: 'glass' | 'fill' | 'rim' | 'shine' | 'pad'; width?: number };
export type Built = { layers: Layer[]; w: number; h: number; hinge: { x: number; y: number }; half: number };

export function build(f: Frame): Built {
  const a = f.lens / 2, b = f.height / 2, cx = f.bridge / 2 + a;
  const R = outline(f.shape, a, b).map(([x, y]) => [x + cx, y] as [number, number]);
  const L = R.map(([x, y]) => [-x, y] as [number, number]);
  const acet = f.material === 'Acetat';
  const rim = f.rim;
  const layers: Layer[] = [];
  layers.push({ d: toD(R) + toD(L), kind: 'glass' });

  // точки контура: самая внутренняя (к носу) сверху и снизу моста, шарнир снаружи сверху
  const inner = R.filter(([x]) => x < cx);
  const at = (yy: number) => inner.reduce((p, q) => (Math.abs(q[1] - yy) < Math.abs(p[1] - yy) ? q : p));
  const outerTop = R.filter(([x, y]) => x > cx && y < 0);
  const hingeY = f.shape === 'cat' ? -b * 0.62 : f.shape === 'pilot' ? -b * 0.7 : -b * 0.42;
  const hp = outerTop.reduce((p, q) => (Math.abs(q[1] - hingeY) < Math.abs(p[1] - hingeY) ? q : p));

  if (acet) {
    const t = at(-b * 0.52), u = at(-b * 0.02);
    const br = `M${r2(-t[0])} ${r2(t[1])}Q0 ${r2(t[1] - 1.6)} ${r2(t[0])} ${r2(t[1])}L${r2(u[0])} ${r2(u[1])}Q0 ${r2(t[1] + 3.4)} ${r2(-u[0])} ${r2(u[1])}Z`;
    layers.push({ d: br, kind: 'fill' });
    const lug = (s: number) => { const x0 = s * (hp[0] - 0.5), x1 = s * (hp[0] + rim * 0.5 + 4.2), y0 = hp[1] - 2.3, y1 = hp[1] + 2.5; return `M${r2(x0)} ${r2(y0)}L${r2(x1)} ${r2(y0 + 0.5)}Q${r2(x1 + s * 1.2)} ${r2((y0 + y1) / 2)} ${r2(x1)} ${r2(y1 - 0.4)}L${r2(x0)} ${r2(y1)}Z`; };
    layers.push({ d: lug(1) + lug(-1), kind: 'fill' });
    layers.push({ d: toD(R) + toD(L), kind: 'rim', width: rim * 1.2 });
    // блик: верхняя дуга каждой линзы, тоньше обода
    const arc = (pts: [number, number][]) => { const top = pts.filter(([, y]) => y < -b * 0.55).sort((p, q) => p[0] - q[0]); return 'M' + top.map(([x, y]) => `${r2(x)} ${r2(y - rim * 0.18)}`).join('L'); };
    layers.push({ d: arc(R) + arc(L), kind: 'shine', width: rim * 0.3 });
  } else {
    const t = at(-b * 0.38);
    let br = `M${r2(-t[0])} ${r2(t[1])}Q0 ${r2(t[1] - 5)} ${r2(t[0])} ${r2(t[1])}`;
    if (f.shape === 'pilot') { const v = at(-b * 0.86); br += `M${r2(-v[0] - 1)} ${r2(v[1])}Q0 ${r2(v[1] - 2.2)} ${r2(v[0] + 1)} ${r2(v[1])}`; }
    layers.push({ d: br, kind: 'rim', width: rim * 1.25 });
    const lug = (s: number) => `M${r2(s * hp[0])} ${r2(hp[1])}L${r2(s * (hp[0] + 4.6))} ${r2(hp[1] - 0.4)}`;
    layers.push({ d: lug(1) + lug(-1), kind: 'rim', width: rim * 2.1 });
    // носоупоры
    const n = at(b * 0.28);
    const pad = (s: number) => { const x = s * (n[0] - 3.2), y = n[1] + 1.5; return `M${r2(s * n[0])} ${r2(n[1] - 2)}Q${r2(s * (n[0] - 3.4))} ${r2(n[1] - 2.6)} ${r2(x)} ${r2(y)}`; };
    layers.push({ d: pad(1) + pad(-1), kind: 'pad', width: rim * 0.8 });
    layers.push({ d: toD(R) + toD(L), kind: 'rim', width: rim * 1.5 });
  }
  const half = cx + a + rim + 5.5;
  return { layers, w: half * 2, h: f.height + rim * 2 + 6, hinge: { x: hp[0] + rim * 0.5 + 4.4, y: hp[1] }, half };
}

/** Пятна «гаваны» в плитке 26×26 мм: [x, y, rx, ry, тёмное?]. */
export const HAVANNA: [number, number, number, number, number][] = [
  [4, 5, 6.5, 4.2, 1], [16, 2, 4.4, 2.4, 0], [22, 11, 5.6, 6.4, 1], [9, 16, 7, 4.2, 1], [18, 21, 3.4, 4.8, 0], [2, 23, 4.6, 3, 1], [12, 9, 2.6, 2, 0],
];

/** SVG для каталога (строится при сборке). */
export function svg(f: Frame, paint: Paint, opts: { title?: boolean } = {}): string {
  const g = build(f); const pid = `hv-${f.id}`; const gid = `gl-${f.id}-${paint.id}`;
  const stroke = paint.pattern ? `url(#${pid})` : paint.rim;
  const defs = [
    `<linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".45" stop-color="#cfe9f2" stop-opacity=".16"/><stop offset="1" stop-color="#b7a8ff" stop-opacity=".3"/></linearGradient>`,
    paint.pattern ? `<pattern id="${pid}" width="26" height="26" patternUnits="userSpaceOnUse"><rect width="26" height="26" fill="#8a4a18"/>${HAVANNA.map(([x, y, rx, ry, dk]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${dk ? '#2b1206' : '#d9994a'}" opacity="${dk ? 0.72 : 0.5}"/>`).join('')}</pattern>` : '',
  ].join('');
  const body = g.layers.map((l) => {
    if (l.kind === 'glass') return `<path d="${l.d}" fill="url(#${gid})"/>`;
    if (l.kind === 'fill') return `<path d="${l.d}" fill="${stroke}"/>`;
    if (l.kind === 'shine') return `<path d="${l.d}" fill="none" stroke="${paint.rim2 ?? '#fff'}" stroke-opacity=".55" stroke-width="${r2(l.width!)}" stroke-linecap="round"/>`;
    if (l.kind === 'pad') return `<path d="${l.d}" fill="none" stroke="${paint.rim}" stroke-opacity=".7" stroke-width="${r2(l.width!)}" stroke-linecap="round"/>`;
    return `<path d="${l.d}" fill="none" stroke="${stroke}" stroke-width="${r2(l.width!)}" stroke-linejoin="round" stroke-linecap="round"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(-g.half)} ${r2(-g.h / 2)} ${r2(g.w)} ${r2(g.h)}" role="img" aria-label="${opts.title === false ? '' : `Fassung ${f.name}, ${f.form}, ${paint.name}`}"><defs>${defs}</defs>${body}</svg>`;
}

export const size = (f: Frame) => `${f.lens}□${f.bridge}–${f.temple}`;
