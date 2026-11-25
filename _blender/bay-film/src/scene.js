// scene.js — фильм «Bay». Часть 1: акты «Чертёж» (0–4 с) и «Въезд» (4–8 с).
// Кадр — чистая функция времени t. Ни Math.random, ни Date.now.
(function (g) {
  const { clamp, lerp, smooth, ease, prog, mulberry32, M, Path } = Lib;

  const W = 1080, H = 1920;
  const FPS = 30, BPM = 120, BEAT = 60 / BPM;           // доля 0,5 с
  const DURATION = 8.0;                                  // часть 1 (весь фильм позже = 12 с)
  const PAL = { paper: '#ECE8DF', ink: '#17181C', graphite: '#6B6A68', thread: '#FF2E6E' };

  // ---------- мир ----------
  const GY = 1150;           // земля / пол гаража
  const S = 190;             // px на метр (машина)
  const XG = 1000;           // левая стена гаража
  const CAR_X0 = 60, CAR_X1 = 1150;        // задний бампер: старт и парковка
  const T_DRIVE0 = 4.0, T_DRIVE1 = 7.6;    // начало и конец въезда
  const AXR = 0.95, AXF = 3.71, WR = 0.33; // оси и радиус колеса (м)
  const HEADLIGHT = [4.52, 0.70];          // точка фары (м)

  const smoother = (x) => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };

  // ---------- камера ----------
  function camAt(t) {
    const u = smoother((t - T_DRIVE0) / (T_DRIVE1 - T_DRIVE0));
    const drift = prog(t, 0, 4, ease.inOutSine) * 30;
    let s = lerp(0.48, 0.96, u);
    // «удар» камеры на сильной доле старта
    if (t >= T_DRIVE0) s *= 1 + 0.010 * Math.exp(-(t - T_DRIVE0) * 9);
    const cx = lerp(1135, 1555, u) + drift * (1 - u);
    const yg = lerp(1190, 1150, u);
    const cy = GY - (yg - 960) / s;
    return { s, cx, cy };
  }
  const layerM = (cam, p) => [cam.s, 0, 0, cam.s, W / 2 - cam.cx * p * cam.s, H / 2 - cam.cy * cam.s];

  // ---------- машина ----------
  function carX(t) { return lerp(CAR_X0, CAR_X1, smoother((t - T_DRIVE0) / (T_DRIVE1 - T_DRIVE0))); }
  function carState(t) {
    const h = 0.02;
    const a = (carX(t + h) - 2 * carX(t) + carX(t - h)) / (h * h);   // px/с²
    let pitch = 0.030 * clamp(a / 486, -1.2, 1.2);                   // + = нос вверх
    if (t > T_DRIVE1) { const d = t - T_DRIVE1; pitch += -0.020 * Math.sin(2 * Math.PI * 2.4 * d) * Math.exp(-4.5 * d); }
    const x = carX(t);
    return { x, pitch, wheel: (x - CAR_X0) / (WR * S) };
  }
  // матрица «метры (y вверх, начало = задний бампер на земле)» → экран
  function carMat(t, cam, cs, withPitch) {
    const base = M.mul(layerM(cam, 1), M.mul(M.translate(cs.x, GY), M.scale(S, -S)));
    if (!withPitch) return base;
    const px = (AXR + AXF) / 2, py = WR;
    const rot = M.mul(M.translate(px, py), M.mul(M.rotate(cs.pitch), M.translate(-px, -py)));
    return M.mul(base, rot);
  }
  function wheelMat(t, cam, cs, axle) {
    return M.mul(layerM(cam, 1), M.mul(M.translate(cs.x + axle * S, GY - WR * S), M.scale(S, -S)));
  }

  // геометрия машины (метры, y вверх)
  const ARCH_R = 0.41, SILL = 0.22, ARCH_DX = Math.sqrt(ARCH_R * ARCH_R - (WR - SILL) * (WR - SILL));
  const archA0 = Math.atan2(SILL - WR, ARCH_DX), archA1 = Math.PI - archA0;     // −15,6° … 195,6°
  const car = {};
  car.body = new Path().M(0.02, 0.40).L(0.00, 0.58).L(0.03, 0.82).L(0.12, 0.95)
    .C(0.40, 1.00, 0.85, 1.02, 1.25, 1.02)
    .C(1.60, 1.04, 1.80, 1.28, 2.12, 1.36)
    .C(2.45, 1.40, 2.75, 1.39, 2.98, 1.36)
    .C(3.22, 1.30, 3.42, 1.08, 3.64, 0.99)
    .C(3.97, 0.95, 4.30, 0.90, 4.52, 0.80)
    .C(4.60, 0.74, 4.62, 0.62, 4.60, 0.50)
    .L(4.58, 0.32).L(4.50, 0.25).L(4.45, 0.24)
    .L(AXF + ARCH_DX, SILL).arc(AXF, WR, ARCH_R, archA0, archA1)
    .L(AXR + ARCH_DX, SILL).arc(AXR, WR, ARCH_R, archA0, archA1)
    .L(0.18, 0.24).L(0.02, 0.40).close();
  car.glass = new Path().M(1.38, 1.03).C(1.62, 1.05, 1.85, 1.26, 2.12, 1.325)
    .C(2.45, 1.36, 2.75, 1.355, 2.95, 1.325).C(3.15, 1.27, 3.32, 1.10, 3.48, 1.03).close();
  car.lines = new Path()
    .M(2.32, 1.03).L(2.32, 1.35)                                   // стойка B
    .M(3.12, 1.02).L(3.10, 0.30).M(1.50, 1.03).L(1.55, 0.30)        // стыки двери
    .M(2.55, 0.90).L(2.80, 0.89)                                    // ручка
    .M(0.25, 0.88).C(1.5, 0.84, 3.0, 0.86, 4.3, 0.80)               // линия плеча
    .M(1.45, 0.30).L(3.20, 0.30);                                   // порог
  car.mirror = new Path().M(3.22, 1.03).L(3.40, 1.04).L(3.42, 0.98).L(3.26, 0.96).close();
  car.head = new Path().M(4.22, 0.84).L(4.50, 0.76).L(4.57, 0.66).L(4.52, 0.64).L(4.24, 0.72).close();
  car.tail = new Path().M(0.03, 0.70).L(0.10, 0.90).L(0.34, 0.93).L(0.30, 0.74).close();
  car.intake = new Path().M(4.30, 0.30).L(4.57, 0.30).L(4.57, 0.42).L(4.32, 0.44).close();
  car.exhaust = new Path().circle(0.13, 0.30, 0.035);
  car.hatch = (() => {                                             // штриховка под линией плеча
    const p = new Path();
    for (let x0 = -0.6; x0 < 4.7; x0 += 0.075) p.M(x0, 0.20).L(x0 + 0.62, 0.95);
    return p;
  })();
  const wheelTire = new Path().circle(0, 0, WR).circle(0, 0, 0.285);
  const wheelRim = new Path().circle(0, 0, 0.205).circle(0, 0, 0.055);
  const wheelFill = new Path().circle(0, 0, WR);

  // ---------- задания: что и когда рисует перо ----------
  const jobs = [];
  const add = (j) => { jobs.push(j); return j; };
  const rng = mulberry32(20261007);

  // 0. дорога (ритм: такт 1, доли 1–2)
  add({ layer: 'near', path: new Path().M(1140, GY).L(2400, GY), t0: 0, d: 0.5, ease: ease.outExpo, w: 3, color: PAL.ink });
  add({ layer: 'near', path: new Path().M(1140, GY).L(-300, GY), t0: 0, d: 0.5, ease: ease.outExpo, w: 3, color: PAL.ink });
  add({ layer: 'near', path: new Path().M(1140, GY + 34).L(2400, GY + 34).M(1140, GY + 34).L(-300, GY + 34), t0: 0.25, d: 0.4, ease: ease.outExpo, w: 1.6, color: PAL.graphite });
  {
    const dash = new Path();
    for (let x = -300; x < 2400; x += 240) dash.M(x, GY + 310).L(x + 140, GY + 310);
    add({ layer: 'near', path: dash, t0: 0.35, d: 0.5, ease: ease.outCubic, w: 2.4, color: PAL.graphite, alpha: 0.6 });
    add({ layer: 'near', path: new Path().M(-300, GY + 640).L(2400, GY + 640), t0: 0.45, d: 0.5, ease: ease.outExpo, w: 1.6, color: PAL.graphite, alpha: 0.45 });
  }

  // 1. дальний план (такт 1, доли 2–3.5): башни волнами по 8-м
  {
    let x = -820, i = 0;
    while (x < 1620) {
      const w = 110 + rng() * 100, h = 650 + rng() * 1300, kind = Math.floor(rng() * 4), gap = 8 + rng() * 30;
      const p = new Path();
      let fillP = new Path();
      const top = GY - h;
      if (kind === 1) { // ступенчатая
        const inset = w * 0.22, h2 = 140 + rng() * 220;
        p.M(x, GY).L(x, top).L(x + inset, top).L(x + inset, top - h2).L(x + w - inset, top - h2).L(x + w - inset, top).L(x + w, top).L(x + w, GY);
        fillP.M(x, GY).L(x, top).L(x + inset, top).L(x + inset, top - h2).L(x + w - inset, top - h2).L(x + w - inset, top).L(x + w, top).L(x + w, GY).close();
      } else if (kind === 3) { // скос
        const k = w * 0.35;
        p.M(x, GY).L(x, top).L(x + w, top - k).L(x + w, GY);
        fillP.M(x, GY).L(x, top).L(x + w, top - k).L(x + w, GY).close();
      } else {
        p.M(x, GY).L(x, top).L(x + w, top).L(x + w, GY);
        fillP.M(x, GY).L(x, top).L(x + w, top).L(x + w, GY).close();
        if (kind === 2) p.M(x + w / 2, top).L(x + w / 2, top - 120 - rng() * 160);
      }
      const wave = i % 3, t0 = 0.5 + wave * 0.25 + (i % 5) * 0.012;
      add({ layer: 'far', path: p, t0, d: 0.42, ease: ease.outCubic, w: 2.2, color: PAL.ink, alpha: 0.78, fill: PAL.paper, fillPath: fillP, rise: h + 400 });
      const hatch = new Path();
      for (let hx = x + w * 0.72; hx < x + w - 4; hx += 9) hatch.M(hx, GY).L(hx, top + 8);
      add({ layer: 'far', path: hatch, t0: t0 + 0.2, d: 0.35, ease: ease.outCubic, w: 1, color: PAL.graphite, alpha: 0.32 });
      x += w + gap; i++;
    }
  }

  // 2. средний план (доли 3.5–4.5): блоки с окнами
  {
    let x = -420, i = 0;
    while (x < 1920) {
      const w = 150 + rng() * 120, h = 380 + rng() * 520, gap = rng() * 18;
      const top = GY - h;
      const p = new Path().M(x, GY).L(x, top).L(x + w, top).L(x + w, GY);
      const fillP = new Path().rect(x, top, w, h);
      const t0 = 1.25 + (i % 3) * 0.25 + (i % 4) * 0.01;
      add({ layer: 'mid', path: p, t0, d: 0.4, ease: ease.outCubic, w: 2.4, color: PAL.ink, fill: PAL.paper, fillPath: fillP, rise: h + 20 });
      const rows = new Path();
      for (let y = GY - 70; y > top + 36; y -= 54) rows.M(x + 20, y).L(x + w - 20, y);
      add({ layer: 'mid', path: rows, t0: t0 + 0.12, d: 0.4, ease: ease.outCubic, w: 11, color: PAL.graphite, alpha: 0.5, dash: [13, 21], cap: 'butt' });
      x += w + gap; i++;
    }
  }

  // 3. ближний план: фонари (доли 4–5)
  for (const [k, lx] of [[0, 300], [1, 720]]) {
    const pole = new Path().M(lx, GY).L(lx, GY - 560).L(lx + 78, GY - 592).L(lx + 78, GY - 570);
    add({ layer: 'near', path: pole, t0: 1.75 + k * 0.25, d: 0.4, ease: ease.outExpo, w: 3, color: PAL.ink });
    const rings = new Path().circle(lx + 78, GY - 560, 28).circle(lx + 78, GY - 560, 54).circle(lx + 78, GY - 560, 86);
    add({ layer: 'near', path: rings, t0: 1.95 + k * 0.25, d: 0.45, ease: ease.outCubic, w: 1.4, color: PAL.graphite, alpha: 0.5, dash: [5, 7] });
  }

  // 4. гараж (такт 2, первая половина): корпус → задняя стена → предметы
  {
    const G = {};
    const roof = new Path().rect(XG, 640, 1180, 50);
    const lintel = new Path().rect(XG, 690, 90, 110);
    const wallR = new Path().rect(2090, 690, 90, GY - 690);
    const floor = new Path().rect(XG, GY, 1180, 36);
    const shell = new Path()
      .rect(XG, 640, 1180, 50).rect(XG, 690, 90, 110).rect(2090, 690, 90, GY - 690).rect(XG, GY, 1180, 36);
    add({ layer: 'near', path: shell, t0: 2.0, d: 0.5, ease: ease.outCubic, w: 3, color: PAL.ink, fill: PAL.paper, fillPath: new Path().rect(XG, 640, 1180, GY - 640), rise: GY - 640 });
    // штриховка стен/перекрытий (диагональ)
    const hatchPaths = new Path();
    for (let hx = XG - 60; hx < 2200; hx += 14) {
      hatchPaths.M(hx, 690).L(hx + 50, 640);
      hatchPaths.M(hx, GY + 36).L(hx + 36, GY);
    }
    add({ layer: 'near', path: hatchPaths, t0: 2.25, d: 0.35, ease: ease.outCubic, w: 1, color: PAL.graphite, alpha: 0.35, clip: new Path().rect(XG, 640, 1180, 50) });
    // (штриховка пола – отдельным заданием с клипом)
    const floorHatch = new Path();
    for (let hx = XG - 40; hx < 2200; hx += 14) floorHatch.M(hx, GY + 36).L(hx + 36, GY);
    add({ layer: 'near', path: floorHatch, t0: 2.25, d: 0.35, ease: ease.outCubic, w: 1, color: PAL.graphite, alpha: 0.35, clip: new Path().rect(XG, GY, 1180, 36) });
    const wallHatch = new Path();
    for (let hy = 690; hy < GY + 60; hy += 14) { wallHatch.M(2090, hy + 90).L(2180, hy); wallHatch.M(XG, hy + 110).L(XG + 90, hy); }
    add({ layer: 'near', path: wallHatch, t0: 2.3, d: 0.35, ease: ease.outCubic, w: 1, color: PAL.graphite, alpha: 0.3, clip: new Path().rect(2090, 690, 90, GY - 690).rect(XG, 690, 90, 110) });
    // рольставня: короб и барабан (ставни ещё свёрнуты)
    add({ layer: 'near', path: new Path().rect(XG, 800, 90, 34).circle(XG + 45, 817, 12), t0: 2.4, d: 0.3, ease: ease.outCubic, w: 2.2, color: PAL.ink, fill: PAL.paper });
    // задняя стена
    const back = new Path().rect(1090, 690, 1000, GY - 690);
    const seams = new Path();
    for (let k = 1; k < 8; k++) seams.M(1090 + k * 125, 690).L(1090 + k * 125, GY);
    seams.M(1090, GY - 120).L(2090, GY - 120);
    add({ layer: 'near', path: back, t0: 2.45, d: 0.35, ease: ease.outExpo, w: 1.8, color: PAL.ink });
    add({ layer: 'near', path: seams, t0: 2.55, d: 0.45, ease: ease.outCubic, w: 1.2, color: PAL.graphite, alpha: 0.5 });
    // светодиодные планки (пока пустые контуры)
    const leds = new Path();
    for (const [x0, x1] of [[1170, 1580], [1640, 2050]]) {
      leds.M(x0 + 7, 700).L(x1 - 7, 700).L(x1, 707).L(x1 - 7, 714).L(x0 + 7, 714).L(x0, 707).close();
    }
    add({ layer: 'near', path: leds, t0: 2.7, d: 0.3, ease: ease.outCubic, w: 2, color: PAL.ink });
    // стенд: перфопанель, рамки, полка
    const board = new Path().rect(1180, 745, 230, 115);
    const dots = new Path();
    for (let yy = 765; yy < 850; yy += 22) for (let xx = 1200; xx < 1400; xx += 22) dots.circle(xx, yy, 2);
    add({ layer: 'near', path: board, t0: 2.75, d: 0.25, ease: ease.outCubic, w: 2, color: PAL.ink });
    add({ layer: 'near', path: dots, t0: 2.85, d: 0.25, ease: ease.outCubic, w: 1.4, color: PAL.graphite, alpha: 0.7 });
    add({ layer: 'near', path: new Path().rect(1480, 750, 80, 92).rect(1590, 765, 56, 64), t0: 2.8, d: 0.25, ease: ease.outCubic, w: 2, color: PAL.ink });
    add({ layer: 'near', path: new Path().M(1740, 806).L(2060, 806).rect(1770, 764, 52, 42).rect(1836, 750, 66, 56).circle(1965, 784, 22), t0: 2.9, d: 0.3, ease: ease.outCubic, w: 2, color: PAL.ink });
  }

  // 5. машина (такт 2, вторая половина): контур → стекло → детали → колёса
  const CAR_T = 3.0;
  const carBodyJob = add({ layer: 'car', path: car.body, t0: CAR_T, d: 0.6, ease: ease.inOutCubic, w: 3.2, color: PAL.ink, fill: PAL.paper, fillPath: car.body });
  add({ layer: 'car', path: car.glass, t0: CAR_T + 0.45, d: 0.35, ease: ease.outCubic, w: 2.2, color: PAL.ink, fill: PAL.graphite, fillAlpha: 0.12 });
  add({ layer: 'car', path: car.lines, t0: CAR_T + 0.5, d: 0.4, ease: ease.outCubic, w: 1.6, color: PAL.ink, alpha: 0.85 });
  add({ layer: 'car', path: car.mirror, t0: CAR_T + 0.65, d: 0.2, ease: ease.outCubic, w: 1.8, color: PAL.ink });
  add({ layer: 'car', path: car.head, t0: CAR_T + 0.7, d: 0.2, ease: ease.outCubic, w: 2, color: PAL.ink });
  add({ layer: 'car', path: car.tail, t0: CAR_T + 0.72, d: 0.2, ease: ease.outCubic, w: 2, color: PAL.ink });
  add({ layer: 'car', path: car.intake, t0: CAR_T + 0.74, d: 0.2, ease: ease.outCubic, w: 1.6, color: PAL.ink });
  add({ layer: 'car', path: car.exhaust, t0: CAR_T + 0.78, d: 0.15, ease: ease.outCubic, w: 1.6, color: PAL.ink });
  add({ layer: 'car', path: car.hatch, t0: CAR_T + 0.8, d: 0.35, ease: ease.outCubic, w: 1, color: PAL.graphite, alpha: 0.26, clip: car.body });
  const wheelJobs = [
    add({ layer: 'wR', path: wheelTire, t0: CAR_T + 0.6, d: 0.3, ease: ease.outCubic, w: 3, color: PAL.ink, fill: PAL.paper, fillPath: wheelFill }),
    add({ layer: 'wF', path: wheelTire, t0: CAR_T + 0.66, d: 0.3, ease: ease.outCubic, w: 3, color: PAL.ink, fill: PAL.paper, fillPath: wheelFill }),
    add({ layer: 'wR', path: wheelRim, t0: CAR_T + 0.8, d: 0.2, ease: ease.outCubic, w: 2, color: PAL.ink }),
    add({ layer: 'wF', path: wheelRim, t0: CAR_T + 0.86, d: 0.2, ease: ease.outCubic, w: 2, color: PAL.ink }),
  ];

  // ---------- матрица слоя для задания ----------
  const LAYER_P = { far: 0.35, mid: 0.65, near: 1 };
  function jobMat(j, t, cam, cs) {
    switch (j.layer) {
      case 'far': case 'mid': case 'near': return layerM(cam, LAYER_P[j.layer]);
      case 'car': return carMat(t, cam, cs, true);
      case 'wR': return wheelMat(t, cam, cs, AXR);
      case 'wF': return wheelMat(t, cam, cs, AXF);
    }
  }

  // ---------- отрисовка одного задания ----------
  function drawJob(ctx, j, t, cam, cs) {
    const f = prog(t, j.t0, j.t0 + j.d, j.ease || ease.inOutCubic);
    if (f <= 0) return;
    const m = jobMat(j, t, cam, cs);
    ctx.save();
    if (j.clip) { ctx.beginPath(); j.clip.fillPath(ctx, m); ctx.clip(); }
    if (j.fill) {
      ctx.save();
      if (j.rise) {
        const yb = M.apply(m, 0, GY)[1], rh = j.rise * cam.s * clamp(f * 1.5);
        ctx.beginPath(); ctx.rect(0, yb - rh, W, rh + 3); ctx.clip();
      }
      ctx.globalAlpha = (j.fillAlpha == null ? 1 : j.fillAlpha) * smooth(f * 1.8);
      ctx.fillStyle = j.fill;
      ctx.beginPath(); (j.fillPath || j.path).fillPath(ctx, m); ctx.fill();
      ctx.restore();
    }
    ctx.lineWidth = j.w; ctx.strokeStyle = j.color; ctx.globalAlpha = j.alpha == null ? 1 : j.alpha;
    ctx.lineCap = j.cap || 'round'; ctx.lineJoin = 'round';
    if (j.dash) ctx.setLineDash(j.dash);
    ctx.beginPath(); j.path.trace(ctx, f, m); ctx.stroke();
    ctx.restore();
  }

  // ---------- нить (перо → фара) ----------
  const NOCTX = { moveTo() {}, lineTo() {} };
  function penAt(t) {
    const tt = Math.max(0, t);
    const cam = camAt(tt), cs = carState(tt);
    if (tt >= T_DRIVE0) {
      const m = carMat(tt, cam, cs, true);
      return M.apply(m, HEADLIGHT[0], HEADLIGHT[1]);
    }
    const vis = (p) => p && p[0] > 24 && p[0] < W - 24 && p[1] > 24 && p[1] < H - 24;
    const tipOf = (j, f) => j.path.trace(NOCTX, f, jobMat(j, tt, cam, cs));
    // 1) самое свежее активное задание, кончик которого в кадре
    let pick = null, pickT = -1;
    for (const j of jobs) {
      if (j.layer === 'wR' || j.layer === 'wF') continue;
      const f = prog(tt, j.t0, j.t0 + j.d, j.ease || ease.inOutCubic);
      if (tt >= j.t0 && f < 1 && j.t0 >= pickT) { const p = tipOf(j, f); if (vis(p)) { pick = p; pickT = j.t0; } }
    }
    if (pick) return pick;
    // 2) иначе — конец последнего завершённого задания, которое в кадре
    let lastEnd = -1;
    for (const j of jobs) {
      if (j.layer === 'wR' || j.layer === 'wF') continue;
      const end = j.t0 + j.d;
      if (tt >= end && end >= lastEnd) { const p = tipOf(j, 1); if (vis(p)) { pick = p; lastEnd = end; } }
    }
    return pick || [W / 2, 1190];
  }
  function drawPen(ctx, t) {
    if (t < 0) return;
    // хвост-комета: тот же закон времени, только раньше
    for (let k = 7; k >= 1; k--) {
      const p = penAt(t - k * 0.022), a = (1 - k / 8) * 0.55;
      ctx.globalAlpha = a; ctx.fillStyle = PAL.thread;
      ctx.beginPath(); ctx.arc(p[0], p[1], 9 * (1 - k / 9), 0, Math.PI * 2); ctx.fill();
    }
    const p = penAt(t);
    ctx.globalAlpha = 1; ctx.fillStyle = PAL.thread;
    ctx.beginPath(); ctx.arc(p[0], p[1], 9, 0, Math.PI * 2); ctx.fill();
    // пинг на сильной доле старта
    const dt = t - T_DRIVE0;
    if (dt >= 0 && dt < 0.45) {
      const e = ease.outExpo(dt / 0.45);
      ctx.globalAlpha = (1 - e) * 0.9; ctx.strokeStyle = PAL.thread; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p[0], p[1], 9 + e * 70, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- лучи фар (нить тянется вперёд) ----------
  function drawBeams(ctx, t, cam, cs) {
    if (t < T_DRIVE0) return;
    const on = ease.outExpo(clamp((t - T_DRIVE0) / 0.18));
    const off = 1 - smooth((t - 7.1) / 0.8);
    const a = on * off; if (a <= 0.001) return;
    const m = carMat(t, cam, cs, true);
    const [hx, hy] = HEADLIGHT, L = 6.2;
    const A = -0.05, B = -0.24;                     // углы верхнего и нижнего края луча
    const p0 = M.apply(m, hx, hy);
    const p1 = M.apply(m, hx + L * Math.cos(A), hy + L * Math.sin(A));
    const p2 = M.apply(m, hx + L * Math.cos(B), hy + L * Math.sin(B));
    ctx.save();
    ctx.globalAlpha = 0.07 * a; ctx.fillStyle = PAL.thread;
    ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.lineTo(...p2); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.6 * a; ctx.strokeStyle = PAL.thread; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.moveTo(...p0); ctx.lineTo(...p2); ctx.stroke();
    ctx.restore();
  }

  // ---------- спицы колёс (вращаются по пройденному пути) ----------
  function drawSpokes(ctx, t, cam, cs) {
    for (const [layer, axle, t0] of [['wR', AXR, CAR_T + 0.9], ['wF', AXF, CAR_T + 0.96]]) {
      const f = prog(t, t0, t0 + 0.2, ease.outCubic); if (f <= 0) continue;
      const m = wheelMat(t, cam, cs, axle);
      ctx.save(); ctx.globalAlpha = f; ctx.lineWidth = 2.2; ctx.strokeStyle = PAL.ink; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = -cs.wheel + (k * 2 * Math.PI) / 5;
        const [x0, y0] = M.apply(m, 0.06 * Math.cos(a), 0.06 * Math.sin(a));
        const [x1, y1] = M.apply(m, 0.205 * Math.cos(a), 0.205 * Math.sin(a));
        ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      }
      ctx.stroke(); ctx.restore();
    }
  }

  // ---------- кадр ----------
  function drawFrame(ctx, t) {
    ctx.save();
    ctx.fillStyle = PAL.paper; ctx.fillRect(0, 0, W, H);
    const cam = camAt(t), cs = carState(t);
    for (const j of jobs) drawJob(ctx, j, t, cam, cs);
    drawBeams(ctx, t, cam, cs);
    drawSpokes(ctx, t, cam, cs);
    drawPen(ctx, t);
    ctx.restore();
  }

  // ---------- зерно бумаги ----------
  let grain = null;
  function grainTile() {
    if (grain) return grain;
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const cx = c.getContext('2d'), id = cx.createImageData(256, 256), r = mulberry32(777);
    for (let i = 0; i < 256 * 256; i++) {
      const v = r() < 0.5 ? 0 : 255, a = r() * 14;
      id.data[i * 4] = v; id.data[i * 4 + 1] = v; id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = a;
    }
    cx.putImageData(id, 0, 0); grain = c; return c;
  }

  // ---------- публичный рендер: масштаб, суб-кадры (motion blur), зерно ----------
  let tmp = null;
  function render(canvas, t, opt) {
    opt = opt || {};
    const scale = opt.scale || canvas.width / W;
    const sub = opt.sub || 1, shutter = opt.shutter == null ? 0.5 / FPS : opt.shutter;
    const ctx = canvas.getContext('2d');
    if (!tmp) tmp = document.createElement('canvas');
    if (tmp.width !== canvas.width || tmp.height !== canvas.height) { tmp.width = canvas.width; tmp.height = canvas.height; }
    const tctx = tmp.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < sub; i++) {
      const ts = sub === 1 ? t : t - shutter / 2 + (shutter * (i + 0.5)) / sub;
      tctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawFrame(tctx, ts);
      ctx.globalAlpha = 1 / (i + 1);
      ctx.drawImage(tmp, 0, 0);
    }
    ctx.globalAlpha = 1;
    // зерно: смещение зависит только от номера кадра
    const fi = Math.round(t * FPS), ox = (fi * 97) % 256, oy = (fi * 61) % 256, gt = grainTile();
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.globalAlpha = 0.5;
    for (let y = -256 + oy; y < H; y += 256) for (let x = -256 + ox; x < W; x += 256) ctx.drawImage(gt, x, y);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // отладка для проверок
  function debug(t) {
    const cam = camAt(t), cs = carState(t), p = penAt(t);
    return { cam, car: cs, pen: p };
  }

  g.Film = {
    W, H, FPS, BPM, BEAT, DURATION, PAL, render, drawFrame, debug,
    marks: [0, 2, 4, 6, 8],   // границы тактов
    constants: { GY, S, CAR_X0, CAR_X1, T_DRIVE0, T_DRIVE1, XG },
  };
})(typeof window !== 'undefined' ? window : globalThis);
