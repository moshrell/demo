# Готовит 3D-фигуру из открытых данных MakeHuman / MPFB (лицензия CC0):
#   базовая сетка + настоящие «цели» формы тела (мужчина, взрослый, умеренная мускулатура)
#   + поза через штатный скелет и веса (руки опущены, ноги вместе), без ручных деформаций и сглаживаний.
# Пишет public/model/body.bin (uint32 nV, uint32 nI, float32 xyz[nV], float32 aux[nV*2] (тень рельефа, ткань), uint16 idx[nI]),
#       src/data/body.json (суставы, габариты) и геометрию зон в src/data/zones.json.
# Запуск: python3 tools/prep-model.py <папка src/mpfb/data из репозитория makehumancommunity/mpfb2>
import sys, json, gzip, struct, math
import numpy as np

D = sys.argv[1].rstrip('/')
# ---------- сетка ----------
V = []; faces = {}; g = None
for line in open(f'{D}/3dobjs/base.obj'):
    if line.startswith('v '): V.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('g '): g = line.split()[1]
    elif line.startswith('f '): faces.setdefault(g, []).append([int(p.split('/')[0]) - 1 for p in line.split()[1:]])
V = np.array(V, dtype=np.float64)

# ---------- форма тела: цели MakeHuman ----------
def target(name, w):
    for line in gzip.open(f'{D}/targets/macrodetails/{name}.target.gz', 'rt'):
        p = line.split()
        if len(p) == 4 and not line.startswith('#'): V[int(p[0])] += w * np.array([float(p[1]), float(p[2]), float(p[3])])
for eth in ('caucasian', 'african', 'asian'): target(f'{eth}-male-young', 1 / 3)
target('universal-male-young-maxmuscle-averageweight', 0.45)      # умеренно спортивное сложение
target('proportions/male-young-averagemuscle-averageweight-idealproportions', 0.5)

def cube(name): return V[sorted({i for f in faces[name] for i in f})].mean(axis=0)

# ---------- скелет и веса ----------
rig = json.load(open(f'{D}/rigs/standard/rig.default.json'))
wts = json.load(open(f'{D}/rigs/standard/weights.default.json'))['weights']
def point(spec):
    s = spec['strategy']
    if s == 'CUBE': return cube(spec['cube_name'])
    if s == 'VERTEX': return V[spec['vertex_index']].copy()
    if s == 'MEAN': return V[spec['vertex_indices']].mean(axis=0)
    raise SystemExit('неизвестная стратегия кости: ' + s)
head = {b: point(rig[b]['head']) for b in rig}; tail = {b: point(rig[b]['tail']) for b in rig}

def rot_between(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b); ax = np.cross(a, b); s = np.linalg.norm(ax); c = float(a @ b)
    if s < 1e-9: return np.eye(3)
    ax /= s; K = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]])
    return np.eye(3) + s * K + (1 - c) * K @ K
def part(R, t):  # доля поворота (для ключицы: плечевой пояс идёт за рукой)
    ang = math.acos(max(-1, min(1, (np.trace(R) - 1) / 2)))
    if ang < 1e-9: return np.eye(3)
    ax = np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]]) / (2 * math.sin(ang))
    K = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]]); a = ang * t
    return np.eye(3) + math.sin(a) * K + (1 - math.cos(a)) * K @ K

LOCAL = {}  # кость → поворот в мировых осях вокруг её начала
for S, sg in (('L', 1.0), ('R', -1.0)):
    sh, el, wr = head[f'upperarm01.{S}'], head[f'lowerarm01.{S}'], head[f'wrist.{S}']
    R_arm = rot_between(el - sh, np.array([0.17 * sg, -1.0, 0.03]))          # плечо: рука вниз, отведена ~10°
    LOCAL[f'shoulder01.{S}'] = part(R_arm, 0.22); LOCAL[f'upperarm01.{S}'] = R_arm @ part(R_arm, 0.22).T
    up = R_arm @ (el - sh); up /= np.linalg.norm(up)
    want = up + np.array([0.0, 0.0, 0.2]); fore = R_arm @ (wr - el)          # локоть: лёгкое сгибание вперёд
    LOCAL[f'lowerarm01.{S}'] = rot_between(fore, want)
    hp, kn = head[f'upperleg01.{S}'], head[f'lowerleg01.{S}']
    d = kn - hp; LOCAL[f'upperleg01.{S}'] = rot_between(d, np.array([0.035 * sg * abs(d[1]), d[1], d[2]]))  # ноги почти вместе

order = []
def visit(b):
    if b in order: return
    if rig[b]['parent']: visit(rig[b]['parent'])
    order.append(b)
for b in rig: visit(b)
M = {}
for b in order:
    P = M[rig[b]['parent']] if rig[b]['parent'] else (np.eye(3), np.zeros(3))
    if b in LOCAL:
        R = LOCAL[b]; h = head[b]; Rl, tl = R, h - R @ h            # поворот вокруг начала кости (в позе покоя)
        M[b] = (P[0] @ Rl, P[0] @ tl + P[1])
    else: M[b] = P
acc = np.zeros_like(V); tot = np.zeros(len(V))
for b, lst in wts.items():
    if not lst: continue
    idx = np.array([i for i, _ in lst]); w = np.array([x for _, x in lst]); R, t = M[b]
    acc[idx] += w[:, None] * (V[idx] @ R.T + t); tot[idx] += w
REST = V.copy()
ok = tot > 1e-6; V[ok] = acc[ok] / tot[ok][:, None]
posed = lambda b: (lambda R, t: R @ head[b] + t)(*M[rig[b]['parent']] if rig[b]['parent'] else (np.eye(3), np.zeros(3)))
posed_tail = lambda b: (lambda R, t: R @ tail[b] + t)(*M[b])

# ---------- что рисуем: тело и глаза ----------
groups = ['body', 'helper-l-eye', 'helper-r-eye']
used = sorted({i for gname in groups for f in faces[gname] for i in f}); remap = {o: n for n, o in enumerate(used)}
P = V[used]; RP = REST[used]
tris = []
for gname in groups:
    for f in faces[gname]:
        f = [remap[i] for i in f]
        for k in range(1, len(f) - 1): tris += [f[0], f[k], f[k + 1]]
T = np.array(tris).reshape(-1, 3)
assert len(P) < 65536
eye = np.zeros(len(P), bool); eye[[remap[i] for gname in groups[1:] for f in faces[gname] for i in f]] = True

# тень рельефа: вогнутые места (между мышцами, под грудной клеткой) чуть темнее — форма читается и без резкого света
N = np.zeros_like(P); fn = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
for k in range(3): np.add.at(N, T[:, k], fn)
N /= np.maximum(np.linalg.norm(N, axis=1), 1e-9)[:, None]
S = np.zeros_like(P); C = np.zeros(len(P))
for a, b in ((0, 1), (1, 2), (2, 0)):
    np.add.at(S, T[:, a], P[T[:, b]]); np.add.at(C, T[:, a], 1); np.add.at(S, T[:, b], P[T[:, a]]); np.add.at(C, T[:, b], 1)
cen = S / np.maximum(C, 1)[:, None]; edge = np.linalg.norm(cen - P, axis=1).mean() + 1e-9
cav = np.einsum('ij,ij->i', N, cen - P) / edge
for _ in range(6):
    A = np.zeros(len(P))
    for a, b in ((0, 1), (1, 2), (2, 0)): np.add.at(A, T[:, a], cav[T[:, b]]); np.add.at(A, T[:, b], cav[T[:, a]])
    cav = 0.5 * cav + 0.5 * A / np.maximum(C, 1)
shade = np.clip(1.0 - np.clip(cav, 0, None) * 0.9, 0.55, 1.0); shade[eye] = 1.0

# ткань (короткие шорты): считается в позе покоя, где ноги раздвинуты и кисти далеко; граница задаётся расстоянием до края
waist = head['spine05'][1] + 0.18 * (head['spine04'][1] - head['spine05'][1])
cloth = waist - RP[:, 1]
for S_ in ('L', 'R'):
    hp, kn = head[f'upperleg01.{S_}'], head[f'lowerleg01.{S_}']; ax = kn - hp; L = np.linalg.norm(ax); ax /= L
    side = (RP[:, 0] > 0) if S_ == 'L' else (RP[:, 0] < 0)
    t = (RP - hp) @ ax
    cloth = np.where(side, np.minimum(cloth, 0.3 * L - t), cloth)
cloth = np.clip(cloth, -10.0, 10.0); cloth[eye] = -99.0   # глаза помечены отдельным значением

with open('public/model/body.bin', 'wb') as o:
    o.write(struct.pack('<II', len(P), len(tris)))
    o.write(P.astype('<f4').tobytes()); o.write(np.stack([shade, cloth], axis=1).astype('<f4').tobytes()); o.write(T.astype('<u2').tobytes())

# ---------- суставы и зоны ----------
r3 = lambda v: [round(float(c), 3) for c in v]
J = {n: posed(b) for n, b in {'neck': 'neck01', 'head': 'head', 'jaw': 'jaw', 'l-shoulder': 'upperarm01.L', 'r-shoulder': 'upperarm01.R', 'l-elbow': 'lowerarm01.L', 'r-elbow': 'lowerarm01.R',
     'l-wrist': 'wrist.L', 'r-wrist': 'wrist.R', 'l-hip': 'upperleg01.L', 'r-hip': 'upperleg01.R', 'l-knee': 'lowerleg01.L', 'r-knee': 'lowerleg01.R', 'l-ankle': 'foot.L', 'r-ankle': 'foot.R',
     'spine-top': 'spine02', 'spine-mid': 'spine04', 'spine-low': 'spine05'}.items()}
J['l-toe'] = posed_tail('foot.L'); J['r-toe'] = posed_tail('foot.R'); J['l-hand'] = posed_tail('wrist.L'); J['r-hand'] = posed_tail('wrist.R')
bb = [r3(P.min(axis=0)), r3(P.max(axis=0))]
back = float(P[(np.abs(P[:, 0]) < 0.6) & (P[:, 1] > J['spine-low'][1]) & (P[:, 1] < J['spine-top'][1])][:, 2].min())
front_knee = float(P[(np.abs(P[:, 0] - J['l-knee'][0]) < 0.5) & (np.abs(P[:, 1] - J['l-knee'][1]) < 0.4)][:, 2].max())
json.dump({'verts': len(P), 'tris': len(T), 'bbox': bb, 'joints': {k: r3(v) for k, v in J.items()}}, open('src/data/body.json', 'w'), indent=1)
def pair(a, b=None, dz=0.0, out=0.0):
    caps = []
    for s, sg in (('l', 1), ('r', -1)):
        A = J[f'{s}-{a}'] + np.array([out * sg, 0, dz]); B = (J[f'{s}-{b}'] if b else J[f'{s}-{a}']) + np.array([out * sg, 0, dz if not b else 0]); caps.append(r3(A) + r3(B))
    return caps
jaw = J['jaw']; nk = J['neck']; hd = J['head']
zones = [
 {'id': 'kopf', 'view': 'front', 'r': 0.95, 'caps': [r3([-0.72, nk[1] + 1.15, nk[2] + 0.75]) + r3([0.72, nk[1] + 1.15, nk[2] + 0.75])]},
 {'id': 'nacken', 'view': 'back', 'r': 0.85, 'caps': [r3([0, hd[1] - 0.25, nk[2] - 0.55]) + r3([0, nk[1] - 0.35, nk[2] - 0.6])]},
 {'id': 'schulter', 'view': 'front', 'r': 1.0, 'caps': pair('shoulder', out=0.1)},
 {'id': 'ruecken', 'view': 'back', 'r': 1.45, 'caps': [r3([0, J['spine-top'][1] + 0.9, back + 0.25]) + r3([0, J['spine-low'][1] + 0.1, back + 0.3])]},
 {'id': 'arm', 'view': 'front', 'r': 0.7, 'caps': pair('elbow', 'hand')},
 {'id': 'huefte', 'view': 'front', 'r': 1.05, 'caps': pair('hip', out=0.35)},
 {'id': 'knie', 'view': 'front', 'r': 0.9, 'caps': [c[:2] + [round(front_knee - 0.35, 3)] + c[3:5] + [round(front_knee - 0.35, 3)] for c in pair('knee')]},
 {'id': 'fuss', 'view': 'front', 'r': 0.78, 'caps': pair('ankle', 'toe')},
]
json.dump(zones, open('src/data/zones.json', 'w'), indent=1)
print('verts', len(P), 'tris', len(T), 'bbox', bb, 'unweighted', int((~ok[used]).sum()))
