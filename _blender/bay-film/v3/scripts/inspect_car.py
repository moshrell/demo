import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='/home/claude/bay3d/assets/car.glb')
from mathutils import Vector
import collections
for o in bpy.context.scene.objects:
    if o.type=='MESH':
        bb=[o.matrix_world@Vector(c) for c in o.bound_box]
        mn=[min(v[i] for v in bb) for i in range(3)]; mx=[max(v[i] for v in bb) for i in range(3)]
        print(f"{o.name[:40]:40s} parent={o.parent.name[:20] if o.parent else '-':20s} v={len(o.data.vertices):6d} mats={[m.name[:18] for m in o.data.materials if m]} min={[round(x,2) for x in mn]} max={[round(x,2) for x in mx]}")
    else: print('NONMESH',o.type,o.name)
