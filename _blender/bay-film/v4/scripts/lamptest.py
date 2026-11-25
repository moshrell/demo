import sys,os,bpy
sys.path.insert(0,'/home/claude/bay3d/v3')
import render_pkg as R, build_v3, final_v3
from mathutils import Vector
S=build_v3.build_all((360,640),24); sc=S['scene']
pos1,tgt1,lens1=R.clip_target(S,'lack')
final_v3.pose_final(S,0.0); R.set_cam(S,pos1,tgt1,lens1)
d=pos1-tgt1; d.z=0; d.normalize()
for tag,(sx,sy,h,off,E) in {'a':(1.2,0.1,1.4,-0.5,120),'b':(1.0,0.08,1.6,-0.9,150),'c':(0.8,0.08,1.3,-0.3,120)}.items():
    ld=bpy.data.lights.new('lamp','AREA'); ld.shape='RECTANGLE'; ld.size=sx; ld.size_y=sy; ld.color=(1,.97,.9); ld.energy=E
    lo=bpy.data.objects.new('lamp',ld); sc.collection.objects.link(lo); lo.location=tgt1+Vector((0,0,h))+d*off
    R.render_to(S,f'/home/claude/bay3d/v3/out/lamp_{tag}.png',24)
    bpy.data.objects.remove(lo)
