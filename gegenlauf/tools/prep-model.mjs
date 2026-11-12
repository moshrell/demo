// Подготовка модели машины: исходник (не в git, _models/) → public/models/fahrzeug.glb
// node tools/prep-model.mjs _models/c/porsche_911_with_interior.glb
// Что делает: закрывает дверь, убирает эмблемы и надписи (материал LOGO1), номер → «DEMO», раскладывает
// меши по группам сцены (paint/glass/trim/wheels/brakeF/brakeR/pipes/interior), ставит машину на y=0,
// носом в +Z, центр колёсной базы в начале координат, облегчает геометрию и текстуры, сжимает meshopt.
import {NodeIO, Document} from '@gltf-transform/core';
import {ALL_EXTENSIONS, EXTMeshoptCompression} from '@gltf-transform/extensions';
import {flatten, clearNodeTransform, join, weld, prune, dedup, simplifyPrimitive, textureCompress, meshopt, compactPrimitive, getBounds, unpartition} from '@gltf-transform/functions';
import {MeshoptEncoder, MeshoptSimplifier, MeshoptDecoder} from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';

const SRC = process.argv[2];
const OUT = process.argv[3] || 'public/models/fahrzeug.glb';
await MeshoptEncoder.ready; await MeshoptSimplifier.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder});
const doc = await io.read(SRC);
const root = doc.getRoot();
const scene = root.listScenes()[0];

// 1) закрыть открытую дверь: поворот как у закрытой
const d1 = root.listNodes().find((n) => n.getName() === 'door_1');
const d2 = root.listNodes().find((n) => n.getName() === 'door_2');
if (d1 && d2) d2.setRotation(d1.getRotation()).setTranslation(d1.getTranslation()); // геометрия двери в координатах машины: узел без сдвига = закрыто

// 2) группы по материалам. [группа, доля треугольников после облегчения, допустимая ошибка]
const PLAN = {
  body_main: ['paint', 1, 0],
  windows: ['glass', 1, 0],
  lights: ['lamps', 0.7, 0.002],
  windows_edge: ['trim', 0.6, 0.004], windows_dots: ['trim', 1, 0],
  bl_pl_M_ext: ['trim', 0.42, 0.003], bl_pl__GL_int_ext: ['trim', 0.4, 0.003], black_metal: ['trim', 0.3, 0.004],
  reisin: ['trim', 0.45, 0.004], Mirror: ['trim', 1, 0], invisible_all: ['trim', 0.4, 0.006],
  headlights_pattern: ['trim', 1, 0], hedlights_grid: ['trim', 1, 0], headlights_plastic_ring: ['trim', 1, 0],
  reflectors: ['trim', 0.7, 0.003], red_light_main: ['trim', 1, 0], monitor: ['trim', 1, 0],
  chrom_int: ['trim', 0.25, 0.004], number_plate1: ['trim', 1, 0],
  rim_black: ['wheels', 0.5, 0.002], rim_chrome: ['wheels', 0.45, 0.002], tires: ['wheels', 0.8, 0.002],
  Discs: ['brake', 0.35, 0.002], brakes: ['brake', 0.5, 0.002],
  pipes_chrom: ['pipes', 0.7, 0.002],
  bl_pl_M_int: ['interior', 0.09, 0.012], leather_int: ['interior', 0.14, 0.01], pl_leather_int: ['interior', 0.13, 0.01],
  leather_perforated: ['interior', 0.14, 0.01], upholstery: ['interior', 0.25, 0.01], rug_interior: ['interior', 0.2, 0.01],
  carbon_int: ['interior', 0.4, 0.01], belts: ['interior', 0.25, 0.01], interior_grid: ['interior', 0.5, 0.01],
};
const DROP = new Set(['LOGO1', 'leather_seam', 'dynamics']);
// салон: одна тёмная кожа и один пластик вместо девяти текстурных материалов
const MERGE = {leather_perforated: 'leather_int', upholstery: 'leather_int', pl_leather_int: 'leather_int',
  rug_interior: 'bl_pl_M_int', carbon_int: 'bl_pl_M_int', belts: 'bl_pl_M_int', interior_grid: 'bl_pl_M_int',
  windows_edge: 'reisin', invisible_all: 'reisin', hedlights_grid: 'reisin', headlights_plastic_ring: 'bl_pl__GL_int_ext'};

// 3) общий поворот/сдвиг: длина вдоль Z, нос в +Z, колёса на y=0, центр базы в нуле
const tires = root.listMaterials().find((m) => m.getName() === 'tires');
const top = doc.createNode('car').setRotation([0, -Math.SQRT1_2, 0, Math.SQRT1_2]);
for (const n of scene.listChildren()) top.addChild(n);
scene.addChild(top);
// удалить ненужные меши до расчётов
for (const n of root.listNodes()) {
  const m = n.getMesh(); if (!m) continue;
  for (const p of m.listPrimitives()) if (DROP.has(p.getMaterial()?.getName())) p.dispose();
  if (!m.listPrimitives().length) n.setMesh(null);
}
await doc.transform(flatten());
for (const n of root.listNodes()) if (n.getMesh()) clearNodeTransform(n);

// границы шин → оси и уровень пола
let tb = {min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9]};
for (const n of root.listNodes()) {
  const m = n.getMesh(); if (!m) continue;
  for (const p of m.listPrimitives()) if (p.getMaterial() === tires) {
    const a = p.getAttribute('POSITION'), v = [0, 0, 0];
    for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); for (let k = 0; k < 3; k++) { tb.min[k] = Math.min(tb.min[k], v[k]); tb.max[k] = Math.max(tb.max[k], v[k]); } }
  }
}
const dz = -(tb.min[2] + tb.max[2]) / 2, dy = -tb.min[1];
console.log('tires bbox', tb, 'shift', dy.toFixed(4), dz.toFixed(4));

// 4) новые узлы-группы; каждый примитив → меш своей группы и материала
const groups = {};
const matByName = Object.fromEntries(root.listMaterials().map((m) => [m.getName(), m]));
const newNodes = [];
for (const n of root.listNodes()) {
  const m = n.getMesh(); if (!m) continue;
  for (const p of m.listPrimitives()) {
    let name = p.getMaterial()?.getName();
    const plan = PLAN[name];
    if (!plan) { console.log('! нет плана для', name); continue; }
    // сдвиг
    const a = p.getAttribute('POSITION'), v = [0, 0, 0];
    if (!a.__moved) { for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); v[1] += dy; v[2] += dz; a.setElement(i, v); } a.__moved = true; }
    p.__plan = plan;
    if (MERGE[name]) { p.setMaterial(matByName[MERGE[name]]); name = MERGE[name]; for (const s of p.listSemantics()) if (s.startsWith('TEXCOORD') || s === 'TANGENT' || s.startsWith('COLOR')) p.setAttribute(s, null); }
    const g = plan[0];
    groups[g] ??= doc.createNode(g);
    const mesh = doc.createMesh(`${g}_${name}`); m.removePrimitive(p); mesh.addPrimitive(p);
    const node = doc.createNode(`${g}_${name}`).setMesh(mesh); groups[g].addChild(node); newNodes.push(node);
  }
}
for (const c of scene.listChildren()) c.dispose();
for (const n of root.listNodes()) if (!Object.values(groups).includes(n) && !newNodes.includes(n)) n.dispose();
for (const g of Object.values(groups)) scene.addChild(g);

// 4a) надписи на корме (хромированные буквы и шильдик модели) — убрать по зоне: это товарные знаки
const CUT = [
  {mesh: 'wheels_rim_chrome', x: 0.3, y: [0.69, 0.78], z: -2.15},
  {mesh: 'interior_bl_pl_M_int', x: 0.2, y: [0.62, 0.655], z: -2.2},
  {mesh: 'trim_bl_pl__GL_int_ext', x: 0.285, y: [0.69, 0.775], z: -2.15, cover: true}, // выдавленные буквы в глянцевой планке
];
const cover = {};
for (const mesh of root.listMeshes()) for (const cut of CUT.filter((c) => c.mesh === mesh.getName())) for (const p of mesh.listPrimitives()) {
  const idx = p.getIndices().getArray(), pos = p.getAttribute('POSITION'), v = [0, 0, 0], keep = [];
  for (let i = 0; i < idx.length; i += 3) {
    const q = [0, 0, 0]; for (let k = 0; k < 3; k++) { pos.getElement(idx[i + k], v); for (let j = 0; j < 3; j++) q[j] += v[j] / 3; }
    if (!(Math.abs(q[0]) < cut.x && q[1] > cut.y[0] && q[1] < cut.y[1] && q[2] < cut.z)) keep.push(idx[i], idx[i + 1], idx[i + 2]);
    else if (cut.cover) for (let k = 0; k < 3; k++) { pos.getElement(idx[i + k], v); const b = Math.max(0, Math.min(15, Math.floor((v[0] + 0.3) / 0.6 * 16))); cover[b] = Math.min(cover[b] ?? 0, v[2]); cover.y0 = Math.min(cover.y0 ?? 9, v[1]); cover.y1 = Math.max(cover.y1 ?? -9, v[1]); cover.mat = p.getMaterial(); cover.mesh = mesh; }
  }
  if (keep.length !== idx.length) { console.log('убрано треугольников надписи:', mesh.getName(), (idx.length - keep.length) / 3); p.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(keep))); }
}

// гладкая планка на месте выдавленных букв (17 точек по X, повторяет изгиб кормы)
if (cover.mesh) {
  const P = [], N = [], I = [];
  for (let i = 0; i <= 16; i++) {
    const x = -0.3 + i * 0.6 / 16, z = Math.min(cover[Math.min(15, i)] ?? 0, cover[Math.max(0, i - 1)] ?? 0) - 0.0015;
    P.push(x, cover.y0 + 0.002, z, x, cover.y1 - 0.002, z); N.push(0, 0, -1, 0, 0, -1);
    if (i < 16) { const a = i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const prim = doc.createPrimitive().setMaterial(cover.mat)
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(P)))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(N)))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(I)));
  prim.__plan = ['trim', 1, 0];
  const cm = doc.createMesh('trim_cover').addPrimitive(prim); groups.trim.addChild(doc.createNode('trim_cover').setMesh(cm));
}
// следы эмблем в запечённой тени кузова (шильдик модели на корме, герб на капоте): размыть участок текстуры
{
  const body = matByName.body_main, tex = body.getOcclusionTexture(), tc = body.getOcclusionTextureInfo().getTexCoord();
  const boxes = [{x: 0.22, y: [0.6, 0.67], z: [-9, -2.2]}, {x: 0.07, y: [0.6, 0.85], z: [1.9, 2.2]}], rects = [];
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) if (p.getMaterial() === body) {
    const pos = p.getAttribute('POSITION'), uv = p.getAttribute('TEXCOORD_' + tc), v = [0, 0, 0], t = [0, 0];
    boxes.forEach((b, bi) => { for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v);
      if (Math.abs(v[0]) < b.x && v[1] > b.y[0] && v[1] < b.y[1] && v[2] > b.z[0] && v[2] < b.z[1]) { uv.getElement(i, t); const r = rects[bi] ??= [9, 9, -9, -9]; r[0] = Math.min(r[0], t[0]); r[1] = Math.min(r[1], t[1]); r[2] = Math.max(r[2], t[0]); r[3] = Math.max(r[3], t[1]); } } });
  }
  let img = sharp(tex.getImage()); const [W, H] = tex.getSize(); const comps = [];
  for (const r of rects.filter(Boolean)) {
    const left = Math.max(0, Math.floor(r[0] * W) - 4), topPx = Math.max(0, Math.floor(r[1] * H) - 4), width = Math.min(W - left, Math.ceil((r[2] - r[0]) * W) + 8), height = Math.min(H - topPx, Math.ceil((r[3] - r[1]) * H) + 8);
    console.log('размыта тень эмблемы, uv-прямоугольник', left, topPx, width, height, 'texCoord', tc);
    if (width > 300 || height > 300) { console.log('  пропуск: слишком большой участок'); continue; }
    comps.push({input: await sharp(tex.getImage()).extract({left, top: topPx, width, height}).blur(14).toBuffer(), left, top: topPx});
  }
  if (comps.length) tex.setImage(await img.composite(comps).png().toBuffer());
}

// 5) облегчение по плану
await doc.transform(weld());
let before = 0, after = 0;
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
  const [, ratio, error] = p.__plan || [0, 1, 0];
  const c0 = p.getIndices().getCount() / 3; before += c0;
  if (ratio < 1) simplifyPrimitive(p, {simplifier: MeshoptSimplifier, ratio, error, lockBorder: false});
  after += p.getIndices().getCount() / 3;
}
console.log('tris', before, '→', after);
await doc.transform(join({keepNamed: false, keepMeshes: false}));

// 5a) «рентген»-оболочка: отдельная облегчённая копия кузова+стёкол и колёс без UV (рисуется своим шейдером)
{
  const gm = doc.createMaterial('ghost');
  const mk = (name, srcGroups, ratio, error) => {
    const mesh = doc.createMesh(name);
    for (const g of srcGroups) for (const child of groups[g].listChildren()) for (const p of child.getMesh().listPrimitives()) {
      if (/rim_chrome/.test(child.getName()) && false) continue;
      const q = p.clone(); for (const sem of q.listSemantics()) { if (sem !== 'POSITION' && sem !== 'NORMAL') q.setAttribute(sem, null); else q.setAttribute(sem, q.getAttribute(sem).clone()); }
      q.setIndices(q.getIndices().clone()); q.setMaterial(gm);
      simplifyPrimitive(q, {simplifier: MeshoptSimplifier, ratio, error}); compactPrimitive(q); mesh.addPrimitive(q);
    }
    const node = doc.createNode(name).setMesh(mesh); const gn = doc.createNode(name); gn.addChild(node); scene.addChild(gn); return gn;
  };
  groups.ghost = mk('ghost', ['paint', 'glass'], 0.36, 0.004);
  groups.ghostWheels = mk('ghostWheels', ['wheels'], 0.4, 0.004);
  await doc.transform(join({keepNamed: false, keepMeshes: false}));
}

// 6) тормоза: разделить на переднюю и заднюю ось (по центру треугольника)
const brakeNode = groups.brake;
for (const axle of ['brakeF', 'brakeR']) {
  const gn = doc.createNode(axle); scene.addChild(gn);
  for (const child of brakeNode.listChildren()) {
    const src = child.getMesh(); const mesh = doc.createMesh(`${axle}_${src.getName()}`);
    for (const p of src.listPrimitives()) {
      const idx = p.getIndices().getArray(), pos = p.getAttribute('POSITION'), keep = [], v = [0, 0, 0];
      for (let i = 0; i < idx.length; i += 3) {
        let z = 0; for (let k = 0; k < 3; k++) { pos.getElement(idx[i + k], v); z += v[2]; }
        if ((z > 0) === (axle === 'brakeF')) keep.push(idx[i], idx[i + 1], idx[i + 2]);
      }
      const q = p.clone(); q.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(keep)));
      for (const s of q.listSemantics()) q.setAttribute(s, q.getAttribute(s).clone());
      compactPrimitive(q); mesh.addPrimitive(q);
    }
    gn.addChild(doc.createNode(mesh.getName()).setMesh(mesh));
  }
}
brakeNode.dispose();

// 7) материалы и текстуры: салон без текстур, номер «DEMO», остальное ≤1024 WebP
for (const name of ['leather_int', 'bl_pl_M_int', 'reisin', 'bl_pl__GL_int_ext']) {
  const m = matByName[name]; if (!m) continue;
  if (name === 'leather_int' || name === 'bl_pl_M_int' || name === 'reisin') {
    m.setBaseColorTexture(null).setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null);
  }
  if (name === 'leather_int') m.setBaseColorFactor([0.035, 0.032, 0.03, 1]).setRoughnessFactor(0.62).setMetallicFactor(0);
  if (name === 'bl_pl_M_int') m.setBaseColorFactor([0.012, 0.012, 0.013, 1]).setRoughnessFactor(0.7);
}
for (const name of ['tires', 'Discs', 'brakes', 'rim_black', 'rim_chrome', 'pipes_chrom', 'reflectors', 'headlights_pattern', 'bl_pl_M_ext']) {
  const m = matByName[name]; if (!m) continue;
  if (name !== 'tires' && name !== 'headlights_pattern' && name !== 'reflectors') m.setNormalTexture(null);
}
const plateSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#e9e9e4"/>
<g font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" fill="#16171a" text-anchor="middle">
${Array.from({length: 4}, (_, r) => `<text transform="translate(512 ${r * 256 + 70}) scale(1 -1)" font-size="200" letter-spacing="24">DEMO</text>`).join('')}</g></svg>`;
const plate = matByName.number_plate1;
if (plate) {
  const tex = plate.getBaseColorTexture();
  tex.setImage(await sharp(Buffer.from(plateSvg)).png().toBuffer()).setMimeType('image/png');
  plate.setRoughnessFactor(0.55);
}
await doc.transform(prune(), dedup());
// размеры текстур
for (const t of root.listTextures()) {
  const users = t.listParents().map((p) => p.getName?.()).filter(Boolean).join('|');
  const [w] = t.getSize() || [0];
  const target = /body_main/.test(users) ? 2048 : /number_plate/.test(users) ? 512 : /tires|rim|brakes|bl_pl_M_ext/.test(users) ? 512 : 256;
  const img = await sharp(t.getImage()).resize(Math.min(w, target), Math.min(w, target)).webp({quality: /number_plate/.test(users) ? 90 : 78}).toBuffer();
  t.setImage(img).setMimeType('image/webp');
  console.log('tex', users, w, '→', Math.min(w, target), (img.length / 1024 | 0) + ' KB');
}
// замеры для сцены (до квантования): центры колёс, радиусы шин и дисков, выхлопные насадки
const measure = {};
const bbOf = (pred) => { const b = {min: [9, 9, 9], max: [-9, -9, -9]}; const v = [0, 0, 0];
  for (const n of root.listNodes()) { const m = n.getMesh(); if (!m) continue; for (const p of m.listPrimitives()) { const a = p.getAttribute('POSITION'); const idx = p.getIndices().getArray();
    for (let i = 0; i < idx.length; i++) { a.getElement(idx[i], v); if (!pred(n, p, v)) continue; for (let k = 0; k < 3; k++) { b.min[k] = Math.min(b.min[k], v[k]); b.max[k] = Math.max(b.max[k], v[k]); } } } }
  return {min: b.min.map((x) => +x.toFixed(4)), max: b.max.map((x) => +x.toFixed(4))}; };
for (const [k, sx, sz] of [['FL', -1, 1], ['FR', 1, 1], ['RL', -1, -1], ['RR', 1, -1]]) {
  measure['tire' + k] = bbOf((n, p, v) => p.getMaterial()?.getName() === 'tires' && v[0] * sx > 0 && v[2] * sz > 0);
  measure['disc' + k] = bbOf((n, p, v) => p.getMaterial()?.getName() === 'Discs' && v[0] * sx > 0 && v[2] * sz > 0);
  measure['caliper' + k] = bbOf((n, p, v) => p.getMaterial()?.getName() === 'brakes' && v[0] * sx > 0 && v[2] * sz > 0);
}
measure.pipesL = bbOf((n, p, v) => p.getMaterial()?.getName() === 'pipes_chrom' && v[0] < 0);
measure.pipesR = bbOf((n, p, v) => p.getMaterial()?.getName() === 'pipes_chrom' && v[0] > 0);
measure.paint = bbOf((n, p) => p.getMaterial()?.getName() === 'body_main');
measure.interior = bbOf((n) => n.getParentNode()?.getName() === 'interior');
// профиль кузова: по сечениям Z — нижняя и верхняя граница лака и полуширина (чтобы узлы не торчали из кузова)
measure.profile = [];
for (let z = -2.25; z <= 2.26; z += 0.15) { const b = bbOf((n, p, v) => p.getMaterial()?.getName() === 'body_main' && Math.abs(v[2] - z) < 0.075); measure.profile.push([+z.toFixed(2), b.min[1], b.max[1], b.max[0]]); }
doc.createExtension(ALL_EXTENSIONS.find((e) => e.EXTENSION_NAME === 'EXT_texture_webp')).setRequired(true);
await doc.transform(unpartition(), meshopt({encoder: MeshoptEncoder, level: 'high', quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12}));

fs.mkdirSync(OUT.replace(/\/[^/]+$/, ''), {recursive: true});
await io.write(OUT, doc);
let tris = 0, prims = 0; const per = {};
for (const n of root.listNodes()) { const m = n.getMesh(); if (!m) continue; for (const p of m.listPrimitives()) { const c = p.getIndices().getCount() / 3; tris += c; prims++; const g = n.getParentNode()?.getName() || n.getName(); per[g] = (per[g] || 0) + c; } }
const b = getBounds(scene);
console.log('OUT', OUT, (fs.statSync(OUT).size / 1024 | 0) + ' KB', 'tris', tris, 'primitives', prims, per);
console.log('bounds', b.min.map((v) => +v.toFixed(3)), b.max.map((v) => +v.toFixed(3)));
fs.writeFileSync(OUT.replace(/\.glb$/, '.json'), JSON.stringify({tris, primitives: prims, perGroup: per, bounds: b, kb: fs.statSync(OUT).size / 1024 | 0, measure, source: root.getAsset().extras}, null, 1));
