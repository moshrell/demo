/**
 * 3D-Werkbank: rendert Bauteile aus model.ts (parametrische Geometrie, CC0-Holztexturen von Poly Haven).
 * Zwei Betriebsarten: 'assembly' (Montage nach Scroll-Fortschritt, Startseite) und 'konstruktor' (Teile kommen einzeln dazu).
 * Kamera nur über feste Blickpunkte + Drag in engen Grenzen (kein freies Drehen).
 */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, BoxGeometry, ExtrudeGeometry, CylinderGeometry, Shape,
  MeshStandardMaterial, Material, TextureLoader, Texture, RepeatWrapping, SRGBColorSpace, HemisphereLight, DirectionalLight,
  PlaneGeometry, CanvasTexture, MeshBasicMaterial, Raycaster, Vector2, Vector3, Color, PMREMGenerator, NeutralToneMapping,
  Points, BufferGeometry, Float32BufferAttribute, PointsMaterial, LineSegments, EdgesGeometry, LineBasicMaterial, BufferAttribute,
  ShadowMaterial, PCFShadowMap, Object3D,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { type Cfg, type Part, type Holz, buildParts, bounds, width, feldSpan, feldBase, hTop, farbeOf, T } from './model';

const S = 0.01;          // cm -> m
const TS = 0.9;          // Textur deckt 0,9 m ab
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

export type View = 'front' | 'links' | 'rechts' | 'oben' | 'ecke' | 'nah';
export interface SceneOpts {
  canvas: HTMLCanvasElement;
  base: string;
  mode: 'assembly' | 'konstruktor';
  lowPower?: boolean;
  noFx?: boolean;
  maxYaw?: number;
  onPick?: (feld: number) => void;
  onLand?: (part: Part) => void;
  onFrame?: () => void;
  onSlow?: () => void;
}
export interface WerkScene {
  setConfig(c: Cfg, animate: boolean): void;
  setProgress(p: number): void;
  setView(v: View): void;
  /** Kamera so setzen, dass die Möbel-Silhouette genau die Fläche f (Bruchteile 0..1 des Bildes) füllt, z. B. um sie mit einem Foto zur Deckung zu bringen */
  setFit(f: { x0: number; y0: number; x1: number; y1: number } | null): void;
  mark(feld: number | null): void;
  anchor(name: 'breite' | 'hoehe' | 'zinken' | 'duebel'): { x: number; y: number; visible: boolean } | null;
  resize(): void;
  dispose(): void;
  readonly progressMax: number;
}

/* ---------------------------------------------------------------- Geometrie */
function boxGeo(w: number, h: number, d: number, grain: 'x' | 'y' | 'z', seed: number) {
  const g = new BoxGeometry(w, h, d);
  const uv = g.attributes.uv as BufferAttribute;
  const faces: ['x' | 'y' | 'z', 'x' | 'y' | 'z', 'x' | 'y' | 'z'][] = [['z', 'y', 'x'], ['z', 'y', 'x'], ['x', 'z', 'y'], ['x', 'z', 'y'], ['x', 'y', 'z'], ['x', 'y', 'z']];
  const size = { x: w, y: h, z: d };
  const ox = (seed * 0.137) % 1, oy = (seed * 0.311) % 1;
  for (let f = 0; f < 6; f++) {
    const [ua, va, na] = faces[f];
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      let U = uv.getX(i) * size[ua], V = uv.getY(i) * size[va];
      if (grain === ua) [U, V] = [V, U];
      uv.setXY(i, U / TS + ox, V / TS + oy);
    }
    g.groups[f].materialIndex = na === grain ? 1 : 0;
  }
  return g;
}
function polyGeo(pts: [number, number][], depth: number, seed: number, bevel = 0) {
  const sh = new Shape(pts.map(([x, y]) => new Vector2(x * S, y * S)));
  const g = new ExtrudeGeometry(sh, bevel > 0
    ? { depth: Math.max(0.01, depth - 2 * bevel) * S, bevelEnabled: true, bevelSize: bevel * S, bevelThickness: bevel * S, bevelSegments: 1 }
    : { depth: depth * S, bevelEnabled: false });
  const uv = g.attributes.uv as BufferAttribute;
  const ox = (seed * 0.137) % 1, oy = (seed * 0.311) % 1;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / TS + ox, uv.getY(i) / TS + oy);
  return g;
}
const edgeMat = new LineBasicMaterial({ color: new Color('#33200f'), transparent: true, opacity: 0.3 });
const hash = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973; return h; };

function partMesh(p: Part, mats: Mats): Mesh {
  const seed = hash(p.id);
  let m: Mesh;
  const pair = (): Material[] => p.mat === 'end' ? [mats.end, mats.end] : p.mat === 'back' ? [mats.back, mats.end]
    : p.mat === 'dowel' ? [mats.dowel, mats.dowel] : p.mat === 'steel' ? [mats.steel, mats.steel]
    : p.mat === 'cushion' ? [mats.cushion, mats.cushion] : p.front || p.kind === 'knob' ? [mats.front, mats.frontEnd] : [mats.face, mats.end];
  if (p.box) {
    const b = p.box;
    m = new Mesh(boxGeo(b.w * S, b.h * S, b.d * S, p.grain, seed), pair());
    m.position.set(b.x * S, b.y * S, b.z * S);
    if (b.rz) m.rotation.z = (b.rz * Math.PI) / 180;
  } else if (p.poly) {
    m = new Mesh(polyGeo(p.poly.pts, p.poly.dz, seed), pair());
    m.position.set(0, 0, p.poly.z * S);
  } else if (p.polyXZ) {
    const bv = p.polyXZ.bevel || 0;
    m = new Mesh(polyGeo(p.polyXZ.pts.map(([x, z]) => [x, -z]), p.polyXZ.dy, seed, bv), pair());
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, (p.polyXZ.y + bv) * S, 0);
  } else {
    const c = p.cyl!;
    const g = new CylinderGeometry(c.r * S, c.r * S, c.len * S, 14);
    m = new Mesh(g, pair()[0]);
    m.position.set(c.x * S, c.y * S, c.z * S);
    if (c.axis === 'x') m.rotation.z = Math.PI / 2;
    if (c.axis === 'z') m.rotation.x = Math.PI / 2;
  }
  m.userData.part = p;
  m.userData.home = m.position.clone();
  if (p.kind !== 'dowel') { m.castShadow = true; m.receiveShadow = true; }
  if (!p.cyl && p.kind !== 'back' && p.kind !== 'zinke') {
    const e = new LineSegments(new EdgesGeometry(m.geometry, 28), edgeMat);
    m.add(e); m.userData.edges = e;
  }
  return m;
}

/* ---------------------------------------------------------------- Material */
interface Mats { face: MeshStandardMaterial; end: MeshStandardMaterial; front: MeshStandardMaterial; frontEnd: MeshStandardMaterial;
  back: MeshStandardMaterial; dowel: MeshStandardMaterial; steel: MeshStandardMaterial; cushion: MeshStandardMaterial }
const texCache = new Map<string, Promise<Texture>>();
const texAvg = new Map<Holz, number>();
function loadTex(base: string, holz: Holz, aniso: number) {
  const key = holz;
  if (!texCache.has(key)) {
    const name = { e: 'eiche', n: 'nussbaum', a: 'ahorn', k: 'kiefer' }[holz];
    texCache.set(key, new TextureLoader().loadAsync(`${base}tex/${name}.jpg`).then((t) => {
      t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace; t.anisotropy = aniso;
      try {
        const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d')!;
        x.drawImage(t.image as CanvasImageSource, 0, 0, 32, 32);
        const d = x.getImageData(0, 0, 32, 32).data; let sum = 0;
        const lin = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        for (let i = 0; i < d.length; i += 4) sum += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
        texAvg.set(holz, Math.max(0.02, sum / (d.length / 4)));
      } catch { /* Standardwert */ }
      return t;
    }));
  }
  return texCache.get(key)!;
}
const FALLBACK: Record<Holz, string> = { e: '#c49e70', n: '#6c4a32', a: '#e8d6b6', k: '#dcb47c' };

/* ------------------------------------------------------------------ Szene */
export async function createScene(o: SceneOpts): Promise<WerkScene> {
  const renderer = new WebGLRenderer({ canvas: o.canvas, antialias: !o.lowPower, alpha: true, powerPreference: 'default' });
  let dpr = Math.min(window.devicePixelRatio || 1, o.lowPower ? 1.5 : 2);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.3;
  pmrem.dispose();
  scene.add(new HemisphereLight(0xfff4e6, 0x9a8f80, 0.8));
  const sun = new DirectionalLight(0xfff0dc, 2.7);
  sun.position.set(-2.6, 3.6, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(o.lowPower ? 512 : 1024, o.lowPower ? 512 : 1024);
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.004; sun.shadow.radius = 3;
  scene.add(sun); scene.add(sun.target);
  const fill = new DirectionalLight(0xdbe6ff, 0.55);
  fill.position.set(3.2, 1.6, 2.4);
  scene.add(fill);

  const camera = new PerspectiveCamera(30, 1, 0.05, 40);
  const root = new Group();
  scene.add(root);

  // "eingebackener" Schatten: Ebene mit radialem Verlauf
  const sc = document.createElement('canvas'); sc.width = sc.height = 128;
  const sx = sc.getContext('2d')!; const gr = sx.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(40,36,34,0.34)'); gr.addColorStop(0.55, 'rgba(40,36,34,0.12)'); gr.addColorStop(1, 'rgba(40,36,34,0)');
  sx.fillStyle = gr; sx.fillRect(0, 0, 128, 128);
  const shadow = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: new CanvasTexture(sc), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.001;
  root.add(shadow);
  const ground = new Mesh(new PlaneGeometry(8, 8), new ShadowMaterial({ opacity: 0.24 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0.0008; ground.receiveShadow = true;
  root.add(ground);

  const aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  // Holzmaserung: Kontrast anheben, bei Beize Farbe über die Helligkeit der Maserung legen
  const U = { uAvg: { value: 0.3 }, uContrast: { value: 1.55 }, uMono: { value: 0 } };
  const mk = (p: Partial<MeshStandardMaterial>, wood = false) => {
    const m = new MeshStandardMaterial({ roughness: 0.62, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    Object.assign(m, p);
    if (wood) {
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uAvg = U.uAvg; sh.uniforms.uContrast = U.uContrast; sh.uniforms.uMono = U.uMono;
        sh.fragmentShader = 'uniform float uAvg; uniform float uContrast; uniform float uMono;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
          #ifdef USE_MAP
            vec4 sc = texture2D( map, vMapUv );
            float l = max(dot(sc.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.002);
            float g = max((l - uAvg) * uContrast + uAvg, 0.015);
            diffuseColor.rgb *= mix(sc.rgb * (g / l), vec3(g / uAvg), uMono);
          #endif`);
      };
      m.customProgramCacheKey = () => 'wood-v1';
    }
    return m;
  };
  const mats: Mats = {
    face: mk({}, true), end: mk({}, true), front: mk({}, true), frontEnd: mk({}, true), back: mk({}, true),
    dowel: mk({ color: new Color('#d9bf92'), roughness: 0.7 }),
    steel: mk({ color: new Color('#8a8d91'), roughness: 0.38, metalness: 0.85 }),
    cushion: mk({ color: new Color('#d8d1c2'), roughness: 0.95 }),
  };
  let cfg: Cfg | null = null;
  let texToken = 0;
  async function applyMaterials(c: Cfg) {
    const token = ++texToken;
    const fa = farbeOf(c);
    const stained = c.ober === 'b' && !!fa;
    const painted = c.ober === 'f' && !!fa;
    const paintAll = painted && (c.t === 't' || c.fk);
    const rough = c.ober === 'l' ? 0.3 : 0.62;
    const all = [mats.face, mats.end, mats.front, mats.frontEnd, mats.back];
    all.forEach((m) => { m.roughness = rough; });
    U.uMono.value = stained ? 1 : 0;
    const set = (m: MeshStandardMaterial, tex: Texture | null, col: Color, k = 1) => { m.map = tex; m.color.copy(col).multiplyScalar(k); };
    const wood = new Color(FALLBACK[c.holz]);
    const apply = (tex: Texture | null) => {
      const white = new Color('#ffffff');
      const tint = stained ? new Color(fa!.hex) : white;
      const base = tex ? tint : stained ? new Color(fa!.hex) : wood;
      // Korpus / sichtbare Holzflächen
      if (paintAll) {
        const pc = new Color(fa!.hex);
        set(mats.face, null, pc); set(mats.back, null, pc, 0.82); set(mats.end, null, pc, 0.9);
        mats.face.roughness = mats.end.roughness = mats.back.roughness = 0.5;
      } else {
        set(mats.face, tex, base); set(mats.back, tex, base, 0.78); set(mats.end, tex, base, 0.72);
      }
      // Fronten
      if (painted) {
        const pc = new Color(fa!.hex);
        set(mats.front, null, pc); set(mats.frontEnd, null, pc, 0.9);
        mats.front.roughness = mats.frontEnd.roughness = 0.5;
      } else { set(mats.front, tex, base); set(mats.frontEnd, tex, base, 0.72); }
      all.forEach((m) => { m.needsUpdate = true; });
    };
    apply(null); need();
    try {
      const tex = await loadTex(o.base, c.holz, aniso);
      if (token !== texToken) return;
      U.uAvg.value = texAvg.get(c.holz) ?? 0.3;
      apply(tex); need();
    } catch { /* Farbe reicht */ }
  }

  /* ------------------------------------------------------------ Kamera */
  const cam = { yaw: 0, pitch: 8, dist: 3, tx: 0, ty: 1, tz: 0 };
  const goal = { ...cam };
  let drag = 0, dragGoal = 0, dragP = 0, dragPGoal = 0;
  const maxYaw = o.maxYaw ?? (o.mode === 'konstruktor' ? 30 : 12);
  let view: View = 'front';
  let fit: { x0: number; y0: number; x1: number; y1: number } | null = null;
  let box = { x0: 0, x1: 1, y0: 0, y1: 1, z0: 0, z1: 0 };
  function frame(v: View) {
    const b = box, w = b.x1 - b.x0, h = b.y1 - b.y0;
    const aspect = renderer.domElement.clientWidth / Math.max(1, renderer.domElement.clientHeight);
    const vf = (camera.fov * Math.PI) / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
    const padH = o.mode === 'konstruktor' ? 1.22 : 1.3, padW = o.mode === 'konstruktor' ? 1.22 : 1.34;   // Assembly: Rand für Maßzahlen und Hinweis
    const distH = (h * padH) / 2 / Math.tan(vf / 2), distW = (w * padW) / 2 / Math.tan(hf / 2);
    goal.dist = Math.max(distH, distW) + (b.z1 - b.z0) * 0.6;
    goal.tx = 0; goal.ty = (b.y0 + b.y1) / 2; goal.tz = 0;
    const table = cfg?.t === 't';
    goal.yaw = v === 'links' ? -28 : v === 'rechts' ? 28 : v === 'ecke' ? -18 : v === 'nah' ? -12 : 0;
    goal.pitch = v === 'oben' ? (table ? 58 : 50) : v === 'ecke' ? 26 : v === 'nah' ? 12 : table ? 18 : v === 'front' ? 7 : 10;
    if (fit && v === 'front') {
      const fw = Math.max(0.05, fit.x1 - fit.x0), fh = Math.max(0.05, fit.y1 - fit.y0);
      const dH = h / (fh * 2 * Math.tan(vf / 2)), dW = w / (fw * 2 * Math.tan(hf / 2));
      goal.dist = (dH + dW) / 2 + b.z1; goal.pitch = 0; goal.yaw = 0;
    }
    if (v === 'oben') goal.dist *= table ? 1.0 : 1.12;
    if (v === 'ecke' && cfg) {
      if (table) { goal.tx = -w / 2 + w * 0.2; goal.ty = b.y1; goal.dist *= 0.5; }
      else { goal.tx = -w / 2 + 0.12; goal.ty = b.y1 - 0.15; goal.dist *= 0.42; }
    }
    if (v === 'nah' && cfg) {
      goal.dist *= 0.55;
      if (table) { goal.tx = -w * 0.25; goal.ty = b.y1 * 0.7; goal.yaw = 34; }
      else { goal.tx = -w * 0.12; goal.ty = b.y0 + h * 0.5; }
    }
  }
  /** Lens-Shift: Silhouette auf die Mitte der Fläche f schieben (Senkrechte bleiben senkrecht, wie bei einem Foto) */
  function applyOffset() {
    const W = el.clientWidth, H = el.clientHeight;
    if (fit && view === 'front' && W && H) camera.setViewOffset(W, H, -((fit.x0 + fit.x1) / 2 - 0.5) * W, -((fit.y0 + fit.y1) / 2 - 0.5) * H, W, H);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  function applyCam() {
    const yaw = ((cam.yaw + drag) * Math.PI) / 180, pitch = (Math.max(-4, Math.min(80, cam.pitch + dragP)) * Math.PI) / 180;
    camera.position.set(cam.tx + Math.sin(yaw) * Math.cos(pitch) * cam.dist, cam.ty + Math.sin(pitch) * cam.dist, cam.tz + Math.cos(yaw) * Math.cos(pitch) * cam.dist);
    camera.lookAt(cam.tx, cam.ty, cam.tz);
  }

  /* ------------------------------------------------------- Teile-Verwaltung */
  const meshes = new Map<string, Mesh>();
  const anims: { m: Mesh; t0: number; dur: number; from: Vector3; out?: boolean }[] = [];
  const picks: Mesh[] = [];
  const pickMat = new MeshBasicMaterial({ visible: false });
  let maxOrder = 1;
  const geoKey = (p: Part) => JSON.stringify(p.box || p.poly || p.polyXZ || p.cyl) + p.grain + (p.mat || '') + (p.front ? 'f' : '');

  function startOffset(p: Part): Vector3 {
    switch (p.kind) {
      case 'shelf': case 'drawer': case 'steel': return new Vector3(0, 0.02, 0.55);
      case 'door': case 'knob': return new Vector3(0, 0.05, 0.7);
      case 'back': return new Vector3(0, 0, -0.6);
      case 'dowel': return new Vector3(p.cyl && p.cyl.x < 50 ? -0.25 : 0.25, 0, 0);
      case 'leiste': return new Vector3(0, 0, 0.9);
      case 'leg': case 'rail': return new Vector3(0, -0.6, 0);
      case 'plinth': return new Vector3(0, 0, 0.5);
      default: return new Vector3(0, 0.55, 0.12);
    }
  }

  function clearPicks() { picks.forEach((m) => { root.remove(m); m.geometry.dispose(); }); picks.length = 0; }
  const fitSun = () => { const w = box.x1 - box.x0, h = box.y1 - box.y0, r = Math.max(w, h) * 0.75 + 0.3; const c = sun.shadow.camera; c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 0.5; c.far = 12; c.updateProjectionMatrix(); sun.target.position.set(0, h / 2, 0); sun.position.set(-2.6 - w * 0.2, 3.6 + h * 0.3, 3.2); };
  function buildPicks(c: Cfg, xoff: number) {
    clearPicks();
    if (c.t === 't') return;
    for (let i = 0; i < c.n; i++) {
      const [l, r] = feldSpan(c, i);
      const top = Math.max(hTop(c, l), hTop(c, r)), y0 = feldBase(c, i) - T;
      const m = new Mesh(new BoxGeometry((r - l) * S, (top - y0) * S, c.tf * S), pickMat);
      m.position.set(((l + r) / 2) * S + xoff, ((top + y0) / 2) * S, 0.01);
      m.userData.feld = i;
      root.add(m); picks.push(m);
    }
  }
  const content = new Group();
  root.add(content);

  // Markierung: Rahmen wie mit blauer Tinte
  const markMat = new LineBasicMaterial({ color: new Color('#1f4fa3'), transparent: true, opacity: 0 });
  let markLine: LineSegments | null = null, markT = 0;

  function setConfig(c: Cfg, animate: boolean) {
    const prevType = cfg?.t;
    const sameMat = cfg && cfg.holz === c.holz && cfg.ober === c.ober && cfg.farbe === c.farbe;
    cfg = JSON.parse(JSON.stringify(c));
    if (!sameMat) applyMaterials(c);
    const joints = o.mode === 'assembly';
    const parts = buildParts(c, joints);
    box = bounds(c);
    const xoff = c.t === 't' ? 0 : -width(c) / 2 * S;
    content.position.x = xoff;
    box = { x0: box.x0 * S + (c.t === 't' ? 0 : xoff), x1: box.x1 * S + (c.t === 't' ? 0 : xoff), y0: box.y0 * S, y1: box.y1 * S, z0: box.z0 * S, z1: box.z1 * S };
    const w = box.x1 - box.x0, d = box.z1 - box.z0;
    shadow.scale.set(w * 1.5 + 0.4, d * 2.2 + 0.4, 1);
    if (prevType !== c.t) { meshes.forEach((m) => dispose(m)); meshes.clear(); animate = false; }
    const seen = new Set<string>();
    const now = performance.now();
    let delay = 0;
    parts.forEach((p) => {
      seen.add(p.id);
      const ex = meshes.get(p.id);
      if (ex && ex.userData.key === geoKey(p)) return;
      if (ex) { content.remove(ex); killGeo(ex); }
      const m = partMesh(p, mats);
      m.userData.key = geoKey(p);
      content.add(m); meshes.set(p.id, m);
      if (o.mode === 'konstruktor' && animate && !ex) {
        const from = startOffset(p).multiplyScalar(0.6);
        m.position.add(from);
        anims.push({ m, t0: now + delay, dur: 300, from });
        delay += 22;
      }
    });
    meshes.forEach((m, id) => {
      if (seen.has(id)) return;
      meshes.delete(id);
      if (o.mode === 'konstruktor' && animate) anims.push({ m, t0: now, dur: 200, from: startOffset(m.userData.part).multiplyScalar(0.4), out: true });
      else dispose(m);
    });
    maxOrder = Math.max(1, ...parts.map((p) => p.order));
    buildPicks(c, xoff);
    fitSun();
    frame(view); applyOffset();
    if (!animate || prevType !== c.t) Object.assign(cam, goal);
    if (o.mode === 'assembly') setProgress(progress);
    need();
  }
  function killGeo(m: Mesh) { m.geometry.dispose(); (m.userData.edges as LineSegments | undefined)?.geometry.dispose(); }
  function dispose(m: Mesh) { content.remove(m); killGeo(m); if (m.userData.own) (m.material as Material[]).forEach((x) => x.dispose()); }

  /* ------------------------------------------ Montage nach Scroll (Startseite) */
  let progress = 1;
  const own = new WeakSet<Mesh>();
  function setProgress(p: number) {
    progress = clamp01(p);
    const span = 0.16;
    meshes.forEach((m) => {
      const part = m.userData.part as Part;
      const st = (part.order / (maxOrder + 1)) * (1 - span);
      const t = clamp01((progress - st) / span), e = ease(t);
      const off = startOffset(part);
      m.position.copy(m.userData.home).addScaledVector(off, 1 - e);
      const fading = t < 1;
      if (fading && !own.has(m)) {
        const arr = Array.isArray(m.material) ? m.material : [m.material];
        m.material = arr.map((x) => { const c = x.clone(); c.transparent = true; c.onBeforeCompile = x.onBeforeCompile; c.customProgramCacheKey = x.customProgramCacheKey; return c; }) as any;
        m.userData.own = true; own.add(m);
      }
      if (own.has(m)) {
        const arr = m.material as Material[];
        arr.forEach((x) => { x.opacity = Math.min(1, t * 2.2); x.transparent = t < 1; x.depthWrite = t > 0.45; });
      }
      m.visible = t > 0.001;
      // Dübel verschwinden im Holz, sobald das Brett sitzt
      if (part.kind === 'dowel') m.visible = t > 0.001 && progress < st + span * 3.2;
    });
    need();
  }
  // geklonte Materialien bei Holzwechsel nachziehen
  const syncOwn = () => meshes.forEach((m) => {
    if (!own.has(m)) return;
    const p = m.userData.part as Part;
    const base = partMesh(p, mats); const src = Array.isArray(base.material) ? base.material : [base.material];
    base.geometry.dispose(); (base.userData.edges as LineSegments | undefined)?.geometry.dispose();
    (m.material as Material[]).forEach((x, i) => { const s = src[i] as MeshStandardMaterial, d = x as MeshStandardMaterial; d.map = s.map; d.color.copy(s.color); d.roughness = s.roughness; d.needsUpdate = true; });
  });

  /* -------------------------------------------------------------- Späne */
  const chips: { pts: Points; v: Float32Array; t0: number }[] = [];
  const chipMat = new PointsMaterial({ color: new Color('#d6bd8e'), size: 0.012, transparent: true, depthWrite: false });
  function burst(at: Vector3) {
    if (o.lowPower || o.noFx) return;
    const n = 26, pos = new Float32Array(n * 3), v = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos.set([at.x, at.y, at.z], i * 3);
      v.set([(Math.random() - 0.5) * 0.9, Math.random() * 0.9 + 0.2, Math.random() * 0.7], i * 3);
    }
    const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    const pts = new Points(g, chipMat.clone()); scene.add(pts);
    chips.push({ pts, v, t0: performance.now() });
  }

  /* ------------------------------------------------------- Eingabe: Drag/Tap */
  const ray = new Raycaster();
  let down: { x: number; y: number; id: number; d0: number; p0: number; moved: boolean } | null = null;
  const maxPitch = o.mode === 'konstruktor' ? 22 : 9;
  const el = o.canvas;
  el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, id: e.pointerId, d0: dragGoal, p0: dragPGoal, moved: false }; });
  el.addEventListener('pointermove', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    // Konstruktor: Finger frei in beide Richtungen. Startseite: Touch scrollt die Seite senkrecht, nur Maus kippt auch.
    const tilt = o.mode === 'konstruktor' || e.pointerType === 'mouse';
    if (!down.moved && (Math.abs(dx) > 6 && (Math.abs(dx) > Math.abs(dy) || tilt) || (tilt && Math.abs(dy) > 6))) down.moved = true;
    if (down.moved) {
      dragGoal = Math.max(-maxYaw, Math.min(maxYaw, down.d0 + dx * 0.18));
      if (tilt) dragPGoal = Math.max(-maxPitch, Math.min(maxPitch, down.p0 + dy * 0.14));
      need();
    }
  });
  const up = (e: PointerEvent) => {
    if (!down) return;
    const tap = !down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8;
    down = null;
    if (o.mode === 'assembly') { dragGoal = 0; dragPGoal = 0; need(); }
    if (!tap || !o.onPick || !picks.length) return;
    const r = el.getBoundingClientRect();
    ray.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(picks, false)[0];
    if (hit) o.onPick(hit.object.userData.feld);
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', () => { down = null; if (o.mode === 'assembly') { dragGoal = 0; dragPGoal = 0; need(); } });

  /* ------------------------------------------------------------ Render-Loop */
  let needs = 2, raf = 0, alive = true;
  function need() { needs = Math.max(needs, 2); if (!raf && alive) raf = requestAnimationFrame(loop); }
  let slowT = 0, slowN = 0, last = performance.now();
  function loop(now: number) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    // Kamera weich nachführen
    const k = 1 - Math.pow(0.0015, dt);
    let moving = false;
    (['yaw', 'pitch', 'dist', 'tx', 'ty', 'tz'] as const).forEach((key) => {
      const dlt = goal[key] - cam[key]; if (Math.abs(dlt) > 1e-4) { cam[key] += dlt * k; moving = true; } else cam[key] = goal[key];
    });
    const dd = dragGoal - drag; if (Math.abs(dd) > 0.01) { drag += dd * Math.min(1, k * 1.6); moving = true; } else drag = dragGoal;
    const dp = dragPGoal - dragP; if (Math.abs(dp) > 0.01) { dragP += dp * Math.min(1, k * 1.6); moving = true; } else dragP = dragPGoal;
    // Teile einfliegen lassen
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i]; const t = clamp01((now - a.t0) / a.dur);
      if (now < a.t0) { moving = true; continue; }
      const home = a.m.userData.home as Vector3;
      if (a.out) {
        a.m.position.copy(home).addScaledVector(a.from, ease(t));
        a.m.scale.setScalar(1 - 0.6 * t);
        if (t >= 1) { dispose(a.m); anims.splice(i, 1); } else moving = true;
      } else {
        a.m.position.copy(home).addScaledVector(a.from, 1 - ease(t));
        if (t >= 1) {
          a.m.position.copy(home); anims.splice(i, 1);
          const p = a.m.userData.part as Part;
          if (['shelf', 'door', 'drawer', 'back', 'side', 'top'].includes(p.kind)) {
            const wp = new Vector3(); a.m.getWorldPosition(wp);
            if (p.poly) { const ys = p.poly.pts.map((q) => q[1]); const xs = p.poly.pts.map((q) => q[0]); wp.set(((Math.min(...xs) + Math.max(...xs)) / 2) * S + content.position.x, Math.min(...ys) * S, p.poly.z * S + 0.03); }
            burst(wp);
            o.onLand?.(p);
          }
        } else moving = true;
      }
    }
    for (let i = chips.length - 1; i >= 0; i--) {
      const c = chips[i]; const t = (now - c.t0) / 650;
      const pos = c.pts.geometry.attributes.position as BufferAttribute;
      for (let j = 0; j < pos.count; j++) {
        c.v[j * 3 + 1] -= 3.2 * dt;
        pos.setXYZ(j, pos.getX(j) + c.v[j * 3] * dt * 0.6, Math.max(0.002, pos.getY(j) + c.v[j * 3 + 1] * dt * 0.6), pos.getZ(j) + c.v[j * 3 + 2] * dt * 0.6);
      }
      pos.needsUpdate = true;
      (c.pts.material as PointsMaterial).opacity = 1 - t;
      if (t >= 1) { scene.remove(c.pts); c.pts.geometry.dispose(); (c.pts.material as Material).dispose(); chips.splice(i, 1); } else moving = true;
    }
    if (markLine) {
      const t = (now - markT) / 1400;
      markMat.opacity = t < 0.15 ? t / 0.15 : t < 0.8 ? 1 : Math.max(0, 1 - (t - 0.8) / 0.2);
      if (t >= 1) { root.remove(markLine); markLine.geometry.dispose(); markLine = null; } else moving = true;
    }
    applyCam();
    renderer.render(scene, camera);
    o.onFrame?.();
    // langsames Gerät erkennen
    if (moving || needs > 1) {
      if (dt > 0.04) slowN++; slowT += dt;
      if (slowT > 2) { if (slowN / Math.max(1, slowT * 60) > 0.5) degrade(); slowT = 0; slowN = 0; }
    }
    needs = Math.max(0, needs - 1);
    if ((moving || needs > 0) && alive) raf = requestAnimationFrame(loop);
  }
  let degraded = 0;
  function degrade() {
    if (degraded === 0 && dpr > 1) { dpr = 1; renderer.setPixelRatio(1); resize(); degraded = 1; }
    else if (degraded === 1) { degraded = 2; o.onSlow?.(); }
  }
  function resize() {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    frame(view); Object.assign(cam, { ...goal, yaw: cam.yaw, pitch: cam.pitch }); applyOffset();
    need();
  }
  const ro = new ResizeObserver(resize); ro.observe(el);
  resize();

  const api: WerkScene = {
    setConfig(c, animate) { const holzChange = cfg && (cfg.holz !== c.holz || cfg.ober !== c.ober || cfg.farbe !== c.farbe); setConfig(c, animate); if (holzChange) { setTimeout(() => { syncOwn(); need(); }, 0); texCache.get(c.holz)?.then(() => { syncOwn(); need(); }); } },
    setProgress,
    setView(v) { view = v; frame(v); applyOffset(); dragGoal = 0; dragPGoal = 0; need(); },
    setFit(f) { fit = f; frame(view); Object.assign(cam, { ...goal }); applyOffset(); need(); },
    mark(feld) {
      if (markLine) { root.remove(markLine); markLine.geometry.dispose(); markLine = null; }
      if (feld === null || !cfg || cfg.t === 't') return;
      const [l, r] = feldSpan(cfg, feld);
      const top = Math.min(hTop(cfg, l), hTop(cfg, r)) - T, y0 = feldBase(cfg, feld);
      const g = new EdgesGeometry(new BoxGeometry((r - l + 1.6) * S, (top - y0 + 1.6) * S, 0.001));
      markLine = new LineSegments(g, markMat);
      markLine.position.set(((l + r) / 2) * S + content.position.x, ((top + y0) / 2) * S, (cfg.tf / 2 + T + 0.6) * S);
      root.add(markLine); markT = performance.now(); need();
    },
    anchor(name) {
      if (!cfg) return null;
      const b = box; let v: Vector3;
      if (name === 'breite') v = new Vector3((b.x0 + b.x1) / 2, b.y1 + 0.05, b.z0);
      else if (name === 'hoehe') v = new Vector3(b.x0 - 0.06, (b.y0 + b.y1) / 2, b.z1);
      else if (name === 'zinken') v = new Vector3(b.x0 + 0.01, b.y1, 0);
      else {
        const m = [...meshes.values()].find((x) => (x.userData.part as Part).kind === 'dowel' && x.visible);
        if (!m) return { x: 0, y: 0, visible: false };
        v = new Vector3(); m.getWorldPosition(v);
      }
      v.project(camera);
      const r = el.getBoundingClientRect();
      return { x: (v.x * 0.5 + 0.5) * r.width, y: (-v.y * 0.5 + 0.5) * r.height, visible: v.z < 1 };
    },
    resize,
    dispose() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect();
      meshes.forEach((m) => dispose(m)); clearPicks(); env.dispose(); renderer.dispose();
    },
    get progressMax() { return maxOrder; },
  };
  return api;
}

/** WebGL verfügbar? (ohne Szene aufzubauen) */
export function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
