"""Builds static/regions.json from a flat-colour political map.
usage: python3 tools/regions.py [political.png] [out.json]
- every non-grey colour = one country (ordered by area, matches tools/labels.json ids)
- grey land is ignored (not clickable)
- label x/y/s in tools/labels.json override the automatic placement
- run `node tools/measure.js` after changing names (fills tools/emw.json)
"""
import numpy as np,cv2,json,sys,os
from PIL import Image
from scipy import ndimage as ndi
T=os.path.dirname(os.path.abspath(__file__));R=os.path.dirname(T)
SRC=sys.argv[1] if len(sys.argv)>1 else T+'/political.png'
OUT=sys.argv[2] if len(sys.argv)>2 else R+'/static/regions.json'
LB=json.load(open(T+'/labels.json'));EM=json.load(open(T+'/emw.json'))
im=np.array(Image.open(SRC).convert('RGB'))
H,W=im.shape[:2]
land=(im.max(2)>=120).astype(np.uint8)
n,lab,st,cen=cv2.connectedComponentsWithStats(land,connectivity=4)
cl=[]
for i in range(1,n):
    if st[i,4]<25: continue
    m=lab==i;c=np.median(im[m],axis=0)
    if c.max()-c.min()<30 or c.max()<150: continue   # gray = non-clickable
    cl.append(dict(i=i,a=int(st[i,4]),c=c))
groups=[]
for c in sorted(cl,key=lambda c:-c['a']):
    for g in groups:
        if np.abs(g['c']-c['c']).max()<=22: g['m'].append(c);break
    else: groups.append(dict(c=c['c'],m=[c]))
for g in groups:g['area']=sum(c['a'] for c in g['m'])
groups.sort(key=lambda g:-g['area'])
print(len(groups),[(int(g['area']),len(g['m']),g['c'].astype(int).tolist()) for g in groups])
L=np.zeros((H,W),np.int32)
for j,g in enumerate(groups,1):
    for c in g['m']:L[lab==c['i']]=j
d,(iy,ix)=ndi.distance_transform_edt(L==0,return_indices=True)
E=L.copy();near=(L==0)&(d<=2.5);E[near]=L[iy[near],ix[near]]
out=[]
for j,g in enumerate(groups,1):
    m=(E==j).astype(np.uint8)
    cs,_=cv2.findContours(m,cv2.RETR_CCOMP,cv2.CHAIN_APPROX_SIMPLE)
    parts=[]
    for c in cs:
        if cv2.contourArea(c)<15: continue
        c=cv2.approxPolyDP(c,1.2,True).reshape(-1,2)
        if len(c)<3: continue
        nums=[int(c[0][0]),int(c[0][1])];rel=[]
        for (a,b),(p,q) in zip(c[1:],c[:-1]):rel+=[int(a-p),int(b-q)]
        f=lambda v:''.join((('' if k==0 or str(n)[0]=='-' else ' ')+str(n)) for k,n in enumerate(v))
        parts.append('M'+f(nums)+'l'+f(rel)+'z')
    big=max(g['m'],key=lambda c:c['a']);bm=(lab==big['i'])
    dd=ndi.distance_transform_edt(bm);y,x=np.unravel_index(dd.argmax(),dd.shape)
    lb=LB[j-1];NAME=lb['en'];row=bm[y];l=x
    while l>0 and row[l-1]:l-=1
    r_=x
    while r_<W-1 and row[r_+1]:r_+=1
    wd=(r_-l)*.94;cx,cy=int((l+r_)/2),int(y)
    if lb['en'] in ('Orland Empire','Norvella'):
        xs=[(st[c['i'],0],st[c['i'],1],st[c['i'],0]+st[c['i'],2],st[c['i'],1]+st[c['i'],3]) for c in g['m'] if c['a']>=40]
        x0=min(q[0] for q in xs);y0=min(q[1] for q in xs);x1=max(q[2] for q in xs);y1=max(q[3] for q in xs)
        cx,cy=int((x0+x1)//2),int((y0+y1)//2);wd=int(x1-x0)*.9
    s=int(round(max(30,min(50,wd/EM[NAME]))))
    cx,cy,s=lb.get('x',cx),lb.get('y',cy),lb.get('s',s)
    sr=lb.get('sr') or int(round(max(26,min(50,s*EM[NAME]/EM[lb['ru']]))))
    out.append(dict(id=j,name=NAME,ru=lb['ru'],x=cx,y=cy,s=s,sr=sr,d=''.join(parts)))
json.dump(out,open(OUT,'w'),separators=(',',':'),ensure_ascii=False)
print(len(json.dumps(out,separators=(',',':')))//1024,'KB')

