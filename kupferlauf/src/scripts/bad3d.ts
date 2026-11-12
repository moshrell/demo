// Bad-Baukasten (three.js): Isometrie, «weißer Ton» + türkises Wasser + Kupfer-Armaturen.
// Wird nur geladen, wenn die Bühne sichtbar ist (baukasten.ts). Steuerung läuft über DOM-Knöpfe; das 3D ist die Ansicht dazu.
// Modelle: Kenney Furniture Kit (CC0), siehe public/models/LICENSE-kenney.txt. Ohne Echtzeit-Schatten (ein weicher Kontaktschatten je Teil).
import {
  WebGLRenderer, Scene, OrthographicCamera, Group, Mesh, Box3, Vector3, Raycaster, Vector2, Object3D,
  MeshStandardMaterial, MeshBasicMaterial, BoxGeometry, PlaneGeometry, CylinderGeometry, IcosahedronGeometry,
  CanvasTexture, RepeatWrapping, SRGBColorSpace, HemisphereLight, DirectionalLight, InstancedMesh, MathUtils, DynamicDrawUsage,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { layout, DIM, type Slot } from './bad-layout';
import data from '../data/bad.json';

export interface BadState { size: string; bf: boolean; wanne: string; waschen: string; wc: string; spiegel: string; fliese: string }
export interface Handle {
  set(s: BadState, changed?: string | null): void;
  focus(zone: string | null): void;
  project(zone: string): { x: number; y: number } | null;
  setActive(on: boolean): void;
  dispose(): void;
}
export interface Opts { base: string; hero: boolean; reduced: boolean; onPick: (zone: string) => void }

// Modell zeigt mit seiner Rückseite in -z (Rückseite zur Wand). Falls ein Modell falsch herum steht: hier true setzen.
const FLIP: Record<string, boolean> = { wanne: false, dusche: false, becken: false, tisch: false, stand: false, spiegel: false };

const FILES: Record<string, string> = { wanne: 'wanne.glb', dusche: 'duschkabine.glb', becken: 'waschbecken.glb', tisch: 'waschtisch.glb', stand: 'wc.glb', spiegel: 'spiegel.glb' };

const TILES: Record<string, { floor: string; wall: string; grout: string; tone: number }> = {
  weiss: { floor: '#e6e9e8', wall: '#f1f3f2', grout: '#c9d1d1', tone: 0.025 },
  stein: { floor: '#8f8a82', wall: '#aaa59c', grout: '#7d7870', tone: 0.05 },
  salbei: { floor: '#92a592', wall: '#b3c4b1', grout: '#7f927f', tone: 0.045 },
};

const WALL_H = 2.5;
const AZ = MathUtils.degToRad(36);
const EL = MathUtils.degToRad(33);

// ---------- Materialien ----------
const M = {
  clay: new MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.92, metalness: 0 }),
  slab: new MeshStandardMaterial({ color: 0xd9d4c9, roughness: 0.95 }),
  copper: new MeshStandardMaterial({ color: 0xc98446, roughness: 0.32, metalness: 0.7 }),
  ink: new MeshStandardMaterial({ color: 0x2b4552, roughness: 0.6 }),
  oak: new MeshStandardMaterial({ color: 0xd9bd92, roughness: 0.8 }),
  glass: new MeshStandardMaterial({ color: 0x8fd3d6, roughness: 0.1, transparent: true, opacity: 0.32, depthWrite: false }),
  water: new MeshStandardMaterial({ color: 0x56c4cf, roughness: 0.15, transparent: true, opacity: 0.85 }),
  drop: new MeshBasicMaterial({ color: 0x66cdd6, transparent: true, opacity: 0.9 }),
  led: new MeshBasicMaterial({ color: 0xfff0c9 }),
};

function remap(m: any): any {
  const n = (m?.name || '') as string;
  if (n === 'metalLight') return M.copper;
  if (n === 'metalDark') return M.ink;
  if (n === 'glass') return M.glass;
  if (n === 'wood') return M.oak;
  return M.clay;
}

// ---------- Texturen ----------
function tileCanvas(base: string, grout: string, tone: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = grout; g.fillRect(0, 0, 512, 512);
  const N = 2, S = 512 / N, gap = 5;
  const rnd = mulberry(7);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const v = 1 + (rnd() - 0.5) * 2 * tone;
    g.fillStyle = shade(base, v);
    g.fillRect(i * S + gap / 2, j * S + gap / 2, S - gap, S - gap);
  }
  return c;
}
function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shade(hex: string, v: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (x: number) => Math.max(0, Math.min(255, Math.round(x * v)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function blobTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 6, 64, 64, 62);
  r.addColorStop(0, 'rgba(20,35,40,0.55)'); r.addColorStop(0.6, 'rgba(20,35,40,0.22)'); r.addColorStop(1, 'rgba(20,35,40,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

// ---------- Hauptfunktion ----------
export async function createBad(canvas: HTMLCanvasElement, opts: Opts): Promise<Handle | null> {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (e) {
    console.error('bad3d: WebGL nicht verfügbar', e);
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  const maxDpr = opts.hero ? 1.75 : 2;
  const aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  const scene = new Scene();
  scene.add(new HemisphereLight(0xffffff, 0xe6ecec, 1.55));
  const sun = new DirectionalLight(0xfff2e0, 1.7);
  sun.position.set(3, 6, 5);
  scene.add(sun);

  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 60);

  // Modelle laden
  const loader = new GLTFLoader();
  const raw: Record<string, Object3D> = {};
  await Promise.all(Object.entries(FILES).map(async ([k, f]) => {
    const g = await loader.loadAsync(`${opts.base}models/${f}`);
    raw[k] = g.scene;
  }));

  const blob = blobTexture();
  const room = new Group();       // Wände, Boden
  const items = new Group();      // Teile
  scene.add(room, items);

  let state: BadState = { ...(data.defaults as BadState) };
  let roomDims = { w: 2.8, d: 2.8 };
  const groups: Record<string, Group> = {};
  const pick: Object3D[] = [];

  // ----- Teil bauen -----
  // Skaliert ein Modell auf Breite w × Tiefe d (Höhe proportional), setzt Unterkante auf y = 0 und Mitte auf (0,0).
  function fit(key: string, w: number, d: number, hMul = 1): Group {
    const src = raw[key].clone(true);
    src.traverse((o) => { const m = o as Mesh; if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map(remap) : remap(m.material); });
    const pre = new Group(); pre.add(src); pre.updateMatrixWorld(true);
    const b = new Box3().setFromObject(pre);
    const sz = b.getSize(new Vector3());
    const c = b.getCenter(new Vector3());
    src.position.set(-c.x, -b.min.y, -c.z);
    const sx = w / sz.x, sz2 = d / sz.z;
    const out = new Group(); out.add(src);
    out.scale.set(sx, ((sx + sz2) / 2) * hMul, sz2);
    out.userData.h = sz.y * ((sx + sz2) / 2) * hMul;
    return out;
  }
  function box(w: number, h: number, d: number, mat: any, x = 0, y = 0, z = 0): Mesh {
    const m = new Mesh(new BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    return m;
  }
  function cyl(r: number, h: number, mat: any, x = 0, y = 0, z = 0, rz = 0): Mesh {
    const m = new Mesh(new CylinderGeometry(r, r, h, 20), mat);
    m.position.set(x, y + h / 2, z);
    m.rotation.z = rz;
    return m;
  }

  // Einzelnes Teil (in lokalen Koordinaten: Rückseite zur Wand = -z, Mitte (0,0), Boden y = 0)
  function makePart(s: Slot): Group {
    const g = new Group();
    const flip = (k: string) => (FLIP[k] ? Math.PI : 0);
    if (s.kind === 'wanne') {
      const t = fit('wanne', DIM.wanne.w, DIM.wanne.d); t.rotation.y = flip('wanne'); g.add(t);
      const wat = new Mesh(new PlaneGeometry(DIM.wanne.w * 0.86, DIM.wanne.d * 0.62), M.water);
      wat.rotation.x = -Math.PI / 2; wat.position.set(0, t.userData.h * 0.78, 0.02); g.add(wat);
    } else if (s.kind === 'dusche') {
      const t = fit('dusche', DIM.dusche.w, DIM.dusche.d); t.rotation.y = flip('dusche'); g.add(t);
      g.add(box(DIM.dusche.w, 0.012, DIM.dusche.d, M.ink, 0, 0, 0));
    } else if (s.kind === 'becken') {
      const t = fit('becken', DIM.becken.w, DIM.becken.d); t.rotation.y = flip('becken'); g.add(t);
    } else if (s.kind === 'tisch' || s.kind === 'tisch2') {
      const n = s.kind === 'tisch2' ? 2 : 1;
      const cw = (s.w - (n - 1) * 0.02) / n;
      for (let i = 0; i < n; i++) {
        const x = -s.w / 2 + cw / 2 + i * (cw + 0.02);
        const t = fit('tisch', cw, DIM.tisch.d); t.rotation.y = flip('tisch'); t.position.x = x; g.add(t);
        const top = t.userData.h;
        const bowl = new Mesh(new CylinderGeometry(cw * 0.36, cw * 0.3, 0.07, 28), M.clay); bowl.position.set(x, top + 0.035, 0.04); g.add(bowl);
        const hole = new Mesh(new CylinderGeometry(cw * 0.27, cw * 0.27, 0.01, 28), M.ink); hole.position.set(x, top + 0.072, 0.04); g.add(hole);
        g.add(cyl(0.013, 0.17, M.copper, x, top + 0.07, -DIM.tisch.d / 2 + 0.07));
        g.add(cyl(0.011, 0.11, M.copper, x, top + 0.2, -DIM.tisch.d / 2 + 0.12, 0).rotateX(Math.PI / 2));
      }
    } else if (s.kind === 'stand' || s.kind === 'wand') {
      const wall = s.kind === 'wand';
      const vw = wall ? 0.16 : 0;
      const t = fit('stand', DIM.stand.w, DIM.stand.d); t.rotation.y = flip('stand');
      t.position.z = vw / 2;
      if (wall) { t.position.y = 0.22; g.add(box(DIM.wand.w + 0.06, 1.15, vw, M.clay, 0, 0, -DIM.wand.d / 2 + vw / 2)); }
      else if (state.bf) { t.position.y = 0.08; g.add(box(DIM.stand.w * 0.82, 0.08, DIM.stand.d * 0.8, M.clay, 0, 0, 0)); }
      g.add(t);
      if (state.bf) {
        for (const sx of [-1, 1]) {
          const bar = cyl(0.018, 0.5, M.copper, sx * (DIM.stand.w / 2 + 0.05), 0.78, -0.05, 0);
          bar.rotation.x = Math.PI / 2; bar.position.y = 0.78 + 0.25 * 0; bar.position.z = -DIM.stand.d / 2 + 0.25; g.add(bar);
        }
      }
    } else if (s.kind === 'spiegel') {
      const t = fit('spiegel', s.w, 0.1, 1); t.rotation.y = flip('spiegel'); g.add(t);
      if (state.spiegel === 'licht') {
        const led = box(s.w + 0.06, 0.03, 0.03, M.led, 0, t.userData.h + 0.0, -0.02); g.add(led);
        const led2 = box(s.w + 0.06, 0.03, 0.03, M.led, 0, -0.03, -0.02); g.add(led2);
      }
    }
    return g;
  }

  const wraps: Record<string, Group[]> = {};
  function mountParts() {
    items.clear(); pick.length = 0;
    for (const k of Object.keys(groups)) { delete groups[k]; delete wraps[k]; }
    for (const z of ['wanne', 'waschen', 'wc', 'spiegel']) { const c = new Group(); groups[z] = c; wraps[z] = []; items.add(c); }
    const slots = layout(roomDims, state);
    for (const s of slots) {
      const part = makePart(s);
      const wrap = new Group(); wrap.add(part);
      wrap.userData.zone = s.zone;
      const y = s.zone === 'spiegel' ? 1.15 : 0;
      if (s.wall === 'back') { wrap.position.set(s.along, y, s.d / 2); }
      else { wrap.rotation.y = Math.PI / 2; wrap.position.set(s.d / 2, y, s.along); }
      if (s.zone !== 'spiegel') {
        const sh = new Mesh(new PlaneGeometry((s.wall === 'back' ? s.w : s.d) + 0.45, (s.wall === 'back' ? s.d : s.w) + 0.45), new MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false }));
        sh.rotation.x = -Math.PI / 2; sh.position.set(s.wall === 'back' ? s.along : s.d / 2, 0.004, s.wall === 'back' ? s.d / 2 : s.along);
        items.add(sh);
      }
      groups[s.zone].add(wrap);
      wraps[s.zone].push(wrap);
      wrap.traverse((o) => { if ((o as Mesh).isMesh) pick.push(o); });
    }
    if (state.bf) items.add(cyl(0.018, 0.9, M.copper, 0.06, 0.55, 0.5));
  }

  // ----- Raum -----
  const floorMat = new MeshStandardMaterial({ roughness: 0.9 });
  const backMat = new MeshStandardMaterial({ roughness: 0.9 });
  const leftMat = new MeshStandardMaterial({ roughness: 0.9 });
  let floorMesh: Mesh, backMesh: Mesh, leftMesh: Mesh, slabMesh: Mesh;

  function tex(c: HTMLCanvasElement, rx: number, ry: number) {
    const t = new CanvasTexture(c);
    t.wrapS = t.wrapT = RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = SRGBColorSpace; t.anisotropy = aniso;
    return t;
  }
  function buildRoom() {
    room.clear();
    const { w, d } = roomDims;
    const tl = TILES[state.fliese] || TILES.weiss;
    const cf = tileCanvas(tl.floor, tl.grout, tl.tone), cw = tileCanvas(tl.wall, tl.grout, tl.tone);
    floorMat.map?.dispose(); backMat.map?.dispose(); leftMat.map?.dispose();
    floorMat.map = tex(cf, w / 1.2, d / 1.2);
    backMat.map = tex(cw, w / 1.2, WALL_H / 1.2);
    leftMat.map = tex(cw, d / 1.2, WALL_H / 1.2);
    [floorMat, backMat, leftMat].forEach((m) => (m.needsUpdate = true));
    slabMesh = new Mesh(new BoxGeometry(w + 0.1, 0.16, d + 0.1), M.slab); slabMesh.position.set(w / 2 - 0.05 + 0.05, -0.08, d / 2 + 0.05 - 0.05);
    floorMesh = new Mesh(new PlaneGeometry(w, d), floorMat); floorMesh.rotation.x = -Math.PI / 2; floorMesh.position.set(w / 2, 0.001, d / 2);
    backMesh = new Mesh(new BoxGeometry(w + 0.1, WALL_H, 0.1), [M.slab, M.slab, M.slab, M.slab, backMat, M.slab]); backMesh.position.set(w / 2 - 0.05, WALL_H / 2, -0.05);
    leftMesh = new Mesh(new BoxGeometry(0.1, WALL_H, d), [leftMat, M.slab, M.slab, M.slab, M.slab, M.slab]); leftMesh.position.set(-0.05, WALL_H / 2, d / 2);
    for (const m of [floorMesh, backMesh, leftMesh]) m.userData.zone = 'fliese';
    room.add(slabMesh, floorMesh, backMesh, leftMesh);
    pick.push(floorMesh, backMesh, leftMesh);
  }

  // ----- Kamera -----
  const cur = { cx: 0, cy: 0, half: 2, az: AZ };
  const tgt = { cx: 0, cy: 0, half: 2, az: AZ };
  let drag = 0;          // aktueller Parallax-Versatz (rad)
  let dragT = 0;
  let focusZone: string | null = null;
  const camTarget = new Vector3();

  function placeCamera(az: number) {
    const { w, d } = roomDims;
    camTarget.set(w / 2, 0.8, d / 2);
    const dist = 30;
    camera.position.set(camTarget.x + Math.sin(az) * Math.cos(EL) * dist, camTarget.y + Math.sin(EL) * dist, camTarget.z + Math.cos(az) * Math.cos(EL) * dist);
    camera.lookAt(camTarget);
    camera.updateMatrixWorld(true);
  }
  function viewBounds() {
    const { w, d } = roomDims;
    placeCamera(AZ);
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (const x of [-0.1, w]) for (const y of [-0.16, WALL_H]) for (const z of [-0.1, d]) {
      const v = new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
      minx = Math.min(minx, v.x); maxx = Math.max(maxx, v.x); miny = Math.min(miny, v.y); maxy = Math.max(maxy, v.y);
    }
    return { minx, maxx, miny, maxy };
  }
  function aspect() { return canvas.clientWidth / Math.max(1, canvas.clientHeight); }
  function fitTargets() {
    const b = viewBounds();
    const a = aspect();
    const half = Math.max((b.maxy - b.miny) / 2, (b.maxx - b.minx) / 2 / a) * (opts.hero ? 1.04 : 1.07);
    tgt.cx = (b.minx + b.maxx) / 2; tgt.cy = (b.miny + b.maxy) / 2; tgt.half = half;
    base.cx = tgt.cx; base.cy = tgt.cy; base.half = half;
    if (focusZone) applyFocus(focusZone);
  }
  const base = { cx: 0, cy: 0, half: 2 };
  function zoneCenterCam(zone: string): { x: number; y: number } | null {
    const g = groups[zone];
    if (!g) return null;
    const b = new Box3().setFromObject(g);
    if (b.isEmpty()) return null;
    placeCamera(AZ);
    const c = b.getCenter(new Vector3()).applyMatrix4(camera.matrixWorldInverse);
    return { x: c.x, y: c.y };
  }
  function applyFocus(zone: string) {
    const c = zoneCenterCam(zone);
    if (!c) return;
    tgt.half = base.half * 0.7;
    tgt.cx = base.cx + (c.x - base.cx) * 0.85; tgt.cy = base.cy + (c.y - base.cy) * 0.85;
  }
  function applyCamera() {
    placeCamera(cur.az + drag);
    const a = aspect();
    // Frustum-Mitte relativ zur Kamera: bei Azimut-Änderung bleibt (cx, cy) in Kamera-Koordinaten stehen (leichter Parallax-Effekt)
    camera.left = cur.cx - cur.half * a; camera.right = cur.cx + cur.half * a;
    camera.top = cur.cy + cur.half; camera.bottom = cur.cy - cur.half;
    camera.updateProjectionMatrix();
  }

  // ----- Spritzer + «Pop» -----
  const N = 40;
  const drops = new InstancedMesh(new IcosahedronGeometry(0.03, 0), M.drop, N);
  drops.instanceMatrix.setUsage(DynamicDrawUsage);
  drops.visible = false; drops.frustumCulled = false;
  scene.add(drops);
  const dp = Array.from({ length: N }, () => ({ p: new Vector3(), v: new Vector3(), life: 0 }));
  let splashT = 0;
  const dummy = new Object3D();
  let pop: { gs: Group[]; t: number } | null = null;
  function startSplash(zone: string) {
    const g = groups[zone];
    if (!g) return;
    const b = new Box3().setFromObject(g); const c = b.getCenter(new Vector3());
    const rnd = mulberry((Math.random() * 1e6) | 0);
    for (const q of dp) { q.p.set(c.x + (rnd() - 0.5) * 0.4, b.max.y * 0.8, c.z + (rnd() - 0.5) * 0.4); q.v.set((rnd() - 0.5) * 1.6, 1.5 + rnd() * 1.6, (rnd() - 0.5) * 1.6); q.life = 0.35 + rnd() * 0.25; }
    splashT = 0.6; drops.visible = true;
    pop = { gs: wraps[zone] || [], t: 0 };
  }

  // ----- Zustand setzen -----
  let sig = '';
  function set(s: BadState, changed?: string | null) {
    const prevSize = state.size;
    state = { ...s };
    const sz = data.sizes.find((x) => x.id === state.size) || data.sizes[1];
    roomDims = { w: sz.room.w, d: sz.room.d };
    const nsig = `${state.size}|${state.fliese}`;
    if (nsig !== sig) { sig = nsig; buildRoom(); }
    mountParts();
    fitTargets();
    if (prevSize !== state.size || !ready) { Object.assign(cur, { cx: tgt.cx, cy: tgt.cy, half: tgt.half }); }
    if (changed && changed !== 'size' && changed !== 'fliese' && changed !== 'bf' && !opts.reduced) startSplash(changed);
    if (opts.reduced) Object.assign(cur, { cx: tgt.cx, cy: tgt.cy, half: tgt.half });
    invalidate();
  }

  function focus(zone: string | null) {
    focusZone = zone;
    if (zone) applyFocus(zone);
    else { tgt.cx = base.cx; tgt.cy = base.cy; tgt.half = base.half; }
    if (opts.reduced) Object.assign(cur, { cx: tgt.cx, cy: tgt.cy, half: tgt.half });
    invalidate();
  }

  function project(zone: string) {
    const g = groups[zone];
    if (!g) return null;
    const b = new Box3().setFromObject(g);
    const v = b.getCenter(new Vector3()); v.y = b.max.y;
    v.project(camera);
    return { x: (v.x * 0.5 + 0.5) * canvas.clientWidth, y: (-v.y * 0.5 + 0.5) * canvas.clientHeight };
  }

  // ----- Eingabe -----
  const ray = new Raycaster();
  const ndc = new Vector2();
  let down: { x: number; y: number; t: number; moved: boolean } | null = null;
  canvas.style.touchAction = 'pan-y';
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false }; });
  canvas.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    if (Math.abs(dx) > 6 || Math.abs(e.clientY - down.y) > 6) down.moved = true;
    if (down.moved && !opts.reduced) { dragT = MathUtils.clamp((dx / canvas.clientWidth) * MathUtils.degToRad(14), -MathUtils.degToRad(6), MathUtils.degToRad(6)); invalidate(); }
  });
  const end = (e: PointerEvent) => {
    if (!down) return;
    const wasTap = !down.moved && performance.now() - down.t < 450;
    down = null; dragT = 0; invalidate();
    if (!wasTap) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    applyCamera();
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pick, false)[0];
    if (!hit) return;
    let o: Object3D | null = hit.object;
    while (o && !o.userData.zone) o = o.parent;
    if (o?.userData.zone) opts.onPick(o.userData.zone as string);
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', () => { down = null; dragT = 0; invalidate(); });

  // ----- Render-Schleife (nur bei Bedarf; im Hero ruhiges Schweben, 30 fps) -----
  let ready = false, active = true, raf = 0, last = 0, t0 = performance.now(), needs = true;
  function invalidate() { needs = true; if (!raf && active) raf = requestAnimationFrame(frame); }
  function frame(now: number) {
    raf = 0;
    if (!active || document.hidden) return;
    const sway = !opts.reduced && !down && !focusZone;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    if (sway && now - last < 30) { raf = requestAnimationFrame(frame); return; }
    last = now;
    const k = opts.reduced ? 1 : 1 - Math.exp(-dt * 7);
    let moving = false;
    for (const key of ['cx', 'cy', 'half'] as const) { const dd = tgt[key] - cur[key]; if (Math.abs(dd) > 1e-4) { cur[key] += dd * k; moving = true; } else cur[key] = tgt[key]; }
    const dd = dragT - drag; if (Math.abs(dd) > 1e-4) { drag += dd * (1 - Math.exp(-dt * 10)); moving = true; } else drag = dragT;
    const swayAz = sway ? Math.sin((now - t0) / 1000 * 0.4) * MathUtils.degToRad(2.2) : 0;
    cur.az = AZ + swayAz;
    applyCamera();
    if (splashT > 0) {
      splashT -= dt; moving = true;
      dp.forEach((q, i) => {
        q.life -= dt; q.v.y -= 6 * dt; q.p.addScaledVector(q.v, dt);
        dummy.position.copy(q.p); const s = Math.max(0, q.life * 2.2); dummy.scale.setScalar(s); dummy.updateMatrix(); drops.setMatrixAt(i, dummy.matrix);
      });
      drops.instanceMatrix.needsUpdate = true;
      if (splashT <= 0) drops.visible = false;
    }
    if (pop) {
      pop.t += dt / 0.5; const t = Math.min(1, pop.t);
      const s = t < 1 ? 0.82 + 0.18 * (1 - Math.pow(1 - t, 3)) + Math.sin(t * Math.PI) * 0.05 : 1;
      pop.gs.forEach((q) => q.scale.setScalar(s)); moving = true;
      if (t >= 1) { pop.gs.forEach((q) => q.scale.setScalar(1)); pop = null; }
    }
    renderer.render(scene, camera);
    if (moving || sway || needs) { needs = false; raf = (moving || sway) ? requestAnimationFrame(frame) : 0; }
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    renderer.setSize(w, h, false);
    fitTargets();
    Object.assign(cur, { cx: tgt.cx, cy: tgt.cy, half: tgt.half });
    invalidate();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const vis = () => { if (!document.hidden) invalidate(); };
  document.addEventListener('visibilitychange', vis);

  set(state);
  resize();
  ready = true;
  invalidate();

  return {
    set, focus, project,
    setActive(on) { active = on; if (on) invalidate(); },
    dispose() { ro.disconnect(); document.removeEventListener('visibilitychange', vis); cancelAnimationFrame(raf); renderer.dispose(); },
  };
}
