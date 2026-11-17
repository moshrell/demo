# Writes explode_limits.json: for every pair of parts that overlap seen from above, how far one may rise relative to the other
# (vertical sweep on the real meshes). film.py settle() uses it so the upper part always rises higher. Run after changing build.py:
#   python explode_limits.py     (any Python with bpy; ~2 min). Then add the balance-group extras by hand-merging: see README.
import sys, os
HERE_ = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE_, 'check_explode.py')).read().split("t0 = time.time()")[0])

import json, time
pose.clear(); hairspring(0.0); escapement(0.0, running=False); apply(); bpy.context.view_layer.update()
V = {}; PL = {}; LO = {}; HI = {}
for n in names:
    me = O[n].data; mw = O[n].matrix_world
    V[n] = [mw @ v.co for v in me.vertices]; PL[n] = [tuple(p.vertices) for p in me.polygons]
    LO[n] = Vector((min(v.x for v in V[n]), min(v.y for v in V[n]), min(v.z for v in V[n]))); HI[n] = Vector((max(v.x for v in V[n]), max(v.y for v in V[n]), max(v.z for v in V[n])))
base_tr = {n: BVHTree.FromPolygons(V[n], PL[n]) for n in names if PL[n]}
def shifted(n, d): return BVHTree.FromPolygons([Vector((v.x, v.y, v.z + d)) for v in V[n]], PL[n])
def hit(a, b, d):
    if d == 0: return bool(base_tr[a].overlap(base_tr[b]))
    return bool(base_tr[a].overlap(shifted(b, d)))
STEP, LIM = 0.1, 40.0
out = []; t0 = time.time(); ks = [n for n in names if PL[n]]
for i, a in enumerate(ks):
    for b in ks[i + 1:]:
        A, B = (LO[a], HI[a]), (LO[b], HI[b])
        if A[0].x > B[1].x or B[0].x > A[1].x or A[0].y > B[1].y or B[0].y > A[1].y: continue
        if hit(a, b, 0.0): continue                       # baseline contact (screw in hole, pinion in jewel): moves apart axially, not a stacking pair
        res = []
        for sgn in (1, -1):
            d = STEP; lim = None
            while d <= LIM:
                if hit(a, b, sgn * d): lim = d - STEP; break
                d += STEP
            res.append(lim)
        if res[0] is None and res[1] is None: continue
        out.append({'a': a, 'b': b, 'hi': res[0] if res[0] is not None else 1e3, 'lo': -(res[1] if res[1] is not None else 1e3)})
print('pairs', len(out), round(time.time() - t0), 's')
json.dump(out, open(os.path.join(HERE_, 'explode_limits_raw.json'), 'w'))
