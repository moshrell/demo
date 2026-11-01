import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {buildEngine} from './engine.js';

const canvas = document.getElementById('c');
const coarse = matchMedia('(pointer: coarse)').matches;            // phones/tablets: cheaper tier
const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true, preserveDrawingBuffer: true});
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;

const scene = new THREE.Scene();
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.75;

const key = new THREE.DirectionalLight(0xfff4e6, 2.1);
key.position.set(7, 11, 8); key.castShadow = true;
const SM = coarse ? 1024 : 2048;
key.shadow.mapSize.set(SM, SM); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
Object.assign(key.shadow.camera, {left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30});
scene.add(key);
scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc8b8, 0.35));

const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({opacity: 0.2}));
floor.rotation.x = -Math.PI / 2; floor.position.y = -1.66; floor.receiveShadow = true; scene.add(floor);

const eng = buildEngine(scene);
const camera = new THREE.PerspectiveCamera(26, 16 / 9, 0.5, 120);
const VIEWS = {
  hero:   {label: 'Overview', p: [5.6, 9.4, 9.6],  t: [0.15, -0.35, 0.35], fov: 26},
  top:    {label: 'Top',      p: [0.01, 13.0, 0.9], t: [0, -0.2, 0.55],     fov: 26},
  front:  {label: 'Front',    p: [0.0, 1.8, 12.5],  t: [0, -0.1, 0.0],      fov: 28},
  side:   {label: 'Side',     p: [11.5, 1.0, 1.0],  t: [0, -0.1, 0.4],      fov: 28},
  inside: {label: 'Cylinder', p: [3.4, 6.2, 7.6],   t: [1.35, 0.0, 1.27],   fov: 24},
};
const V3 = THREE.Vector3;
const cam = {p: new V3(...VIEWS.hero.p), t: new V3(...VIEWS.hero.t), fov: VIEWS.hero.fov};
let want = 'hero', th = 0, spin = !matchMedia('(prefers-reduced-motion: reduce)').matches;

function layout() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2)); renderer.setSize(w, h, false);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  camera.aspect = w / h;
}
function placeCamera(k) {                                           // k = 1 snaps, small k eases
  const v = VIEWS[want];
  const fit = Math.max(1, 1.45 / camera.aspect);                    // narrow screens: pull back so the machine fits
  const t = new V3(...v.t), p = new V3(...v.p).sub(t).multiplyScalar(fit).add(t);
  cam.p.lerp(p, k); cam.t.lerp(t, k); cam.fov += (v.fov - cam.fov) * k;
  camera.position.copy(cam.p); camera.lookAt(cam.t); camera.fov = cam.fov; camera.updateProjectionMatrix();
}
function draw(k = 0.07) { placeCamera(k); eng.update(th * Math.PI / 180); renderer.render(scene, camera); }

addEventListener('resize', () => { layout(); draw(1); });
layout(); draw(1);
renderer.compile(scene, camera);                                    // warm shaders before the first visible frame

// UI
const nav = document.getElementById('v');
if (nav) for (const [id, v] of Object.entries(VIEWS)) {
  const b = document.createElement('button'); b.textContent = v.label; b.dataset.id = id;
  b.onclick = () => { want = id; for (const x of nav.children) x.classList.toggle('on', x === b); };
  if (id === want) b.classList.add('on'); nav.appendChild(b);
}
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (spin) th = (th + dt * 42) % 720;                              // slow motion: 42 deg of crank per second
  draw(); requestAnimationFrame(loop);
}
if (!window.__still) requestAnimationFrame(loop);

// hooks for the review loop (stills)
window.__shot = (st) => { if (st.cam) want = st.cam; if (st.th != null) th = st.th; spin = false; draw(1); return true; };
window.__ready = true;
