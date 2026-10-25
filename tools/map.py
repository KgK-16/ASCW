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

def fit(mask,name):
    """largest letter size whose text fits inside the territory on one line; letter spacing fills the rest.
    mask: country on a 2048x1024 grid (1 cell = 2 map units)"""
    em,cap,n=EM[name],EM['cap'],len(name)
    ys,xs=np.nonzero(mask);y0,y1,x0,x1=ys.min(),ys.max()+1,xs.min(),xs.max()+1
    m=mask[y0:y1,x0:x1].astype(np.int32);hgt,wid=m.shape
    up=m.copy();dn=m.copy()
    for i in range(1,hgt):up[i]=(up[i-1]+1)*m[i]
    for i in range(hgt-2,-1,-1):dn[i]=(dn[i+1]+1)*m[i]
    cache={}
    for s in range(110,17,-2):                       # size in map units
        g=int(np.ceil(cap*s*.65/2))                  # half band height (cap + margin) in cells
        if g not in cache:
            C=((up>=g)&(dn>=g)).astype(np.int32);run=np.zeros_like(C)
            run[:,0]=C[:,0]
            for j in range(1,wid):run[:,j]=(run[:,j-1]+1)*C[:,j]
            cache[g]=run
        run=cache[g];need=em*s/.9/2                  # cells
        best=run.max(axis=1);rows=np.nonzero(best>=need)[0]
        if len(rows):
            r=rows[np.argmax(best[rows])];j=int(np.argmax(run[r]));L=run[r,j]
            cx=(x0+j-L/2+.5)*2;cy=(y0+r+.5)*2;room=L*2*.9
            w=min(room,em*s+.6*s*max(n-1,1))
            return round(cx),round(cy),s,round(w)
    return None

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
            f=fit(g,nm)
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
