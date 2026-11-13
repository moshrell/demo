// Heizungs-Baukasten (three.js): Heizungsraum in Isometrie, «weißer Ton» + Kupferrohre mit fließendem Wasser.
// Alles aus einfachen Körpern (Quader, Zylinder) gebaut, Maße sind Richtwerte. Wird nur geladen, wenn die Bühne sichtbar ist.
import {
  WebGLRenderer, Scene, OrthographicCamera, Group, Mesh, Box3, Vector3, Raycaster, Vector2, Object3D, Color,
  MeshStandardMaterial, MeshBasicMaterial, BoxGeometry, PlaneGeometry, CylinderGeometry, SphereGeometry, TorusGeometry,
  CanvasTexture, SRGBColorSpace, HemisphereLight, DirectionalLight, InstancedMesh, MathUtils, DynamicDrawUsage,
} from 'three';
import data from '../data/anlage.json';

export interface HeizState { anlage: string; speicher: string; zirk: string; abgleich: string }
export interface Handle {
  set(s: HeizState, changed?: string | null): void;
  project(zone: string): { x: number; y: number } | null;
  setActive(on: boolean): void;
  dispose(): void;
}
export interface Opts { base: string; reduced: boolean; onPick: (zone: string) => void }

const W = 3.8, D = 2.8, WALL_H = 2.5, PAD = 1.6;
const AZ = MathUtils.degToRad(34);
const EL = MathUtils.degToRad(32);

const M = {
  clay: new MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.9 }),
  slab: new MeshStandardMaterial({ color: 0xd9d4c9, roughness: 0.95 }),
  floor: new MeshStandardMaterial({ color: 0xe1e5e3, roughness: 0.95 }),
  wall: new MeshStandardMaterial({ color: 0xf6f8f7, roughness: 0.95 }),
  ground: new MeshStandardMaterial({ color: 0xbfcab5, roughness: 1 }),
  copper: new MeshStandardMaterial({ color: 0xc98446, roughness: 0.32, metalness: 0.7 }),
  ink: new MeshStandardMaterial({ color: 0x2b4552, roughness: 0.6 }),
  steel: new MeshStandardMaterial({ color: 0xcfd6d8, roughness: 0.45, metalness: 0.4 }),
  teal: new MeshStandardMaterial({ color: 0x35a9b5, roughness: 0.4 }),
  hot: new Color(0xff8a3d),
  cold: new Color(0x4fc3d0),
};

function blobTexture(): CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 6, 64, 64, 62);
  r.addColorStop(0, 'rgba(20,35,40,0.55)'); r.addColorStop(0.6, 'rgba(20,35,40,0.22)'); r.addColorStop(1, 'rgba(20,35,40,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
}

type P = [number, number, number];
interface Path { pts: Vector3[]; len: number[]; total: number; hot: boolean }

export async function createHeiz(canvas: HTMLCanvasElement, opts: Opts): Promise<Handle | null> {
  let renderer: WebGLRenderer;
  try { renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' }); }
  catch (e) { console.error('heiz3d: WebGL nicht verfügbar', e); return null; }
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  scene.add(new HemisphereLight(0xffffff, 0xe6ecec, 1.55));
  const sun = new DirectionalLight(0xfff2e0, 1.7); sun.position.set(3, 6, 5); scene.add(sun);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 60);
  const blob = blobTexture();

  const room = new Group(); const items = new Group(); scene.add(room, items);
  const groups: Record<string, Group> = {};
  const pick: Object3D[] = [];
  const paths: Path[] = [];
  let fan: Group | null = null;
  let state: HeizState = { ...(data.defaults as HeizState) };

  // ---- Bausteine ----
  const box = (w: number, h: number, d: number, mat: any, x = 0, y = 0, z = 0) => { const m = new Mesh(new BoxGeometry(w, h, d), mat); m.position.set(x, y + h / 2, z); return m; };
  const cyl = (r: number, h: number, mat: any, x = 0, y = 0, z = 0) => { const m = new Mesh(new CylinderGeometry(r, r, h, 20), mat); m.position.set(x, y + h / 2, z); return m; };
  function tube(a: P, b: P, r: number, mat: any): Mesh {
    const va = new Vector3(...a), vb = new Vector3(...b);
    const len = va.distanceTo(vb);
    const m = new Mesh(new CylinderGeometry(r, r, len, 12), mat);
    m.position.copy(va).add(vb).multiplyScalar(0.5);
    const axis = new Vector3(0, 1, 0), dir = vb.clone().sub(va).normalize();
    m.quaternion.setFromUnitVectors(axis, dir);
    return m;
  }
  function pipe(g: Group, pts: P[], r = 0.017, mat: any = M.copper, flow: 'hot' | 'cold' | null = null) {
    for (let i = 0; i < pts.length - 1; i++) g.add(tube(pts[i], pts[i + 1], r, mat));
    for (let i = 1; i < pts.length - 1; i++) { const s = new Mesh(new SphereGeometry(r, 10, 8), mat); s.position.set(...pts[i]); g.add(s); }
    if (flow) {
      const v = pts.map((p) => new Vector3(...p)); const len = [0]; for (let i = 1; i < v.length; i++) len.push(len[i - 1] + v[i].distanceTo(v[i - 1]));
      paths.push({ pts: v, len, total: len[len.length - 1], hot: flow === 'hot' });
    }
  }
  const shadow = (g: Group, x: number, z: number, w: number, d: number) => {
    const sh = new Mesh(new PlaneGeometry(w + 0.45, d + 0.45), new MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.set(x, 0.004, z); g.add(sh);
  };
  function tag(g: Group, zone: string) { g.userData.zone = zone; g.traverse((o) => { if ((o as Mesh).isMesh && (o as Mesh).material !== undefined && !((o as Mesh).geometry as any).type?.includes('Plane')) pick.push(o); }); }

  // ---- Teile ----
  function boiler(x: number): Group {
    const g = new Group();
    g.add(box(0.5, 0.8, 0.34, M.clay, x, 0.95, 0.17));
    g.add(box(0.2, 0.1, 0.02, M.ink, x, 1.5, 0.35));
    g.add(cyl(0.015, 0.02, M.teal, x + 0.12, 1.42, 0.35).rotateX(Math.PI / 2));
    for (const dx of [-0.15, -0.05, 0.05, 0.15]) g.add(cyl(0.017, 0.16, M.copper, x + dx, 0.8, 0.17));
    g.add(cyl(0.05, 0.75, M.steel, x - 0.1, 1.75, 0.17));
    g.add(cyl(0.065, 0.03, M.steel, x - 0.1, 2.4, 0.17));
    return g;
  }
  function wpIndoor(x: number): Group {
    const g = new Group();
    g.add(box(0.62, 1.55, 0.66, M.clay, x, 0, 0.36)); shadow(g, x, 0.36, 0.62, 0.66);
    g.add(box(0.26, 0.14, 0.02, M.ink, x, 1.15, 0.7));
    g.add(cyl(0.015, 0.02, M.teal, x + 0.18, 1.2, 0.7).rotateX(Math.PI / 2));
    for (let i = 0; i < 3; i++) g.add(box(0.4, 0.015, 0.012, M.ink, x, 0.5 + i * 0.07, 0.695));
    for (const dx of [-0.12, 0.12]) g.add(cyl(0.02, 0.22, M.copper, x + dx, 1.55, 0.36));
    return g;
  }
  function outdoor(): Group {
    const g = new Group(); const x = W + PAD * 0.55, z = 0.62;
    g.add(box(0.95, 0.78, 0.38, M.clay, x, 0.06, z)); shadow(g, x, z, 0.95, 0.38);
    const grille = new Mesh(new CylinderGeometry(0.29, 0.29, 0.03, 28), M.ink); grille.rotation.x = Math.PI / 2; grille.position.set(x, 0.45, z + 0.2); g.add(grille);
    fan = new Group(); fan.position.set(x, 0.45, z + 0.222);
    for (let i = 0; i < 4; i++) { const b = box(0.4, 0.07, 0.012, M.steel, 0, 0, 0); b.position.set(0, 0, 0); b.rotation.z = (i * Math.PI) / 4 + 0.2; fan.add(b); }
    g.add(fan);
    g.add(box(0.1, 0.4, 0.04, M.ink, x + 0.31, 0.2, z + 0.2));
    return g;
  }
  function speicher(): Group {
    const g = new Group(); const x = 0.5, z = 1.5;
    g.add(cyl(0.3, 1.5, M.clay, x, 0, z)); shadow(g, x, z, 0.62, 0.62);
    g.add(cyl(0.31, 0.06, M.ink, x, 1.5, z));
    for (const dx of [-0.1, 0.1]) g.add(cyl(0.017, 0.3, M.copper, x + dx, 1.56, z));
    g.add(cyl(0.017, 0.2, M.copper, x, 0.2, z - 0.3).rotateX(Math.PI / 2));
    return g;
  }
  function radiator(valves: boolean): Group {
    const g = new Group(); const rx = 2.95;
    for (let i = 0; i < 9; i++) g.add(box(0.07, 0.62, 0.1, M.clay, rx + i * 0.085, 0.38, 0.1));
    g.add(box(0.8, 0.04, 0.11, M.clay, rx + 0.34, 1.0, 0.1)); g.add(box(0.8, 0.04, 0.11, M.clay, rx + 0.34, 0.34, 0.1));
    for (const [vx, vy] of [[rx - 0.05, 0.12], [rx + 0.78, 0.12]] as const) {
      g.add(cyl(0.022, 0.26, M.copper, vx, vy, 0.1));
      g.add(box(0.07, 0.07, 0.07, M.copper, vx, vy + 0.26, 0.1));
      if (valves) { const t = new Mesh(new TorusGeometry(0.05, 0.012, 8, 20), M.teal); t.position.set(vx, vy + 0.31, 0.1); t.rotation.x = Math.PI / 2; t.userData.valve = true; g.add(t); }
    }
    return g;
  }

  function genX(): number { return state.anlage === 'gas' ? 0.8 : state.anlage === 'wp' ? 0.85 : 1.55; }

  function mount() {
    items.clear(); pick.length = 0; paths.length = 0; fan = null;
    for (const k of Object.keys(groups)) delete groups[k];
    for (const z of ['anlage', 'speicher', 'zirk', 'abgleich']) { const c = new Group(); groups[z] = c; items.add(c); }
    const gAn = groups.anlage;
    const ra = 2.95;
    if (state.anlage === 'gas' || state.anlage === 'hybrid') gAn.add(boiler(state.anlage === 'gas' ? 0.8 : 0.65));
    if (state.anlage === 'wp' || state.anlage === 'hybrid') { gAn.add(wpIndoor(genX())); gAn.add(outdoor()); }
    const gx = genX();
    // Außengerät → Innengerät (zwei isolierte Leitungen am Boden, mit Wasserfluss)
    if (state.anlage !== 'gas') {
      pipe(gAn, [[W + PAD * 0.55 - 0.15, 0.1, 0.9], [W + PAD * 0.55 - 0.15, 0.04, 1.05], [gx + 0.15, 0.04, 1.05], [gx + 0.15, 0.04, 0.7]], 0.026, M.steel, 'hot');
      pipe(gAn, [[W + PAD * 0.55 + 0.1, 0.1, 0.9], [W + PAD * 0.55 + 0.1, 0.07, 1.14], [gx + 0.25, 0.07, 1.14], [gx + 0.25, 0.07, 0.7]], 0.017, M.steel, 'cold');
    }
    // Vorlauf / Rücklauf zum Heizkörper
    const outY = state.anlage === 'gas' ? 0.8 : 1.55;
    const startX = state.anlage === 'gas' ? gx + 0.05 : gx - 0.12;
    pipe(gAn, [[startX, outY, 0.17], [startX, 0.14, 0.17], [ra - 0.05, 0.14, 0.17], [ra - 0.05, 0.3, 0.14]], 0.017, M.copper, 'hot');
    const startX2 = state.anlage === 'gas' ? gx + 0.15 : gx + 0.12;
    pipe(gAn, [[startX2, state.anlage === 'gas' ? 0.8 : 1.55, 0.17], [startX2, 0.08, 0.24], [ra + 0.78, 0.08, 0.24], [ra + 0.78, 0.3, 0.14]], 0.017, M.copper, 'cold');
    if (state.anlage === 'hybrid') pipe(gAn, [[0.65 + 0.05, 0.8, 0.17], [0.65 + 0.05, 0.14, 0.17], [gx - 0.12, 0.14, 0.17]], 0.017, M.copper, 'hot');
    tag(gAn, 'anlage');

    groups.abgleich.add(radiator(state.abgleich === 'ja')); tag(groups.abgleich, 'abgleich');

    if (state.speicher === 'ja') { groups.speicher.add(speicher()); tag(groups.speicher, 'speicher'); }
    if (state.zirk === 'ja') {
      const gz = groups.zirk;
      pipe(gz, [[0.5, 1.5, 1.2], [0.5, 1.7, 0.1], [2.5, 1.7, 0.08]], 0.011, M.copper, 'hot');
      gz.add(cyl(0.07, 0.16, M.ink, 1.4, 1.62, 0.1).rotateZ(Math.PI / 2));
      gz.add(cyl(0.012, 0.18, M.copper, 2.5, 1.55, 0.08));
      tag(gz, 'zirk');
    }
    for (const k of ['speicher', 'zirk', 'abgleich']) if (!groups[k].children.length) items.remove(groups[k]);
  }

  // ---- Raum ----
  function buildRoom() {
    room.clear();
    room.add(Object.assign(box(W + 0.1, 0.16, D + 0.1, M.slab, W / 2, -0.16, D / 2), {}));
    const floor = new Mesh(new PlaneGeometry(W, D), M.floor); floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0.001, D / 2);
    const pad = new Mesh(new BoxGeometry(PAD, 0.16, D), M.ground); pad.position.set(W + PAD / 2 + 0.05, -0.08, D / 2);
    const back = new Mesh(new BoxGeometry(W + 0.1, WALL_H, 0.1), M.wall); back.position.set(W / 2 - 0.05 + 0.05, WALL_H / 2, -0.05);
    const left = new Mesh(new BoxGeometry(0.1, WALL_H, D), M.wall); left.position.set(-0.05, WALL_H / 2, D / 2);
    room.add(floor, pad, back, left);
  }

  // ---- Kamera ----
  const cur = { cx: 0, cy: 0, half: 2, az: AZ }; const tgt = { cx: 0, cy: 0, half: 2 };
  let drag = 0, dragT = 0;
  const camTarget = new Vector3();
  function placeCamera(az: number) {
    camTarget.set((W + PAD) / 2, 0.8, D / 2);
    const dist = 30;
    camera.position.set(camTarget.x + Math.sin(az) * Math.cos(EL) * dist, camTarget.y + Math.sin(EL) * dist, camTarget.z + Math.cos(az) * Math.cos(EL) * dist);
    camera.lookAt(camTarget); camera.updateMatrixWorld(true);
  }
  const aspect = () => canvas.clientWidth / Math.max(1, canvas.clientHeight);
  function fitTargets() {
    placeCamera(AZ);
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (const x of [-0.1, W + PAD]) for (const y of [-0.16, WALL_H]) for (const z of [-0.1, D]) {
      const v = new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
      minx = Math.min(minx, v.x); maxx = Math.max(maxx, v.x); miny = Math.min(miny, v.y); maxy = Math.max(maxy, v.y);
    }
    const a = aspect();
    tgt.half = Math.max((maxy - miny) / 2, (maxx - minx) / 2 / a) * 1.05;
    tgt.cx = (minx + maxx) / 2; tgt.cy = (miny + maxy) / 2;
  }
  function applyCamera() {
    placeCamera(cur.az + drag);
    const a = aspect();
    camera.left = cur.cx - cur.half * a; camera.right = cur.cx + cur.half * a; camera.top = cur.cy + cur.half; camera.bottom = cur.cy - cur.half;
    camera.updateProjectionMatrix();
  }

  // ---- Wasserfluss ----
  const N = 70;
  const flow = new InstancedMesh(new SphereGeometry(0.042, 8, 6), new MeshBasicMaterial({ color: 0xffffff }), N);
  flow.instanceMatrix.setUsage(DynamicDrawUsage); flow.frustumCulled = false; scene.add(flow);
  const dummy = new Object3D(); const col = new Color();
  const slots: { p: number; off: number }[] = Array.from({ length: N }, (_, i) => ({ p: i, off: Math.random() }));
  function updateFlow(tm: number) {
    const n = paths.length;
    for (let i = 0; i < N; i++) {
      if (!n) { dummy.scale.setScalar(0); dummy.updateMatrix(); flow.setMatrixAt(i, dummy.matrix); continue; }
      const path = paths[i % n]; const per = Math.ceil(N / n);
      const k = Math.floor(i / n);
      const u = ((tm * 0.12 + k / per) % 1) * path.total;
      let seg = 1; while (seg < path.len.length - 1 && path.len[seg] < u) seg++;
      const a = path.pts[seg - 1], b = path.pts[seg]; const f = (u - path.len[seg - 1]) / Math.max(1e-6, path.len[seg] - path.len[seg - 1]);
      dummy.position.lerpVectors(a, b, MathUtils.clamp(f, 0, 1)); dummy.scale.setScalar(1); dummy.updateMatrix();
      flow.setMatrixAt(i, dummy.matrix); flow.setColorAt(i, col.copy(path.hot ? M.hot : M.cold));
    }
    flow.instanceMatrix.needsUpdate = true; if (flow.instanceColor) flow.instanceColor.needsUpdate = true;
  }

  // ---- Zustand ----
  let pop: { g: Group; t: number } | null = null;
  function set(s: HeizState, changed?: string | null) {
    state = { ...s };
    mount(); fitTargets();
    if (!ready) Object.assign(cur, { cx: tgt.cx, cy: tgt.cy, half: tgt.half });
    if (changed && groups[changed] && !opts.reduced) pop = { g: groups[changed], t: 0 };
    if (opts.reduced) { Object.assign(cur, { cx: tgt.cx, cy: tgt.cy, half: tgt.half }); updateFlow(0); }
    invalidate();
  }
  function project(zone: string) {
    const g = groups[zone]; if (!g) return null;
    const b = new Box3().setFromObject(g); if (b.isEmpty()) return null;
    const v = b.getCenter(new Vector3()); v.y = b.max.y; v.project(camera);
    return { x: (v.x * 0.5 + 0.5) * canvas.clientWidth, y: (-v.y * 0.5 + 0.5) * canvas.clientHeight };
  }

  // ---- Eingabe ----
  const ray = new Raycaster(); const ndc = new Vector2();
  let down: { x: number; y: number; t: number; moved: boolean } | null = null;
  canvas.style.touchAction = 'pan-y';
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false }; });
  canvas.addEventListener('pointermove', (e) => {
    if (!down) return; const dx = e.clientX - down.x;
    if (Math.abs(dx) > 6 || Math.abs(e.clientY - down.y) > 6) down.moved = true;
    if (down.moved && !opts.reduced) { dragT = MathUtils.clamp((dx / canvas.clientWidth) * MathUtils.degToRad(14), -MathUtils.degToRad(6), MathUtils.degToRad(6)); invalidate(); }
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const tap = !down.moved && performance.now() - down.t < 450; down = null; dragT = 0; invalidate();
    if (!tap) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    applyCamera(); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pick, false)[0]; if (!hit) return;
    let o: Object3D | null = hit.object; while (o && !o.userData.zone) o = o.parent;
    if (o?.userData.zone) opts.onPick(o.userData.zone as string);
  });
  canvas.addEventListener('pointercancel', () => { down = null; dragT = 0; invalidate(); });

  // ---- Schleife: Wasser fließt, Lüfter dreht (30 fps), nur sichtbar ----
  let ready = false, active = true, raf = 0, last = 0; const t0 = performance.now(); let needs = true;
  function invalidate() { needs = true; if (!raf && active) raf = requestAnimationFrame(frame); }
  function frame(now: number) {
    raf = 0;
    if (!active || document.hidden) return;
    const animate = !opts.reduced;
    if (animate && now - last < 30) { raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    const k = opts.reduced ? 1 : 1 - Math.exp(-dt * 7);
    for (const key of ['cx', 'cy', 'half'] as const) { const dd = tgt[key] - cur[key]; cur[key] = Math.abs(dd) > 1e-4 ? cur[key] + dd * k : tgt[key]; }
    const dd = dragT - drag; drag = Math.abs(dd) > 1e-4 ? drag + dd * (1 - Math.exp(-dt * 10)) : dragT;
    cur.az = AZ + (animate && !down ? Math.sin((now - t0) / 1000 * 0.4) * MathUtils.degToRad(2) : 0);
    applyCamera();
    if (animate) { updateFlow((now - t0) / 1000); if (fan) fan.rotation.z -= dt * 9; }
    if (pop) {
      pop.t += dt / 0.5; const t = Math.min(1, pop.t);
      const s = t < 1 ? 0.88 + 0.12 * (1 - Math.pow(1 - t, 3)) + Math.sin(t * Math.PI) * 0.05 : 1;
      pop.g.scale.setScalar(s); if (t >= 1) { pop.g.scale.setScalar(1); pop = null; }
    }
    renderer.render(scene, camera);
    needs = false;
    if (animate || pop) raf = requestAnimationFrame(frame);
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75)); renderer.setSize(w, h, false);
    fitTargets(); Object.assign(cur, { cx: tgt.cx, cy: tgt.cy, half: tgt.half }); invalidate();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas);
  const vis = () => { if (!document.hidden) invalidate(); };
  document.addEventListener('visibilitychange', vis);

  buildRoom(); set(state); resize(); ready = true; invalidate();
  return {
    set, project,
    setActive(on) { active = on; if (on) invalidate(); },
    dispose() { ro.disconnect(); document.removeEventListener('visibilitychange', vis); cancelAnimationFrame(raf); renderer.dispose(); },
  };
}
