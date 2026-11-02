"""Makes neighbouring countries share one border line.
Countries are traced one by one, so a common border comes out as two slightly different lines with gaps and overlaps.
The bigger country keeps its outline; points of the smaller one that lie near it move onto it, and between two such
points the smaller country takes the bigger one's points, so both borders are the same line.
usage: python3 tools/snap.py            (fixes assets/map.json in place; tools/map.py does this on every build)
"""
import os,re,json
import numpy as np
TOL=5.          # max gap between two traced borders, in 4096-px map units

def parse(d):
    rings=[];x=y=0;r=None
    for c,a in re.findall(r'([MmLlHhVvZz])([^MmLlHhVvZz]*)',d):
        n=[float(v) for v in re.findall(r'-?\d*\.?\d+',a)]
        if c in 'Mm':
            x,y=(n[0]+x,n[1]+y) if c=='m' and r is not None else (n[0],n[1]);r=[(x,y)];rings.append(r);n=n[2:];c='l' if c=='m' else 'L'
        for i in range(0,len(n),1 if c in 'HhVv' else 2):
            if c=='l':x+=n[i];y+=n[i+1]
            elif c=='L':x,y=n[i],n[i+1]
            elif c=='h':x+=n[i]
            elif c=='H':x=n[i]
            elif c=='v':y+=n[i]
            elif c=='V':y=n[i]
            r.append((x,y))
    return [np.array(r) for r in rings]

def enc(rings):
    f=lambda v:''.join((('' if k==0 or str(n)[0]=='-' else ' ')+str(n)) for k,n in enumerate(v))
    o=''
    for c in rings:
        c=np.round(c).astype(int);c=c[np.r_[True,np.any(c[1:]!=c[:-1],axis=1)]]
        if len(c)>1 and (c[0]==c[-1]).all():c=c[:-1]
        if len(c)<3:continue
        o+='M'+f(c[0].tolist());cur=None;buf=[]
        for (a,b),(p,q) in zip(c[1:],c[:-1]):
            dx,dy=int(a-p),int(b-q);cm,v=('h',[dx]) if dy==0 else ('v',[dy]) if dx==0 else ('l',[dx,dy])
            if cm!=cur:
                if cur:o+=cur+f(buf)
                cur,buf=cm,[]
            buf+=v
        o+=(cur+f(buf) if cur else '')+'z'
    return o

def area(rings):return sum(abs(np.sum(r[:,0]*np.roll(r[:,1],-1)-np.roll(r[:,0],-1)*r[:,1]))/2 for r in rings)

def snap(regions):
    """regions: list of dicts with 'd'; changes 'd' of the smaller ones in place"""
    done=[]                                         # outlines already fixed: (ring points, cumulative length)
    for g in sorted(regions,key=lambda g:-area(parse(g['d']))):
        rings=parse(g['d']);out=[]
        if done:
            A=np.concatenate([b[:-1] for b,_ in done]);B=np.concatenate([b[1:] for b,_ in done])
            own=np.concatenate([np.full(len(b)-1,k) for k,(b,_) in enumerate(done)]);seg=np.concatenate([np.arange(len(b)-1) for b,_ in done])
            AB=B-A;L2=np.maximum((AB**2).sum(1),1e-9)
        for r in rings:
            if not done:out.append(r);continue
            t=np.clip((((r[:,None,:]-A[None])*AB[None]).sum(2))/L2,0,1)      # nearest point on every fixed segment
            P=A[None]+t[...,None]*AB[None];dd=((P-r[:,None,:])**2).sum(2);j=dd.argmin(1);ok=dd[np.arange(len(r)),j]<=TOL*TOL
            pos=[(own[j[i]],seg[j[i]]+t[i,j[i]]) if ok[i] else None for i in range(len(r))]
            q=[];n=len(r)
            for i in range(n):
                q.append(P[i,j[i]] if ok[i] else r[i])
                a,b=pos[i],pos[(i+1)%n]
                if a and b and a[0]==b[0]:            # both ends on the same fixed outline: follow it between them
                    pts,cum=done[a[0]];m=len(pts)-1;s0,s1=a[1],b[1];tot=cum[-1]
                    at=lambda s:np.interp(s,np.arange(m+1),cum)
                    fw=(at(s1)-at(s0))%tot;bw=tot-fw;ch=np.hypot(*(P[(i+1)%n,j[(i+1)%n]]-P[i,j[i]]))
                    if min(fw,bw)>3*ch+4*TOL:continue  # not the same stretch of border
                    if fw<=bw:idx=[k%m for k in range(int(np.floor(s0))+1,int(np.floor(s0))+1+int(round((np.floor(s1)-np.floor(s0))%m)))]
                    else:idx=[k%m for k in range(int(np.floor(s0)),int(np.floor(s0))-int(round((np.floor(s0)-np.floor(s1))%m)),-1)]
                    q+= [pts[k] for k in idx]
            out.append(np.array(q))
        g['d']=enc(out)
        for r in parse(g['d']):
            c=np.vstack([r,r[:1]]);done.append((c,np.r_[0,np.cumsum(np.hypot(*np.diff(c,axis=0).T))]))
    return regions

if __name__=='__main__':
    p=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),'assets','map.json')
    V=json.load(open(p))
    for v in V:snap(v['r'])
    json.dump(V,open(p,'w'),separators=(',',':'),ensure_ascii=False);print(p,os.path.getsize(p),'bytes')
