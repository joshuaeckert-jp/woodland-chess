from PIL import Image,ImageFilter
from pathlib import Path
root=Path(__file__).resolve().parents[1];im=Image.open(root/'art-sources/checkmate/effects-source.png').convert('RGBA');w,h=im.size
mask=bytearray(im.getchannel('A').point(lambda x:255 if x>48 else 0).filter(ImageFilter.MaxFilter(3)).tobytes());components=[]
for i in range(w*h):
 if not mask[i]:continue
 mask[i]=0;stack=[i];pixels=[];left=w;top=h;right=bottom=0
 while stack:
  j=stack.pop();pixels.append(j);y,x=divmod(j,w);left=min(left,x);top=min(top,y);right=max(right,x+1);bottom=max(bottom,y+1)
  for n in (j-w,j+w,j-1,j+1):
   if 0<=n<w*h and mask[n] and abs(n%w-x)<=1:mask[n]=0;stack.append(n)
 if len(pixels)>500:components.append({'pixels':pixels,'bbox':(left,top,right,bottom)})
drop=next(c for c in components if len(c['pixels'])<1000);components.remove(drop)
components.sort(key=lambda c:(0 if c['bbox'][1]<430 else 1 if c['bbox'][1]<700 else 2,c['bbox'][0]))
components[8]['pixels']+=drop['pixels'];l,t,r,b=components[8]['bbox'];dl,dt,dr,db=drop['bbox'];components[8]['bbox']=(min(l,dl),min(t,dt),max(r,dr),max(b,db))
source=im.tobytes();atlas=Image.new('RGBA',(768,576))
for index,c in enumerate(components):
 l,t,r,b=c['bbox'];tw,th=r-l,b-t;data=bytearray(tw*th*4)
 for pos in c['pixels']:
  y,x=divmod(pos,w);dest=((y-t)*tw+x-l)*4;data[dest:dest+4]=source[pos*4:pos*4+4]
 tile=Image.frombytes('RGBA',(tw,th),bytes(data));tile.thumbnail((172,172),Image.Resampling.NEAREST);atlas.alpha_composite(tile,((index%4)*192+(192-tile.width)//2,(index//4)*192+(192-tile.height)//2))
atlas.save(root/'public/assets/checkmate/effects.webp',lossless=True,exact=True);atlas.save(root/'art-sources/checkmate/effects-packed.png')
print('Packed',len(components),'isolated icons')

# Terrain source follows a regular 4x2 grid.
im=Image.open(root/'art-sources/checkmate/terrain-source.png').convert('RGBA')
atlas=Image.new('RGBA',(768,384))
for row in range(2):
 for col in range(4):
  tile=im.crop((round(col*im.width/4),round(row*im.height/2),round((col+1)*im.width/4),round((row+1)*im.height/2)))
  tile=tile.crop(tile.getbbox());tile.thumbnail((172,172),Image.Resampling.NEAREST)
  atlas.alpha_composite(tile,(col*192+(192-tile.width)//2,row*192+(192-tile.height)//2))
atlas.save(root/'art-sources/checkmate/terrain-packed.png')
atlas.save(root/'public/assets/checkmate/terrain.webp',lossless=True,exact=True)
im=Image.open(root/'art-sources/checkmate/card-back-source.png').convert('RGBA');im.thumbnail((320,480),Image.Resampling.NEAREST)
im.save(root/'art-sources/checkmate/card-back-packed.png')
im.save(root/'public/assets/checkmate/card-back.webp',lossless=True,exact=True)
