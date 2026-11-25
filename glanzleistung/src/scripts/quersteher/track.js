// Quersteher-Challenge: Strecke (Nachtparkplatz). Reine Geometrie, läuft im Browser und in Node.
// Einheiten: 1 Einheit ≈ 1 Pixel bei Zoom 1. Auto 22×44, Fahrbahn 170 breit.
export const W = 156;            // Fahrbahnbreite
export const WALL = 48;          // Gras-Streifen jenseits der Fahrbahn, danach unsichtbare Wand
export const DS = 10;            // Abstand der Stützpunkte (Mittellinie)

// Kontrollpunkte (y nach unten), im Uhrzeigersinn, Start bei (0,0) Richtung Osten.
const CP = [
  [160, 0], [520, 0], [900, -12], [1220, -95], [1540, 45], [1880, 8],   // 1) Startgerade mit Links-Rechts-Welle
  [2250, 15], [2560, 150], [2640, 420], [2480, 690],                    // 2) weite Rechtskurve (180°)
  [2150, 850], [1850, 810], [1600, 690],                                // 3) Gegengerade
  [1330, 800], [1060, 660], [800, 790],                                 //    Slalom (drei Tore)
  [600, 585], [480, 410], [360, 275], [210, 241],                       //    Anfahrt Haarnadel
  [40, 240], [-20, 224], [-64, 180], [-80, 120], [-64, 60], [-20, 16], [40, 0],   // 4) Haarnadel „Quersteher“ (rechts, eng)
];

// Closed Catmull-Rom (zentripetal wäre genauer; uniform reicht, Kurvenradius wird unten geprüft)
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return [0, 1].map((i) => 0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3));
}

export function buildTrack() {
  // 1) dicht abtasten
  const dense = [];
  const n = CP.length;
  for (let i = 0; i < n; i++) {
    const a = CP[(i + n - 1) % n], b = CP[i], c = CP[(i + 1) % n], d = CP[(i + 2) % n];
    for (let k = 0; k < 60; k++) dense.push(catmull(a, b, c, d, k / 60));
  }
  // 1b) Krümmungsspitzen glätten (leichtes Tiefpass-Filtern der Linie)
  for (let it = 0; it < 120; it++) {
    const prev = dense.map((q) => q.slice());
    for (let i = 0; i < dense.length; i++) {
      const a = prev[(i + dense.length - 1) % dense.length], b = prev[i], c = prev[(i + 1) % dense.length];
      dense[i] = [0.25 * a[0] + 0.5 * b[0] + 0.25 * c[0], 0.25 * a[1] + 0.5 * b[1] + 0.25 * c[1]];
    }
  }
  // 2) gleichmäßig nach Bogenlänge neu verteilen
  const segLen = [];
  let total = 0;
  for (let i = 0; i < dense.length; i++) {
    const a = dense[i], b = dense[(i + 1) % dense.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segLen.push(l); total += l;
  }
  const N = Math.round(total / DS);
  const ds = total / N;
  const pts = [];
  let di = 0, acc = 0;
  for (let j = 0; j < N; j++) {
    const target = j * ds;
    while (acc + segLen[di] < target) { acc += segLen[di]; di = (di + 1) % dense.length; }
    const f = (target - acc) / segLen[di];
    const a = dense[di], b = dense[(di + 1) % dense.length];
    pts.push({ x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f });
  }
  // 3) Richtung, Normale (rechts der Fahrtrichtung bei y-nach-unten), Krümmung
  for (let i = 0; i < N; i++) {
    const p = pts[(i + N - 1) % N], q = pts[(i + 1) % N];
    const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy);
    pts[i].hx = dx / l; pts[i].hy = dy / l;
    pts[i].th = Math.atan2(dy, dx);
    pts[i].nx = -pts[i].hy; pts[i].ny = pts[i].hx;   // links der Fahrtrichtung (bei y unten)
    pts[i].s = i * ds;
  }
  for (let i = 0; i < N; i++) {
    const a = pts[(i + N - 2) % N].th, b = pts[(i + 2) % N].th;
    let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    pts[i].k = d / (4 * ds);        // + = Rechtskurve (Uhrzeigersinn auf dem Bildschirm)
  }
  return { pts, N, ds, len: N * ds, W };
}

// Randpunkt: side = +1 links der Fahrtrichtung, −1 rechts
export function edge(tr, i, side, off = tr.W / 2) {
  const p = tr.pts[((i % tr.N) + tr.N) % tr.N];
  return [p.x + p.nx * side * off, p.y + p.ny * side * off];
}

// Hütchen entlang beider Ränder (nur Daten; Zustand „umgefahren“ hält die Simulation)
export function makeCones(tr, spacing = 80) {
  const cones = [];
  const step = Math.round(spacing / tr.ds);
  for (let i = 0; i < tr.N; i += step) {
    for (const side of [1, -1]) {
      const [x, y] = edge(tr, i + (side > 0 ? 0 : Math.round(step / 2)), side, tr.W / 2 + 2);
      cones.push({ x, y, hit: false, vx: 0, vy: 0, rot: 0, t: 0, ox: x, oy: y, col: ((i / step) | 0) % 2 });
    }
  }
  return cones;
}

// Nächster Stützpunkt im Fenster um `hint` (Index), liefert Index + Querabstand (+ = links)
export function project(tr, x, y, hint, win = 40) {
  let best = hint, bd = Infinity;
  for (let o = -win; o <= win; o++) {
    const i = (((hint + o) % tr.N) + tr.N) % tr.N;
    const p = tr.pts[i];
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  const p = tr.pts[best];
  const lat = (x - p.x) * p.nx + (y - p.y) * p.ny;
  return { i: best, lat, d: Math.sqrt(bd) };
}

// Prüfung: Eigenüberschneidung / Mindestabstand zwischen entfernten Streckenteilen, min. Radius
export function check(tr) {
  let minR = Infinity, minI = 0;
  for (let i = 0; i < tr.N; i++) { const r = 1 / Math.max(1e-9, Math.abs(tr.pts[i].k)); if (r < minR) { minR = r; minI = i; } }
  let minGap = Infinity, gi = 0, gj = 0;
  for (let i = 0; i < tr.N; i += 2) for (let j = i + 1; j < tr.N; j += 2) {
    const sep = Math.min(j - i, tr.N - (j - i)) * tr.ds;
    if (sep < 700) continue;
    const d = Math.hypot(tr.pts[i].x - tr.pts[j].x, tr.pts[i].y - tr.pts[j].y);
    if (d < minGap) { minGap = d; gi = i; gj = j; }
  }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of tr.pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  return { len: tr.len, minR, minI, minGap, gi, gj, bbox: [x0, y0, x1, y1] };
}
