# build_v3.py — гараж «Glanzleistung» v3: M6 E64, станции, неон циан/маджента, эпоксидный пол.
import bpy, bmesh, math, os, random, sys
from mathutils import Vector, Matrix
sys.path.insert(0, '/home/claude/bay3d'); sys.path.insert(0, '/home/claude/bay3d/v3')
import build, build2, car_m6
from build import box, mat, obj_from_bm
from build2 import tex_mat, prop, PH

X0, X1 = -5.0, 3.3          # стены бокса по X (левая отодвинута — там станции)
GD, GH = 9.8, 3.2
YF = 1.0                    # передняя стена (ворота) отодвинута назад на YF м           # глубина, высота
DW, DH = 3.4, 2.6           # проём ворот (центр x=0)
CYAN = (0.0, 0.85, 1.0); MAGENTA = (1.0, 0.0, 0.75)
SURF = {}                   # пустые поверхности: имя → 4 угла (мир)

def emit(name, col, strength=0.0):
    return mat(name, (0.02, 0.02, 0.02), rough=0.5, emit=col, emit_strength=strength)

def spot(name, loc, target, energy=250, size=35, color=(1.0, 0.97, 0.94), blend=0.35):
    ld = bpy.data.lights.new(name, 'SPOT'); ld.energy = energy; ld.spot_size = math.radians(size); ld.spot_blend = blend
    ld.color = color; ld.shadow_soft_size = 0.08
    lo = bpy.data.objects.new(name, ld); bpy.context.scene.collection.objects.link(lo); lo.location = loc
    lo.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    ld.energy = energy * 2.6
    return lo

def cyl(name, r, depth, loc, material, rot=(0, 0, 0), seg=32, parent=None):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=depth)
    ob = obj_from_bm(name, bm, material, smooth=True, parent=parent); ob.location = loc; ob.rotation_euler = rot
    return ob

def named_prop(prefix, model, loc, rot_z, scale):
    r = prop(model, loc, rot_z, scale)
    for o in r.children_recursive:
        if o.type == 'MESH': o.name = f'{prefix}_{o.name}'
    return r

def wall_quad(name, cx, z, w, h, axis):
    """4 угла плоской поверхности на стене: axis='front' (плоскость y=const) или 'left' (x=const)."""
    if axis == 'front':
        y = cx[1]; x = cx[0]
        c = [(x - w / 2, y, z + h / 2), (x + w / 2, y, z + h / 2), (x + w / 2, y, z - h / 2), (x - w / 2, y, z - h / 2)]
    else:
        x = cx[0]; y = cx[1]
        c = [(x, y + w / 2, z + h / 2), (x, y - w / 2, z + h / 2), (x, y - w / 2, z - h / 2), (x, y + w / 2, z - h / 2)]
    SURF[name] = c

# ---------- материалы ----------
def floor_material():
    m = bpy.data.materials.new('epoxy'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; L = nt.links
    b = N['Principled BSDF']; tc = N.new('ShaderNodeTexCoord')
    vor = N.new('ShaderNodeTexVoronoi'); vor.inputs['Scale'].default_value = 140; vor.inputs['Randomness'].default_value = 1
    L.new(tc.outputs['Object'], vor.inputs['Vector'])
    ramp = N.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = (0.035, 0.037, 0.042, 1)
    e = ramp.color_ramp.elements.new(0.82); e.color = (0.035, 0.037, 0.042, 1)
    ramp.color_ramp.elements[-1].position = 0.9; ramp.color_ramp.elements[-1].color = (0.16, 0.17, 0.18, 1)
    L.new(vor.outputs['Color'], ramp.inputs['Fac'])  # случайная «крошка»
    L.new(ramp.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.35; b.inputs['Coat Weight'].default_value = 1.0; b.inputs['Coat Roughness'].default_value = 0.03
    return m

def map_material():
    m = bpy.data.materials.new('citymap'); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load('/home/claude/bay3d/v3/tex/citymap.png')
    nt.links.new(t.outputs['Color'], b.inputs['Base Color']); b.inputs['Roughness'].default_value = 0.6
    return m

def plane_uv(name, w, h, loc, rot, material):
    bm = bmesh.new()
    v = [bm.verts.new((-w / 2, 0, -h / 2)), bm.verts.new((w / 2, 0, -h / 2)), bm.verts.new((w / 2, 0, h / 2)), bm.verts.new((-w / 2, 0, h / 2))]
    f = bm.faces.new(v); uv = bm.loops.layers.uv.new()
    for l, c in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): l[uv].uv = c
    ob = obj_from_bm(name, bm, material); ob.location = loc; ob.rotation_euler = rot
    return ob

# ---------- шестиугольная решётка ----------
def hex_ceiling(area=(-2.6, 2.6, 0.6, 5.8)):
    M_HEX = build2.hex_material(); cells = []
    a = build2.HEX_A; w = math.sqrt(3) * a; z = GH - 0.03; r = 0; y = area[2]
    while y < area[3]:
        x = area[0] + (w / 2 if r % 2 else 0)
        while x < area[1]:
            bm = bmesh.new()
            for k in range(6):
                a0 = math.radians(60 * k + 30); a1 = math.radians(60 * (k + 1) + 30)
                p0 = Vector((a * math.cos(a0), a * math.sin(a0), 0)); p1 = Vector((a * math.cos(a1), a * math.sin(a1), 0))
                res = bmesh.ops.create_cube(bm, size=1.0); vs = res['verts']
                bmesh.ops.scale(bm, vec=Vector((a * 0.86, 0.045, 0.025)), verts=vs)
                bmesh.ops.rotate(bm, verts=vs, cent=Vector((0, 0, 0)), matrix=Matrix.Rotation(math.atan2(p1.y - p0.y, p1.x - p0.x), 3, 'Z'))
                bmesh.ops.translate(bm, verts=vs, vec=(p0 + p1) / 2)
            ob = obj_from_bm('hexcell', bm, M_HEX); ob.location = (x, y, z); cells.append(ob)
            x += w
        y += 1.5 * a; r += 1
    return cells

# ---------- станции ----------
def stations(M):
    lights = []
    # 1) неоновая рамка с пустой тёмной панелью (часы работы) — фронтальная стена слева от ворот
    cx, cz, w, h = -2.75, 1.95, 1.25, 0.85
    box('panel', (w, 0.03, h), (cx, 0.03 - YF, cz), mat('panel_dark', (0.012, 0.013, 0.016), rough=0.25))
    for (sx, sy, sz, px, pz) in ((w + 0.06, 0.03, 0.03, cx, cz + h / 2 + 0.03), (w + 0.06, 0.03, 0.03, cx, cz - h / 2 - 0.03),
                                 (0.03, 0.03, h + 0.06, cx - w / 2 - 0.03, cz), (0.03, 0.03, h + 0.06, cx + w / 2 + 0.03, cz)):
        box('neon_frame', (sx, sy, sz), (px, 0.05 - YF, pz), M['neon_c'])
    wall_quad('neon_panel', (cx, 0.046 - YF), cz, w, h, 'front')
    lights.append(spot('st_spot', (cx, 1.4 - YF, 3.1), (cx, -YF, cz), 120, 45))
    # 2) постер-карта в раме — фронтальная стена, левее
    cx, cz, w, h = -4.25, 1.85, 0.8, 1.06
    box('poster_frame', (w + 0.08, 0.04, h + 0.08), (cx, 0.02 - YF, cz), mat('frame_black', (0.01, 0.01, 0.01), rough=0.3))
    plane_uv('poster', w, h, (cx, 0.045 - YF, cz), (0, 0, math.pi), M['map'])
    wall_quad('poster_map', (cx, 0.046 - YF), cz, w, h, 'front')
    lights.append(spot('st_spot', (cx, 1.3 - YF, 3.1), (cx, -YF, cz), 110, 40))
    # 3) верстак у левой стены: принтер чеков + закрытая книга (+ стопка микрофибры)
    by = 1.2; bx = X0 + 0.32
    box('bench_top', (0.62, 1.8, 0.05), (bx, by, 0.9), M['steel_dark'])
    box('bench_body', (0.58, 1.76, 0.82), (bx, by, 0.45), M['cab'])
    for i in range(3): box('drawer_line', (0.005, 1.7, 0.004), (bx + 0.292, by, 0.25 + i * 0.25), M['steel'])
    # кассовый аппарат (Poly Haven CashRegister_01, CC0) + чек-«заказ» на подставке
    pr_y = by - 0.25
    named_prop('cashreg', 'CashRegister_01', (bx + 0.02, pr_y, 0.925), math.pi / 2, 0.72)
    ch_w, ch_h = 0.2, 0.28
    box('receipt_stand', (0.05, 0.18, 0.02), (bx + 0.02, by + 0.15, 0.935), M['steel_dark'])
    rc = plane_uv('receipt', ch_w, ch_h, (bx + 0.05, by + 0.15, 0.945 + ch_h / 2 * math.cos(math.radians(20))), (0, 0, -math.pi / 2), mat('paper', (0.86, 0.86, 0.84), rough=0.7))
    rc.rotation_euler = (0, math.radians(-20), -math.pi / 2)
    bpy.context.view_layer.update()
    SURF['receipt'] = [tuple(rc.matrix_world @ Vector(p)) for p in ((-ch_w / 2, 0, ch_h / 2), (ch_w / 2, 0, ch_h / 2), (ch_w / 2, 0, -ch_h / 2), (-ch_w / 2, 0, -ch_h / 2))]
    # гостевая книга: Poly Haven binder_notebook стоит, лицом к камере
    root = named_prop('book', 'binder_notebook', (bx + 0.0, by + 0.5, 0.925), 0.0, 1.35)
    root.rotation_euler = (0, math.radians(68), math.radians(40))
    bpy.context.view_layer.update()
    ms = [o for o in root.children_recursive if o.type == 'MESH']
    lo = min((o.matrix_world @ Vector(c)).z for o in ms for c in o.bound_box)
    root.location.z += 0.925 + 0.004 - lo; bpy.context.view_layer.update()
    inv = root.matrix_world.inverted()
    pts = [inv @ (o.matrix_world @ Vector(c)) for o in ms for c in o.bound_box]
    x0_, x1_ = min(p.x for p in pts), max(p.x for p in pts); y0_, y1_ = min(p.y for p in pts), max(p.y for p in pts); z1_ = max(p.z for p in pts)
    SURF['book_page'] = [tuple(root.matrix_world @ Vector(p)) for p in ((x0_, y1_, z1_), (x1_, y1_, z1_), (x1_, y0_, z1_), (x0_, y0_, z1_))]
    # стопка микрофибры
    for i, c in enumerate(((0.25, 0.27, 0.3), (0.05, 0.35, 0.45), (0.45, 0.05, 0.3), (0.2, 0.2, 0.22))):
        box('microfiber', (0.3, 0.3, 0.035), (bx + 0.02, by - 0.72, 0.945 + i * 0.036), mat(f'mf{i}', c, rough=0.95), rot=(0, 0, 0.05 * (i % 2)))
    lights.append(spot('st_spot', (bx + 1.0, by, 3.0), (bx, by, 0.95), 140, 50))
    # 4) полка над верстаком: рация (Poly Haven vintage_radio_transceiver), табличка на стене над ней
    box('shelf', (0.32, 1.3, 0.03), (X0 + 0.17, by, 1.85), M['steel_dark'])
    box('neon_under_shelf', (0.02, 1.2, 0.015), (X0 + 0.3, by, 1.825), M['neon_m'])
    named_prop('radio', 'vintage_radio_transceiver', (X0 + 0.19, by - 0.05, 1.865), math.pi / 2, 0.85)
    pw, ph_, pz_ = 0.42, 0.26, 2.3
    box('radio_plate', (0.02, pw, ph_), (X0 + 0.01, by - 0.05, pz_), mat('plate_dark', (0.012, 0.013, 0.016), rough=0.25))
    for (sy, sz, py, pz2) in ((pw + 0.04, 0.012, by - 0.05, pz_ + ph_ / 2 + 0.006), (pw + 0.04, 0.012, by - 0.05, pz_ - ph_ / 2 - 0.006)):
        box('radio_plate_edge', (0.026, sy, sz), (X0 + 0.012, py, pz2), M['neon_c'])
    wall_quad('radio_screen', (X0 + 0.022, by - 0.05), pz_, pw, ph_, 'left')
    # 5) электрощиток (дверца закрыта) — левая стена ближе к воротам
    pb = (X0 + 0.08, 0.3, 2.0)
    box('elbox', (0.14, 0.5, 0.7), pb, mat('elbox', (0.32, 0.33, 0.34), rough=0.45, metal=0.6))
    box('elbox_seam', (0.002, 0.004, 0.66), (pb[0] + 0.071, pb[1] + 0.15, pb[2]), mat('seam', (0.05, 0.05, 0.05)))
    box('elbox_handle', (0.02, 0.02, 0.08), (pb[0] + 0.08, pb[1] + 0.2, pb[2]), M['steel'])
    wall_quad('elbox', (pb[0] + 0.071, pb[1]), pb[2], 0.5, 0.7, 'left')
    lights.append(spot('st_spot', (X0 + 1.2, 0.5, 3.0), pb, 90, 35))
    # 6) стойка с рулонами плёнки (циан, маджента, фисташка, хром, графит)
    rk = (X0 + 0.55, 3.0)
    for dy in (-0.82, 0.82):
        box('rack_post', (0.05, 0.05, 1.9), (rk[0], rk[1] + dy, 0.95), M['steel_dark'])
        box('rack_foot', (0.5, 0.06, 0.04), (rk[0], rk[1] + dy, 0.02), M['steel_dark'])
    rolls = (((0.0, 0.75, 0.85), 0.25), ((0.85, 0.0, 0.55), 0.6), ((0.58, 0.78, 0.45), 0.95), ((0.9, 0.9, 0.92), 1.3), ((0.03, 0.03, 0.035), 1.65))
    for i, (c, zz) in enumerate(rolls):
        metal = 1.0 if i == 3 else 0.2
        cyl('film_roll', 0.075, 1.52, (rk[0], rk[1], zz), mat(f'film{i}', c, rough=0.15 if i == 3 else 0.25, metal=metal), rot=(math.pi / 2, 0, 0))
        cyl('film_core', 0.03, 1.6, (rk[0], rk[1], zz), M['steel'], rot=(math.pi / 2, 0, 0))
    SURF['film_rack'] = [(rk[0], rk[1] - 0.85, 1.9), (rk[0], rk[1] + 0.85, 1.9), (rk[0], rk[1] + 0.85, 0.0), (rk[0], rk[1] - 0.85, 0.0)]
    lights.append(spot('st_spot', (rk[0] + 1.3, rk[1], 3.0), (rk[0], rk[1], 0.9), 130, 50))
    return lights

def props(M):
    # тележка с инструментами
    prop('tool_cart', (2.3, 0.9, 0), rot_z=math.radians(200))
    # полировальная машинка на стойке
    pz = (1.95, 2.35)
    for k in range(3):
        a = 2 * math.pi * k / 3
        box('tripod_leg', (0.025, 0.025, 0.95), (pz[0] + 0.16 * math.cos(a), pz[1] + 0.16 * math.sin(a), 0.46), M['steel_dark'], rot=(0.17 * math.sin(a), -0.17 * math.cos(a), 0))
    cyl('stand_post', 0.018, 0.5, (pz[0], pz[1], 1.1), M['steel_dark'])
    cyl('polisher_body', 0.05, 0.3, (pz[0] + 0.12, pz[1], 1.37), mat('polisher', (0.03, 0.03, 0.035), rough=0.4), rot=(0, math.pi / 2, 0))
    cyl('polisher_head', 0.045, 0.1, (pz[0] + 0.28, pz[1], 1.32), mat('polisher'))
    cyl('polisher_pad', 0.075, 0.04, (pz[0] + 0.28, pz[1], 1.25), mat('pad', (0.9, 0.9, 0.92), rough=0.9))
    # пенная пушка (бутылка + распылитель) на тележке
    cyl('foam_bottle', 0.05, 0.2, (2.15, 0.75, 1.02), mat('hdpe', (0.85, 0.87, 0.9), rough=0.35))
    cyl('foam_head', 0.03, 0.08, (2.15, 0.75, 1.16), mat('polisher'))
    box('foam_nozzle', (0.14, 0.025, 0.025), (2.07, 0.75, 1.18), mat('polisher'))
    # генератор озона: кейс + шланг (на полу у верстака) — хотспот
    oz = (X0 + 0.9, 2.5, 0.0)
    box('ozone_case', (0.42, 0.3, 0.26), (oz[0], oz[1], 0.13), mat('ozone', (0.06, 0.065, 0.07), rough=0.35))
    box('ozone_handle', (0.16, 0.03, 0.03), (oz[0], oz[1], 0.29), M['steel_dark'])
    box('ozone_led', (0.05, 0.004, 0.012), (oz[0] + 0.1, oz[1] - 0.152, 0.2), M['neon_c'])
    bpy.ops.mesh.primitive_torus_add(major_radius=0.18, minor_radius=0.018, location=(oz[0] + 0.32, oz[1] - 0.1, 0.02))
    hose = bpy.context.active_object; hose.name = 'ozone_hose'; hose.data.materials.append(mat('hose', (0.02, 0.02, 0.02), rough=0.6))
    SURF['_ozone'] = [(oz[0], oz[1], 0.15)]
    # канистры без этикеток
    prop('plastic_jerrycan', (X0 + 0.35, 0.3, 0), rot_z=math.radians(80))
    prop('metal_jerrycan', (X0 + 0.8, 0.22, 0), rot_z=math.radians(95))

def build_world():
    M = {
        'neon_c': emit('neon_c', CYAN, 0), 'neon_m': emit('neon_m', MAGENTA, 0),
        'map': map_material(),
        'steel': mat('steel', (0.6, 0.6, 0.62), rough=0.3, metal=1.0),
        'steel_dark': mat('steel_dark', (0.05, 0.05, 0.055), rough=0.35, metal=0.8),
        'cab': mat('cab', (0.035, 0.036, 0.04), rough=0.4, metal=0.3),
    }
    M_WALL = tex_mat('g_wall3', 'painted_concrete', tile=3.0, tint=(0.11, 0.115, 0.13), bump=0.2)
    M_EXT = tex_mat('ext3', 'concrete_wall_006', tile=4.0, tint=(0.3, 0.3, 0.33))
    M_DOOR = mat('door', (0.08, 0.085, 0.09), rough=0.4, metal=0.7)
    t = 0.2; GW = X1 - X0; cxm = (X0 + X1) / 2
    box('floor', (GW + 2 * t, GD + YF + t, 0.1), (cxm, (GD - YF) / 2, -0.05), floor_material())
    box('ceiling', (GW + 2 * t, GD + YF + t, t), (cxm, (GD - YF) / 2, GH + t / 2), M_WALL)
    box('wall_back', (GW + 2 * t, t, GH), (cxm, GD + t / 2, GH / 2), M_WALL)
    box('wall_l', (t, GD + YF, GH), (X0 - t / 2, (GD - YF) / 2, GH / 2), M_WALL)
    box('wall_r', (t, GD + YF, GH), (X1 + t / 2, (GD - YF) / 2, GH / 2), M_WALL)
    lw = -DW / 2 - X0; rw = X1 - DW / 2
    box('front_l', (lw + t, t, GH), (X0 + lw / 2 - t / 2, -YF - t / 2, GH / 2), M_WALL)
    box('front_r', (rw + t, t, GH), (DW / 2 + rw / 2 + t / 2, -YF - t / 2, GH / 2), M_WALL)
    box('lintel', (DW, t, GH - DH), (0, -YF - t / 2, DH + (GH - DH) / 2), M_WALL)
    box('facade_top', (GW + 2 * t, t, 1.6), (cxm, -YF - t / 2 - 0.01, GH + 0.8), M_EXT)
    box('roof', (GW + 2 * t, GD + YF + t, 0.3), (cxm, (GD - YF) / 2, GH + 1.45), M_EXT)
    # неон: циан по низу стен, маджента — рамка проёма ворот (тонко)
    box('neon', (0.025, GD + YF - 0.4, 0.025), (X0 + 0.02, (GD - YF) / 2 + 0.1, 0.05), M['neon_c'])
    box('neon', (0.025, GD + YF - 0.4, 0.025), (X1 - 0.02, (GD - YF) / 2 + 0.1, 0.05), M['neon_c'])
    box('neon', (-DW / 2 - X0 - 0.2, 0.025, 0.025), ((X0 - DW / 2) / 2, -YF + 0.03, 0.05), M['neon_c'])
    box('neon', (GW - 0.1, 0.025, 0.025), (cxm, GD - 0.03, 0.05), M['neon_c'])
    box('neon_door', (DW + 0.1, 0.02, 0.02), (0, -YF + 0.04, DH + 0.04), M['neon_m'])
    leds = hex_ceiling()
    slats = [box('slat', (DW - 0.04, 0.05, 0.095), (0, -YF + 0.04, DH - 0.05 - i * 0.1), M_DOOR) for i in range(27)]
    st_lights = stations(M)
    props(M)
    # улица за воротами (видна только в интро до закрытия)
    box('road', (120, 40, 0.1), (0, -22 - YF, -0.05), tex_mat('road3', 'asphalt_02', tile=4.0, rough_mul=0.35, tint=(0.6, 0.6, 0.62), bump=0.5))
    box('sidewalk', (120, 2.0, 0.1), (0, -1.0 - YF, -0.03), tex_mat('walk3', 'concrete_wall_006', tile=2.0, rough_mul=0.6, tint=(0.45, 0.45, 0.47)))
    rnd = random.Random(7); x = -50.0
    M_WIN = mat('window_lit', (0.1, 0.08, 0.05), emit=(0.85, 0.85, 1.0), emit_strength=3.0)
    M_WIN_D = mat('window_dark', (0.01, 0.012, 0.015), rough=0.05)
    while x < 50:
        w = rnd.uniform(6, 11); h = rnd.uniform(9, 24)
        box('house', (w, 8, h), (x + w / 2, -22 - YF, h / 2), M_EXT)
        for fz in range(int((h - 1) // 3)):
            for fx in range(int(w // 2.2)):
                box('win', (1.1, 0.06, 1.4), (x + 1.1 + fx * 2.2, -17.98 - YF, 1.9 + fz * 3), M_WIN if rnd.random() < 0.22 else M_WIN_D)
        x += w + rnd.uniform(0.3, 2)
    for x in (-12.5, 9.5):
        ld = bpy.data.lights.new('street', 'SPOT'); ld.energy = 2500; ld.color = (0.85, 0.9, 1.0); ld.spot_size = math.radians(110); ld.spot_blend = 0.4
        lo = bpy.data.objects.new('street', ld); bpy.context.scene.collection.objects.link(lo); lo.location = (x, -3.05 - YF, 5.75)
    # общий свет бокса (мягкий, от решётки)
    glights = []
    for x in (-1.9, 0.0, 1.9):
        ld = bpy.data.lights.new('bay', 'AREA'); ld.energy = 0; ld.shape = 'RECTANGLE'; ld.size = 0.12; ld.size_y = 7.0
        ld.color = (0.93, 0.96, 1.0)
        lo = bpy.data.objects.new('bay', ld); bpy.context.scene.collection.objects.link(lo); lo.location = (x, 4.1, GH - 0.06)
        glights.append(lo)
    return slats, leds, glights, st_lights, M

def set_neon(k):
    for n in ('neon_c', 'neon_m'):
        bpy.data.materials[n].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 9 * k

def build_all(res=(540, 960), samples=24):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = build2.setup_render(res, samples)
    car, spins, meshes, wr = car_m6.import_car()
    beams = []
    for sy in (-1, 1):
        ld = bpy.data.lights.new('beam', 'SPOT'); ld.energy = 0; ld.spot_size = math.radians(60); ld.spot_blend = 0.6
        ld.color = (0.95, 0.97, 1.0)
        lo = bpy.data.objects.new('beam', ld); bpy.context.scene.collection.objects.link(lo)
        lo.parent = car; lo.location = (2.3, sy * 0.62, 0.68); lo.rotation_euler = (0, -math.radians(85), 0); beams.append(lo)
    slats, leds, glights, st_lights, M = build_world()
    cd = bpy.data.cameras.new('cam'); cd.lens = 22; cd.sensor_fit = 'VERTICAL'; cd.sensor_height = 24
    cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
    return dict(scene=sc, car=car, wheels=spins, wr=wr, beams=beams, slats=slats, leds=leds, glights=glights, st_lights=st_lights, cam=cam, meshes=meshes)
