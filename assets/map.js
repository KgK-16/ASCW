// ASCW world map: flat raster + SVG viewer, timeline overlay and WebGL globe.
// Globals injected by layouts/map/list.html: U (base URL), V (map versions: [{y:year,b:has borders,r:[countries]}]), MK (markers), EV (timeline events),
// COU (country names/texts by hex colour, edited on the site). window.MAP is the hook for the site editor (assets/edit.js).
// Layers: geographic base (static/map/g*.webp) < country colours: light tint + inner colour band (canvas, toggleable) < country shapes for clicks/hover (svg) < borders of the version (static/map/<year>/b*.webp)
// < selection: everything else dimmed, outline on top < graticule, labels, markers.
const D=document,HT=D.documentElement,$=i=>D.getElementById(i),
[m,c,im,ov,sv,bi,hl,sl,mw,gx,g,p,pt,px,cd,tl,xt,ty,tw,tz,tr,zg,zt,zc,zi,zo,pc,ld,zm,zk,sb,mz]="m c im ov sv bi hl sl mw gx g p pt px cd tl xt ty tw tz tr zg zt zc zi zo pc ld zm zk sb mz".split(" ").map($),
W=4096,H=2048,T0=320,T1=420, // visible timeline range
SH=["M-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0z","M0-10L10 0 0 10-10 0zM0-7L7 0 0 7-7 0zM-3.6 0a3.6 3.6 0 1 0 7.2 0a3.6 3.6 0 1 0-7.2 0z"], // marker shapes by kind (k): circle, circle in a diamond (capital)
HM={en:["N","S","E","W"],ru:[" с. ш."," ю. ш."," в. д."," з. д."]},
P={},hc=D.createElement("canvas").getContext("2d"),ox=ov.getContext("2d");
let MR,GR,VW=0,VH=0,ZW=0,GW=0,GH=0,GX=[],ovK,cdr=0,MG=null,MON=0,MS=[],MP=[],MD=[0],sbK,fv=[0,0],ft0=0,fr=0,k=1,kk,mvT,raf,an,ms=null,x=0,y=0,lv=-1,sel=null,yr=420,cv,RG=[],R={},CO=1,CP,CT="—",fl=0,lx,ly,mv=0,tap=0,PY=0,G=0;
try{CO=localStorage.ascwColors!="0"}catch{}
const ru=()=>HT.lang=="ru",
L=(e,r)=>ru()?r:e,
nm=r=>ru()?r.ru:r.name,
mn=q=>(ru()?q.r||q.n:q.n||q.r)||"", // marker name; a missing language falls back to the other one
hemi=(v,lat)=>v?HM[ru()?"ru":"en"][(lat?0:2)+(v<0)]:"",
deg=(v,lat)=>Math.abs(v)+"°"+hemi(v,lat),
path=r=>r.p||(r.p=new Path2D(r.d)),
tlOpen=()=>tl.classList.contains("o"),
two=o=>{const a=Object.values(o);return a[1]&&{d:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2}},
ver=()=>V.reduce((a,v)=>v.y<=yr?v:a,V[0]), // latest map version not after the selected year
bsrc=l=>U+`map/${cv.y}/b${l}.webp`;
function glyphs(r){ // label letters keep their proportions; letter spacing stretches the name to its box width
// set on the site (COU): lx / ly label shift, lz letter size in pt of the 4096 px map (1 pt = 4/3 px), lk extra letter spacing (in letter heights), lo opacity
const c=COU[r.c]||{},q0=ru()?r.sr:r.s;if(!q0)return null;const f=c.lz?c.lz/.75/q0:1,q=q0*f;
const t=nm(r).toUpperCase(),n=t.length,w=(ru()?r.wr:r.w)*f;hc.font=q+"px A";
let ws=[...t].map(ch=>hc.measureText(ch).width),nat=ws.reduce((a,v)=>a+v,0),z=q;
if(nat>w&&w){const s=w/nat;ws=ws.map(v=>v*s);nat=w;z=q*s} // a renamed country longer than its box: smaller letters, same proportions
const ls=n>1?Math.max(-.2*z,Math.max(0,(w-nat)/(n-1))+(c.lk||0)*z):0;let X=(ru()?r.xr:r.x)+(c.lx||0)-(nat+ls*(n-1))/2;
return{t,s:+z.toFixed(1),y:(ru()?r.yr:r.y)+(c.ly||0),o:c.lo,xs:ws.map(v=>{const o=X;X+=v+ls;return o})}}
function load(el,src){el._s=src;const i=new Image;i.src=src;i.decode().then(()=>{if(el._s==src)el.src=src},()=>{})} // decode off the main thread, then swap

// ---- flat map ----
const fit=()=>VH/H,kmax=()=>Math.max(2,fit());
function set(anim){
if(!isFinite(k+x+y)){k=fit();x=y=0} // never keep a broken view
k=Math.min(Math.max(k,fit()),kmax());
const w=W*k,h=H*k,cw=VW,ch=VH;
x=w<cw?(cw-w)/2:Math.min(0,Math.max(cw-w,x));
y=h<ch?(ch-h)/2:Math.min(0,Math.max(ch-h,y));
an=anim;if(!raf)raf=requestAnimationFrame(apply); // at most one DOM update per frame
const n=W*k*devicePixelRatio,l=n>4500?3:n>2200?2:n>1100?1:0; // image levels 1024/2048/4096/8192 px
if(l>lv){if(lv<0&&l)im.src=U+"map/g0.webp"; // light preview while the sharp level loads
lv=l;load(im,U+`map/g${l}.webp`);lvB()}}
function lvB(){if(lv<0)return;bi.hidden=!cv.b;if(cv.b)load(bi,bsrc(lv))}
function apply(){raf=0;posM();c.classList.toggle("t",!!an);mw.classList.toggle("t",!!an);c.style.transform=`translate(${x}px,${y}px) scale(${k})`;
c.classList.add("mv");clearTimeout(mvT);mvT=setTimeout(rest,250)} // while moving: GPU layer only, no restyle/repaint
function rest(){c.classList.remove("mv");if(k!=kk)c.style.setProperty("--k",kk=k)} // after: zoom-dependent widths, crisp re-raster
function zoom(f,px,py,anim){const k2=Math.min(Math.max(k*f,fit()),kmax());x=px-(px-x)*k2/k;y=py-(py-y)*k2/k;k=k2;set(anim)}

function rs(){ // (re)build the SVG overlays: country shapes, graticule, labels
let s="",q="",l="",t="";
for(let i=-180;i<=180;i+=15){const X=(i+180)/360*W;q+=`<path${i?"":' class="e"'} d="M${X} 0V${H}"/>`;if(i%30==0&&i<180)l+=`<span data-o="${i}">${deg(i)}</span>`}
for(let i=-75;i<=75;i+=15){const Y=(90-i)/180*H;q+=`<path${i?"":' class="e"'} d="M0 ${Y}H${W}"/>`;if(i%30==0)l+=`<span data-a="${i}">${deg(i,1)}</span>`}
RG.forEach(r=>{s+=`<path style="--c:${r.c}" fill-rule="evenodd" d="${r.d}"/>`;const a=glyphs(r);
if(a)t+=`<text data-i="${r.id}"${a.o!=null?` opacity="${a.o}"`:""} x="${a.xs.map(v=>v.toFixed(1)).join(" ")}" y="${a.y}" font-size="${a.s}">${a.t}</text>`});
sv.innerHTML=s;sl.innerHTML=`<g class="gr">${q}</g><g class="lb">${t}</g>`;gx.innerHTML=l;GX=[...gx.children].map(e=>({e,o:e.dataset.o!=null?+e.dataset.o:null,a:+e.dataset.a}));posM();hi()}
function hi(){ // selection layer above the borders: the rest of the map is dimmed, the country keeps its own relief colours
const r=sel&&R[sel],key=CO+"|"+sel+"|"+cv?.y;if(key==ovK)return;ovK=key; // nothing changed: skip the costly redraws (also of the globe texture)
hl.innerHTML=r?`<path class="dm" fill-rule="evenodd" d="M0 0H${W}V${H}H0z${r.d}"/><path class="gw" d="${r.d}"/><path class="ol" d="${r.d}"/>`:"";
drawOv()}
function drawOv(){ // country colours as one raster layer (cheap to pan/zoom): light tint + inner colour band; the selected country keeps pure relief
if(CO){const o=ox;o.clearRect(0,0,W,H);o.lineJoin="round";
RG.forEach(r=>{const q=path(r);o.globalAlpha=r==R[sel]?0:.28;o.fillStyle=r.c;o.fill(q,"evenodd");o.save();o.clip(q,"evenodd");o.globalAlpha=.85;o.strokeStyle=r.c;o.lineWidth=14;o.stroke(q);o.restore()});o.globalAlpha=1}
if(G)tq()}
// markers live outside the zoomed layer and are re-positioned each frame, so icons and names stay crisp vectors at any zoom
// marker: {o lon, a lat, n / r name EN / RU, k kind, f font, ten / tru text, y0 / y1 years shown, z importance: 0 always, 1 from medium zoom, 2 close-up only}
const mOn=q=>!(q.y0!=null&&yr<q.y0)&&!(q.y1!=null&&yr>q.y1),
far=(q,zl=k/fit())=>(q.z==1&&zl<2.2)||(q.z==2&&zl<4.5),
drawM=()=>{mw.innerHTML=MK.map((q,i)=>`<g data-m="${i}"${mOn(q)?"":" hidden"} class="${far(q)?"z":""}${i===ms?" s":""}"><path fill-rule="evenodd" d="${SH[q.k|0]||SH[0]}"/><text x="${q.k==1?15:12}" y="1"${q.f=="cap"?' class="c"':""}>${esc(mn(q))}</text></g>`).join("");posM();if(G)GI.forEach(e=>e.m!=null&&e.d.classList.toggle("s",e.m===ms))},
posM=()=>{const zl=k/fit();[...mw.children].forEach((e,i)=>{const q=MK[i];if(!q)return;e.style.transform=`translate(${x+(q.o+180)/360*W*k}px,${y+(90-q.a)/180*H*k}px)`;
e.classList.toggle("z",far(q,zl))});drawMz();if(!G)sbU(2*Math.PI*RE*Math.max(.02,Math.cos(Math.min(1.5,Math.abs(Math.PI/2-(VH/2-y)/k/H*Math.PI))))/(W*k));
// graticule labels: light, pinned to the top / left edge of the view, hidden under the button column
const t0=Math.max(y,0)+6,l0=Math.max(x,0)+6,xr=VW-ZW-82,yb=VH-30; // sizes are cached (sz): no layout reads while the map moves
for(const q of GX){let X,Y,hd;if(q.o!=null){X=x+(q.o+180)/360*W*k+4;Y=t0;hd=X<l0+40||X>xr}else{X=l0;Y=y+(90-q.a)/180*H*k-18;hd=Y<t0+18||Y>yb}
q.e.style.transform=`translate(${X}px,${Y}px)`;if(q.h!==hd)q.e.hidden=q.h=hd}},
esc=t=>String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;"),
RE=6371, // the planet is Earth-sized: radius in km
ll2v=(lo,la)=>{lo*=Math.PI/180;la*=Math.PI/180;return[Math.cos(la)*Math.sin(lo),Math.sin(la),Math.cos(la)*Math.cos(lo)]},
v2ll=v=>[Math.atan2(v[0],v[2])*180/Math.PI,Math.asin(Math.max(-1,Math.min(1,v[1])))*180/Math.PI],
km=d=>d.toLocaleString(ru()?"ru-RU":"en-US",{maximumFractionDigits:d<10?2:d<100?1:0})+L(" km"," км");
function sbU(kp){ // scale bar: the longest round length (1, 2, 5 × 10ⁿ km) that fits in 100 px; kp = km per screen px at the view centre
const L0=kp*100,e=10**Math.floor(Math.log10(L0)),n=[5,2,1].map(v=>v*e).find(v=>v<=L0)||e,key=n+"|"+HT.lang+"|"+(n/kp).toFixed(0);if(key==sbK)return;sbK=key;
sb.firstChild.textContent=n<1?(n*1e3).toLocaleString()+L(" m"," м"):n.toLocaleString(ru()?"ru-RU":"en-US")+L(" km"," км");sb.lastChild.style.width=(n/kp).toFixed(1)+"px"}
function msU(){ // measured route: great-circle arcs between the points, sampled every degree; cumulative distances
MP=[];MD=[0];for(let i=1;i<MS.length;i++){const a=MS[i-1],b=MS[i],an=Math.acos(Math.max(-1,Math.min(1,a[0]*b[0]+a[1]*b[1]+a[2]*b[2]))),n=Math.max(1,Math.ceil(an*180/Math.PI)),q=[];
MD.push(MD[i-1]+an*RE);for(let j=0;j<=n;j++){const t=j/n,sa=Math.sin(an),f=an<1e-9?1-t:Math.sin((1-t)*an)/sa,g2=an<1e-9?t:Math.sin(t*an)/sa;q.push([a[0]*f+b[0]*g2,a[1]*f+b[1]*g2,a[2]*f+b[2]*g2])}MP.push(q)}
if(MON==2&&MS.length==2){const[C,E]=MS,t=Math.acos(Math.max(-1,Math.min(1,C[0]*E[0]+C[1]*E[1]+C[2]*E[2]))),a=Math.abs(C[1])<.9?[0,1,0]:[1,0,0], // circle: all points at the same distance over the surface from the centre
cr=(p,q)=>[p[1]*q[2]-p[2]*q[1],p[2]*q[0]-p[0]*q[2],p[0]*q[1]-p[1]*q[0]],nz=v=>{const l=Math.hypot(...v);return v.map(c=>c/l)},u=nz(cr(C,a)),w=cr(C,u),q=[];
for(let j=0;j<=180;j++){const f=j/180*6.2832,c=Math.cos(f)*Math.sin(t),s2=Math.sin(f)*Math.sin(t);q.push([0,1,2].map(i=>C[i]*Math.cos(t)+u[i]*c+w[i]*s2))}MP.push(q)}
drawMz();if(G)rq()}
function mHit(cx,cy){if(!MON)return-1;const r=(G?g:m).getBoundingClientRect(); // measuring point under the pointer (screen px), -1 if none
return MS.findIndex(v=>{let p;if(G)p=gp(v);else{const[lo,la]=v2ll(v);p=[x+(lo+180)/360*W*k,y+(90-la)/180*H*k]}return p&&Math.hypot(r.left+p[0]-cx,r.top+p[1]-cy)<12})}
function msTap(v,pts,cx,cy){ // measuring: a tap on a point removes it, anywhere else adds one
const i=pts.findIndex(p=>p&&Math.hypot(p[0]-cx,p[1]-cy)<12);if(i>=0)MS.splice(i,1);else if(v){if(MON==2&&MS.length>1)MS=[];MS.push(v)}msU()} // circle: centre, then a point on the edge; the next tap starts a new one
function drawMz(){if(G||!MS.length){if(mz.firstChild)mz.innerHTML="";return} // flat map: the arcs bend as the real shortest way does
let d="";const cw=VW-140,sp=v=>{const[lo,la]=v2ll(v);return[x+(lo+180)/360*W*k,y+(90-la)/180*H*k,lo]};
for(const q of MP){let pl=null;for(const v of q){const[X,Y,lo]=sp(v);d+=(pl==null||Math.abs(lo-pl)>180?"M":"L")+X.toFixed(1)+" "+Y.toFixed(1);pl=lo}}
mz.innerHTML=`<path class="u" d="${d}"/><path d="${d}"/>`+MS.map((v,i)=>{const[X,Y]=sp(v);return`<circle cx="${X.toFixed(1)}" cy="${Y.toFixed(1)}" r="4.5"/>`+(i?`<text x="${(X+(X>cw?-9:9)).toFixed(1)}" y="${(Y-10).toFixed(1)}"${X>cw?' text-anchor="end"':""}>${km(MD[i])}</text>`:"")}).join("")}

function names(){RG.forEach(r=>{r.n0??=r.name;r.r0??=r.ru;const o=COU[r.c]||{};r.name=o.en||r.n0;r.ru=o.ru||r.r0})} // names edited on the site win over the generated ones
function setVer(){ // switch to the map version of the selected year
cv=ver();RG=cv.r;R={};RG.forEach(r=>R[r.id]=r);names();
if(sel&&!R[sel]){sel=null;p.classList.remove("o")}else panel();
lvB();rs();if(G)gB()}
function upd(){ // apply the selected year
zt.textContent=ty.textContent=yr;
tz.querySelectorAll(".f").forEach(f=>f.classList.toggle("a",f.dataset.y<=yr));
if(ver()!=cv)setVer();drawM();if(G)tq()}
const hit=(mx,my)=>RG.find(r=>hc.isPointInPath(path(r),mx,my,"evenodd"))?.id; // country under a map point
function pick(id){
id=id&&R[id]?+id:null;if(id!=null)ms=null;
sel=id;if(sel)panel();
p.classList.toggle("o",!!(sel||ms!=null));hi();drawM()}
function pickM(i){ms=i;sel=null;hi();panel();p.classList.add("o");drawM()} // marker selected: its name and text in the side panel
function panel(){if(ms!=null&&MK[ms]){const q=MK[ms];pt.textContent=mn(q);px.textContent=(ru()?q.tru||q.ten:q.ten||q.tru)||"";MAP.onMarker?.(ms);return}
if(sel){const r=R[sel],o=COU[r.c]||{};pt.textContent=nm(r);px.textContent=(ru()?o.tru:o.ten)||L("Placeholder text","Текст-заглушка");MAP.onPanel?.(r)}}
function col(on){CO=on;c.classList.toggle("on",on);zc.classList.toggle("on",on);try{localStorage.ascwColors=on?1:0}catch{}hi()}
zc.onclick=()=>col(!CO);
function mode(n){MON=n;zm.classList.toggle("on",n==1);zk.classList.toggle("on",n==2);D.body.classList.toggle("msr",!!n);MS=[];msU()} // measuring: 0 off, 1 route (ruler), 2 circle
zm.onclick=()=>mode(MON==1?0:1);zk.onclick=()=>mode(MON==2?0:2);

m.onpointerdown=e=>{if(e.pointerType=="mouse"&&e.button)return;if(e.pointerType!="mouse")coords(e);m.setPointerCapture(e.pointerId);P[e.pointerId]={x:e.clientX,y:e.clientY};mv=0;fv=[0,0];cancelAnimationFrame(fr);m.classList.add("dr");MG=mHit(e.clientX,e.clientY);if(MG<0)MG=null}; // pressing a measuring point drags it
m.onpointermove=e=>{coords(e);const q=P[e.pointerId];if(!q)return m.classList.toggle("mh",mHit(e.clientX,e.clientY)>=0);
if(MG!=null){mv+=Math.abs(e.clientX-q.x)+Math.abs(e.clientY-q.y);q.x=e.clientX;q.y=e.clientY;const r=m.getBoundingClientRect(),mx=Math.min(W,Math.max(0,(e.clientX-r.left-x)/k)),my=Math.min(H,Math.max(0,(e.clientY-r.top-y)/k));MS[MG]=ll2v(mx/W*360-180,90-my/H*180);return msU()}
const o=two(P),dx=e.clientX-q.x,dy=e.clientY-q.y;q.x=e.clientX;q.y=e.clientY;mv+=Math.abs(dx)+Math.abs(dy);
if(o){const n=two(P),r=m.getBoundingClientRect();x+=n.x-o.x;y+=n.y-o.y;zoom(n.d/o.d,n.x-r.left,n.y-r.top)}else{const t=performance.now(),dt=Math.max(t-ft0,8)/1e3;ft0=t;fv=[fv[0]*.4+dx/dt*.6,fv[1]*.4+dy/dt*.6];x+=dx;y+=dy;set()}};
m.onpointerup=m.onpointercancel=e=>{const one=Object.keys(P).length==1;delete P[e.pointerId];if(!Object.keys(P).length)m.classList.remove("dr");if(MG!=null){MG=null;if(mv>4)return} // a dragged point stays; a tapped one is removed below
if(one&&mv>6&&performance.now()-ft0<80){let l=0;const st=t=>{const dt=l?Math.min((t-l)/1e3,.05):0;l=t;x+=fv[0]*dt;y+=fv[1]*dt;set();const d=Math.exp(-dt*4);fv=fv.map(v=>v*d);if(Math.hypot(...fv)>15)fr=requestAnimationFrame(st)};fr=requestAnimationFrame(st)} // a flicked map glides on
if(!one||mv>6||e.type!="pointerup")return;const r=m.getBoundingClientRect(),t=Date.now();
if(MON){const mx=(e.clientX-r.left-x)/k,my=(e.clientY-r.top-y)/k;return msTap(mx>=0&&mx<=W&&my>=0&&my<=H&&ll2v(mx/W*360-180,90-my/H*180),MS.map(v=>{const[lo,la]=v2ll(v);return[r.left+x+(lo+180)/360*W*k,r.top+y+(90-la)/180*H*k]}),e.clientX,e.clientY)}
if(t-tap<300){zoom(2,e.clientX-r.left,e.clientY-r.top,1);tap=0;return}
tap=t;const mx=(e.clientX-r.left-x)/k,my=(e.clientY-r.top-y)/k,g=D.elementFromPoint(e.clientX,e.clientY)?.closest("#mw [data-m]");
if(g&&!MAP.onTap)return pickM(+g.dataset.m);if(!MAP.onTap?.(mx,my,g&&+g.dataset.m))pick(hit(mx,my))};
m.onlostpointercapture=e=>{delete P[e.pointerId];if(!Object.keys(P).length)m.classList.remove("dr")};
m.onwheel=e=>{e.preventDefault();const r=m.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.002),e.clientX-r.left,e.clientY-r.top)};
zi.onclick=()=>G?(gT=cl(gT/1.5),anc=null,rq()):zoom(1.6,VW/2,VH/2,1);
zo.onclick=()=>G?(gT=cl(gT*1.5),anc=null,rq()):zoom(1/1.6,VW/2,VH/2,1);
pc.onclick=()=>{ms=null;pick()};

// ---- cursor coordinates (2D) ----
function coords(e){const r=MR;lx=(e.clientX-r.left-x)/k;ly=(e.clientY-r.top-y)/k;showC()}
function showC(){if(lx==null||lx<0||ly<0||lx>W||ly>H)return;const lo=lx/W*360-180,la=90-ly/H*180;
CP=la.toFixed(3)+", "+lo.toFixed(3);
CT=Math.abs(la).toFixed(3)+"°"+hemi(la,1)+" "+Math.abs(lo).toFixed(3)+"°"+hemi(lo)+"<br>x "+lx.toFixed(1)+" y "+ly.toFixed(1);
if(!fl&&!cdr)cdr=requestAnimationFrame(()=>{cdr=0;if(!fl)cd.innerHTML=CT})} // at most one write per frame
function copy(){if(!CP)return;
const fb=()=>{const t=D.createElement("textarea");t.value=CP;D.body.append(t);t.select();try{D.execCommand("copy")}catch{}t.remove()};
navigator.clipboard?navigator.clipboard.writeText(CP).catch(fb):fb();
cd.textContent=L("COPIED: ","СКОПИРОВАНО: ")+CP;clearTimeout(fl);fl=setTimeout(()=>{fl=0;cd.innerHTML=CT},1200)}
cd.onclick=copy;
D.addEventListener("keydown",e=>{if(e.target.closest?.("input:not([type=range]),textarea,select,[contenteditable]"))return; /* typing in a field is not a shortcut */if(e.key=="Escape")tlOpen()?tlClose():MON?mode(0):pick();else if(tlOpen()||e.ctrlKey||e.metaKey||e.altKey)return;else if(e.code=="KeyC"&&!getSelection().toString())copy();
else if(e.key=="+"||e.key=="=")zi.click();else if(e.key=="-")zo.click();
else if(/^Arrow/.test(e.key)){e.preventDefault();const h=e.key=="ArrowLeft"?1:e.key=="ArrowRight"?-1:0,v=e.key=="ArrowUp"?1:e.key=="ArrowDown"?-1:0; // arrows: look west / east / north / south
if(G){gv=[h*(gD-1)*.9,v*(gD-1)*.9];fly=null;rq()}else{x+=h*VW/4;y+=v*VH/4;set(1)}}});

// ---- timeline ----
function tlB(){
const w=Math.max(tw.clientWidth-120,1200),E={},en=[[],[]];let h="",pf=0;PY=w/(T1-T0);
tz.style.width=w+120+"px";tr.style.left="53px";tr.style.width=w+14+"px";
EV.forEach(v=>{if(v[0]>=T0&&v[0]<=T1)(E[v[0]]=E[v[0]]||[]).push(v[ru()?2:1])});
for(let n=T0;n<=T1;n+=5){const X=60+(n-T0)*PY;h+=`<i class="t${n%10?"":" l"}" style="left:${X}px"></i>`+(n%10?"":`<em class="n" style="left:${X}px">${n}</em>`)}
Object.keys(E).forEach(n=>{const X=(n-T0)*PY;let s=0,b=99; // flags alternate up/down and stack so texts never overlap
[pf,1-pf].forEach(d=>{let l=0;while(en[d][l]>X)l++;if(l<b){b=l;s=d}});en[s][b]=X+210;pf=1-s;
h+=`<div class="f ${s?"d":"u"}" data-y="${n}" style="left:${60+X}px;height:${96+b*92}px"><b>${n}</b><span>${E[n].join("; ")}</span></div>`});
tz.querySelectorAll("i,em,.f").forEach(e=>e.remove());tr.insertAdjacentHTML("beforebegin",h);upd()}
const tlClose=()=>{tl.classList.remove("o");zt.focus()}; // keyboard focus goes into the timeline and back
tr.min=T0;tr.max=T1;tr.value=yr;
tr.oninput=()=>{yr=+tr.value;upd()};
tz.onclick=e=>{const f=e.target.closest(".f");if(f){yr=tr.value=+f.dataset.y;upd()}};
zt.onclick=()=>{tl.classList.add("o");tlB();tw.scrollLeft=60+(yr-T0)*PY-tw.clientWidth/2;tr.focus({preventScroll:true})};
xt.onclick=tlClose;

if(matchMedia("(hover:none)").matches){const z=D.querySelector(".z");z.classList.add("hint");setTimeout(()=>z.classList.remove("hint"),3500);z.addEventListener("pointerdown",()=>z.classList.remove("hint"),{once:true})}
D.addEventListener("lang",()=>{sbK=0;rs();drawM();panel();showC();if(tlOpen())tlB();if(G)tq()});
addEventListener("resize",()=>{if(tlOpen())tlB()});
const MAP=window.MAP={ // editor hooks
redraw(){names();rs();drawM();panel();if(tlOpen())tlB();if(G)tq()},
markers(){drawM();if(G)tq()},pickM,yr:()=>yr,focus(o,a){if(G){fly={y:-o*Math.PI/180,p:Math.min(1.4,Math.max(-1.4,a*Math.PI/180))};gT=cl(Math.min(gT,2.2));return rq()}k=Math.max(k,fit()*5);x=VW/2-(o+180)/360*W*k;y=VH/2-(90-a)/180*H*k;set(1)},timeline(){if(tlOpen())tlB()},
toMap(e){const r=m.getBoundingClientRect();return{mx:(e.clientX-r.left-x)/k,my:(e.clientY-r.top-y)/k}},
sel:()=>sel&&R[sel],pick,W,H};
function sz(){VW=m.clientWidth;VH=m.clientHeight;ZW=zc.parentNode.offsetWidth;GW=g.clientWidth||VW;GH=g.clientHeight||VH;MR=m.getBoundingClientRect();GR=G?g.getBoundingClientRect():MR}
addEventListener("scroll",sz,{passive:true}); // positions on screen are cached too (cursor coordinates on every pointer move) // view sizes, read only when they change
new ResizeObserver(()=>{sz();set();if(G)rq()}).observe(m);
sz();upd();col(CO);k=fit();x=(VW-W*k)/2;set();rest();drawM();lx=(VW/2-x)/k;ly=(VH/2-y)/k;showC(); /* start with the view centre */D.fonts.load("20px A").then(rs); // re-layout labels with real glyph widths

// ---- globe ----
// World space: the sun stays at a fixed direction SW, the planet spins slowly around its axis (sa), the camera orbits it (ya, pa; dragging moves the camera).
let gl,gc,go,gw,tc,tx2,bc,bb,tex,bp,pp,sp,fp,tb,pb,eb,gD=3,gT=3,gv=[0,0],gt0=0,fly=null,gtap=0,anc=null,GI=[],GO=[],gsig="",ya=0,pa=.15,sa=0,tm=0,SC,AS,tdirty,gm=0,busy,loop,last=0,FD;
const GP={},cl=v=>Math.min(4.5,Math.max(1.6,v)),
SW=(v=>{const l=Math.hypot(...v);return v.map(a=>a/l)})([.62,.32,.72]),
SPIN=6.2832/430,CLOUD=[1/600,1/950], // one turn in ~7 min; cloud layers drift (uv/s)
ry=(v,t)=>{const c=Math.cos(t),s=Math.sin(t);return[c*v[0]+s*v[2],v[1],-s*v[0]+c*v[2]]},
rx=(v,t)=>{const c=Math.cos(t),s=Math.sin(t);return[v[0],c*v[1]-s*v[2],s*v[1]+c*v[2]]},
rq=()=>{if(!loop&&G){last=0;loop=requestAnimationFrame(tick)}}, // render loop runs while the globe is shown
tq=()=>{tdirty=1;rq()}; // texture rebuilds are coalesced to one per frame
function tick(t){loop=0;if(!G||D.hidden)return;
if(last&&t-last<31&&!(tdirty||fly||anc||MG!=null||gv[0]||gv[1]||Math.abs(gT-gD)>1e-4||Object.keys(GP).length)){loop=requestAnimationFrame(tick);return} // idle: ~30 frames/s is plenty for the slow spin and drifting clouds; full rate while it moves
const dt=last?Math.min((t-last)/1e3,.1):0;last=t;tm+=dt;sa+=dt*SPIN;mo(dt);dr();if(FD){gl.finish();const f=FD;FD=0;requestAnimationFrame(f)}loop=requestAnimationFrame(tick)}
D.addEventListener("visibilitychange",rq);
function mo(dt){ // camera motion as in Google Earth: eased zoom, drag inertia, fly to a double-clicked point
gD+=(gT-gD)*Math.min(1,dt*8);
if(anc){const w=GW,h=GH,Y=ya+sa,c=Math.cos(Y),s=Math.sin(Y),e=Math.cos(pa),f=Math.sin(pa),[px,py,pz]=anc.p,x1=c*px+s*pz,z1=-s*px+c*pz,y2=e*py-f*z1,dp=gD-(f*py+e*z1),k=2*(gD-1)*SC/h; // zoom towards the cursor: the point under it stays there
ya+=(anc.x-(x1/(SC*AS)/dp+1)*w/2)*k;pa=Math.min(1.4,Math.max(-1.4,pa+(anc.y-(1-y2/SC/dp)*h/2)*k));if(Math.abs(gT-gD)<1e-3)anc=null}
if(fly){const f=Math.min(1,dt*5),d=((fly.y-sa-ya)%6.2832+9.4248)%6.2832-3.1416;ya+=d*f;pa+=(fly.p-pa)*f;if(Math.abs(d)+Math.abs(fly.p-pa)<1e-3)fly=null}
else if(!Object.keys(GP).length&&(gv[0]||gv[1])){ya+=gv[0]*dt;pa=Math.min(1.4,Math.max(-1.4,pa+gv[1]*dt));const k=Math.exp(-dt*3.5);gv=gv.map(v=>Math.abs(v*k)<.003?0:v*k)}}
const PR="#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n",
NZ=`float h3(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}float n3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}float fb(vec3 x){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*n3(x);x=x*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s;}`,
FV="attribute vec2 g;varying vec2 n;void main(){n=g;gl_Position=vec4(g,0.,1.);}",
// sphere mesh, radius R (1 = ground, >1 = cloud shell); planet rotation a.x = camera yaw + spin, a.y = camera pitch
PV=`attribute vec3 p;attribute vec2 t;uniform vec3 u;uniform vec2 a;uniform float R;varying vec2 v;varying vec3 q;varying vec3 o;void main(){float c=cos(a.x),s=sin(a.x),e=cos(a.y),f=sin(a.y);vec3 r=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z)*R;r=vec3(r.x,e*r.y-f*r.z,f*r.y+e*r.z);q=r;o=p;v=t;gl_Position=vec4(r.x/(u.z*u.y),r.y/u.z,0.,u.x-r.z);}`,
CL=`uniform sampler2D C;uniform vec4 cw;float cl(vec2 w){float a=texture2D(C,w+cw.xy).r,b=texture2D(C,vec2(w.x+cw.z,1.-w.y)).r;return smoothstep(.3,.95,a*.65+b*.5);}
vec2 tl(vec3 ob,vec3 Lo){vec3 e=normalize(vec3(ob.z,0.,-ob.x)+vec3(1e-4,0.,0.)),nr=cross(ob,e);float cs=max(sqrt(1.-ob.y*ob.y),.1);return vec2(dot(Lo,e)/(6.2832*cs),-dot(Lo,nr)/3.1416);}`, // uv step towards the sun
// ground: map, day/night lighting, ocean glint + sky reflection, cloud shadows, atmospheric haze
PF=PR+CL+`uniform sampler2D T;uniform float d;uniform vec3 L;uniform vec3 Lo;varying vec2 v;varying vec3 q;varying vec3 o;
void main(){vec3 n=normalize(q),V=normalize(vec3(0.,0.,d)-q),ob=normalize(o),H=normalize(L+V);float ndl=dot(n,L),h=1./d,al=smoothstep(h,h+.03,q.z),nv=max(dot(n,V),0.);
float day=smoothstep(-.08,.3,ndl),tw=exp(-pow(ndl*6.,2.)),wr=clamp((ndl+.15)/1.15,0.,1.);
vec3 m=texture2D(T,v).rgb;float cd=cl(v),sh=cl(v+tl(ob,Lo)*.014);
float sea=smoothstep(.02,.07,m.b-m.r)*(1.-smoothstep(.18,.28,m.r));
vec3 g=m*(1.-.55*sh*day)*mix(1.,.82,sea);
vec3 c=mix(m*vec3(.045,.06,.1),g*(.08+1.02*wr),day);
c+=sea*day*(1.-cd)*(vec3(1.,.95,.85)*(pow(max(dot(n,H),0.),160.)*.8+pow(max(dot(n,H),0.),18.)*.05)+vec3(.3,.45,.85)*pow(1.-nv,5.)*.35);
c+=vec3(1.,.35,.1)*tw*.05;
float fr=pow(1.-nv,2.5);
vec3 atm=mix(vec3(.16,.32,.9),vec3(.5,.72,1.),day)*smoothstep(-.28,.3,ndl)+vec3(1.,.42,.14)*exp(-pow(ndl*5.,2.))*.7;
c=mix(c,atm,fr*.78);c=mix(c,vec3(.52,.68,1.),.06*day);
gl_FragColor=vec4(c*al,al);}`,
// cloud shell: soft density, self-shadowing towards the sun, warm light at the terminator, fades into the atmosphere at the limb
CS=PR+CL+`uniform float d;uniform float R;uniform vec3 L;uniform vec3 Lo;varying vec2 v;varying vec3 q;varying vec3 o;
void main(){vec3 n=normalize(q),V=normalize(vec3(0.,0.,d)-q),ob=normalize(o);float h=R*R/d,al=smoothstep(h,h+.02,q.z),ndl=dot(n,L);
float cd=cl(v),c2=cl(v+tl(ob,Lo)*.005),sf=clamp((c2-cd)*2.5,0.,1.),day=smoothstep(-.22,.25,ndl);
vec3 lit=vec3(1.,.985,.96)*(1.-.5*sf)+vec3(.05,.07,.12)*sf;
vec3 col=mix(vec3(.02,.025,.04),mix(vec3(1.,.62,.42),lit,smoothstep(-.02,.3,ndl)),day);
float fr=pow(1.-max(dot(n,V),0.),3.);col=mix(col,mix(vec3(.2,.35,.9),vec3(.6,.76,1.),day)*day,fr*.5);
float k=cd*.95*al*(1.-fr*.4);gl_FragColor=vec4(col*k,k);}`,
// background: stars, sun disc + glow, atmosphere halo (sunlit side, sunset rim, forward scattering when backlit)
BF=PR+NZ+`uniform vec3 u;uniform vec2 a;uniform vec3 S;varying vec2 n;
void main(){vec2 tp=vec2(n.x*u.z*u.y,n.y*u.z);vec3 rd=normalize(vec3(tp,-1.));
float ce=cos(a.y),se=sin(a.y),cy=cos(a.x),sy=sin(a.x);vec3 w=vec3(rd.x,ce*rd.y+se*rd.z,-se*rd.y+ce*rd.z);w=vec3(cy*w.x-sy*w.z,w.y,sy*w.x+cy*w.z);
vec3 col=vec3(0.);
for(int k=0;k<2;k++){float z=float(k);vec3 gp=w*(80.+z*80.)+z*17.,id=floor(gp),f=fract(gp)-.5,of=(vec3(h3(id+7.),h3(id+13.),h3(id+29.))-.5)*.6;
col+=vec3(.85,.88,1.)*step(.965,h3(id+z*31.))*smoothstep(.1,0.,length(f-of))*(.3+.7*h3(id+3.))*(1.1-.4*z);}
vec3 o=vec3(0.,0.,u.x);float tc=-dot(o,rd);vec3 P=o+rd*tc;float dist=length(P),hh=max(dist-1.,0.),ss=dot(P/max(dist,1e-4),S),
lit=smoothstep(-.35,.4,ss),fw=pow(max(dot(rd,S),0.),6.),hz=exp(-hh*30.)*.75+exp(-hh*9.)*.25;
col+=(mix(vec3(.12,.3,1.),vec3(.42,.66,1.),lit)*lit*1.15+vec3(1.,.45,.18)*exp(-pow(ss*3.2,2.))*.55+vec3(.7,.82,1.)*fw*1.8)*hz*step(0.,tc);
float sd=max(1.-dot(rd,S),0.);col+=step(0.,-S.z)*(vec3(1.,.98,.94)*smoothstep(.00016,.00008,sd)*12.+vec3(1.,.88,.7)*(.0011/(sd+.0011))*.6);
gl_FragColor=vec4(1.-exp(-col*1.4),1.);}`,
// lens flare (additive, after the planet): glare, streak, ghosts; S2.z = sun visibility
FF=`precision mediump float;uniform vec3 u;uniform vec3 S2;varying vec2 n;
float gh(vec2 p,vec2 c,float r){float d=length((p-c)*vec2(u.y,1.));return smoothstep(r,r*.6,d)*.5+smoothstep(r*1.02,r,d)*smoothstep(r*.9,r,d)*.6;}
void main(){vec2 p=n,s=S2.xy,dd=(p-s)*vec2(u.y,1.);float r=length(dd);
vec3 c=vec3(1.,.9,.75)*(.02/(r*r*30.+.02)*.25+exp(-abs(dd.y)*90.)*exp(-abs(dd.x)*2.5)*.25);
c+=vec3(.4,.6,1.)*gh(p,-s*.4,.06)*.08+vec3(1.,.6,.3)*gh(p,-s*.75,.1)*.06+vec3(.5,1.,.7)*gh(p,s*.35,.035)*.07+vec3(.7,.5,1.)*gh(p,-s*1.15,.16)*.04;
gl_FragColor=vec4(c*S2.z,1.);}`,
CF=PR+NZ+`uniform vec2 rs;void main(){vec2 uv=gl_FragCoord.xy/rs;float th=(uv.x-.5)*6.2832,ph=(.5-uv.y)*3.1416;vec3 p=vec3(cos(ph)*sin(th),sin(ph),cos(ph)*cos(th)),w=p*3.5;vec3 q=vec3(fb(w),fb(w+vec3(5.2,1.3,2.8)),fb(w+vec3(1.7,9.2,4.1)));float n=fb(p*6.+5.*(q-.5)),y=p.y;float fr=exp(-pow((y-.52-.28*(fb(p*2.+9.)-.5))*5.5,2.))+exp(-pow((y+.46-.28*(fb(p*2.+4.)-.5))*5.5,2.))+.6*exp(-pow((y-.1*(fb(p*2.+2.)-.5))*9.,2.));float c=n*1.05+fr*.4-.8+(fb(p*30.+q*3.)-.5)*.28+(fb(p*70.+q*6.)-.5)*.12,d=smoothstep(-.14,.32,c);gl_FragColor=vec4(d,d,d,1.);}`;

function sh(t,s){const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);return o}
function prog(v,f,a,u){const q=gl.createProgram();gl.attachShader(q,sh(gl.VERTEX_SHADER,v));gl.attachShader(q,sh(gl.FRAGMENT_SHADER,f));
a.forEach((n,i)=>gl.bindAttribLocation(q,i,n));gl.linkProgram(q);q.u={};u.forEach(n=>q.u[n]=gl.getUniformLocation(q,n));return q}
function tp(){gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE)}
function gi(img){
gc=D.createElement("canvas");gl=gc.getContext("webgl",{antialias:true});if(!gl){zg.style.display="none";return}go=D.createElement("canvas");gw=D.createElement("div");gw.id="gw";g.append(gc,go,gw);new ResizeObserver(()=>{if(G){sz();rq()}}).observe(g);
bp=prog(FV,BF,["g"],["u","a","S"]);pp=prog(PV,PF,["p","t"],["u","a","R","d","L","Lo","cw","T","C"]);sp=prog(PV,CS,["p","t"],["u","a","R","d","L","Lo","cw","C"]);fp=prog(FV,FF,["g"],["u","S2"]);const cp=prog(FV,CF,["g"],["rs"]);
tb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,tb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
const b=[],ix=[];for(let j=0;j<=48;j++)for(let i=0;i<=96;i++){const th=(i/96-.5)*6.2832,ph=(.5-j/48)*3.1416;b.push(Math.cos(ph)*Math.sin(th),Math.sin(ph),Math.cos(ph)*Math.cos(th),i/96,j/48)}
for(let j=0;j<48;j++)for(let i=0;i<96;i++){const a=j*97+i;ix.push(a,a+1,a+97,a+1,a+98,a+97)}
pb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,pb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(b),gl.STATIC_DRAW);
eb=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,eb);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(ix),gl.STATIC_DRAW);
// clouds: rendered once into a texture
const CW=Math.min(matchMedia("(pointer:coarse)").matches||innerWidth<900?2048:4096,gl.getParameter(gl.MAX_TEXTURE_SIZE));gl.activeTexture(gl.TEXTURE1);const ct=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,ct);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,CW,CW/2,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);tp();
const fo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,ct,0);
gl.viewport(0,0,CW,CW/2);gl.useProgram(cp);gl.uniform2f(cp.u.rs,CW,CW/2);gl.bindBuffer(gl.ARRAY_BUFFER,tb);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,0,0,0);gl.drawArrays(gl.TRIANGLES,0,3);
gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.deleteFramebuffer(fo);gl.deleteProgram(cp);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.generateMipmap(gl.TEXTURE_2D);
gl.activeTexture(gl.TEXTURE0);gl.useProgram(pp);gl.uniform1i(pp.u.T,0);gl.uniform1i(pp.u.C,1);gl.useProgram(sp);gl.uniform1i(sp.u.C,1);
// map texture: base image is downscaled once, overlays are redrawn on top of it by tx()
const S=Math.min(4096,gl.getParameter(gl.MAX_TEXTURE_SIZE)),mk=()=>{const e=D.createElement("canvas");e.width=S;e.height=S/2;return e};
bc=mk();bb=mk();const bx=bc.getContext("2d");bx.imageSmoothingQuality="high";bx.drawImage(img,0,0,S,S/2);
tc=mk();tx2=tc.getContext("2d");
tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bc);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);tp();
const e=gl.getExtension("EXT_texture_filter_anisotropic");if(e)gl.texParameterf(gl.TEXTURE_2D,e.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,gl.getParameter(e.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
g.onpointerdown=e=>{if(e.pointerType=="mouse"){if(e.button)return;for(const i in GP)delete GP[i]}g.setPointerCapture(e.pointerId);GP[e.pointerId]={x:e.clientX,y:e.clientY};gm=0;gv=[0,0];fly=null;anc=null;g.classList.add("dr");if(e.pointerType!="mouse")gC(e);MG=mHit(e.clientX,e.clientY);if(MG<0)MG=null};
g.onpointermove=e=>{gC(e);const q=GP[e.pointerId];if(!q)return g.classList.toggle("mh",mHit(e.clientX,e.clientY)>=0);
if(MG!=null){gm+=Math.abs(e.clientX-q.x)+Math.abs(e.clientY-q.y);q.x=e.clientX;q.y=e.clientY;const p=gll(e);if(p){MS[MG]=[p.x,p.y,p.z];msU()}return}const o=two(GP),dx=e.clientX-q.x,dy=e.clientY-q.y;q.x=e.clientX;q.y=e.clientY;gm+=Math.abs(dx)+Math.abs(dy);
if(o){const n=two(GP);gT=cl(gT*o.d/n.d);gm=99;at(n.x,n.y)}else{const s=2*(gD-1)*SC/GH,t=performance.now(),dt=Math.max(t-gt0,8)/1e3;gt0=t;ya+=dx*s;pa=Math.min(1.4,Math.max(-1.4,pa+dy*s));gv=[gv[0]*.4+dx*s/dt*.6,gv[1]*.4+dy*s/dt*.6]}};
g.onpointerup=g.onpointercancel=e=>{const one=GP[e.pointerId]&&Object.keys(GP).length==1;delete GP[e.pointerId];if(!Object.keys(GP).length)g.classList.remove("dr");if(MG!=null){MG=null;if(gm>4)return gv=[0,0]}if(performance.now()-gt0>80||gm>=99)gv=[0,0];
if(!one||gm>=6||e.type!="pointerup")return;gv=[0,0];const t=Date.now(),q=gll(e);
if(MON){const r=g.getBoundingClientRect();return msTap(q&&[q.x,q.y,q.z],MS.map(v=>{const p=gp(v);return p&&[r.left+p[0],r.top+p[1]]}),e.clientX,e.clientY)}
if(t-gtap<300){gtap=0;anc=null;if(q)fly={y:Math.atan2(-q.x,q.z),p:Math.min(1.4,Math.max(-1.4,Math.atan2(q.y,Math.hypot(q.x,q.z))))};gT=cl(gT/1.8);return} // double click: fly there and zoom in
gtap=t;const m=D.elementFromPoint(e.clientX,e.clientY)?.closest("#gw [data-m]");if(m)return pickM(+m.dataset.m);pick(q&&hit(q.mx,q.my))};
g.onlostpointercapture=e=>{delete GP[e.pointerId];if(!Object.keys(GP).length)g.classList.remove("dr")};
g.onwheel=e=>{e.preventDefault();fly=null;gT=cl(gT*Math.exp(e.deltaY*.0015));at(e.clientX,e.clientY);rq()};
return 1}
function dr(){if(tdirty){tdirty=0;tx()}
const w=GW,h=GH,r=Math.min(devicePixelRatio||1,2),cw=Math.round(w*r),ch=Math.round(h*r);
if(gc.width!=cw||gc.height!=ch){gc.width=go.width=cw;gc.height=go.height=ch}
gl.viewport(0,0,cw,ch);AS=w/h;SC=.364*Math.max(1,1/AS);
const Lv=rx(ry(SW,ya),pa),Lo=ry(SW,-sa),dw=[tm*CLOUD[0]%1,0,(.37-tm*CLOUD[1])%1,0]; // sun direction in view / planet space, cloud drift
gl.disable(gl.BLEND);gl.useProgram(bp);gl.bindBuffer(gl.ARRAY_BUFFER,tb);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,0,0,0);gl.disableVertexAttribArray(1);
gl.uniform3f(bp.u.u,gD,AS,SC);gl.uniform2f(bp.u.a,ya,pa);gl.uniform3f(bp.u.S,...Lv);gl.drawArrays(gl.TRIANGLES,0,3);
gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.bindBuffer(gl.ARRAY_BUFFER,pb);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,eb);
gl.vertexAttribPointer(0,3,gl.FLOAT,0,20,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,0,20,12);
for(const [q,R] of [[pp,1],[sp,1.012]]){gl.useProgram(q);gl.uniform3f(q.u.u,gD,AS,SC);gl.uniform2f(q.u.a,ya+sa,pa);gl.uniform1f(q.u.R,R);gl.uniform1f(q.u.d,gD);
gl.uniform3f(q.u.L,...Lv);gl.uniform3f(q.u.Lo,...Lo);gl.uniform4f(q.u.cw,...dw);gl.drawElements(gl.TRIANGLES,27648,gl.UNSIGNED_SHORT,0)}
if(Lv[2]<-.02){ // sun in front of the camera: lens flare, hidden when the planet covers the sun
const t=-gD*Lv[2],px=t*Lv[0],py=t*Lv[1],pz=gD+t*Lv[2],vis=Math.min(1,Math.max(0,(Math.hypot(px,py,pz)-1)/.05)),
sx=Lv[0]/-Lv[2]/(SC*AS),sy=Lv[1]/-Lv[2]/SC,on=vis*Math.max(0,1-Math.hypot(sx,sy)/2.5);
if(on>0){gl.blendFunc(gl.ONE,gl.ONE);gl.useProgram(fp);gl.bindBuffer(gl.ARRAY_BUFFER,tb);gl.vertexAttribPointer(0,2,gl.FLOAT,0,0,0);gl.disableVertexAttribArray(1);
gl.uniform3f(fp.u.u,gD,AS,SC);gl.uniform3f(fp.u.S2,sx,sy,on);gl.drawArrays(gl.TRIANGLES,0,3)}}
gO(w,h,r);gF(w,h)}
function tx(){ // rebuild the globe texture: base map, country colours, borders, graticule, selection (names float above it: gL)
const S=tc.width,Sh=S/2,s=S/W,o=tx2;
o.drawImage(bc,0,0);
if(CO){o.save();o.scale(s,s);o.globalAlpha=.28;RG.forEach(r=>{if(r!=R[sel]){o.fillStyle=r.c;o.fill(path(r),"evenodd")}});o.restore()} // light tint; the colour bands are vector (gO)
if(cv.b)o.drawImage(bb,0,0);
o.strokeStyle="#00000059";o.lineWidth=2;o.beginPath();for(let i=1;i<24;i++){o.moveTo(i*S/24,0);o.lineTo(i*S/24,Sh)}for(let i=1;i<12;i++){o.moveTo(0,i*Sh/12);o.lineTo(S,i*Sh/12)}o.stroke();
o.strokeStyle="#000000b3";o.lineWidth=3;o.beginPath();o.moveTo(S/2,0);o.lineTo(S/2,Sh);o.moveTo(0,Sh/2);o.lineTo(S,Sh/2);o.stroke();
if(sel){const q=path(R[sel]),d=new Path2D;d.rect(0,0,W,H);d.addPath(q);o.save();o.scale(s,s);o.lineJoin="round";
o.fillStyle="#04040a";o.globalAlpha=.5;o.fill(d,"evenodd");o.restore()}
gL();
gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,tc);gl.generateMipmap(gl.TEXTURE_2D);
}
function at(cx,cy){const q=gll({clientX:cx,clientY:cy}),r=g.getBoundingClientRect();anc=q&&{p:[q.x,q.y,q.z],x:cx-r.left,y:cy-r.top}} // zoom anchor
function gC(e){const q=gll(e);if(q){lx=q.mx;ly=q.my;showC()}} // coordinates under the cursor, as on the flat map
function gll(e){ // screen point -> planet point {x,y,z} and map point {mx,my}; null off the globe
const r=GR,nx=(e.clientX-r.left)/r.width*2-1,ny=1-(e.clientY-r.top)/r.height*2,dx=nx*SC*AS,dy=ny*SC,a=dx*dx+dy*dy+1,b=-2*gD,cc=gD*gD-1,f=b*b-4*a*cc;
if(f<0)return null;
const t=(-b-Math.sqrt(f))/(2*a),X=dx*t,Y=dy*t,Z=gD-t,cp=Math.cos(pa),sp=Math.sin(pa),cy=Math.cos(ya+sa),sy=Math.sin(ya+sa),
y1=cp*Y+sp*Z,z1=-sp*Y+cp*Z,qx=cy*X-sy*z1,qz=sy*X+cy*z1;return{x:qx,y:y1,z:qz,mx:(Math.atan2(qx,qz)/6.2832+.5)*W,my:(.5-Math.asin(y1)/3.1416)*H}}
function gL(){ // floating names (as in Google Earth): screen-aligned, constant size, above the clouds; rebuilt only when names or markers change
const it=[];
RG.forEach(r=>{const a=glyphs(r);if(!a)return;const c=COU[r.c]||{};it.push({c:1,t:a.t,s:a.s,o:a.o??1,k:c.lk||0,lo:((ru()?r.xr:r.x)+(c.lx||0))/W*360-180,la:90-a.y/H*180})});
MK.forEach((q,i)=>{if(mOn(q))it.push({m:i,q,t:mn(q),lo:q.o,la:q.a})});
const sg=JSON.stringify(it);
if(sg!=gsig){gsig=sg;GI=it;
gw.innerHTML=it.map(e=>e.c?`<div class="gh"><span class="cn" style="letter-spacing:${(.08+e.k).toFixed(3)}em">${esc(e.t)}</span></div>`
:`<div class="gh" data-m="${e.m}"><i><svg viewBox="-11 -11 22 22"><path fill-rule="evenodd" d="${SH[e.q.k|0]||SH[0]}"/></svg><b${e.q.k==1?' class="d"':""}${e.q.f=="cap"?' data-c':""}>${esc(e.t)}</b></i></div>`).join("");
[...gw.children].forEach((d,j)=>{const e=it[j],la=e.la*Math.PI/180,lo=e.lo*Math.PI/180;e.d=d;e.w=d.firstChild.offsetWidth;e.h=d.firstChild.offsetHeight;e.p=[Math.cos(la)*Math.sin(lo),Math.sin(la),Math.cos(la)*Math.cos(lo)]});
GO=[...it].sort((a,b)=>(b.c?1e3+b.s:-(b.q.z|0))-(a.c?1e3+a.s:-(a.q.z|0)))} // big country names first, then markers by importance
GI.forEach(e=>e.m!=null&&e.d.classList.toggle("s",e.m===ms))}
function gpt(r){ // country outline as points on the unit sphere (cached per shape); long edges split so they follow the curve
if(r.g)return r.g;const t=r.d.match(/[a-zA-Z]|-?[\d.]+/g),G=r.g=[],u=(X,Y)=>{const lo=X/W*6.2832-3.1416,la=1.5708-Y/H*3.1416;q.push(Math.cos(la)*Math.sin(lo),Math.sin(la),Math.cos(la)*Math.cos(lo))},
pt=(X,Y)=>{const k=Math.ceil(Math.hypot(X-x,Y-y)/8);for(let j=1;j<=k;j++)u(x+(X-x)*j/k,y+(Y-y)*j/k);x=X;y=Y};
let i=0,c,x=0,y=0,q,x0=0,y0=0,n=()=>+t[i++];
while(i<t.length){if(/[a-zA-Z]/.test(t[i]))c=t[i++];
if(c=="M"||c=="m"){x=x0=n()+(c=="m"?x:0);y=y0=n()+(c=="m"?y:0);G.push(q=[]);u(x,y);c=c=="m"?"l":"L"}
else if(c=="l")pt(x+n(),y+n());else if(c=="L")pt(n(),n());else if(c=="h")pt(x+n(),y);else if(c=="H")pt(n(),y);else if(c=="v")pt(x,y+n());else if(c=="V")pt(x,n());
else if(c=="z"||c=="Z"){pt(x0,y0);c=""}else i++}
let a=0,b=0,e=0;G.flat().forEach((v,j)=>j%3==0?a+=v:j%3==1?b+=v:e+=v);const l=Math.hypot(a,b,e)||1;r.cn=[a/l,b/l,e/l];return G}
function gp(v){ // planet point -> screen px in the globe view (null on the far side)
const w=GW,h=GH,Y=ya+sa,c=Math.cos(Y),s=Math.sin(Y),e=Math.cos(pa),f=Math.sin(pa),x1=c*v[0]+s*v[2],z1=-s*v[0]+c*v[2],y2=e*v[1]-f*z1,z2=f*v[1]+e*z1;
if(z2<1/gD)return null;const dp=gD-z2;return[(x1/(SC*AS)/dp+1)*w/2,(1-y2/SC/dp)*h/2]}
function gO(w,h,r){ // vector country edges above the globe, as on the flat map: colour bands inside the borders, selection glow + 2 px line; crisp at any zoom
const o=go.getContext("2d");o.setTransform(r,0,0,r,0,0);o.clearRect(0,0,w,h);
const Y=ya+sa,c=Math.cos(Y),s=Math.sin(Y),e=Math.cos(pa),f=Math.sin(pa),hz=1/gD,Rp=h/(2*SC*Math.sqrt(gD*gD-1)),Lo=ry(SW,-sa),S0=R[sel];
o.lineJoin=o.lineCap="round";
const pr=(rg,clip)=>{const P=new Path2D,C=clip&&new Path2D;let any=0; // P: visible edges only; C: area for clipping, hidden points pushed onto the planet's rim
for(const q of gpt(rg)){let on=0;for(let i=0;i<q.length;i+=3){const x1=c*q[i]+s*q[i+2],z1=-s*q[i]+c*q[i+2],y2=e*q[i+1]-f*z1,z2=f*q[i+1]+e*z1;
if(z2<hz){on=0;if(C){const l=Math.hypot(x1,y2)||1;C[i?"lineTo":"moveTo"](w/2+x1/l*Rp,h/2-y2/l*Rp)}continue}
const dp=gD-z2,X=(x1/(SC*AS)/dp+1)*w/2,V=(1-y2/SC/dp)*h/2;on?P.lineTo(X,V):P.moveTo(X,V);if(C)C[i?"lineTo":"moveTo"](X,V);on=any=1}C?.closePath()}
return any&&[P,C]};
if(CO)for(const rg of RG){if(rg==S0)continue;const a=pr(rg,1);if(!a)continue;const n=rg.cn,d=n[0]*Lo[0]+n[1]*Lo[1]+n[2]*Lo[2];
o.save();o.clip(a[1],"evenodd");o.globalAlpha=.85*Math.min(1,Math.max(.2,.6+d*2));o.strokeStyle=rg.c;o.lineWidth=7;o.stroke(a[0]);o.restore()} // dimmer on the night side
const a=S0&&pr(S0);if(a){o.strokeStyle="#e8e8e0";o.globalAlpha=.22;o.lineWidth=7;o.stroke(a[0]);o.globalAlpha=1;o.lineWidth=2;o.stroke(a[0])}
sbU(RE*2*SC*(gD-1)/h);if(!MS.length)return; // measured route, as on the flat map
const P=new Path2D;for(const q of MP){let on=0;for(const v of q){const p=gp(v);if(!p){on=0;continue}on?P.lineTo(...p):P.moveTo(...p);on=1}}
o.strokeStyle="#000a";o.lineWidth=5;o.stroke(P);o.strokeStyle="#e8e8e0";o.lineWidth=2;o.stroke(P);o.font='400 13px "Exo 2",sans-serif';o.textBaseline="middle";
MS.forEach((v,i)=>{const p=gp(v);if(!p)return;o.beginPath();o.arc(p[0],p[1],4.5,0,6.2832);o.fillStyle="#e8e8e0";o.fill();o.lineWidth=1.5;o.strokeStyle="#000";o.stroke();
if(i){const t=km(MD[i]),l=p[0]>w-140;o.textAlign=l?"right":"left";o.lineWidth=3;o.strokeStyle="#000b";o.strokeText(t,p[0]+(l?-9:9),p[1]-10);o.fillText(t,p[0]+(l?-9:9),p[1]-10)}})}
function gF(w,h){ // per frame: project names, fade at the horizon, hide by zoom and where they would overlap a more important one
const Y=ya+sa,c=Math.cos(Y),s=Math.sin(Y),e=Math.cos(pa),f=Math.sin(pa),zl=Math.PI/(2*SC*(gD-1)),hz=1/gD,pr=Math.PI/H*h/2/SC,mx=Math.min(20,Math.max(13,Math.min(w,h)/28)),B=[],sel=GO.find(q=>q.m===ms);
for(const q of sel?[sel,...GO.filter(v=>v!=sel)]:GO){const[px,py,pz]=q.p,x1=c*px+s*pz,z1=-s*px+c*pz,y2=e*py-f*z1,z2=f*py+e*z1,dp=gD-z2,
X=(x1/(SC*AS)/dp+1)*w/2,V=(1-y2/SC/dp)*h/2,al=Math.min(1,Math.max(0,(z2-hz)/.12)),fs=q.c?Math.round(Math.min(mx,Math.max(10,q.s*pr/dp))*2)/2:0,sc=fs/20,
bx=q.c?[X-q.w*sc/2-4,V-q.h*sc/2,X+q.w*sc/2+4,V+q.h*sc/2]:[X-11,V-10,X-11+q.w+4,V+10];
const g=q.on?3:0; // a shown name yields only to a clear overlap: no flicker at the edge
let on=al>.05&&(q.c||!far(q.q,zl))&&!B.some(b=>b[0]<bx[2]-g&&bx[0]+g<b[2]&&b[1]<bx[3]-g&&bx[1]+g<b[3]);if(on)B.push(bx);
q.d.style.transform=`translate(${Math.round(X)}px,${Math.round(V)}px)`; // whole pixels and real font sizes: text does not shimmer
if(q.c&&q.fs!==fs)q.d.firstChild.style.fontSize=(q.fs=fs)+"px";
const o=(al*(q.o??1)).toFixed(2);if(q.ov!==o)q.d.style.opacity=q.ov=o;if(q.on!==on)q.d.classList.toggle("gh",!(q.on=on))}}
function sw(){const gr=g.getBoundingClientRect(),q=G&&SC&&gr.width&&gll({clientX:gr.left+gr.width/2,clientY:gr.top+gr.height/2}); // globe centre, read while the globe is still shown
cancelAnimationFrame(fr);G=!G;D.body.classList.toggle("g",G);zg.textContent=G?"2D":"3D";sz();const cw=VW,ch=VH; // the view stays on the same place at a similar scale
if(G){const lo=(cw/2-x)/k/W*6.2832-3.1416,la=1.5708-(ch/2-y)/k/H*3.1416,sc=.364*Math.max(1,GH/GW);ya=-lo-sa;pa=Math.min(1.4,Math.max(-1.4,la));gv=[0,0];fly=anc=null;gD=gT=cl(1+Math.PI/(2*sc*k/fit()));gB()}
else{if(q&&isFinite(q.mx+q.my)){k=Math.min(Math.max(Math.PI/(2*SC*(gD-1))*fit(),fit()),kmax());x=cw/2-q.mx*k;y=ch/2-q.my*k}set()}}
function gB(){ // borders of the current version for the globe texture
const v=cv;if(!v.b)return tq();const i=new Image;i.onload=()=>{if(v!=cv)return;const o=bb.getContext("2d");o.clearRect(0,0,bb.width,bb.height);o.drawImage(i,0,0,bb.width,bb.height);tq()};i.src=bsrc(2)} // 4096 px level = globe texture size
zg.onclick=()=>{if(gl)return sw();if(busy)return;busy=1;ld.hidden=false;zg.setAttribute("aria-busy","true");const i=new Image,done=()=>{busy=0;ld.hidden=true;zg.removeAttribute("aria-busy")};i.onerror=done;
i.onload=()=>Promise.all([D.fonts.load("20px A"),D.fonts.load("20px Play")]).then(()=>new Promise(r=>requestAnimationFrame(()=>setTimeout(r)))).then(()=>{if(gi(i)){FD=done;sw()}else done()}); /* the spinner stays until the first globe frame is drawn (shaders compile on the first draw) */i.src=U+"map/g2.webp"}; // 4096 px level
