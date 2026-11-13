# Freisteller: grauer Hintergrund -> WebP mit Alpha. Aufruf: python3 tools/schnitt.py
import numpy as np, cv2, sys
from scipy import ndimage as ndi
SRC='public/img/roh/'; OUT='/tmp/w/'
def cut(name, lo=14, hi=34, fill=True, schat=0):
    im=cv2.imread(SRC+name+'.jpg').astype(np.float32)
    # Hintergrund: grosse Unschaerfe der Randpixel (Vignette)
    h,w=im.shape[:2]
    m=np.zeros((h,w),bool); b=30; m[:b]=m[-b:]=True; m[:,:b]=m[:,-b:]=True
    bg=np.array([np.median(im[...,c][m]) for c in range(3)])
    lab=cv2.cvtColor(im.astype(np.uint8),cv2.COLOR_BGR2LAB).astype(np.float32)
    bl=cv2.cvtColor(np.uint8([[bg]]),cv2.COLOR_BGR2LAB).astype(np.float32)[0,0]
    d=np.sqrt(((lab-bl)**2*np.array([1,2.2,2.2])).sum(2))
    chroma=np.sqrt((lab[...,1]-bl[1])**2+(lab[...,2]-bl[2])**2)
    schatten=(lab[...,0]<bl[0]-4)&(chroma<(schat))
    d=np.where(schatten,0,d)
    a=np.clip((d-lo)/(hi-lo),0,1)
    core=a>0.5
    core=ndi.binary_opening(core,iterations=1)
    lbl,n=ndi.label(core); 
    if n>1:
        sz=ndi.sum(core,lbl,range(1,n+1)); core=np.isin(lbl,[i+1 for i,s in enumerate(sz) if s>0.003*h*w])
    if fill: core=ndi.binary_fill_holes(core)
    solid=ndi.binary_dilation(core,iterations=2)
    a=np.where(ndi.binary_fill_holes(core)&fill,1,a)*solid if fill else a*ndi.binary_dilation(core,iterations=6)
    a=cv2.GaussianBlur(a.astype(np.float32),(0,0),0.8)
    # Entfaerben der Randsaeume (Graustich)
    rgb=im.copy(); k=np.clip(1-a,0,1)[...,None]
    rgba=np.dstack([np.clip(rgb,0,255),a*255]).astype(np.uint8)
    ys,xs=np.where(a>0.05); y0,y1,x0,x1=ys.min(),ys.max(),xs.min(),xs.max()
    rgba=rgba[y0:y1+1,x0:x1+1]
    cv2.imwrite(OUT+name+'.png',rgba)
    print(name,rgba.shape,'cover',round(float((a>0.5).mean()),3))
cut('rose-rosa'); cut('eukalyptus',lo=7,hi=18,fill=False,schat=6); cut('schleierkraut',lo=10,hi=26,fill=False,schat=7)
