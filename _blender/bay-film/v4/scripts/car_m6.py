# car_m6.py — "BMW M6 E64 Cabrio (WIP)" by obviously.csmx (CC BY 4.0, https://skfb.ly/pHKwT)
# Изменения: удалены эмблемы/логотипы, материалы заменены. Перед машины = +X, земля z=0,
# центр между осями. Колёса: шарнир по настоящей оси колеса, «спин» крутится по своей Y.
import bpy, math
import numpy as np
from mathutils import Vector

GLB = '/home/claude/bay3d/assets/m6.glb'
LENGTH = 4.87
DROP_OBJ = ('badge', 'logo', 'm_badges')
DROP_MAT = ('badges', 'pragovi', 'white.001')

def _verts_world(o):
    return np.array([tuple(o.matrix_world @ v.co) for v in o.data.vertices])

def _bbox(objs):
    P = np.vstack([np.array([tuple(o.matrix_world @ Vector(c)) for c in o.bound_box]) for o in objs])
    return P.min(0), P.max(0)

def P(m): return m.node_tree.nodes['Principled BSDF']

def import_car():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=GLB)
    new = [o for o in bpy.data.objects if o not in before]
    for o in list(new):
        if o.type != 'MESH': continue
        n = o.name.lower(); mats = ' '.join(m.name.lower() for m in o.data.materials if m)
        if any(k in n for k in DROP_OBJ) or any(k in mats for k in DROP_MAT):
            new.remove(o); bpy.data.objects.remove(o, do_unlink=True)
    meshes = [o for o in new if o.type == 'MESH']
    bpy.context.view_layer.update()
    tires = [o for o in meshes if o.name.startswith('TYRE')]
    tmn, tmx = _bbox(tires)
    centers = [(_bbox([t])[0] + _bbox([t])[1]) / 2 for t in tires]
    front_y = min(c[1] for c in centers); rear_y = max(c[1] for c in centers)
    mn, mx = _bbox(meshes)
    scale = LENGTH / (mx[1] - mn[1])
    # корень и модель: модель смотрит в −Y → поворот +90° вокруг Z (перед → +X)
    car = bpy.data.objects.new('Car', None); bpy.context.scene.collection.objects.link(car)
    model = bpy.data.objects.new('CarModel', None); bpy.context.scene.collection.objects.link(model)
    model.parent = car
    off = Vector((-(mn[0] + mx[0]) / 2, -(front_y + rear_y) / 2, -tmn[2]))
    model.matrix_basis = (__import__('mathutils').Matrix.Rotation(math.pi / 2, 4, 'Z') @
                          __import__('mathutils').Matrix.Scale(scale, 4) @
                          __import__('mathutils').Matrix.Translation(off))
    for o in [o for o in new if o.parent is None]:
        mw = o.matrix_world.copy(); o.parent = model; o.matrix_world = model.matrix_world @ mw
    bpy.context.view_layer.update()
    # колёса
    spins = []
    rot_parts = [o for o in meshes if o.name.startswith(('TYRE', 'Object_7', 'Object_8', 'Object_9', 'Object_29'))]
    radii = []
    for t in tires:
        V = _verts_world(t); c = V.mean(0)
        if c[2] - V[:, 2].min() > (V[:, 2].max() - V[:, 2].min()) * 0.6 or V[:, 2].min() > tmn[2] + 0.05:
            continue  # запаска в багажнике — не крутим
        radii.append((V[:, 2].max() - V[:, 2].min()) / 2)
        w, E = np.linalg.eigh(np.cov((V - c).T)); ax = Vector(E[:, 0])
        ax_l = (car.matrix_world.inverted().to_3x3() @ ax).normalized()
        if ax_l.y < 0: ax_l = -ax_l
        tilt = math.atan2(ax_l.z, ax_l.y)
        piv = bpy.data.objects.new('wheel_pivot', None); bpy.context.scene.collection.objects.link(piv)
        piv.parent = car; piv.location = car.matrix_world.inverted() @ Vector(c); piv.rotation_euler = (tilt, 0, 0)
        spin = bpy.data.objects.new('wheel_spin', None); bpy.context.scene.collection.objects.link(spin); spin.parent = piv
        bpy.context.view_layer.update()
        R = np.linalg.norm(V - c, axis=1).max()
        for p in rot_parts:
            pc = (_bbox([p])[0] + _bbox([p])[1]) / 2
            if np.linalg.norm(pc - c) < R * 0.8:
                mw = p.matrix_world.copy(); p.parent = spin; p.matrix_world = mw
        spins.append(spin)
    wr = float(np.mean(radii) * scale)
    materials(meshes)
    return car, spins, meshes, wr

def materials(meshes):
    M = bpy.data.materials
    # кузов: чёрный металлик + DIRT (пыль, разводы, паутина царапин)
    paints = [m for m in M if m.name.startswith('gls_ML_CH1_Circular')]
    for p in paints: paint_nodes(p); p['is_paint'] = True
    if 'wheel.001' in M: rim_nodes(M['wheel.001'])
    # тормозные диски: тёмная сталь (было: текстура приборки)
    disc = M.new('brake_disc'); disc.use_nodes = True; b = P(disc)
    b.inputs['Base Color'].default_value = (0.22, 0.22, 0.23, 1); b.inputs['Metallic'].default_value = 1.0
    b.inputs['Roughness'].default_value = 0.38; b.inputs['Anisotropic'].default_value = 0.5
    for o in meshes:
        if 'Brakes2' in o.name: o.data.materials.clear(); o.data.materials.append(disc)
    # шины: однотонная резина (надписи на текстуре убираем), DIRT делает её серой
    tire = M.new('tire_rubber'); tire.use_nodes = True; nt = tire.node_tree; b = P(tire)
    b.inputs['Roughness'].default_value = 0.72
    dv = nt.nodes.new('ShaderNodeValue'); dv.name = 'DIRT'
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    mix.inputs['A'].default_value = (0.012, 0.012, 0.013, 1); mix.inputs['B'].default_value = (0.09, 0.088, 0.085, 1)
    nt.links.new(dv.outputs[0], mix.inputs['Factor']); nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    for o in meshes:
        if o.name.startswith('TYRE'): o.data.materials.clear(); o.data.materials.append(tire)

def paint_nodes(m):
    """Чёрный металлик. DIRT=1: ровная лёгкая пыль (больше на горизонталях и внизу), лак тусклее,
    пара тонких царапин — только в шероховатости/нормали лака, т.е. видны лишь в бликах. DIRT=0: чистый лак."""
    nt = m.node_tree; N = nt.nodes; L = nt.links
    for n in list(N):
        if n.type not in ('BSDF_PRINCIPLED', 'OUTPUT_MATERIAL'): N.remove(n)
    b = P(m)
    b.inputs['Metallic'].default_value = 0.55; b.inputs['Roughness'].default_value = 0.32
    b.inputs['Coat Weight'].default_value = 1.0
    def node(t, **kw):
        n = N.new(t)
        for k, v in kw.items(): setattr(n, k, v)
        return n
    def mrange(src, a, b_, c=0.0, d=1.0):
        r = node('ShaderNodeMapRange'); r.clamp = True
        r.inputs['From Min'].default_value = a; r.inputs['From Max'].default_value = b_
        r.inputs['To Min'].default_value = c; r.inputs['To Max'].default_value = d
        L.new(src, r.inputs['Value']); return r.outputs['Result']
    def math(op, x, y, clamp=False):
        n = node('ShaderNodeMath', operation=op); n.use_clamp = clamp
        for i, v in enumerate((x, y)):
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: L.new(v, n.inputs[i])
        return n.outputs[0]
    dirt = N.new('ShaderNodeValue'); dirt.name = 'DIRT'; D = dirt.outputs[0]
    tc = N.new('ShaderNodeTexCoord'); geo = N.new('ShaderNodeNewGeometry')
    sepN = N.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs['Normal'], sepN.inputs[0])
    sepP = N.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs['Position'], sepP.inputs[0])
    up = mrange(sepN.outputs['Z'], 0.35, 0.9)                 # горизонтальные панели
    low = mrange(sepP.outputs['Z'], 0.55, 0.15)                # пороги/низ
    nz1 = node('ShaderNodeTexNoise'); nz1.inputs['Scale'].default_value = 1.1; nz1.inputs['Detail'].default_value = 3
    L.new(tc.outputs['Object'], nz1.inputs['Vector'])
    var = mrange(nz1.outputs['Fac'], 0.3, 0.7, 0.7, 1.0)      # мягкая неравномерность, без пятен
    nz2 = node('ShaderNodeTexNoise'); nz2.inputs['Scale'].default_value = 40; nz2.inputs['Detail'].default_value = 6
    L.new(tc.outputs['Object'], nz2.inputs['Vector'])
    fine = mrange(nz2.outputs['Fac'], 0.3, 0.7, 0.85, 1.0)    # мелкая зернистость пыли
    base = math('ADD', math('MULTIPLY', up, 0.28), math('MULTIPLY', low, 0.55))
    dust = math('MULTIPLY', math('MULTIPLY', math('ADD', base, 0.14), var), fine)
    dust = math('MULTIPLY', math('MINIMUM', dust, 1.0), D)
    col = node('ShaderNodeMix', data_type='RGBA')
    col.inputs['A'].default_value = (0.010, 0.010, 0.012, 1); col.inputs['B'].default_value = (0.11, 0.105, 0.098, 1)
    L.new(math('MULTIPLY', dust, 0.6), col.inputs['Factor']); L.new(col.outputs['Result'], b.inputs['Base Color'])
    # пара длинных тонких царапин: вытянутые ячейки Вороного (края = почти прямые линии), оставлены редкие отрезки
    def scratch_set(rot_deg, scale, seed):
        mp = node('ShaderNodeMapping'); L.new(tc.outputs['Object'], mp.inputs['Vector'])
        mp.inputs['Rotation'].default_value = (0, 0, __import__('math').radians(rot_deg))
        mp.inputs['Scale'].default_value = (1.0, 22.0, 1.0); mp.inputs['Location'].default_value = (seed, seed * 0.7, 0)
        v = node('ShaderNodeTexVoronoi', feature='DISTANCE_TO_EDGE'); v.inputs['Scale'].default_value = scale
        L.new(mp.outputs['Vector'], v.inputs['Vector'])
        ln = mrange(v.outputs['Distance'], 0.0, 0.10, 1.0, 0.0)
        kz = node('ShaderNodeTexNoise'); kz.inputs['Scale'].default_value = 1.7; kz.inputs['Detail'].default_value = 1
        L.new(mp.outputs['Vector'], kz.inputs['Vector'])
        kp = mrange(kz.outputs['Fac'], 0.62, 0.68)
        return math('MULTIPLY', ln, kp)
    s1 = scratch_set(25, 0.9, 3.1); s2 = scratch_set(-40, 0.7, 7.7)
    scr = math('MULTIPLY', math('MAXIMUM', s1, s2), D)
    # лак: шероховатость 0.015 (чистый) → +пыль, +царапины
    cr = math('ADD', math('ADD', 0.015, math('MULTIPLY', dust, 0.22)), math('MULTIPLY', D, 0.03))
    cr = math('ADD', cr, math('MULTIPLY', scr, 0.30), clamp=True)
    L.new(cr, b.inputs['Coat Roughness'])
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.15; bump.inputs['Distance'].default_value = 0.001
    L.new(scr, bump.inputs['Height']); L.new(bump.outputs['Normal'], b.inputs['Coat Normal'])

def rim_nodes(m):
    """Диск: DIRT=0 — как было (светлый графит, глянец); DIRT=1 — темнее, тормозная пыль, матовый."""
    nt = m.node_tree; N = nt.nodes; L = nt.links; b = P(m)
    clean = tuple(b.inputs['Base Color'].default_value)
    dirt = N.new('ShaderNodeValue'); dirt.name = 'DIRT'
    tc = N.new('ShaderNodeTexCoord'); nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 30; nz.inputs['Detail'].default_value = 6
    L.new(tc.outputs['Object'], nz.inputs['Vector'])
    f = N.new('ShaderNodeMath'); f.operation = 'MULTIPLY_ADD'; f.inputs[1].default_value = 0.5; f.inputs[2].default_value = 0.6
    L.new(nz.outputs['Fac'], f.inputs[0])
    k = N.new('ShaderNodeMath'); k.operation = 'MULTIPLY'; k.use_clamp = True
    L.new(f.outputs[0], k.inputs[0]); L.new(dirt.outputs[0], k.inputs[1])
    col = N.new('ShaderNodeMix'); col.data_type = 'RGBA'
    col.inputs['A'].default_value = clean; col.inputs['B'].default_value = (0.055, 0.047, 0.04, 1)
    L.new(k.outputs[0], col.inputs['Factor']); L.new(col.outputs['Result'], b.inputs['Base Color'])
    r = N.new('ShaderNodeMapRange'); r.inputs['To Min'].default_value = b.inputs['Roughness'].default_value; r.inputs['To Max'].default_value = 0.65
    L.new(k.outputs[0], r.inputs['Value']); L.new(r.outputs['Result'], b.inputs['Roughness'])
    mt = N.new('ShaderNodeMapRange'); mt.inputs['To Min'].default_value = b.inputs['Metallic'].default_value; mt.inputs['To Max'].default_value = 0.1
    L.new(k.outputs[0], mt.inputs['Value']); L.new(mt.outputs['Result'], b.inputs['Metallic'])

def set_dirt(v):
    for m in bpy.data.materials:
        if m.use_nodes and 'DIRT' in m.node_tree.nodes: m.node_tree.nodes['DIRT'].outputs[0].default_value = v
