# Testbouquet (Draufsicht) aus 3 Freistellern -> 3 Standbilder
import numpy as np, cv2, math, random
W=H=1400
def load(n): return cv2.imread(f'/tmp/w/{n}.png',-1)
S={'rose':load('rose-rosa'),'euk':load('eukalyptus'),'gyp':load('schleierkraut')}
def tint(p,hue=0,sat=1,val=1):
    hsv=cv2.cvtColor(p[...,:3],cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[...,0]=(hsv[...,0]+hue)%180; hsv[...,1]*=sat; hsv[...,2]*=val
    q=p.copy(); q[...,:3]=cv2.cvtColor(np.clip(hsv,0,255).astype(np.uint8),cv2.COLOR_HSV2BGR); return q
def xform(p,size,ang,flip):
    if flip: p=p[:,::-1]
    s=size/max(p.shape[:2]); p=cv2.resize(p,None,fx=s,fy=s,interpolation=cv2.INTER_AREA)
    h,w=p.shape[:2]; d=int(math.hypot(h,w))+4
    c=np.zeros((d,d,4),np.uint8); y=(d-h)//2; x=(d-w)//2; c[y:y+h,x:x+w]=p
    M=cv2.getRotationMatrix2D((d/2,d/2),ang,1); return cv2.warpAffine(c,M,(d,d),flags=cv2.INTER_LINEAR,borderValue=(0,0,0,0))
def paste(canvas,sp,cx,cy,height):
    d=sp.shape[0]; x0=int(cx-d/2); y0=int(cy-d/2)
    a=sp[...,3].astype(np.float32)/255
    # Schatten: Versatz & Unschaerfe wachsen mit Hoehe
    off=int(6+height*22); bl=3+height*14
    sh=np.zeros((d+2*40,d+2*40),np.float32); sh[40:40+d,40:40+d]=a
    sh=cv2.GaussianBlur(sh,(0,0),bl)*(0.30+0.15*height)
    def add(layer,ox,oy,fn):
        ys=max(0,oy); ye=min(H,oy+layer.shape[0]); xs=max(0,ox); xe=min(W,ox+layer.shape[1])
        if ye<=ys or xe<=xs: return
        fn(ys,ye,xs,xe,layer[ys-oy:ye-oy,xs-ox:xe-ox])
    def f_sh(ys,ye,xs,xe,l): canvas[ys:ye,xs:xe]*= (1-l[...,None]*np.array([.55,.7,.8]))
    add(sh,x0-40+off//2,y0-40+off,f_sh)
    def f_sp(ys,ye,xs,xe,l):
        aa=a[ys-y0:ye-y0,xs-x0:xe-x0][...,None] if False else None
    ys=max(0,y0); ye=min(H,y0+d); xs=max(0,x0); xe=min(W,x0+d)
    aa=a[ys-y0:ye-y0,xs-x0:xe-x0,None]; rgb=sp[ys-y0:ye-y0,xs-x0:xe-x0,:3].astype(np.float32)/255
    canvas[ys:ye,xs:xe]=rgb*aa+canvas[ys:ye,xs:xe]*(1-aa)
def paper():
    y,x=np.mgrid[0:H,0:W].astype(np.float32); r=np.hypot(x-W/2,y-H/2)/(W*.75)
    base=np.array([0.90,0.93,0.95])  # BGR warm paper
    c=base[None,None]*(1-0.10*r[...,None]**2); n=np.random.default_rng(1).normal(0,0.006,(H,W,1)); return (c+n).astype(np.float32)
def build(nr,ne,ng,seed=7):
    rnd=random.Random(seed); items=[]
    cx,cy=W/2,H/2
    # Zentrum-Gruen: Eukalyptus mit Ansatz unter den Rosen, nur Spitzen ragen heraus
    for i in range(ne):
        a=i*360/ne+rnd.uniform(-10,10); r=rnd.uniform(110,170)
        items.append(('euk',cx+r*math.cos(math.radians(a)),cy+r*math.sin(math.radians(a)),rnd.uniform(520,600),a+90,rnd.random()<.5,(0,1,1),0.12))
    for i in range(ng):
        a=i*360/max(ng,1)+25; r=rnd.uniform(120,230)
        items.append(('gyp',cx+r*math.cos(math.radians(a)),cy+r*math.sin(math.radians(a)),rnd.uniform(380,470),rnd.uniform(0,360),rnd.random()<.5,(0,1,1),0.75))
    # Rosen: Goldener Winkel, dichter, kleiner
    for i in range(nr):
        ang=i*137.508; r=36*math.sqrt(i+0.8)*1.55
        sz=rnd.uniform(150,185)*(1.0-0.18*(r/330))
        items.append(('rose',cx+r*math.cos(math.radians(ang)),cy+r*math.sin(math.radians(ang)),sz,rnd.uniform(0,360),rnd.random()<.5,(rnd.randint(-4,3),rnd.uniform(.85,1.05),rnd.uniform(.88,1.05)),0.45+0.5*(1-r/330)))
    return items
order={'euk':0,'gyp':1,'rose':2}
def render(items,path,crop=None):
    c=paper()
    for k,x,y,sz,ang,fl,(hu,sa,va),hgt in sorted(items,key=lambda t:(order[t[0]] if t[0]!='gyp' else 1.5,t[7])):
        p=S[k]; 
        if k=='rose': p=tint(p,hu,sa,va)
        paste(c,xform(p,sz,ang,fl),x,y,hgt)
    img=(np.clip(c,0,1)*255).astype(np.uint8)
    if crop: x0,y0,x1,y1=crop; img=cv2.resize(img[y0:y1,x0:x1],(1000,1000),interpolation=cv2.INTER_AREA)
    else: img=cv2.resize(img,(1000,1000),interpolation=cv2.INTER_AREA)
    cv2.imwrite(path,img)
full=build(24,6,4)
render(full,'/tmp/w/f1_voll.png')
render(build(6,2,1,seed=3),'/tmp/w/f2_wenig.png')
render(full,'/tmp/w/f3_nah.png',crop=(400,400,1000,1000))
