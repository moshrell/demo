# Calenberg C 01 -- frames for the website ../calenberg (winding loop, running loop, scroll explode).
#
#   blender -b --factory-startup -P film.py -- <job> <outdir> [W H samples] [frames: all | a,b,c | a-b] [flags]
#
# jobs (README.md explains why the film is split like this):
#   explode   0..96   scroll sequence, full frames. Frame 0 is the still every other layer is cut from.
#   wind      0..11   one ratchet tooth; ratchet, crown wheel, click + spring, stem + crown, barrel arbor.
#   run       1..72   six beats of the escapement at 12 frames per beat, with motion blur. All train wheels turn.
#                     The third and fourth wheel are hidden from the camera here: they come from the sprites below.
#   f4        0..59   fourth (seconds) wheel alone on transparent film, 1 deg per state  (60 deg = its symmetry)
#   t3        0..149  third wheel alone, 0.4 deg per state                              (60 deg = its symmetry)
#   rs        0..89   ratchet screw + barrel arbor alone, 2 deg per state               (180 deg = slot symmetry)
# flags: --nofast  hide balance / fork / escape wheel (to test that no moving part lies in front of a sprite)
#        --real    run job with the third and fourth wheel visible (reference for checking the composite)
#        --budget N  stop after N seconds (the PC has 8 GB RAM: render in portions)
# Existing files are skipped, so a stopped render can simply be started again.
import bpy, bmesh, math, sys, os, time
from mathutils import Vector, Matrix, Quaternion
from bpy_extras.object_utils import world_to_camera_view
HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:]
BUDGET = 1e9      # seconds
if '--budget' in argv: i = argv.index('--budget'); BUDGET = float(argv[i + 1]); del argv[i:i + 2]
N_OVR = None      # --n N: number of explode frames (default 97)
if '--n' in argv: i = argv.index('--n'); N_OVR = int(argv[i + 1]); del argv[i:i + 2]
FLAGS = [x for x in argv if x.startswith('--')]; a = [x for x in argv if not x.startswith('--')]
JOB, OUT = a[0], os.path.abspath(a[1])
W, H, SAMPLES = (int(a[2]), int(a[3]), int(a[4])) if len(a) > 4 else (1200, 1500, 256)
NB = 12                                   # frames per beat (24 fps -> two beats per second: slow motion 1:3)
NFR = {'explode': 97, 'wind': 12, 'run': 73, 'f4': 60, 't3': 150, 'rs': 90}[JOB]
if JOB == 'explode' and N_OVR: NFR = N_OVR
def _frames(s):
    if s == 'all': return None
    if '-' in s: lo, hi = s.split('-'); return list(range(int(lo), int(hi) + 1))
    return [int(x) for x in s.split(',')]
ONLY = _frames(a[5]) if len(a) > 5 else None

bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, 'calenberg_c01.blend'))
S = bpy.context.scene; O = bpy.data.objects
rad = math.radians
# ---- layout (same numbers as build.py) ----
B = Vector((-5.2, 5.6)); CW = Vector((1.0, 7.86)); C0 = Vector((0.0, 0.0)); T = Vector((-1.95, -5.36)); F = Vector((0.6, -9.1))
E = Vector((4.42, -8.32)); BC = Vector((8.0, -3.5)); PF = Vector((6.15, -5.99))
def pol(r, deg): return Vector((r * math.cos(rad(deg)), r * math.sin(rad(deg))))
CLP = B + pol(5.75, 204); TAIL = CLP + pol(1.5, 250); SF = CLP + pol(3.7, 262)
ST_A = math.atan2(CW.y, CW.x); ST_U = Vector((math.cos(ST_A), math.sin(ST_A), 0.0))
# per beat (21 600 A/h): escape 12 deg, fourth 1 deg, third 12/90 deg, centre 1/60 deg, barrel 1/480 deg; each mesh reverses the sense
DEG = {'escape': -12.0, 'fourth': 1.0, 'third': -12.0 / 90.0, 'centre': 1.0 / 60.0, 'barrel': -1.0 / 480.0}
PITCH = 360.0 / 58                        # ratchet tooth

def ease(x): x = min(max(x, 0.0), 1.0); return x * x * (3 - 2 * x)
def seg(t, t0, t1): return ease((t - t0) / (t1 - t0))
def have(*names): return [n for n in names if n in O]
def pre(*p): return sorted(o.name for o in S.objects if o.type == 'MESH' and any(o.name.startswith(q) for q in p))

# ---- shadow stand-ins: the two sprite wheels cast the shadow of a plain ring, so nothing below them depends on where their spokes are ----
def ring_proxy(name, c, r0, r1, hub, z0, z1):
    bm = bmesh.new()
    def tube(ra, rb):
        n = 96; vs = []
        for z in (z0 + 0.03, z1 - 0.03):
            for r in (ra, rb): vs.append([bm.verts.new((r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n), z)) for i in range(n)])
        lo_a, lo_b, hi_a, hi_b = vs
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((lo_a[i], lo_b[i], lo_b[j], lo_a[j])); bm.faces.new((hi_a[i], hi_a[j], hi_b[j], hi_b[i]))
            bm.faces.new((lo_b[i], hi_b[i], hi_b[j], lo_b[j])); bm.faces.new((lo_a[i], lo_a[j], hi_a[j], hi_a[i]))
    tube(r0 + 0.03, r1 - 0.03); tube(0.02, hub - 0.03)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); S.collection.objects.link(o); o.location = (c.x, c.y, 0)
    o.visible_camera = False; o.visible_glossy = False; o.visible_diffuse = False; o.visible_transmission = False
    me.materials.append(O['fourth_wheel'].data.materials[0])
    return o
ring_proxy('shadow_fourth', F, 3.4 - 0.17 - 0.4, 3.4 - 0.17, 0.55, 1.0, 1.16); O['fourth_wheel'].visible_shadow = False
ring_proxy('shadow_third', T, 3.9 - 0.19 - 0.45, 3.9 - 0.19, 0.65, 0.55, 0.73); O['third_wheel'].visible_shadow = False
bpy.context.view_layer.update()

# ---- groups ----
G_BAL = pre('balance_wheel', 'balance_screw_', 'balance_staff', 'roller_table', 'impulse_jewel', 'hairspring_collet')
G_FORK = ['pallet_fork', 'pallet_stone_1', 'pallet_stone_2', 'pallet_arbor']
G_ESC = ['escape_wheel', 'escape_pinion', 'escape_arbor']
G_FOURTH = ['fourth_wheel', 'fourth_pinion', 'fourth_arbor', 'shadow_fourth']
G_THIRD = ['third_wheel', 'third_pinion', 'third_arbor', 'shadow_third']
G_CENTRE = ['centre_wheel', 'centre_pinion', 'centre_arbor']
G_BARREL = ['barrel']
G_RATCHET = ['ratchet_wheel', 'ratchet_core']
G_RSCREW = ['screw_ratchet', 'barrel_arbor']              # the screw sits in the barrel arbor: both turn with the ratchet
G_STEM = ['winding_stem', 'winding_crown', 'winding_crown_cap']
G_COCK = ['balance_cock', 'hairspring_stud', 'regulator', 'balance_endpiece', 'jewel_balance_cap_chaton', 'jewel_balance_cap_ruby',
          'screw_endpiece_1', 'screw_endpiece_2', 'swan_neck_spring', 'screw_swan_neck', 'micrometer_block', 'micrometer_screw']
FAST = G_BAL + ['hairspring'] + G_FORK + G_ESC
base = {o.name: o.matrix_world.copy() for o in S.objects if o.parent is None}
MOV = [n for n in base if O[n].type == 'MESH' and not n.startswith(('softbox', 'stage_', 'mainplate', 'banking_pin'))]

# ---- pose: every part gets  T(shift, lift) * R(angle about an axis through a pivot) * base ----
pose = {}
def P(names, lift=0.0, rot=None, pivot=None, shift=None, axis=None):
    for n in ([names] if isinstance(names, str) else names):
        d = pose.setdefault(n, {'lift': 0.0, 'rot': 0.0, 'pivot': None, 'shift': Vector((0, 0, 0)), 'axis': None})
        d['lift'] += lift
        if rot is not None: d['rot'] += rot; d['pivot'] = pivot if pivot is not None else d['pivot']; d['axis'] = axis if axis is not None else d['axis']
        if shift is not None: d['shift'] = d['shift'] + Vector(shift)
def apply():
    for n in MOV:
        d = pose.get(n)
        if d is None: O[n].matrix_world = base[n]; continue
        p = base[n].translation if d['pivot'] is None else Vector((d['pivot'][0], d['pivot'][1], d['pivot'][2] if len(d['pivot']) > 2 else 0.0))
        R = Matrix.Translation(p) @ Matrix.Rotation(d['rot'], 4, d['axis'] or 'Z') @ Matrix.Translation(-p)
        O[n].matrix_world = Matrix.Translation(d['shift'] + Vector((0, 0, d['lift']))) @ R @ base[n]

# ---- hairspring: inner end follows the collet, outer end stays at the stud ----
hs = O['hairspring']; hs_base = [v.co.copy() for v in hs.data.vertices]
def hairspring(theta):
    r0, r1 = 0.5, 3.05
    for v, c in zip(hs.data.vertices, hs_base):
        r = math.hypot(c.x, c.y); f = min(max((r1 - r) / (r1 - r0), 0.0), 1.0)
        an = theta * f; ca, sa = math.cos(an), math.sin(an)
        v.co = (c.x * ca - c.y * sa, c.x * sa + c.y * ca, c.z)
    hs.data.update()

# ---- escapement ----
AMP = rad(220); D_BF = (BC - PF).length; R_IJ = 0.7; BANK = rad(11)
def beats_done(tau):
    """Beats the train has advanced at time tau (in beats): each tick takes the first tenth of a beat."""
    k = math.floor(tau); return k + ease((tau - k) / 0.10)
def escapement(tau, running=True):
    th = AMP * math.sin(math.pi * tau) if running else 0.0
    P(G_BAL, rot=th, pivot=BC)
    # fork: as long as the impulse jewel is inside the notch the fork follows it, then it lies against a banking pin
    ph = -math.atan2(R_IJ * math.sin(th), D_BF - R_IJ * math.cos(th))
    if abs(th) > rad(55): ph = -math.copysign(BANK, th)
    P(G_FORK, rot=max(-BANK, min(BANK, ph)), pivot=PF)
    return th
def train(n):
    """n = beats advanced (may be fractional during a tick)."""
    P(G_ESC, rot=rad(DEG['escape'] * n), pivot=E); P(G_FOURTH, rot=rad(DEG['fourth'] * n), pivot=F)
    P(G_THIRD, rot=rad(DEG['third'] * n), pivot=T); P(G_CENTRE, rot=rad(DEG['centre'] * n), pivot=C0)
    P(G_BARREL, rot=rad(DEG['barrel'] * n), pivot=B)

# ---- winding: psi = ratchet angle in degrees (clockwise seen from the bridge side) ----
def _away(sg): return ((Matrix.Rotation(sg * 0.05, 2) @ ((B + pol(4.13, 161.5)) - CLP) + CLP) - B).length
CL_SIGN = 1 if _away(1) > _away(-1) else -1
CLICK_LIFT = [(0.0, 0.0), (0.0625, 0.05), (0.729, 4.2), (0.885, 4.2), (0.9, 4.1), (0.9167, 3.15), (0.9375, 1.62), (0.9583, 0.05), (1.0, 0.0)]
def _interp(x, tab):
    for (x0, y0), (x1, y1) in zip(tab, tab[1:]):
        if x <= x1: return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return tab[-1][1]
def winding(psi, screw=True):
    P(G_RATCHET, rot=-rad(psi), pivot=B)
    if screw: P(G_RSCREW, rot=-rad(psi), pivot=B)
    P('crown_wheel', rot=rad(psi * 58 / 32), pivot=CW)
    P(G_STEM, rot=rad(psi * 58 / 12), pivot=tuple(base['winding_stem'].translation), axis=ST_U)     # winding pinion: 12 leaves
    # the click rides up the flank of a tooth and drops behind its tip. Angles (deg) = smallest lift that keeps its tooth out of the
    # ratchet, measured in 2D on the outlines of build.py, plus 0.1 deg of air.
    fr = (psi / PITCH) % 1.0
    ca = CL_SIGN * rad(_interp(fr, CLICK_LIFT))
    P('click', rot=ca, pivot=CLP)
    tip = TAIL + pol(0.385, 160); tip2 = Matrix.Rotation(ca, 2) @ (tip - CLP) + CLP     # the spring stays on the tail of the click
    v0, v1 = tip - SF, tip2 - SF
    P('click_spring', rot=math.atan2(v0.x * v1.y - v0.y * v1.x, v0.dot(v1)), pivot=SF)

# ---- stacking order: explode_limits.json holds, for every pair of parts whose outlines overlap seen from above, how far one may rise
#      relative to the other before the solids meet (measured on the meshes by a vertical sweep, see uhren/README.md). settle() raises the
#      upper part (or the lower one, for an upper bound) until every pair is clear, so whatever sits on top always rises higher. ----
import json as _json
LIMITS = _json.load(open(os.path.join(HERE, 'explode_limits.json')))
# bodies: parts that are one piece in the watch (wheel + pinion + arbor, jewel + chaton, balance + its screws ...) and move identically in the design.
# settle() lifts a body as a whole, never one member alone.
BODIES = _json.load(open(os.path.join(HERE, 'explode_bodies.json')))
BODY_OF = {n: i for i, b in enumerate(BODIES) for n in b}
def settle(margin=0.12, rounds=400):
    lf = lambda n: pose.setdefault(n, {'lift': 0.0, 'rot': 0.0, 'pivot': None, 'shift': Vector((0, 0, 0)), 'axis': None})
    def body(n):
        i = BODY_OF.get(n)
        if i is None: return
        top = max(lf(m)['lift'] for m in BODIES[i])
        for m in BODIES[i]: lf(m)['lift'] = top
    for n in BODY_OF: body(n)
    for _ in range(rounds):
        moved = False
        for c in LIMITS:
            a, b = lf(c['a']), lf(c['b']); d = b['lift'] - a['lift']
            lo = c['lo'] + min(margin, -c['lo'] / 2) + c.get('k', 0.0) * a['lift']; hi = c['hi'] - min(margin, c['hi'] / 2)
            if d < lo - 1e-9: b['lift'] = a['lift'] + lo; body(c['b']); moved = True
            elif d > hi + 1e-9: a['lift'] = b['lift'] - hi; body(c['a']); moved = True
        if not moved: return
    print('settle: no fixed point', flush=True)

# ---- exploded view: four stations of a quarter each. Parts move in the first ~0.15 of a quarter, then drift.
#      What was opened earlier keeps rising at every later station, so it never stands between the light and the next subject. ----
SCREW_TURN = 9.0
Q2, Q3, Q4 = (0.25, 0.38), (0.50, 0.62), (0.75, 0.88)
def lift(t, names, stages, screw=False, drift=0.05):
    d = 0.0; k0 = 0.0
    for i, (dz, t0, t1) in enumerate(stages):
        k = seg(t, t0, t1); d += dz * k
        if i == 0: k0 = k
    last = stages[-1][2]; d += drift * stages[0][0] * min(max((t - last) / max(1.0 - last, 1e-6), 0.0), 1.0)
    if screw:
        for n in names: P(n, lift=d, rot=SCREW_TURN * min(1.0, k0 * 2.2))
    else: P(names, lift=d)
def explode(t):
    # 1  Aufzug und Federhaus
    lift(t, pre('screw_barrel_bridge'), [(14.5, 0.00, 0.13), (9.0, *Q2), (5.0, *Q3), (5.0, *Q4)], screw=True)
    lift(t, ['screw_ratchet', 'screw_crown_wheel', 'screw_click', 'screw_click_spring'], [(13.6, 0.00, 0.12), (9.0, *Q2), (5.0, *Q3), (5.0, *Q4)], screw=True)
    lift(t, G_RATCHET + ['crown_wheel', 'crown_core', 'click', 'click_spring'], [(10.6, 0.015, 0.14), (8.0, *Q2), (4.5, *Q3), (5.0, *Q4)])
    lift(t, ['barrel_bridge'], [(6.6, 0.03, 0.15), (7.0, *Q2), (4.0, *Q3), (5.0, *Q4)])
    lift(t, ['barrel', 'barrel_arbor'], [(1.7, 0.07, 0.17)])
    P(G_STEM, shift=ST_U * 3.6 * seg(t, 0.03, 0.15))
    # 2  Raederwerk
    lift(t, pre('screw_train_bridge', 'screw_fourth_cock'), [(12.0, 0.25, 0.36), (5.5, *Q3), (6.0, *Q4)], screw=True)
    lift(t, ['train_bridge', 'fourth_wheel_cock'] + pre('jewel_centre', 'jewel_third', 'jewel_fourth', 'screw_chaton'), [(8.5, 0.265, 0.39), (5.0, *Q3), (6.0, *Q4)])
    lift(t, G_CENTRE, [(3.7, 0.29, 0.40)]); lift(t, G_THIRD, [(2.1, 0.30, 0.405)]); lift(t, G_FOURTH, [(0.9, 0.31, 0.41)])
    # 3  Hemmung: balance and cock go up and out of the way, the escapement is laid open
    lift(t, ['screw_balance_cock'], [(17.5, 0.50, 0.60), (1.5, *Q4)], screw=True)
    lift(t, G_COCK, [(14.0, 0.505, 0.62), (1.0, *Q4)])
    lift(t, G_BAL + ['hairspring'], [(9.6, 0.515, 0.63), (1.5, *Q4)])
    lift(t, ['screw_escape_cock', 'screw_pallet_bridge_1', 'screw_pallet_bridge_2'], [(8.5, 0.52, 0.62)], screw=True)
    lift(t, ['escape_wheel_cock', 'pallet_bridge'] + pre('jewel_escape', 'jewel_pallet'), [(6.5, 0.535, 0.64)])
    lift(t, G_ESC + G_FORK, [(1.5, 0.555, 0.65)])
    # 4  Unruh: the balance turns a little while the camera rises to it
    th = rad(-75) * seg(t, 0.77, 1.0)
    P(G_BAL, rot=th, pivot=BC); hairspring(th)
    settle()

# ---- camera: fixed azimuth (the hero light rig stays valid); target, distance, elevation and focus travel from station to station ----
cam = bpy.data.cameras.new('cam_film'); co = bpy.data.objects.new('cam_film', cam); S.collection.objects.link(co)
S.camera = co; cam.lens = 60; cam.clip_start = 1; cam.clip_end = 20000; cam.dof.use_dof = True
AZ = math.atan2(-47.3, 33.4)
# Calm camera: ONE slow pull-back over the whole film (no flights to the stations). Only the focus travels from station to station.
#        target               dist  elev
CAM0 = ((0.4, -0.4, -1.0),    74.0, 33.0)      # hero = frame 0 (must not change: wind / run / sprites are cut from this frame)
CAM1 = ((2.0, -2.4, 2.6),     77.0, 29.0)      # end of the film
#        focus point            aperture radius (mm)
FOCK = [((3.0, -3.0, 2.5),      0.50),          # hero
        ((-5.2, 5.6, 3.5),      0.30),          # 1 winding works and barrel
        ((-0.7, -5.0, 3.5),     0.30),          # 2 going train
        ((5.3, -7.2, 2.6),      0.30),          # 3 escapement
        ((8.0, -3.5, 12.6),     0.30)]          # 4 balance and swan neck
def camera(t):
    k = t * t * t * (t * (6 * t - 15) + 10)                  # smootherstep over the whole film
    tgt = Vector(CAM0[0]).lerp(Vector(CAM1[0]), k); dist = CAM0[1] + (CAM1[1] - CAM0[1]) * k; el = rad(CAM0[2] + (CAM1[2] - CAM0[2]) * k)
    loc = tgt + Vector((math.cos(AZ) * math.cos(el), math.sin(AZ) * math.cos(el), math.sin(el))) * dist
    co.location = loc; co.rotation_euler = (tgt - loc).to_track_quat('-Z', 'Y').to_euler()
    q = min(int(t * 4), 3); u = ease((t * 4 - q) / 0.60); a, b = FOCK[q], FOCK[q + 1]
    foc = Vector(a[0]).lerp(Vector(b[0]), u); ap = a[1] + (b[1] - a[1]) * u
    cam.dof.focus_distance = (foc - loc).length; cam.dof.aperture_fstop = cam.lens / (2 * ap)
for c in bpy.data.collections:
    if c.name.startswith('rig_'):
        for o in c.objects: o.hide_render = (c.name != 'rig_hero')

# ---- render settings ----
O['stage_floor'].data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.42
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
    for d in prefs.devices: d.use = (d.type == 'OPTIX')
    S.cycles.device = 'GPU'
except Exception as e:
    print('GPU setup failed, CPU fallback:', e); S.cycles.device = 'CPU'
S.cycles.samples = SAMPLES; S.cycles.use_adaptive_sampling = True; S.cycles.adaptive_threshold = 0.006; S.cycles.adaptive_min_samples = 64
S.cycles.use_denoising = True; S.cycles.denoiser = 'OPENIMAGEDENOISE'; S.cycles.denoising_prefilter = 'ACCURATE'
S.cycles.seed = 0; S.cycles.use_animated_seed = False        # same noise pattern in every frame: still areas do not shimmer
S.render.resolution_x, S.render.resolution_y, S.render.resolution_percentage = W, H, 100
S.render.image_settings.file_format = 'PNG'; S.render.image_settings.compression = 30
S.render.use_persistent_data = True
os.makedirs(OUT, exist_ok=True)

def border(names, margin=0.02):
    """Render only the screen rectangle around these parts."""
    bpy.context.view_layer.update(); xs, ys = [], []
    for n in names:
        o = O[n]
        for c in o.bound_box:
            v = world_to_camera_view(S, co, o.matrix_world @ Vector(c)); xs.append(v.x); ys.append(v.y)
    bpy.context.view_layer.update()
    S.render.use_border = True; S.render.use_crop_to_border = False
    S.render.border_min_x = max(0.0, min(xs) - margin); S.render.border_max_x = min(1.0, max(xs) + margin)
    S.render.border_min_y = max(0.0, min(ys) - margin); S.render.border_max_y = min(1.0, max(ys) + margin)

def sprite_mode(visible, hide=()):
    """Only `visible` is drawn; everything else cuts a hole (alpha 0) but still shades, shadows and mirrors as usual."""
    S.render.film_transparent = True; S.render.image_settings.color_mode = 'RGBA'
    for o in S.objects:
        if o.type != 'MESH' or o.name.startswith('softbox'): continue
        if o.name in hide: o.visible_camera = False
        elif o.name not in visible: o.is_holdout = True

# ---- motion blur: the pose function is sampled around the frame and baked into keyframes ----
BLUR = FAST + G_CENTRE + G_BARREL + G_THIRD + G_FOURTH
def bake(fn, frame=10, span=0.375, step=0.125):
    for n in BLUR: O[n].animation_data_clear(); O[n].rotation_mode = 'QUATERNION'
    last = {}
    n_s = int(round(2 * span / step))
    for i in range(n_s + 1):
        dt = -span + i * step
        pose.clear(); fn(dt); apply()
        for n in BLUR:
            o = O[n]; q = o.rotation_quaternion.copy()
            if n in last and last[n].dot(q) < 0: q.negate(); o.rotation_quaternion = q
            last[n] = q
            o.keyframe_insert('location', frame=frame + dt); o.keyframe_insert('rotation_quaternion', frame=frame + dt)
    for n in BLUR:
        act = O[n].animation_data.action
        for fc in (act.fcurves if hasattr(act, 'fcurves') else [f for l in act.layers for st in l.strips for cb in st.channelbags for f in cb.fcurves]):
            for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'
    S.frame_set(frame)

# ---- explode timing: frames are spaced by equal CHANGE ON SCREEN, not by equal time. The parts move in bursts (first part of each
#      quarter) and rest in between; equal time steps would give big jumps in the bursts and identical frames in the rests.
#      Measure: the fastest visible bounding-box corner, in pixels of an 800x1000 frame. The table goes to <out>/explode_t.json;
#      the site maps scroll position -> t -> frame with it, so both frame sets (any N) show the same choreography at the same scroll position. ----
def explode_times(n, grid=1600):
    pts_prev = None; S_ = [0.0]
    names = MOV + ['mainplate']
    for i in range(grid + 1):
        t = i / grid; pose.clear(); hairspring(0.0); escapement(0.0, running=False); explode(t); apply(); camera(t); bpy.context.view_layer.update()
        pts = []
        for nme in names:
            o = O[nme]; mw = o.matrix_world
            for c in o.bound_box:
                v = world_to_camera_view(S, co, mw @ Vector(c)); pts.append((v.x * 800.0, v.y * 1000.0, -0.05 < v.x < 1.05 and -0.05 < v.y < 1.05))
        if pts_prev is not None:
            d = max([math.hypot(a[0] - b[0], a[1] - b[1]) for a, b in zip(pts, pts_prev) if a[2] or b[2]] or [0.0])
            S_.append(S_[-1] + d)
        pts_prev = pts
    out = []; j = 0
    for f in range(n):
        s_ = S_[-1] * f / (n - 1)
        while j < grid - 1 and S_[j + 1] < s_: j += 1
        seg_ = S_[j + 1] - S_[j]; out.append(min(1.0, (j + ((s_ - S_[j]) / seg_ if seg_ > 0 else 0.0)) / grid))
    out[0] = 0.0; out[-1] = 1.0
    print('EXPLODE path', round(S_[-1], 1), 'px, per frame', round(S_[-1] / (n - 1), 2), 'px', flush=True)
    return out
if JOB == 'explode':
    import json
    _tf = os.path.join(OUT, 'explode_t.json')          # kept between portions; delete it after changing explode() or camera()
    if os.path.exists(_tf) and json.load(open(_tf))['n'] == NFR: T_EXP = json.load(open(_tf))['t']
    else:
        T_EXP = [round(x, 5) for x in explode_times(NFR)]; json.dump({'n': NFR, 't': T_EXP}, open(_tf, 'w'))

if '--nofast' in FLAGS:
    for n in FAST: O[n].hide_render = True

T_START = time.time()
for f in (ONLY if ONLY is not None else range(NFR)):
    if time.time() - T_START > BUDGET: print('BUDGET reached, frames left', flush=True); break
    if JOB == 'run' and f == 0: continue                   # run_000 is cut from explode_000 by the site tool
    fp = os.path.join(OUT, f'{JOB}_{f:03d}.png')
    if os.path.exists(fp): continue
    pose.clear(); hairspring(0.0); S.render.use_motion_blur = False
    if JOB == 'explode':
        t = T_EXP[f]; escapement(0.0, running=False); explode(t); apply(); camera(t)
    elif JOB == 'wind':
        escapement(0.0, running=False); winding(PITCH * f / NFR, screw=False); apply(); camera(0.0)
        S.render.image_settings.color_mode = 'RGBA'; border(G_RATCHET + ['crown_wheel', 'click', 'click_spring'] + G_STEM, 0.045)     # outside the border: alpha 0 = still frame
    elif JOB == 'run':
        camera(0.0); tau0 = (f - 1) / NB
        def at(dt, tau0=tau0):
            tau = tau0 + dt / NB; escapement(tau); train(beats_done(tau))
        bake(at); hairspring(AMP * math.sin(math.pi * tau0))
        S.render.use_motion_blur = True; S.render.motion_blur_shutter = 0.4; S.render.motion_blur_position = 'CENTER'
        for n in BLUR: O[n].cycles.use_motion_blur = True; O[n].cycles.motion_steps = 2
        S.render.image_settings.color_mode = 'RGBA'; border(FAST + G_FOURTH + G_THIRD, 0.045)
        if '--real' not in FLAGS:
            for n in ('fourth_wheel', 'fourth_pinion', 'fourth_arbor', 'third_wheel', 'third_pinion', 'third_arbor'): O[n].visible_camera = False
    elif JOB in ('f4', 't3', 'rs'):
        camera(0.0); escapement(0.0, running=False)
        if JOB == 'f4': grp = G_FOURTH; P(grp, rot=rad(DEG['fourth'] * f), pivot=F); vis = G_FOURTH[:3]; hide = ()
        if JOB == 't3': grp = G_THIRD; P(grp, rot=rad(-0.4 * f), pivot=T); vis = G_THIRD[:3]; hide = G_FOURTH[:3]
        if JOB == 'rs': grp = G_RSCREW; P(grp, rot=-rad(2.0 * f), pivot=B); vis = ['screw_ratchet']; hide = ()
        apply()
        if f == (ONLY[0] if ONLY else 0) or not S.render.film_transparent: sprite_mode(vis, hide)
        border(vis)
    bpy.context.view_layer.update()
    S.render.filepath = fp; t0 = time.time()
    bpy.ops.render.render(write_still=True)
    print('FRAME', JOB, f, round(time.time() - t0, 1), 's', flush=True)
