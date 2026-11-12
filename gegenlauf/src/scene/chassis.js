// Узлы под кузовом, построенные кодом. Схематичное изображение: расположение и пропорции по замерам модели
// (центры колёс, диаметры дисков, профиль кузова — public/models/fahrzeug.json) и открытым данным о компоновке
// 911 (мотор за задней осью, коробка перед ним, аккумулятор и бак спереди). Это не копия реальных деталей.
// Единицы: метры. Нос машины в +Z, центр колёсной базы в нуле, пол y = 0.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {E, CYL} from './kin.js';

export const ACCENT = 0xff9d1c; // янтарный, цвет указателя поворота

const AMBER = new THREE.Color(ACCENT);
const KIND = {
  anod:  {color: 0x30343a, metalness: 0.7, roughness: 0.5},
  alu:   {color: 0x9aa0a8, metalness: 0.9, roughness: 0.48},
  steel: {color: 0xb9bec5, metalness: 1.0, roughness: 0.36},
  black: {color: 0x101114, metalness: 0.1, roughness: 0.75},
  pan:   {color: 0x1b1d21, metalness: 0.5, roughness: 0.65},
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ni = (g) => (g.index ? g.toNonIndexed() : g);
function box(w, h, d, x, y, z, r = 0.012, rot) {
  const g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.01, h / 2.01, d / 2.01));
  if (rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
  g.translate(x, y, z); return g;
}
function cyl(r, len, axis, x, y, z, seg = 20, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, len, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(x, y, z); return g;
}
function tube(pts, r, radial = 8, per = 10) {
  const c = new THREE.CatmullRomCurve3(pts.map((p) => V(...p)), false, 'centripetal');
  return new THREE.TubeGeometry(c, Math.max(4, Math.round(c.getLength() * per * 4)), r, radial, false);
}
function rod(a, b, r, seg = 8) { // прямой стержень между двумя точками
  const A = V(...a), B = V(...b), len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), B.clone().sub(A).normalize())));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2); return g;
}
function lathe(profile, axis, x, y, z, seg = 28) { // profile: [[r, along], ...]
  const g = new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(p[0], p[1])), seg);
  if (axis === 'x') g.rotateZ(-Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(x, y, z); return g;
}
function coil(x, y0, y1, z, R, r, turns, tilt = 0) {
  const pts = []; const n = turns * 10;
  for (let i = 0; i <= n; i++) { const t = i / n, a = t * turns * Math.PI * 2; pts.push([x + R * Math.cos(a) + tilt * t, y0 + (y1 - y0) * t, z + R * Math.sin(a)]); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => V(...p))), n * 2, r, 6, false);
}

class Part {
  constructor(id, zone, explode = [0, 0, 0], opts = {}) {
    this.id = id; this.zone = zone; this.explode = V(...explode); this.inside = !!opts.inside;
    this.group = new THREE.Group(); this.group.name = id; this.geo = {}; this.mats = [];
    this.e = 0; this.d = 0; this.x = 0;           // подсветка, приглушение, выдвижение (текущие 0..1)
    this.te = 0; this.td = 0; this.tx = 0;        // цели
  }
  add(kind, ...geos) { (this.geo[kind] ??= []).push(...geos.map(ni)); return this; }
  finish() {
    for (const [kind, list] of Object.entries(this.geo)) {
      const g = mergeGeometries(list, false); list.forEach((x) => x.dispose());
      const m = new THREE.MeshStandardMaterial({...KIND[kind], emissive: ACCENT, emissiveIntensity: 0});
      m.userData.base = new THREE.Color(KIND[kind].color);
      const mesh = new THREE.Mesh(g, m); mesh.name = `${this.id}_${kind}`; this.group.add(mesh); this.mats.push(m);
    }
    this.geo = null;
    this.box = new THREE.Box3().setFromObject(this.group);
    return this;
  }
  apply() {
    this.group.position.copy(this.explode).multiplyScalar(this.x);
    for (const m of this.mats) {
      m.color.copy(m.userData.base).multiplyScalar(1 - 0.62 * this.d).lerp(AMBER, this.e * 0.72);
      m.emissiveIntensity = this.e * 0.42;
      if (this.inside) { const on = this.e > 0.3; m.depthTest = !on; }
    }
    if (this.inside) this.group.renderOrder = this.e > 0.3 ? 20 : 0;
  }
}

// dims: замеры модели (fahrzeuge.json → masse)
export function buildChassis(dims) {
  const root = new THREE.Group(); root.name = 'chassis';
  const parts = {};
  const P = (id, zone, explode, opts) => (parts[id] = new Part(id, zone, explode, opts));
  const zf = dims.achseVorn.z, yf = dims.achseVorn.y, zr = dims.achseHinten.z, yr = dims.achseHinten.y;
  const hubX = dims.nabeX;                                    // внутренняя плоскость ступицы

  // ───────── MOTOR (оппозитная «шестёрка» за задней осью; шаг цилиндров из boxer-lab/kin.js) ─────────
  const ez = zr - 0.42, ey = 0.335, pitch = E.pitch / 10;    // центр мотора, ось коленвала
  const zc = CYL.slice(0, 3).map((c) => ez + c.zc / 10);      // три пары цилиндров
  const block = P('motor_block', 'motor', [0, 0, 0]);
  block.add('alu', box(0.30, 0.30, 0.56, 0, ey, ez, 0.04));                                   // картер
  for (const s of [-1, 1]) {
    for (const z of zc) block.add('alu', cyl(0.062, 0.12, 'x', s * 0.21, ey, z, 20));          // цилиндры
    for (const z of zc) for (const dx of [0.165, 0.19, 0.215, 0.24]) block.add('anod', cyl(0.074, 0.006, 'x', s * dx, ey, z, 20)); // рёбра
    block.add('anod', box(0.085, 0.20, 0.52, s * 0.315, ey, ez, 0.02));                        // головки
  }
  block.add('steel', cyl(0.075, 0.03, 'z', 0, ey, ez - 0.30, 28), cyl(0.03, 0.05, 'z', 0, ey, ez - 0.31, 16)); // шкив
  block.add('anod', cyl(0.05, 0.11, 'z', 0.2, ey + 0.17, ez - 0.25, 18));                      // генератор
  block.add('black', tube([[0.07, ey + 0.02, ez - 0.305], [0.2, ey + 0.13, ez - 0.305], [0.24, ey + 0.2, ez - 0.305]], 0.008, 6)); // ремень

  // крышки клапанов: выдвигаются в стороны (две части)
  const coverL = P('ventildeckel_l', 'motor', [-0.07, 0, 0]), coverR = P('ventildeckel_r', 'motor', [0.07, 0, 0]);
  for (const [p, s] of [[coverL, -1], [coverR, 1]]) {
    p.add('alu', box(0.05, 0.19, 0.50, s * 0.385, ey, ez, 0.02));
    for (const z of zc) p.add('steel', cyl(0.012, 0.012, 'x', s * 0.413, ey + 0.06, z, 8), cyl(0.012, 0.012, 'x', s * 0.413, ey - 0.06, z, 8));
  }

  const plugs = P('zuendkerzen', 'motor', [0, 0.075, 0]);
  for (const s of [-1, 1]) for (const z of zc) {
    plugs.add('steel', cyl(0.011, 0.05, 'y', s * 0.315, ey + 0.125, z, 10));
    plugs.add('black', cyl(0.019, 0.055, 'y', s * 0.315, ey + 0.17, z, 12));                   // катушка
  }
  const intake = P('ansaugung', 'motor', [0, 0.09, 0]);
  intake.add('alu', cyl(0.05, 0.40, 'z', 0, ey + 0.245, ez + 0.02, 18));                        // ресивер
  for (const s of [-1, 1]) for (const z of zc) intake.add('alu', tube([[s * 0.04, ey + 0.25, z], [s * 0.16, ey + 0.245, z], [s * 0.245, ey + 0.19, z], [s * 0.262, ey + 0.115, z]], 0.02, 8));
  intake.add('anod', cyl(0.034, 0.07, 'z', 0, ey + 0.245, ez - 0.215, 14));                     // дроссель
  const airbox = P('luftfilter', 'motor', [0, 0.10, -0.03]);
  airbox.add('black', box(0.31, 0.085, 0.15, 0.1, ey + 0.30, ez - 0.335, 0.025));
  airbox.add('anod', box(0.27, 0.012, 0.11, 0.1, ey + 0.347, ez - 0.335, 0.004));
  const filter = P('oelfilter', 'motor', [-0.05, 0.11, 0]);
  filter.add('steel', cyl(0.043, 0.1, 'y', -0.118, ey + 0.208, ez - 0.238, 18));
  filter.add('anod', cyl(0.046, 0.02, 'y', -0.118, ey + 0.155, ez - 0.238, 18), cyl(0.022, 0.012, 'y', -0.118, ey + 0.264, ez - 0.238, 6));
  const sump = P('oelwanne', 'motor', [0, -0.05, 0]);
  sump.add('anod', box(0.27, 0.035, 0.50, 0, ey - 0.168, ez, 0.012));
  sump.add('steel', cyl(0.012, 0.012, 'y', 0.06, ey - 0.19, ez - 0.1, 6));                      // сливная пробка
  const ims = P('ims', 'motor', [0, 0, 0], {inside: true});   // промежуточный вал: внутри картера, виден при подсветке
  ims.add('steel', cyl(0.014, 0.50, 'z', 0, ey - 0.075, ez, 10), cyl(0.034, 0.03, 'z', 0, ey - 0.075, ez + 0.265, 16), cyl(0.028, 0.02, 'z', 0, ey - 0.075, ez - 0.25, 14));

  // ───────── KUPPLUNG & GETRIEBE (перед мотором, дифференциал на линии задней оси) ─────────
  const bz = ez + 0.28;                                        // задний торец колокола
  const clutch = P('kupplung', 'getriebe', [0, 0, 0]);
  clutch.add('alu', lathe([[0.175, 0], [0.18, 0.02], [0.17, 0.09], [0.135, 0.15], [0.12, 0.15]], 'z', 0, ey, bz, 28));
  const disc = P('kupplungsscheibe', 'getriebe', [0, 0, 0], {inside: true});
  disc.add('steel', cyl(0.125, 0.012, 'z', 0, ey, bz + 0.05, 28), cyl(0.14, 0.02, 'z', 0, ey, bz + 0.085, 28), cyl(0.045, 0.05, 'z', 0, ey, bz + 0.06, 14));
  const gz0 = bz + 0.15, gz1 = zr + 0.70;                      // корпус коробки
  const gear = P('getriebe', 'getriebe', [0, 0, 0]);
  gear.add('alu', lathe([[0.12, 0], [0.135, 0.03], [0.13, 0.22], [0.10, 0.40], [0.085, gz1 - gz0 - 0.03], [0.06, gz1 - gz0], [0, gz1 - gz0]], 'z', 0, ey, gz0, 20));
  gear.add('alu', lathe([[0, -0.19], [0.07, -0.19], [0.085, -0.15], [0.14, -0.07], [0.15, 0], [0.14, 0.07], [0.085, 0.15], [0.07, 0.19], [0, 0.19]], 'x', 0, yr - 0.005, zr, 22)); // дифференциал
  for (let i = 0; i < 5; i++) gear.add('anod', box(0.012, 0.19, 0.012, 0.118 - i * 0.004, ey, gz0 + 0.06 + i * 0.07, 0.003), box(0.012, 0.19, 0.012, -(0.118 - i * 0.004), ey, gz0 + 0.06 + i * 0.07, 0.003));
  gear.add('steel', cyl(0.014, 0.012, 'y', 0, ey - 0.128, gz0 + 0.3, 6));                        // пробка слива масла
  const shafts = P('antriebswellen', 'getriebe', [0, 0, 0]);
  for (const s of [-1, 1]) {
    shafts.add('steel', rod([s * 0.19, yr - 0.005, zr], [s * (hubX - 0.02), yr, zr], 0.016, 10));
    shafts.add('black', lathe([[0.02, 0], [0.045, 0.03], [0.03, 0.05], [0.042, 0.07], [0.02, 0.1]], 'x', s > 0 ? 0.2 : -0.3, yr - 0.004, zr, 14),
      lathe([[0.02, 0], [0.042, 0.03], [0.03, 0.05], [0.045, 0.07], [0.02, 0.1]], 'x', s > 0 ? hubX - 0.14 : -hubX + 0.04, yr, zr, 14));
  }

  // ───────── ABGASANLAGE ─────────
  const hy = ey - 0.155;                                       // ось коллекторов
  const headers = P('kruemmer', 'abgas', [0, -0.03, 0]);
  for (const s of [-1, 1]) {
    for (const z of zc) headers.add('steel', tube([[s * 0.315, ey - 0.10, z], [s * 0.325, hy + 0.01, z - 0.01], [s * 0.34, hy, z - 0.05]], 0.017, 8));
    headers.add('steel', tube([[s * 0.34, hy, zc[2] - 0.03], [s * 0.34, hy, zc[0] - 0.08], [s * 0.36, hy + 0.01, ez - 0.30]], 0.022, 8));
  }
  const cats = P('kat', 'abgas', [0, -0.02, -0.02]);
  for (const s of [-1, 1]) {
    cats.add('steel', lathe([[0.022, 0], [0.048, 0.025], [0.048, 0.1], [0.024, 0.12]], 'z', s * 0.37, hy, ez - 0.42, 16));
    cats.add('steel', tube([[s * 0.37, hy, ez - 0.42], [s * 0.385, hy + 0.02, ez - 0.445], [s * 0.4, hy + 0.07, ez - 0.455]], 0.02, 8));
  }
  const muffler = P('endschalldaempfer', 'abgas', [0, 0, 0]);
  const my = dims.endrohr.y - 0.012, mz = dims.endrohr.z + 0.05;   // насадки модели выходят из задней стенки глушителя
  muffler.add('steel', lathe([[0, -0.5], [0.047, -0.5], [0.065, -0.47], [0.065, 0.47], [0.047, 0.5], [0, 0.5]], 'x', 0, my, mz, 18));

  // ───────── FAHRWERK ─────────
  const sub = P('hilfsrahmen', 'fahrwerk', [0, 0, 0]);
  const arms = P('querlenker', 'fahrwerk', [0, -0.035, 0]);
  const struts = P('federbeine', 'fahrwerk', [0, 0.06, 0]);
  const tie = P('spurstangen', 'fahrwerk', [0, 0, 0]);
  for (const [za, ya, front] of [[zf, yf, true], [zr, yr, false]]) {
    const inX = front ? 0.30 : 0.33, lowY = ya - 0.115, k = front ? 1 : -1;
    sub.add('pan', rod([-inX, lowY, za + 0.17], [inX, lowY, za + 0.17], 0.022, 8), rod([-inX, lowY, za - 0.17], [inX, lowY, za - 0.17], 0.022, 8));
    for (const s of [-1, 1]) {
      sub.add('pan', rod([s * inX, lowY, za - 0.2], [s * inX, lowY, za + 0.2], 0.024, 8));
      sub.add('anod', box(0.05, 0.21, 0.075, s * (hubX - 0.035), ya, za, 0.012));                // поворотный кулак
      arms.add('alu', rod([s * (hubX - 0.045), lowY + 0.015, za], [s * (inX + 0.01), lowY, za + 0.165], 0.015, 8),
        rod([s * (hubX - 0.045), lowY + 0.015, za], [s * (inX + 0.01), lowY, za - 0.165], 0.015, 8),
        rod([s * (inX + 0.14), lowY + 0.006, za + 0.105], [s * (inX + 0.14), lowY + 0.006, za - 0.105], 0.011, 6));
      arms.add('black', cyl(0.024, 0.04, 'z', s * (inX + 0.01), lowY, za + 0.165, 10), cyl(0.024, 0.04, 'z', s * (inX + 0.01), lowY, za - 0.165, 10));
      const topY = front ? 0.76 : 0.80, bx = s * (hubX - 0.075), tx = s * (hubX - 0.17), sz = za - k * 0.0;
      struts.add('steel', rod([bx, ya - 0.02, sz], [bx + (tx - bx) * 0.55, ya - 0.02 + (topY - ya) * 0.55, sz], 0.027, 12));
      struts.add('steel', rod([bx + (tx - bx) * 0.5, ya + (topY - ya) * 0.5, sz], [tx, topY, sz], 0.011, 8));
      struts.add('anod', coil(bx + (tx - bx) * 0.42, ya + (topY - ya) * 0.42, topY - 0.02, sz, 0.052, 0.0085, 5, (tx - bx) * 0.58));
      struts.add('black', cyl(0.062, 0.022, 'y', tx, topY, sz, 16), cyl(0.06, 0.012, 'y', bx + (tx - bx) * 0.42, ya + (topY - ya) * 0.42, sz, 16));
      const tz = za - k * 0.15;                                                                   // рулевая тяга / тяга схождения
      tie.add('steel', rod([s * (front ? 0.36 : inX), ya - 0.05, tz], [s * (hubX - 0.04), ya - 0.04, tz + k * 0.045], 0.0095, 8));
      tie.add('black', cyl(0.017, 0.03, 'y', s * (hubX - 0.04), ya - 0.04, tz + k * 0.045, 8));
    }
    if (front) {
      tie.add('alu', cyl(0.024, 0.52, 'x', 0, ya - 0.05, tz0(za, k), 12));                       // рулевая рейка
      tie.add('black', lathe([[0.024, 0], [0.03, 0.02], [0.022, 0.04], [0.03, 0.06], [0.014, 0.1]], 'x', 0.26, ya - 0.05, tz0(za, k), 10), lathe([[0.014, 0], [0.03, 0.04], [0.022, 0.06], [0.03, 0.08], [0.024, 0.1]], 'x', -0.36, ya - 0.05, tz0(za, k), 10));
    }
  }
  function tz0(za, k) { return za - k * 0.15; }

  // ───────── BREMSEN (диски и суппорты — из модели; здесь бачок и магистрали) ─────────
  const lines = P('bremsleitung', 'bremsen', [0, 0, 0]);
  const ly = 0.205;
  lines.add('steel', cyl(0.04, 0.2, 'z', 0.3, 0.6, zf - 0.36, 14), cyl(0.022, 0.1, 'z', 0.3, 0.6, zf - 0.22, 10));        // главный цилиндр с усилителем
  lines.add('black', box(0.09, 0.07, 0.08, 0.3, 0.675, zf - 0.33, 0.015), cyl(0.022, 0.014, 'y', 0.3, 0.717, zf - 0.33, 12)); // бачок
  const hose = (pts) => lines.add('steel', tube(pts, 0.0048, 5, 8));
  hose([[0.3, 0.58, zf - 0.2], [0.3, 0.42, zf - 0.21], [0.3, 0.3, zf - 0.24], [0.25, ly, zf - 0.3], [0.16, ly, zf - 0.4], [0.105, ly, 0.6], [0.105, ly, -0.45], [0.2, ly, zr + 0.42], [0.36, ly + 0.02, zr + 0.3]]);
  for (const s of [-1, 1]) {
    hose([[0.3, 0.3, zf - 0.24], [s * 0.36, 0.26, zf - 0.27], [s * 0.6, 0.3, zf - 0.2], [s * dims.sattelVorn.x, dims.sattelVorn.y, dims.sattelVorn.z + 0.03]]);
    hose([[s > 0 ? 0.36 : 0.2, ly + 0.02, zr + (s > 0 ? 0.3 : 0.42)], [s * 0.42, 0.25, zr + 0.28], [s * 0.6, 0.27, zr + 0.24], [s * dims.sattelHinten.x, dims.sattelHinten.y, dims.sattelHinten.z + 0.03]]);
  }

  // ───────── ELEKTRIK & DIAGNOSE ─────────
  const batt = P('batterie', 'elektrik', [0, 0.09, 0]);
  batt.add('black', box(0.27, 0.18, 0.17, -0.27, 0.565, zf - 0.33, 0.012));
  batt.add('steel', cyl(0.011, 0.02, 'y', -0.36, 0.662, zf - 0.33, 8), cyl(0.011, 0.02, 'y', -0.18, 0.662, zf - 0.33, 8));
  batt.add('anod', box(0.29, 0.016, 0.03, -0.27, 0.657, zf - 0.39, 0.004));
  const ecu = P('steuergeraet', 'elektrik', [0, 0.08, 0]);
  ecu.add('alu', box(0.2, 0.038, 0.15, 0.0, 0.565, zr + 0.36, 0.008));
  for (let i = 0; i < 6; i++) ecu.add('anod', box(0.19, 0.008, 0.008, 0, 0.588, zr + 0.3 + i * 0.024, 0.002));
  ecu.add('black', box(0.09, 0.026, 0.03, 0.0, 0.565, zr + 0.45, 0.005));
  const loom = P('kabelbaum', 'elektrik', [0, 0, 0]);
  const wire = (pts, r = 0.0075) => loom.add('black', tube(pts, r, 6, 8));
  wire([[-0.27, 0.48, zf - 0.33], [-0.27, 0.3, zf - 0.4], [-0.105, 0.215, zf - 0.55], [-0.105, 0.215, -0.4], [-0.09, 0.3, zr + 0.56], [-0.03, 0.5, zr + 0.5], [0, 0.56, zr + 0.46]]);
  wire([[0.04, 0.565, zr + 0.3], [0.1, 0.57, zr + 0.1], [0.12, 0.6, ez + 0.3], [0.1, ey + 0.21, ez + 0.2]], 0.006);
  wire([[-0.105, 0.215, 0.3], [-0.3, 0.2, 0.32], [-0.52, 0.22, 0.36]], 0.005);                    // к диагностическому разъёму
  loom.add('anod', box(0.05, 0.022, 0.03, -0.54, 0.225, 0.365, 0.004));
  const ac = P('klima', 'elektrik', [0, 0, 0]);
  for (const s of [-1, 1]) {
    ac.add('alu', box(0.3, 0.2, 0.022, s * 0.5, 0.37, zf + 0.72, 0.004, [0.0, s * 0.5, 0]));
    for (let i = 0; i < 7; i++) ac.add('anod', box(0.29, 0.005, 0.026, s * 0.5, 0.29 + i * 0.027, zf + 0.72, 0.001, [0, s * 0.5, 0]));
  }
  ac.add('anod', cyl(0.043, 0.11, 'z', -0.215, ey + 0.165, ez - 0.25, 16), cyl(0.05, 0.016, 'z', -0.215, ey + 0.165, ez - 0.312, 16)); // компрессор
  ac.add('steel', tube([[-0.215, ey + 0.2, ez - 0.2], [-0.25, 0.5, ez + 0.1], [-0.44, 0.3, zr + 0.5], [-0.5, 0.2, -0.5], [-0.5, 0.2, 0.7], [-0.5, 0.3, zf + 0.5], [-0.5, 0.36, zf + 0.7]], 0.006, 6, 6),
    tube([[-0.42, 0.37, zf + 0.76], [0, 0.33, zf + 0.84], [0.42, 0.37, zf + 0.76]], 0.006, 6, 8));

  // ───────── основа: днище с туннелем, лонжероны, бак ─────────
  const pan = P('boden', 'basis', [0, 0, 0]);
  pan.add('pan', box(1.36, 0.022, 1.46, 0, 0.165, 0.11, 0.008), box(0.2, 0.085, 1.46, 0, 0.215, 0.11, 0.03));
  for (const s of [-1, 1]) {
    pan.add('pan', box(0.075, 0.1, 1.5, s * 0.715, 0.2, 0.11, 0.02));
    pan.add('pan', rod([s * 0.42, 0.21, 0.82], [s * 0.3, yf - 0.1, zf - 0.2], 0.026, 8), rod([s * 0.5, 0.21, -0.6], [s * 0.33, yr - 0.1, zr + 0.2], 0.026, 8));
  }
  pan.add('black', box(0.62, 0.18, 0.3, 0, 0.36, 0.72, 0.05));                                 // топливный бак

  for (const p of Object.values(parts)) { p.finish(); root.add(p.group); }
  return {root, parts};
}

// группы деталей для услуг и зон (ключи = "teile" в src/data/preise.json)
export const ZONE_PARTS = {
  motor: ['motor_block', 'ventildeckel_l', 'ventildeckel_r', 'zuendkerzen', 'ansaugung', 'luftfilter', 'oelfilter', 'oelwanne', 'ims'],
  getriebe: ['kupplung', 'kupplungsscheibe', 'getriebe', 'antriebswellen'],
  bremsen: ['bremse_vorn', 'bremse_hinten', 'bremsleitung'],
  fahrwerk: ['hilfsrahmen', 'querlenker', 'federbeine', 'spurstangen'],
  abgas: ['kruemmer', 'kat', 'endschalldaempfer', 'endrohre'],
  elektrik: ['batterie', 'steuergeraet', 'kabelbaum', 'klima'],
};
