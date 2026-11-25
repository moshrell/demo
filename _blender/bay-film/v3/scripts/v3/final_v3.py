# final_v3.py — финальный кадр Box (статичный): тест-стиллы грязный/чистый + проекции поверхностей.
#   python3 final_v3.py W H SPP tag [dirt,list]
import sys, math, json, bpy
sys.path.insert(0, '/home/claude/bay3d/v3')
import build_v3, car_m6, build2
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

CAR_POS = Vector((-0.35, 2.7, 0.0)); CAR_HEAD = math.pi / 2 + 0.38
CAM_POS = Vector((2.45, 9.25, 1.5)); CAM_TGT = Vector((-1.25, 3.0, 0.95)); LENS = 15.0

def pose_final(S, dirt):
    S['car'].location = CAR_POS; S['car'].rotation_euler = (0, 0, CAR_HEAD)
    for sl in S['slats']: sl.hide_render = False
    build2.set_hex(wave=99.0, gain=4.5)
    for l in S['glights']: l.data.energy = 70
    build_v3.set_neon(1.0)
    for l in S['st_lights']: l.data.energy = l.get('e0', l.data.energy) * 1.0

    car_m6.set_dirt(dirt)
    cam = S['cam']; cam.location = CAM_POS; cam.rotation_euler = (CAM_TGT - CAM_POS).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = LENS

def project(S, pts):
    sc = S['scene']; W, H = sc.render.resolution_x, sc.render.resolution_y
    out = []
    for p in pts:
        v = world_to_camera_view(sc, S['cam'], Vector(p)); out.append([round(v.x * W, 1), round((1 - v.y) * H, 1), round(v.z, 2)])
    return out

if __name__ == '__main__':
    w, h, spp, tag = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
    dirts = [float(x) for x in (sys.argv[5].split(',') if len(sys.argv) > 5 else ['1', '0'])]
    S = build_v3.build_all((w, h), spp)
    pose_final(S, 1.0)
    bpy.context.view_layer.update()
    proj = {k: project(S, v) for k, v in build_v3.SURF.items()}
    print('PROJ', json.dumps(proj))
    for dv in dirts:
        pose_final(S, dv)
        S['scene'].render.filepath = f'/home/claude/bay3d/v3/out/{tag}_d{dv:g}.png'
        bpy.ops.render.render(write_still=True)
