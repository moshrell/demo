# Calenberg Eins -- the watch around the C 01, built in code (case, dial, hands, strap) for the sales page.
# Run:  python watch.py <outdir> <samples> <shot,shot,...> [--scale 100]
#   shot = hero | front | side | cfg-<case>-<dial>-<band>      (case: stahl|rose, dial: silber|anthrazit|email, band: kalb|cordovan)
# Units: 1 BU = 1 mm. Case 39 mm, lug-to-lug 47 mm. Needs bpy, shapely (pip), like build.py.
import sys, os, math, time
HERE = os.path.dirname(os.path.abspath(__file__))
_src = open(os.path.join(HERE, 'build.py')).read().split('# ---- balance cock outline ----')[0]
_argv = sys.argv; sys.argv = ['x']
exec(compile(_src, 'build_head', 'exec'))              # materials, lathe/shape helpers, text, boolean (no movement is built)
sys.argv = _argv
args = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT = args[0] if args else os.path.join(HERE, 'renders_watch'); SPL = int(args[1]) if len(args) > 1 else 32
SHOTS = (args[2] if len(args) > 2 else 'hero').split(',')
SC = int(sys.argv[sys.argv.index('--scale') + 1]) if '--scale' in sys.argv else 100
os.makedirs(OUT, exist_ok=True)

# ---------------- materials ----------------
def mat_case(name, color, brushed=True):
    return metal(name, color, 'grain' if brushed else 'plain', top_r=0.30 if brushed else 0.10, edge_r=0.05, aniso=0.7, bump=0.10, ang=rad(90))
CASE = {'stahl': (mat_case('case_steel', (0.76, 0.77, 0.79)), metal('case_steel_pol', (0.80, 0.81, 0.83), top_r=0.04)),
        'rose': (mat_case('case_rose', (0.96, 0.62, 0.43)), metal('case_rose_pol', (0.98, 0.66, 0.46), top_r=0.04))}
def mat_dial(name, col, rough, grain, coat=0.0):
    m, nt, p = new_mat(name)
    p.inputs['Base Color'].default_value = (*col, 1); p.inputs['Roughness'].default_value = rough; p.inputs['Metallic'].default_value = 0.0
    try: p.inputs['Coat Weight'].default_value = coat; p.inputs['Coat Roughness'].default_value = 0.03
    except Exception: pass
    if grain:
        tc = nt.nodes.new('ShaderNodeTexCoord'); n = noise(nt, tc.outputs['Object'], 520.0, 1.0)
        b = nt.nodes.new('ShaderNodeBump'); b.inputs['Strength'].default_value = grain; b.inputs['Distance'].default_value = 0.01
        nt.links.new(n, b.inputs['Height']); nt.links.new(b.outputs[0], p.inputs['Normal'])
    return m
DIAL = {'silber': (mat_dial('dial_silver', (0.93, 0.92, 0.88), 0.42, 0.30), (0.02, 0.03, 0.07)),
        'anthrazit': (mat_dial('dial_anthracite', (0.045, 0.048, 0.056), 0.38, 0.35), (0.82, 0.80, 0.74)),
        'email': (mat_dial('dial_enamel', (0.90, 0.89, 0.85), 0.05, 0.0, coat=1.0), (0.015, 0.02, 0.05))}
INK = {}
def mat_ink(c):
    m, nt, p = new_mat('ink_%0.2f_%0.2f' % c[:2]); p.inputs['Base Color'].default_value = (*c, 1); p.inputs['Roughness'].default_value = 0.55; p.inputs['Metallic'].default_value = 0.0
    return m
def mat_leather(name, col, r=0.48):
    m, nt, p = new_mat(name); p.inputs['Base Color'].default_value = (*col, 1); p.inputs['Roughness'].default_value = r
    try: p.inputs['Sheen Weight'].default_value = 0.25; p.inputs['Coat Weight'].default_value = 0.12; p.inputs['Coat Roughness'].default_value = 0.3
    except Exception: pass
    tc = nt.nodes.new('ShaderNodeTexCoord'); n = noise(nt, tc.outputs['Object'], 9.0, 6.0)
    b = nt.nodes.new('ShaderNodeBump'); b.inputs['Strength'].default_value = 0.35; b.inputs['Distance'].default_value = 0.06
    nt.links.new(n, b.inputs['Height']); nt.links.new(b.outputs[0], p.inputs['Normal'])
    return m
BAND = {'kalb': (mat_leather('leather_black', (0.012, 0.012, 0.014)), (0.55, 0.53, 0.5)),
        'cordovan': (mat_leather('leather_cognac', (0.30, 0.105, 0.035), 0.40), (0.62, 0.38, 0.2))}
def mat_glass():
    m, nt, p = new_mat('sapphire'); nt.nodes.clear()
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); gl = nt.nodes.new('ShaderNodeBsdfGlossy'); gl.inputs['Roughness'].default_value = 0.0
    fr = nt.nodes.new('ShaderNodeFresnel'); fr.inputs['IOR'].default_value = 1.12
    mx = nt.nodes.new('ShaderNodeMixShader'); o = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(fr.outputs[0], mx.inputs[0]); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(gl.outputs[0], mx.inputs[2]); nt.links.new(mx.outputs[0], o.inputs[0])
    return m
GLASS = mat_glass()
STEELH = metal('hand_steel', (0.80, 0.81, 0.83), top_r=0.05)
BLUEH = metal('hand_blue', (0.02, 0.06, 0.40), top_r=0.08)

# ---------------- geometry ----------------
case_parts, lug_parts, crown_parts, index_parts, hand_parts, ink_parts = [], [], [], [], [], []
# middle case: ring cross-section revolved
mid = lathe('case_mid', [(15.2, 0.0), (18.0, 0.0), (18.9, 0.45), (19.5, 1.5), (19.5, 6.5), (19.2, 7.5), (18.4, 8.1), (17.45, 8.1), (17.45, 6.25), (15.2, 6.25)], CASE['stahl'][0], segs=128, closed=True)
case_parts.append(mid)
bez = lathe('case_bezel', [(17.45, 8.1), (18.45, 8.1), (19.1, 7.7), (19.4, 7.0), (19.4, 6.5), (17.45, 6.5)], CASE['stahl'][1], segs=128, closed=True)
case_parts.append(bez)
back = lathe('case_back', [(0, 0.0), (15.3, 0.0), (15.3, -0.35), (0, -0.35)], CASE['stahl'][1], segs=96, closed=True)
case_parts.append(back)
# lugs: four horns, tapered, bevelled
def lug_poly(sx, sy):
    pts = [(8.2, 14.2), (10.9, 14.2), (10.9, 18.0), (10.5, 21.0), (9.6, 23.4), (8.3, 23.6), (8.2, 20.0)]
    return Polygon([(sx * x, sy * y) for x, y in pts])
for sx in (-1, 1):
    for sy in (-1, 1):
        o = shape_obj('lug', lug_poly(sx, sy), 2.0, 6.0, 0.35, CASE['stahl'][0], res=2); lug_parts.append(o)
# crown at 3 o'clock: fluted cylinder along +X
def crown_geom(r=2.3, n=36, depth=0.28):
    pts = []
    for i in range(n * 4):
        a = 2 * math.pi * i / (n * 4); k = (i % 4)
        rr = r if k in (0, 1) else r - depth
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    return Polygon(pts)
cr = shape_obj('crown', crown_geom(), 0.0, 3.6, 0.12, CASE['stahl'][0], res=1)
cr.rotation_euler = (0, math.pi / 2, 0); cr.location = (19.4 + 1.8, 0, 4.4); crown_parts.append(cr)
cstem = lathe('crown_stem', [(0, 0), (1.3, 0), (1.3, 1.2), (0, 1.2)], CASE['stahl'][1], segs=32, closed=True); cstem.rotation_euler = (0, math.pi / 2, 0); cstem.location = (18.5, 0, 4.4); crown_parts.append(cstem)
# dial
dial = lathe('dial', [(0, 6.0), (17.3, 6.0), (17.3, 6.22), (0, 6.22)], DIAL['silber'][0], segs=128, closed=True)
subd = lathe('subdial', [(0, 6.22), (4.5, 6.22), (4.5, 6.15), (0, 6.15)], DIAL['silber'][0], segs=96, closed=True); subd.location = (0, -8.6, 0); subd.hide_render = True
# minute track + subdial ticks as thin boxes
def tick_poly(r0, r1, a, w):
    s, c = math.sin(a), math.cos(a)
    p = [(-w / 2, r0), (w / 2, r0), (w / 2, r1), (-w / 2, r1)]
    return [(x * c + y * s, -x * s + y * c) for x, y in p]
mt = []
for i in range(60):
    a = 2 * math.pi * i / 60; big = i % 5 == 0
    mt.append(Polygon(tick_poly(15.5 if big else 15.9, 16.6, a, 0.22 if not big else 0.0001)))
mt = [g for g in mt if g.area > 0]
track = shape_obj('track', unary_union([g for g in mt]), 6.22, 6.235, 0.0, mat_ink((0.02, 0.03, 0.07)), res=0)
ink_parts.append(track)
sd = []
for i in range(60):
    a = 2 * math.pi * i / 60; big = i % 5 == 0
    sd.append(Polygon([(x, y - 8.6) for x, y in tick_poly(3.5 if big else 3.85, 4.2, a, 0.1)]))
subt = shape_obj('subticks', unary_union(sd), 6.22, 6.235, 0.0, mat_ink((0.02, 0.03, 0.07)), res=0); ink_parts.append(subt)
# brand text at 12 and small line at 6
tm = text_mesh('brand', 'CALENBERG', 1.3, 0.012, lambda s: Matrix.Translation((s, 9.6, 6.235)), track=0.34); tm.materials.append(mat_ink((0.02, 0.03, 0.07)))
brand = link(bpy.data.objects.new('brand', tm)); ink_parts.append(brand)
tm2 = text_mesh('sub', 'HANNOVER', 0.62, 0.012, lambda s: Matrix.Translation((s, 6.0, 6.235)), track=0.4); tm2.materials.append(mat_ink((0.02, 0.03, 0.07)))
sub = link(bpy.data.objects.new('sub', tm2)); ink_parts.append(sub)
# applied indices: batons at 1..11 except 6 (subdial), double at 12
def baton(a, r0, r1, w, z0=6.22, z1=6.62):
    g = Polygon([(-w / 2, r0), (w / 2, r0), (w / 2 * 0.8, r1), (-w / 2 * 0.8, r1)])
    g = affinity.rotate(g, -math.degrees(a), origin=(0, 0))
    return shape_obj('idx', g, z0, z1, 0.05, CASE['stahl'][1], res=1)
for h in range(1, 13):
    if h == 6: continue
    a = 2 * math.pi * h / 12
    if h == 12:
        for dx in (-0.75, 0.75):
            g = affinity.translate(Polygon([(-0.3, 12.4), (0.3, 12.4), (0.26, 15.2), (-0.26, 15.2)]), dx, 0)
            index_parts.append(shape_obj('idx', g, 6.22, 6.62, 0.05, CASE['stahl'][1], res=1))
    else:
        index_parts.append(baton(a, 12.6, 15.1 if h % 3 else 15.4, 0.75 if h % 3 else 1.0))
# hands (10:09, seconds at the subdial)
def hand(name, pts, z0, z1, ang, mat, origin=(0, 0)):
    g = affinity.rotate(Polygon(pts), -ang, origin=(0, 0))
    g = affinity.translate(g, *origin)
    return shape_obj(name, g, z0, z1, 0.03, mat, res=1)
ang_h = (10 + 9 / 60) / 12 * 360; ang_m = 9 * 6 + 36 / 60 * 6
hh = hand('hand_h', [(0, -1.8), (-0.55, 0), (-1.15, 3.0), (0, 10.0), (1.15, 3.0), (0.55, 0)], 7.0, 7.16, ang_h, CASE['stahl'][1])
hm = hand('hand_m', [(0, -2.0), (-0.5, 0), (-0.95, 4.0), (0, 14.9), (0.95, 4.0), (0.5, 0)], 7.45, 7.6, ang_m, CASE['stahl'][1])
hs = hand('hand_s', [(-0.06, -1.1), (0.06, -1.1), (0.06, 3.7), (-0.06, 3.7)], 6.6, 6.68, 41 * 6, BLUEH, origin=(0, -8.6))
cap = lathe('hand_cap', [(0, 7.6), (0.75, 7.6), (0.75, 7.72), (0, 7.72)], CASE['stahl'][1], segs=32, closed=True)
hand_parts += [hh, hm, cap]
caps = lathe('hand_cap_s', [(0, 6.68), (0.35, 6.68), (0.35, 6.75), (0, 6.75)], BLUEH, segs=24, closed=True); caps.location = (0, -8.6, 0)
flange = lathe('flange', [(16.4, 6.22), (17.45, 7.5), (17.45, 6.22)], DIAL['silber'][0], segs=128, closed=True)
# crystal (domed)
dome = [(0, 9.3)] + [(17.45 * math.sin(t / 20 * math.pi / 2), 9.3 - 1.1 * (1 - math.cos(t / 20 * math.pi / 2)) * 1.0) for t in range(1, 21)]
cry = lathe('crystal', [(r, z) for r, z in dome] + [(17.45, 8.0), (0, 8.0)], GLASS, segs=128, closed=True)
cry.visible_shadow = False

# ---------------- strap ----------------
def strap_profile(L=78.0):
    pts = [(21.4, 3.3), (23.4, 3.1), (25.4, 2.55), (27.2, 1.9), (28.8, 1.6)]
    y = 28.8
    while y < 21.4 + L: y += 2.0; pts.append((y, 1.6))
    return pts
def build_strap(sign, mat, name):
    pr = strap_profile(); n = len(pr)
    bm = bmesh.new(); rows = []
    for i, (y, z) in enumerate(pr):
        t = (y - 21.4) / 80.0
        w = 10.0 - 1.4 * min(1.0, t * 1.1)                      # half width, tapers
        th = 1.55 - 0.45 * min(1.0, t * 1.3)                    # half thickness
        dz = 0.0
        if i + 1 < n: dy, dzz = pr[i + 1][0] - y, pr[i + 1][1] - z
        else: dy, dzz = pr[i][0] - pr[i - 1][0], pr[i][1] - pr[i - 1][1]
        l = math.hypot(dy, dzz); ty, tz = dy / l, dzz / l; ny, nz = -tz, ty           # normal (up)
        x_off = 0.0 if y < 45 else 0.00055 * (y - 45) ** 2.0                            # a slight sideways curl on the floor
        ring = []
        for (xx, up) in ((-w, -th), (-w + 0.5, th), (w - 0.5, th), (w, -th)):
            ring.append(bm.verts.new((xx + x_off, sign * (y + ny * up), z + nz * up * 1.0)))
        rows.append(ring)
    for a, b in zip(rows[:-1], rows[1:]):
        for k in range(4):
            k2 = (k + 1) % 4; bm.faces.new((a[k], a[k2], b[k2], b[k]))
    bm.faces.new(rows[0][::-1]); bm.faces.new(rows[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    sub = None
    ob = link(bpy.data.objects.new(name, me)); me.materials.append(mat)
    m = ob.modifiers.new('sub', 'SUBSURF'); m.levels = 2; m.render_levels = 2
    me.shade_smooth()
    return ob
straps = [build_strap(1, BAND['kalb'][0], 'strap_top'), build_strap(-1, BAND['kalb'][0], 'strap_bottom')]
# stitching: small boxes along both edges
def build_stitch(sign, name):
    bm = bmesh.new(); pr = strap_profile(); n = len(pr)
    for i in range(1, n - 3):
        for side in (-1, 1):
            for f in (0.0, 0.5):
                y, z = pr[i]; y2, z2 = pr[i + 1]
                yy, zz = y + (y2 - y) * f, z + (z2 - z) * f
                t = (yy - 21.4) / 80.0; w = 10.0 - 1.4 * min(1.0, t * 1.1); th = 1.55 - 0.45 * min(1.0, t * 1.3)
                x_off = 0.0 if yy < 45 else 0.00055 * (yy - 45) ** 2.0
                l = math.hypot(y2 - y, z2 - z); ty, tz = (y2 - y) / l, (z2 - z) / l; ny, nz = -tz, ty
                cx = side * (w - 1.7) + x_off
                c = Vector((cx, sign * (yy + ny * (th + 0.02)), zz + nz * (th + 0.02)))
                T = Vector((0, sign * ty, tz)); N = Vector((0, sign * ny, nz)); X = Vector((1, 0, 0))
                vs = [bm.verts.new(c + X * dx + T * dt + N * dn) for dx, dt, dn in ((-0.14, -0.5, 0), (0.14, -0.5, 0), (0.14, 0.5, 0), (-0.14, 0.5, 0), (-0.14, -0.5, 0.06), (0.14, -0.5, 0.06), (0.14, 0.5, 0.06), (-0.14, 0.5, 0.06))]
                for q in ((0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
                    try: bm.faces.new([vs[k] for k in q])
                    except ValueError: pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me.materials.append(mat_ink((0.6, 0.58, 0.54)))
    return link(bpy.data.objects.new(name, me))
stitches = [build_stitch(1, 'stitch_top'), build_stitch(-1, 'stitch_bottom')]
# spring bars hint (steel) -- tiny, mostly hidden
# floor
fl = bpy.data.meshes.new('floor'); bmf = bmesh.new(); bmesh.ops.create_grid(bmf, x_segments=1, y_segments=1, size=600); bmf.to_mesh(fl); bmf.free()
fm_ = new_mat('floor')[0]; fm_.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.012, 0.0125, 0.014, 1)
fm_.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.22
fl.materials.append(fm_); floor = link(bpy.data.objects.new('floor', fl)); floor.location.z = -0.36
# the watch lies on its back: floor at the case back plane
w_ = bpy.data.worlds.new('w'); S.world = w_
try: w_.use_nodes = True
except Exception: pass
w_.node_tree.nodes.clear(); _bg = w_.node_tree.nodes.new('ShaderNodeBackground'); _bg.inputs[0].default_value = (0.10, 0.10, 0.105, 1)
_wo = w_.node_tree.nodes.new('ShaderNodeOutputWorld'); w_.node_tree.links.new(_bg.outputs[0], _wo.inputs[0])

# ---------------- variants ----------------
def variant(case, dial_id, band):
    cm, cp = CASE[case]
    for o in case_parts + lug_parts + crown_parts:
        o.data.materials[0] = cp if o.name in ('case_bezel', 'case_back', 'crown_stem') else cm
    for o in index_parts + hand_parts + [cap]: o.data.materials[0] = cp
    dm, inkc = DIAL[dial_id]
    dial.data.materials[0] = dm; subd.data.materials[0] = dm; flange.data.materials[0] = dm
    for o in ink_parts: o.data.materials[0] = mat_ink(inkc)
    for o in straps: o.data.materials[0] = BAND[band][0]
    for o in stitches: o.data.materials[0] = mat_ink(BAND[band][1])

# ---------------- lights & cameras ----------------
RIG = [((-30, -90, 70), (120, 70), 2.4, (1.0, 0.965, 0.92), 0.8),
       ((95, -10, 40), (30, 120), 2.2, (0.86, 0.92, 1.0), 0.0),
       ((-95, 10, 40), (30, 120), 1.6, (1.0, 0.95, 0.9), 0.0),
       ((10, 95, 45), (140, 40), 2.0, (1.0, 0.92, 0.84), 0.0),
       ((0, -10, 150), (100, 100), 1.3, (1, 1, 1), 0.0)]
rig = []
for i, (loc, size, st, colr, gr) in enumerate(RIG):
    me = bpy.data.meshes.new('sb'); bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5); bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new('softbox%d' % i, me)); o.location = loc; o.scale = (size[0], size[1], 1)
    o.rotation_euler = (Vector((0, 0, 4)) - Vector(loc)).to_track_quat('Z', 'Y').to_euler()
    me.materials.append(mat_emit('sbw%d' % i, st, colr, gr)); o.visible_camera = False; rig.append(o)
SHOTCAM = {'hero': dict(loc=(-45, -105, 105), tgt=(0, -4.0, 3.5), lens=88, res=(1200, 1500), ap=0.0),
           'front': dict(loc=(0, 0, 210), tgt=(0, 0, 6), lens=135, res=(1400, 1400), ap=0.0),
           'side': dict(loc=(150, -18, 14), tgt=(0, 0, 4.2), lens=95, res=(1400, 1000), ap=0.0),
           'cfg': dict(loc=(-45, -105, 105), tgt=(0, -4.0, 3.5), lens=88, res=(800, 1000), ap=0.0)}
cam = bpy.data.cameras.new('cam'); camo = link(bpy.data.objects.new('cam', cam)); S.camera = camo
cam.clip_start = 1; cam.clip_end = 2000
S.render.engine = 'CYCLES'; S.cycles.device = 'CPU'; S.cycles.samples = SPL; S.cycles.use_adaptive_sampling = True; S.cycles.adaptive_threshold = 0.015
S.cycles.use_denoising = True; S.cycles.max_bounces = 8; S.cycles.glossy_bounces = 6; S.cycles.transmission_bounces = 6
S.cycles.caustics_reflective = False; S.cycles.caustics_refractive = False
S.render.image_settings.file_format = 'PNG'
try: S.view_settings.view_transform = 'AgX'; S.view_settings.look = 'AgX - Medium High Contrast'
except Exception as e: print('look', e)
for sh in SHOTS:
    base = sh.split('-')[0]
    if base == 'cfg': _, c_, d_, b_ = sh.split('-'); variant(c_, d_, b_)
    else: variant('stahl', 'silber', 'kalb')
    c = SHOTCAM[base]
    camo.location = c['loc']; camo.rotation_euler = (Vector(c['tgt']) - Vector(c['loc'])).to_track_quat('-Z', 'Y').to_euler(); cam.lens = c['lens']
    S.render.resolution_x, S.render.resolution_y = c['res']; S.render.resolution_percentage = SC
    S.render.filepath = os.path.join(OUT, sh + '.png'); t0 = time.time()
    bpy.ops.render.render(write_still=True); print('RENDERED', sh, round(time.time() - t0, 1), 's', flush=True)
