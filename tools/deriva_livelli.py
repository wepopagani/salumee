#!/usr/bin/env python3
"""Salumée V3 — deriva in modo deterministico i livelli «mortadella» e «fondo».

Perché: i livelli V2 (mortadella-strato, focaccia-fondo) sono generazioni separate e,
sovrapposti, non coincidono con l'immagine intera (differenza media ~15/255).
Qui la mortadella viene ESTRATTA dai pixel della base originale (pane inferiore +
farcitura, già registrata con l'intera): a riposo base+pane = intera.
Il fondo V2 serve solo a riempire la superficie che la mortadella copriva.
Nessun generatore: soglie colore, morfologia e inpainting OpenCV (Telea).

Uso:
  python3 tools/deriva_livelli.py --base BASE.png --fondo-v2 focaccia-fondo.webp \
          --out-meat mortadella.png --out-fondo fondo.png
Dipendenze: pillow, numpy, scipy, opencv-python-headless.
La V3 è stata derivata dal PNG originale della base (prima proposta, senza perdita);
con assets/… /focaccia-base.webp della V2 il risultato è quasi identico.
"""
import argparse
import numpy as np, cv2
from PIL import Image, ImageFilter
from scipy import ndimage as ndi
ap = argparse.ArgumentParser()
ap.add_argument('--base', required=True); ap.add_argument('--fondo-v2', required=True)
ap.add_argument('--out-meat', required=True); ap.add_argument('--out-fondo', required=True)
args = ap.parse_args()
base = np.array(Image.open(args.base).convert('RGBA')).astype(np.float32)
fondo = np.array(Image.open(args.fondo_v2).convert('RGBA')).astype(np.float32)
assert base.shape[:2] == (1024, 1536) and fondo.shape[:2] == (1024, 1536), 'canvas 1536x1024 richiesto'
rgb = base[..., :3] / 255; a = base[..., 3] / 255
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
mx = rgb.max(-1); mn = rgb.min(-1); sat = (mx - mn) / (mx + 1e-6); d = mx - mn + 1e-6
h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
pink=(a>0.5)&(((h>=322)|(h<=27)))&(sat>0.09)&(sat<0.70)&(mx>0.30)&(r>g+0.045)&(r>=b)
H,W=pink.shape
roi=np.zeros_like(pink); roi[290:690,100:1360]=True
m=pink&roi
m=ndi.binary_opening(m,iterations=1)
lab,n=ndi.label(m); sizes=ndi.sum(m,lab,range(1,n+1))
keep=np.isin(lab,1+np.where(sizes>2500)[0])
yy,xx=np.mgrid[:H,:W]
disk=lambda r:(np.add.outer(np.arange(-r,r+1)**2,np.arange(-r,r+1)**2)<=r*r)
m=ndi.binary_closing(keep,structure=disk(7))
m=ndi.binary_fill_holes(m)
# fill remaining concavities between folds (small gaps) but keep outline
m=ndi.binary_closing(m,structure=disk(4)); m=ndi.binary_fill_holes(m)
m=m&(base[...,3]>128)
# hysteresis: weaker/darker pinks connected to the main meat region
rgb=base[...,:3]/255; r,g,b=rgb[...,0],rgb[...,1],rgb[...,2]
mx=rgb.max(-1); mn=rgb.min(-1); sat=(mx-mn)/(mx+1e-6); dd=mx-mn+1e-6
hh=np.where(mx==r,((g-b)/dd)%6,np.where(mx==g,(b-r)/dd+2,(r-g)/dd+4))*60
weak=(base[...,3]>128)&((hh>=312)|(hh<=22))&(sat>0.12)&(sat<0.82)&(mx>0.22)&(r>g+0.05)&(r>=b-0.02)&roi
weak=ndi.binary_closing(weak|m,structure=disk(2))
lab,n=ndi.label(weak)
ids=np.unique(lab[m&(lab>0)])
grow=np.isin(lab,ids)
m=ndi.binary_fill_holes(ndi.binary_closing(m|grow,structure=disk(3)))
m=m&(base[...,3]>128)
lab,n=ndi.label(m); sizes=ndi.sum(m,lab,range(1,n+1)); m=lab==(1+np.argmax(sizes))
# second pass: darker fold tips touching the meat (shadowed mortadella)
near=ndi.binary_dilation(m,structure=disk(28))
cand=(base[...,3]>128)&((hh>=318)|(hh<=28))&(sat>0.18)&(sat<0.85)&(mx>0.16)&(r>g+0.04)&near&~m
cand=ndi.binary_closing(cand,structure=disk(2))
lab,n=ndi.label(cand)
touch=np.unique(lab[ndi.binary_dilation(m,structure=disk(3))&(lab>0)])
m=ndi.binary_fill_holes(ndi.binary_closing(m|np.isin(lab,touch),structure=disk(3)))&(base[...,3]>128)
# trim paper/cheese-coloured fringe on the outline only (interior untouched)
fringe=(((hh>=24)&(hh<=55)&(sat<0.42))|((sat<0.14)&(mx>0.6)))
for _ in range(4):
    edge=m&~ndi.binary_erosion(m,structure=disk(2))
    m=m&~(edge&fringe)
m=ndi.binary_opening(m,structure=disk(1))
lab,n=ndi.label(m); sizes=ndi.sum(m,lab,range(1,n+1)); m=lab==(1+np.argmax(sizes))
m=ndi.binary_fill_holes(m)
mf=np.array(Image.fromarray((m*255).astype('uint8')).filter(ImageFilter.GaussianBlur(1.1))).astype(np.float32)/255
md=ndi.binary_dilation(m,structure=disk(3))
mdf=np.array(Image.fromarray((md*255).astype('uint8')).filter(ImageFilter.GaussianBlur(1.5))).astype(np.float32)/255
# meat layer: exact base pixels
meat=base.copy(); meat[...,3]=base[...,3]*mf
# fondo: base outside the meat, V2 fondo inside; then close the silhouette and inpaint gaps
fo=base.copy()
for c in range(4): fo[...,c]=base[...,c]*(1-mdf)+fondo[...,c]*mdf
solid=fo[...,3]>127
closed=ndi.binary_fill_holes(ndi.binary_closing(solid,structure=disk(18)))
# never extend the silhouette above the original meat's area top (keeps back edge natural)
gap=closed&~solid
rgb8=np.clip(fo[...,:3],0,255).astype(np.uint8)
inp=cv2.inpaint(cv2.cvtColor(rgb8,cv2.COLOR_RGB2BGR),(gap|(fo[...,3]<250)&closed).astype(np.uint8)*255,7,cv2.INPAINT_TELEA)
inp=cv2.cvtColor(inp,cv2.COLOR_BGR2RGB).astype(np.float32)
fill=(gap|((fo[...,3]<250)&closed))
for c in range(3): fo[...,c]=np.where(fill,inp[...,c],fo[...,c])
alpha_closed=np.array(Image.fromarray((closed*255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32)
fo[...,3]=np.maximum(fo[...,3],np.where(closed,alpha_closed,0))
Image.fromarray(meat.clip(0,255).astype('uint8'),'RGBA').save(args.out_meat)
Image.fromarray(fo.clip(0,255).astype('uint8'),'RGBA').save(args.out_fondo)
print('mortadella px', int(m.sum()), '->', args.out_meat, args.out_fondo)
