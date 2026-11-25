# build2.py — сцена v2: модель E34 (CC BY, Myedsu) + CC0-ассеты Poly Haven.
import bpy, bmesh, math, os, random
from mathutils import Vector
import build
from build import box, mat, obj_from_bm
import car_import

PH = '/home/claude/bay3d/assets/ph'
GW, GD, GH = 6.6, 9.8, 3.2
DW, DH = 3.4, 2.6

# ---------- материалы с текстурами (проекция «коробкой» по координатам объекта) ----------
def tex_mat(name, tex, tile=2.0, rough_mul=1.0, tint=(1, 1, 1), bump=0.3, coat=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; Lk = nt.links
    bsdf = N['Principled BSDF']
    tc = N.new('ShaderNodeTexCoord'); mp = N.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1 / tile, 1 / tile, 1 / tile)
    Lk.new(tc.outputs['Object'], mp.inputs['Vector'])
    def img(kind, non_color=False):
        p = f'{PH}/tex/{tex}_{kind}.jpg'
        if not os.path.exists(p): return None
        n = N.new('ShaderNodeTexImage'); n.image = bpy.data.images.load(p, check_existing=True)
        n.projection = 'BOX'; n.projection_blend = 0.25
        if non_color: n.image.colorspace_settings.name = 'Non-Color'
        Lk.new(mp.outputs['Vector'], n.inputs['Vector']); return n
    d = img('diff')
    if d:
        mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1.0
        mix.inputs['B'].default_value = (*tint, 1)
        Lk.new(d.outputs['Color'], mix.inputs['A']); Lk.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    r = img('rough', True)
    if r:
        mm = N.new('ShaderNodeMath'); mm.operation = 'MULTIPLY'; mm.inputs[1].default_value = rough_mul
        Lk.new(r.outputs['Color'], mm.inputs[0]); Lk.new(mm.outputs['Value'], bsdf.inputs['Roughness'])
    n = img('nor', True)
    if n:
        nm = N.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = bump
        Lk.new(n.outputs['Color'], nm.inputs['Color']); Lk.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    if coat:
        bsdf.inputs['Coat Weight'].default_value = coat; bsdf.inputs['Coat Roughness'].default_value = 0.05
    return m

def import_gltf(path, loc, rot_z=0.0, scale=1.0):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    root = bpy.data.objects.new('prop', None); bpy.context.scene.collection.objects.link(root)
    for o in new:
        if o.parent is None: o.parent = root
    root.location = loc; root.rotation_euler = (0, 0, rot_z); root.scale = (scale,) * 3
    return root

def prop(name, loc, rot_z=0.0, scale=1.0):
    return import_gltf(f'{PH}/models/{name}/{name}.gltf', loc, rot_z, scale)

# ---------- машина: материалы ----------
def car_materials():
    M = bpy.data.materials
    def P(m): return m.node_tree.nodes['Principled BSDF']
    if 'body_paint' in M:                       # красный лак: DIRT=0 полировка, DIRT=1 пыль и паутина царапин
        paint_nodes(M['body_paint'])
    for n in M:
        if not n.use_nodes or 'Principled BSDF' not in n.node_tree.nodes: continue
        b = P(n); nm = n.name
        if nm.startswith('tire'):
            b.inputs['Base Color'].default_value = (0.018, 0.018, 0.018, 1); b.inputs['Metallic'].default_value = 0; b.inputs['Roughness'].default_value = 0.78
        elif nm.startswith('disk_paint'):
            b.inputs['Base Color'].default_value = (0.02, 0.02, 0.022, 1); b.inputs['Metallic'].default_value = 0.4; b.inputs['Roughness'].default_value = 0.35
        elif nm.startswith('disk') and 'brake' not in nm:
            b.inputs['Base Color'].default_value = (0.7, 0.7, 0.72, 1); b.inputs['Metallic'].default_value = 1; b.inputs['Roughness'].default_value = 0.22
        elif nm in ('body_plastic', 'win_frame', 'body_focus', 'material_35') or nm.startswith('blt'):
            b.inputs['Base Color'].default_value = (0.012, 0.012, 0.013, 1); b.inputs['Metallic'].default_value = 0; b.inputs['Roughness'].default_value = 0.55
        elif nm == 'material':                  # стёкла
            b.inputs['Base Color'].default_value = (0.02, 0.022, 0.025, 1); b.inputs['Roughness'].default_value = 0.02
            b.inputs['Metallic'].default_value = 0; b.inputs['Alpha'].default_value = 0.8; b.inputs['Coat Weight'].default_value = 0.0
        elif nm == 'Material.013':              # «лампы» внутри фар — светятся
            b.inputs['Emission Color'].default_value = (1.0, 0.92, 0.78, 1)

def paint_nodes(m):
    nt = m.node_tree; N = nt.nodes; L = nt.links; b = N['Principled BSDF']
    for i in list(b.inputs['Base Color'].links): L.remove(i)
    b.inputs['Metallic'].default_value = 0.0; b.inputs['Roughness'].default_value = 0.3
    dirt = N.new('ShaderNodeValue'); dirt.name = 'DIRT'; dirt.outputs[0].default_value = 0.0
    tc = N.new('ShaderNodeTexCoord')
    sep = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], sep.inputs[0])
    # пыль: шум × «ниже — больше»
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 9; nz.inputs['Detail'].default_value = 8
    L.new(tc.outputs['Object'], nz.inputs['Vector'])
    low = N.new('ShaderNodeMapRange'); low.inputs['From Min'].default_value = 1.1; low.inputs['From Max'].default_value = 0.2
    L.new(sep.outputs['Z'], low.inputs['Value'])
    dm = N.new('ShaderNodeMath'); dm.operation = 'MULTIPLY'; L.new(nz.outputs['Fac'], dm.inputs[0]); L.new(low.outputs['Result'], dm.inputs[1])
    dm2 = N.new('ShaderNodeMath'); dm2.operation = 'MULTIPLY'; L.new(dm.outputs['Value'], dm2.inputs[0]); L.new(dirt.outputs[0], dm2.inputs[1])
    mixc = N.new('ShaderNodeMix'); mixc.data_type = 'RGBA'
    mixc.inputs['A'].default_value = (0.42, 0.012, 0.016, 1); mixc.inputs['B'].default_value = (0.26, 0.13, 0.11, 1)
    L.new(dm2.outputs['Value'], mixc.inputs['Factor']); L.new(mixc.outputs['Result'], b.inputs['Base Color'])
    # паутина царапин: края ячеек Вороного, тонкие и случайные
    vor = N.new('ShaderNodeTexVoronoi'); vor.feature = 'DISTANCE_TO_EDGE'; vor.inputs['Scale'].default_value = 22
    L.new(tc.outputs['Object'], vor.inputs['Vector'])
    sc = N.new('ShaderNodeMapRange'); sc.inputs['From Min'].default_value = 0.0; sc.inputs['From Max'].default_value = 0.03
    sc.inputs['To Min'].default_value = 1.0; sc.inputs['To Max'].default_value = 0.0
    L.new(vor.outputs['Distance'], sc.inputs['Value'])
    scr = N.new('ShaderNodeMath'); scr.operation = 'MULTIPLY'; L.new(sc.outputs['Result'], scr.inputs[0]); L.new(dirt.outputs[0], scr.inputs[1])
    # шероховатость прозрачного слоя: 0.02 (зеркало) → 0.28 (матовый) + царапины
    cr = N.new('ShaderNodeMath'); cr.operation = 'MULTIPLY_ADD'; cr.inputs[1].default_value = 0.26; cr.inputs[2].default_value = 0.02
    L.new(dirt.outputs[0], cr.inputs[0])
    cr2 = N.new('ShaderNodeMath'); cr2.operation = 'MULTIPLY_ADD'; cr2.inputs[1].default_value = 0.5
    L.new(scr.outputs['Value'], cr2.inputs[0]); L.new(cr.outputs['Value'], cr2.inputs[2])
    L.new(cr2.outputs['Value'], b.inputs['Coat Roughness'])
    b.inputs['Coat Weight'].default_value = 1.0
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.15; bump.inputs['Distance'].default_value = 0.002
    L.new(scr.outputs['Value'], bump.inputs['Height']); L.new(bump.outputs['Normal'], b.inputs['Coat Normal'])

def set_dirt(v):
    bpy.data.materials['body_paint'].node_tree.nodes['DIRT'].outputs[0].default_value = v

def set_hex(wave, gain):
    n = bpy.data.materials['hex'].node_tree.nodes
    n['HEX_WAVE'].outputs[0].default_value = wave; n['HEX_GAIN'].outputs[0].default_value = gain

def lamps(on):
    m = bpy.data.materials.get('Material.013')
    if m: m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 60 * on

# ---------- шестиугольная световая решётка ----------
HEX_A = 0.42
def hex_material():
    m = bpy.data.materials.new('hex'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; L = nt.links
    b = N['Principled BSDF']; b.inputs['Base Color'].default_value = (0.9, 0.9, 0.9, 1)
    b.inputs['Emission Color'].default_value = (0.93, 0.96, 1.0, 1)
    oi = N.new('ShaderNodeObjectInfo')
    d = N.new('ShaderNodeVectorMath'); d.operation = 'DISTANCE'; d.inputs[1].default_value = (0, 0.0, GH)
    L.new(oi.outputs['Location'], d.inputs[0])
    wave = N.new('ShaderNodeValue'); wave.name = 'HEX_WAVE'; wave.outputs[0].default_value = 0.0
    lt = N.new('ShaderNodeMath'); lt.operation = 'LESS_THAN'
    L.new(d.outputs['Value'], lt.inputs[0]); L.new(wave.outputs[0], lt.inputs[1])
    gain = N.new('ShaderNodeValue'); gain.name = 'HEX_GAIN'; gain.outputs[0].default_value = 0.0
    mul = N.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
    L.new(lt.outputs['Value'], mul.inputs[0]); L.new(gain.outputs[0], mul.inputs[1])
    L.new(mul.outputs['Value'], b.inputs['Emission Strength'])
    return m

def hex_ceiling():
    M_HEX = hex_material(); cells = []
    a = HEX_A; w = math.sqrt(3) * a; z = GH - 0.03
    r = 0
    y = 0.9
    while y < GD - 0.5:
        x0 = -GW / 2 + 0.5 + (w / 2 if r % 2 else 0)
        x = x0
        while x < GW / 2 - 0.45:
            bm = bmesh.new()
            for k in range(6):
                a0 = math.radians(60 * k + 30); a1 = math.radians(60 * (k + 1) + 30)
                p0 = Vector((a * math.cos(a0), a * math.sin(a0), 0)); p1 = Vector((a * math.cos(a1), a * math.sin(a1), 0))
                mid = (p0 + p1) / 2; ang = math.atan2(p1.y - p0.y, p1.x - p0.x)
                res = bmesh.ops.create_cube(bm, size=1.0)
                vs = res['verts']
                bmesh.ops.scale(bm, vec=Vector((a * 0.86, 0.045, 0.025)), verts=vs)
                bmesh.ops.rotate(bm, verts=vs, cent=Vector((0, 0, 0)), matrix=__import__('mathutils').Matrix.Rotation(ang, 3, 'Z'))
                bmesh.ops.translate(bm, verts=vs, vec=mid)
            ob = obj_from_bm('hexcell', bm, M_HEX); ob.location = (x, y, z); cells.append(ob)
            x += w
        y += 1.5 * a; r += 1
    return cells

# ---------- мир ----------
def build_world():
    M_FLOOR = tex_mat('g_floor', 'garage_floor', tile=3.0, rough_mul=0.16, tint=(0.06, 0.06, 0.065), bump=0.1, coat=0.7)
    M_WALL = tex_mat('g_wall', 'concrete_wall_008', tile=3.0, tint=(0.15, 0.155, 0.17))
    M_EXT = tex_mat('ext_wall', 'concrete_wall_006', tile=4.0, tint=(0.32, 0.32, 0.36))
    M_ROAD = tex_mat('road', 'asphalt_02', tile=4.0, rough_mul=0.35, tint=(0.6, 0.6, 0.62), bump=0.5)   # мокрый асфальт
    M_WALK = tex_mat('walk', 'concrete_wall_006', tile=2.0, rough_mul=0.6, tint=(0.45, 0.45, 0.47))
    M_DOOR = mat('door', (0.12, 0.125, 0.135), rough=0.4, metal=0.7)
    M_LED = mat('led', (1, 1, 1), emit=(0.92, 0.96, 1.0), emit_strength=0.0)
    M_NEON = mat('neon', (1, 1, 1), emit=(0.0, 0.85, 0.75), emit_strength=0.0)
    M_WIN = mat('window_lit', (0.1, 0.08, 0.05), emit=(1.0, 0.72, 0.42), emit_strength=3.0)
    M_WIN_D = mat('window_dark', (0.01, 0.012, 0.015), rough=0.05)
    M_LAMP = mat('streetlamp', (1, 1, 1), emit=(1.0, 0.72, 0.45), emit_strength=25.0)
    M_POLE = mat('pole', (0.05, 0.05, 0.055), rough=0.4, metal=0.8)
    t = 0.2
    box('floor', (GW + 2 * t, GD + t, 0.1), (0, GD / 2, -0.05), M_FLOOR)
    box('ceiling', (GW + 2 * t, GD + t, t), (0, GD / 2, GH + t / 2), M_WALL)
    box('wall_back', (GW + 2 * t, t, GH), (0, GD + t / 2, GH / 2), M_WALL)
    box('wall_l', (t, GD, GH), (-GW / 2 - t / 2, GD / 2, GH / 2), M_WALL)
    box('wall_r', (t, GD, GH), (GW / 2 + t / 2, GD / 2, GH / 2), M_WALL)
    side = (GW - DW) / 2
    box('front_l', (side + t, t, GH), (-(DW / 2 + side / 2) - t / 2, -t / 2, GH / 2), M_EXT)
    box('front_r', (side + t, t, GH), ((DW / 2 + side / 2) + t / 2, -t / 2, GH / 2), M_EXT)
    box('lintel', (DW, t, GH - DH), (0, -t / 2, DH + (GH - DH) / 2), M_EXT)
    box('facade_top', (GW + 2 * t, t, 1.6), (0, -t / 2, GH + 0.8), M_EXT)
    box('roof', (GW + 2 * t, GD + t, 0.3), (0, GD / 2, GH + 1.45), M_EXT)
    for x0, w, h in ((-11.6, 10, 9), (11.6, 10, 12)):
        box('neighbor', (w, 9, h), (x0, 4.5, h / 2), M_EXT)
    # интерьер
    leds = hex_ceiling()
    # бирюзовая подсветка у пола по трём стенам
    box('neon', (0.03, GD - 0.4, 0.03), (-GW / 2 + 0.03, GD / 2 + 0.1, 0.06), M_NEON)
    box('neon', (0.03, GD - 0.4, 0.03), (GW / 2 - 0.03, GD / 2 + 0.1, 0.06), M_NEON)
    box('neon', (GW - 0.1, 0.03, 0.03), (0, GD - 0.03, 0.06), M_NEON)
    prop('Shelf_01', (-GW / 2 + 0.45, GD - 2.6, 0), rot_z=math.pi / 2)
    prop('drawer_cabinet', (GW / 2 - 0.45, GD - 1.4, 0), rot_z=-math.pi / 2)
    prop('industrial_storage_cart', (-GW / 2 + 0.6, GD - 4.6, 0), rot_z=math.pi / 2)
    prop('Barrel_02', (-GW / 2 + 0.5, GD - 0.6, 0))
    prop('hand_truck', (-GW / 2 + 0.4, 2.0, 0), rot_z=math.pi / 2)
    for i, (x, y, z) in enumerate(((-GW / 2 + 0.45, GD - 2.9, 1.25), (-GW / 2 + 0.45, GD - 2.3, 1.25), (-GW / 2 + 0.45, GD - 2.6, 0.62))):
        prop('cardboard_box_01', (x, y, z), rot_z=i * 0.7)
    for z0 in range(4):   # стопка шин
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=40, radius1=0.33, radius2=0.33, depth=0.22)
        ob = obj_from_bm('tire_stack', bm, mat('rubber', (0.02, 0.02, 0.02), rough=0.75), smooth=True)
        bv = ob.modifiers.new('bev', 'BEVEL'); bv.width = 0.05; bv.segments = 3
        ob.location = (GW / 2 - 0.55, 1.6, 0.11 + z0 * 0.225)
    # рольставня
    slats = [box('slat', (DW - 0.04, 0.05, 0.095), (0, 0.04, DH - 0.05 - i * 0.1), M_DOOR) for i in range(27)]
    # улица
    box('road', (120, 40, 0.1), (0, -22, -0.05), M_ROAD)
    box('sidewalk', (120, 2.0, 0.1), (0, -1.0, -0.03), M_WALK)
    for x0, x1 in ((-60, -2.9), (2.9, 60)):
        box('curb', (x1 - x0, 0.2, 0.14), ((x0 + x1) / 2, -2.05, 0.04), M_WALK)
    for x in range(-50, 51, 6):
        box('lane', (3.0, 0.12, 0.003), (x, -8.0, 0.0015), mat('paint'))
    rnd = random.Random(7); x = -50.0
    while x < 50:   # дома через дорогу
        w = rnd.uniform(6, 11); h = rnd.uniform(9, 24)
        box('house', (w, 8, h), (x + w / 2, -22, h / 2), M_EXT)
        for fz in range(int((h - 1) // 3)):
            for fx in range(int(w // 2.2)):
                box('win', (1.1, 0.06, 1.4), (x + 1.1 + fx * 2.2, -17.98, 1.9 + fz * 3), M_WIN if rnd.random() < 0.22 else M_WIN_D)
        x += w + rnd.uniform(0.3, 2)
    for x in (-12.5, 9.5):
        box('pole', (0.14, 0.14, 6.0), (x, -1.7, 3.0), M_POLE)
        box('arm', (0.1, 1.5, 0.1), (x, -2.45, 5.95), M_POLE)
        box('lamp_head', (0.35, 0.6, 0.1), (x, -3.05, 5.88), M_LAMP)
        ld = bpy.data.lights.new('street', 'SPOT'); ld.energy = 2500; ld.color = (1.0, 0.68, 0.4); ld.spot_size = math.radians(110); ld.spot_blend = 0.4; ld.shadow_soft_size = 0.25
        lo = bpy.data.objects.new('street', ld); bpy.context.scene.collection.objects.link(lo); lo.location = (x, -3.05, 5.75)
    prop('fire_hydrant', (5.2, -1.4, 0.02))
    # туман над улицей (видны лучи фар и фонарей)
    fog = box('fog', (60, 22, 8), (0, -9, 4), None)
    fm = bpy.data.materials.new('fog'); fm.use_nodes = True; N = fm.node_tree.nodes
    N.remove(N['Principled BSDF']); vs = N.new('ShaderNodeVolumeScatter'); vs.inputs['Density'].default_value = 0.012
    fm.node_tree.links.new(vs.outputs['Volume'], N['Material Output'].inputs['Volume']); fog.data.materials.append(fm)
    # свет бокса
    glights = []
    for x in (-1.9, 0.0, 1.9):
        ld = bpy.data.lights.new('bay', 'AREA'); ld.energy = 0; ld.shape = 'RECTANGLE'; ld.size = 0.12; ld.size_y = GD - 1.6
        ld.color = (0.93, 0.96, 1.0)
        lo = bpy.data.objects.new('bay', ld); bpy.context.scene.collection.objects.link(lo); lo.location = (x, GD / 2 + 0.4, GH - 0.06)
        glights.append(lo)
    return slats, leds, glights

def setup_render(res=(720, 1280), samples=32):
    sc = build.setup_render(res[0], res[1], samples)
    sc.render.use_freestyle = False
    sc.cycles.max_bounces = 6; sc.cycles.volume_bounces = 1
    sc.cycles.volume_step_rate = 4.0
    w = sc.world; N = w.node_tree.nodes
    env = N.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(f'{PH}/hdri/modern_buildings_night.hdr')
    mp = N.new('ShaderNodeMapping'); tc = N.new('ShaderNodeTexCoord')
    mp.inputs['Rotation'].default_value = (0, 0, math.radians(90))
    w.node_tree.links.new(tc.outputs['Generated'], mp.inputs['Vector']); w.node_tree.links.new(mp.outputs['Vector'], env.inputs['Vector'])
    # HDRI только для отражений; камера видит тёмное ночное небо
    bg_sky = N.new('ShaderNodeBackground'); bg_sky.inputs['Color'].default_value = (0.004, 0.006, 0.012, 1)
    lp = N.new('ShaderNodeLightPath'); mix = N.new('ShaderNodeMixShader')
    w.node_tree.links.new(env.outputs['Color'], N['Background'].inputs['Color'])
    N['Background'].inputs['Strength'].default_value = 0.35
    w.node_tree.links.new(lp.outputs['Is Camera Ray'], mix.inputs['Fac'])
    w.node_tree.links.new(N['Background'].outputs['Background'], mix.inputs[1])
    w.node_tree.links.new(bg_sky.outputs['Background'], mix.inputs[2])
    w.node_tree.links.new(mix.outputs['Shader'], N['World Output'].inputs['Surface'])
    sc.render.use_motion_blur = True; sc.render.motion_blur_shutter = 0.4
    return sc

def build_all(res=(720, 1280), samples=32):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = setup_render(res, samples)
    car, spins, beams, meshes = car_import.import_car()
    for b in beams: b.rotation_euler = (0, -math.radians(85), 0)
    car_materials()
    slats, leds, glights = build_world()
    cd = bpy.data.cameras.new('cam'); cd.lens = 22; cd.sensor_fit = 'VERTICAL'; cd.sensor_height = 24
    cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
    return dict(scene=sc, car=car, wheels=spins, beams=beams, slats=slats, leds=leds, glights=glights, cam=cam)
