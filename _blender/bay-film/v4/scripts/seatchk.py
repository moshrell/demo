import sys,bpy
sys.path.insert(0,'/home/claude/bay3d/v3');sys.path.insert(0,'/home/claude/bay3d')
import build_v3,final_v3,render_pkg as R
from mathutils import Vector
S=build_v3.build_all((360,640),4); final_v3.pose_final(S,0.0); bpy.context.view_layer.update()
g=R.classify(S); inv=S['car'].matrix_world.inverted()
ids={o.name for k in g for o in g[k]}
for o in S['meshes']:
    if 'seat' in o.name.lower() or 'white int' in o.name.lower():
        c=inv@((o.matrix_world@Vector(o.bound_box[0])+o.matrix_world@Vector(o.bound_box[6]))/2)
        grp=[k for k in g if o in g[k]]
        print('SEAT',o.name[:40],[round(v,2) for v in c],grp)
