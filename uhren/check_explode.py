# Check of the exploded view for solids passing through each other. Run with any Python that has `bpy` (or the Blender one):
#   python check_explode.py [steps]        -> prints every pair that meets in the film and was NOT touching in the assembled watch.
# Needs no render; 1000 steps take ~3 min on 2 CPU cores.
import sys, os, json, time
HERE_ = os.path.dirname(os.path.abspath(__file__))
sys.argv = ['x', '--', 'explode', os.path.join(HERE_, '_chk'), '800', '1000', '8']
src = open(os.path.join(HERE_, 'film.py')).read()
src = src.replace("HERE = os.path.dirname(os.path.abspath(__file__))", "HERE = HERE_")
head = src.split('# ---- render settings ----')[0]
exec(compile(head, 'film_head', 'exec'))
from mathutils.bvhtree import BVHTree
names = [n for n in MOV if not n.startswith('shadow_')]
print('objects', len(names), flush=True)
def trees():
    bpy.context.view_layer.update()
    out = {}
    for n in names:
        o = O[n]; mw = o.matrix_world; me = o.data
        vs = [mw @ v.co for v in me.vertices]
        ps = [tuple(p.vertices) for p in me.polygons]
        if not ps: continue
        # triangulate via BVH from polygons (ngons ok)
        bb = [Vector(x) for x in zip(*[tuple(v) for v in vs])]
        lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))); hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
        out[n] = (BVHTree.FromPolygons(vs, ps), lo, hi)
    return out
def state(t):
    pose.clear(); hairspring(0.0); escapement(0.0, running=False); explode(t); apply(); return trees()
def pairs(tr):
    ks = list(tr); res = {}
    for i in range(len(ks)):
        a = tr[ks[i]]
        for j in range(i + 1, len(ks)):
            b = tr[ks[j]]
            if a[1].x > b[2].x or b[1].x > a[2].x or a[1].y > b[2].y or b[1].y > a[2].y or a[1].z > b[2].z or b[1].z > a[2].z: continue
            ov = a[0].overlap(b[0])
            if ov: res[(ks[i], ks[j])] = len(ov)
    return res
t0 = time.time()
base_pairs = pairs(state(0.0)); print('baseline overlaps', len(base_pairs), round(time.time() - t0, 1), 's', flush=True)
N = int(sys.argv_steps) if False else int(os.environ.get('NS', '300'))
rep = {}
for i in range(1, N + 1):
    t = i / N; pr = pairs(state(t))
    for k, v in pr.items():
        if k in base_pairs: continue
        rep.setdefault(k, []).append(round(t, 4))
os.makedirs(os.path.join(HERE_, '_chk'), exist_ok=True); json.dump({'base': [list(k) for k in base_pairs], 'new': {'|'.join(k): v for k, v in rep.items()}}, open(os.path.join(HERE_, '_chk', 'res.json'), 'w'))
print('time', round(time.time() - t0), flush=True)
for k, v in sorted(rep.items(), key=lambda kv: kv[1][0]):
    print(k, 'frames', len(v), 't', v[0], '-', v[-1])
