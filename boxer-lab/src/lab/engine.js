// Geometry of the flat-six, built from code (lathed, extruded, tubed). update(th) poses it from kin.js only.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {E, CYL, pose} from './kin.js';

const TAU = Math.PI * 2;
const V2 = (a, b) => new THREE.Vector2(a, b);

export const PAL = {accent: 0xff5a1f, ink: 0x1b1d21};

// ---- materials (light studio: roughness >= .35 everywhere so metal never streaks white) ----
const std = (o) => new THREE.MeshStandardMaterial(o);
export const MAT = {
  steel:   std({color: 0xb4b9c0, metalness: 1, roughness: 0.38}),
  steelLo: std({color: 0x80868e, metalness: 1, roughness: 0.46}),
  chrome:  std({color: 0xd2d6db, metalness: 1, roughness: 0.28}),
  anod:    std({color: 0x3a3f46, metalness: 0.55, roughness: 0.46}),
  anodHi:  std({color: 0x59606a, metalness: 0.6, roughness: 0.4}),
  rod:     std({color: 0x9aa0a8, metalness: 1, roughness: 0.4}),
  glass:   new THREE.MeshPhysicalMaterial({color: 0xd5eaf0, metalness: 0, roughness: 0.06, transparent: true,
             opacity: 0.17, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.4}),
  flame:   new THREE.MeshBasicMaterial({color: PAL.accent, transparent: true, opacity: 0, depthWrite: false}),
};

// ---- helpers ----
function hull(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  const up = [];
  for (const p of pts.slice().reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop();
  return lo.concat(up);
}
// A flat plate = convex hull of circles [cx, cy, R], extruded and bevelled, centred on z = 0.
function blob(circles, depth, bevel = 0.016) {
  const pts = [];
  for (const [cx, cy, R] of circles) for (let i = 0; i < 32; i++) { const t = i / 32 * TAU; pts.push([cx + R * Math.cos(t), cy + R * Math.sin(t)]); }
  const sh = new THREE.Shape(hull(pts).map((p) => V2(p[0], p[1])));
  const g = new THREE.ExtrudeGeometry(sh, {depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 1});
  g.translate(0, 0, -depth / 2);
  return g;
}
const lathe = (pts, seg = 72) => new THREE.LatheGeometry(pts.map((p) => V2(p[0], p[1])), seg);
const cylZ = (r, len, seg = 48) => { const g = new THREE.CylinderGeometry(r, r, len, seg); g.rotateX(Math.PI / 2); return g; }; // axis along z
function ringShape(ro, ri) {
  const s = new THREE.Shape(); s.absarc(0, 0, ro, 0, TAU, false);
  const h = new THREE.Path(); h.absarc(0, 0, ri, 0, TAU, true); s.holes.push(h);
  return s;
}
function mesh(g, m, parent, {cast = true, recv = true} = {}) {
  const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = recv; parent.add(o); return o;
}

// ---- parts ----
function makeRodGeometry() {
  const L = E.rod, parts = [];
  const big = new THREE.ExtrudeGeometry(ringShape(0.345, 0.262), {depth: 0.30, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 40});
  big.translate(0, 0, -0.15);
  const small = new THREE.ExtrudeGeometry(ringShape(0.175, 0.108), {depth: 0.22, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 32});
  small.translate(L, 0, -0.11);
  // beam: tapered I-section = web plate + two flanges
  const w = new THREE.Shape([V2(0.28, -0.135), V2(L - 0.15, -0.062), V2(L - 0.15, 0.062), V2(0.28, 0.135)]);
  const web = new THREE.ExtrudeGeometry(w, {depth: 0.07, bevelEnabled: false}); web.translate(0, 0, -0.035);
  const fl = new THREE.ExtrudeGeometry(w, {depth: 0.03, bevelEnabled: false});
  const f1 = fl.clone(); f1.translate(0, 0, 0.035);
  const f2 = fl.clone(); f2.translate(0, 0, -0.065);
  return {big, small, beam: [web, f1, f2]};
}

function makePistonGroup(accentMat) {
  const g = new THREE.Group();
  const R = 0.468;
  const prof = [[0, 0], [R - 0.07, 0], [R - 0.012, -0.012], [R, -0.04],
    [R, -0.075], [R - 0.03, -0.077], [R - 0.03, -0.1], [R, -0.102], [R, -0.14], [R - 0.03, -0.142], [R - 0.03, -0.165], [R, -0.167],
    [R, -0.2], [R - 0.012, -0.22], [R - 0.012, -0.52], [R - 0.05, -0.52], [R - 0.05, -0.10], [0, -0.10]];
  mesh(lathe(prof, 64), new THREE.MeshStandardMaterial({color: 0xc3c8ce, metalness: 1, roughness: 0.34, side: THREE.DoubleSide}), g);
  // crown disc: the accent shows here during the power stroke
  const crown = mesh(new THREE.CylinderGeometry(R - 0.075, R - 0.075, 0.012, 56), accentMat, g, {recv: false}); crown.position.y = 0.0065;
  for (const y of [-0.057, -0.121, -0.186]) { // rings
    const t = new THREE.TorusGeometry(R - 0.004, 0.011, 8, 56); t.rotateX(Math.PI / 2);
    const o = mesh(t, MAT.chrome, g, {cast: false}); o.position.y = y;
  }
  const pin = mesh(cylZ(0.105, 0.82, 32), MAT.chrome, g); pin.position.y = -0.30;
  return g;
}

export function buildEngine(scene) {
  const root = new THREE.Group(); scene.add(root);
  const api = {root, cyl: [], parts: {}};
  const rodG = makeRodGeometry();
  const HEAD = 2.05;

  // --- crank (rotates as one rigid body) ---
  const crank = new THREE.Group(); root.add(crank); api.crank = crank; api.parts.crank = crank;
  const zs = [];
  for (let p = 0; p < 3; p++) {
    const cA = CYL[p], zc = cA.zc, aA = cA.a0, aB = aA + Math.PI;
    const pinXY = (a) => [E.r * Math.cos(a), E.r * Math.sin(a)];
    const [ax, ay] = pinXY(aA), [bx, by] = pinXY(aB);
    // pins
    for (const [x, y, z] of [[ax, ay, zc - E.pairGap / 2], [bx, by, zc + E.pairGap / 2]]) { const o = mesh(cylZ(E.pinR, E.pinW + 0.02, 48), MAT.chrome, crank); o.position.set(x, y, z); }
    // counterweighted outer webs + a slim centre web
    const cw = (a) => [-0.15 * Math.cos(a), -0.15 * Math.sin(a), 0.42];
    const wA = mesh(blob([[0, 0, 0.46], [ax, ay, 0.30], cw(aA)], 0.14), MAT.steelLo, crank); wA.position.z = zc - 0.49;
    const wB = mesh(blob([[0, 0, 0.46], [bx, by, 0.30], cw(aB)], 0.14), MAT.steelLo, crank); wB.position.z = zc + 0.49;
    const wC = mesh(blob([[0, 0, 0.36], [ax, ay, 0.22], [bx, by, 0.22]], 0.14), MAT.steelLo, crank); wC.position.z = zc;
    zs.push(zc);
  }
  const mains = [-2.28, -0.76, 0.76, 2.28];
  for (const z of mains) { const o = mesh(cylZ(E.mainR, E.mainW + 0.06, 56), MAT.chrome, crank); o.position.z = z; }
  mesh(cylZ(0.26, 0.9, 40), MAT.chrome, crank).position.z = -2.75;      // front stub
  mesh(cylZ(0.30, 0.8, 40), MAT.chrome, crank).position.z = 2.62;       // rear stub

  // flywheel + ring gear (rear), damper pulley (front)
  const fly = new THREE.Group(); fly.position.z = 3.12; crank.add(fly);
  const flyG = lathe([[0, 0.15], [0.46, 0.15], [0.5, 0.11], [0.5, 0.0], [0.92, 0.0], [0.92, -0.10], [1.0, -0.13], [1.0, 0.09], [0.9, 0.12], [0.52, 0.12], [0.5, 0.15], [0, 0.15]], 96);
  flyG.rotateX(Math.PI / 2); mesh(flyG, MAT.steelLo, fly);
  for (let i = 0; i < 8; i++) { const t = i / 8 * TAU + 0.2; const hole = mesh(cylZ(0.15, 0.30, 32), MAT.anod, fly, {cast: false}); hole.position.set(0.68 * Math.cos(t), 0.68 * Math.sin(t), 0.02); }
  const hub = mesh(cylZ(0.30, 0.36, 40), MAT.chrome, fly); hub.position.z = 0.1;
  const tooth = new THREE.BoxGeometry(0.05, 0.07, 0.2);
  const teeth = new THREE.InstancedMesh(tooth, MAT.steel, 118); teeth.castShadow = true;
  const tmp = new THREE.Object3D();
  for (let i = 0; i < 118; i++) { const t = i / 118 * TAU; tmp.position.set(1.02 * Math.cos(t), 1.02 * Math.sin(t), 0); tmp.rotation.set(0, 0, t + Math.PI / 2); tmp.updateMatrix(); teeth.setMatrixAt(i, tmp.matrix); }
  fly.add(teeth);
  const damp = new THREE.Group(); damp.position.z = -3.12; crank.add(damp);
  const dG = lathe([[0, 0.17], [0.7, 0.17], [0.7, 0.10], [0.62, 0.07], [0.7, 0.04], [0.7, -0.04], [0.62, -0.07], [0.7, -0.10], [0.7, -0.17], [0, -0.17]], 72);
  dG.rotateX(Math.PI / 2); mesh(dG, MAT.steelLo, damp);
  const dcap = mesh(cylZ(0.2, 0.3, 32), MAT.chrome, damp); dcap.position.z = -0.17;

  // --- bearing pedestals + rail ---
  for (const z of mains) { const o = mesh(new RoundedBoxGeometry(1.05, 1.1, 0.5, 4, 0.05), MAT.anod, root); o.position.set(0, -0.30 - 0.55, z); }
  const rail = mesh(new RoundedBoxGeometry(0.9, 0.14, 5.6, 3, 0.04), MAT.anod, root); rail.position.set(0, -1.46, 0);
  api.parts.block = root;

  // --- cylinders ---
  const exhaustY = -1.38, collX = 1.75;
  const collectorPts = {1: [], '-1': []};
  for (const c of CYL) {
    const s = c.s;
    const cg = new THREE.Group(); cg.position.z = c.z; cg.rotation.z = -s * Math.PI / 2; root.add(cg);
    // glass liner (local +y is the cylinder axis), steel foot + clamp ring
    const liner = mesh(lathe([[0.486, 0.55], [0.60, 0.55], [0.60, HEAD], [0.486, HEAD], [0.486, 0.55]], 80), MAT.glass, cg, {cast: false, recv: false});
    liner.renderOrder = 5;
    mesh(lathe([[0.48, 0.55], [0.74, 0.55], [0.74, 0.66], [0.64, 0.72], [0.60, 0.72], [0.48, 0.72]], 72), MAT.steelLo, cg);
    mesh(lathe([[0.60, 1.78], [0.69, 1.78], [0.69, HEAD], [0.60, HEAD]], 72), MAT.steel, cg);

    // piston + crown accent
    const crownMat = new THREE.MeshStandardMaterial({color: 0xc3c8ce, metalness: 1, roughness: 0.34, emissive: PAL.accent, emissiveIntensity: 0});
    const pist = makePistonGroup(crownMat); pist.rotation.z = -s * Math.PI / 2; pist.position.z = c.z; root.add(pist);

    // flame in the combustion space
    const flameMat = MAT.flame.clone();
    const flame = new THREE.Mesh(new THREE.CylinderGeometry(0.455, 0.455, 1, 40, 1, true), flameMat); flame.renderOrder = 6; root.add(flame);
    const flameCap = new THREE.Mesh(new THREE.CircleGeometry(0.455, 40), flameMat); flameCap.rotation.y = Math.PI / 2 * s; flameCap.renderOrder = 6; root.add(flameCap);

    // rod
    const rod = new THREE.Group(); root.add(rod);
    mesh(rodG.big, MAT.rod, rod); mesh(rodG.small, MAT.rod, rod);
    for (const bg of rodG.beam) mesh(bg, MAT.rod, rod);

    // head (world coordinates, mirrored by s)
    const head = mesh(new RoundedBoxGeometry(0.95, 1.18, 1.40, 6, 0.14), MAT.anod, root); head.position.set(s * (HEAD + 0.475), 0, c.z);
    const cover = mesh(new RoundedBoxGeometry(0.62, 0.20, 1.06, 4, 0.04), MAT.anodHi, root); cover.position.set(s * (HEAD + 0.40), 0.66, c.z);
    for (const dz of [-0.28, 0, 0.28]) { const rib = mesh(new THREE.BoxGeometry(0.50, 0.03, 0.05), MAT.steel, root); rib.position.set(s * (HEAD + 0.40), 0.775, c.z + dz); }
    const plug = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.46, 20), MAT.steelLo, root); plug.position.set(s * (HEAD + 0.40), 0.95, c.z);
    const plugCap = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 6), MAT.chrome, root); plugCap.position.set(s * (HEAD + 0.40), 1.22, c.z);
    // intake trumpet
    const trump = mesh(lathe([[0.30, 0.60], [0.23, 0.50], [0.17, 0.30], [0.14, 0.0], [0.20, -0.02], [0.20, 0.0], [0.14, 0.02], [0.145, 0.3], [0.185, 0.5], [0.315, 0.62]], 40), MAT.chrome, root);
    trump.position.set(s * (HEAD + 0.80), 0.55, c.z);

    // exhaust runner: head flange -> down -> sweeps in to the collector line
    const x0 = s * (HEAD + 0.62);
    const flange = mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.05, 40), MAT.steelLo, root); flange.position.set(x0, -0.62, c.z);
    const toCol = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x0, -0.60, c.z), new THREE.Vector3(x0, -0.92, c.z),
      new THREE.Vector3(x0 - s * 0.35, exhaustY + 0.08, c.z), new THREE.Vector3(s * collX + s * 0.08, exhaustY, c.z + (c.right ? -0.0 : 0.0)),
    ], false, 'centripetal');
    mesh(new THREE.TubeGeometry(toCol, 56, 0.17, 24, false), MAT.steel, root);
    collectorPts[s].push(c.z);

    api.cyl.push({c, pist, crownMat, flame, flameCap, flameMat, rod, cg});
  }
  // collectors along z, joined behind the engine, tail pipe
  const pipe = (pts, r, mat = MAT.steel) => mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal'), 160, r, 28, false), mat, root);
  for (const s of [1, -1]) {
    pipe([[s * collX, exhaustY, -2.1], [s * collX, exhaustY, 0], [s * collX, exhaustY, 2.0], [s * 1.45, exhaustY, 2.55], [s * 0.7, exhaustY, 2.85], [0.0, exhaustY, 2.95]], 0.24);
  }
  pipe([[0, exhaustY, 2.9], [0, exhaustY, 3.5], [0, exhaustY, 3.8]], 0.30);
  const tip = mesh(lathe([[0.30, 0], [0.36, 0.1], [0.36, 0.5], [0.30, 0.5], [0.30, 0.0]], 48), MAT.chrome, root);
  tip.rotation.x = Math.PI / 2; tip.position.set(0, exhaustY, 3.7);
  for (const s of [1, -1]) { const cap = mesh(new THREE.SphereGeometry(0.24, 24, 16), MAT.steel, root); cap.position.set(s * collX, exhaustY, -2.1); }

  // ---- pose ----
  api.update = (th, st = {}) => {
    crank.rotation.z = th;
    for (const k of api.cyl) {
      const p = pose(k.c, th), s = k.c.s;
      k.pist.position.x = p.wx + s * 0.30;
      k.rod.position.set(p.px, p.py, k.c.z); k.rod.rotation.z = p.rodAng;
      const crownX = p.wx + s * 0.30;
      const len = Math.max(0.001, s * (HEAD - crownX));            // gas column between crown and head
      k.flame.position.set(crownX + s * len / 2, 0, k.c.z);
      k.flame.rotation.z = -s * Math.PI / 2; k.flame.scale.set(1, len, 1);
      k.flameCap.position.set(s * HEAD - s * 0.002, 0, k.c.z);
      const power = p.stroke === 0 ? 1 - p.phase / 180 : 0;           // burns hardest right after TDC
      k.flameMat.opacity = 0.88 * Math.pow(power, 0.55);
      k.crownMat.emissiveIntensity = 2.6 * power;
    }
  };
  return api;
}
