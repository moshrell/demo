import sys,bpy,math
sys.path.insert(0,'/home/claude/bay3d');sys.path.insert(0,'/home/claude/bay3d/v3')
from mathutils import Vector
import build2
names=sys.argv[1].split(',')
bpy.ops.wm.read_factory_settings(use_empty=True)
sc=build2.setup_render((1800,420),32)
x=0;pos={}
for n in names:
    r=build2.prop(n,(0,0,0));bpy.context.view_layer.update()
    ms=[o for o in r.children_recursive if o.type=='MESH']
    pts=[r.matrix_world@Vector(c) for o in ms for c in o.bound_box]
    mn=Vector([min(p[i] for p in pts) for i in range(3)]);mx=Vector([max(p[i] for p in pts) for i in range(3)])
    d=mx-mn;print('DIM',n,[round(v,3) for v in d]);
    s=0.5/max(d)  # normalise to 0.5 m for sheet
    r.scale=(s,s,s);r.location=(x-(mn.x+mx.x)/2*s,-(mn.y+mx.y)/2*s,-mn.z*s);x+=0.7
cx=(x-0.7)/2
bpy.ops.mesh.primitive_plane_add(size=20,location=(cx,0,0));pl=bpy.context.active_object
m=bpy.data.materials.new('p');m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.3,.3,.32,1);pl.data.materials.append(m)
ld=bpy.data.lights.new('s','SUN');ld.energy=4;lo=bpy.data.objects.new('s',ld);sc.collection.objects.link(lo);lo.rotation_euler=(0.8,0.2,0.6)
cd=bpy.data.cameras.new('c');cd.lens=40;co=bpy.data.objects.new('c',cd);sc.collection.objects.link(co);sc.camera=co
co.location=(cx,-4.2,1.0);co.rotation_euler=(math.radians(84),0,0)
sc.render.filepath=sys.argv[2];bpy.ops.render.render(write_still=True)
