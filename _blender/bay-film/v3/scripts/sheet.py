import sys
from PIL import Image, ImageDraw
files=sys.argv[2:]; out=sys.argv[1]
ims=[Image.open(f) for f in files]; w,h=ims[0].size
s=Image.new('RGB',(w*len(ims)+6*(len(ims)-1),h),(30,30,30))
d=ImageDraw.Draw(s)
for i,(f,im) in enumerate(zip(files,ims)):
    s.paste(im,(i*(w+6),0)); d.text((i*(w+6)+6,6),f.split('/')[-1],fill=(255,80,120))
s.save(out)
