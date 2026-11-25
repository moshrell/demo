"""Zuckerpaste — процедурная версия (без симуляции): густая янтарная паста стекает со шпателя
и укладывается кольцами в лужицу. Петля бесшовная: длина ролика кратна периоду одного кольца.
Запуск:
  blender -b --factory-startup -P coil.py -- <out_dir> <w> <h> <samples> <кадры: all|a-b|a,b> <cam_pc|cam_tel> [--save file.blend]
"""
import bpy, sys, os, math, random
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
P = 30            # кадров на одно кольцо
LOOPS = 6         # колец в ролике
FRAMES = P * LOOPS  # 180 кадров = 7,5 с при 24 fps, конец совпадает с началом

sc = bpy.context.scene
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
sc.frame_start = 1; sc.frame_end = FRAMES; sc.render.fps = 24

def mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree
    out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None) or nt.nodes.new('ShaderNodeOutputMaterial')
    p = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None) or nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    return m, nt, p, out

# ---------- материалы ----------
m_paste, nt, p, out = mat('paste')
p.inputs['Base Color'].default_value = (1.0, 0.80, 0.45, 1)
p.inputs['Roughness'].default_value = 0.03
p.inputs['IOR'].default_value = 1.47
p.inputs['Transmission Weight'].default_value = 1.0
p.inputs['Coat Weight'].default_value = 0.3; p.inputs['Coat Roughness'].default_value = 0.02
va = nt.nodes.new('ShaderNodeVolumeAbsorption')
va.inputs['Color'].default_value = (0.97, 0.66, 0.24, 1)
va.inputs['Density'].default_value = 90.0      # 1/м
nt.links.new(va.outputs[0], out.inputs['Volume'])

m_steel, nt, p, _ = mat('steel')
p.inputs['Base Color'].default_value = (0.8, 0.8, 0.82, 1); p.inputs['Metallic'].default_value = 1.0
p.inputs['Roughness'].default_value = 0.18

m_stone, nt, p, out = mat('stone')
# тёмный камень: диффуз + очень мягкий глянец (без яркого отражения контрового света)
nt.nodes.remove(p)
dif = nt.nodes.new('ShaderNodeBsdfDiffuse'); dif.inputs['Color'].default_value = (0.0025, 0.0018, 0.0014, 1)
gl = nt.nodes.new('ShaderNodeBsdfGlossy'); gl.inputs['Color'].default_value = (0.03, 0.024, 0.02, 1); gl.inputs['Roughness'].default_value = 0.25
mx = nt.nodes.new('ShaderNodeMixShader'); mx.inputs[0].default_value = 0.06
nt.links.new(dif.outputs[0], mx.inputs[1]); nt.links.new(gl.outputs[0], mx.inputs[2]); nt.links.new(mx.outputs[0], out.inputs['Surface'])

m_bokeh, nt, p, out = mat('bokeh')
nt.nodes.remove(p)
em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (1.0, 0.6, 0.25, 1)
em.inputs['Strength'].default_value = 1.6
nt.links.new(em.outputs[0], out.inputs['Surface'])

# ---------- паста (metaball, локальные единицы = см, объект масштаб 0.01) ----------
mb = bpy.data.metaballs.new('paste')
mb.resolution = 0.06; mb.render_resolution = 0.022; mb.threshold = 0.6
paste = bpy.data.objects.new('paste', mb); sc.collection.objects.link(paste)
paste.scale = (0.01, 0.01, 0.01)
mb.materials.append(m_paste)

ZTIP = 15.8            # см, кончик шпателя
RC = 0.62              # радиус кольца, см
R_TUBE = 0.31          # толщина нити в кольце (радиус элемента)
H = 0.30               # подъём кольца за оборот, см
K = 4                  # сколько колец видно поверх лужицы
PUDDLE_TOP = 0.32
# элементов на одно кольцо:
EL_LOOP = 30
N_COIL = K * EL_LOOP
N_STREAM = 120

coil = [mb.elements.new() for _ in range(N_COIL)]
stream = [mb.elements.new() for _ in range(N_STREAM)]
for e in coil + stream: e.type = 'BALL'; e.stiffness = 2.0
# лужица: несколько плоских эллипсоидов
random.seed(3)
puddle = []
for (x, y, s) in [(0, 0, 3.0), (1.3, -0.5, 2.0), (-1.2, 0.7, 2.1), (0.4, 1.3, 1.7), (-0.7, -1.2, 1.9), (1.6, 0.9, 1.3)]:
    e = mb.elements.new(); e.type = 'ELLIPSOID'; e.co = (x, y, 0.02)
    e.radius = s; e.size_x = 1.0; e.size_y = 1.0; e.size_z = 0.16; e.stiffness = 2.0
    puddle.append((e, x, y))

def smooth(a, b, x):
    x = max(0.0, min(1.0, (x - a) / (b - a))); return x * x * (3 - 2 * x)

def update(t):
    """t: время в кадрах (дробное). Всё зависит от t периодически с периодом P*LOOPS."""
    ztop = PUDDLE_TOP + K * H * 0.9        # верх кучки колец
    # кольца: элемент с «возрастом» a (кадры) уложен в момент s=t-a под углом 2πs/P
    dt = P / EL_LOOP
    t0 = math.floor(t / dt) * dt               # сетка по времени закреплена → без дрожи
    for i, e in enumerate(coil):
        s = t0 - i * dt
        a = t - s                                # возраст, 0..K*P
        k = a / P                                # возраст в кольцах
        ang = 2 * math.pi * s / P
        ph = 2 * math.pi * s / (P * LOOPS)
        wob = 1 + 0.16 * math.sin(3 * ph + 0.7) + 0.09 * math.sin(7 * ph + 2.1)
        cx = 0.10 * math.cos(2 * ph + 1.3); cy = 0.08 * math.sin(4 * ph)
        sink = smooth(0, K, k)
        rr = RC * wob * (1 + 0.7 * sink ** 1.4)  # старые кольца расползаются
        z = ztop - H * k - 0.18 * sink ** 2
        e.co = (cx + rr * math.cos(ang), cy + rr * math.sin(ang), max(z, PUDDLE_TOP * 0.6))
        e.radius = R_TUBE * (1 + 0.35 * sink) * (1 - 0.9 * smooth(K - 0.6, K, k))   # исчезают внутри лужицы
    # нить: снизу следует за точкой укладки, сверху висит из кончика
    ang_now = 2 * math.pi * t / P
    ph = 2 * math.pi * t / (P * LOOPS)
    wob = 1 + 0.16 * math.sin(3 * ph + 0.7) + 0.09 * math.sin(7 * ph + 2.1)
    cx = 0.10 * math.cos(2 * ph + 1.3); cy = 0.08 * math.sin(4 * ph)
    land = Vector((cx + RC * wob * math.cos(ang_now), cy + RC * wob * math.sin(ang_now), ztop + 0.05))
    for j, e in enumerate(stream):
        u = j / (N_STREAM - 1)                   # 0 низ, 1 кончик
        lag = 2 * math.pi * (t - 3.0 * u) / P    # нижняя часть чуть отстаёт по фазе
        follow = (1 - u) ** 4
        xy = Vector((cx + RC * wob * math.cos(lag), cy + RC * wob * math.sin(lag))) * follow
        z = land.z + (ZTIP - land.z) * u
        sway = 0.025 * math.sin(2 * math.pi * (t / (P * 2)) + u * 3.0) * u * (1 - u) * 4
        e.co = (xy.x + sway, xy.y, z)
        thin = 0.135 + 0.10 * u ** 1.5 + 0.10 * (1 - u) ** 8   # тонкая в середине, толще у кончика и у кучки
        e.radius = thin * 2.1
    # лужица чуть дышит
    for n, (e, x, y) in enumerate(puddle):
        ph = 2 * math.pi * t / (P * LOOPS) + n
        e.co = (x + 0.04 * math.cos(ph), y + 0.04 * math.sin(ph), 0.02)

def on_frame(scene, depsgraph=None):
    update(scene.frame_current + scene.frame_subframe)
bpy.app.handlers.frame_change_pre.clear()
bpy.app.handlers.frame_change_pre.append(on_frame)
update(1)

# ---------- шпатель ----------
TIP = Vector((0.0, 0.0, ZTIP / 100))
bpy.ops.mesh.primitive_cube_add(size=1)
sp = bpy.context.object; sp.name = 'spatula'; sp.scale = (0.02, 0.15, 0.0015)
bpy.ops.object.transform_apply(scale=True)
bev = sp.modifiers.new('bev', 'BEVEL'); bev.width = 0.0008; bev.segments = 4
sub = sp.modifiers.new('sub', 'SUBSURF'); sub.levels = 1; sub.render_levels = 2
for f in sp.data.polygons: f.use_smooth = True
sp.data.materials.append(m_steel)
sp.rotation_euler = (math.radians(-35), 0, math.radians(14))
sp.location = TIP + Vector((-0.012, 0.062, 0.043))
# капля на кончике
e = mb.elements.new(); e.type = 'ELLIPSOID'; e.co = (0, 0.15, ZTIP + 0.35); e.radius = 0.62
e.size_x = 1.2; e.size_y = 1.5; e.size_z = 0.75

# ---------- плита и фон ----------
bpy.ops.mesh.primitive_plane_add(size=1.5, location=(0, 0, 0))
bpy.context.object.data.materials.append(m_stone)
random.seed(7)
for i in range(6):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=random.uniform(0.004, 0.008),
        location=(random.uniform(-0.3, 0.3), random.uniform(0.75, 1.0), random.uniform(0.04, 0.2)))
    b = bpy.context.object; b.data.materials.append(m_bokeh)
    for attr in ('visible_shadow', 'visible_diffuse', 'visible_glossy', 'visible_transmission'): setattr(b, attr, False)

def area(name, loc, target, size, power, color=(1, 0.86, 0.68), sy=None):
    ld = bpy.data.lights.new(name, 'AREA'); ld.energy = power; ld.color = color
    ld.shape = 'RECTANGLE'; ld.size = size; ld.size_y = sy or size
    o = bpy.data.objects.new(name, ld); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    o.visible_camera = False
    return o, ld
_, lb = area('back', (0.03, 0.20, 0.20), (0, 0, 0.04), 0.12, 7.0, sy=0.22); lb.spread = math.radians(35)      # контровой сверху-сзади: свет сквозь пасту
area('kick', (-0.14, 0.12, 0.05), (0, 0, 0.02), 0.06, 2.0, (1, 0.78, 0.55)) # блик по краю кучки
area('fill', (0.15, -0.28, 0.08), (0, 0, 0.04), 0.3, 0.22, (1, 0.9, 0.8))
area('top', (-0.04, 0.0, 0.32), (0, 0, 0.0), 0.06, 0.5, (1, 0.88, 0.72))
w = sc.world or bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND')
bg.inputs['Color'].default_value = (0.010, 0.006, 0.0035, 1)

def cam(name, loc, target, lens, fstop, focus):
    cd = bpy.data.cameras.new(name); cd.lens = lens; cd.sensor_width = 36
    cd.dof.use_dof = True; cd.dof.aperture_fstop = fstop
    o = bpy.data.objects.new(name, cd); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    cd.dof.focus_distance = (Vector(focus) - Vector(loc)).length
    return o
# камера неподвижна: бесшовная петля (движение даёт сама паста)
cam('cam_pc', (-0.042, -0.24, 0.062), (-0.017, 0, 0.019), 105, 3.5, (0, 0, 0.012))
cam('cam_tel', (0.0, -0.27, 0.06), (0, 0, 0.038), 90, 3.5, (0, 0, 0.02))

OUT = os.path.abspath(argv[0]) if argv else '/tmp/coil'
RW, RH, SAMPLES = (int(argv[1]), int(argv[2]), int(argv[3])) if len(argv) > 3 else (640, 360, 32)
SEL = argv[4] if len(argv) > 4 else 'all'
CAM = argv[5] if len(argv) > 5 else 'cam_pc'
sc.camera = bpy.data.objects[CAM]
sc.render.engine = 'CYCLES'; cy = sc.cycles
cy.samples = SAMPLES; cy.use_adaptive_sampling = True; cy.adaptive_threshold = 0.015; cy.use_denoising = True
cy.max_bounces = 16; cy.transmission_bounces = 16; cy.glossy_bounces = 6; cy.volume_bounces = 2
cy.caustics_refractive = True; cy.caustics_reflective = False; cy.blur_glossy = 0.8
cy.seed = 0
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for t in ('OPTIX', 'CUDA'):
        prefs.compute_device_type = t; prefs.get_devices()
        if any(d.type == t for d in prefs.devices):
            for d in prefs.devices: d.use = d.type == t
            cy.device = 'GPU'; print('DEVICE', t, flush=True); break
except Exception as ex: print('no gpu', ex)
sc.render.resolution_x = RW; sc.render.resolution_y = RH; sc.render.resolution_percentage = 100
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
sc.render.image_settings.file_format = 'PNG'
if '--save' in argv: bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(argv[argv.index('--save') + 1]))
frames = []
for part in SEL.split(','):
    if part == 'all': frames += list(range(1, FRAMES + 1))
    elif '-' in part: a, b = part.split('-'); frames += list(range(int(a), int(b) + 1))
    elif part: frames.append(int(part))
os.makedirs(OUT, exist_ok=True)
for fr in frames:
    path = os.path.join(OUT, f'{fr:04d}.png')
    if os.path.exists(path): continue
    sc.frame_set(fr); sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('FRAME', fr, flush=True)
