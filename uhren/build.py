# Calenberg Kaliber C 01 -- fictional hand-wound movement, built entirely in code.
# Run:  blender -b -P build.py -- <outdir> <samples> <cams,comma> <scale%> [--save] [--norender]
# Units: 1 BU = 1 mm. Movement diameter 30.6 mm.
import bpy, bmesh, math, sys, os
from mathutils import Vector, Matrix
from shapely.geometry import Point, Polygon, box, LineString, MultiPoint
from shapely.ops import unary_union
from shapely import affinity

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
pos = [a for a in argv if not a.startswith('--')]
HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = pos[0] if len(pos) > 0 else os.path.join(HERE, 'renders')
SAMPLES = int(pos[1]) if len(pos) > 1 else 64
CAMS_RUN = pos[2].split(',') if len(pos) > 2 else ['hero']
SCALE = int(pos[3]) if len(pos) > 3 else 100
BRAND = 'CALENBERG'

bpy.ops.wm.read_factory_settings(use_empty=True)
S = bpy.context.scene
col = S.collection
rad = math.radians

# =====================================================================
# materials
# =====================================================================
def M(nt, op, a, b=None):
    n = nt.nodes.new('ShaderNodeMath'); n.operation = op
    for i, v in enumerate([a, b]):
        if v is None: continue
        if isinstance(v, (int, float)): n.inputs[i].default_value = v
        else: nt.links.new(v, n.inputs[i])
    return n.outputs[0]

def noise(nt, vec, scale, detail=2.0):
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = detail
    nt.links.new(vec, n.inputs['Vector']); return n.outputs[0]

def combine(nt, x, y, z=0.0):
    c = nt.nodes.new('ShaderNodeCombineXYZ')
    for i, v in enumerate([x, y, z]):
        if isinstance(v, (int, float)): c.inputs[i].default_value = v
        else: nt.links.new(v, c.inputs[i])
    return c.outputs[0]

def new_mat(name):
    m = bpy.data.materials.new(name)
    try: m.use_nodes = True
    except Exception: pass
    nt = m.node_tree; nt.nodes.clear()
    p = nt.nodes.new('ShaderNodeBsdfPrincipled'); p.name = 'Principled BSDF'
    o = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(p.outputs[0], o.inputs[0])
    return m, nt, p

def metal(name, color, kind='plain', top_r=0.2, edge_r=0.05, aniso=0.7, bump=0.25, **k):
    """Metal with a decorative finish on upward faces and polished bevels/flanks elsewhere."""
    m, nt, p = new_mat(name)
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = 1.0
    p.inputs['Roughness'].default_value = top_r
    if kind == 'plain':
        tc = nt.nodes.new('ShaderNodeTexCoord'); vec = tc.outputs['Object']
        if k.get('axial'):      # parts that turn on their own axis: noise depends on radius and height only, so any rotation looks the same
            sp = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(vec, sp.inputs[0])
            rr_ = M(nt, 'SQRT', M(nt, 'ADD', M(nt, 'MULTIPLY', sp.outputs[0], sp.outputs[0]), M(nt, 'MULTIPLY', sp.outputs[1], sp.outputs[1])))
            vec = combine(nt, rr_, 0.0, sp.outputs[2])
        nz = noise(nt, vec, k.get('nscale', 2.2), 4.0)
        nt.links.new(M(nt, 'ADD', M(nt, 'MULTIPLY', M(nt, 'POWER', nz, 2.0), k.get('nvar', 0.07)), top_r * 0.7), p.inputs['Roughness'])
        return m
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Object'], sep.inputs[0])
    X, Y = sep.outputs[0], sep.outputs[1]
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    sn = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(geo.outputs['True Normal'], sn.inputs[0])
    top = M(nt, 'GREATER_THAN', sn.outputs[2], 0.95)
    rvar = None
    if kind == 'geneva':
        ang, w = k.get('ang', rad(28)), k.get('w', 1.6)
        ca, sa = math.cos(ang), math.sin(ang)
        u = M(nt, 'ADD', M(nt, 'MULTIPLY', X, ca), M(nt, 'MULTIPLY', Y, sa))
        v = M(nt, 'SUBTRACT', M(nt, 'MULTIPLY', Y, ca), M(nt, 'MULTIPLY', X, sa))
        saw = M(nt, 'FRACT', M(nt, 'DIVIDE', u, w))
        s = M(nt, 'SUBTRACT', saw, 0.5)
        arc = M(nt, 'MULTIPLY', M(nt, 'POWER', s, 2.0), 2.4)
        scr = noise(nt, combine(nt, M(nt, 'MULTIPLY', u, 0.3), M(nt, 'MULTIPLY', M(nt, 'ADD', v, arc), 34.0)), 1.0, 3.0)
        h = M(nt, 'ADD', M(nt, 'MULTIPLY', saw, k.get('tilt', 0.5)), M(nt, 'MULTIPLY', scr, 0.25))
        rvar = M(nt, 'MULTIPLY', scr, 0.10)
        a = M(nt, 'ADD', M(nt, 'MULTIPLY', s, k.get('fan', 1.5)), ang)
        tx, ty = M(nt, 'MULTIPLY', M(nt, 'SINE', a), -1.0), M(nt, 'COSINE', a)
    elif kind == 'perlage':
        s = k.get('cell', 1.1); hh = 0.6 * s; R = 0.66 * s
        j0 = M(nt, 'FLOOR', M(nt, 'DIVIDE', Y, hh))
        cands = []
        for dj in (0, 1, 2):            # later rows lie on top
            j = M(nt, 'ADD', j0, dj)
            xo = M(nt, 'MULTIPLY', M(nt, 'FLOORED_MODULO', j, 2.0), 0.5 * s)
            xs = M(nt, 'SUBTRACT', X, xo)
            i0 = M(nt, 'FLOOR', M(nt, 'DIVIDE', xs, s))
            dy = M(nt, 'SUBTRACT', Y, M(nt, 'MULTIPLY', j, hh))
            for di in (0, 1):
                dx = M(nt, 'SUBTRACT', xs, M(nt, 'MULTIPLY', M(nt, 'ADD', i0, di), s))
                dd = M(nt, 'SQRT', M(nt, 'ADD', M(nt, 'MULTIPLY', dx, dx), M(nt, 'MULTIPLY', dy, dy)))
                cands.append((dx, dy, M(nt, 'LESS_THAN', dd, R)))
        dx, dy = cands[0][0], cands[0][1]
        for cx, cy, cov in cands[1:]:
            dx = M(nt, 'ADD', dx, M(nt, 'MULTIPLY', cov, M(nt, 'SUBTRACT', cx, dx)))
            dy = M(nt, 'ADD', dy, M(nt, 'MULTIPLY', cov, M(nt, 'SUBTRACT', cy, dy)))
        d = M(nt, 'SQRT', M(nt, 'ADD', M(nt, 'MULTIPLY', dx, dx), M(nt, 'MULTIPLY', dy, dy)))
        dn = M(nt, 'MAXIMUM', d, 1e-4)
        rings = M(nt, 'SINE', M(nt, 'MULTIPLY', d, 95.0 / s))
        h = M(nt, 'ADD', M(nt, 'MULTIPLY', rings, 0.3), M(nt, 'MULTIPLY', d, 0.5 / s))
        rvar = M(nt, 'MULTIPLY', rings, 0.03)
        tx, ty = M(nt, 'DIVIDE', dx, dn), M(nt, 'DIVIDE', dy, dn)
    elif kind in ('sunray', 'circular'):
        ang = M(nt, 'ARCTAN2', Y, X)
        r = M(nt, 'MAXIMUM', M(nt, 'SQRT', M(nt, 'ADD', M(nt, 'MULTIPLY', X, X), M(nt, 'MULTIPLY', Y, Y))), 1e-4)
        if kind == 'sunray':
            if k.get('per'):    # streaks repeat every tooth (per = tooth count): one tooth further gives the identical picture
                cc = k.get('n', 80.0) / k['per']; pa = M(nt, 'MULTIPLY', ang, float(k['per']))
                scr = noise(nt, combine(nt, M(nt, 'MULTIPLY', M(nt, 'COSINE', pa), cc), M(nt, 'MULTIPLY', M(nt, 'SINE', pa), cc), M(nt, 'MULTIPLY', r, 0.15)), 1.0, 3.0)
            else:
                scr = noise(nt, combine(nt, M(nt, 'MULTIPLY', ang, k.get('n', 80.0)), M(nt, 'MULTIPLY', r, 0.15)), 1.0, 3.0)
            tx, ty = M(nt, 'DIVIDE', M(nt, 'MULTIPLY', Y, -1.0), r), M(nt, 'DIVIDE', X, r)
        else:
            scr = noise(nt, combine(nt, M(nt, 'MULTIPLY', r, k.get('n', 45.0)), 0.0), 1.0, 3.0)      # pure rings: rotation-invariant
            tx, ty = M(nt, 'DIVIDE', X, r), M(nt, 'DIVIDE', Y, r)
        h = scr; rvar = M(nt, 'MULTIPLY', scr, 0.08)
    elif kind == 'grain':
        ang = k.get('ang', 0.0); ca, sa = math.cos(ang), math.sin(ang)
        u = M(nt, 'ADD', M(nt, 'MULTIPLY', X, ca), M(nt, 'MULTIPLY', Y, sa))
        v = M(nt, 'SUBTRACT', M(nt, 'MULTIPLY', Y, ca), M(nt, 'MULTIPLY', X, sa))
        scr = noise(nt, combine(nt, M(nt, 'MULTIPLY', u, 0.3), M(nt, 'MULTIPLY', v, 40.0)), 1.0, 3.0)
        h = scr; rvar = M(nt, 'MULTIPLY', scr, 0.08)
        tx, ty = -sa, ca
    # roughness: finish on top, polish elsewhere
    rr = M(nt, 'ADD', M(nt, 'MULTIPLY', top, M(nt, 'ADD', rvar, top_r - edge_r)), edge_r)
    side = M(nt, 'LESS_THAN', M(nt, 'ABSOLUTE', sn.outputs[2]), 0.3)
    rr = M(nt, 'ADD', rr, M(nt, 'MULTIPLY', side, k.get('flank_r', 0.3) - edge_r))
    nt.links.new(rr, p.inputs['Roughness'])
    nt.links.new(M(nt, 'MULTIPLY', top, aniso), p.inputs['Anisotropic'])
    vt = nt.nodes.new('ShaderNodeVectorTransform'); vt.vector_type = 'VECTOR'
    vt.convert_from = 'OBJECT'; vt.convert_to = 'WORLD'
    nt.links.new(combine(nt, tx, ty), vt.inputs[0]); nt.links.new(vt.outputs[0], p.inputs['Tangent'])
    b = nt.nodes.new('ShaderNodeBump'); b.inputs['Strength'].default_value = bump
    b.inputs['Distance'].default_value = k.get('dist', 0.04)
    nt.links.new(M(nt, 'MULTIPLY', h, top), b.inputs['Height']); nt.links.new(b.outputs[0], p.inputs['Normal'])
    return m

def mat_ruby():
    m = metal('ruby', (0.90, 0.02, 0.09), top_r=0.02)
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Metallic'].default_value = 0.0
    p.inputs['Transmission Weight'].default_value = 0.6
    p.inputs['Emission Color'].default_value = (0.9, 0.02, 0.06, 1); p.inputs['Emission Strength'].default_value = 0.07
    p.inputs['IOR'].default_value = 1.77
    return m

def mat_emit(name, strength, color=(1, 1, 1), grad=0.0):
    m, nt, _ = new_mat(name); nt.nodes.clear()
    e = nt.nodes.new('ShaderNodeEmission'); e.inputs['Color'].default_value = (*color, 1)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    def edge(c):   # soft falloff to the border of the box
        t = M(nt, 'ABSOLUTE', M(nt, 'SUBTRACT', M(nt, 'MULTIPLY', c, 2.0), 1.0))
        return M(nt, 'SUBTRACT', 1.0, M(nt, 'POWER', t, 5.0))
    f = M(nt, 'MULTIPLY', edge(sep.outputs[0]), edge(sep.outputs[1]))
    g = M(nt, 'ADD', M(nt, 'MULTIPLY', sep.outputs[1], grad), 1.0 - grad)
    nt.links.new(M(nt, 'MULTIPLY', M(nt, 'MULTIPLY', f, g), strength), e.inputs['Strength'])
    o = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(e.outputs[0], o.inputs[0])
    return m

GEN_ANG = rad(34)
C_BRIDGE = (0.70, 0.675, 0.635)        # warm rhodium / German-silver tone
C_ROSE = (0.96, 0.60, 0.40)            # 5N rose gold
C_STEEL = (0.74, 0.75, 0.77)
GENEVA = metal('bridge_geneva', C_BRIDGE, 'geneva', top_r=0.22, aniso=0.8, bump=0.45, dist=0.03, tilt=1.0, fan=1.7, ang=GEN_ANG, w=1.6)
PLATE = metal('plate_perlage', (0.20, 0.20, 0.215), 'perlage', top_r=0.24, aniso=0.75, bump=0.18, cell=1.15, edge_r=0.08)
POCKET = metal('plate_perlage_fine', (0.15, 0.15, 0.165), 'perlage', top_r=0.26, aniso=0.75, bump=0.18, cell=0.72, edge_r=0.08)
ROSE = metal('rose_gold_circular', C_ROSE, 'circular', top_r=0.2, aniso=0.6, bump=0.12)
ROSEP = metal('rose_gold_polished', C_ROSE, top_r=0.05)
ROSEFILL = metal('rose_gold_fill', (0.80, 0.36, 0.14), top_r=0.5); ROSEFILL.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = 0.55
STEEL = metal('steel_black_polish', C_STEEL, top_r=0.035)
STEEL_AX = metal('steel_black_polish_axial', C_STEEL, top_r=0.035, axial=True)      # turning parts
STEEL_SUN = metal('steel_sunray', (0.62, 0.63, 0.66), 'sunray', top_r=0.22, aniso=0.85, bump=0.3, n=116.0, per=58)   # ratchet, 58 teeth
STEEL_SUN_CW = metal('steel_sunray_crown', (0.62, 0.63, 0.66), 'sunray', top_r=0.22, aniso=0.85, bump=0.3, n=96.0, per=32)   # crown wheel, 32 teeth
STEEL_GRAIN = metal('steel_grained', C_STEEL, 'grain', top_r=0.24, aniso=0.7, bump=0.15, ang=rad(-60))
BLUE = metal('steel_blued', (0.018, 0.045, 0.36), top_r=0.05)
BLUE_HS = metal('hairspring_blued', (0.03, 0.07, 0.42), top_r=0.18)
GLUCY = metal('glucydur_circular', (0.93, 0.74, 0.44), 'circular', top_r=0.17, aniso=0.6, bump=0.1, n=60.0)
GLUCYP = metal('gold_polished', (1.0, 0.76, 0.36), top_r=0.05)
BARREL = metal('barrel_sunray', (0.86, 0.72, 0.48), 'sunray', top_r=0.22, aniso=0.7, bump=0.1)
RUBY = mat_ruby()
SLOT_BLUE = metal('slot_blued', (0.008, 0.02, 0.16), top_r=0.5)      # machined slot floor: matt, reads dark
SLOT_STEEL = metal('slot_steel', (0.30, 0.31, 0.33), top_r=0.5)

# =====================================================================
# geometry helpers
# =====================================================================
def link(ob): col.objects.link(ob); return ob

def finish_mesh(me, weld=True, angle=28):
    if weld:
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me); bm.free()
    me.shade_smooth()
    me.set_sharp_from_angle(angle=rad(angle))
    return me

def shape_obj(name, geom, z0, z1, bevel, mat, loc=(0, 0), rot=0.0, res=0):
    """Extrude a shapely polygon between z0..z1 with a flat chamfer (anglage) -> mesh object."""
    g = geom.buffer(-bevel, join_style=1) if bevel > 0 else geom
    if bevel >= 0.08: g = g.buffer(-0.04, join_style=1).buffer(0.04, join_style=1, quad_segs=6)   # no acute convex tips: the curve bevel mitres them into spikes
    g = g.simplify(0.0015, preserve_topology=True)   # near-duplicate points make the curve bevel spike
    cu = bpy.data.curves.new(name + '_c', 'CURVE'); cu.dimensions = '2D'; cu.fill_mode = 'BOTH'
    polys = list(g.geoms) if g.geom_type in ('MultiPolygon', 'GeometryCollection') else [g]
    for poly in polys:
        if poly.geom_type != 'Polygon' or poly.is_empty: continue
        for ring in [poly.exterior] + list(poly.interiors):
            pts = list(ring.coords)[:-1]
            sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
            for p, c in zip(sp.points, pts): p.co = (c[0], c[1], 0, 1)
            sp.use_cyclic_u = True
    cu.extrude = max((z1 - z0) / 2 - bevel, 0.0)
    cu.bevel_depth = bevel; cu.bevel_resolution = res
    tmp = bpy.data.objects.new(name + '_c', cu)
    me = bpy.data.meshes.new_from_object(tmp)
    bpy.data.objects.remove(tmp); bpy.data.curves.remove(cu)
    me.name = name; finish_mesh(me); me.materials.clear(); me.materials.append(mat)
    ob = link(bpy.data.objects.new(name, me))
    ob.location = (loc[0], loc[1], (z0 + z1) / 2); ob.rotation_euler[2] = rot
    return ob

def lathe_mesh(name, prof, segs=48, closed=False):
    bm = bmesh.new(); rings = []
    for r, z in prof:
        if r < 1e-6: rings.append([bm.verts.new((0, 0, z))])
        else: rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs), z)) for i in range(segs)])
    pairs = list(zip(rings[:-1], rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
    for a, b in pairs:
        if len(a) == 1 and len(b) == 1: continue
        for i in range(segs):
            j = (i + 1) % segs
            if len(a) == 1: bm.faces.new((a[0], b[j], b[i]))
            elif len(b) == 1: bm.faces.new((a[i], a[j], b[0]))
            else: bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return finish_mesh(me, weld=False)

def lathe(name, prof, mat, loc=(0, 0, 0), segs=48, closed=False, rot=None):
    me = lathe_mesh(name, prof, segs, closed); me.materials.append(mat)
    ob = link(bpy.data.objects.new(name, me)); ob.location = loc
    if rot: ob.rotation_euler = rot
    return ob

def join(objs, name=None):
    objs = [o for o in objs if o is not None]
    if len(objs) > 1:
        with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=objs, selected_objects=objs):
            bpy.ops.object.join()
    if name: objs[0].name = name; objs[0].data.name = name
    return objs[0]

def orient(me, tag=''):
    bm = bmesh.new(); bm.from_mesh(me)
    v = bm.calc_volume(signed=True)
    nm = sum(1 for e in bm.edges if not e.is_manifold)
    if v < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces); bm.to_mesh(me)
    bm.free()
    print('ORIENT', tag, me.name, 'vol %.3f' % v, 'nonmanifold', nm)

def boolean_cut(ob, cutter, transfer=False):
    mod = ob.modifiers.new('cut', 'BOOLEAN'); mod.operation = 'DIFFERENCE'; mod.object = cutter; mod.solver = 'EXACT'
    if transfer: mod.material_mode = 'TRANSFER'     # cut faces take the cutter's material
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear(); old = ob.data; ob.data = me; me.name = old.name
    bpy.data.meshes.remove(old)
    finish_mesh(me, weld=False)

def circ(x, y, r, q=48): return Point(x, y).buffer(r, quad_segs=q)
def pol(r, deg): return (r * math.cos(rad(deg)), r * math.sin(rad(deg)))
def fillet(g, r): return g.buffer(r, join_style=1).buffer(-r, join_style=1)          # round concave corners
def rounded(g, r): return g.buffer(-r, join_style=1).buffer(r, join_style=1)         # round convex corners
def capsule(a, b, w): return LineString([a, b]).buffer(w)
def halfplane(nx, ny, c, big=80):   # p.n > c
    tx, ty = -ny, nx; p0 = (nx * c, ny * c)
    return Polygon([(p0[0] + tx * big, p0[1] + ty * big), (p0[0] - tx * big, p0[1] - ty * big),
                    (p0[0] - tx * big + nx * big, p0[1] - ty * big + ny * big), (p0[0] + tx * big + nx * big, p0[1] + ty * big + ny * big)])

def gear(r, n, tooth=0.28, spokes=5, rim=0.55, hub=0.7, spoke_w=0.42, profile='std'):
    prof = {'std': [(0.0, 0), (0.2, 0), (0.36, 1), (0.64, 1), (0.8, 0)],
            'wolf': [(0.0, 0), (0.1, 0), (0.78, 1), (0.93, 1)]}[profile]
    pts = []
    for i in range(n):
        a0 = 2 * math.pi * i / n; da = 2 * math.pi / n
        for f, up in prof:
            rr = r if up else r - tooth
            a = a0 + f * da; pts.append((rr * math.cos(a), rr * math.sin(a)))
    g = Polygon(pts)
    if spokes:
        ri = r - tooth - rim
        keep = [circ(0, 0, hub)]
        for i in range(spokes):
            sp = Polygon([(0, -spoke_w * 0.8), (ri + 0.2, -spoke_w * 0.42), (ri + 0.2, spoke_w * 0.42), (0, spoke_w * 0.8)])
            keep.append(affinity.rotate(sp, 360.0 * i / spokes, origin=(0, 0)))
        cut = rounded(circ(0, 0, ri).difference(unary_union(keep)), 0.16)
        g = g.difference(cut)
    return g

# ---- screws (cached meshes, slot cut by boolean) ----
_screw_cache = {}
def screw(name, x, y, ztop, r=0.86, ang=0.4, mat=None, h=None):
    mat = mat or BLUE; h = h or 0.55 * r
    key = (round(r, 3), round(h, 3), mat.name)
    if key not in _screw_cache:
        c = 0.11 * r; d = 0.06 * r
        prof = [(0, -h - 0.5), (r * 0.45, -h - 0.5), (r * 0.45, -h), (r, -h), (r, -c)]
        for i in range(9):
            t = i / 8; rr = (r - c) * (1 - t)
            prof.append((rr, d * (1 - (rr / (r - c)) ** 2)))
        ob = lathe('scr_tmp', prof, mat, segs=48)
        bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=(2.6 * r, 0.24 * r, 1.0), verts=bm.verts)
        bmesh.ops.translate(bm, vec=(0, 0, 0.5 - 0.34 * r), verts=bm.verts)
        cm = bpy.data.meshes.new('cut'); bm.to_mesh(cm); bm.free()
        cm.materials.append(SLOT_BLUE if mat is BLUE else SLOT_STEEL)
        co = link(bpy.data.objects.new('cut', cm))
        boolean_cut(ob, co, transfer=True)
        bpy.data.objects.remove(co); bpy.data.meshes.remove(cm)
        _screw_cache[key] = ob.data; bpy.data.objects.remove(ob)
    ob = link(bpy.data.objects.new(name, _screw_cache[key]))
    ob.location = (x, y, ztop); ob.rotation_euler[2] = ang
    return ob

def jewel(name, x, y, ztop, rj=0.5, rc=1.0, depth=0.5, cap=False, hole=0.085, mat_ch=None):
    """Ruby in a polished gold chaton, top flush with ztop."""
    c = 0.07 * rc / 1.0
    lathe(name + '_chaton', [(rj * 0.98, -depth), (rc, -depth), (rc, 0.05 - c), (rc - c, 0.05), (rj + 0.06, 0.05), (rj * 0.98, 0.0)],
          mat_ch or ROSEP, (x, y, ztop), closed=True)
    if cap:
        prof = [(0, -0.3), (rj, -0.3), (rj, -0.03)] + [(rj * (1 - i / 8), -0.03 + 0.1 * rj * (1 - (1 - i / 8) ** 2)) for i in range(1, 9)]
        lathe(name + '_ruby', prof, RUBY, (x, y, ztop))
    else:
        prof = [(hole, -depth + 0.05), (rj, -depth + 0.05), (rj, -0.05), (rj - 0.04, -0.01), (rj * 0.62, 0.0),
                (rj * 0.5, -0.03), (rj * 0.36, -0.10), (hole * 1.5, -0.17), (hole, -0.2)]
        lathe(name + '_ruby', prof, RUBY, (x, y, ztop), closed=True)

def arbor(name, x, y, z0, z1, r=0.13):
    return lathe(name, [(0, z0), (r, z0), (r, z1 - 0.34), (0.065, z1 - 0.32), (0.065, z1 - 0.07), (0.035, z1 - 0.03), (0, z1 - 0.03)], STEEL_AX, (x, y, 0), segs=24)

# ---- engraving ----
FONT = None
for f in ('pala.ttf', 'georgia.ttf', 'times.ttf'):
    fp = os.path.join('C:/Windows/Fonts', f)
    if os.path.exists(fp): FONT = bpy.data.fonts.load(fp); break
_glyphs = {}
def glyph(ch, size, extrude):
    key = (ch, size, extrude)
    if key not in _glyphs:
        cu = bpy.data.curves.new('g', 'FONT'); cu.body = ch; cu.size = size; cu.extrude = extrude; cu.resolution_u = 5
        if FONT: cu.font = FONT
        tmp = link(bpy.data.objects.new('g', cu))
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
        bpy.data.objects.remove(tmp); bpy.data.curves.remove(cu)
        xs = [v.co.x for v in me.vertices] or [0, 0]; ys = [v.co.y for v in me.vertices] or [0, 0]
        _glyphs[key] = (me, min(xs), max(xs), max(ys))
    return _glyphs[key]

def text_mesh(name, text, size, extrude, placer, track=0.22, fit=None):
    cap = glyph('H', size, 0.0)[3]
    items = []; x = 0.0
    def layout(gap):
        out = []; x = 0.0
        for ch in text:
            if ch == ' ': x += 0.42 * size + gap; continue
            me, x0, x1, _ = glyph(ch, size, extrude)
            out.append((me, x + (x1 - x0) / 2, (x0 + x1) / 2)); x += (x1 - x0) + gap
        return out, x - gap
    gap = track * size
    items, total = layout(gap)
    if fit:
        gap += (fit - total) / max(len(text) - 1, 1); items, total = layout(gap)
    bm = bmesh.new()
    for me, s, xc in items:
        n0 = len(bm.verts); bm.from_mesh(me); bm.verts.ensure_lookup_table()
        bmesh.ops.transform(bm, matrix=placer(s - total / 2) @ Matrix.Translation((-xc, -cap / 2, 0)), verts=bm.verts[n0:])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    out = bpy.data.meshes.new(name); bm.to_mesh(out); bm.free()
    return out

def engrave(target, name, text, size, ztop=0.0, straight=None, arc=None, depth=0.04, track=0.22, fit=None):
    """straight=(cx,cy,angle)  or  arc=(R, mid_angle_deg) centred on the movement, reading clockwise."""
    if straight:
        cx, cy, a = straight
        placer = lambda s: Matrix.Translation((cx, cy, 0)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Translation((s, 0, 0))
    else:
        R, mid = arc
        def placer(s):
            th = rad(mid) - s / R
            return Matrix.Translation((R * math.cos(th), R * math.sin(th), 0)) @ Matrix.Rotation(th - math.pi / 2, 4, 'Z')
    cm = text_mesh('cut', text, size, (depth + 0.06) / 2, placer, track, fit)
    co = link(bpy.data.objects.new('cut', cm)); co.location.z = ztop - depth + (depth + 0.06) / 2
    boolean_cut(target, co)
    bpy.data.objects.remove(co); bpy.data.meshes.remove(cm)
    fm = text_mesh(name, text, size, 0.0, placer, track, fit); fm.materials.append(ROSEFILL)
    fo = link(bpy.data.objects.new(name, fm)); fo.location.z = ztop - depth + 0.006
    fo.parent = target; fo.matrix_parent_inverse = Matrix.Translation(target.location).inverted()
    return fo

# =====================================================================
# layout (mm)
# =====================================================================
DISC_R = 14.3
DISC = circ(0, 0, DISC_R, 128)
B = (-5.2, 5.6)                     # barrel / ratchet
RAT_R, CRW_R = 4.3, 2.3
CW = (1.0, 7.86)                    # crown wheel
C0 = (0.0, 0.0)                     # centre wheel
T = (-1.95, -5.36)                  # third wheel
F = (0.6, -9.1)                     # fourth (seconds) wheel
E = (4.42, -8.32)                   # escape wheel
BC = (8.0, -3.5); BR = 4.7          # balance
PF = (6.15, -5.99)                  # pallet fork pivot
NB = Vector((B[0], B[1])).normalized()      # barrel-bridge edge normal
NBd = Vector((-NB.y, NB.x))                 # direction along that edge (pointing down-left)

Z_BR0, Z_BR1 = 1.75, 2.65           # bridge slab
Z_CK0, Z_CK1 = 2.55, 3.35           # balance cock arm
Z_LO0, Z_LO1 = 0.85, 1.28           # low cocks (escape, pallet)
BEV = 0.16                          # anglage width on bridges

# ---- balance cock outline ----
CK_A = (10.6, 2.6)
ck_foot = rounded(DISC.intersection(box(8.6, -3.5, 60, 4.3)).difference(circ(BC[0], BC[1], BR + 0.9)), 0.5)
ck_arm = unary_union([capsule(CK_A, BC, 1.3), circ(BC[0], BC[1], 1.8)])
cock_g = fillet(unary_union([ck_foot, ck_arm]), 0.9)
CKS = (11.5, 2.9)                   # cock screw
dc = (Vector(CK_A) - Vector(BC)).normalized(); CK_ANG = math.atan2(dc.y, dc.x)

# ---- barrel bridge ----
S_BB = [(-11.7, -3.0), (-3.9, 12.0), (10.9, 6.4), (5.0, 6.7), (-12.9, 4.4)]
bb = DISC.intersection(unary_union([halfplane(NB.x, NB.y, 1.9), box(-60, 4.7, 60, 60)]))
bb = rounded(bb.difference(cock_g.buffer(0.4)), 0.8)
bb_feet = unary_union([bb.intersection(DISC.difference(circ(0, 0, 13.55))).difference(circ(B[0], B[1], 6.25))] +
                      [circ(x, y, 1.45) for x, y in S_BB]).intersection(bb)
bb_h = bb
for x, y in S_BB: bb_h = bb_h.difference(circ(x, y, 0.85))
bb_h = bb_h.difference(circ(B[0], B[1], 0.7)).difference(circ(CW[0], CW[1], 0.5))

# ---- train bridge (centre + third) ----
S_TB = [(-6.6, -10.0), (-9.0, -7.9)]
tb = fillet(unary_union([capsule(C0, T, 1.6), capsule(C0, (1.6, 0.8), 1.45), MultiPoint([T] + S_TB).convex_hull.buffer(1.6)]), 1.2)
tb = tb.intersection(DISC).difference(halfplane(NB.x, NB.y, 1.5)).difference(circ(BC[0], BC[1], BR + 0.9))
tb = rounded(tb, 0.6)
tb_feet = MultiPoint(S_TB).convex_hull.buffer(1.6).intersection(tb)
tb_h = tb.difference(circ(0, 0, 1.03))
for _i in range(3): tb_h = tb_h.difference(circ(*pol(1.5, 100 + 120 * _i), 0.2)).difference(circ(T[0], T[1], 1.03))
for x, y in S_TB: tb_h = tb_h.difference(circ(x, y, 0.85))

# ---- fourth-wheel cock, escape cock, pallet bridge ----
FF = (-4.0, -12.3)
fc = fillet(unary_union([circ(FF[0], FF[1], 1.45), circ(F[0], F[1], 1.4), capsule(FF, F, 0.95)]), 0.7).intersection(DISC)
fc_feet = circ(FF[0], FF[1], 1.6).intersection(fc)
fc_h = fc.difference(circ(F[0], F[1], 1.03)).difference(circ(FF[0], FF[1], 0.85))
EF = (6.2, -11.4)
ec = fillet(unary_union([circ(EF[0], EF[1], 1.25), circ(E[0], E[1], 1.0), capsule(EF, E, 0.68)]), 0.5)
ec_feet = circ(EF[0], EF[1], 1.3).intersection(ec)
ec_h = ec.difference(circ(E[0], E[1], 0.74)).difference(circ(EF[0], EF[1], 0.68))
de = (Vector(BC) - Vector(E)).normalized(); pe = Vector((-de.y, de.x))
PB1 = tuple(Vector(PF) + pe * 2.6); PB2 = tuple(Vector(PF) - pe * 2.6)
pb = fillet(unary_union([circ(*PB1, 0.85), circ(*PB2, 0.85), circ(*PF, 0.8), capsule(PB1, PB2, 0.5)]), 0.4)
pb_feet = unary_union([circ(*PB1, 0.85), circ(*PB2, 0.85)])
pb_h = pb.difference(circ(*PF, 0.42)).difference(circ(*PB1, 0.5)).difference(circ(*PB2, 0.5))

all_feet = unary_union([bb_feet, tb_feet, fc_feet, ec_feet, pb_feet, ck_foot])

# =====================================================================
# mainplate
# =====================================================================
pockets = unary_union([circ(BC[0], BC[1], BR + 0.6), MultiPoint([E, PF]).convex_hull.buffer(2.7), circ(F[0], F[1], 3.8),
                       circ(T[0], T[1], 4.3), circ(0, 0, 5.05), circ(B[0], B[1], 6.25)])
pockets = rounded(fillet(pockets, 0.5).difference(all_feet.buffer(0.4)), 0.3).intersection(circ(0, 0, 13.9))
p_low = shape_obj('mainplate', circ(0, 0, 15.3, 128), -1.5, -0.7, 0.1, PLATE)
p_mid = shape_obj('mp_mid', circ(0, 0, 14.75, 128), -0.75, -0.4, 0.0, POCKET)
p_top = shape_obj('mp_top', circ(0, 0, 14.75, 128).difference(pockets), -0.42, 0.0, 0.07, PLATE)
join([p_low, p_mid, p_top], 'mainplate')
# banking pins + plate screws in the open areas
for i, s in enumerate((1, -1)):
    q = Vector(PF) + de * 1.75 + pe * s * 0.62
    lathe(f'banking_pin_{i+1}', [(0, -0.4), (0.09, -0.4), (0.09, 0.62), (0.05, 0.68), (0, 0.68)], STEEL, (q.x, q.y, 0), segs=16)
for i, (x, y, a) in enumerate([]):
    if all_feet.buffer(0.8).contains(Point(x, y)) or pockets.buffer(0.7).contains(Point(x, y)): continue
    screw(f'plate_screw_{i+1}', x, y, 0.05, r=0.55, ang=a, mat=STEEL)

# =====================================================================
# bridges
# =====================================================================
def bridge(name, geom, feet, z0, z1, mat=GENEVA, bev=BEV, engr=()):
    slab = shape_obj(name, geom, z0, z1, bev, mat)
    for e in engr: engrave(slab, ztop=z1, **e)     # cut the clean slab before the feet are joined
    ft = shape_obj(name + '_ft', feet, 0.0, z0 + bev + 0.002, min(bev, 0.08), mat)
    return join([slab, ft], name)

ec_ = NB * 2.9 + NBd * 6.0
tm = (Vector(T) + Vector(S_TB[0])) / 2 + Vector((-0.2, 0.5))
barrel_bridge = bridge('barrel_bridge', bb_h, bb_feet, Z_BR0, Z_BR1, engr=[
    dict(name='engraving_brand', text=BRAND, size=1.05, arc=(12.0, 69), track=0.42),
    dict(name='engraving_calibre', text='HANNOVER  ·  KALIBER C 01', size=0.5, arc=(10.75, 62), track=0.3),
    dict(name='engraving_adjust', text='IN FÜNF LAGEN REGULIERT', size=0.46,
         straight=(ec_.x, ec_.y, math.atan2(-NBd.y, -NBd.x)), track=0.3, fit=8.4)])
train_bridge = bridge('train_bridge', tb_h, tb_feet, Z_BR0, Z_BR1, engr=[
    dict(name='engraving_jewels', text='21 STEINE', size=0.46,
         straight=(tm.x, tm.y, math.atan2(T[1] - S_TB[0][1], T[0] - S_TB[0][0])), track=0.3)])
fourth_cock = bridge('fourth_wheel_cock', fc_h, fc_feet, Z_BR0, Z_BR1)
escape_cock = bridge('escape_wheel_cock', ec_h, ec_feet, Z_LO0, Z_LO1, bev=0.09)
pallet_bridge = bridge('pallet_bridge', pb_h, pb_feet, Z_LO0, Z_LO1, mat=STEEL_GRAIN, bev=0.08)
ck_h = cock_g.difference(circ(BC[0], BC[1], 0.55)).difference(circ(CKS[0], CKS[1], 1.0))
def rathaus(w=1.5):
    """Stylised silhouette of the Neues Rathaus Hannover: dome with lantern, wings, corner turrets."""
    dome = affinity.scale(circ(0, 0, 1.0, 16), 0.34, 0.44).intersection(box(-1, 0, 1, 1))
    parts = [box(-1, 0, 1, 0.5), box(-0.42, 0, 0.42, 0.8), affinity.translate(dome, 0, 0.8),
             box(-0.065, 1.2, 0.065, 1.4), Polygon([(-0.1, 1.38), (0.1, 1.38), (0, 1.62)])]
    for sx in (-1, 1):
        parts += [box(sx * 0.62 - 0.07, 0.5, sx * 0.62 + 0.07, 0.8), Polygon([(sx * 0.62 - 0.1, 0.78), (sx * 0.62 + 0.1, 0.78), (sx * 0.62, 1.0)]),
                  box(sx * 0.93 - 0.07, 0.5, sx * 0.93 + 0.07, 0.68), Polygon([(sx * 0.93 - 0.09, 0.66), (sx * 0.93 + 0.09, 0.66), (sx * 0.93, 0.84)])]
    g = unary_union(parts)
    for x in (-0.8, -0.27, 0, 0.27, 0.8): g = g.difference(box(x - 0.045, 0.14, x + 0.045, 0.36))     # windows
    return affinity.scale(affinity.translate(g, 0, -0.8), w / 2, w / 2, origin=(0, 0))

def engrave_shape(target, name, g, ztop, depth=0.04):
    cut = shape_obj('cut', g, ztop - depth, ztop + 0.06, 0.0, ROSEFILL)
    boolean_cut(target, cut); cm = cut.data; bpy.data.objects.remove(cut); bpy.data.meshes.remove(cm)
    fo = shape_obj(name, g, ztop - depth - 0.01, ztop - depth + 0.006, 0.0, ROSEFILL)
    fo.parent = target; fo.matrix_parent_inverse = Matrix.Translation(target.location).inverted()
    return fo

_ck_slab = shape_obj('balance_cock', ck_h, Z_CK0, Z_CK1, BEV, GENEVA)
RH = (13.05, 0.35)
engrave_shape(_ck_slab, 'engraving_rathaus', affinity.translate(affinity.rotate(rathaus(1.5), -12, origin=(0, 0)), *RH), Z_CK1)
balance_cock = join([_ck_slab,
                     shape_obj('ck_ft', ck_foot.difference(circ(CKS[0], CKS[1], 1.0)), 0.0, Z_CK0 + BEV + 0.002, 0.08, GENEVA)], 'balance_cock')

# bridge screws
for i, (x, y) in enumerate(S_BB): screw(f'screw_barrel_bridge_{i+1}', x, y, Z_BR1 + 0.04, ang=0.5 + i * 1.3)
for i, (x, y) in enumerate(S_TB): screw(f'screw_train_bridge_{i+1}', x, y, Z_BR1 + 0.04, ang=1.1 + i * 0.9)
screw('screw_fourth_cock', FF[0], FF[1], Z_BR1 + 0.04, ang=2.2)
screw('screw_escape_cock', EF[0], EF[1], Z_LO1 + 0.03, r=0.6, ang=0.2)
screw('screw_pallet_bridge_1', *PB1, Z_LO1 + 0.03, r=0.42, ang=1.0)
screw('screw_pallet_bridge_2', *PB2, Z_LO1 + 0.03, r=0.42, ang=2.6)
screw('screw_balance_cock', CKS[0], CKS[1], Z_CK1 + 0.04, r=0.9, ang=0.9)

# jewels
jewel('jewel_centre', 0, 0, Z_BR1, rj=0.58, rc=1.12)
jewel('jewel_third', T[0], T[1], Z_BR1, rc=1.12)
jewel('jewel_fourth', F[0], F[1], Z_BR1, rc=1.12)
jewel('jewel_escape', E[0], E[1], Z_LO1, rj=0.36, rc=0.79, depth=0.4, hole=0.06)
jewel('jewel_pallet', PF[0], PF[1], Z_LO1, rj=0.24, rc=0.4, depth=0.38, hole=0.05, mat_ch=STEEL)
for i in range(3):   # screwed chaton on the centre wheel
    q = pol(1.5, 100 + 120 * i)
    screw(f'screw_chaton_centre_{i+1}', q[0], q[1], Z_BR1 + 0.13, r=0.3, ang=0.7 * i + 0.2, h=0.13)

# =====================================================================
# going train
# =====================================================================
def wheel(name, c, r, n, z0, th, spokes=5, mat=None, rot=0.0, **kw):
    return shape_obj(name, gear(r, n, spokes=spokes, **kw), z0, z0 + th, 0.03, mat or ROSE, c, rot)

def pinion(name, c, r, n, z0, z1):
    return shape_obj(name, gear(r, n, tooth=r * 0.42, spokes=0), z0, z1, 0.02, STEEL_AX, c)

# barrel
shape_obj('barrel_teeth', gear(5.9, 96, tooth=0.3, spokes=0), 0.12, 0.42, 0.03, BARREL, B)
lathe('barrel_drum', [(0, 0.12), (5.5, 0.12), (5.5, 0.98), (5.42, 1.06), (1.2, 1.06), (1.1, 1.0), (0, 1.0)], BARREL, (B[0], B[1], 0), segs=96)
join([bpy.data.objects['barrel_teeth'], bpy.data.objects['barrel_drum']], 'barrel')
arbor('barrel_arbor', B[0], B[1], 0.0, Z_BR1 + 0.3, r=0.6)

# Ratios (21 600 A/h, escape wheel 15 teeth -> 12 deg per beat):
#   barrel 96 : centre pinion 12 = 8      (barrel: one turn in 8 h, 7.5 turns = 60 h reserve)
#   centre 80 : third pinion 10  = 8      (centre: one turn per hour)
#   third 90  : fourth pinion 12 = 7.5    (8 x 7.5 = 60)
#   fourth 84 : escape pinion 7  = 12     (fourth = seconds wheel: 1 deg per beat, one turn per minute)
# Six spokes everywhere: the fourth wheel (84 teeth) looks identical every 60 deg = 60 beats, the third (90 teeth) every 450 beats.
wheel('centre_wheel', C0, 4.7, 80, 1.15, 0.2, spokes=6, tooth=0.22, rim=0.5, hub=0.75, spoke_w=0.5, rot=0.25)
pinion('centre_pinion', C0, 1.74, 12, 0.14, 0.55)
arbor('centre_arbor', 0, 0, -0.3, Z_BR1)
wheel('third_wheel', T, 3.9, 90, 0.55, 0.18, spokes=6, tooth=0.19, rim=0.45, hub=0.65, spoke_w=0.42, rot=0.5)
pinion('third_pinion', T, 1.0, 10, 1.08, 1.45)
arbor('third_arbor', T[0], T[1], -0.3, Z_BR1)
wheel('fourth_wheel', F, 3.4, 84, 1.0, 0.16, spokes=6, tooth=0.17, rim=0.4, hub=0.55, spoke_w=0.36, rot=0.1)
pinion('fourth_pinion', F, 0.6, 12, 0.5, 0.8)
arbor('fourth_arbor', F[0], F[1], -0.3, Z_BR1)

# escape wheel (club teeth), polished steel
def escape_wheel_geom(n=15):
    tooth = Polygon([pol(1.5, 7), pol(1.5, -6), pol(2.0, -15), pol(2.17, -17), pol(2.2, -9), pol(1.98, -5.5)])
    parts = [affinity.rotate(tooth, 360.0 * i / n, origin=(0, 0)) for i in range(n)]
    ring = circ(0, 0, 1.56).difference(circ(0, 0, 1.24))
    spokes = [affinity.rotate(box(0, -0.1, 1.3, 0.1), 72 * i, origin=(0, 0)) for i in range(5)]
    g = unary_union(parts + [ring, circ(0, 0, 0.4)] + spokes)
    return g.difference(rounded(circ(0, 0, 1.24).difference(unary_union(spokes + [circ(0, 0, 0.4)])), 0.08)) if False else g
shape_obj('escape_wheel', escape_wheel_geom(), 0.5, 0.63, 0.02, STEEL_AX, E, -0.2)
pinion('escape_pinion', E, 0.5, 7, 0.95, 1.22)
arbor('escape_arbor', E[0], E[1], -0.3, Z_LO1, r=0.09)

# pallet fork: local +x towards the balance
FK_ANG = math.atan2(de.y, de.x)
fork = unary_union([capsule((0, 0), (2.2, 0), 0.15), circ(0, 0, 0.3),
                    capsule((2.2, 0), (2.62, 0.26), 0.08), capsule((2.2, 0), (2.62, -0.26), 0.08),
                    capsule((0, 0), (-0.95, 1.05), 0.17), capsule((0, 0), (-0.95, -1.05), 0.17)])
fork = fillet(fork, 0.12)
shape_obj('pallet_fork', fork, 0.5, 0.64, 0.02, STEEL, PF, FK_ANG)
for i, s in enumerate((1, -1)):
    st = affinity.translate(affinity.rotate(box(-0.36, -0.13, 0.36, 0.13), s * 62, origin=(0, 0)), -1.08, s * 1.14)
    shape_obj(f'pallet_stone_{i+1}', st, 0.48, 0.67, 0.015, RUBY, PF, FK_ANG)
arbor('pallet_arbor', PF[0], PF[1], -0.3, Z_LO1, r=0.07)

# =====================================================================
# winding works on the barrel bridge
# =====================================================================
ZW = Z_BR1 + 0.04
rat = gear(RAT_R, 58, tooth=0.3, spokes=0, profile='wolf').difference(circ(0, 0, 0.95))
shape_obj('ratchet_wheel', rat, ZW, ZW + 0.36, 0.045, STEEL_SUN, B)
crw = gear(CRW_R, 32, tooth=0.3, spokes=0).difference(circ(0, 0, 0.85))
shape_obj('crown_wheel', crw, ZW, ZW + 0.36, 0.045, STEEL_SUN_CW, CW, 0.06)
lathe('ratchet_core', [(0.5, 0), (1.5, 0), (1.5, 0.44), (1.42, 0.5), (0.5, 0.5)], STEEL_AX, (B[0], B[1], ZW), closed=True)
lathe('crown_core', [(0.42, 0), (1.25, 0), (1.25, 0.44), (1.18, 0.5), (0.42, 0.5)], STEEL, (CW[0], CW[1], ZW), closed=True)
screw('screw_ratchet', B[0], B[1], ZW + 0.56, r=0.95, ang=1.2, mat=STEEL_AX, h=0.3)
screw('screw_crown_wheel', CW[0], CW[1], ZW + 0.56, r=0.72, ang=2.4, mat=STEEL, h=0.3)
# click + spring
CLP = tuple(Vector(B) + Vector(pol(5.75, 204)))
beak = tuple(Vector(B) + Vector(pol(RAT_R - 0.12, 186)))
tail = tuple(Vector(CLP) + Vector(pol(1.5, 250)))
click = unary_union([MultiPoint([CLP, beak]).convex_hull.buffer(0.02).union(circ(*CLP, 0.78)).union(circ(*beak, 0.2)).convex_hull,
                     capsule(CLP, tail, 0.3)])
click = fillet(click, 0.3).difference(rat.buffer(0.03) if False else circ(*CLP, 0.0001))
shape_obj('click', click.difference(circ(*CLP, 0.5)), ZW, ZW + 0.34, 0.05, STEEL)
screw('screw_click', CLP[0], CLP[1], ZW + 0.38, r=0.5, ang=0.3)
sf = tuple(Vector(CLP) + Vector(pol(3.7, 262)))
arcpts = [tuple(Vector(sf) + (Vector(tail) + Vector(pol(0.36, 160)) - Vector(sf)) * t + Vector(pol(0.5 * math.sin(math.pi * t), 170))) for t in [i / 24 for i in range(25)]]
spring = unary_union([LineString(arcpts).buffer(0.075), circ(*sf, 0.42)])
shape_obj('click_spring', spring.difference(circ(*sf, 0.3)), ZW, ZW + 0.2, 0.03, STEEL)
screw('screw_click_spring', sf[0], sf[1], ZW + 0.24, r=0.3, ang=1.9, h=0.14)
# winding stem
st_a = math.atan2(CW[1], CW[0])
lathe('winding_stem', [(0, 0), (0.5, 0), (0.5, 2.4), (0.62, 2.5), (0.62, 3.0), (0.42, 3.1), (0.42, 5.2), (0.36, 5.3), (0, 5.3)], STEEL_AX,
      (13.0 * math.cos(st_a), 13.0 * math.sin(st_a), -0.55), segs=32, rot=(0, math.pi / 2, st_a))
# crown: 36 flutes, so the winding loop (one ratchet tooth = 30 deg of the stem, winding pinion 12 leaves) closes on a whole number of flutes
CROWN_R = 2.15; CROWN_D = 19.55
crown_g = fillet(gear(CROWN_R, 36, tooth=0.16, spokes=0), 0.03)
cr = shape_obj('winding_crown', crown_g, -0.95, 0.95, 0.14, STEEL_AX)
cr.location = (CROWN_D * math.cos(st_a), CROWN_D * math.sin(st_a), -0.55); cr.rotation_euler = (0, math.pi / 2, st_a)
lathe('winding_crown_cap', [(0, 0.9), (1.55, 0.9), (1.5, 1.02), (0.6, 1.1), (0, 1.11)], STEEL_AX,
      (CROWN_D * math.cos(st_a), CROWN_D * math.sin(st_a), -0.55), segs=48, rot=(0, math.pi / 2, st_a))

# =====================================================================
# balance assembly
# =====================================================================
ZB0, ZB1 = 1.5, 1.98
arms = [affinity.rotate(Polygon([(0, -0.42), (BR - 0.4, -0.27), (BR - 0.4, 0.27), (0, 0.42)]), 90 * i, origin=(0, 0)) for i in range(4)]
bw = unary_union([circ(0, 0, BR, 128).difference(circ(0, 0, BR - 0.72, 128)), circ(0, 0, 0.85)] + arms)
bw = fillet(bw, 0.22).difference(circ(0, 0, 0.2))
balance = shape_obj('balance_wheel', bw, ZB0, ZB1, 0.06, GLUCY, BC, 0.5)
for i in range(16):
    a = 0.5 + rad(11.25 + 22.5 * i)
    lathe(f'balance_screw_{i+1:02d}', [(0, -0.3), (0.1, -0.3), (0.1, 0.0), (0.21, 0.0), (0.21, 0.26), (0.17, 0.33), (0.08, 0.36), (0, 0.365)], GLUCYP,
          (BC[0] + (BR - 0.02) * math.cos(a), BC[1] + (BR - 0.02) * math.sin(a), (ZB0 + ZB1) / 2), segs=20, rot=(0, math.pi / 2, a))
lathe('balance_staff', [(0, 0.1), (0.07, 0.1), (0.07, 0.4), (0.2, 0.45), (0.2, 1.3), (0.32, 1.35), (0.32, ZB1 + 0.05), (0.2, ZB1 + 0.1),
                        (0.14, 2.5), (0.06, 2.6), (0.06, Z_CK1 - 0.1), (0, Z_CK1 - 0.1)], STEEL, (BC[0], BC[1], 0), segs=24)
lathe('roller_table', [(0.2, 1.28), (0.9, 1.28), (0.9, 1.4), (0.2, 1.4)], STEEL, (BC[0], BC[1], 0), closed=True)
ij = Vector(BC) - de * 0.7
lathe('impulse_jewel', [(0, 0.72), (0.09, 0.72), (0.09, 1.3), (0, 1.3)], RUBY, (ij.x, ij.y, 0), segs=16)
# hairspring with terminal curve to the stud
ZH = 2.24
cu = bpy.data.curves.new('hs', 'CURVE'); cu.dimensions = '3D'
turns = 13.0; r0, r1 = 0.5, 3.05
pts = []
for i in range(int(turns * 90) + 1):
    t = i / (turns * 90); a = t * 2 * math.pi * turns
    pts.append(((r0 + t * (r1 - r0)) * math.cos(a), (r0 + t * (r1 - r0)) * math.sin(a)))
for i in range(1, 31):     # outer terminal: swing out to the stud
    a = 2 * math.pi * turns + rad(i * 2.6); r = r1 + 0.42 * (i / 30) ** 1.5
    pts.append((r * math.cos(a), r * math.sin(a)))
sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
for p, c in zip(sp.points, pts): p.co = (c[0], c[1], 0, 1)
cu.bevel_depth = 0.024; cu.bevel_resolution = 1
tmp = bpy.data.objects.new('hs', cu); hme = bpy.data.meshes.new_from_object(tmp); bpy.data.objects.remove(tmp)
hme.transform(Matrix.Diagonal((1, 1, 3.5, 1))); hme.shade_smooth(); hme.materials.clear(); hme.materials.append(BLUE_HS)
hs = link(bpy.data.objects.new('hairspring', hme)); hs.location = (BC[0], BC[1], ZH); hs.rotation_euler[2] = CK_ANG - rad(30)
lathe('hairspring_collet', [(0.16, -0.14), (0.5, -0.14), (0.5, 0.12), (0.46, 0.16), (0.16, 0.16)], GLUCYP, (BC[0], BC[1], ZH), closed=True, segs=32)
sa = CK_ANG - rad(30) + rad(78); sr = r1 + 0.42
lathe('hairspring_stud', [(0, ZH - 0.2), (0.13, ZH - 0.2), (0.13, Z_CK0 + 0.05), (0, Z_CK0 + 0.05)], STEEL,
      (BC[0] + sr * math.cos(sa), BC[1] + sr * math.sin(sa), 0), segs=16)

# regulator group on the cock (local frame: +x along the cock arm towards the foot)
def loc_shape(name, g, z0, z1, bev, mat): return shape_obj(name, g, z0, z1, bev, mat, BC, CK_ANG)
def L2W(x, y):
    v = Vector(BC) + dc * x + Vector((-dc.y, dc.x)) * y; return (v.x, v.y)
ZC = Z_CK1
reg = unary_union([circ(0, 0, 1.8).difference(circ(0, 0, 1.36)),
                   Polygon([(1.6, -0.24), (3.75, -0.1), (3.75, 0.1), (1.6, 0.24)]), circ(3.75, 0, 0.1),
                   capsule(pol(1.6, 205), pol(2.75, 205), 0.15), circ(*pol(2.8, 205), 0.24)])
loc_shape('regulator', fillet(reg, 0.12), ZC + 0.01, ZC + 0.19, 0.04, STEEL)
endp = circ(0, 0, 1.26).difference(circ(0, 0, 0.5))
loc_shape('balance_endpiece', endp, ZC + 0.01, ZC + 0.3, 0.06, STEEL)
jewel('jewel_balance_cap', BC[0], BC[1], ZC + 0.31, rj=0.34, rc=0.49, depth=0.3, cap=True)
for i, s in enumerate((1, -1)):
    q = L2W(0, 0.88 * s); screw(f'screw_endpiece_{i+1}', q[0], q[1], ZC + 0.34, r=0.24, ang=0.4 + i, h=0.12)
# swan-neck spring
npts = [(3.56, 0.14), (3.56, 0.55)]
for i in range(0, 25): a = rad(180 - i * 10); npts.append((4.3 + 0.75 * math.cos(a), 0.55 + 0.75 * math.sin(a)))
npts.append((5.55, -0.35))
swan = unary_union([LineString(npts).buffer(0.08), circ(5.55, -0.35, 0.45)])
loc_shape('swan_neck_spring', swan.difference(circ(5.55, -0.35, 0.3)), ZC + 0.01, ZC + 0.18, 0.035, STEEL)
q = L2W(5.55, -0.35); screw('screw_swan_neck', q[0], q[1], ZC + 0.22, r=0.3, ang=2.0, h=0.14)
# micrometer screw block
q = L2W(3.6, -0.95)
lathe('micrometer_block', [(0, 0), (0.34, 0), (0.34, 0.42), (0.28, 0.48), (0, 0.48)], STEEL, (q[0], q[1], ZC), segs=32)
q2 = L2W(3.6, -0.12)
lathe('micrometer_screw', [(0, 0), (0.05, 0.02), (0.09, 0.1), (0.09, 1.3), (0.2, 1.3), (0.2, 1.62), (0.17, 1.66), (0, 1.66)], BLUE,
      (q2[0], q2[1], ZC + 0.25), segs=24, rot=(math.pi / 2, 0, CK_ANG))

# =====================================================================
# stage, light, cameras
# =====================================================================
FLOOR_Z = -4.3
bpy.ops.mesh.primitive_plane_add(size=9000, location=(0, 0, FLOOR_Z))
fl = bpy.context.object; fl.name = 'stage_floor'
fm = metal('floor', (0.010, 0.010, 0.012), top_r=0.16); fm.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = 0.0
fl.data.materials.append(fm)
pm = metal('plinth', (0.012, 0.012, 0.014), top_r=0.3); pm.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = 0.0
lathe('stage_plinth', [(0, FLOOR_Z), (13.2, FLOOR_Z), (13.2, -1.62), (13.08, -1.5), (0, -1.5)], pm, (0, 0, 0), segs=128)
_fp = fm.node_tree.nodes['Principled BSDF']
for _l in list(_fp.inputs['Roughness'].links): fm.node_tree.links.remove(_l)
_fp.inputs['Roughness'].default_value = 0.16

w = bpy.data.worlds.new('w'); S.world = w
try: w.use_nodes = True
except Exception: pass
w.node_tree.nodes.clear()
_bg = w.node_tree.nodes.new('ShaderNodeBackground'); _bg.inputs[0].default_value = (0.016, 0.017, 0.02, 1)
_wo = w.node_tree.nodes.new('ShaderNodeOutputWorld'); w.node_tree.links.new(_bg.outputs[0], _wo.inputs[0])

CAMS = {
  'hero':          dict(loc=(34, -47.5, 33), tgt=(0.6, -0.2, -2.4), lens=60, focus=(BC[0] - 2, BC[1] - 2, Z_CK1), ap=0.55, res=(2400, 3000)),
  'top':           dict(loc=(0, 0, 100), tgt=(0, 0, 0), lens=100, focus=(0, 0, 2), ap=0.0, res=(3000, 3000)),
  'macro_balance': dict(loc=(32.6, -27.8, 22.2), tgt=(8.6, -3.0, 2.0), lens=85, focus=(BC[0], BC[1], Z_CK1 + 0.3), ap=0.3, res=(3000, 2000)),
  'macro_train':   dict(loc=(-9, -37, 16), tgt=(0.4, -7.0, 1.4), lens=105, focus=(F[0], F[1], Z_BR1), ap=0.3, res=(3000, 2000)),
  'macro_winding': dict(loc=(-22, 34, 21), tgt=(-1.6, 7.6, 2.6), lens=105, focus=(-2.0, 8.6, Z_BR1 + 0.3), ap=0.4, res=(3000, 2000)),
}
RIGS = {   # designed for a camera standing at -Y looking +Y; rotated to each camera's azimuth
  'std': [((-6, 44, 30), (74, 34), 2.2, (1.0, 0.965, 0.92), 0.9),
          ((40, 6, 14), (8, 54), 3.0, (0.86, 0.92, 1.0), 0.0),
          ((-38, -4, 16), (8, 46), 1.4, (1.0, 0.95, 0.9), 0.0),
          ((0, -46, 10), (64, 14), 2.0, (1.0, 0.92, 0.84), 0.0),
          ((6, 6, 64), (16, 16), 0.8, (1, 1, 1), 0.0)],
  'top': [((0, 16, 70), (110, 80), 1.15, (1.0, 0.97, 0.93), 0.85),
          ((44, 0, 16), (8, 60), 2.4, (0.86, 0.92, 1.0), 0.0),
          ((-44, 0, 16), (8, 60), 1.4, (1.0, 0.94, 0.88), 0.0),
          ((0, -46, 12), (60, 8), 1.0, (1.0, 0.92, 0.84), 0.0)],
}
rig_col = bpy.data.collections.new('lights'); col.children.link(rig_col)
def build_rig(name, az):
    c = bpy.data.collections.new('rig_' + name); rig_col.children.link(c)
    R = Matrix.Rotation(az + math.pi / 2, 3, 'Z')
    for i, (loc, size, strength, color, grad) in enumerate(RIGS['top' if name == 'top' else 'std']):
        me = bpy.data.meshes.new('sb'); bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5); bm.to_mesh(me); bm.free()
        o = bpy.data.objects.new(f'softbox_{name}_{i+1}', me); c.objects.link(o)
        p = R @ Vector(loc); o.location = p; o.scale = (size[0], size[1], 1)
        o.rotation_euler = (Vector((0, 0, 1)) - p).to_track_quat('Z', 'Y').to_euler()
        me.materials.append(mat_emit(f'sb_{name}_{i+1}', strength, color, grad)); o.visible_camera = False
    return c

cams, rigs = {}, {}
for name, c in CAMS.items():
    cam = bpy.data.cameras.new('cam_' + name); co = link(bpy.data.objects.new('cam_' + name, cam))
    co.location = c['loc']; co.rotation_euler = (Vector(c['tgt']) - Vector(c['loc'])).to_track_quat('-Z', 'Y').to_euler()
    cam.lens = c['lens']; cam.clip_start = 1; cam.clip_end = 800
    if c['ap'] > 0:
        cam.dof.use_dof = True
        cam.dof.focus_distance = (Vector(c['focus']) - Vector(c['loc'])).length
        cam.dof.aperture_fstop = cam.lens / (2 * c['ap'])
    cams[name] = co
    rigs[name] = build_rig(name, math.atan2(c['loc'][1] - c['tgt'][1], c['loc'][0] - c['tgt'][0]) if name != 'top' else -math.pi / 2)

def activate(name):
    S.camera = cams[name]
    for n, c in rigs.items():
        for o in c.objects: o.hide_render = (n != name); o.hide_viewport = (n != name)
    S.render.resolution_x, S.render.resolution_y = CAMS[name]['res']
    fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.65 if name == 'top' else 0.16   # no softbox edge mirrored in the floor

# ---- render settings ----
S.render.engine = 'CYCLES'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
    for d in prefs.devices: d.use = (d.type == 'OPTIX')
    S.cycles.device = 'GPU'
except Exception as e:
    print('GPU setup failed, CPU fallback:', e); S.cycles.device = 'CPU'
S.cycles.samples = SAMPLES; S.cycles.use_adaptive_sampling = True; S.cycles.adaptive_threshold = 0.012
S.cycles.use_denoising = True
S.cycles.max_bounces = 12; S.cycles.glossy_bounces = 8; S.cycles.transmission_bounces = 10
S.cycles.caustics_reflective = False; S.cycles.caustics_refractive = False
S.render.resolution_percentage = SCALE
S.render.image_settings.file_format = 'PNG'
try:
    S.view_settings.view_transform = 'AgX'; S.view_settings.look = 'AgX - Medium High Contrast'
except Exception as e: print('look', e)

activate('hero')
print('OBJECTS', len([o for o in S.objects if o.type == 'MESH']))
if '--save' in argv:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'calenberg_c01.blend'))
if '--norender' not in argv:
    import time
    for name in CAMS_RUN:
        activate(name); t0 = time.time()
        S.render.filepath = os.path.join(OUTDIR, name + '.png')
        bpy.ops.render.render(write_still=True)
        print('RENDERED', name, round(time.time() - t0, 1), 's')
