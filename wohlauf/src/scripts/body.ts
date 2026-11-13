// 3D-Figur: Körperregionen wählen. Modell: MakeHuman-Basisnetz (CC0), aufbereitet mit tools/prep-model.py.
// Gesteuert wird über die Liste (Knöpfe); die Figur zeigt die Region. Antippen der Figur wählt ebenfalls.
import {
  WebGLRenderer, Scene, PerspectiveCamera, BufferGeometry, BufferAttribute, Mesh, MeshStandardMaterial, Group,
  HemisphereLight, DirectionalLight, Vector3, Color, Raycaster, Vector2, SRGBColorSpace, ACESFilmicToneMapping,
} from 'three';

export type Zone = { id: string; view: 'front' | 'back'; r: number; caps: number[][] }; // caps: [ax,ay,az,bx,by,bz] je Kapsel (max. 2)
type Opts = { canvas: HTMLCanvasElement; model: string; zones: Zone[]; skin: string; hot: string; cloth: string; eye: string; onPick: (id: string) => void; onFrame: (project: (v: number[]) => [number, number, boolean]) => void; reduce: boolean };

export async function createBody(o: Opts) {
  const buf = await (await fetch(o.model)).arrayBuffer();
  const head = new Uint32Array(buf, 0, 2), nV = head[0], nI = head[1];
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(buf, 8, nV * 3), 3));
  geo.setAttribute('aAux', new BufferAttribute(new Float32Array(buf, 8 + nV * 12, nV * 2), 2)); // x: Relief-Schatten, y: Stoff (Abstand zum Saum)
  geo.setIndex(new BufferAttribute(new Uint16Array(buf, 8 + nV * 20, nI), 1));
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  const bb = geo.boundingBox!, midY = (bb.min.y + bb.max.y) / 2, H = bb.max.y - bb.min.y;

  const renderer = new WebGLRenderer({ canvas: o.canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const scene = new Scene();
  const cam = new PerspectiveCamera(24, 1, 1, 200);
  scene.add(new HemisphereLight(0xffffff, 0x2a323a, 1.15));
  const key = new DirectionalLight(0xfff4e6, 2.1); key.position.set(-14, 22, 26); scene.add(key);
  const rim = new DirectionalLight(0xbcd4ff, 1.1); rim.position.set(16, 8, -22); scene.add(rim);

  // Material: mattes Gipsweiß; die gewählte Region glüht warm (Abstand zu bis zu zwei Kapseln, im Modellraum)
  const U = { uA0: { value: new Vector3() }, uB0: { value: new Vector3() }, uA1: { value: new Vector3() }, uB1: { value: new Vector3() }, uR: { value: 1 }, uMix: { value: 0 }, uHot: { value: new Color(o.hot) }, uTwo: { value: 0 }, uCloth: { value: new Color(o.cloth) }, uEye: { value: new Color(o.eye) } };
  const mat = new MeshStandardMaterial({ color: new Color(o.skin), roughness: 0.66, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vModel; attribute vec2 aAux; varying vec2 vAux;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvModel = position; vAux = aAux;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vModel; varying vec2 vAux; uniform vec3 uA0, uB0, uA1, uB1, uHot, uCloth, uEye; uniform float uR, uMix, uTwo;
float capD(vec3 p, vec3 a, vec3 b) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0); return length(pa - ba * h); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= vAux.x;
float cl = smoothstep(-1.0, 1.0, vAux.y / max(fwidth(vAux.y), 1e-4));
diffuseColor.rgb = mix(diffuseColor.rgb, uCloth * (0.7 + 0.3 * vAux.x), cl);
if (vAux.y < -50.0) diffuseColor.rgb = uEye;
float zd = capD(vModel, uA0, uB0); if (uTwo > 0.5) zd = min(zd, capD(vModel, uA1, uB1));
float zg = (1.0 - smoothstep(uR * 0.3, uR, zd)) * uMix;
diffuseColor.rgb = mix(diffuseColor.rgb, uHot, zg * 0.92);`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uHot * zg * 0.38;\nfloat rimF = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), 3.0);\ntotalEmissiveRadiance += diffuseColor.rgb * rimF * 0.22 * (1.0 - cl);');
  };
  const mesh = new Mesh(geo, mat);
  mesh.position.y = -midY;
  const pivot = new Group(); pivot.add(mesh); scene.add(pivot);

  let yaw = 0, target = 0, mixT = 0, idle = !o.reduce, t0 = performance.now(), visible = true, dirty = true, raf = 0, sel: Zone | null = null, hover: Zone | null = null, dragging = false;
  const size = () => {
    const w = o.canvas.clientWidth, h = o.canvas.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.75 : 2));
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    // Abstand so, dass die ganze Figur mit Rand passt (Höhe oder Breite, je nachdem, was knapper ist)
    const fit = (H * 1.08) / 2 / Math.tan((cam.fov * Math.PI) / 360), fitW = (6.6 / 2 / Math.tan((cam.fov * Math.PI) / 360)) / cam.aspect;
    cam.position.set(0, 0, Math.max(fit, fitW)); cam.lookAt(0, 0, 0); cam.updateProjectionMatrix();
    dirty = true; loop();
  };
  const v3 = new Vector3();
  const project = (p: number[]): [number, number, boolean] => {
    v3.set(p[0], p[1] - midY, p[2]).applyAxisAngle(new Vector3(0, 1, 0), yaw);
    const facing = v3.z > -0.4;
    v3.project(cam);
    return [(v3.x * 0.5 + 0.5) * o.canvas.clientWidth, (-v3.y * 0.5 + 0.5) * o.canvas.clientHeight, facing];
  };
  const setZone = (z: Zone | null) => {
    if (!z) return;
    const c = z.caps;
    U.uA0.value.set(c[0][0], c[0][1], c[0][2]); U.uB0.value.set(c[0][3], c[0][4], c[0][5]);
    if (c[1]) { U.uA1.value.set(c[1][0], c[1][1], c[1][2]); U.uB1.value.set(c[1][3], c[1][4], c[1][5]); }
    U.uTwo.value = c[1] ? 1 : 0; U.uR.value = z.r;
  };
  function frame(now: number) {
    raf = 0;
    if (!visible) return;
    let moving = false;
    if (idle && !dragging) { target = Math.sin((now - t0) / 2600) * 0.3; moving = true; }
    const d = target - yaw;
    if (Math.abs(d) > 0.0008) { yaw += o.reduce ? d : d * 0.12; moving = true; } else yaw = target;
    const want = sel || hover ? (sel ? 1 : 0.45) : 0;
    if (Math.abs(want - mixT) > 0.004) { mixT += o.reduce ? want - mixT : (want - mixT) * 0.14; moving = true; } else mixT = want;
    U.uMix.value = mixT;
    pivot.rotation.y = yaw;
    renderer.render(scene, cam);
    o.onFrame(project);
    dirty = false;
    if (moving) loop();
  }
  function loop() { if (!raf) raf = requestAnimationFrame(frame); }

  // Drehen mit dem Finger (nur waagerecht, senkrecht scrollt die Seite), Antippen wählt die Region
  const ray = new Raycaster(), ndc = new Vector2();
  const zoneAt = (ev: PointerEvent): Zone | null => {
    const r = o.canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    const hit = ray.intersectObject(mesh, false)[0];
    if (!hit) return null;
    const p = mesh.worldToLocal(hit.point.clone());
    let best: Zone | null = null, bd = 1e9;
    for (const z of o.zones) for (const c of z.caps) {
      const a = new Vector3(c[0], c[1], c[2]), b = new Vector3(c[3], c[4], c[5]), ba = b.clone().sub(a), pa = p.clone().sub(a);
      const h = Math.min(1, Math.max(0, pa.dot(ba) / Math.max(ba.lengthSq(), 1e-5))), dist = pa.sub(ba.multiplyScalar(h)).length() / z.r;
      if (dist < bd) { bd = dist; best = z; }
    }
    return bd < 1.15 ? best : null;
  };
  let x0 = 0, yaw0 = 0, moved = 0;
  o.canvas.addEventListener('pointerdown', (e) => { dragging = true; idle = false; x0 = e.clientX; yaw0 = target = yaw; moved = 0; o.canvas.setPointerCapture?.(e.pointerId); });
  o.canvas.addEventListener('pointermove', (e) => {
    if (dragging) { moved = Math.max(moved, Math.abs(e.clientX - x0)); target = yaw0 + ((e.clientX - x0) / Math.max(160, o.canvas.clientWidth)) * Math.PI * 1.4; loop(); }
    else if (e.pointerType === 'mouse') { const z = zoneAt(e); if (z !== hover) { hover = z; if (!sel) setZone(z); o.canvas.style.cursor = z ? 'pointer' : 'grab'; loop(); } }
  });
  const up = (e: PointerEvent) => { if (!dragging) return; dragging = false; if (moved < 6) { const z = zoneAt(e); if (z) o.onPick(z.id); } };
  o.canvas.addEventListener('pointerup', up);
  o.canvas.addEventListener('pointercancel', () => { dragging = false; });
  o.canvas.addEventListener('pointerleave', () => { if (hover) { hover = null; if (sel) setZone(sel); loop(); } });

  new ResizeObserver(size).observe(o.canvas);
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) loop(); }).observe(o.canvas);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loop(); });
  renderer.compile(scene, cam);
  size();

  // nächstliegende volle Drehung zur gewünschten Ansicht, damit die Figur nicht zurückspult
  const face = (view: 'front' | 'back') => { const base = view === 'back' ? Math.PI : 0, k = Math.round((yaw - base) / (2 * Math.PI)); target = base + k * 2 * Math.PI; idle = false; loop(); };
  return {
    select(id: string | null) { sel = o.zones.find((z) => z.id === id) ?? null; if (sel) { setZone(sel); face(sel.view); } loop(); },
    face,
    isBack: () => Math.cos(target) < 0,
    setColors(skin: string, hot: string) { mat.color.set(skin); U.uHot.value.set(hot); loop(); },
    still(angle: number) { idle = false; yaw = target = angle; frame(performance.now()); },
  };
}
