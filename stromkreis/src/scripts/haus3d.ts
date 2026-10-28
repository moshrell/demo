// 3D-Hero (Срез): Haus im Schnitt, Räume gehen per Scroll an, Kamera fliegt in den Raum.
// Kein Modell "aus dem Kopf": Möbel/Auto = Kenney (CC0), Hülle = einfache Boxen.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type RoomId = 'keller' | 'kueche' | 'wohnen' | 'garage' | 'bad' | 'schlaf' | 'buero' | 'dach' | 'garten';
export interface RoomInfo { id: RoomId; name: string; line: string; circuit: string; cx: number; cy: number; w: number; h: number; ax?: number; ay?: number; az?: number; aw?: number; free?: boolean; }

const K = 2; // Kenney-Einheit -> Meter (Wand 1.29 -> ~2.6 m)
const HW = 6; // halbe Innenbreite
const D = 3.5; // halbe Innentiefe
const LEVEL = { keller: -3, eg: 0, og: 3 } as const;
const WALL_H = 3;

export const ROOMS: RoomInfo[] = [
  { id: 'keller', name: 'Keller', line: 'Zählerschrank und Hausanschluss', circuit: 'F1', cx: 0, cy: -1.5, w: 12, h: 2.7, ax: 0.6, ay: -1.4, az: -3.0, aw: 4.6 },
  { id: 'bad', name: 'Bad', line: 'FI-Schutz und Potenzialausgleich', circuit: 'F2', cx: -4, cy: 4.5, w: 4, h: 2.7, ax: -4.0, ay: 4.2, az: -2.8, aw: 3.6 },
  { id: 'kueche', name: 'Küche', line: 'Herdanschluss, Steckdosen, Licht', circuit: 'F3', cx: -4, cy: 1.5, w: 4, h: 2.7, ax: -3.7, ay: 1.25, az: -3.0, aw: 3.4 },
  { id: 'wohnen', name: 'Wohnzimmer', line: 'Smart Home, Lichtszenen, Netzwerk', circuit: 'F4', cx: 0, cy: 1.5, w: 4, h: 2.7, ax: 0, ay: 1.2, az: -2.4, aw: 3.8 },
  { id: 'garage', name: 'Garage', line: 'Wallbox mit Anmeldung beim Netzbetreiber', circuit: 'F5', cx: 4, cy: 1.5, w: 4, h: 2.7, ax: 5.2, ay: 1.25, az: -2.6, aw: 3.2 },
  { id: 'schlaf', name: 'Schlafzimmer', line: 'Rauchmelder und Dimmer', circuit: 'F6', cx: 0, cy: 4.5, w: 4, h: 2.7, ax: 0, ay: 3.9, az: -2.0, aw: 3.8 },
  { id: 'buero', name: 'Büro', line: 'E-Check nach DGUV V3', circuit: 'F7', cx: 4, cy: 4.5, w: 4, h: 2.7, ax: 4.1, ay: 3.9, az: -2.7, aw: 3.6 },
  { id: 'dach', name: 'Dach', line: 'PV-Anlage und Speicher', circuit: 'F8', cx: 0, cy: 7.6, w: 8, h: 2.6, ax: 2.5, ay: 7.6, az: 0, aw: 9, free: true },
  { id: 'garten', name: 'Garten', line: 'Wegelicht, Bewegungsmelder, Außensteckdosen', circuit: 'F9', cx: -9.5, cy: 1.3, w: 6, h: 2.6, ax: -8.4, ay: 0.9, az: 2.8, aw: 5.5, free: true },
];

interface Pose { pos: THREE.Vector3; target: THREE.Vector3; fov: number; }
interface Mat { m: THREE.MeshStandardMaterial; c: THREE.Color; }
interface RoomRt { info: RoomInfo; mats: Mat[]; glow: THREE.Mesh; hit: THREE.Mesh; lit: number; to: number; lamp: THREE.PointLight; glows?: THREE.Mesh[]; extraHits?: THREE.Mesh[]; emis?: number; ground?: boolean }

const RED: Record<string, number> = { loungeSofa: 0x2f6b78, rugRectangle: 0x3a4f63, bedDouble: 0x4d6a8f, chairCushion: 0x2f6b78, chairDesk: 0x2f6b78, sedan: 0x3d6fb0, bookcaseClosed: 0xb58a5a, cardboardBoxClosed: 0xb58a5a };
const DIM = new THREE.Color(0.02, 0.035, 0.08);
const WARM = new THREE.Color(1.0, 0.72, 0.4);
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!; const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,190,100,0.95)'); gr.addColorStop(0.5, 'rgba(255,150,60,0.28)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function aoTextures() {
  const mk = (draw: (g: CanvasRenderingContext2D) => void) => { const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d')!); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const edge = mk((g) => { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 0, 128, 128); g.globalCompositeOperation = 'destination-out'; const gr = g.createRadialGradient(64, 64, 20, 64, 64, 92); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
  const blob = mk((g) => { const gr = g.createRadialGradient(64, 64, 6, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
  return { edge, blob };
}

export interface Hero {
  setProgress(p: number): void;
  flyTo(id: RoomId | null): void;
  light(id: RoomId, on: boolean): void;
  onPick(cb: (id: RoomId | null) => void): void;
  onReady(cb: () => void): void;
  setPointer(x: number, y: number): void;
  resize(): void;
  destroy(): void;
  rooms: RoomInfo[];
  litIds(): RoomId[];
  skip(): void;
  info(): { calls: number; tris: number; geos: number; tex: number };
  project(id: RoomId): { x: number; y: number };
}

export async function createHero(canvas: HTMLCanvasElement, base: string, order: RoomId[]): Promise<Hero> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 200);

  scene.add(new THREE.HemisphereLight(0x8aa0d8, 0x232a3a, 1.15));
  const moon = new THREE.DirectionalLight(0xaec2ff, 1.1); moon.position.set(-10, 18, 14); scene.add(moon);

  const std = (hex: number, rough = 0.9) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0 });
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = scene) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m;
  };
  const rooms = new Map<RoomId, RoomRt>();
  const struct: Mat[] = [];
  const tex = glowTexture();
  const ao = aoTextures();
  const aoMat = (t: THREE.Texture) => new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
  const aoPlane = (w: number, h: number, t: THREE.Texture) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), aoMat(t)); m.renderOrder = 2; return m; };
  const loader = new GLTFLoader();
  const cache = new Map<string, THREE.Object3D>();
  const names = ['kitchenCabinetUpper', 'kitchenStoveElectric', 'kitchenSink', 'kitchenFridgeLarge', 'hoodModern', 'kitchenCoffeeMachine', 'table', 'chairCushion', 'bathtub', 'bathroomSink', 'toilet', 'bathroomMirror', 'showerRound', 'bedDouble', 'loungeSofa', 'washerDryerStacked', 'lampSquareCeiling', 'pottedPlant', 'rugRectangle', 'cabinetTelevision', 'desk', 'chairDesk', 'computerScreen', 'bookcaseClosed', 'cardboardBoxClosed', 'lampRoundFloor', 'kitchenCabinet', 'sedan'];
  await Promise.all(names.map((n) => loader.loadAsync(`${base}3d/${n === 'sedan' ? 'car/' : ''}${n}.glb`).then((g) => { cache.set(n, g.scene); })));

  // ---- Raum-Hilfen
  const mk = (id: RoomId) => {
    const info = ROOMS.find((r) => r.id === id)!;
    const g = new THREE.Group(); scene.add(g);
    const rt: RoomRt = { info, mats: [], glow: null as unknown as THREE.Mesh, hit: null as unknown as THREE.Mesh, lit: 0, to: 0, lamp: new THREE.PointLight(0xffb066, 0, 7, 1.6) };
    rooms.set(id, rt);
    return { g, rt };
  };
  const reg = (rt: RoomRt, o: THREE.Object3D) => {
    o.traverse((c) => {
      const m = c as THREE.Mesh; if (!m.isMesh) return;
      const arr = Array.isArray(m.material) ? m.material : [m.material];
      const out = arr.map((mm) => { const cl = (mm as THREE.MeshStandardMaterial).clone(); if (cl.map) cl.emissiveMap = cl.map; rt.mats.push({ m: cl, c: cl.color.clone() }); return cl; });
      m.material = Array.isArray(m.material) ? out : out[0];
    });
  };
  const roomBox = (rt: RoomRt, g: THREE.Group, w: number, h: number, d: number, hex: number, x: number, y: number, z: number) => {
    const m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.95 });
    rt.mats.push({ m, c: m.color.clone() });
    return box(w, h, d, m, x, y, z, g);
  };
  const put = (rt: RoomRt, g: THREE.Group, name: string, x: number, y: number, z: number, ry = 0, s = K) => {
    const src = cache.get(name)!; const o = src.clone(true);
    const bb = new THREE.Box3().setFromObject(o); const c = bb.getCenter(new THREE.Vector3());
    const pivot = new THREE.Group(); o.position.set(-c.x, -bb.min.y, -c.z); pivot.add(o);
    pivot.scale.setScalar(s); pivot.rotation.y = ry; pivot.position.set(x, y, z);
    const i0 = rt.mats.length; reg(rt, pivot); g.add(pivot);
    if (!/^(lamp|hood|bathroomMirror|kitchenCabinetUpper|computerScreen|kitchenCoffeeMachine|rug)/.test(name)) { const sz = new THREE.Vector3(); bb.getSize(sz); const b = aoPlane(Math.max(sz.x, 0.5) * s * 1.5, Math.max(sz.z, 0.5) * s * 1.5, ao.blob); b.rotation.x = -Math.PI / 2; b.position.set(x, y + 0.012, z); g.add(b); }
    const tint = RED[name];
    if (tint !== undefined) rt.mats.slice(i0).forEach(({ m, c }) => { if (c.r > c.g * 1.5 && c.r > c.b * 1.5) { m.color.setHex(tint); c.setHex(tint); } });
    return pivot;
  };
  const shell = (id: RoomId, rt: RoomRt, g: THREE.Group, level: number, wallHex: number, floorHex: number) => {
    const r = rt.info; const x0 = r.cx; const y0 = level + 0.15; const hgt = WALL_H - 0.3;
    roomBox(rt, g, r.w - 0.1, 0.06, 2 * D - 0.05, floorHex, x0, y0 + 0.03, 0);
    roomBox(rt, g, r.w - 0.1, hgt, 0.1, wallHex, x0, y0 + hgt / 2, -D + 0.05);
    roomBox(rt, g, 0.06, hgt, 2 * D - 0.05, wallHex, x0 - r.w / 2 + 0.135, y0 + hgt / 2, 0);
    roomBox(rt, g, 0.06, hgt, 2 * D - 0.05, wallHex, x0 + r.w / 2 - 0.135, y0 + hgt / 2, 0);
    roomBox(rt, g, r.w - 0.1, 0.05, 2 * D - 0.05, 0xa39b8a, x0, y0 + hgt - 0.02, 0);
    const aw = aoPlane(r.w - 0.1, hgt, ao.edge); aw.position.set(x0, y0 + hgt / 2, -D + 0.102); g.add(aw);
    const af = aoPlane(r.w - 0.1, 2 * D - 0.05, ao.edge); af.rotation.x = -Math.PI / 2; af.position.set(x0, y0 + 0.064, 0); g.add(af);
    const al = aoPlane(2 * D - 0.05, hgt, ao.edge); al.rotation.y = Math.PI / 2; al.position.set(x0 - r.w / 2 + 0.167, y0 + hgt / 2, 0); g.add(al);
    const ar = aoPlane(2 * D - 0.05, hgt, ao.edge); ar.rotation.y = -Math.PI / 2; ar.position.set(x0 + r.w / 2 - 0.167, y0 + hgt / 2, 0); g.add(ar);
    // Glow (Lichtkegel nach vorn) + Hit-Fläche
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(r.w * 1.35, r.h * 1.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.set(x0, y0 + hgt * 0.6, D + 0.4); glow.renderOrder = 5; scene.add(glow); rt.glow = glow;
    const hit = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.h), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(x0, y0 + hgt / 2, D); hit.userData.room = id; scene.add(hit); rt.hit = hit;
    rt.lamp.position.set(x0, y0 + hgt - 0.5, 0); g.add(rt.lamp);
  };

  // ---- Hülle
  const concrete = std(0x3b4350), concreteDark = std(0x2b313c), tile = std(0x2d2a31, 0.8), soil = std(0x3d2f27), soil2 = std(0x322720), grass = std(0x2a5236), base_ = std(0x1c2029);
  [concrete, concreteDark, tile, soil, soil2, grass, base_].forEach((m) => struct.push({ m, c: m.color.clone() }));
  const slab = (y: number) => box(2 * HW + 0.9, 0.3, 2 * D + 0.35, concrete, 0, y, 0.18);
  [LEVEL.keller - 0.15, 0, 3, 6].forEach((y) => slab(y));
  box(0.5, 9.3, 2 * D + 0.35, concrete, -HW - 0.2, 1.5 + 0.0, 0.18).scale.y = 1; // linke Außenwand (-3..6)
  box(0.5, 9.3, 2 * D + 0.35, concrete, HW + 0.2, 1.5, 0.18);
  box(2 * HW + 0.9, 9.3, 0.3, concrete, 0, 1.5, -D - 0.15);
  // Trennwände (Kern)
  [-2, 2].forEach((x) => { box(0.18, 2 * WALL_H - 0.3, 2 * D - 0.05, concreteDark, x, 3, 0); });
  // Dach: Rückgiebel + zwei Flächen
  const gable = new THREE.Shape(); gable.moveTo(-HW - 0.9, 6.15); gable.lineTo(HW + 0.9, 6.15); gable.lineTo(0, 9.4); gable.closePath();
  const gm = new THREE.Mesh(new THREE.ExtrudeGeometry(gable, { depth: 0.3, bevelEnabled: false }), concrete); gm.position.z = -D - 0.3; scene.add(gm);
  const slopeLen = Math.hypot(HW + 1.1, 3.25); const ang = Math.atan2(3.25, HW + 1.1);
  const mkSlope = (sign: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.28, 2 * D + 0.9), tile);
    m.position.set(sign * (HW + 1.1) / 2 - sign * 0.3, 6.15 + 1.62, 0.2); m.rotation.z = sign * -ang; scene.add(m); return m;
  };
  const sl = mkSlope(-1), sr = mkSlope(1);
  // PV auf rechter Fläche
  const pvMat = new THREE.MeshStandardMaterial({ color: 0x16335c, roughness: 0.35, metalness: 0.4 });
  const pvFrame = std(0x9aa4b4, 0.5);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
    const p = new THREE.Group(); const w = 1.9, h = 1.3;
    p.add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, h), pvFrame)); const cell = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.075, h - 0.1), pvMat); p.add(cell);
    p.position.set(0, 0.2, -3.2 + j * 1.52 + 0.3); p.position.x = 0.15 + i * 2.0 * 0; sr.add(p); p.position.x = -slopeLen / 2 + 1.1 + i * 2.0;
  }
  // Boden/Erdreich
  const soilBlock = (x: number) => { const s = Math.sign(x); const w = 9; box(w, 3, 2 * D + 0.35 + 5, soil, s * (HW + 0.45 + w / 2), -1.5, -2.2 + 0.18); box(w, 0.14, 2 * D + 0.35 + 5, grass, s * (HW + 0.45 + w / 2), 0.07, -2.2 + 0.18); box(w, 0.4, 2 * D + 0.35 + 5, soil2, s * (HW + 0.45 + w / 2), -2.7, -2.2 + 0.18); };
  soilBlock(-1); soilBlock(1);
  box(2 * HW + 0.9 + 2 * 9.45, 0.4, 2 * D + 0.35 + 5, base_, 0, -3.5, -2.2 + 0.18);
  // Bäume + Gartenlampen
  const leaf = std(0x1f5a3a, 0.9), trunk = std(0x3a2a20);
  const tree = (x: number, z: number, s: number) => { const t = new THREE.Group(); t.add(new THREE.Mesh(new THREE.CylinderGeometry(0.14 * s, 0.2 * s, 1.4 * s, 6), trunk)).position.y = 0.7 * s; const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1 * s, 0), leaf); c.position.y = 2.2 * s; t.add(c); t.position.set(x, 0.1, z); scene.add(t); };
  tree(-10.6, -1.5, 1.25); tree(-8.3, 1.8, 0.8); tree(10.9, -2, 1.35);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const post = (x: number, z: number) => { const p = new THREE.Group(); p.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), concreteDark)).position.y = 0.45; const b = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), lampMat); b.position.y = 1; p.add(b); p.position.set(x, 0.1, z); scene.add(p); };
  // ---- Räume
  const lampOf = (rt: RoomRt, g: THREE.Group, x: number) => { const l = put(rt, g, 'lampSquareCeiling', x, 3 * 0 + rt.info.cy - 1.5 + WALL_H - 0.33 - 0.23 * 2, 0, 0, K); return l; };
  const lvl = (id: RoomId) => rooms.get(id)!.info.cy - 1.5;
  // Küche
  {
    const { g, rt } = mk('kueche'); shell('kueche', rt, g, LEVEL.eg, 0xe6d6b8, 0xa87a4c); const y = 0.21;
    put(rt, g, 'kitchenFridgeLarge', -5.2, y, -2.85, 0); put(rt, g, 'kitchenSink', -3.84, y, -3.02, 0); put(rt, g, 'kitchenStoveElectric', -2.98, y, -3.02, 0);
    put(rt, g, 'hoodModern', -2.98, y + 1.75, -3.2, 0); put(rt, g, 'kitchenCabinetUpper', -3.84, y + 1.55, -3.2, 0); put(rt, g, 'kitchenCoffeeMachine', -3.5, y + 0.9, -3.1, 0.3);
    put(rt, g, 'table', -5.0, y, 0.2, 0); put(rt, g, 'chairCushion', -5.9, y, 0.3, Math.PI / 2); put(rt, g, 'chairCushion', -4.1, y, 0.3, -Math.PI / 2); put(rt, g, 'rugRectangle', -5.0, y, 0.3, 0, 2.6);
    put(rt, g, 'pottedPlant', -2.5, y, 1.9); lampOf(rt, g, -3.9);
  }
  // Wohnzimmer
  {
    const { g, rt } = mk('wohnen'); shell('wohnen', rt, g, LEVEL.eg, 0xd7c4a8, 0x9a6f45); const y = 0.21;
    put(rt, g, 'loungeSofa', 0, y, 0.3, Math.PI, 2.6); put(rt, g, 'cabinetTelevision', 0, y, -3.0, 0, K); put(rt, g, 'rugRectangle', 0, y, -0.8, 0, 3); put(rt, g, 'lampRoundFloor', 1.6, y, -2.6); lampOf(rt, g, 0);
  }
  // Garage
  {
    const { g, rt } = mk('garage'); shell('garage', rt, g, LEVEL.eg, 0x9aa0a8, 0x5a5f66); const y = 0.21;
    put(rt, g, 'sedan', 3.6, y, -1.3, Math.PI * 0.0, 1.7);
    const wb = new THREE.Group(); const body = new THREE.MeshStandardMaterial({ color: 0xf1f3f6, roughness: 0.4 }); rt.mats.push({ m: body, c: body.color.clone() });
    const led = new THREE.MeshBasicMaterial({ color: 0x45e08a });
    wb.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.14), body)); const ls = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.02), led); ls.position.set(0, 0.12, 0.08); wb.add(ls);
    wb.position.set(5.5, 1.35, -D + 0.17); g.add(wb); (rt as any).led = ls;
    put(rt, g, 'cardboardBoxClosed', 2.7, y, -2.9, 0.4, K); lampOf(rt, g, 4);
  }
  // Bad
  {
    const { g, rt } = mk('bad'); shell('bad', rt, g, LEVEL.og, 0xcfd9de, 0x7d8a93); const y = 3.21;
    put(rt, g, 'bathtub', -4.6, y, -2.85, 0, 2); put(rt, g, 'bathroomSink', -2.7, y, -3.1, 0, 2); put(rt, g, 'bathroomMirror', -2.7, y + 1.6, -3.38, 0, 2);
    put(rt, g, 'toilet', -2.8, y, 0.6, -Math.PI / 2, 1.0); lampOf(rt, g, -4);
  }
  // Schlafzimmer
  { const { g, rt } = mk('schlaf'); shell('schlaf', rt, g, LEVEL.og, 0xcdb9d0, 0x946f4c); put(rt, g, 'bedDouble', 0, 3.21, -1.6, 0, 2); put(rt, g, 'rugRectangle', 0, 3.21, 0.4, 0, 3); lampOf(rt, g, 0); }
  // Büro
  { const { g, rt } = mk('buero'); shell('buero', rt, g, LEVEL.og, 0xcfd3d9, 0x6e6a66); const y = 3.21; put(rt, g, 'desk', 4, y, -2.7, 0, 2.2); put(rt, g, 'computerScreen', 4.1, y + 0.9, -2.9, 0, 2); put(rt, g, 'chairDesk', 4.1, y, -1.6, Math.PI, 2); put(rt, g, 'bookcaseClosed', 5.4, y, -2.6, 0, 2); lampOf(rt, g, 4); }
  // Keller
  { const { g, rt } = mk('keller'); shell('keller', rt, g, LEVEL.keller, 0x8d939c, 0x575b61); const y = -2.79; put(rt, g, 'washerDryerStacked', -4.8, y, -2.9, 0, 2); put(rt, g, 'cardboardBoxClosed', 4.6, y, -2.6, 0.2, 2); put(rt, g, 'cardboardBoxClosed', 5.3, y, -1.8, -0.3, 2);
    // Zählerschrank (Primitive) an der Rückwand
    const zs = new THREE.Group(); const sm = new THREE.MeshStandardMaterial({ color: 0xb9bfc8, roughness: 0.5 }); rt.mats.push({ m: sm, c: sm.color.clone() });
    zs.add(new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.9, 0.22), sm)); const dm = new THREE.MeshBasicMaterial({ color: 0x1c2330 }); const dp = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.7, 0.02), dm); dp.position.z = 0.12; zs.add(dp);
    zs.position.set(0.6, -1.5, -D + 0.2); g.add(zs); lampOf(rt, g, 0); lampOf(rt, g, -3.5); lampOf(rt, g, 3.5); }
  // Dach (Spitzboden): Wechselrichter + Speicher, PV-Module leuchten mit
  {
    const { g, rt } = mk('dach'); const r = rt.info;
    const tri = new THREE.Shape(); tri.moveTo(-5.5, 6.3); tri.lineTo(5.5, 6.3); tri.lineTo(0, 8.8); tri.closePath();
    const am = new THREE.MeshStandardMaterial({ color: 0xb9a98f, roughness: 0.95 }); rt.mats.push({ m: am, c: am.color.clone() });
    const ap = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.05, bevelEnabled: false }), am); ap.position.z = -D + 0.05; g.add(ap);
    const im = new THREE.MeshStandardMaterial({ color: 0xe9ecf1, roughness: 0.45 }); rt.mats.push({ m: im, c: im.color.clone() });
    box(0.8, 1.0, 0.28, im, -1.6, 6.3 + 0.5, -D + 0.25, g); box(1.0, 1.55, 0.5, im, 0.1, 6.3 + 0.78, -D + 0.34, g);
    const led = new THREE.MeshBasicMaterial({ color: 0x45e08a }); const ls = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.02), led); ls.position.set(0.1, 6.3 + 1.2, -D + 0.6); g.add(ls); (rt as any).led = ls;
    rt.mats.push({ m: pvMat, c: pvMat.color.clone() });
    put(rt, g, 'lampSquareCeiling', 0, 8.55, 0.2, 0, K);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(r.w * 1.2, r.h * 1.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.set(0, 7.5, D + 0.4); glow.renderOrder = 5; scene.add(glow); rt.glow = glow;
    const hit = new THREE.Mesh(new THREE.PlaneGeometry(9, 3), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(0, 7.5, D); hit.userData.room = 'dach'; scene.add(hit); rt.hit = hit;
  }
  // Garten: vier Wegeleuchten, Lichtflecken auf dem Rasen
  {
    const { g, rt } = mk('garten'); rt.ground = true; rt.emis = 1.3; rt.glows = []; rt.extraHits = [];
    const pole = std(0x2b313c); rt.mats.push({ m: pole, c: pole.color.clone() });
    const bulb = new THREE.MeshStandardMaterial({ color: 0xffe2b0, roughness: 0.5 }); rt.mats.push({ m: bulb, c: bulb.color.clone() });
    [[-7.4, 2.8], [7.8, 2.8], [-9.2, 3.2], [-8.4, 0.6], [9.6, 0.8]].forEach(([x, z], n) => {
      const p = new THREE.Group(); p.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), pole)).position.y = 0.45;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), bulb); b.position.y = 1; p.add(b); p.position.set(x, 0.1, z); g.add(p);
      const gp = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      gp.rotation.x = -Math.PI / 2; gp.position.set(x, 0.16, z); gp.renderOrder = 4; g.add(gp); rt.glows!.push(gp); if (n === 0) rt.glow = gp;
    });
    const mkHit = (x: number) => { const h = new THREE.Mesh(new THREE.PlaneGeometry(5.9, 2.8), new THREE.MeshBasicMaterial({ visible: false })); h.position.set(x, 1.4, 3.0); h.userData.room = 'garten'; scene.add(h); return h; };
    rt.hit = mkHit(-9.6); rt.extraHits.push(mkHit(9.6));
  }

  // ---- Kamera
  let aspect = 1;
  const fitBox = (w: number, h: number, fov: number, pad: number) => {
    const t = Math.tan((fov * Math.PI) / 360);
    return Math.max((h * pad) / 2 / t, (w * pad) / 2 / t / aspect);
  };
  const overview = (az: number, p = 0): Pose => {
    const fov = 30; const dist = fitBox(aspect < 0.8 ? 16.4 : 16, 13.4, fov, aspect < 0.8 ? 1.0 : 1.14) + 2;
    const el = 0.16; const ty = 2.7 + (aspect < 0.8 ? Math.min(4.2, (0.8 - aspect) * 11) * (1 - smooth(0, 0.08, p)) : 0); const target = new THREE.Vector3(0, ty, 0);
    const pos = new THREE.Vector3(Math.sin(az) * dist * Math.cos(el), ty + Math.sin(el) * dist + 0.9, Math.cos(az) * dist * Math.cos(el));
    return { pos, target, fov };
  };
  const roomPose = (r: RoomInfo): Pose => {
    // Kamera hält vor einem festen Punkt des Raums (Anker); Breite aw wird ins Bild gepasst
    const fov = 36; const ax = r.ax ?? r.cx; const ay = r.ay ?? r.cy; const az = r.az ?? -2;
    const wFit = (r.aw ?? r.w) * (aspect < 0.8 ? 1 : 1.45);
    const dist = Math.max(fitBox(wFit, 0.1, fov, 1.0), 3.2);
    const dir = r.id === 'garage' ? 1 : ax > r.cx ? -1 : 1; const side = (aspect < 0.8 ? 0.5 : 1.0) * dir;
    const camX = r.free ? ax + side : Math.min(r.cx + r.w / 2 - 0.4, Math.max(r.cx - r.w / 2 + 0.4, ax + side));
    const por = aspect < 0.8; // Telefon: Karte liegt unten, Motiv in die obere Bildhälfte schieben
    return { pos: new THREE.Vector3(camX, ay + (por ? 0.85 : 0.35) + (r.id === 'dach' ? 2.2 : 0), Math.min(Math.max(az + dist, D - 0.1), D + 11)), target: new THREE.Vector3(ax, ay - (por ? 0.7 : 0), az), fov };
  };
  let progress = 0; let pointer = new THREE.Vector2(0, 0); let focus: RoomId | null = null; let fly = 0; let flyDir = 0; let dirty = true;
  const cur: Pose = overview(0);
  const apply = (p: Pose) => { camera.position.copy(p.pos); camera.fov = p.fov; camera.updateProjectionMatrix(); camera.lookAt(p.target); };
  const lerpPose = (a: Pose, b: Pose, t: number): Pose => {
    const e = ease(t); const pos = a.pos.clone().lerp(b.pos, e); pos.x += Math.sin(e * Math.PI) * 0.0; pos.y += Math.sin(e * Math.PI) * 0.35;
    return { pos, target: a.target.clone().lerp(b.target, e), fov: a.fov + (b.fov - a.fov) * e };
  };
  const basePose = () => { const o = overview(-0.2 + progress * 0.4 + pointer.x * 0.04, progress); o.pos.y += pointer.y * -0.2; return o; };

  const cbs: { pick?: (id: RoomId | null) => void; ready?: () => void } = {};
  const raycaster = new THREE.Raycaster();
  const hits = [...rooms.values()].flatMap((r) => [r.hit, ...(r.extraHits ?? [])]);

  const setRoomLit = (id: RoomId, on: boolean) => { const r = rooms.get(id); if (!r) return; r.to = on ? 1 : 0; dirty = true; };
  const tickLights = (dt: number) => {
    const fd = smooth(0, 0.7, fly);
    struct.forEach(({ m, c }) => m.color.copy(c).multiplyScalar(1 - 0.78 * fd));
    rooms.forEach((r) => {
      if (Math.abs(r.lit - r.to) > 0.001) { r.lit += (r.to - r.lit) * Math.min(1, dt * 5); if (Math.abs(r.lit - r.to) < 0.004) r.lit = r.to; dirty = true; }
      const l = r.lit * (focus && focus !== r.info.id ? 1 - 0.92 * fd : 1);
      r.mats.forEach(({ m, c }) => {
        m.color.copy(c).multiplyScalar(0.2).add(DIM).lerp(c, l);
        m.emissive.copy(c).multiply(WARM).multiplyScalar((r.emis ?? 0.3) * l);
      });
      if (r.ground) r.glows!.forEach((m) => ((m.material as THREE.MeshBasicMaterial).opacity = 0.5 * l * (1 - 0.8 * smooth(0, 0.55, fly))));
      else (r.glow.material as THREE.MeshBasicMaterial).opacity = 0.34 * l * (1 - smooth(0, 0.55, fly));
      r.lamp.intensity = 0;
      const led = (r as any).led as THREE.Mesh | undefined; if (led) (led.material as THREE.MeshBasicMaterial).color.setHex(l > 0.5 ? 0x45e08a : 0x1d3a2b);
    });
  };

  let last = performance.now(); let raf = 0; let alive = true; let visible = true;
  const io = new IntersectionObserver((e) => { visible = e[0].isIntersecting; if (visible) { last = performance.now(); loop(); } }, { threshold: 0 });
  io.observe(canvas);
  const loop = () => {
    if (!alive || !visible) return;
    const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (flyDir !== 0) { fly = Math.min(1, Math.max(0, fly + (flyDir * dt) / 1.5)); dirty = true; if (fly === 1 || fly === 0) { if (fly === 0) focus = null; flyDir = 0; } }
    tickLights(dt);
    if (dirty) {
      const b = basePose();
      if (focus) { apply(lerpPose(b, roomPose(rooms.get(focus)!.info), fly)); } else apply(b);
      renderer.render(scene, camera); dirty = false;
    }
    raf = requestAnimationFrame(loop);
  };

  const resize = () => { const r = canvas.parentElement!.getBoundingClientRect(); const w = Math.max(1, Math.round(r.width)); const h = Math.max(1, Math.round(r.height)); aspect = w / h; camera.aspect = aspect; renderer.setSize(w, h, false); dirty = true; };
  resize();
  const ro = new ResizeObserver(resize); ro.observe(canvas.parentElement!);

  // Tippen
  const down = { x: 0, y: 0, t: 0 };
  canvas.addEventListener('pointerdown', (e) => { down.x = e.clientX; down.y = e.clientY; down.t = performance.now(); });
  canvas.addEventListener('pointerup', (e) => {
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10 || performance.now() - down.t > 600) return;
    const rc = canvas.getBoundingClientRect(); const nd = new THREE.Vector2(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
    raycaster.setFromCamera(nd, camera); const h = raycaster.intersectObjects(hits, false)[0];
    cbs.pick?.(h ? (h.object.userData.room as RoomId) : null);
  });

  const hero: Hero = {
    rooms: ROOMS,
    setProgress(p) {
      progress = p; dirty = true;
      const n = order.length;
      order.forEach((id, i) => { const on = p >= 0.12 + (i / n) * 0.7; if (!focus) setRoomLit(id, on); });
    },
    flyTo(id) { if (id) { focus = id; flyDir = 1; setRoomLit(id, true); } else if (focus) flyDir = -1; dirty = true; },
    light(id, on) { setRoomLit(id, on); },
    onPick(cb) { cbs.pick = cb; },
    onReady(cb) { cbs.ready = cb; cb(); },
    setPointer(x, y) { pointer.set(x, y); dirty = true; },
    resize,
    destroy() { alive = false; cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); renderer.dispose(); },
    project(id) { const r = rooms.get(id)!; const v = r.hit.position.clone().project(camera); const rc = canvas.getBoundingClientRect(); return { x: rc.left + ((v.x + 1) / 2) * rc.width, y: rc.top + ((1 - v.y) / 2) * rc.height }; },
    skip() { if (flyDir !== 0) { fly = flyDir > 0 ? 1 : 0; if (fly === 0) focus = null; flyDir = 0; } for (const r of rooms.values()) r.lit = r.to; dirty = true; },
    info() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures }; },
    litIds() { return [...rooms.values()].filter((r) => r.to > 0.5).map((r) => r.info.id); },
  };
  apply(basePose()); loop();
  return hero;
}
