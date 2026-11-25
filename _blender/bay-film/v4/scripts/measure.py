import sys,bpy,json
sys.path.insert(0,'/home/claude/bay3d/v3')
import build_v3,final_v3,stations as st
S=build_v3.build_all((360,640),4)
final_v3.pose_final(S,1.0);bpy.context.view_layer.update()
for n,(pre,_) in st.STATIONS.items():
    x0,y0,x1,y1=st.bbox_px(S,pre);print('M',n,round(x1-x0),round(y1-y0),round(x0),round(y0))
