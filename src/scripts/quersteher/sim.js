// Quersteher-Challenge: Fahrphysik (Draufsicht, Schritt fest 1/120 s). Läuft identisch in Browser und Node,
// damit das aufgezeichnete Geister-Auto zu dem passt, was der Browser rechnet.
import { project, W, WALL } from './track.js';

export const DT = 1 / 120;
export const P = {
  vmax: 300,        // Höchstgeschwindigkeit (Einheiten/s)
  accel: 230,       // Gas (automatisch), nimmt zu vmax hin ab
  brake: 560,       // Bremsen (beide Daumen)
  revMax: 120, revAcc: 260,
  steerRate: 8,     // wie schnell der Lenkeinschlag folgt (1/s)
  steerMax: 0.52,   // rad
  wheelbase: 40,
  yawMax: 3.4,      // rad/s
  ay: 330,          // seitliche Haftgrenze (Einheiten/s²), darüber untersteuert/driftet das Auto
  over: 1.5,        // wie weit die Gierrate über die Haftgrenze hinaus drehen darf (Drift)
  grip: 7.0,        // Querhaftung (1/s): hoch = klebt, niedrig = driftet
  drag: 0.05,       // Luftwiderstand ~ v
  grass: 2.6,       // Zusatzbremsung abseits der Fahrbahn (1/s)
  grassMax: 150,
  coneHit: 0.82,    // Tempofaktor beim Hütchen-Treffer
  coneR: 7, carR: 13,
};

export function makeCar(tr, cones) {
  const p = tr.pts[0];
  return {
    x: p.x, y: p.y, th: p.th, vx: 0, vy: 0, steer: 0,
    idx: 0, lat: 0, prog: 0,          // prog: aufgerollte Strecke (Einheiten)
    cp: 0, t: 0, brakeT: 0, still: 0, stuck: 0,
    penalty: 0, finished: false, finishT: 0, hits: 0, off: false, wall: false, reverse: false,
    speed: 0, fwd: 0, slip: 0, lastCp: { x: p.x, y: p.y, th: p.th, idx: 0, prog: 0 },
    cones,
  };
}

// input: { l, r } (Daumen links/rechts gedrückt)
export function step(car, tr, inp, dt = DT) {
  if (car.finished) return;
  const hx = Math.cos(car.th), hy = Math.sin(car.th);
  let vf = car.vx * hx + car.vy * hy;                 // Längsgeschwindigkeit
  let vl = -car.vx * hy + car.vy * hx;                // Quergeschwindigkeit
  const both = inp.l && inp.r;
  const s = both ? 0 : (inp.r ? 1 : inp.l ? -1 : 0);  // rechts = im Uhrzeigersinn

  // Bremsen / Rückwärts
  car.reverse = false;
  if (both) {
    car.brakeT += dt;
    if (vf > 4) vf = Math.max(0, vf - P.brake * dt);
    else if (car.brakeT > 0.25 + 0.0) { car.reverse = true; vf = Math.max(-P.revMax, vf - P.revAcc * dt); }
    else vf = Math.max(0, vf - P.brake * dt);
  } else {
    car.brakeT = 0;
    if (vf < 0) vf = Math.min(0, vf + P.brake * dt);                 // Rückwärts ausrollen, dann vorwärts
    else vf += P.accel * Math.max(0, 1 - vf / P.vmax) * dt;
  }
  vf -= vf * P.drag * dt;

  // Lenkung (weicher Einschlag), Gierrate ~ v·tan(δ)/L, begrenzt
  car.steer += (s - car.steer) * Math.min(1, P.steerRate * dt);
  const dlt = car.steer * P.steerMax;
  let yaw = (vf * Math.tan(dlt)) / P.wheelbase;
  const cap = P.ay / Math.max(Math.abs(vf), 40);
  const lim = Math.min(P.yawMax, cap * P.over);
  yaw = Math.max(-lim, Math.min(lim, yaw));
  car.th += yaw * dt;

  // Querhaftung: Quergeschwindigkeit baut sich ab (kostet Tempo – wer rutscht, wird langsamer)
  const slipK = P.grip * (1 + 0.0);
  vl *= Math.exp(-slipK * dt);
  car.slip = vl;

  // zurück in Weltkoordinaten (mit neuer Richtung)
  const c = Math.cos(car.th), sn = Math.sin(car.th);
  car.vx = vf * c - vl * sn; car.vy = vf * sn + vl * c;

  // Position
  car.x += car.vx * dt; car.y += car.vy * dt;

  // Strecke: Fortschritt, Querabstand
  const pr = project(tr, car.x, car.y, car.idx);
  let di = pr.i - car.idx; if (di > tr.N / 2) di -= tr.N; if (di < -tr.N / 2) di += tr.N;
  car.prog += di * tr.ds; car.idx = pr.i; car.lat = pr.lat;
  const a = Math.abs(pr.lat);
  car.off = a > W / 2;
  car.wall = false;
  if (car.off) {                                    // Gras: bremst und begrenzt
    const sp = Math.hypot(car.vx, car.vy);
    const k = Math.exp(-P.grass * dt);
    car.vx *= k; car.vy *= k;
    if (sp > P.grassMax) { const f = P.grassMax / sp; car.vx *= f; car.vy *= f; }
  }
  if (a > W / 2 + WALL) {                           // unsichtbare Wand: zurückschieben, Tempo dämpfen
    const p = tr.pts[pr.i];
    const sgn = Math.sign(pr.lat);
    const lim = W / 2 + WALL;
    const along = (car.x - p.x) * p.hx + (car.y - p.y) * p.hy;
    car.x = p.x + p.nx * sgn * lim + p.hx * along;
    car.y = p.y + p.ny * sgn * lim + p.hy * along;
    // Geschwindigkeit in Wandnormale entfernen, Rest dämpfen
    const vn = car.vx * p.nx + car.vy * p.ny;
    if (vn * sgn > 0) { car.vx -= vn * p.nx; car.vy -= vn * p.ny; }
    car.vx *= 0.7; car.vy *= 0.7; car.wall = true;
  }

  // Hütchen
  const cones = car.cones;
  const rr = P.coneR + P.carR;
  for (let i = 0; i < cones.length; i++) {
    const cn = cones[i];
    if (cn.hit) { cn.t += dt; cn.ox += cn.vx * dt; cn.oy += cn.vy * dt; cn.vx *= 0.97; cn.vy *= 0.97; cn.rot += cn.vx * 0.01; continue; }
    const dx = cn.x - car.x, dy = cn.y - car.y;
    if (dx * dx + dy * dy < rr * rr) {
      cn.hit = true; cn.t = 0; cn.vx = car.vx * 0.9 + dx * 2; cn.vy = car.vy * 0.9 + dy * 2;
      car.vx *= P.coneHit; car.vy *= P.coneHit; car.hits++; car.lastHit = car.t;
    }
  }

  // Kontrollpunkte (16 Tore) und Ziel
  const N = 16, seg = tr.len / N;
  const nextProg = (car.cp + 1) * seg;
  if (car.prog >= nextProg && car.cp < N - 1) {
    car.cp++;
    const q = tr.pts[car.idx];
    car.lastCp = { x: q.x, y: q.y, th: q.th, idx: car.idx, prog: car.prog };
  }
  if (car.prog >= tr.len && car.cp >= N - 1) {
    car.finished = true; car.finishT = car.t + car.penalty;
  }

  car.speed = Math.hypot(car.vx, car.vy);
  car.fwd = vf;
  // Festgefahren? Nach 4 s Stillstand (außer Rückwärtsfahrt) zurück zum letzten Tor, +3 s
  if (car.speed < 8 && !car.reverse) car.still += dt; else car.still = 0;
  if (car.still > 4) { respawn(car); }
  car.t += dt;
}

export function respawn(car) {
  const q = car.lastCp;
  car.x = q.x; car.y = q.y; car.th = q.th; car.vx = 0; car.vy = 0; car.steer = 0; car.still = 0;
  car.idx = q.idx; car.prog = q.prog; car.penalty += 3; car.respawned = (car.respawned || 0) + 1; car.brakeT = 0;
}
