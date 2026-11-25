# anim_v3.py — интро v3: M6 заезжает в гараж (ворота на y=-YF), стоп, фары гаснут, ворота закрываются,
# волна по гекс-решётке, неон. Последний кадр = box_dirty (та же камера/поза/свет).
#   python3 anim_v3.py stills 0.5,2.4,... [w h spp]
#   python3 anim_v3.py frames outdir [w h spp]
import sys, os, math, bpy
sys.path.insert(0, '/home/claude/bay3d'); sys.path.insert(0, '/home/claude/bay3d/v3')
import build2, build_v3, final_v3, car_m6
from anim import clamp, smooth, smoother, cr
from mathutils import Vector

YF = build_v3.YF
R = 5.0; S1 = 11.0; S2 = math.pi * R / 2
P0 = (-16.0, -5.0 - YF)
S3 = final_v3.CAR_POS.y + YF            # прямой участок от ворот до финальной точки
STOT = S1 + S2 + S3
T_STOP = 5.6; T_DOOR = (6.0, 7.0); T_LIGHT = 7.1; DURATION = 8.5; FPS = 24

def path(s):
    if s <= S1: return (P0[0] + s, P0[1]), 0.0
    if s <= S1 + S2:
        a = -math.pi / 2 + (s - S1) / R
        return (-5 + R * math.cos(a), -YF + R * math.sin(a)), a + math.pi / 2
    return (0.0, -YF + s - S1 - S2), math.pi / 2
def dist(t): u = clamp(t / T_STOP); return STOT * (1 - (1 - u) ** 2)

CAM = [
    (0.0, (3.6, -2.7 - YF, 0.55)),
    (1.4, (3.1, -2.95 - YF, 0.7)),
    (2.3, (1.6, -0.6 - YF, 1.6)),
    (2.9, (0.9, 2.2, 2.1)),
    (4.0, (0.9, 7.0, 1.8)),
    (5.4, tuple(final_v3.CAM_POS)),
    (9.0, tuple(final_v3.CAM_POS)),
]

def pose(S, t):
    s = dist(t); (x, y), h = path(s)
    f = smoother((s - (S1 + S2 + 0.4)) / (S3 - 0.4))           # доворот при парковке
    h += (final_v3.CAR_HEAD - math.pi / 2) * f; x += final_v3.CAR_POS.x * f
    pos = Vector((x, y, 0))
    car = S['car']; car.location = pos
    pitch = 0.0
    if t > T_STOP:
        d = t - T_STOP; pitch = -0.012 * math.sin(2 * math.pi * 2.0 * d) * math.exp(-4 * d)
    car.rotation_euler = (0, pitch, h)
    for sp in S['wheels']: sp.rotation_euler = (0, (dist(t) - STOT) / S['wr'], 0)   # в финале угол = 0, как в box
    on = 1 - smooth((t - (T_STOP + 0.25)) / 0.45)
    for b in S['beams']: b.data.energy = 1500 * on
    # ворота: рулонные ламели опускаются
    hdoor = smoother((t - T_DOOR[0]) / (T_DOOR[1] - T_DOOR[0])) * build_v3.DH
    for i, sl in enumerate(S['slats']):
        z = build_v3.DH - 0.05 - i * 0.1 + (build_v3.DH - hdoor)
        sl.location.z = z; sl.hide_render = z > build_v3.DH - 0.04
    # свет: мигание, волна по гексам, неон, споты станций
    K0 = 0.06                                                 # дежурный полумрак до включения
    k = K0
    if t >= T_LIGHT:
        d = t - T_LIGHT
        k = 0.35 if d < 0.08 else K0 if d < 0.16 else 0.6 if d < 0.24 else K0 + (1 - K0) * smooth((d - 0.24) / 0.3)
    for l in S['glights']: l.data.energy = 70 * k
    wave = 11.0 * smooth((t - T_LIGHT) / 0.9) + 88.0 * smooth((t - T_LIGHT - 0.9) / 0.1)
    build2.set_hex(wave=wave, gain=4.5 * (1 if t >= T_LIGHT and k > K0 else 0))
    nk = 0.18 + 0.82 * smooth((t - T_LIGHT - 0.6) / 0.4)
    build_v3.set_neon(nk)
    for l in S['st_lights']:
        if 'e0' not in l: l['e0'] = l.data.energy
        l.data.energy = l['e0'] * nk
    car_m6.set_dirt(S.get('dirt', 1.0))
    cam = S['cam']; cp = cr(CAM, t)
    tgt = (pos + Vector((0, 0, 0.65))).lerp(final_v3.CAM_TGT, smoother((t - 3.6) / 1.8))
    cam.location = cp; cam.rotation_euler = (tgt - cp).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 22 - 5 * smooth((t - 2.0) / 0.9) - 2 * smooth((t - 4.2) / 1.2)
    cam.data.shift_x = 0; cam.data.shift_y = 0

def main():
    mode = sys.argv[1]
    if mode == 'stills':
        times = [float(x) for x in sys.argv[2].split(',')]
        w, h, spp = (int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])) if len(sys.argv) > 5 else (360, 640, 16)
        S = build_v3.build_all((w, h), spp); S['dirt'] = 1.0
        os.makedirs('/home/claude/bay3d/v3/out/intro', exist_ok=True)
        for t in times:
            pose(S, t); S['scene'].render.filepath = f'/home/claude/bay3d/v3/out/intro/t_{t:05.2f}.png'
            bpy.ops.render.render(write_still=True)
    elif mode == 'frames':
        outdir = sys.argv[2]
        w, h, spp = (int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])) if len(sys.argv) > 5 else (720, 1280, 32)
        S = build_v3.build_all((w, h), spp); S['dirt'] = 1.0
        S['scene'].cycles.adaptive_threshold = 0.02
        os.makedirs(outdir, exist_ok=True)
        for i in range(round(DURATION * FPS)):
            f = f'{outdir}/f_{i:04d}.png'
            if os.path.exists(f) and os.path.getsize(f) > 1000: continue
            pose(S, i / FPS); S['scene'].render.filepath = f; bpy.ops.render.render(write_still=True)

if __name__ == '__main__':
    main()
