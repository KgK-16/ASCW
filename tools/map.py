"""Builds the site map from a Krita file.
usage: python3 tools/map.py General_Map.kra
Krita file layout (layer names matter):
  top-level visible paint layers -> geographic base (static/map/g0..g2.webp), always shown
  group "y<year>" (e.g. y410)   -> one map version:
      "borders"   black lines, always shown       -> static/map/<year>/b0..b2.webp
      "countries" flat fills, one hex per country -> vector territories in assets/map.json
  other groups (e.g. weather) are ignored.
Countries are matched by hex from tools/labels.json; unknown colours are reported.
Run `node tools/measure.js` after changing names in labels.json.
"""
import sys,os,re,json,zipfile,ctypes,subprocess,tempfile
import xml.etree.ElementTree as ET
import numpy as np,cv2
from PIL import Image
T=os.path.dirname(os.path.abspath(__file__));R=os.path.dirname(T)
LB=json.load(open(T+'/labels.json'));EM=json.load(open(T+'/emw.json'))
W4,H4=4096,2048            # map coordinate space used by the site

def lzf():
    so=os.path.join(tempfile.gettempdir(),'ascw_lzf.so')
    if not os.path.exists(so):subprocess.check_call(['gcc','-O2','-shared','-fPIC','-o',so,T+'/lzf.c'])
    l=ctypes.CDLL(so);l.lzf_dec.argtypes=[ctypes.c_char_p,ctypes.c_int,ctypes.c_char_p,ctypes.c_int];return l
LZ=lzf()

def read_layer(z,path,W,H):
    """Krita tiled layer (8-bit RGBA, planar BGRA, LZF) -> RGBA array"""
    d=z.read(path);p=0;h={}
    for _ in range(5):
        e=d.index(b'\n',p);k,v=d[p:e].split(b' ');h[k]=int(v);p=e+1
    tw,th,ps=h[b'TILEWIDTH'],h[b'TILEHEIGHT'],h[b'PIXELSIZE']
    if ps!=4:sys.exit('only 8-bit RGBA Krita files are supported')
    out=np.zeros((H,W,4),np.uint8);buf=ctypes.create_string_buffer(tw*th*ps)
    for _ in range(h[b'DATA']):
        e=d.index(b'\n',p);x,y,_c,sz=d[p:e].split(b',');p=e+1;x,y,sz=int(x),int(y),int(sz);t=d[p:p+sz];p+=sz
        if t[0]:
            if LZ.lzf_dec(t[1:],len(t)-1,buf,len(buf))!=len(buf):sys.exit('bad tile in '+path)
            raw=buf.raw
        else:raw=t[1:]
        if x<0 or y<0 or x>=W or y>=H:continue
        px=np.frombuffer(raw,np.uint8).reshape(ps,th,tw).transpose(1,2,0)
        x1,y1=min(x+tw,W),min(y+th,H);out[y:y1,x:x1]=px[:y1-y,:x1-x]
    return out[...,[2,1,0,3]]

def over(dst,src,op=1.):
    a=src[...,3:4]/255.*op;dst[...,:3]=src[...,:3]*a+dst[...,:3]*(1-a);dst[...,3:4]=np.maximum(dst[...,3:4],a*255)

def levels(img,name,lossless=False):
    """3 zoom levels: 1024, 2048, full width"""
    W=img.width
    for i,w in enumerate((1024,2048,W)):
        im=img if w==W else img.resize((w,w//2),Image.LANCZOS)
        if lossless and w!=W:   # keep thin lines visible when downscaled: alpha = block max
            a=np.asarray(img.getchannel('A'));f=W//w;a=a.reshape(w//2,f,w,f).max(axis=(1,3))
            im=Image.merge('RGBA',(*Image.new('RGB',(w,w//2),(0,0,0)).split(),Image.fromarray(a)))
        im.save(f'{name}{i}.webp',lossless=lossless,quality=100 if lossless else 90,method=6)

def path_d(c):
    f=lambda v:''.join((('' if k==0 or str(n)[0]=='-' else ' ')+str(n)) for k,n in enumerate(v))
    c=np.round(c/2).astype(int)                       # full-res pixels -> 4096 space
    c=c[np.r_[True,np.any(c[1:]!=c[:-1],axis=1)]]
    if len(c)<3:return ''
    o='M'+f(c[0].tolist());cur=None;buf=[]
    for (a,b),(p,q) in zip(c[1:],c[:-1]):            # relative segments, h/v for axis-aligned ones
        dx,dy=int(a-p),int(b-q);cm,v=('h',[dx]) if dy==0 else ('v',[dy]) if dx==0 else ('l',[dx,dy])
        if cm!=cur:
            if cur:o+=cur+f(buf)
            cur,buf=cm,[]
        buf+=v
    return o+(cur+f(buf) if cur else '')+'z'

def pole(m):
    """point of the shape farthest from all its borders (centre of the shape)"""
    d=cv2.distanceTransform(np.pad(m,1).astype(np.uint8),cv2.DIST_L2,5)[1:-1,1:-1];y,x=np.unravel_index(d.argmax(),d.shape);return x,y

def fit(mask,name,lb):
    """label box on a 2048x1024 grid (1 cell = 2 map units): letters keep proportions, letter spacing fills the width.
    default: centred on the pole of the territory, largest size that fits inside it.
    lb.area=[x0,y0,x1,y1]: centre of the parts inside that box (may overlap water); lb.place='between': midway between the 2 largest parts."""
    em,cap,n=EM[name],EM['cap'],len(name);sp=lambda s,w:min(w,em*s+.6*s*max(n-1,1))
    if 'area' in lb or lb.get('place')=='between':
        k,lab,st,cen=cv2.connectedComponentsWithStats(mask.astype(np.uint8),connectivity=8)
        ids=[i for i in range(1,k) if st[i,4]>=4]
        if 'area' in lb:
            x0,y0,x1,y1=[v/2 for v in lb['area']]
            ids=[i for i in ids if x0<=cen[i][0]<=x1 and y0<=cen[i][1]<=y1]
            bx0=min(st[i,0] for i in ids);bx1=max(st[i,0]+st[i,2] for i in ids)
            by0=min(st[i,1] for i in ids);by1=max(st[i,1]+st[i,3] for i in ids)
            cx,cy,room=(bx0+bx1)/2,(by0+by1)/2,(bx1-bx0)*2*.75
        else:
            a,b=sorted(ids,key=lambda i:-st[i,4])[:2];pa=pole(lab==a);pb=pole(lab==b)
            cx,cy,room=(pa[0]+pb[0])/2,(pa[1]+pb[1])/2,abs(pa[0]-pb[0])*2*1.4
        s=int(max(26,min(70,room/em)));return round(cx*2+1),round(cy*2+1),s,round(sp(s,room))
    cx,cy=pole(mask);hgt,wid=mask.shape
    ys,xs=np.nonzero(mask);D=max(2,int((xs.max()-xs.min())*.08))   # centre may slide along the row by up to 8% of the width
    for s in range(110,15,-2):                       # size in map units
        g=int(np.ceil(cap*s*.65/2))                  # half band height (cap + margin) in cells
        if cy-g<0 or cy+g>=hgt:continue
        B=mask[cy-g:cy+g+1].all(axis=0)              # columns where the whole band is inside
        j=np.arange(wid);st=np.where(B,-1,j);L=np.maximum.accumulate(st)            # last outside column on the left
        en=np.where(B,wid,j);Rr=np.minimum.accumulate(en[::-1])[::-1]               # first outside column on the right
        half=np.minimum(j-L-1,Rr-j-1)*B
        win=np.arange(max(0,cx-D),min(wid,cx+D+1));ok=win[2*half[win]*2*.9>=em*s]
        if len(ok):
            c=ok[np.argmin(abs(ok-cx))];room=2*half[c]*2*.9
            return round(c*2+1),round(cy*2+1),s,round(sp(s,room))
    return round(cx*2+1),round(cy*2+1),16,round(em*16)

def countries(img,ver):
    rgb=img[...,:3].astype(int);on=img[...,3]>127
    hexes=[tuple(int(l['hex'][i:i+2],16) for i in (1,3,5)) for l in LB]
    cols,inv=np.unique(rgb[on],axis=0,return_inverse=True);lab=np.full(len(cols),-1)
    for k,c in enumerate(cols):
        d=[max(abs(c-np.array(h))) for h in hexes];i=int(np.argmin(d))
        if d[i]<=6:lab[k]=i
        else:print(f'  y{ver}: unknown colour #{c[0]:02x}{c[1]:02x}{c[2]:02x} ({np.sum(inv.ravel()==k)} px)')
    L=np.full(on.shape,-1,np.int16);L[on]=lab[inv.ravel()]
    out=[]
    for i,l in enumerate(LB):
        m=(L==i).astype(np.uint8)
        if not m.any():continue
        cs,_=cv2.findContours(m,cv2.RETR_CCOMP,cv2.CHAIN_APPROX_SIMPLE)
        d=''.join(path_d(cv2.approxPolyDP(c,2.,True).reshape(-1,2)) for c in cs if cv2.contourArea(c)>=60)
        g=cv2.resize(m,(2048,1024),interpolation=cv2.INTER_AREA)>0 if m.shape[1]!=2048 else m>0
        r=dict(id=i+1,c=l['hex'],name=l['en'],ru=l['ru'],d=d)
        for k,nm in (('',l['en']),('r',l['ru'])):
            f=fit(g,nm,l)
            if f is None:print(f'  y{ver}: no room for label {nm}');continue
            for a,v in zip('xysw',f):r[a+k]=v
        out.append(r)
    return out

def main(src):
    z=zipfile.ZipFile(src);doc=ET.fromstring(z.read('maindoc.xml'));ns={'k':'http://www.calligra.org/DTD/krita'}
    im=doc.find('k:IMAGE',ns);W,H=int(im.get('width')),int(im.get('height'));base=im.get('name')
    top=im.find('k:layers',ns).findall('k:layer',ns)
    rd=lambda e:read_layer(z,f'{base}/layers/{e.get("filename")}',W,H)
    geo=np.zeros((H,W,4),np.float32);vers={}
    for e in reversed(top):                           # bottom -> top
        nm=e.get('name')
        if e.get('nodetype')=='paintlayer' and e.get('visible')=='1':
            if e.get('compositeop')!='normal':print('  warning: blend mode ignored for',nm)
            print('geo layer:',nm);over(geo,rd(e).astype(np.float32),int(e.get('opacity'))/255)
        elif e.get('nodetype')=='grouplayer' and re.fullmatch(r'y-?\d+',nm):
            vers[int(nm[1:])]={c.get('name'):c for c in e.find('k:layers',ns).findall('k:layer',ns)}
    os.makedirs(R+'/static/map',exist_ok=True)
    levels(Image.fromarray(geo[...,:3].round().astype(np.uint8)),R+'/static/map/g')
    data=[]
    for y in sorted(vers):
        ch=vers[y];print('version',y)
        if 'borders' in ch:
            os.makedirs(f'{R}/static/map/{y}',exist_ok=True);levels(Image.fromarray(rd(ch['borders'])),f'{R}/static/map/{y}/b',True)
        data.append(dict(y=y,b=int('borders' in ch),r=countries(rd(ch['countries']),y) if 'countries' in ch else []))
    json.dump(data,open(R+'/assets/map.json','w'),separators=(',',':'),ensure_ascii=False)
    print('assets/map.json',os.path.getsize(R+'/assets/map.json'),'bytes')

if __name__=='__main__':main(sys.argv[1])
