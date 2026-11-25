# render_pkg.py — пакет v3: box-кадры, станции, маски, проходы, JSON, клипы.
#   python3 render_pkg.py TASK [args]      (одна задача за запуск; готовые файлы пропускаются)
#   TASK: box | stations | masks | passes | json | clip NAME [FRAMES]
import sys, os, json, math, bpy
sys.path.insert(0, '/home/claude/bay3d/v3'); sys.path.insert(0, '/home/claude/bay3d')
import build_v3, final_v3, stations as st, car_m6
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

OUT = '/home/claude/bay3d/v3/pkg'
LAMPE = float(os.environ.get('LAMPE', 150))
SPP = int(os.environ.get('SPP', 160))
BW, BH = 1440, 2560

def mk(p): os.makedirs(os.path.dirname(p), exist_ok=True); return p
def have(p): return os.path.exists(p) and os.path.getsize(p) > 1000

def render_to(S, path, spp=None):
    sc = S['scene']
    if spp: sc.cycles.samples = spp
    sc.render.filepath = mk(path); bpy.ops.render.render(write_still=True)

# ---------- классификация деталей машины ----------
def classify(S):
    car = S['car']; inv = car.matrix_world.inverted()
    groups = {k: [] for k in ('body', 'glass', 'wheels', 'tires', 'interior')}
    spin_children = set()
    for sp in S['wheels']:
        for c in sp.children_recursive: spin_children.add(c.name)
    for o in S['meshes']:
        if o.name not in bpy.data.objects: continue
        mats = [m.name for m in o.data.materials if m]
        if o.name.startswith('TYRE'): groups['tires'].append(o)
        elif o.name in spin_children: groups['wheels'].append(o)
        elif any(n.startswith('gls_ML_CH1_Circular') for n in mats): groups['body'].append(o)
        elif any(m.use_nodes and 'Principled BSDF' in m.node_tree.nodes and m.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value < 0.99 for m in o.data.materials if m): groups['glass'].append(o)
        else:
            c = inv @ ((o.matrix_world @ Vector(o.bound_box[0]) + o.matrix_world @ Vector(o.bound_box[6])) / 2)
            if -1.0 < c.x < 1.1 and abs(c.y) < 0.85 and 0.2 < c.z < 1.35: groups['interior'].append(o)
    return groups

def all_meshes(): return [o for o in bpy.data.objects if o.type == 'MESH']

class Override:
    """Временно заменяет материалы: fn(obj) -> material | None (None = не трогать)."""
    def __init__(self, fn):
        self.saved = []
        for o in all_meshes():
            m = fn(o)
            if m is None: continue
            self.saved.append((o, [s.material for s in o.material_slots]))
            for s in o.material_slots: s.material = m
    def restore(self):
        for o, mats in self.saved:
            for s, m in zip(o.material_slots, mats): s.material = m

def flat_mat(name, color):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL': nt.nodes.remove(n)
    e = nt.nodes.new('ShaderNodeEmission'); e.inputs['Color'].default_value = (*color, 1); e.inputs['Strength'].default_value = 1.0
    nt.links.new(e.outputs[0], nt.nodes['Material Output'].inputs['Surface']); return m

def principled_mat(name, base, metal=0.0, rough=0.5, coat=0.0, coat_rough=0.03):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*base, 1); b.inputs['Metallic'].default_value = metal; b.inputs['Roughness'].default_value = rough
    b.inputs['Coat Weight'].default_value = coat; b.inputs['Coat Roughness'].default_value = coat_rough
    return m

def normal_mat():
    m = bpy.data.materials.new('nrm'); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL': nt.nodes.remove(n)
    g = nt.nodes.new('ShaderNodeNewGeometry'); vt = nt.nodes.new('ShaderNodeVectorTransform')
    vt.vector_type = 'NORMAL'; vt.convert_from = 'WORLD'; vt.convert_to = 'CAMERA'
    nt.links.new(g.outputs['Normal'], vt.inputs[0])
    ma = nt.nodes.new('ShaderNodeVectorMath'); ma.operation = 'MULTIPLY_ADD'
    ma.inputs[1].default_value = (0.5, 0.5, 0.5); ma.inputs[2].default_value = (0.5, 0.5, 0.5)
    nt.links.new(vt.outputs[0], ma.inputs[0])
    e = nt.nodes.new('ShaderNodeEmission'); nt.links.new(ma.outputs[0], e.inputs['Color'])
    nt.links.new(e.outputs[0], nt.nodes['Material Output'].inputs['Surface']); return m

class Flat:
    """Режим плоских проходов: Standard, без шумодава, мало сэмплов."""
    def __init__(self, S, spp=12):
        self.sc = S['scene']; self.v = self.sc.view_settings.view_transform; self.d = self.sc.cycles.use_denoising; self.s = self.sc.cycles.samples
        self.sc.view_settings.view_transform = 'Standard'; self.sc.cycles.use_denoising = False; self.sc.cycles.samples = spp
        self.sc.render.use_motion_blur = False
        self.fog = []
    def end(self):
        self.sc.view_settings.view_transform = self.v; self.sc.cycles.use_denoising = self.d; self.sc.cycles.samples = self.s

# ---------- задачи ----------
def task_box(S):
    sc = S['scene']
    for tag, dirt in (('box_dirty', 1.0), ('box_clean', 0.0)):
        p = f'{OUT}/{tag}.png'
        if have(p): continue
        final_v3.pose_final(S, dirt); S['cam'].data.shift_x = 0; S['cam'].data.shift_y = 0
        render_to(S, p, SPP)

def task_box4k(S):
    p = f'{OUT}/box_4k.png'
    if have(p): return
    sc = S['scene']; sc.render.resolution_x, sc.render.resolution_y = 2160, 3840
    final_v3.pose_final(S, 0.0); render_to(S, p, SPP // 2 or 64)
    sc.render.resolution_x, sc.render.resolution_y = BW, BH

def task_stations(S):
    P = st.plan(S); data = {}
    jp = f'{OUT}/stations/stations.json'
    for name, p in P.items():
        png = f'{OUT}/stations/{name}.png'
        final_v3.pose_final(S, 0.0); st.apply(S, p)
        d = dict(p); d['corners'] = st.corners(S, p['surface']); data[name] = d
        if not have(png): render_to(S, png, SPP)
    st.reset(S); json.dump(data, open(mk(jp), 'w'), indent=2, ensure_ascii=False)

def task_masks(S):
    groups = classify(S); F = Flat(S, 12)
    final_v3.pose_final(S, 0.0); S['cam'].data.shift_x = 0; S['cam'].data.shift_y = 0
    world_str = S['scene'].world.node_tree.nodes['Background'].inputs['Strength'].default_value
    S['scene'].world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0
    white = flat_mat('m_white', (1, 1, 1)); black = flat_mat('m_black', (0, 0, 0))
    for name, objs in groups.items():
        p = f'{OUT}/masks/mask_{name}.png'
        if have(p): continue
        ids = {o.name for o in objs}
        ov = Override(lambda o: white if o.name in ids else black)
        render_to(S, p + '.raw.png'); ov.restore()
        from PIL import Image
        im = Image.open(p + '.raw.png').convert('L').point(lambda v: max(0, min(255, int((v - 18) * 255 / 200))))
        im.save(p); os.remove(p + '.raw.png')
    S['scene'].world.node_tree.nodes['Background'].inputs['Strength'].default_value = world_str
    F.end()
    json.dump({k: len(v) for k, v in groups.items()}, open(mk(f'{OUT}/masks/_counts.json'), 'w'))

def task_passes(S):
    groups = classify(S); body = {o.name for o in groups['body']}
    final_v3.pose_final(S, 0.0); S['cam'].data.shift_x = 0; S['cam'].data.shift_y = 0
    # диффузный свет: белый матовый кузов
    jobs = (('body_diffuse_light', principled_mat('p_diff', (0.8, 0.8, 0.8), 0.0, 1.0, 0.0), False, SPP),
            ('body_glossy', principled_mat('p_gloss', (0.0, 0.0, 0.0), 1.0, 0.04, 0.0), False, SPP),
            ('box_neutral', principled_mat('p_neutral', (0.45, 0.45, 0.47), 0.2, 0.35, 1.0, 0.03), False, SPP))
    for name, m, flat, spp in jobs:
        p = f'{OUT}/passes/{name}.png'
        if have(p): continue
        ov = Override(lambda o: m if o.name in body else None); render_to(S, p, spp); ov.restore()
    p = f'{OUT}/passes/body_normal.png'
    if not have(p):
        F = Flat(S, 16); nm = normal_mat(); ov = Override(lambda o: nm if o.name in body else flat_mat('m_bk', (0, 0, 0)))
        render_to(S, p, 16); ov.restore(); F.end()

def ray_hit(S, origin, direction, only_car=True):
    dg = bpy.context.evaluated_depsgraph_get()
    ok, loc, nrm, idx, ob, mw = S['scene'].ray_cast(dg, Vector(origin), Vector(direction).normalized())
    return (ok, loc, ob)

def hotspots(S):
    final_v3.pose_final(S, 0.0); S['cam'].data.shift_x = 0; S['cam'].data.shift_y = 0
    bpy.context.view_layer.update()
    car = S['car']; cam = S['cam']; sc = S['scene']; M = car.matrix_world
    def px(p):
        v = world_to_camera_view(sc, cam, Vector(p)); return [round(v.x * BW, 1), round((1 - v.y) * BH, 1)]
    def visible(p):  # луч от камеры попадает рядом с точкой
        d = (Vector(p) - cam.location); ok, loc, ob = ray_hit(S, cam.location, d); return ok and (loc - Vector(p)).length < 0.25
    def drop(lx, ly, z0=2.0):
        ok, loc, ob = ray_hit(S, M @ Vector((lx, ly, z0)), (0, 0, -1)); return loc if ok else M @ Vector((lx, ly, 0.9))
    out = {}
    hood = drop(1.45, 0.0); out['hood'] = hood
    best = None
    for sy in (-1, 1):
        fen = drop(1.5, sy * 0.72); sc_ = visible(fen); best = (fen, sy) if (best is None or sc_) else best
    out['front_fender'] = best[0]
    ws = [(sp.matrix_world.translation.copy(), (M.inverted() @ sp.matrix_world.translation)) for sp in S['wheels']]
    fw = [w for w in ws if w[1].x > 0]
    fw.sort(key=lambda w: (w[0] - cam.location).length); out['front_wheel'] = fw[0][0]
    seats = [drop(-0.15, sy * 0.38) for sy in (-1, 1)]
    seats.sort(key=lambda p: (p - cam.location).length); out['seat'] = seats[0]
    out['ozone_generator'] = Vector(build_v3.SURF['_ozone'][0])
    return {k: dict(world=[round(c, 3) for c in v], px=px(v)) for k, v in out.items()}, out

def task_json(S):
    hs, wp = hotspots(S)
    surf = {}
    for k, v in build_v3.SURF.items():
        if k.startswith('_'): continue
        pts = [(a_, b_) for a_, b_, _ in final_v3.project(S, v)]
        surf[k] = [[round(a_, 1), round(b_, 1)] for a_, b_ in st.order_quad(pts)]   # TL, TR, BR, BL
    box = {k: v for k, v in surf.items()}
    data = dict(image=[BW, BH], image_4k=[2160, 3840], camera=dict(pos=list(final_v3.CAM_POS), target=list(final_v3.CAM_TGT), lens=final_v3.LENS),
                surfaces=box, hotspots=hs)
    json.dump(data, open(mk(f'{OUT}/hotspots.json'), 'w'), indent=2, ensure_ascii=False)

# ---------- клипы ----------
def smooth(t): return t * t * (3 - 2 * t)

def clip_target(S, name):
    hs, wp = hotspots(S)
    cam0 = final_v3.CAM_POS
    if name == 'lack':
        tgt = wp['hood']; d = (cam0 - tgt); d.z = 0; d.normalize(); pos = tgt + d * 1.15 + Vector((0, 0, 0.55)); lens = 34
    elif name == 'wheel':
        tgt = wp['front_wheel']; d = (cam0 - tgt); d.z = 0; d.normalize(); pos = tgt + d * 1.2 + Vector((0, 0, 0.1)); lens = 34
    else:  # interior: центр салона сверху-сбоку, не вплотную
        tgt = S['car'].matrix_world @ Vector((-0.25, 0.0, 0.6)); d = (cam0 - tgt); d.z = 0; d.normalize()
        pos = tgt + d * 1.9 + Vector((0, 0, 2.3)); lens = 32
    return pos, tgt, lens

def set_cam(S, pos, tgt, lens):
    cam = S['cam']; cam.location = pos; cam.rotation_euler = (tgt - pos).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = lens
    cam.data.shift_x = 0; cam.data.shift_y = 0

def task_clip(S, name, frames=36, lamp=False):
    sc = S['scene']; sc.render.resolution_x, sc.render.resolution_y = 720, 1280
    sc.cycles.samples = int(os.environ.get('CSPP', 48))
    pos1, tgt1, lens1 = clip_target(S, name)
    pos0, tgt0, lens0 = final_v3.CAM_POS, final_v3.CAM_TGT, final_v3.LENS
    tag = f'box_to_{name}' + ('_lamp' if lamp else '')
    lampobj = None
    if lamp:
        ld = bpy.data.lights.new('lamp', 'AREA'); ld.shape = 'RECTANGLE'; ld.size = 1.0; ld.size_y = 0.08; ld.color = (1.0, 0.97, 0.9); ld.energy = 0
        lampobj = bpy.data.objects.new('lamp', ld); sc.collection.objects.link(lampobj)
        dd = pos1 - tgt1; dd.z = 0; dd.normalize(); lampobj.location = tgt1 + Vector((0, 0, 1.6)) + dd * -0.9; lampobj.rotation_euler = (0, 0, 0)
    for i in range(frames):
        p = f'{OUT}/clips/{tag}/f_{i:03d}.png'
        if have(p): continue
        t = smooth(i / (frames - 1))
        final_v3.pose_final(S, 1.0)
        pos = pos0.lerp(pos1, t); tgt = tgt0.lerp(tgt1, t); lens = lens0 * (lens1 / lens0) ** t
        set_cam(S, pos, tgt, lens)
        if lampobj: lampobj.data.energy = LAMPE * smooth(max(0.0, (i / (frames - 1) - 0.35) / 0.65))
        render_to(S, p)
    # последний кадр: чистый
    p = f'{OUT}/clips/{tag}/f_last_clean.png'
    if not have(p):
        final_v3.pose_final(S, 0.0); set_cam(S, pos1, tgt1, lens1)
        if lampobj: lampobj.data.energy = LAMPE
        render_to(S, p)

def task_lampstill(S):
    sc = S['scene']; sc.render.resolution_x, sc.render.resolution_y = 720, 1280
    pos1, tgt1, lens1 = clip_target(S, 'lack')
    ld = bpy.data.lights.new('lamp', 'AREA'); ld.shape = 'RECTANGLE'; ld.size = 1.0; ld.size_y = 0.08; ld.color = (1.0, 0.97, 0.9); ld.energy = LAMPE
    lo = bpy.data.objects.new('lamp', ld); sc.collection.objects.link(lo)
    dd = pos1 - tgt1; dd.z = 0; dd.normalize(); lo.location = tgt1 + Vector((0, 0, 1.6)) + dd * -0.9
    for tag, dirt in (('dirty', 1.0), ('clean', 0.0)):
        p = f'{OUT}/clips/box_to_lack_under_lamp_{tag}.png'
        if have(p): continue
        final_v3.pose_final(S, dirt); set_cam(S, pos1, tgt1, lens1); render_to(S, p, int(os.environ.get('CSPP', 48)))

if __name__ == '__main__':
    task = sys.argv[1]
    res = (BW, BH) if task not in ('clip', 'lampstill') else (720, 1280)
    S = build_v3.build_all(res, SPP)
    S['scene'].cycles.adaptive_threshold = 0.02
    if task == 'box': task_box(S)
    elif task == 'box4k': task_box4k(S)
    elif task == 'stations': task_stations(S)
    elif task == 'masks': task_masks(S)
    elif task == 'passes': task_passes(S)
    elif task == 'json': task_json(S)
    elif task == 'lampstill': task_lampstill(S)
    elif task == 'clip': task_clip(S, sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 36, lamp=(len(sys.argv) > 4 and sys.argv[4] == 'lamp'))
    print('DONE', task)
