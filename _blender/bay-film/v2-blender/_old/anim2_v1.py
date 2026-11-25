# anim2.py — v2: E34 + ассеты. Поза = функция времени. Рендер кадров/стиллов.
#   python3 anim2.py stills 0.6,2.4 [w h spp]
#   python3 anim2.py frames FROM TO FPS outdir [w h spp]
import sys, math, bpy
sys.path.insert(0, '/home/claude/bay3d')
import build2, car_import
from anim import clamp, smooth, smoother, cr, R, S1, S2, P0
from mathutils import Vector

T_STOP = 5.6; T_DOOR = (6.0, 7.0); T_LIGHT = 7.1; DURATION = 8.5
S3 = 2.7; STOT = S1 + S2 + S3
WR = car_import.WR

def path(s):
    if s <= S1: return (P0[0] + s, P0[1]), 0.0
    if s <= S1 + S2:
        a = -math.pi / 2 + (s - S1) / R
        return (-5 + R * math.cos(a), R * math.sin(a)), a + math.pi / 2
    return (0.0, s - S1 - S2), math.pi / 2
def dist(t): u = clamp(t / T_STOP); return STOT * (1 - (1 - u) ** 2)

CAM = [
    (0.0, (3.6, -2.7, 0.55)),
    (1.4, (3.1, -2.95, 0.7)),
    (2.3, (1.6, -0.6, 1.6)),
    (2.9, (0.9, 2.2, 2.1)),
    (4.0, (0.7, 6.2, 1.75)),
    (5.4, (0.9, 8.05, 1.3)),
    (9.0, (0.9, 8.05, 1.3)),
]
FINAL_TGT = Vector((0.0, 2.5, 0.62))

def pose(S, t):
    (x, y), h = path(dist(t)); pos = Vector((x, y, 0))
    car = S['car']; car.location = pos
    pitch = 0.0
    if t > T_STOP:
        d = t - T_STOP; pitch = -0.012 * math.sin(2 * math.pi * 2.0 * d) * math.exp(-4 * d)
    car.rotation_euler = (0, pitch, h)
    for sp in S['wheels']: sp.rotation_euler = (0, dist(t) / WR, 0)
    on = 1 - smooth((t - (T_STOP + 0.25)) / 0.45)
    for b in S['beams']: b.data.energy = 1500 * on
    build2.lamps(on)
    hdoor = smoother((t - T_DOOR[0]) / (T_DOOR[1] - T_DOOR[0])) * build2.DH
    for i, sl in enumerate(S['slats']):
        z = build2.DH - 0.05 - i * 0.1 + (build2.DH - hdoor)
        sl.location.z = z; sl.hide_render = z > build2.DH - 0.04
    k = 0.0
    if t >= T_LIGHT:
        d = t - T_LIGHT
        k = 0.35 if d < 0.08 else 0.0 if d < 0.16 else 0.6 if d < 0.24 else smooth((d - 0.24) / 0.3)
    for l in S['glights']: l.data.energy = 220 * k
    bpy.data.materials['led'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 12 * k
    bpy.data.materials['neon'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 8 * k
    cam = S['cam']; cp = cr(CAM, t)
    tgt = (pos + Vector((0, 0, 0.65))).lerp(FINAL_TGT, smoother((t - 3.6) / 1.8))
    cam.location = cp; cam.rotation_euler = (tgt - cp).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 22 - 4 * smooth((t - 2.0) / 0.9) + 2 * smooth((t - 4.2) / 1.2)

def main():
    mode = sys.argv[1]
    if mode == 'stills':
        times = [float(x) for x in sys.argv[2].split(',')]
        w, h, spp = (int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])) if len(sys.argv) > 5 else (360, 640, 24)
        S = build2.build_all((w, h), spp)
        for t in times:
            pose(S, t); S['scene'].render.filepath = f'/home/claude/bay3d/out/v2_{t:05.2f}.png'
            bpy.ops.render.render(write_still=True)
    elif mode == 'frames':
        t0, t1, fps, outdir = float(sys.argv[2]), float(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
        w, h, spp = (int(sys.argv[6]), int(sys.argv[7]), int(sys.argv[8])) if len(sys.argv) > 8 else (720, 1280, 48)
        S = build2.build_all((w, h), spp)
        import os; os.makedirs(outdir, exist_ok=True)
        for i in range(round((t1 - t0) * fps)):
            t = t0 + i / fps; f = f'{outdir}/f_{round(t * fps):04d}.png'
            if os.path.exists(f): continue
            pose(S, t); S['scene'].render.filepath = f; bpy.ops.render.render(write_still=True)

if __name__ == '__main__':
    main()
