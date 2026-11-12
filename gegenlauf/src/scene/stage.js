// Сцена: машина в шоуруме, «рентген»-кузов, зоны, камера. Рендер только при изменении.
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {buildEnvironment, buildFloor, flakeNormalMap} from './studio.js';
import {buildChassis, ZONE_PARTS, ACCENT} from './chassis.js';

const A0 = 1.6;                 // соотношение сторон постера; уже него машина вписывается по ширине, шире — по высоте
const FOV = 26;
const D2R = Math.PI / 180;
const AMBER = new THREE.Color(ACCENT);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// ракурсы: az — азимут от носа (°), el — высота (°), r — полуширина кадра (м), t — точка взгляда
export const VIEWS = {
  hero:     {az: 34, el: 9, r: 2.2, t: [0, 0.56, 0]},
  xray:     {az: 38, el: 34, r: 2.55, rv: 1.85, t: [0, 0.35, 0]},
  motor:    {az: 150, el: 34, r: 0.95, t: [0, 0.42, -1.66]},
  getriebe: {az: 118, el: 42, r: 0.95, t: [0, 0.34, -1.05]},
  bremsen:  {az: 48, el: 44, r: 2.5, rv: 1.8, t: [0, 0.25, 0]},
  fahrwerk: {az: 32, el: 38, r: 2.5, rv: 1.8, t: [0, 0.3, 0]},
  abgas:    {az: 158, el: 15, r: 1.0, t: [0, 0.3, -1.9]},
  elektrik: {az: 24, el: 46, r: 2.45, rv: 1.85, t: [0, 0.3, 0]},
  scan:     {az: 58, el: 24, r: 2.6, rv: 1.75, t: [0, 0.45, 0]},
};

const ghostShader = (planes) => new THREE.ShaderMaterial({
  uniforms: {uColor: {value: new THREE.Color(0xdde6f0)}, uBase: {value: 0.05}, uRim: {value: 0.85}, uPow: {value: 2.0}, uOpacity: {value: 1}},
  vertexShader: `#include <common>
#include <clipping_planes_pars_vertex>
varying vec3 vN; varying vec3 vV;
void main(){ vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`,
  fragmentShader: `uniform vec3 uColor; uniform float uBase, uRim, uPow, uOpacity;
#include <clipping_planes_pars_fragment>
varying vec3 vN; varying vec3 vV;
void main(){
  #include <clipping_planes_fragment>
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float a = (uBase + uRim * pow(f, uPow)) * uOpacity;
  gl_FragColor = vec4(uColor * (0.75 + 0.5 * f), a);
}`,
  transparent: true, depthWrite: false, clipping: true, clippingPlanes: planes, side: THREE.FrontSide,
});

const sheetShader = () => new THREE.ShaderMaterial({
  uniforms: {uColor: {value: new THREE.Color(ACCENT)}, uOpacity: {value: 0}},
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
void main(){ vec2 d = min(vUv, 1.0 - vUv); float e = min(d.x * 1.5, d.y);
  float edge = smoothstep(0.035, 0.0, e) * smoothstep(0.0, 0.004, e);
  float fade = smoothstep(0.0, 0.12, vUv.y);
  gl_FragColor = vec4(uColor, (0.035 + edge * 0.85) * fade * uOpacity); }`,
  transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
});

export async function createStage(canvas, opts = {}) {
  const {modelUrl, dims, onProgress = () => {}, still = false} = opts;
  const coarse = opts.coarse ?? matchMedia('(pointer: coarse)').matches;
  const reduced = opts.reduced ?? matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: still});
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.localClippingEnabled = true;
  let maxPR = coarse ? 1.5 : 2;

  const scene = new THREE.Scene();
  scene.environment = buildEnvironment(renderer);
  scene.environmentIntensity = 1.0;
  const camera = new THREE.PerspectiveCamera(FOV, A0, 0.2, 60);

  // плоскости среза: «сканер» идёт от носа к корме; перед ним кузов уже стеклянный, за ним ещё в лаке
  const solidPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 9);
  const ghostPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -9);

  // ── модель ──
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await new Promise((res, rej) => loader.load(modelUrl, res, (e) => e.total && onProgress(0.9 * e.loaded / e.total), rej));
  const model = gltf.scene;
  const car = new THREE.Group(); car.name = 'car'; scene.add(car);             // всё, что поворачивается вместе
  const lift = new THREE.Group(); lift.name = 'lift'; car.add(lift);            // кузов, который приподнимается
  const G = Object.fromEntries(model.children.map((c) => [c.name, c]));
  for (const k of ['paint', 'glass', 'trim', 'lamps', 'interior', 'ghost']) if (G[k]) lift.add(G[k]);
  for (const k of ['wheels', 'ghostWheels', 'brakeF', 'brakeR', 'pipes']) if (G[k]) car.add(G[k]);

  const flakes = flakeNormalMap();
  const solidMats = new Set();
  const eachMesh = (g, fn) => g && g.traverse((o) => { if (o.isMesh) fn(o); });
  eachMesh(G.paint, (o) => {
    const src = o.material;
    o.material = new THREE.MeshPhysicalMaterial({name: 'lack', color: 0xb4b9bf, metalness: 0.88, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.035,
      aoMap: src.aoMap, aoMapIntensity: 1, normalMap: flakes, normalScale: new THREE.Vector2(0.06, 0.06), envMapIntensity: 1.15});
    src.dispose();
  });
  eachMesh(G.glass, (o) => { o.material = new THREE.MeshPhysicalMaterial({name: 'glas', color: 0x06090a, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.74, envMapIntensity: 1.5, depthWrite: false}); o.renderOrder = 1; });
  eachMesh(G.lamps, (o) => { o.material = new THREE.MeshPhysicalMaterial({name: 'lampenglas', color: 0xffffff, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.2, envMapIntensity: 1.6, depthWrite: false}); o.renderOrder = 1; });
  for (const k of ['trim', 'interior', 'wheels']) eachMesh(G[k], (o) => {
    const m = o.material; m.envMapIntensity = 1;
    if (m.name === 'tires') { m.roughness = 0.82; m.metalness = 0; m.color.set(0x0c0c0d); }
    if (m.name === 'rim_black') { m.roughness = 0.3; m.color.set(0x121316); }
    if (m.name === 'rim_chrome') { m.roughness = 0.24; m.color.set(0xa8adb3); }
    if (m.name === 'windows_dots') { m.transparent = true; m.depthWrite = false; o.renderOrder = 2; }
    if (m.name === 'headlights_pattern') { m.transparent = true; m.depthWrite = false; }
  });
  for (const k of ['paint', 'glass', 'trim', 'lamps', 'interior', 'wheels']) eachMesh(G[k], (o) => { o.material.clippingPlanes = [solidPlane]; solidMats.add(o.material); });

  // «рентген»: проход глубины + контурное свечение
  const ghostMat = ghostShader([ghostPlane]);
  const depthMat = new THREE.MeshBasicMaterial({colorWrite: false, clippingPlanes: [ghostPlane]});
  const ghostObjs = [];
  for (const k of ['ghost', 'ghostWheels']) eachMesh(G[k], (o) => {
    o.material = ghostMat; o.renderOrder = 6;
    const pre = new THREE.Mesh(o.geometry, depthMat); pre.renderOrder = 5; pre.name = 'ghost_depth'; o.parent.add(pre);
    pre.position.copy(o.position); pre.quaternion.copy(o.quaternion); pre.scale.copy(o.scale);
    ghostObjs.push(o, pre);
  });

  // ── узлы шасси кодом + псевдо-узлы из модели (тормоза, насадки выпуска) ──
  const {root: chassis, parts} = buildChassis(dims);
  car.add(chassis);
  const chassisMats = [];
  for (const p of Object.values(parts)) for (const m of p.mats) { m.clippingPlanes = [ghostPlane]; chassisMats.push(m); }
  const modelPart = (id, zone, group) => {
    const mats = [];
    eachMesh(group, (o) => { o.material = o.material.clone(); o.material.userData.base = o.material.color.clone(); o.material.emissive = new THREE.Color(ACCENT); o.material.emissiveIntensity = 0; o.material.emissiveMap = null; mats.push(o.material); });
    const p = {id, zone, group, mats, e: 0, d: 0, x: 0, te: 0, td: 0, tx: 0, box: new THREE.Box3().setFromObject(group),
      apply() { for (const m of mats) { m.color.copy(m.userData.base).multiplyScalar(1 - 0.55 * this.d).lerp(AMBER, this.e * 0.55); m.emissiveIntensity = this.e * 0.4; } }};
    parts[id] = p;
  };
  modelPart('bremse_vorn', 'bremsen', G.brakeF);
  modelPart('bremse_hinten', 'bremsen', G.brakeR);
  modelPart('endrohre', 'abgas', G.pipes);

  const floor = buildFloor(dims); scene.add(floor);
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(dims.breite + 0.36, dims.hoehe + 0.3), sheetShader());
  sheet.position.y = (dims.hoehe + 0.3) / 2; sheet.renderOrder = 8; sheet.visible = false; car.add(sheet);

  // ── состояние ──
  const S = {
    t: 0, tGoal: 0,                    // 0 = закрыта (лак), 1 = «рентген»
    zone: null, teile: null,
    cam: {...VIEWS.hero, t: new THREE.Vector3(...VIEWS.hero.t)},
    camFrom: null, camTo: null, camT0: 0, camDur: 0.8,
    focus: {...VIEWS.xray, t: new THREE.Vector3(...VIEWS.xray.t)},
    tilt: {x: 0, y: 0, gx: 0, gy: 0},
    wake: 1, wakeT0: 0,                // 0..1 прогресс «пробуждения»
    scan: 0, scanT0: 0,                // 0 = нет; иначе время старта сканера
    visible: true, running: false, dirty: true, w: 0, h: 0,
  };
  const zs0 = dims.laenge / 2 + 0.12, zs1 = -dims.laenge / 2 - 0.12;

  function size() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h || (w === S.w && h === S.h)) return;
    S.w = w; S.h = h;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, maxPR));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    S.dirty = true;
  }

  const tmpV = new THREE.Vector3();
  function placeCamera(v) {
    const tan = Math.tan(FOV * D2R / 2);
    const dist = Math.max(v.r / (tan * camera.aspect), (v.rv ?? v.r / A0) / tan);   // r — полуширина кадра, rv — полувысота
    const az = (v.az + S.tilt.x * 6) * D2R, el = Math.min(88, Math.max(2, v.el - S.tilt.y * 3)) * D2R;
    camera.position.set(v.t.x + dist * Math.cos(el) * Math.sin(az), v.t.y + dist * Math.sin(el), v.t.z + dist * Math.cos(el) * Math.cos(az));
    camera.lookAt(v.t);
  }
  const mixView = (a, b, k, out) => {
    let d = ((b.az - a.az + 540) % 360) - 180;
    out.az = a.az + d * k; out.el = a.el + (b.el - a.el) * k; out.r = a.r + (b.r - a.r) * k;
    const av = a.rv ?? a.r / A0, bv = b.rv ?? b.r / A0; out.rv = av + (bv - av) * k;
    out.t.lerpVectors(a.t, b.t, k); return out;
  };
  const heroV = {...VIEWS.hero, t: new THREE.Vector3(...VIEWS.hero.t)};
  const outV = {az: 0, el: 0, r: 1, t: new THREE.Vector3()};

  function focusGoal() {
    if (S.scan) return {...VIEWS.scan, t: new THREE.Vector3(...VIEWS.scan.t)};
    if (!S.zone) return {...VIEWS.xray, t: new THREE.Vector3(...VIEWS.xray.t)};
    const base = VIEWS[S.zone] || VIEWS.xray;
    const v = {...base, t: new THREE.Vector3(...base.t)};
    if (S.teile?.length) {                                     // услуга: кадр по границам её узлов, направление — как у зоны
      const b = new THREE.Box3();
      for (const id of S.teile) if (parts[id]) b.union(parts[id].box);
      if (!b.isEmpty()) {
        const c = b.getCenter(new THREE.Vector3()), sz = b.getSize(tmpV);
        v.t.lerp(c, 0.6);
        v.r = Math.min(base.r, Math.max(0.85, 0.62 * Math.max(sz.x, sz.z, sz.y * 1.3) + 0.3));
        v.rv = base.rv ? base.rv * v.r / base.r : undefined;
        if (sz.x > 1.2 && sz.z < 1) v.az = v.t.z > 0 ? 24 : 156;   // узлы одной оси: смотреть спереди или сзади
      }
    }
    return v;
  }
  function setFocus({zone = null, teile = null, scan = false} = {}, instant = false) {
    S.zone = zone; S.teile = teile;
    const zoneIds = zone ? ZONE_PARTS[zone] || [] : [];
    for (const p of Object.values(parts)) {
      const inZone = zoneIds.includes(p.id), sel = teile?.includes(p.id);
      p.te = !zone ? 0 : teile ? (sel ? 1 : 0) : inZone ? (p.id === 'motor_block' || p.id === 'hilfsrahmen' || p.id === 'getriebe' ? 0.18 : 0.5) : 0;
      p.td = !zone ? 0 : inZone ? (teile && !sel ? 0.25 : 0) : 1;
      p.tx = !zone ? 0 : inZone ? 1 : 0;
      if (p.inside && !sel && teile) p.te = 0;
      if (p.inside && !teile) p.te = zone && inZone ? 0.6 : 0;
      if (instant || reduced) { p.e = p.te; p.d = p.td; p.x = p.tx; p.apply(); }
    }
    if (scan && !reduced && !instant) { S.scan = 1; S.scanT0 = performance.now(); } else S.scan = 0;
    const goal = focusGoal();
    if (instant || reduced) { mixView(goal, goal, 1, S.focus); S.camTo = null; }
    else { S.camFrom = {...S.focus, t: S.focus.t.clone()}; S.camTo = goal; S.camT0 = performance.now(); }
    kick();
  }

  function applyBody() {
    const t = S.t, sweep = smooth(0.02, 0.8, t), up = smooth(0.25, 1, t);
    const zs = zs0 + (zs1 - zs0) * sweep;
    solidPlane.constant = zs; ghostPlane.constant = -zs;
    lift.position.y = dims.hub * up;
    const solid = t < 0.999, ghost = t > 0.001;
    for (const k of ['paint', 'glass', 'trim', 'lamps', 'interior', 'wheels']) if (G[k]) G[k].visible = solid;
    for (const o of ghostObjs) o.visible = ghost && (o.name !== 'ghost_depth' || tier.prepass);
    chassis.visible = ghost;
    ghostMat.uniforms.uOpacity.value = 1;
    floor.children[1].material.opacity = 1 - 0.62 * up;       // под стеклянным кузовом тень светлее, иначе «стекло» читается чёрным
    // сканирующая плоскость: на границе лак/стекло при входе, отдельный проход для услуг «вся машина»
    let sz = null, so = 0;
    if (t > 0.01 && sweep < 0.995) { sz = zs; so = Math.min(1, Math.min(sweep, 1 - sweep) * 8); }
    if (S.scan) { const k = clamp01((performance.now() - S.scanT0) / 1700); sz = zs0 + (zs1 - zs0) * k; so = Math.sin(k * Math.PI) ** 0.5; if (k >= 1) S.scan = 0; }
    sheet.visible = sz !== null && so > 0.01;
    if (sheet.visible) { sheet.position.z = sz; sheet.material.uniforms.uOpacity.value = so; }
  }

  const tier = {prepass: true, level: 'hoch'};
  let last = 0; const perf = {n: 0, sum: 0, done: still};
  function frame(now) {
    S.running = false;
    if (!S.visible) return;
    const dt = Math.min(0.1, (now - last) / 1000 || 0.016); last = now;
    let busy = false;
    size();
    // прогресс скролла: мягкое сглаживание
    const dT = S.tGoal - S.t;
    if (Math.abs(dT) > 0.0005) { S.t += reduced ? dT : dT * Math.min(1, dt * 9); busy = true; } else S.t = S.tGoal;
    // пробуждение: блик проходит по кузову, машина доворачивается на 8°
    if (S.wake < 1) { S.wake = clamp01((now - S.wakeT0) / 1500); busy = true; }
    const wk = 1 - ease(S.wake);
    car.rotation.y = -8 * D2R * wk;
    scene.environmentRotation.y = 1.15 * wk;
    // камера
    if (S.camTo) { const k = clamp01((now - S.camT0) / (S.camDur * 1000)); mixView(S.camFrom, S.camTo, ease(k), S.focus); if (k >= 1) S.camTo = null; else busy = true; }
    S.tilt.x += (S.tilt.gx - S.tilt.x) * Math.min(1, dt * 6); S.tilt.y += (S.tilt.gy - S.tilt.y) * Math.min(1, dt * 6);
    if (Math.abs(S.tilt.gx - S.tilt.x) + Math.abs(S.tilt.gy - S.tilt.y) > 0.002) busy = true;
    placeCamera(mixView(heroV, S.focus, ease(smooth(0.05, 0.95, S.t)), outV));
    // узлы
    for (const p of Object.values(parts)) {
      const k = Math.min(1, dt * 7);
      if (Math.abs(p.te - p.e) + Math.abs(p.td - p.d) + Math.abs(p.tx - p.x) > 0.004) { p.e += (p.te - p.e) * k; p.d += (p.td - p.d) * k; p.x += (p.tx - p.x) * k; p.apply(); busy = true; }
      else if (p.e !== p.te || p.d !== p.td || p.x !== p.tx) { p.e = p.te; p.d = p.td; p.x = p.tx; p.apply(); }
    }
    if (S.scan) busy = true;
    applyBody();
    renderer.render(scene, camera);
    S.dirty = false;
    // ступени качества: первые ~2 с непрерывной анимации меряется время кадра
    if (!perf.done && busy) {
      perf.n++; if (perf.n > 4) perf.sum += dt * 1000;
      if (perf.n >= 45) {
        perf.done = true; const avg = perf.sum / (perf.n - 4);
        if (avg > 110) { tier.level = 'aus'; opts.onTooSlow?.(avg); }
        else if (avg > 55) { tier.level = 'niedrig'; tier.prepass = false; maxPR = 1; S.w = 0; }
        else if (avg > 30) { tier.level = 'mittel'; maxPR = Math.min(maxPR, 1.25); S.w = 0; }
        opts.onTier?.(tier.level, avg);
      }
    }
    if (busy) kick();
  }
  function kick() { if (!S.running && S.visible && !still) { S.running = true; requestAnimationFrame(frame); } }

  // прогрев шейдеров: все материалы обоих состояний
  size(); S.t = 0.5; applyBody(); placeCamera(heroV);
  try { await renderer.compileAsync(scene, camera); } catch { renderer.compile(scene, camera); }
  S.t = 0; applyBody();
  onProgress(1);

  const io = new IntersectionObserver((es) => { S.visible = es[0].isIntersecting; if (S.visible) kick(); }, {rootMargin: '80px'});
  io.observe(canvas);
  const ro = new ResizeObserver(() => { size(); kick(); }); ro.observe(canvas);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

  // наклон ±6° за пальцем/курсором, скролл не перехватывается (touch-action: pan-y в CSS)
  if (!reduced) {
    const move = (e) => { const r = canvas.getBoundingClientRect(); S.tilt.gx = clamp01((e.clientX - r.left) / r.width) * 2 - 1; S.tilt.gy = clamp01((e.clientY - r.top) / r.height) * 2 - 1; kick(); };
    const leave = () => { S.tilt.gx = 0; S.tilt.gy = 0; kick(); };
    canvas.addEventListener('pointermove', move, {passive: true});
    canvas.addEventListener('pointerleave', leave, {passive: true}); canvas.addEventListener('pointercancel', leave, {passive: true}); canvas.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') leave(); }, {passive: true});
  }

  const api = {
    setScroll(t) { t = clamp01(t); if (Math.abs(t - S.tGoal) > 0.0005) { S.tGoal = t; if (S.wake < 1) S.wake = 1; kick(); } },
    setFocus,
    wake() { if (reduced) return; S.wake = 0; S.wakeT0 = performance.now(); kick(); },
    stopWake() { if (S.wake < 1) { S.wake = 1; kick(); } },
    render() { S.visible = true; frame(performance.now()); },
    // стоп-кадр для постера, запасного режима и проверки: всё мгновенно
    shot({t = 0, zone = null, teile = null, view = null, w, h} = {}) {
      if (w && h) { canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; }
      S.w = 0; size();
      S.t = S.tGoal = t; S.wake = 1; S.tilt.gx = S.tilt.gy = S.tilt.x = S.tilt.y = 0;
      setFocus({zone, teile}, true);
      if (view) mixView({...view, t: new THREE.Vector3(...view.t)}, {...view, t: new THREE.Vector3(...view.t)}, 1, S.focus);
      car.rotation.y = 0; scene.environmentRotation.y = 0;
      placeCamera(view ? S.focus : mixView(heroV, S.focus, ease(smooth(0.05, 0.95, S.t)), outV));
      applyBody(); renderer.render(scene, camera);
      return {calls: renderer.info.render.calls, tris: renderer.info.render.triangles};
    },
    info: () => ({calls: renderer.info.render.calls, tris: renderer.info.render.triangles, tier: tier.level, pr: renderer.getPixelRatio()}),
    parts, tier,
  };
  api.render();
  return api;
}
