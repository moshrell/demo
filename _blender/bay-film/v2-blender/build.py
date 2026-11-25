# build.py — сцена «Bay» в Blender (bpy), всё процедурно, без скачанных моделей.
# Ось Y мира: от улицы (y<0) к гаражу (y>0). Пол гаража z=0, ворота на y=0.
import bpy, bmesh, math
from mathutils import Vector, Matrix, Euler

# ---------------- утилиты ----------------
def cr1d(keys, x):
    """Catmull-Rom по ключам [(x,v),...], x внутри диапазона."""
    if x <= keys[0][0]: return keys[0][1]
    if x >= keys[-1][0]: return keys[-1][1]
    for i in range(len(keys) - 1):
        if keys[i][0] <= x <= keys[i + 1][0]: break
    x0, v0 = keys[max(i - 1, 0)]; x1, v1 = keys[i]; x2, v2 = keys[i + 1]; x3, v3 = keys[min(i + 2, len(keys) - 1)]
    t = (x - x1) / (x2 - x1)
    m1 = (v2 - v0) / (x2 - x0) * (x2 - x1) if x2 != x0 else 0
    m2 = (v3 - v1) / (x3 - x1) * (x2 - x1) if x3 != x1 else 0
    t2, t3 = t * t, t * t * t
    return (2*t3 - 3*t2 + 1)*v1 + (t3 - 2*t2 + t)*m1 + (-2*t3 + 3*t2)*v2 + (t3 - t2)*m2

def sgnpow(v, p): return math.copysign(abs(v) ** p, v)

def mat(name, color=(0.03, 0.03, 0.035), rough=0.35, emit=None, emit_strength=0.0, metal=0.0, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit is not None:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = emit_strength
    return m

def obj_from_bm(name, bm, material=None, smooth=False, parent=None):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    if material: me.materials.append(material)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    if parent: ob.parent = parent
    return ob

def box(name, size, loc, material=None, parent=None, rot=(0, 0, 0)):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    ob = obj_from_bm(name, bm, material, parent=parent)
    ob.location = loc; ob.rotation_euler = rot
    return ob

def loft(rings, cap=True):
    bm = bmesh.new(); N = len(rings[0]); vs = []
    for r in rings: vs.append([bm.verts.new(p) for p in r])
    for i in range(len(rings) - 1):
        for k in range(N):
            a, b = vs[i][k], vs[i][(k + 1) % N]; c, d = vs[i + 1][(k + 1) % N], vs[i + 1][k]
            bm.faces.new((a, b, c, d))
    if cap:
        bm.faces.new(list(reversed(vs[0]))); bm.faces.new(vs[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

# ---------------- купе (обобщённое, без эмблем) ----------------
L = 4.55; WB = 2.73; AXR = 0.92; AXF = AXR + WB; WR = 0.33; TRACK = 1.52
ZT = [(0.00,0.80),(0.08,0.93),(0.35,0.99),(1.20,1.00),(1.45,0.985),(2.4,0.965),(3.45,0.95),(3.9,0.905),(4.3,0.83),(4.48,0.74),(4.55,0.62)]
ZB = [(0.00,0.42),(0.25,0.30),(0.70,0.22),(3.90,0.22),(4.35,0.27),(4.55,0.38)]
HW = [(0.00,0.74),(0.12,0.86),(0.55,0.92),(2.3,0.93),(3.8,0.92),(4.3,0.87),(4.48,0.78),(4.55,0.66)]
ROOF = [(1.16,1.00),(1.45,1.09),(1.95,1.28),(2.35,1.335),(2.85,1.33),(3.12,1.24),(3.40,1.05),(3.54,0.97)]

def body_ring(x, N=56):
    w, zt, zb = cr1d(HW, x), cr1d(ZT, x), cr1d(ZB, x)
    zc, hz = (zt + zb) / 2, (zt - zb) / 2; pts = []
    for k in range(N):
        th = 2 * math.pi * k / N; c, s = math.cos(th), math.sin(th)
        y = w * sgnpow(c, 0.42); z = zc + hz * sgnpow(s, 0.45 if s > 0 else 0.25)
        u = (z - zc) / hz
        if u > 0: y *= 1 - 0.13 * u * u
        else: y *= 1 - 0.07 * (-u) ** 3
        pts.append((x - L / 2, y, z))
    return pts

def glass_ring(x, N=40):
    zb = cr1d(ZT, x) - 0.02; zr = max(cr1d(ROOF, x), zb + 0.03)
    zc, hz = (zb + zr) / 2, (zr - zb) / 2; pts = []
    for k in range(N):
        th = 2 * math.pi * k / N; c, s = math.cos(th), math.sin(th)
        z = zc + hz * sgnpow(s, 0.55)
        f = (z - zb) / (zr - zb)
        y = sgnpow(c, 0.5) * (0.74 * (1 - f) + 0.60 * f)
        pts.append((x - L / 2, y, z))
    return pts

def build_car():
    root = bpy.data.objects.new('Car', None); bpy.context.scene.collection.objects.link(root)
    M_BODY = mat('car_body', (0.045, 0.05, 0.06), rough=0.22, metal=0.3)
    M_GLASS = mat('car_glass', (0.005, 0.006, 0.008), rough=0.05)
    M_TIRE = mat('tire', (0.015, 0.015, 0.015), rough=0.8)
    M_RIM = mat('rim', (0.25, 0.25, 0.27), rough=0.3, metal=1.0)
    M_HEAD = mat('headlamp', (1, 1, 1), emit=(1.0, 0.96, 0.88), emit_strength=0.0)
    M_TAIL = mat('taillamp', (0.2, 0.0, 0.0), emit=(1.0, 0.05, 0.08), emit_strength=0.0)

    xs = sorted(set([round(L * (0.5 - 0.5 * math.cos(math.pi * i / 70)), 4) for i in range(71)] + [1.45, 3.15]))
    N = 56
    bm = loft([body_ring(x, N) for x in xs])
    bm.verts.ensure_lookup_table()
    def V(i, k): return bm.verts[i * N + (k % N)]
    marks = []
    # линия плеча: продольное ребро на уровне u≈0.55 (обе стороны)
    for kk in (int(N * 0.07), N - int(N * 0.07)):
        for i in range(len(xs) - 1):
            if 0.45 < xs[i] < 3.85: marks.append((V(i, kk), V(i + 1, kk)))
    # стыки двери: кольцо по боку между порогом и поясом
    for xd in (1.45, 3.15):
        i = xs.index(xd)
        for k in list(range(-int(N * 0.20), int(N * 0.06))) + list(range(N // 2 - int(N * 0.06), N // 2 + int(N * 0.20))):
            marks.append((V(i, k), V(i, k + 1)))
    keys = set(tuple(sorted((a.index, b.index))) for a, b in marks)
    body = obj_from_bm('car_body', bm, M_BODY, smooth=True, parent=root)
    me = body.data
    att = me.attributes.get('freestyle_edge') or me.attributes.new('freestyle_edge', 'BOOLEAN', 'EDGE')
    for e in me.edges:
        if tuple(sorted(e.vertices)) in keys: att.data[e.index].value = True
    sub = body.modifiers.new('sub', 'SUBSURF'); sub.levels = 1; sub.render_levels = 2
    for ax in (AXR, AXF):   # арки колёс: по резаку на каждую сторону, тоннеля насквозь нет
        for sy in (-1, 1):
            bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=0.40, radius2=0.40, depth=0.7)
            me = bpy.data.meshes.new('arch'); bm.to_mesh(me); bm.free()
            cutter = bpy.data.objects.new('arch_cut', me); bpy.context.scene.collection.objects.link(cutter)
            cutter.location = (ax - L / 2, sy * 0.92, WR + 0.02); cutter.rotation_euler = (math.pi / 2, 0, 0)
            cutter.parent = root; cutter.hide_render = True; cutter.display_type = 'WIRE'
            bo = body.modifiers.new('arch', 'BOOLEAN'); bo.object = cutter; bo.solver = 'EXACT'
    gx = [1.16 + (3.54 - 1.16) * i / 40 for i in range(41)]
    glass = obj_from_bm('car_glass', loft([glass_ring(x) for x in gx]), M_GLASS, smooth=True, parent=root)
    gs = glass.modifiers.new('sub', 'SUBSURF'); gs.levels = 1; gs.render_levels = 2
    # фары, фонари, зеркала, решётка-воздухозаборник (без почек)
    for sy in (-1, 1):
        box('headlamp', (0.16, 0.30, 0.025), (L / 2 - 0.17, sy * 0.57, 0.775), M_HEAD, root, rot=(0, 0.42, -sy * 0.28))
        box('taillamp', (0.08, 0.38, 0.07), (-L / 2 + 0.07, sy * 0.57, 0.875), M_TAIL, root, rot=(0, -0.2, sy * 0.25))
        pass  # box('mirror', (0.13, 0.09, 0.08), (1.02, sy * 0.88, 1.03), M_BODY, root, rot=(0, 0, sy * 0.25))
        pass  # box('mirror_arm', (0.06, 0.08, 0.03), (1.0, sy * 0.81, 0.99), M_BODY, root)
    box('intake', (0.06, 1.1, 0.13), (L / 2 - 0.06, 0, 0.36), M_GLASS, root)
    for zz in (0.55, 0.60):   # тонкая горизонтальная решётка между фарами (нейтральная, без «почек»)
        box('grille', (0.05, 0.62, 0.012), (L / 2 - 0.06, 0, zz), M_GLASS, root)
    # колёса
    wheels = []
    for ax in (AXR, AXF):
        for sy in (-1, 1):
            w = bpy.data.objects.new('wheel', None); bpy.context.scene.collection.objects.link(w)
            w.parent = root; w.location = (ax - L / 2, sy * TRACK / 2, WR)
            bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=WR, radius2=WR, depth=0.24)
            tire = obj_from_bm('tire', bm, M_TIRE, smooth=True, parent=w); tire.rotation_euler = (math.pi / 2, 0, 0)
            bv = tire.modifiers.new('bev', 'BEVEL'); bv.width = 0.05; bv.segments = 3
            bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=40, radius1=0.235, radius2=0.235, depth=0.03)
            rim = obj_from_bm('rim', bm, M_RIM, parent=w); rim.rotation_euler = (math.pi / 2, 0, 0); rim.location = (0, sy * 0.115, 0)
            spin = bpy.data.objects.new('spin', None); bpy.context.scene.collection.objects.link(spin); spin.parent = w
            for k in range(5):
                a = 2 * math.pi * k / 5
                sp = box('spoke', (0.05, 0.03, 0.20), (0.11 * math.sin(a), sy * 0.135, 0.11 * math.cos(a)), M_RIM, spin, rot=(0, a, 0))
            hub = box('hub', (0.07, 0.04, 0.07), (0, sy * 0.14, 0), M_RIM, spin)
            wheels.append(spin)
    # свет фар (споты) — включаются позже
    beams = []
    for sy in (-1, 1):
        ld = bpy.data.lights.new('beam', 'SPOT'); ld.energy = 0; ld.spot_size = math.radians(55); ld.spot_blend = 0.5
        ld.color = (1.0, 0.95, 0.85); ld.shadow_soft_size = 0.05
        lo = bpy.data.objects.new('beam', ld); bpy.context.scene.collection.objects.link(lo)
        lo.parent = root; lo.location = (L / 2 - 0.05, sy * 0.58, 0.72); lo.rotation_euler = (0, math.radians(90 + 6), 0)
        beams.append(lo)
    return root, wheels, beams

# ---------------- гараж и улица ----------------
GW, GD, GH = 6.4, 8.4, 3.1          # ширина, глубина, высота бокса
DW, DH = 3.2, 2.55                  # проём ворот

def build_world():
    M_WALL = mat('wall', (0.05, 0.05, 0.055), rough=0.8)
    M_FLOOR = mat('floor', (0.03, 0.03, 0.035), rough=0.32)
    M_ROAD = mat('road', (0.02, 0.02, 0.022), rough=0.6)
    M_DOOR = mat('door', (0.06, 0.06, 0.065), rough=0.5, metal=0.4)
    M_LED = mat('led', (1, 1, 1), emit=(0.95, 0.97, 1.0), emit_strength=0.0)
    M_WIN = mat('window_lit', (0.1, 0.08, 0.05), emit=(1.0, 0.72, 0.42), emit_strength=2.0)
    M_LAMP = mat('streetlamp', (1, 1, 1), emit=(1.0, 0.7, 0.4), emit_strength=6.0)
    t = 0.2
    # бокс
    box('floor', (GW + 2 * t, GD + t, 0.1), (0, GD / 2, -0.05), M_FLOOR)
    box('ceiling', (GW + 2 * t, GD + t, t), (0, GD / 2, GH + t / 2), M_WALL)
    box('wall_back', (GW + 2 * t, t, GH), (0, GD + t / 2, GH / 2), M_WALL)
    box('wall_l', (t, GD, GH), (-GW / 2 - t / 2, GD / 2, GH / 2), M_WALL)
    box('wall_r', (t, GD, GH), (GW / 2 + t / 2, GD / 2, GH / 2), M_WALL)
    side = (GW - DW) / 2
    box('front_l', (side + t, t, GH), (-(DW / 2 + side / 2) - t / 2, -t / 2, GH / 2), M_WALL)
    box('front_r', (side + t, t, GH), ((DW / 2 + side / 2) + t / 2, -t / 2, GH / 2), M_WALL)
    box('lintel', (DW, t, GH - DH), (0, -t / 2, DH + (GH - DH) / 2), M_WALL)
    box('facade_top', (GW + 2 * t, t, 1.4), (0, -t / 2, GH + 0.7), M_WALL)
    box('sign', (3.6, 0.08, 0.6), (0, -t - 0.04, GH + 0.65), M_DOOR)
    # фасады соседей
    for x0, w, h in ((-11.5, 10, 9), (11.5, 10, 13)):
        box('neighbor', (w, 6, h), (x0, 3, h / 2), M_WALL)
    # интерьер: светодиодные полосы, стеллаж, стойка шин, разметка
    leds = []
    for x in (-1.9, 0.0, 1.9):
        leds.append(box('led', (0.12, GD - 1.6, 0.04), (x, GD / 2 + 0.4, GH - 0.03), M_LED))
    for i in range(4):
        box('shelf', (0.5, 2.4, 0.04), (-GW / 2 + 0.3, GD - 2.2, 0.5 + i * 0.55), M_DOOR)
    box('shelf_post', (0.5, 0.05, 2.3), (-GW / 2 + 0.3, GD - 3.4, 1.15), M_DOOR)
    box('shelf_post', (0.5, 0.05, 2.3), (-GW / 2 + 0.3, GD - 1.0, 1.15), M_DOOR)
    for i in range(4):   # шины стопкой
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.32, radius2=0.32, depth=0.22)
        ob = obj_from_bm('tire_stack', bm, mat('tire'), smooth=True); ob.location = (GW / 2 - 0.5, GD - 1.2, 0.11 + i * 0.23)
    box('bench', (0.6, 2.0, 0.9), (GW / 2 - 0.35, GD - 3.6, 0.45), M_DOOR)
    for x in (-1.3, 1.3):
        box('floor_line', (0.08, 5.5, 0.004), (x, 4.0, 0.002), mat('paint', (0.5, 0.5, 0.48), rough=0.6))
    # рольставня: пластины
    slats = []
    for i in range(26):
        slats.append(box('slat', (DW - 0.05, 0.06, 0.098), (0, 0.05, DH - 0.05 - i * 0.1), M_DOOR))
    # улица
    box('road', (90, 30, 0.1), (0, -15 - 2.0, -0.05), M_ROAD)
    box('sidewalk', (90, 2.0, 0.08), (0, -1.0, 0.0), M_WALL)
    for x0, x1 in ((-45, -2.6), (2.6, 45)):
        box('curb', (x1 - x0, 0.18, 0.14), ((x0 + x1) / 2, -2.05, 0.05), M_WALL)
    for x in range(-40, 41, 6):
        box('lane', (3.0, 0.12, 0.004), (x, -8.0, 0.002), mat('paint'))
    import random; rnd = random.Random(7)
    x = -45.0
    while x < 45:   # дома через дорогу с окнами
        w = rnd.uniform(5, 10); h = rnd.uniform(7, 22)
        box('house', (w, 8, h), (x + w / 2, -22, h / 2), M_WALL)
        for fz in range(int(h // 3)):
            for fx in range(int(w // 2.2)):
                lit = rnd.random() < 0.18
                box('win', (1.0, 0.05, 1.3), (x + 1.1 + fx * 2.2, -17.97, 1.8 + fz * 3), M_WIN if lit else M_FLOOR)
        x += w + rnd.uniform(0.3, 2)
    lamps = []
    for x in (-13, 9):
        box('pole', (0.12, 0.12, 6.0), (x, -1.7, 3.0), M_DOOR)
        box('arm', (0.1, 1.4, 0.1), (x, -2.4, 5.95), M_DOOR)
        box('lamp_head', (0.4, 0.6, 0.12), (x, -3.0, 5.88), M_LAMP)
        ld = bpy.data.lights.new('street', 'POINT'); ld.energy = 900; ld.color = (1.0, 0.7, 0.42); ld.shadow_soft_size = 0.3
        lo = bpy.data.objects.new('street', ld); bpy.context.scene.collection.objects.link(lo); lo.location = (x, -3.0, 5.6)
    # свет бокса (включается в финале)
    garage_lights = []
    for x in (-1.9, 0.0, 1.9):
        ld = bpy.data.lights.new('bay', 'AREA'); ld.energy = 0; ld.shape = 'RECTANGLE'; ld.size = 0.15; ld.size_y = GD - 1.6
        ld.color = (0.92, 0.95, 1.0)
        lo = bpy.data.objects.new('bay', ld); bpy.context.scene.collection.objects.link(lo); lo.location = (x, GD / 2 + 0.4, GH - 0.08)
        garage_lights.append(lo)
    return slats, leds, garage_lights

# ---------------- рендер-настройки и линии ----------------
def setup_render(res_x=720, res_y=1280, samples=24):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = res_x, res_y
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
    w = bpy.data.worlds.new('night'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.006, 0.008, 0.016, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
    sc.render.use_freestyle = True; sc.render.line_thickness_mode = 'RELATIVE'
    vl = sc.view_layers[0]; fs = vl.freestyle_settings
    fs.crease_angle = math.radians(140)
    ls = fs.linesets[0] if fs.linesets else fs.linesets.new('L')
    ls.linestyle = ls.linestyle or bpy.data.linestyles.new('LS')
    ls.select_silhouette = True; ls.select_border = True; ls.select_edge_mark = True; ls.select_crease = True; ls.select_external_contour = True
    ls.linestyle.color = (0.93, 0.89, 0.82); ls.linestyle.thickness = 1.4
    return sc

def build_all(res=(720, 1280), samples=24):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = setup_render(*res, samples)
    car, wheels, beams = build_car()
    slats, leds, glights = build_world()
    cd = bpy.data.cameras.new('cam'); cd.lens = 26; cd.sensor_fit = 'VERTICAL'; cd.sensor_height = 24
    cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
    return dict(scene=sc, car=car, wheels=wheels, beams=beams, slats=slats, leds=leds, glights=glights, cam=cam)
