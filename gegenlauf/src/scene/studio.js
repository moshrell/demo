// Ночной шоурум: свет только от световых панелей. Окружение строится кодом (без внешних HDRI),
// длинные панели дают полосы отражений вдоль кузова. Пол: «лужа света» и запечённая в текстуру тень.
import * as THREE from 'three';

export function buildEnvironment(renderer) {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 22), new THREE.MeshBasicMaterial({color: 0x040405, side: THREE.BackSide}));
  room.position.y = 3.4; s.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 22), new THREE.MeshBasicMaterial({color: 0x0b0a09}));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.05; s.add(floor);
  const panel = (w, h, pos, look, k, tint = [1, 0.97, 0.92]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(tint[0] * k, tint[1] * k, tint[2] * k), side: THREE.DoubleSide}));
    m.position.set(...pos); m.lookAt(...look); s.add(m);
  };
  panel(0.55, 10, [1.7, 3.3, 0], [1.7, 0, 0], 13);                 // две длинные потолочные полосы вдоль машины
  panel(0.55, 10, [-1.7, 3.3, 0], [-1.7, 0, 0], 13);
  panel(2.2, 5, [0, 4.6, 0.5], [0, 0, 0.5], 1.4);                  // мягкий верх
  panel(9, 0.42, [6.2, 1.25, 0], [0, 1.0, 0], 6.5, [0.92, 0.96, 1]); // боковые полосы: длинный блик по борту
  panel(9, 0.42, [-6.2, 1.25, 0], [0, 1.0, 0], 6.5, [0.92, 0.96, 1]);
  panel(5, 0.5, [0, 1.6, 9.5], [0, 1, 0], 5);                       // нос
  panel(5, 0.5, [0, 1.8, -9.5], [0, 1, 0], 3.5);                    // корма
  panel(1.4, 1.4, [4.5, 3.6, 6.5], [0, 0.6, 1.5], 3, [1, 0.86, 0.7]); // тёплый акцент спереди сбоку
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.012, 0.1, 40).texture;
  s.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  pm.dispose();
  return tex;
}

function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// dims: {laenge, breite, achseVorn, achseHinten, spur}
export function buildFloor(dims) {
  const g = new THREE.Group(); g.name = 'floor';
  const pool = new THREE.Mesh(new THREE.CircleGeometry(7.5, 48), new THREE.MeshBasicMaterial({
    map: canvasTex(256, (x, n) => {
      const r = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      r.addColorStop(0, 'rgba(150,140,128,0.34)'); r.addColorStop(0.35, 'rgba(120,112,104,0.17)'); r.addColorStop(0.7, 'rgba(90,86,82,0.05)'); r.addColorStop(1, 'rgba(60,58,56,0)');
      x.fillStyle = r; x.fillRect(0, 0, n, n);
    }), transparent: true, depthWrite: false, toneMapped: false}));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.001; pool.renderOrder = -3; g.add(pool);
  // тень: мягкий эллипс под кузовом + плотные пятна под колёсами (текстура, не расчёт в реальном времени)
  const W = 3.0, L = 6.0;
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshBasicMaterial({
    map: canvasTex(512, (x, n) => {
      const blob = (cx, cy, rx, ry, a) => { x.save(); x.translate(cx * n, cy * n); x.scale(rx * n, ry * n);
        const r = x.createRadialGradient(0, 0, 0, 0, 0, 1); r.addColorStop(0, `rgba(0,0,0,${a})`); r.addColorStop(0.55, `rgba(0,0,0,${a * 0.72})`); r.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = r; x.beginPath(); x.arc(0, 0, 1, 0, 7); x.fill(); x.restore(); };
      blob(0.5, 0.5, dims.breite / W * 0.62, dims.laenge / L * 0.56, 0.9);
      blob(0.5, 0.5, dims.breite / W * 0.5, dims.laenge / L * 0.5, 0.6);
      for (const [ax, sx] of [[dims.achseVorn.z, 1], [dims.achseVorn.z, -1], [dims.achseHinten.z, 1], [dims.achseHinten.z, -1]])
        blob(0.5 + sx * dims.spur / 2 / W, 0.5 - ax / L, 0.085, 0.075, 0.85);
    }), transparent: true, depthWrite: false, toneMapped: false}));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.003; shadow.renderOrder = -2; g.add(shadow);
  return g;
}

// мелкая «металлик»-крошка в нормалях лака
export function flakeNormalMap() {
  const n = 128, d = new Uint8Array(n * n * 4);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n * n; i++) {
    const a = rnd() * 6.283, r = rnd() * 0.5;
    d[i * 4] = 128 + Math.cos(a) * r * 127; d[i * 4 + 1] = 128 + Math.sin(a) * r * 127; d[i * 4 + 2] = 255; d[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(d, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(48, 48); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}
