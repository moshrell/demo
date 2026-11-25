import sys,bpy
sys.path.insert(0,'/home/claude/bay3d/v3');sys.path.insert(0,'/home/claude/bay3d')
import build_v3,final_v3
S=build_v3.build_all((360,640),4); final_v3.pose_final(S,1.0); bpy.context.view_layer.update()
paint=[o for o in S['meshes'] if any(m and m.name.startswith('gls_ML_CH1_Circular_001_FF3803FF_6') for m in o.data.materials)]
print('P', len(paint), [round(v,4) for v in paint[0].matrix_world.to_scale()], paint[0].name[:40])
ms=set()
for sp in S['wheels']:
    for c in sp.children_recursive:
        if c.type=='MESH': ms.update((m.name,c.name[:30]) for m in c.data.materials if m)
for m in sorted(ms): print('W',m)
m=bpy.data.materials['wheel.001']
for n in m.node_tree.nodes: print('N',n.type,n.name)
for l in m.node_tree.links: print('L',l.from_node.name,l.from_socket.name,'->',l.to_node.name,l.to_socket.name)
b=m.node_tree.nodes['Principled BSDF']
for k in ('Base Color','Metallic','Roughness','Coat Weight'): print('V',k,tuple(b.inputs[k].default_value) if hasattr(b.inputs[k].default_value,'__len__') else b.inputs[k].default_value)
