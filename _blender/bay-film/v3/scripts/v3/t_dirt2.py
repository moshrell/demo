import sys,os,bpy
sys.path.insert(0,'/home/claude/bay3d/v3')
import render_pkg as R, build_v3, final_v3
from mathutils import Vector
O='/home/claude/bay3d/v3/out/td'; os.makedirs(O,exist_ok=True)
S=build_v3.build_all((360,640),24); sc=S['scene']
def shot(tag,dirt,pos,tgt,lens):
    final_v3.pose_final(S,dirt); R.set_cam(S,pos,tgt,lens); R.render_to(S,f'{O}/{tag}.png',24)
p,t,l=R.clip_target(S,'lack'); shot('lack_d',1,p,t,l)
d=p-t; d.z=0; d.normalize()
ld=bpy.data.lights.new('lamp','AREA'); ld.shape='RECTANGLE'; ld.size=1.0; ld.size_y=0.08; ld.color=(1,.97,.9); ld.energy=150
lo=bpy.data.objects.new('lamp',ld); sc.collection.objects.link(lo); lo.location=t+Vector((0,0,1.6))+d*-0.9
shot('lack_lamp_d',1,p,t,l); ld.energy=0

