import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
// Глиф-портал адаптирован из «Glyph Portal» © 2026 Christian Katzmann, MIT (https://ktzm.dk)
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';

// ================= Настройки (крути здесь) =================
const CFG = {
  // сцена
  keyMin: 95, keyMax: 240,         // верхний свет на кресло: начало → конец
  envMin: 0.35, envMax: 0.7,       // отражения салона (HDR-карта) на коже и хроме
  bgMin: 0.62, bgMax: 0.95,        // яркость фото-фона: начало → конец
  // Камера «как у фото»: смотрит чуть вниз, основание кресла всегда в пятне света на полу
  pitch: 8,                        // наклон камеры вниз, градусы (как на фото)
  poolY: 0.801,                    // где на фото центр пятна света (доля высоты сверху)
  distStart: 4.5, distEnd: 3.7,    // расстояние до основания кресла: начало → после разворота
  bgZoom: 0.2,                     // фон приближается так же, как растёт кресло — читается как движение камеры
  // тайминг по скроллу интро (0..1)
  turn:   [0.02, 0.45],            // кресло разворачивается спиной → лицом
  dive:   [0.45, 0.66],            // «садимся»: въезд в спинку
  black:  [0.62, 0.68],            // экран уходит в чёрное, появляется название
  land:   0.78,                    // название улетает в шапку, открывается сайт (анимация по времени)
  smooth: 7,
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
// Rechnet der Browser WebGL nur in Software (kein Grafikchip: Messroboter, sehr alte Geräte)? Dann schlanker Modus ohne Schatten, Kantenglättung und Hochauflösung.
const softGL = (() => {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const info = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const soft = !!info && /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)));
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return soft;
  } catch (e) { console.error('[salon-mittwoch/intro-sit] GPU-Erkennung', e); return false; }
})();
let renderer = null;
try {
  if (softGL) throw new Error('Software-Rendering: statt 3D das Salonfoto'); // schlanker Notmodus, der Rest der Seite läuft wie ohne WebGL
  renderer = new THREE.WebGLRenderer({canvas, antialias: !isMobile && !softGL, powerPreference: 'high-performance'});
} catch (e) {
  console.warn('WebGL недоступен', e);
  canvas.style.background = `#0b0807 url(${BASE}scene/salon-bg.webp) center / cover no-repeat`; // Foto statt Szene
}

const scene = new THREE.Scene();
const BG = new THREE.Color(0x0b0807);
scene.background = BG;
scene.fog = new THREE.Fog(BG, 6, 14);
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
const chair = new THREE.Group();
scene.add(chair);

let key, rim, fill, bgTex = null;
if (renderer) {
  renderer.setPixelRatio(softGL ? 1 : Math.min(devicePixelRatio || 1, isMobile ? 1.75 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = !softGL;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  if (!softGL) scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; // пока грузится HDR

  // Фон: фото салона на большом щите позади кресла. Неподвижно, крутится только кресло.
  // Фон: фото салона на весь экран, всегда ровное, без перспективы и краёв. Крутится только кресло.
  bgTex = new THREE.TextureLoader().load(`${BASE}scene/salon-bg.webp`, () => { scene.background = bgTex; fitBg(1); dirty = true; });
  bgTex.colorSpace = THREE.SRGBColorSpace;
  scene.backgroundIntensity = CFG.bgMin;

  // Невидимый пол: только тень кресла ложится на пол фотографии
  const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({opacity: 0.55}));
  shadowFloor.receiveShadow = true;
  scene.add(shadowFloor);

  // Освещение и отражения из HDR-панорамы салона
  const pmrem = new THREE.PMREMGenerator(renderer);
  if (!softGL) new HDRLoader().load(`${BASE}scene/salon-env.hdr`, (t) => {
    t.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = pmrem.fromEquirectangular(t).texture;
    t.dispose(); dirty = true;
  });

  // Верхний свет на кресло
  key = new THREE.SpotLight(0xffe6c8, CFG.keyMin, 12, 0.34, 0.7, 2); // узкий луч: светится кресло, а не стены
  key.position.set(0.3, 3.8, 0.9);
  key.target.position.set(0, 0.35, 0);
  key.castShadow = !softGL;
  key.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  scene.add(key, key.target);


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

// Фото-фон «cover»: заполняет экран без искажений; zoom > 1 — лёгкий наезд вместе с камерой
let poolScreenY = CFG.poolY;
function fitBg(zoom) {
  if (!bgTex || !bgTex.image) return;
  const ia = bgTex.image.width / bgTex.image.height, a = W / H;
  let rx = 1, ry = 1;
  if (a > ia) ry = ia / a; else rx = a / ia;
  const ox = (1 - rx) / 2, oy = (1 - ry) / 2;
  // пятно света: координата на текстуре (v снизу) и где оно на экране без приближения
  const pv = 1 - CFG.poolY, ps = (pv - oy) / ry;
  poolScreenY = 1 - ps;
  const rx2 = rx / zoom, ry2 = ry / zoom;
  bgTex.repeat.set(rx2, ry2);
  bgTex.offset.set(0.5 - 0.5 * rx2, pv - ps * ry2); // приближение вокруг пятна света
}

// Где спинка: пускаем луч из точки перед креслом назад, на высоте груди сидящего
let seat = {y: 0.72, z: -0.2};
function findBackrest() {
  chair.rotation.y = 0;
  chair.updateMatrixWorld(true);
  const rc = new THREE.Raycaster();
  for (const y of [0.72, 0.66, 0.78, 0.6]) {
    rc.set(new THREE.Vector3(0, y, 2), new THREE.Vector3(0, 0, -1));
    const hit = rc.intersectObject(chair, true)[0];
    if (hit && hit.point.z < 0.2) { seat = {y, z: hit.point.z}; break; }
  }
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
        o.castShadow = o.receiveShadow = !softGL;
        if (softGL && o.material.isMeshPhysicalMaterial) { const m = new THREE.MeshStandardMaterial(); THREE.MeshStandardMaterial.prototype.copy.call(m, o.material); o.material = m; } // schlankerer Shader
        if (o.material.map) o.material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      }
    });
    chair.add(gltf.scene);
    findBackrest();
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
// Полёт названия в логотип шапки: считаем, куда и во сколько раз уменьшить
const brand = document.querySelector('.brand');
let landedState = false, flyTimer = 0;
function measureFlight() {
  const logo = document.querySelector('#nav .logo'), nav = document.getElementById('nav');
  if (!logo || !brand || !nav) return;
  const r = logo.getBoundingClientRect();
  const shiftY = new DOMMatrixReadOnly(getComputedStyle(nav).transform).m42; // шапка может быть ещё спрятана
  css('--fx', `${(r.left + r.width / 2 - pin.clientWidth / 2).toFixed(1)}px`);
  css('--fy', `${(r.top - shiftY + r.height / 2 - pin.clientHeight / 2).toFixed(1)}px`);
  css('--fs', String(logo.offsetWidth / brand.offsetWidth));
}
addEventListener('resize', () => { if (landedState) measureFlight(); });

function update(p) {
  const turn = smooth(CFG.turn[0], CFG.turn[1], p);
  const approach = smooth(0, CFG.turn[1], p);
  const dv = clamp((p - CFG.dive[0]) / (CFG.dive[1] - CFG.dive[0]));
  const dive = dv * dv * (3 - 2 * dv);
  const light = smooth(0, CFG.turn[1], p);
  const black = smooth(CFG.black[0], CFG.black[1], p);
  const portrait = W / H < 0.85 ? 1 + (0.85 - W / H) * 1.5 : 1;

  if (renderer) {
    fitBg(1 + CFG.bgZoom * approach + 0.1 * dive);
    // угол луча «основание кресла → камера», при котором основание попадает в пятно света на экране
    const th = (CFG.pitch * Math.PI) / 180;
    const ndc = (0.5 - poolScreenY) * 2;
    const alpha = th + Math.atan(-ndc * Math.tan((32 * Math.PI) / 360));
    const D = lerp(CFG.distStart, CFG.distEnd, approach);
    const px = 0, py = D * Math.sin(alpha), pz = D * Math.cos(alpha);
    const fx = 0, fy = -Math.sin(th), fz = -Math.cos(th);           // направление взгляда
    const lp = [px + fx * D, py + fy * D, pz + fz * D];             // точка взгляда в «посаженной» позе
    // «садимся»: из этой позы въезжаем в спинку
    camera.position.set(lerp(px, 0, dive), lerp(py, seat.y, dive), lerp(pz, seat.z + 0.12, dive));
    look.set(lerp(lp[0], 0, dive), lerp(lp[1], seat.y, dive), lerp(lp[2], seat.z - 1, dive));
    camera.lookAt(look);
    camera.rotateZ(Math.sin(dive * Math.PI) * 0.035);
    const fov = lerp(32, 46, dive);
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    chair.rotation.y = Math.PI * (1 - turn);
    const shade = 1 - dive * 0.9; // садимся — своё тело закрывает свет, спинка темнеет
    key.intensity = lerp(CFG.keyMin, CFG.keyMax, light * light) * shade;
    scene.environmentIntensity = lerp(CFG.envMin, CFG.envMax, light) * shade;
    fill.intensity = lerp(9, 16, light) * shade;
    scene.backgroundIntensity = lerp(CFG.bgMin, CFG.bgMax, light) * shade;
  }

  css('--hint', String(1 - smooth(0, 0.04, p)));
  css('--line', String(smooth(0.2, 0.26, p) * (1 - smooth(0.36, 0.42, p))));
  css('--veil', String(black));
  document.body.classList.toggle('blackout', black >= 0.98);

  // Посадка: название улетает в шапку. Порог — по скроллу, сама анимация — по времени
  const landed = p >= CFG.land;
  if (landed !== landedState) {
    landedState = landed;
    measureFlight();
    document.body.classList.add('sit-flying');
    document.body.classList.toggle('landed', landed);
    if (!landed) document.body.classList.remove('landed-done');
    clearTimeout(flyTimer);
    flyTimer = setTimeout(() => {
      document.body.classList.remove('sit-flying');
      document.body.classList.toggle('landed-done', landedState);
    }, 1250);
  }
  document.body.classList.toggle('entered', landed);
  document.body.classList.toggle('intro-done', landed);
  return black < 1; // после затемнения 3D не рисуем
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
  variant: 'sit',
  get seat() { return seat; },
  get ready() { return chairReady && fontReady; },
  set(p) { target_p = cur = clamp(p); update(cur); if (renderer) renderer.render(scene, camera); },
  get target() { return target; }, get scales() { return [startScale, endScale]; },
  renderer, scene, camera, chair,
};
