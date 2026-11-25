// Bots für die Kalibrierung: Ideal-Fahrer (erzeugt das Geister-Auto) und „Daumen-Fahrer“ (menschenähnlich).
import { W, project } from '../../src/scripts/quersteher/track.js';
import { P } from '../../src/scripts/quersteher/sim.js';

// Rennlinie: elastisches Band, minimiert Krümmung innerhalb der Fahrbahn
export function racingLine(tr, margin = 28) {
  const N = tr.N, lim = W / 2 - margin;
  const d = new Float64Array(N);
  const pos = (i, off) => { const p = tr.pts[i]; return [p.x + p.nx * off, p.y + p.ny * off]; };
  for (let it = 0; it < 4000; it++) {
    for (let i = 0; i < N; i++) {
      const a = pos((i + N - 1) % N, d[(i + N - 1) % N]), b = pos((i + 1) % N, d[(i + 1) % N]);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const p = tr.pts[i];
      const target = (mx - p.x) * p.nx + (my - p.y) * p.ny;      // Normalanteil des Mittelpunkts
      d[i] += (target - d[i]) * 0.35;
      if (d[i] > lim) d[i] = lim; if (d[i] < -lim) d[i] = -lim;
    }
  }
  const line = [];
  for (let i = 0; i < N; i++) { const [x, y] = pos(i, d[i]); line.push({ x, y }); }
  // Krümmung der Rennlinie + Tempoprofil
  const v = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const a = line[(i + N - 1) % N], b = line[i], c = line[(i + 1) % N];
    const ab = Math.atan2(b.y - a.y, b.x - a.x), bc = Math.atan2(c.y - b.y, c.x - b.x);
    let dd = bc - ab; while (dd > Math.PI) dd -= 2 * Math.PI; while (dd < -Math.PI) dd += 2 * Math.PI;
    const k = Math.abs(dd) / tr.ds;
    line[i].k = dd / tr.ds;
    v[i] = Math.min(P.vmax, Math.sqrt(AY / Math.max(k, 1e-6)));
  }
  // Bremsrampe rückwärts (zweimal herum für den Wrap)
  for (let r = 0; r < 2; r++) for (let i = N - 1; i >= 0; i--) {
    const nx = v[(i + 1) % N];
    const lim2 = Math.sqrt(nx * nx + 2 * BR * tr.ds);
    if (v[i] > lim2) v[i] = lim2;
  }
  return { line, v };
}
const AY = 300;          // seitliche Beschleunigung, die das Auto hält (Einheiten/s²), in Kalibrierung angepasst
const BR = P.brake * 0.8;

export function setLimits(ay, br) { /* für die Kalibrierung */ }

// Bot: wählt pro Schritt (l, r)
export function makeBot(tr, rl, opt = {}) {
  const o = { delay: 0, dead: 0.04, look0: 36, lookK: 0.30, brakeMargin: 8, brakeLook: 0.5, noise: 0, period: 0, missBrake: 0, rng: Math.random, ...opt };
  let hold = { l: false, r: false }, nextAt = 0;
  const queue = [];
  let idx = 0;
  return function bot(car) {
    const N = tr.N;
    const pr = project(tr, car.x, car.y, car.idx);
    idx = pr.i;
    const sp = Math.max(40, car.speed);
    const ahead = Math.round((o.look0 + o.lookK * sp) / tr.ds);
    const tgt = rl.line[(idx + ahead) % N];
    const desired = Math.atan2(tgt.y - car.y, tgt.x - car.x);
    let err = desired - car.th; while (err > Math.PI) err -= 2 * Math.PI; while (err < -Math.PI) err += 2 * Math.PI;
    // Vorausschauendes Bremsen: Zieltempo an einem Punkt vor uns
    const bi = (idx + Math.round((o.brakeLook * sp * 0.6 + 20) / tr.ds)) % N;
    let vt = Infinity;
    const span = Math.round((sp * o.brakeLook + 40) / tr.ds);
    for (let k = 0; k <= span; k += 2) vt = Math.min(vt, rl.v[(idx + k) % N]);
    const wantBrake = car.speed > vt + o.brakeMargin;
    // Daumen-Takt: Entscheidung nur alle `period` Sekunden, mit Rauschen
    if (o.period && car.t < nextAt) return hold;
    if (o.period) nextAt = car.t + o.period * (0.7 + 0.6 * o.rng());
    err += (o.rng() + o.rng() + o.rng() - 1.5) * o.noise;
    let l = false, r = false;
    if (wantBrake) { l = true; r = true; if (o.rng() < o.missBrake) { l = false; r = false; } }
    else if (err > o.dead) r = true;
    else if (err < -o.dead) l = true;
    if (car.fwd < -1 || car.still > 0.6) {    // steckt fest: vorwärts auf die Strecke zurück
      l = false; r = false;
    }
    hold = { l, r };
    return hold;
  };
}
