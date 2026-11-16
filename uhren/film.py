# Calenberg C 01 -- frame sequences for the website (scroll explode, running loop, winding loop).
# Run (cloud, bpy module):  python3 film.py <seq> <outdir> [w h samples] [frames a,b,c | all]
#   seq = explode | run | wind      Resumable: existing frames are skipped.
import bpy, bmesh, math, sys, os, time
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__))
a = sys.argv[1:]
SEQ, OUT = a[0], a[1]
W, H, SAMPLES = (int(a[2]), int(a[3]), int(a[4])) if len(a) > 4 else (800, 1000, 32)
ONLY = None if len(a) < 6 or a[5] == 'all' else [int(x) for x in a[5].split(',')]
NFRAMES = {'explode': 72, 'run': 24, 'wind': 12}[SEQ]

bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, 'calenberg_c01.blend'))
S = bpy.context.scene; O = bpy.data.objects
rad = math.radians
B = Vector((-5.2, 5.6)); CW = Vector((1.0, 7.86)); E = Vector((4.42, -8.32)); BC = Vector((8.0, -3.5)); PF = Vector((6.15, -5.99))
base = {o.name: o.matrix_world.copy() for o in S.objects}

def place(name, lift=0.0, rot=0.0, pivot=None, shift=(0, 0)):
    """World matrix = T(shift, lift) * R_z(rot about pivot) * base."""
    o = O[name]
    if o.parent: return
    p = Vector((pivot[0], pivot[1], 0)) if pivot is not None else base[name].translation
    o.matrix_world = Matrix.Translation((shift[0], shift[1], lift)) @ Matrix.Translation(p) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Translation(-p) @ base[name]

def names(*pre): return [o.name for o in S.objects if o.type == 'MESH' and any(o.name.startswith(p) for p in pre)]
def ease(x): x = min(max(x, 0.0), 1.0); return x * x * (3 - 2 * x)
def seg(t, t0, t1): return ease((t - t0) / (t1 - t0))

# ---- hairspring breathing ----
hs = O['hairspring']; hs_base = [v.co.copy() for v in hs.data.vertices]
def hairspring(theta):
    r0, r1 = 0.5, 3.05
    for v, c in zip(hs.data.vertices, hs_base):
        r = math.hypot(c.x, c.y); f = min(max((r1 - r) / (r1 - r0), 0.0), 1.0)
        an = theta * f; ca, sa = math.cos(an), math.sin(an)
        v.co = (c.x * ca - c.y * sa, c.x * sa + c.y * ca, c.z)
    hs.data.update()

BAL = names('balance_wheel', 'balance_screw_', 'balance_staff', 'roller_table', 'impulse_jewel', 'hairspring_collet')
FORK = ['pallet_fork', 'pallet_stone_1', 'pallet_stone_2']
def running(t, lift_bal=0.0, lift_fork=0.0, lift_esc=0.0, amp=rad(215)):
    th = amp * math.sin(2 * math.pi * t)
    for n in BAL: place(n, lift_bal, th, BC)
    hairspring(th); place('hairspring', lift_bal)
    phi = -rad(11) * math.tanh(9 * math.sin(2 * math.pi * t))
    for n in FORK: place(n, lift_fork, phi, PF)
    def st(c):
        x = ((t - c) % 1.0); x = x - 1 if x > 0.5 else x
        return ease(x / 0.06 + 0.5)
    k = math.floor(t)
    esc = -rad(12) * (2 * k + st(0.0) + st(0.5) - 0.5)
    place('escape_wheel', lift_esc, esc, E)

# click lifts away from the ratchet centre
CLP = B + Vector((5.75 * math.cos(rad(204)), 5.75 * math.sin(rad(204))))
beak = B + Vector((4.18 * math.cos(rad(186)), 4.18 * math.sin(rad(186))))
def _d(sg):
    v = Matrix.Rotation(sg * 0.05, 2) @ (beak - CLP) + CLP
    return (v - B).length
CL_SIGN = 1 if _d(1) > _d(-1) else -1
PITCH = 360.0 / 58
def winding(psi_deg, lift=0.0):
    """psi = ratchet rotation in degrees (clockwise)."""
    place('ratchet_wheel', lift, -rad(psi_deg), B)
    place('crown_wheel', lift, rad(psi_deg * 58 / 32), CW)
    fr = (0.967 + psi_deg / PITCH) % 1.0
    if fr < 0.1: h = 0.0
    elif fr < 0.78: h = (fr - 0.1) / 0.68
    elif fr < 0.93: h = 1.0
    else: h = 1.0 - ease((fr - 0.93) / 0.035)
    place('click', lift, CL_SIGN * rad(6.5) * h, CLP)

# ---- groups for the exploded view: (names, final lift, t0, t1) ----
G = lambda *p: names(*p)
BRIDGE_SCREWS = G('screw_barrel_bridge', 'screw_train_bridge', 'screw_fourth_cock')
LAYERS = [
    (BRIDGE_SCREWS,                                   25.5, 0.00, 0.30, 'screw'),
    (G('screw_ratchet', 'screw_crown_wheel', 'screw_click'), 24.0, 0.00, 0.28, 'screw'),
    (G('ratchet_', 'crown_', 'click'),                21.0, 0.04, 0.32, ''),
    (G('barrel_bridge'),                              16.5, 0.08, 0.36, ''),
    (G('train_bridge', 'fourth_wheel_cock', 'jewel_centre', 'jewel_third', 'jewel_fourth', 'screw_chaton'), 15.0, 0.24, 0.52, ''),
    (G('screw_balance_cock'),                         27.0, 0.42, 0.66, 'screw'),
    (G('balance_cock', 'hairspring_stud', 'regulator', 'balance_endpiece', 'jewel_balance_cap', 'screw_endpiece',
       'swan_neck', 'screw_swan', 'micrometer'),      20.5, 0.46, 0.72, ''),
    (G('screw_escape_cock', 'screw_pallet_bridge'),   12.5, 0.50, 0.74, 'screw'),
    (G('escape_wheel_cock', 'jewel_escape'),          10.0, 0.54, 0.78, ''),
    (G('pallet_bridge', 'jewel_pallet'),              10.6, 0.54, 0.78, ''),
    (G('centre_'),                                     8.6, 0.66, 0.96, ''),
    (G('fourth_wheel', 'fourth_pinion', 'fourth_arbor'), 7.2, 0.68, 0.97, ''),
    (G('third_'),                                      5.8, 0.70, 0.98, ''),
    (G('barrel', 'barrel_arbor'),                      4.2, 0.72, 1.00, ''),
    (G('escape_pinion', 'escape_arbor'),               4.6, 0.72, 0.98, ''),
    (G('pallet_arbor'),                                5.6, 0.72, 0.98, ''),
]
LAYERS[3] = ([n for n in LAYERS[3][0]], *LAYERS[3][1:])
_seen = set(); LS = 0.72
def explode(t):
    _seen.clear()
    for grp, lift, t0, t1, kind in LAYERS:
        k = seg(t, t0, t1)
        for n in grp:
            if n in _seen or n in ('barrel_bridge_x',): continue
            _seen.add(n)
            if kind == 'screw': place(n, LS * lift * k, 9.0 * min(1.0, k * 2.2))
            else: place(n, LS * lift * k)
    # barrel: 'barrel' prefix also matches barrel_bridge -> already placed by the earlier layer
    running(0.0, lift_bal=LS * 14.0 * seg(t, 0.56, 0.86), lift_fork=LS * 5.4 * seg(t, 0.72, 0.98), lift_esc=LS * 4.6 * seg(t, 0.72, 0.98))
    st_dir = Vector((1.64, 12.9)).normalized() * 7.0 * seg(t, 0.1, 0.4)
    place('winding_stem', 0, shift=(st_dir.x, st_dir.y))

# ---- camera (same azimuth as cam_hero so the hero light rig stays valid) ----
cam = bpy.data.cameras.new('cam_film'); co = bpy.data.objects.new('cam_film', cam); S.collection.objects.link(co)
S.camera = co; cam.lens = 60; cam.clip_start = 1; cam.clip_end = 900; cam.dof.use_dof = True
AZ = math.atan2(-47.3, 33.4)
def camera(t):
    k = ease(t)
    dist = 74 + 13 * k; el = rad(33 - 13 * k); tz = -1.0 + 9.0 * k
    tgt = Vector((0.4, -0.4, tz))
    loc = tgt + Vector((math.cos(AZ) * math.cos(el), math.sin(AZ) * math.cos(el), math.sin(el))) * dist
    co.location = loc; co.rotation_euler = (tgt - loc).to_track_quat('-Z', 'Y').to_euler()
    cam.dof.focus_distance = (Vector((3.0, -3.0, 2.5 + 8 * k)) - loc).length
    cam.dof.aperture_fstop = cam.lens / (2 * (0.5 - 0.32 * k))
for c in bpy.data.collections:
    if c.name.startswith('rig_'):
        for o in c.objects: o.hide_render = (c.name != 'rig_hero')

_fl = O['stage_floor'].data.materials[0].node_tree.nodes['Principled BSDF']; _fl.inputs['Roughness'].default_value = 0.42
S.cycles.device = 'CPU'; S.cycles.samples = SAMPLES; S.cycles.adaptive_threshold = 0.025
S.render.resolution_x, S.render.resolution_y, S.render.resolution_percentage = W, H, 100
S.render.image_settings.file_format = 'PNG'
os.makedirs(OUT, exist_ok=True)
for f in (ONLY if ONLY is not None else range(NFRAMES)):
    fp = os.path.join(OUT, f'{SEQ}_{f:03d}.png')
    if os.path.exists(fp): continue
    if SEQ == 'explode': t = f / (NFRAMES - 1); explode(t); camera(t)
    elif SEQ == 'run': explode(0.0); running(f / NFRAMES); camera(0.0)
    elif SEQ == 'wind': explode(0.0); winding(PITCH * f / NFRAMES); camera(0.0)
    bpy.context.view_layer.update()
    S.render.filepath = fp; t0 = time.time()
    bpy.ops.render.render(write_still=True)
    print('FRAME', SEQ, f, round(time.time() - t0, 1), 's', flush=True)
