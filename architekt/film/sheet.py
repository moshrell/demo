import sys,glob
from PIL import Image
fs=sorted(glob.glob(sys.argv[2]+'/f*.jpg')); W,H=600,460; cols=4
rows=(len(fs)+cols-1)//cols
sheet=Image.new('RGB',(W*cols,H*rows),'white')
for i,f in enumerate(fs): sheet.paste(Image.open(f).resize((W,H)),((i%cols)*W,(i//cols)*H))
sheet.save(sys.argv[1],quality=85)
