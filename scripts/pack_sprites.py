"""Register generated poses and assemble runtime atlases without painting pixels."""
from pathlib import Path
from PIL import Image
import numpy as np
import json

root=Path(__file__).resolve().parents[1]
gen=root/'art-sources/dimensional'
assets=root/'public/assets/sprites';sources=root/'art-sources/dimensional';sources.mkdir(exist_ok=True)
species=['lion','fox','raven','hare','turtle','rat']
files={s:s+'.png' for s in ['lion','fox','raven','hare','turtle','rat']}
CELL=192;BASELINE=168

def extract(im,rows,cols=4):
 counts=(np.array(im)[:,:,3]>128).sum(axis=1);cuts=[0]
 for i in range(1,rows):
  e=round(i*im.height/rows);lo=max(cuts[-1]+1,e-45);hi=min(im.height,e+45);quiet=counts[lo:hi]<8
  a=np.where(np.diff(np.r_[False,quiet,False].astype(int))==1)[0];b=np.where(np.diff(np.r_[False,quiet,False].astype(int))==-1)[0]
  if len(a):j=int(np.argmax(b-a));cuts.append(lo+int((a[j]+b[j])/2))
  else:cuts.append(lo+int(np.argmin(counts[lo:hi])))
 cuts.append(im.height);frames=[]
 for r in range(rows):
  for c in range(cols):
   f=im.crop((round(c*im.width/cols),cuts[r],round((c+1)*im.width/cols),cuts[r+1]));box=f.getchannel('A').point(lambda a:255 if a>128 else 0).getbbox()
   assert box,(rows,r,c)
   frames.append(f.crop(box))
 return frames

def fit(frame,scale):
 f=frame.resize((max(1,round(frame.width*scale)),max(1,round(frame.height*scale))),Image.Resampling.NEAREST)
 cell=Image.new('RGBA',(CELL,CELL));cell.paste(f,(CELL//2-f.width//2,BASELINE-f.height));return cell

side=Image.open(root/'art-sources/side-steps.png').convert('RGBA');sideframes=extract(side,3)
flight=Image.open(gen/'raven-flight.png').convert('RGBA');flight.save(sources/'raven-flight.png');flightframes=extract(flight,2)
rearpath=sources/'rear-idle.png'
rearframes=extract(Image.open(rearpath).convert('RGBA'),3) if rearpath.exists() else None
manifest={'cell':CELL,'columns':4,'framesPerTeam':20,'animals':{},'habitats':{'cell':CELL,'columns':4,'order':['light-'+s for s in species]+['dark-'+s for s in species]}}
for s in species:
 im=Image.open(gen/files[s]).convert('RGBA');im.save(sources/(s+'.png'));frames=extract(im,6)
 maxw=max(f.width for f in frames);maxh=max(f.height for f in frames);scale=min(164/maxw,160/maxh)
 cells=[fit(f,scale) for f in frames];atlas=Image.new('RGBA',(CELL*4,CELL*10))
 packed=[]
 for team in range(2):
  base=cells[team*12:team*12+12]
  if s!='raven':
   f=sideframes[species.index(s)+team*6];ref=frames[team*12+2]
   base[11]=fit(f,min(164/f.width,(ref.height*scale)/f.height))
  if s=='raven':
   fl=flightframes[team*4:team*4+4];flscale=min(174/max(f.width for f in fl),164/max(f.height for f in fl));extra=[fit(f,flscale) for f in fl]
  else:extra=[base[4],base[5],base[6],base[7]]
  rear=base[3]
  if rearframes:
   f=rearframes[species.index(s)+team*6];rear=fit(f,min(164/f.width,(frames[team*12].height*scale)/f.height))
  packed+=base+extra+[rear,base[3],rear,extra[2] if s=='raven' else base[3]]
 for i,c in enumerate(packed):atlas.paste(c,((i%4)*CELL,(i//4)*CELL))
 atlas.save(assets/(s+'.png'),optimize=True)
 for i in range(40):
  a=atlas.crop(((i%4)*CELL,(i//4)*CELL,(i%4+1)*CELL,(i//4+1)*CELL)).getchannel('A');box=a.point(lambda v:255 if v>128 else 0).getbbox();assert box and box[0]>=4 and box[2]<=CELL-4 and box[1]>=1 and box[3]<=BASELINE+1,(s,i,box)
 manifest['animals'][s]={'frames':40,'size':atlas.size,'cell':CELL,'baseline':BASELINE,'source':files[s]}

hab=Image.open(gen/'habitats.png').convert('RGBA');hab.save(sources/'habitats.png');hf=extract(hab,3);atlas=Image.new('RGBA',(CELL*4,CELL*3))
for i,f in enumerate(hf):
 # Broad terrain footprints retain their actual natural aspect ratio.
 cell=fit(f,min(174/f.width,116/f.height));atlas.paste(cell,((i%4)*CELL,(i//4)*CELL))
atlas.save(assets/'habitats.png',optimize=True)
(assets/'manifest.json').write_text(json.dumps(manifest,indent=2))
board=Image.open(root/'art-sources/runtime-png/board.png');assert board.size==(1254,1254) and board.mode=='RGBA';board.save(root/'public/assets/board.png')
icon=Image.open(assets/'raven.png').crop((0,0,CELL,CELL))
for size in (192,512):icon.resize((size,size),Image.Resampling.NEAREST).save(root/f'public/icon-{size}.png')
for image_path in list(assets.glob('*.png'))+[root/'public/assets/board.png']:
 im=Image.open(image_path).convert('RGBA');im.save(image_path.with_suffix('.webp'),'WEBP',lossless=True,quality=100,method=6,exact=True)
print('Packed 6 animals × 40 registered frames; 12 broad terrain sprites; transparent dimensional board.')
