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
    nt = m.node_tree; N = nt.nodes; L = nt.links
    for n in list(N):
        if n.type not in ('BSDF_PRINCIPLED', 'OUTPUT_MATERIAL'): N.remove(n)
    b = P(m)
    b.inputs['Metallic'].default_value = 0.55; b.inputs['Roughness'].default_value = 0.32
    b.inputs['Coat Weight'].default_value = 1.0
    dirt = N.new('ShaderNodeValue'); dirt.name = 'DIRT'
    tc = N.new('ShaderNodeTexCoord'); geo = N.new('ShaderNodeNewGeometry')
    sep = N.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs['Position'], sep.inputs[0])      # мировая высота, метры
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 6.0; nz.inputs['Detail'].default_value = 12; nz.inputs['Roughness'].default_value = 0.62
    L.new(tc.outputs['Object'], nz.inputs['Vector'])
    nzc = N.new('ShaderNodeMapRange'); nzc.inputs['From Min'].default_value = 0.42; nzc.inputs['From Max'].default_value = 0.68
    L.new(nz.outputs['Fac'], nzc.inputs['Value'])
    low = N.new('ShaderNodeMapRange'); low.inputs['From Min'].default_value = 1.05; low.inputs['From Max'].default_value = 0.25
    L.new(sep.outputs['Z'], low.inputs['Value'])
    lw = N.new('ShaderNodeMath'); lw.operation = 'MULTIPLY_ADD'; lw.inputs[1].default_value = 0.75; lw.inputs[2].default_value = 0.25
    L.new(low.outputs['Result'], lw.inputs[0])
    dm = N.new('ShaderNodeMath'); dm.operation = 'MULTIPLY'; L.new(nzc.outputs['Result'], dm.inputs[0]); L.new(lw.outputs['Value'], dm.inputs[1])
    spots = N.new('ShaderNodeTexVoronoi'); spots.inputs['Scale'].default_value = 9; L.new(tc.outputs['Object'], spots.inputs['Vector'])
    sr = N.new('ShaderNodeMapRange'); sr.inputs['From Min'].default_value = 0.16; sr.inputs['From Max'].default_value = 0.12
    sr.inputs['To Max'].default_value = 0.35
    L.new(spots.outputs['Distance'], sr.inputs['Value'])
    dsum = N.new('ShaderNodeMath'); dsum.operation = 'ADD'; dsum.use_clamp = True
    L.new(dm.outputs['Value'], dsum.inputs[0]); L.new(sr.outputs['Result'], dsum.inputs[1])
    dmask = N.new('ShaderNodeMath'); dmask.operation = 'MULTIPLY'; L.new(dsum.outputs['Value'], dmask.inputs[0]); L.new(dirt.outputs[0], dmask.inputs[1])
    dmask2 = N.new('ShaderNodeMath'); dmask2.operation = 'MULTIPLY'; dmask2.inputs[1].default_value = 0.8
    L.new(dmask.outputs['Value'], dmask2.inputs[0])
    base = N.new('ShaderNodeMix'); base.data_type = 'RGBA'
    base.inputs['A'].default_value = (0.010, 0.010, 0.012, 1); base.inputs['B'].default_value = (0.15, 0.14, 0.13, 1)
    L.new(dmask2.outputs['Value'], base.inputs['Factor']); L.new(base.outputs['Result'], b.inputs['Base Color'])
    # паутина царапин
    vor = N.new('ShaderNodeTexVoronoi'); vor.feature = 'DISTANCE_TO_EDGE'; vor.inputs['Scale'].default_value = 7
    L.new(tc.outputs['Object'], vor.inputs['Vector'])
    sc = N.new('ShaderNodeMapRange'); sc.inputs['From Min'].default_value = 0.0; sc.inputs['From Max'].default_value = 0.02
    sc.inputs['To Min'].default_value = 1.0; sc.inputs['To Max'].default_value = 0.0
    L.new(vor.outputs['Distance'], sc.inputs['Value'])
    scr = N.new('ShaderNodeMath'); scr.operation = 'MULTIPLY'; L.new(sc.outputs['Result'], scr.inputs[0]); L.new(dirt.outputs[0], scr.inputs[1])
    # шероховатость лака: 0.015 → 0.30, + царапины, + пыль
    cr = N.new('ShaderNodeMath'); cr.operation = 'MULTIPLY_ADD'; cr.inputs[1].default_value = 0.16; cr.inputs[2].default_value = 0.015
    L.new(dirt.outputs[0], cr.inputs[0])
    cr2 = N.new('ShaderNodeMath'); cr2.operation = 'MULTIPLY_ADD'; cr2.inputs[1].default_value = 0.45
    L.new(scr.outputs['Value'], cr2.inputs[0]); L.new(cr.outputs['Value'], cr2.inputs[2])
    cr3 = N.new('ShaderNodeMath'); cr3.operation = 'MULTIPLY_ADD'; cr3.inputs[1].default_value = 0.5; cr3.use_clamp = True
    L.new(dmask.outputs['Value'], cr3.inputs[0]); L.new(cr2.outputs['Value'], cr3.inputs[2])
    L.new(cr3.outputs['Value'], b.inputs['Coat Roughness'])
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.12; bump.inputs['Distance'].default_value = 0.002
    L.new(scr.outputs['Value'], bump.inputs['Height']); L.new(bump.outputs['Normal'], b.inputs['Coat Normal'])

def set_dirt(v):
    for m in bpy.data.materials:
        if m.use_nodes and 'DIRT' in m.node_tree.nodes: m.node_tree.nodes['DIRT'].outputs[0].default_value = v
