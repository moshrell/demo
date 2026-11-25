import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
// Глиф-портал адаптирован из «Glyph Portal» © 2026 Christian Katzmann, MIT (https://ktzm.dk)
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

// ================= Настройки (крути здесь) =================
const CFG = {
  // сцена
  keyMin: 95, keyMax: 260,         // верхний свет на кресло: начало → конец
  wallMin: 0.6, wallMax: 3,        // едва заметное пятно на стене (глубина)
  envMin: 0.06, envMax: 0.16,      // общий свет: низкий, чтобы фон оставался тёмным
  camStart: [0.8, 1.3, 4.4],       // камера в начале (x, y, z)
  camEnd:   [0.0, 0.98, 2.95],     // камера у кресла
  lookStart: [0, 0.62, 0],
  lookEnd:   [0, 0.46, 0],
  // тайминг по скроллу интро (0..1)
  turn:   [0.03, 0.45],             // поворот кресла спиной → лицом
  word:   [0.47, 0.54],             // появляется название
  portal: [0.56, 0.82],             // влёт в букву
  reveal: [0.83, 0.88],             // дальше до 1.0 — пауза на первом экране             // появляется первый экран сайта
  focusChar: null,                 // буква для влёта: null = самая «жирная», или например 'O'
  smooth: 7,                       // инерция скролла: меньше = мягче
};

// ================= Утилиты =================
const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/'); // сайт может лежать в подпапке (/vorschau/…/)
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const inOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = matchMedia('(pointer: coarse)').matches;
const fixedP = new URLSearchParams(location.search).has('p') ? clamp(parseFloat(new URLSearchParams(location.search).get('p'))) : null;

const $ = (s) => document.querySelector(s);
const intro = $('#intro'), pin = $('#pin'), canvas = $('#stage');
const field = $('#field'), art = $('#art'), clip = $('#gp-clip'), glyph = $('#glyph');
const css = (k, v) => pin.style.setProperty(k, v);

// ================= 3D-сцена =================
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({canvas, antialias: !isMobile, powerPreference: 'high-performance'});
} catch (e) {
  console.warn('WebGL недоступен', e);
}

const scene = new THREE.Scene();
const BG = new THREE.Color(0x0b0807);
scene.background = BG;
scene.fog = new THREE.Fog(BG, 4.5, 11);
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
const chair = new THREE.Group();
scene.add(chair);

let key, wall, rim, fill;
if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isMobile ? 1.75 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

  // Студия: пол плавно переходит в стену (циклорама), краёв не видно
  const cyc = (() => {
    const prof = [];
    for (let z = 9; z > -1.2; z -= 0.5) prof.push([z, 0]);
    const R = 1.6, cz = -1.2, cy = R;
    for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI / 2; prof.push([cz - Math.sin(a) * R, cy - Math.cos(a) * R]); }
    for (let y = R + 0.5; y <= 9; y += 0.5) prof.push([cz - R, y]);
    const X = [-14, -4, 0, 4, 14], pos = [], idx = [];
    prof.forEach(([z, y]) => X.forEach((x) => pos.push(x, y, z)));
    for (let i = 0; i < prof.length - 1; i++) for (let j = 0; j < X.length - 1; j++) {
      const a = i * X.length + j, b = a + 1, c = a + X.length, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();
  const studio = new THREE.Mesh(cyc, new THREE.MeshStandardMaterial({color: 0x2a211b, roughness: 0.95, metalness: 0, side: THREE.DoubleSide}));
  studio.receiveShadow = true;
  scene.add(studio);

  // Верхний свет на кресло
  key = new THREE.SpotLight(0xffe6c8, CFG.keyMin, 12, 0.34, 0.7, 2); // узкий луч: светится кресло, а не стены
  key.position.set(0.3, 3.8, 0.9);
  key.target.position.set(0, 0.35, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  scene.add(key, key.target);

  // Мягкое пятно на стене за креслом — отделяет силуэт от фона
  wall = new THREE.SpotLight(0xffcf9e, CFG.wallMin, 10, 0.6, 1, 1.5);
  wall.position.set(0, 3.2, 1.2);
  wall.target.position.set(0, 1.2, -2.8);
  scene.add(wall, wall.target);

  // Тёплый контровой свет сзади-сбоку
  rim = new THREE.DirectionalLight(0xffe6cc, 2.2);
  rim.position.set(-2.5, 2.2, -2.5);
  scene.add(rim);

  // Мягкая подсветка спереди, чтобы фактура кресла читалась
  fill = new THREE.SpotLight(0xffd9b0, 0.25, 8, 0.32, 1, 2);
  fill.position.set(1.6, 1.4, 2.6);
  fill.target.position.set(0, 0.5, 0);
  fill.intensity = 6;
  scene.add(fill, fill.target);

}

// ================= Загрузка =================
let chairReady = !renderer;
let fontReady = false;
const done = () => { if (chairReady && fontReady) { document.body.classList.add('ready'); layout(); dirty = true; } };

if (renderer) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(`${BASE}models/chair.glb`, (gltf) => {
    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = o.receiveShadow = true;
        if (o.material.map) o.material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      }
    });
    chair.add(gltf.scene);
    chairReady = true; done();
  }, undefined, (err) => { console.error('Кресло не загрузилось:', err); chairReady = true; done(); });
}

Promise.race([document.fonts.load('900 100px "Playfair Display"', glyph.textContent), new Promise((r) => setTimeout(r, 2500))])
  .catch(() => {}).then(() => { fontReady = true; done(); });

// ================= Портал через букву =================
// Логика адаптирована из «Glyph Portal» © 2026 Christian Katzmann, лицензия MIT (https://ktzm.dk).
const WORD = glyph.textContent;
const scanCtx = document.createElement('canvas').getContext('2d', {willReadFrequently: true});
let W = 1, H = 1, startScale = 1, endScale = 1, center = {x: 0, y: 0}, target = null, bounds = null;

// Самый большой сплошной квадрат «чернил» в букве (там точно поместится экран)
function interior(char, font) {
  const c = scanCtx.canvas, pad = 8;
  scanCtx.font = font;
  const m = scanCtx.measureText(char);
  const left = Math.ceil(m.actualBoundingBoxLeft), ascent = Math.ceil(m.actualBoundingBoxAscent);
  c.width = Math.max(1, Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight) + pad * 2);
  c.height = Math.max(1, Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + pad * 2);
  scanCtx.font = font;
  scanCtx.fillText(char, pad + left, pad + ascent);
  const {width, height} = c, px = scanCtx.getImageData(0, 0, width, height).data;
  const rows = new Uint16Array(width + 1);
  let size = 0, bx = 0, by = 0;
  for (let y = 0; y < height; y++) {
    let diag = 0;
    for (let x = 0; x < width; x++) {
      const above = rows[x + 1];
      rows[x + 1] = px[(y * width + x) * 4 + 3] > 245 ? Math.min(above, rows[x], diag) + 1 : 0;
      diag = above;
      if (rows[x + 1] > size) { size = rows[x + 1]; bx = x; by = y; }
    }
  }
  if (size < 3) return null;
  return {x: (bx + 1 - size / 2 - pad - left) / 3, y: (by + 1 - size / 2 - pad - ascent) / 3, radius: (size / 2 - 1) / 3};
}

function readInk() {
  const fam = getComputedStyle(glyph).fontFamily;
  scanCtx.font = `900 100px ${fam}`;
  const m = scanCtx.measureText(WORD);
  bounds = {x: -m.actualBoundingBoxLeft, y: -m.actualBoundingBoxAscent, width: m.actualBoundingBoxLeft + m.actualBoundingBoxRight, height: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent};
  center = {x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2};
  const cands = [];
  for (let i = 0; i < WORD.length; i++) {
    scanCtx.font = `900 100px ${fam}`;
    const adv = scanCtx.measureText(WORD.slice(0, i)).width;
    const f = interior(WORD[i], `900 300px ${fam}`);
    if (f) cands.push({...f, x: f.x + adv, char: WORD[i]});
  }
  target = cands.find((c) => c.char === CFG.focusChar) ||
    cands.sort((a, b) => b.radius - a.radius || Math.abs(a.x - center.x) - Math.abs(b.x - center.x))[0] || null;
}

function layout() {
  W = pin.clientWidth; H = pin.clientHeight;
  if (renderer) {
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }
  art.setAttribute('viewBox', `0 0 ${W} ${H}`);
  if (!fontReady) return;
  if (!bounds) readInk();
  startScale = Math.min(W * (W < 600 ? 0.9 : 0.8) / bounds.width, H * 0.3 / bounds.height);
  endScale = target ? Math.max(startScale, Math.hypot(W, H) / (target.radius * 1.35)) : startScale;
  css('--word-bottom', `${H * 0.46 + bounds.height * startScale / 2}px`);
  dirty = true;
}

function paintPortal(t) {
  if (!bounds) return;
  const e = inOut(t);
  const s = Math.exp(Math.log(startScale) + Math.log(endScale / startScale) * e);
  const blend = endScale === startScale ? 0 : (1 / s - 1 / startScale) / (1 / endScale - 1 / startScale);
  const tx = target ? target.x : center.x, ty = target ? target.y : center.y;
  const cx = center.x + (tx - center.x) * blend, cy = center.y + (ty - center.y) * blend;
  const y = H * 0.46 + H * 0.04 * e;
  clip.setAttribute('transform', `scale(${s})`);
  glyph.setAttribute('transform', `translate(${W / 2 / s - cx} ${y / s - cy})`);
  field.style.clipPath = t >= 1 ? 'none' : 'url(#gp-clip)';
}

// ================= Скролл =================
let target_p = fixedP ?? 0, cur = target_p, dirty = true;
function readScroll() {
  if (fixedP !== null) return;
  const r = intro.getBoundingClientRect();
  const travel = r.height - pin.clientHeight;
  target_p = travel > 0 ? clamp(-r.top / travel) : 0;
}
addEventListener('scroll', readScroll, {passive: true});
addEventListener('resize', () => { layout(); readScroll(); });
readScroll(); cur = target_p;

const look = new THREE.Vector3();
function update(p) {
  const turn = smooth(CFG.turn[0], CFG.turn[1], p);
  const dolly = smooth(0, CFG.turn[1] + 0.04, p);
  const light = smooth(0, CFG.turn[1], p);
  const portrait = W / H < 0.85 ? 1 + (0.85 - W / H) * 1.5 : 1;

  if (renderer) {
    camera.position.set(
      lerp(CFG.camStart[0], CFG.camEnd[0], dolly),
      lerp(CFG.camStart[1], CFG.camEnd[1], dolly),
      lerp(CFG.camStart[2], CFG.camEnd[2], dolly) * portrait,
    );
    look.set(lerp(CFG.lookStart[0], CFG.lookEnd[0], dolly), lerp(CFG.lookStart[1], CFG.lookEnd[1], dolly), 0);
    camera.lookAt(look);
    chair.rotation.y = Math.PI * (1 - turn); // π = спиной к гостю, 0 = лицом
    const l2 = light * light;
    key.intensity = lerp(CFG.keyMin, CFG.keyMax, l2);
    wall.intensity = lerp(CFG.wallMin, CFG.wallMax, light);
    scene.environmentIntensity = lerp(CFG.envMin, CFG.envMax, light);
    fill.intensity = lerp(9, 16, light);
  }

  const word = smooth(CFG.word[0], CFG.word[1], p);
  const portal = clamp((p - CFG.portal[0]) / (CFG.portal[1] - CFG.portal[0]));
  const reveal = smooth(CFG.reveal[0], CFG.reveal[1], p);
  css('--hint', String(1 - smooth(0, 0.04, p)));
  css('--line', String(smooth(0.26, 0.33, p) * (1 - smooth(0.4, 0.46, p))));
  css('--veil', String(0.55 * word));
  css('--word', String(word));
  css('--sub', String(word * (1 - smooth(CFG.portal[0], CFG.portal[0] + 0.04, p))));
  css('--reveal', String(reveal));
  document.body.classList.toggle('entered', reveal > 0.9);
  document.body.classList.toggle('intro-done', p > CFG.reveal[0] + 0.02);
  paintPortal(portal);
  return portal < 1; // нужна ли 3D-отрисовка
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const d = target_p - cur;
  if (Math.abs(d) > 1e-4) { cur += d * (reduceMotion ? 1 : 1 - Math.exp(-CFG.smooth * dt)); dirty = true; }
  else if (d !== 0) { cur = target_p; dirty = true; }
  if (dirty && chairReady && fontReady) {
    const need3d = update(cur);
    if (renderer && need3d) renderer.render(scene, camera);
    dirty = false;
  }
  requestAnimationFrame(frame);
}
layout();
requestAnimationFrame(frame);

// Пропустить интро: сразу к первому экрану сайта
document.getElementById('skip')?.addEventListener('click', () => {
  const end = intro.offsetTop + intro.offsetHeight - pin.clientHeight;
  window.scrollTo({top: end, behavior: 'auto'});
  readScroll(); cur = target_p; dirty = true;
});

// Отладка из консоли: __salon.set(0.5)
window.__salon = {
  get ready() { return chairReady && fontReady; },
  set(p) { target_p = cur = clamp(p); update(cur); if (renderer) renderer.render(scene, camera); },
  get target() { return target; }, get scales() { return [startScale, endScale]; },
  renderer, scene, camera, chair,
};
