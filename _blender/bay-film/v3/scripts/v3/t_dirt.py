import sys,os,bpy
sys.path.insert(0,'/home/claude/bay3d/v3')
import render_pkg as R, build_v3, final_v3
from mathutils import Vector
O='/home/claude/bay3d/v3/out/td'; os.makedirs(O,exist_ok=True)
S=build_v3.build_all((360,640),24); sc=S['scene']; car=S['car']; M=car.matrix_world
def shot(tag,dirt,pos,tgt,lens,lamp=None):
    final_v3.pose_final(S,dirt); R.set_cam(S,pos,tgt,lens); R.render_to(S,f'{O}/{tag}.png',24)
p,t,l=R.clip_target(S,'lack'); shot('lack_d',1,p,t,l); shot('lack_c',0,p,t,l)
d=p-t; d.z=0; d.normalize()
ld=bpy.data.lights.new('lamp','AREA'); ld.shape='RECTANGLE'; ld.size=1.0; ld.size_y=0.08; ld.color=(1,.97,.9); ld.energy=150
lo=bpy.data.objects.new('lamp',ld); sc.collection.objects.link(lo); lo.location=t+Vector((0,0,1.6))+d*-0.9
shot('lack_lamp_d',1,p,t,l); ld.energy=0
p,t,l=R.clip_target(S,'wheel'); shot('wheel_d',1,p,t,l); shot('wheel_c',0,p,t,l)
cab=M@Vector((-0.25,0,0.6)); cam0=final_v3.CAM_POS; dd=cam0-cab; dd.z=0; dd.normalize()
for tag,(back,h,lens) in {'A':(1.4,1.9,28),'B':(1.9,2.3,32),'C':(1.1,2.4,24)}.items():
    shot('int_'+tag,1,cab+dd*back+Vector((0,0,h)),cab,lens)
final_v3.pose_final(S,1.0); S['cam'].data.shift_x=0; S['cam'].data.shift_y=0; R.render_to(S,f'{O}/box_d.png',24)
