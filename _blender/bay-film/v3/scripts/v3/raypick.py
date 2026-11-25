import sys, bpy
sys.path.insert(0, '/home/claude/bay3d/v3')
import build_v3, final_v3
from mathutils import Vector
S = build_v3.build_all((360, 640), 4); final_v3.pose_final(S, 1); bpy.context.view_layer.update()
cam = S['cam']; sc = S['scene']; dg = bpy.context.evaluated_depsgraph_get()
from bpy_extras.view3d_utils import region_2d_to_vector_3d
fr = [cam.matrix_world @ v for v in cam.data.view_frame(scene=sc)]  # tr, br, bl, tl
def ray(px, py):
    u, v = px / 360, py / 640
    top = fr[3].lerp(fr[0], u); bot = fr[2].lerp(fr[1], u); p = top.lerp(bot, v)
    d = (p - cam.location).normalized()
    hit, loc, n, i, ob, M = sc.ray_cast(dg, cam.location, d)
    return (ob.name, [m.name for m in ob.data.materials][:2]) if hit else None
for name, (px, py) in {'hood': (200, 345), 'door': (110, 350), 'fender': (215, 362), 'rear': (40, 340), 'side_low': (120, 365)}.items():
    print('PICK', name, ray(px, py))
