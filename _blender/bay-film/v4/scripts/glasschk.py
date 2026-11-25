import sys,bpy
sys.path.insert(0,'/home/claude/bay3d/v3');sys.path.insert(0,'/home/claude/bay3d')
import build_v3
S=build_v3.build_all((360,640),4)
for m in bpy.data.materials:
    if not m.use_nodes or 'Principled BSDF' not in m.node_tree.nodes: continue
    b=m.node_tree.nodes['Principled BSDF']
    a=b.inputs['Alpha'].default_value;t=b.inputs['Transmission Weight'].default_value
    if a<0.99 or t>0.01 or m.blend_method!='OPAQUE' if hasattr(m,'blend_method') else (a<0.99 or t>0.01):
        users=[o.name for o in bpy.data.objects if o.type=='MESH' and any(s.material==m for s in o.material_slots)]
        print('GL',m.name,round(a,2),round(t,2),users[:4])
