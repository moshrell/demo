# anim.py — поза сцены как функция времени t (детерминированно), рендер кадров.
#   python3 anim.py stills 0.6,2.4,4.0 [w h samples]
#   python3 anim.py frames FROM TO FPS outdir [w h samples]
import sys, math, bpy
sys.path.insert(0, '/home/claude/bay3d')
import build
from mathutils import Vector

T_STOP = 5.6           # машина встаёт
T_DOOR = (5.9, 6.9)    # ворота опускаются
T_LIGHT = 7.0          # свет бокса
DURATION = 8.0

def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def smooth(x): x = clamp(x); return x * x * (3 - 2 * x)
def smoother(x): x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10)

# ---- путь машины: прямая по улице → поворот R=5 → прямая в бокс
P0 = (-16.0, -5.0); S1 = 11.0; R = 5.0; S2 = math.pi * R / 2; S3 = 2.4
STOT = S1 + S2 + S3
def path(s):
    if s <= S1: return (P0[0] + s, P0[1]), 0.0
    if s <= S1 + S2:
        a = -math.pi / 2 + (s - S1) / R
        return (-5 + R * math.cos(a), R * math.sin(a)), a + math.pi / 2
    return (0.0, s - S1 - S2), math.pi / 2
def dist(t):
    u = clamp(t / T_STOP)
    return STOT * (1 - (1 - u) ** 2)

# ---- камера: ключи (время, позиция), Catmull-Rom по времени
CAM = [
    (0.0, (3.6, -2.7, 0.55)),
    (1.4, (3.1, -2.95, 0.7)),
    (2.3, (1.6, -0.6, 1.6)),
    (2.9, (0.9, 2.2, 2.1)),
    (4.0, (0.7, 6.2, 1.75)),
    (5.4, (0.9, 8.05, 1.3)),
    (8.0, (0.9, 8.05, 1.3)),
]
FINAL_TGT = Vector((0.0, 2.2, 0.62))
def cr(keys, t):
    if t <= keys[0][0]: return Vector(keys[0][1])
    if t >= keys[-1][0]: return Vector(keys[-1][1])
    for i in range(len(keys) - 1):
        if keys[i][0] <= t <= keys[i + 1][0]: break
    p0 = Vector(keys[max(i - 1, 0)][1]); p1 = Vector(keys[i][1]); p2 = Vector(keys[i + 1][1]); p3 = Vector(keys[min(i + 2, len(keys) - 1)][1])
    u = (t - keys[i][0]) / (keys[i + 1][0] - keys[i][0]); u2, u3 = u * u, u * u * u
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3)

def car_world(t):
    (x, y), h = path(dist(t)); return Vector((x, y, 0.0)), h

def pose(S, t):
    pos, h = car_world(t)
    car = S['car']; car.location = pos; car.rotation_euler = (0, 0, h)
    # лёгкий клевок носом при торможении (питч ~ замедление)
    car.rotation_euler.y = 0.012 * (1 - clamp(t / T_STOP)) * (t < T_STOP)
    if t > T_STOP:
        d = t - T_STOP; car.rotation_euler.y = -0.010 * math.sin(2 * math.pi * 2.2 * d) * math.exp(-4 * d)
    for sp in S['wheels']: sp.rotation_euler = (0, dist(t) / build.WR, 0)
    # фары горят всё время, гаснут после остановки (как в задумке: «мотор заглох»)
    on = 1 - smooth((t - (T_STOP + 0.2)) / 0.5)
    for b in S['beams']: b.data.energy = 900 * on
    bpy.data.materials['headlamp'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 9 * on + 0.3
    bpy.data.materials['taillamp'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 8 * on + 0.3
    # ворота
    hdoor = smoother((t - T_DOOR[0]) / (T_DOOR[1] - T_DOOR[0])) * build.DH
    for i, sl in enumerate(S['slats']):
        z = build.DH - 0.05 - i * 0.1 + (build.DH - hdoor)
        sl.location.z = z; sl.hide_render = z > build.DH - 0.04
    # свет бокса: два «моргания» и полный свет
    k = 0.0
    if t >= T_LIGHT:
        d = t - T_LIGHT
        k = 0.35 if d < 0.08 else 0.0 if d < 0.16 else 0.6 if d < 0.24 else smooth((d - 0.24) / 0.3)
    for l in S['glights']: l.data.energy = 160 * k
    bpy.data.materials['led'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 10 * k
    # камера
    cam = S['cam']; cp = cr(CAM, t)
    tgt_car = pos + Vector((0, 0, 0.65))
    tgt = tgt_car.lerp(FINAL_TGT, smoother((t - 3.6) / 1.8))
    cam.location = cp
    cam.rotation_euler = (tgt - cp).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 22 - 4 * smooth((t - 2.0) / 0.9) + 2 * smooth((t - 4.2) / 1.2)

def main():
    mode = sys.argv[1]
    if mode == 'stills':
        times = [float(x) for x in sys.argv[2].split(',')]
        w, h, spp = (int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])) if len(sys.argv) > 5 else (360, 640, 16)
        S = build.build_all((w, h), spp)
        for t in times:
            pose(S, t); S['scene'].render.filepath = f'/home/claude/bay3d/out/st_{t:05.2f}.png'
            bpy.ops.render.render(write_still=True)
    elif mode == 'frames':
        t0, t1, fps, outdir = float(sys.argv[2]), float(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
        w, h, spp = (int(sys.argv[6]), int(sys.argv[7]), int(sys.argv[8])) if len(sys.argv) > 8 else (720, 1280, 24)
        S = build.build_all((w, h), spp)
        n = round((t1 - t0) * fps)
        for i in range(n):
            t = t0 + i / fps; pose(S, t)
            S['scene'].render.filepath = f'{outdir}/f_{round(t * fps):04d}.png'
            bpy.ops.render.render(write_still=True)

if __name__ == '__main__':
    main()
