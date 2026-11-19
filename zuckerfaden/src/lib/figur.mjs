// Силуэты для калькулятора зон, viewBox 0 0 300 620. Тело и руки — плавные контуры (Catmull-Rom → кривые Безье)
// по опорным точкам; у женщины и мужчины свои пропорции. Зоны = пересечение формы тела с областью (clipPath).
const f1 = (n) => Math.round(n * 10) / 10;
const mx = ([x, y, c]) => [300 - x, y, c];

// Замкнутый плавный контур; точка с третьим элементом 1 — угол (касательные не тянутся через неё).
export function smooth(pts, k = 1) {
  const n = pts.length; let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  const P = (i) => pts[(i + n) % n];
  for (let i = 0; i < n; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const a = p1[2] ? p1 : p0, b = p2[2] ? p2 : p3;
    const c1 = [p1[0] + ((p2[0] - a[0]) / 6) * k, p1[1] + ((p2[1] - a[1]) / 6) * k];
    const c2 = [p2[0] - ((b[0] - p1[0]) / 6) * k, p2[1] - ((b[1] - p1[1]) / 6) * k];
    d += `C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return d + 'Z';
}
const ell = (cx, cy, rx, ry) => `M${f1(cx - rx)} ${f1(cy)}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
const rect = (x0, y0, x1, y1) => `M${x0} ${y0}H${x1}V${y1}H${x0}Z`;

const BODY = {
  damen: [
    [138, 92], [137, 112], [122, 120], [104, 127], [97, 141], [101, 160], [97, 180], [104, 205], [113, 232], [103, 258], [93, 290],
    [97, 332], [106, 380], [111, 400], [107, 440], [114, 500], [120, 548], [115, 566, 1], [134, 572, 1], [138, 556], [139, 500],
    [137, 446], [139, 402], [141, 352], [150, 320, 1],
  ],
  herren: [
    [135, 92], [133, 113], [114, 121], [92, 128], [86, 145], [95, 168], [96, 192], [100, 214], [106, 242], [106, 263], [103, 291],
    [104, 332], [110, 380], [112, 400], [108, 440], [114, 500], [120, 548], [114, 566, 1], [134, 573, 1], [138, 556], [139, 500],
    [138, 446], [139, 402], [141, 352], [150, 322, 1],
  ],
};
const ARM = {
  damen: [[107, 123], [96, 128], [88, 146], [80, 192], [73, 240], [65, 291], [59, 331], [54, 346], [52, 372], [58, 387, 1], [67, 378], [70, 346], [74, 331], [81, 291], [88, 243], [92, 197], [97, 163]],
  herren: [[101, 124], [88, 129], [78, 149], [72, 194], [66, 242], [59, 293], [54, 333], [49, 348], [47, 377], [54, 391, 1], [64, 382], [67, 349], [70, 333], [78, 293], [85, 246], [88, 200], [93, 168]],
};
function body(g) { const L = BODY[g]; const R = L.slice(0, -1).map(mx).reverse(); return smooth([...L, ...R]); }
function arms(g) { const a = ARM[g]; return smooth(a) + smooth(a.map(mx).reverse()); }
function head(g, seite) {
  const face = ell(150, 58, g === 'damen' ? 21.5 : 23, 28);
  let haar;
  if (g === 'damen') {
    haar = seite === 'vorne'
      ? smooth([[127, 62], [127, 40], [138, 30], [150, 28], [162, 30], [173, 40], [173, 62], [169, 52], [160, 43, 1], [150, 41], [140, 43, 1], [131, 52]]) + ell(150, 22, 11, 9)
      : smooth([[127, 62], [127, 38], [140, 29], [160, 29], [173, 38], [173, 62], [165, 80], [150, 84], [135, 80]]) + ell(150, 22, 12, 10);
  } else {
    haar = seite === 'vorne'
      ? smooth([[127, 56], [128, 39], [138, 31], [150, 29], [162, 31], [172, 39], [173, 56], [168, 46], [158, 41, 1], [142, 41, 1], [132, 46]])
      : smooth([[127, 58], [128, 38], [140, 30], [160, 30], [172, 38], [173, 58], [166, 74], [150, 78], [134, 74]]);
  }
  return { face, haar };
}
function linien(g, seite) {
  const l = [];
  if (seite === 'vorne') {
    l.push('M134 120q8 4 16 3M166 120q-8 4-16 3');
    l.push('M150 236v4');
    l.push(g === 'damen' ? 'M118 194q12 14 26 5M182 194q-12 14-26 5' : 'M114 186q18 12 34 4M186 186q-18 12-34 4');
  } else {
    l.push('M150 118V262');
    l.push(g === 'damen' ? 'M124 150q8 18 16 20M176 150q-8 18-16 20' : 'M118 148q10 22 22 24M182 148q-10 22-22 24');
    l.push('M150 300q-14 14-30 6M150 300q14 14 30 6');
  }
  return l.join('');
}
export const GESICHT_LINIEN = 'M136.5 55.5q4.5 3 9 0M154.5 55.5q4.5 3 9 0M150 53q-1 7-2 10q2 1.6 4 0M144 74q6 2.6 12 0M144 74q3-1.6 6-.4q3-1.2 6 .4';

export function figur(g, seite) {
  const pre = g === 'damen' ? 'd' : 'h';
  const H = head(g, seite);
  const zones = [];
  zones.push({ zone: `${pre}-arme`, part: 'arm', area: rect(0, 0, 300, 334), anchor: [g === 'damen' ? 78 : 72, 240], side: 'l' });
  zones.push({ zone: `${pre}-oberschenkel`, part: 'body', area: rect(0, 300, 300, 397), anchor: [104, 352], side: 'l', cover: `${pre}-beine` });
  zones.push({ zone: `${pre}-unterschenkel`, part: 'body', area: rect(0, 397, 300, 620), anchor: [196, 470], side: 'r', cover: `${pre}-beine` });
  if (seite === 'vorne') {
    if (g === 'herren') {
      zones.push({ zone: 'h-brust', part: 'body', area: rect(0, 118, 300, 214), anchor: [128, 170], side: 'l' });
      zones.push({ zone: 'h-bauch', part: 'body', area: rect(0, 218, 300, 282), anchor: [174, 250], side: 'r' });
    }
    zones.push({ zone: `${pre}-bikini`, part: 'body', area: 'M60 284H240V302L178 320L150 336L122 320L60 302Z', anchor: [176, 304], side: 'r' });
    if (g === 'damen') zones.push({ zone: 'd-hals', part: 'body', area: rect(128, 86, 172, 117), anchor: [162, 104], side: 'r', cover: 'd-gesicht' });
    const ax = g === 'damen' ? 99 : 93;
    zones.push({ zone: `${pre}-achseln`, part: 'free', area: `${ell(ax, 151, 4.2, 9.5)}${ell(300 - ax, 151, 4.2, 9.5)}`, anchor: [ax, 152], side: 'l', hit: [[ax, 154], [300 - ax, 154]] });
  } else if (g === 'herren') {
    zones.push({ zone: 'h-schultern', part: 'body', area: rect(0, 108, 300, 150), anchor: [116, 132], side: 'l' });
    zones.push({ zone: 'h-ruecken', part: 'body', area: rect(0, 154, 300, 262), anchor: [178, 206], side: 'r' });
    zones.push({ zone: 'h-gesaess', part: 'body', area: rect(0, 266, 300, 326), anchor: [182, 296], side: 'r' });
  }
  const seams = (seite === 'vorne'
    ? (g === 'herren' ? 'M0 216H300M0 284H300' : 'M0 284H300')
    : (g === 'herren' ? 'M0 152H300M0 264H300M0 328H300' : 'M0 328H300')) + 'M0 396H300M0 334H125M175 334H300';
  return { body: body(g), arms: arms(g), face: H.face, haar: H.haar, linien: linien(g, seite), seams, zones, kopf: g === 'damen' && seite === 'vorne' };
}

export const GESICHT = [
  { zone: 'd-brauen', area: 'M135 49.5q5-3.2 11-1.6l.3 2.2q-6-1-11 1.4ZM165 49.5q-5-3.2-11-1.6l-.3 2.2q6-1 11 1.4Z', hit: rect(132, 43, 168, 53), anchor: [140, 49], side: 'l' },
  { zone: 'd-nase', area: 'M147 52h6l2.4 13.5q-5.4 2.8-10.8 0ZM125.5 60a3.6 7 0 1 0 7.2 0a3.6 7 0 1 0-7.2 0ZM167.3 60a3.6 7 0 1 0 7.2 0a3.6 7 0 1 0-7.2 0Z', hit: 'M144 50h12v18h-12ZM121 49h13v22h-13ZM166 49h13v22h-13Z', anchor: [129, 64], side: 'l' },
  { zone: 'd-oberlippe', area: 'M141.5 67.6h17l-1 4.6h-15Z', hit: rect(139, 66, 161, 72.4), anchor: [158, 70], side: 'r' },
  { zone: 'd-kinn', area: 'M141 79.5h18q-2.6 6.6-9 6.8q-6.4-.2-9-6.8Z', hit: rect(139, 77.5, 161, 88), anchor: [156, 83], side: 'r' },
];
export const KOPF_VIEW = [102, 6, 96, 198];
