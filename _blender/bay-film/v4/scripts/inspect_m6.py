import bpy
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='/home/claude/bay3d/assets/m6.glb')
bpy.context.view_layer.update()
allp=[]
for o in bpy.context.scene.objects:
    if o.type=='MESH':
        bb=[o.matrix_world@Vector(c) for c in o.bound_box]; allp+=bb
        mn=[round(min(v[i] for v in bb),2) for i in range(3)]; mx=[round(max(v[i] for v in bb),2) for i in range(3)]
        print(f"M {o.name[:55]:55s} v={len(o.data.vertices):6d} mats={[m.name[:22] for m in o.data.materials if m][:4]} {mn} {mx}")
print('TOTAL', [round(min(v[i] for v in allp),2) for i in range(3)], [round(max(v[i] for v in allp),2) for i in range(3)])
print('N objects', len(bpy.context.scene.objects))
