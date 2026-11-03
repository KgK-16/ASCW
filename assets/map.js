// ASCW world map: flat raster + SVG viewer, timeline overlay and WebGL globe.
// Globals injected by layouts/map/list.html: U (base URL), V (map versions: [{y:year,b:has borders,r:[countries]}]), MK (markers), EV (timeline events),
// COU (country names/texts by hex colour, edited on the site). window.MAP is the hook for the site editor (assets/edit.js).
// Layers: geographic base (static/map/g*.webp) < country colours: light tint + inner colour band (canvas, toggleable) < country shapes for clicks/hover (svg) < borders of the version (static/map/<year>/b*.webp)
// < selection: everything else dimmed, outline on top < graticule, labels, markers.
const D=document,HT=D.documentElement,$=i=>D.getElementById(i),
[m,c,im,ov,sv,bi,hl,sl,mw,gx,g,p,pt,px,tl,xt,ty,tw,tz,tr,zg,zt,zc,zi,zo,pc,ld,zm,zk,sb,mz]="m c im ov sv bi hl sl mw gx g p pt px tl xt ty tw tz tr zg zt zc zi zo pc ld zm zk sb mz".split(" ").map($),
W=4096,H=2048,T0=320,T1=420, // visible timeline range
SH=["M-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0z","M0-10L10 0 0 10-10 0zM0-7L7 0 0 7-7 0zM-3.6 0a3.6 3.6 0 1 0 7.2 0a3.6 3.6 0 1 0-7.2 0z"], // marker shapes by kind (k): circle, circle in a diamond (capital)
HM={en:["N","S","E","W"],ru:[" с. ш."," ю. ш."," в. д."," з. д."]},
P={},hc=D.createElement("canvas").getContext("2d"),ox=ov.getContext("2d"),
cq=Object.assign(c.cloneNode(false),{id:"",hidden:true}), // the world repeats east and west: a second copy of the map layers, shown only where the seam is in view
wx=v=>(v%W+W)%W; // map x wrapped into the world
c.after(cq);cq.setAttribute("aria-hidden","true");
let FG=null,cqd=1,MR,GR,VW=0,VH=0,ZW=0,GW=0,GH=0,GX=[],ovK,cdr=0,MG=null,MON=0,MS=[],MP=[],MD=[0],sbK,fv=null,fdc=8,fa=0,fl0=0,HS=[],vD=0,vT=0,fan=null,ffl=null,k=1,kk,mvT,raf,an,ms=null,x=0,y=0,lv=-1,sel=null,yr=420,cv,RG=[],R={},CO=1,CP,CT="—",fl=0,lx,ly,mv=0,tap=0,PY=0,G=0;
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
function load(el,src){el._s=src;const i=new Image;i.src=src;i.decode().then(()=>{if(el._s==src){el.src=src;cqd=1;set()}},()=>{})} // decode off the main thread, then swap

// ---- flat map ----
const fit=()=>Math.max(VH/H,VW/W), // the world fills the height and at least the width, so each place is on screen at most once
kmax=()=>Math.max(2.5,fit()); // closest zoom: 2.5 screen px per map px
function set(anim){
if(!isFinite(k+x+y)){k=fit();x=y=0} // never keep a broken view
k=Math.min(Math.max(k,fit()),kmax());
const w=W*k,h=H*k,ch=VH;
x-=w*Math.ceil(x/w); // no east / west edge: x stays in (-w, 0], the copy covers the rest
y=h<ch?(ch-h)/2:Math.min(0,Math.max(ch-h,y));
an=anim;if(!raf)raf=requestAnimationFrame(apply); // at most one DOM update per frame
const n=W*k*devicePixelRatio,l=n>4500?3:n>2200?2:n>1100?1:0; // image levels 1024/2048/4096/8192 px
if(!FG&&l>lv){if(lv<0&&l)im.src=U+"map/g0.webp"; // light preview while the sharp level loads
lv=l;load(im,U+`map/g${l}.webp`);lvB()}}
function lvB(){if(FG)return fgB();if(lv<0)return;bi.hidden=!cv.b;cqd=1;if(cv.b)load(bi,bsrc(lv))}
function apply(){raf=0;fdr();posM();c.classList.toggle("t",!!an);mw.classList.toggle("t",!!an);c.style.transform=`translate(${x}px,${y}px) scale(${k})`;
const sq=x+W*k<VW;if(sq){if(cqd)cqS();cq.className=c.className;cq.style.transform=`translate(${x+W*k}px,${y}px) scale(${k})`}if(cq.hidden==sq)cq.hidden=!sq;
c.classList.add("mv");clearTimeout(mvT);mvT=setTimeout(rest,250)} // while moving: GPU layer only, no restyle/repaint
function rest(){c.classList.remove("mv");cq.classList.remove("mv");if(k!=kk){c.style.setProperty("--k",kk=k);cq.style.setProperty("--k",k)}}
function cqS(){cqd=0;cq.innerHTML=c.innerHTML;cq.querySelectorAll("[id]").forEach(e=>e.removeAttribute("id"));if(!FG)cq.querySelector("canvas").getContext("2d").drawImage(ov,0,0)} // refresh the copy (only after the map layers changed, and only when it is in view) // after: zoom-dependent widths, crisp re-raster
// Flat map controls, built on the globe's: zoom is kept as a camera distance (vD) with the globe's mapping to scale, sensitivity and easing,
// so a wheel notch, a button press or a double click zooms the same way and as smoothly in 2D as in 3D.
const fsc=()=>.364*Math.max(1,VH/VW), // the globe's view constant for this window
kOf=v=>Math.PI/(2*fsc()*(v-1))*fit(),vOf=q=>1+Math.PI*fit()/(2*fsc()*q), // camera distance <-> flat scale (same as when switching 2D / 3D)
vcl=v=>Math.min(vOf(fit()),Math.max(vOf(kmax()),v)), // the flat map's own zoom limits
zst=()=>{if(Math.abs(vT-vD)<1e-4)vD=vT=vOf(k)}, // start a zoom from the current scale unless one is still easing
fgo=()=>{if(!fa){fl0=0;fa=requestAnimationFrame(fmo)}},fst=()=>{cancelAnimationFrame(fa);fa=fl0=0;fv=fan=ffl=null;vT=vD}, // start / stop the motion loop
wd=e=>e.deltaY*(e.deltaMode==1?33:e.deltaMode==2?VH:1); // wheel delta in px whatever the browser reports
function fmo(t){ // one frame of flat-map motion (as the globe's mo): eased zoom around an anchor, fly to a double-clicked point, glide
const dt=Math.min(fl0&&t>fl0?(t-fl0)/1e3:1/60,.05);fl0=t;fa=0;let on=0;
if(Math.abs(vT-vD)>1e-3){vD+=(vT-vD)*Math.min(1,dt*8);const k2=kOf(vD),a=ffl?{mx:ffl.mx,my:ffl.my,sx:x+ffl.mx*k,sy:y+ffl.my*k}:fan||{mx:(VW/2-x)/k,my:(VH/2-y)/k,sx:VW/2,sy:VH/2};
k=k2;x=a.sx-a.mx*k;y=a.sy-a.my*k;set();on=1}else{vD=vT;fan=null} // the anchor point stays under the cursor
if(ffl){const f=Math.min(1,dt*5),w=W*k,e0=VW/2-x-ffl.mx*k,ex=e0-w*Math.round(e0/w),ey=VH/2-y-ffl.my*k,x0=x,y0=y;x+=ex*f;y+=ey*f;set();if(Math.hypot(ex,ey)<.5||(!on&&Math.abs(x-x0)+Math.abs(y-y0)<.01))ffl=null;else on=1} // at the map's edge it stops where it can
if(fv){x+=fv[0]*dt;y+=fv[1]*dt;set();const d=Math.exp(-dt*fdc);fv=[fv[0]*d,fv[1]*d];if(Math.hypot(...fv)<12)fv=null;else on=1}
if(on)fa=requestAnimationFrame(fmo);else fl0=0}
function fz(f,cx,cy){zst();vT=vcl(vT*f);fv=null;ffl=null;fan=cx==null?null:{mx:(cx-x)/k,my:(cy-y)/k,sx:cx,sy:cy};fgo()} // zoom by a distance factor, towards a screen point or the centre
// The flat map's pictures (relief, country colours, borders) are drawn by WebGL as mipmapped textures, like the globe: panning and zooming
// only move a camera, nothing is decoded or re-rasterised (huge <img> layers did that and froze); the world repeats east-west by itself.
// Without WebGL the <img> / <canvas> layers inside #c are used instead.
function fgI(){const e=$("fcv"),f=e&&e.getContext("webgl",{alpha:false,antialias:false});if(!f)return;
const sh=(t,src)=>{const o=f.createShader(t);f.shaderSource(o,src);f.compileShader(o);return o},q=f.createProgram();
f.attachShader(q,sh(f.VERTEX_SHADER,"attribute vec2 g;void main(){gl_Position=vec4(g,0.,1.);}"));
f.attachShader(q,sh(f.FRAGMENT_SHADER,"#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\nuniform sampler2D T;uniform sampler2D B;uniform sampler2D O;uniform vec4 V;uniform vec2 S;uniform float co;"+
"void main(){vec2 p=vec2(gl_FragCoord.x,S.y-gl_FragCoord.y)/V.w,u=vec2((p.x-V.x)/(V.z*4096.),(p.y-V.y)/(V.z*2048.));vec4 o=texture2D(O,u)*co;gl_FragColor=vec4((texture2D(T,u).rgb*(1.-o.a)+o.rgb)*(1.-texture2D(B,u).a),1.);}"));
f.bindAttribLocation(q,0,"g");f.linkProgram(q);if(!f.getProgramParameter(q,f.LINK_STATUS))return;f.useProgram(q);
f.bindBuffer(f.ARRAY_BUFFER,f.createBuffer());f.bufferData(f.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),f.STATIC_DRAW);f.enableVertexAttribArray(0);f.vertexAttribPointer(0,2,f.FLOAT,0,0,0);
const MX=f.getParameter(f.MAX_TEXTURE_SIZE),A=f.getExtension("EXT_texture_filter_anisotropic"),
nt=(u,fm,px)=>{f.activeTexture(f.TEXTURE0+u);const t=f.createTexture();f.bindTexture(f.TEXTURE_2D,t);f.texParameteri(f.TEXTURE_2D,f.TEXTURE_MIN_FILTER,f.LINEAR_MIPMAP_LINEAR);
f.texParameteri(f.TEXTURE_2D,f.TEXTURE_WRAP_S,f.REPEAT);f.texParameteri(f.TEXTURE_2D,f.TEXTURE_WRAP_T,f.CLAMP_TO_EDGE); // REPEAT: the endless east-west world
if(A)f.texParameterf(f.TEXTURE_2D,A.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,f.getParameter(A.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
f.texImage2D(f.TEXTURE_2D,0,fm,1,1,0,fm,f.UNSIGNED_BYTE,new Uint8Array(px));f.generateMipmap(f.TEXTURE_2D);f.uniform1i(f.getUniformLocation(q,"TBO"[u]),u);return t};
FG={f,e,V:f.getUniformLocation(q,"V"),S:f.getUniformLocation(q,"S"),co:f.getUniformLocation(q,"co"),T:nt(0,f.RGB,[21,33,57,0]),B:nt(1,f.ALPHA,[0,0,0,0]),O:nt(2,f.RGBA,[0,0,0,0]),
lv:MX>=8192&&!(matchMedia("(pointer:coarse)").matches&&(navigator.deviceMemory||4)<6)?3:2}; // 8192 px where the device can hold it
e.addEventListener("webglcontextlost",()=>{FG=null;m.classList.remove("fg");lv=-1;cqd=1;set();lvB();drawOv()}); // GPU reset: back to the picture layers
m.classList.add("fg");
const bm=src=>fetch(src).then(r=>r.blob()).then(b=>createImageBitmap(b)); // decoded off the main thread
bm(U+"map/g1.webp").then(i=>{fgT(i);return FG&&bm(U+`map/g${FG.lv}.webp`)}).then(i=>i&&idle(()=>fgT(i)),()=>{})} // quick level first, then the sharp one
function idle(fn){(function t(){fa||raf||Object.keys(P).length?setTimeout(t,150):fn()})()} // big texture uploads wait until the map is still, so they never stall a movement
function fgT(i){if(!FG)return i.close?.();const f=FG.f;f.activeTexture(f.TEXTURE0);f.bindTexture(f.TEXTURE_2D,FG.T);f.texImage2D(f.TEXTURE_2D,0,f.RGB,f.RGB,f.UNSIGNED_BYTE,i);f.generateMipmap(f.TEXTURE_2D);i.close?.();fdr()}
function fgB(){if(!FG)return;const v=cv; // borders of the version, the site's own levels as mipmaps (thin lines stay visible zoomed out)
if(!v.b)return mipA(FG.f,FG.B,1,[]),fdr();Promise.all(Array.from({length:FG.lv+1},(_,j)=>fetch(bsrc(FG.lv-j)).then(r=>r.blob()).then(b=>createImageBitmap(b)))).then(a=>idle(()=>{if(FG&&v==cv){mipA(FG.f,FG.B,1,a);fdr()}a.forEach(i=>i.close?.())}),()=>{})}
function fgO(){if(!FG)return;const f=FG.f;f.activeTexture(f.TEXTURE2);f.bindTexture(f.TEXTURE_2D,FG.O);f.pixelStorei(f.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true); // country colours: redrawn only when they change
f.texImage2D(f.TEXTURE_2D,0,f.RGBA,f.RGBA,f.UNSIGNED_BYTE,ov);f.pixelStorei(f.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);f.generateMipmap(f.TEXTURE_2D);fdr()}
function fdr(){if(!FG||G)return;const f=FG.f,r=Math.min(devicePixelRatio||1,2),w=Math.round(VW*r),h=Math.round(VH*r); // one frame: a single full-screen triangle
if(FG.e.width!=w||FG.e.height!=h){FG.e.width=w;FG.e.height=h}f.viewport(0,0,w,h);f.uniform4f(FG.V,x,y,k,w/VW);f.uniform2f(FG.S,w,h);f.uniform1f(FG.co,CO?1:0);f.drawArrays(f.TRIANGLES,0,3)}
function mipA(f,t,u,im){ // alpha texture whose mipmaps are the given levels, smaller ones drawn from the last
f.activeTexture(f.TEXTURE0+u);f.bindTexture(f.TEXTURE_2D,t);const A=f.ALPHA,T2=f.TEXTURE_2D,UB=f.UNSIGNED_BYTE;
if(!im.length){f.texImage2D(T2,0,A,1,1,0,A,UB,new Uint8Array(1));f.generateMipmap(T2)}
else{let l=0,pv;for(const i of im)f.texImage2D(T2,l++,A,A,UB,pv=i);let w=pv.width,h=pv.height;
while(w>1||h>1){w=Math.max(1,w>>1);h=Math.max(1,h>>1);const e=D.createElement("canvas");e.width=w;e.height=h;e.getContext("2d").drawImage(pv,0,0,w,h);f.texImage2D(T2,l++,A,A,UB,pv=e)}}
f.activeTexture(f.TEXTURE0)}
function zoom(f,px,py,anim){const k2=Math.min(Math.max(k*f,fit()),kmax());x=px-(px-x)*k2/k;y=py-(py-y)*k2/k;k=k2;set(anim)}

function rs(){ // (re)build the SVG overlays: country shapes, graticule, labels
let s="",q="",l="",t="";
for(let i=-180;i<=180;i+=15){const X=(i+180)/360*W;q+=`<path${i?"":' class="e"'} d="M${X} 0V${H}"/>`;if(i%30==0&&i<180)l+=`<span data-o="${i}">${deg(i)}</span>`}
for(let i=-75;i<=75;i+=15){const Y=(90-i)/180*H;q+=`<path${i?"":' class="e"'} d="M0 ${Y}H${W}"/>`;if(i%30==0)l+=`<span data-a="${i}">${deg(i,1)}</span>`}
RG.forEach(r=>{s+=`<path style="--c:${r.c}" fill-rule="evenodd" d="${r.d}"/>`;const a=glyphs(r);
if(a)t+=`<text data-i="${r.id}"${a.o!=null?` opacity="${a.o}"`:""} x="${a.xs.map(v=>v.toFixed(1)).join(" ")}" y="${a.y}" font-size="${a.s}">${a.t}</text>`});
sv.innerHTML=s;sl.innerHTML=`<g class="gr">${q}</g><g class="lb">${t}</g>`;cqd=1;gx.innerHTML=l;GX=[...gx.children].map(e=>({e,o:e.dataset.o!=null?+e.dataset.o:null,a:+e.dataset.a}));posM();hi()}
function hi(){ // selection layer above the borders: the rest of the map is dimmed, the country keeps its own relief colours
const r=sel&&R[sel],key=CO+"|"+sel+"|"+cv?.y;if(key==ovK)return;ovK=key; // nothing changed: skip the costly redraws (also of the globe texture)
cqd=1;if(VW)set();hl.innerHTML=r?`<path class="dm" fill-rule="evenodd" d="M0 0H${W}V${H}H0z${r.d}"/><path class="gw" d="${r.d}"/><path class="ol" d="${r.d}"/>`:"";
drawOv()}
function drawOv(){ // country colours as one raster layer (cheap to pan/zoom): light tint + inner colour band; the selected country keeps pure relief
cqd=1;if(CO){const o=ox;o.clearRect(0,0,W,H);o.lineJoin="round";
RG.forEach(r=>{const q=path(r);o.globalAlpha=r==R[sel]?0:.28;o.fillStyle=r.c;o.fill(q,"evenodd");o.save();o.clip(q,"evenodd");o.globalAlpha=.85;o.strokeStyle=r.c;o.lineWidth=14;o.stroke(q);o.restore()});o.globalAlpha=1;fgO()}
if(G)tq()}
// markers live outside the zoomed layer and are re-positioned each frame, so icons and names stay crisp vectors at any zoom
// marker: {o lon, a lat, n / r name EN / RU, k kind, f font, ten / tru text, y0 / y1 years shown, z importance: 0 always, 1 from medium zoom, 2 close-up only}
const mOn=q=>!(q.y0!=null&&yr<q.y0)&&!(q.y1!=null&&yr>q.y1),
far=(q,zl=k/fit())=>(q.z==1&&zl<2.2)||(q.z==2&&zl<4.5),
drawM=()=>{mw.innerHTML=MK.map((q,i)=>`<g data-m="${i}"${mOn(q)?"":" hidden"} class="${far(q)?"z":""}${i===ms?" s":""}"><path fill-rule="evenodd" d="${SH[q.k|0]||SH[0]}"/><text x="${q.k==1?15:12}" y="1"${q.f=="cap"?' class="c"':""}>${esc(mn(q))}</text></g>`).join("");posM();if(G)GI.forEach(e=>e.m!=null&&e.d.classList.toggle("s",e.m===ms))},
posM=()=>{const zl=k/fit();[...mw.children].forEach((e,i)=>{const q=MK[i];if(!q)return;{const w=W*k,X=x+(q.o+180)/360*w;e.style.transform=`translate(${X-w*Math.floor((X+40)/w)}px,${y+(90-q.a)/180*H*k}px)`}
e.classList.toggle("z",far(q,zl))});drawMz();if(!G)sbU(k/fit(),kmax()/fit(),2*Math.PI*RE*Math.max(.02,Math.cos(Math.min(1.5,Math.abs(Math.PI/2-(VH/2-y)/k/H*Math.PI))))/(W*k));
// graticule labels: light, pinned to the top / left edge of the view, hidden under the button column
const t0=Math.max(y,0)+6,l0=Math.max(x,0)+6,xr=VW-ZW-82,yb=VH-30; // sizes are cached (sz): no layout reads while the map moves
for(const q of GX){let X,Y,hd;if(q.o!=null){const w=W*k;X=x+(q.o+180)/360*w+4;X-=w*Math.floor(X/w);Y=t0;hd=X<l0+40||X>xr}else{X=l0;Y=y+(90-q.a)/180*H*k-18;hd=Y<t0+18||Y>yb}
q.e.style.transform=`translate(${X}px,${Y}px)`;if(q.h!==hd)q.e.hidden=q.h=hd}},
esc=t=>String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;"),
RE=6371, // the planet is Earth-sized: radius in km
ll2v=(lo,la)=>{lo*=Math.PI/180;la*=Math.PI/180;return[Math.cos(la)*Math.sin(lo),Math.sin(la),Math.cos(la)*Math.cos(lo)]},
v2ll=v=>[Math.atan2(v[0],v[2])*180/Math.PI,Math.asin(Math.max(-1,Math.min(1,v[1])))*180/Math.PI],
km=d=>d.toLocaleString(ru()?"ru-RU":"en-US",{maximumFractionDigits:d<10?2:d<100?1:0})+L(" km"," км");
function sbU(zl,zx,kp){const zp=Math.round(Math.min(100,Math.max(1,1+99*Math.log(Math.max(zl,1))/Math.log(zx))))+"%"; // zoom from 1% (whole world) to 100% (closest), on a log scale like the zoom steps
if(sb.children[0].textContent!=zp)sb.children[0].textContent=zp;
 // scale bar: the longest round length (1, 2, 5 × 10ⁿ km) that fits in 100 px; kp = km per screen px at the view centre
const L0=kp*100,e=10**Math.floor(Math.log10(L0)),n=[5,2,1].map(v=>v*e).find(v=>v<=L0)||e,key=n+"|"+HT.lang+"|"+(n/kp).toFixed(0);if(key==sbK)return;sbK=key;
sb.children[1].textContent=n<1?(n*1e3).toLocaleString()+L(" m"," м"):n.toLocaleString(ru()?"ru-RU":"en-US")+L(" km"," км");sb.lastChild.style.width=(n/kp).toFixed(1)+"px"}
function msU(){ // measured route: great-circle arcs between the points, sampled every degree; cumulative distances
MP=[];MD=[0];for(let i=1;i<MS.length;i++){const a=MS[i-1],b=MS[i],an=Math.acos(Math.max(-1,Math.min(1,a[0]*b[0]+a[1]*b[1]+a[2]*b[2]))),n=Math.max(1,Math.ceil(an*180/Math.PI)),q=[];
MD.push(MD[i-1]+an*RE);for(let j=0;j<=n;j++){const t=j/n,sa=Math.sin(an),f=an<1e-9?1-t:Math.sin((1-t)*an)/sa,g2=an<1e-9?t:Math.sin(t*an)/sa;q.push([a[0]*f+b[0]*g2,a[1]*f+b[1]*g2,a[2]*f+b[2]*g2])}MP.push(q)}
if(MON==2&&MS.length==2){const[C,E]=MS,t=Math.acos(Math.max(-1,Math.min(1,C[0]*E[0]+C[1]*E[1]+C[2]*E[2]))),a=Math.abs(C[1])<.9?[0,1,0]:[1,0,0], // circle: all points at the same distance over the surface from the centre
cr=(p,q)=>[p[1]*q[2]-p[2]*q[1],p[2]*q[0]-p[0]*q[2],p[0]*q[1]-p[1]*q[0]],nz=v=>{const l=Math.hypot(...v);return v.map(c=>c/l)},u=nz(cr(C,a)),w=cr(C,u),q=[];
for(let j=0;j<=180;j++){const f=j/180*6.2832,c=Math.cos(f)*Math.sin(t),s2=Math.sin(f)*Math.sin(t);q.push([0,1,2].map(i=>C[i]*Math.cos(t)+u[i]*c+w[i]*s2))}MP.push(q)}
drawMz();if(G)rq()}
function mHit(cx,cy){if(!MON)return-1;const r=(G?g:m).getBoundingClientRect(); // measuring point under the pointer (screen px), -1 if none
return MS.findIndex(v=>{let p;if(G)p=gp(v);else{const[lo,la]=v2ll(v),w=W*k,X=x+(lo+180)/360*w;p=[X+w*Math.round((cx-r.left-X)/w),y+(90-la)/180*H*k]}return p&&Math.hypot(r.left+p[0]-cx,r.top+p[1]-cy)<12})}
function msTap(v,pts,cx,cy){ // measuring: a tap on a point removes it, anywhere else adds one
const i=pts.findIndex(p=>p&&Math.hypot(p[0]-cx,p[1]-cy)<12);if(i>=0)MS.splice(i,1);else if(v){if(MON==2&&MS.length>1)MS=[];MS.push(v)}msU()} // circle: centre, then a point on the edge; the next tap starts a new one
function drawMz(){if(G||!MS.length){if(mz.firstChild)mz.innerHTML="";return} // flat map: the arcs bend as the real shortest way does and run on across the seam
const w=W*k,cw=VW-140,sp=(v,p)=>{let[lo,la]=v2ll(v);if(p!=null)lo+=360*Math.round((p-lo)/360);return[x+(lo+180)/360*w,y+(90-la)/180*H*k,lo]};let d="",t="";
for(const q of MP){let pl=null,s2="";for(const v of q){const[X,Y,lo]=sp(v,pl);s2+=(pl==null?"M":"L")+X.toFixed(1)+" "+Y.toFixed(1);pl=lo}
for(let j=-2;j<=2;j++)d+=j?`<path transform="translate(${j*w} 0)" d="${s2}"/>`:`<path d="${s2}"/>`}
MS.forEach((v,i)=>{const[X0,Y]=sp(v);for(let j=-1;j<=1;j++){const X=X0+j*w;if(X<-60||X>VW+60)continue;t+=`<circle cx="${X.toFixed(1)}" cy="${Y.toFixed(1)}" r="4.5"/>`+(i?`<text x="${(X+(X>cw?-9:9)).toFixed(1)}" y="${(Y-10).toFixed(1)}"${X>cw?' text-anchor="end"':""}>${km(MD[i])}</text>`:"")}});
mz.innerHTML=`<g class="u">${d}</g><g>${d}</g>`+t}

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
function panel(){if(ms!=null&&MK[ms]){const q=MK[ms];pt.textContent=mn(q);pbd(q.pg,"");MAP.onMarker?.(ms);return}
if(sel){const r=R[sel],o=COU[r.c]||{};pt.textContent=nm(r);pbd(o.pg,`<p class="ph" lang="en">Placeholder text</p><p class="ph" lang="ru">Текст-заглушка</p>`);MAP.onPanel?.(r)}}
const PC={};let pq=0; // place pages: the side panel shows the page's blocks (archive page layout) without its header
function pbd(s,ph){const t=++pq;if(!s||!(window.PL||[]).includes(s)){px.innerHTML=ph;return}if(PC[s]!=null){px.innerHTML=PC[s];return}px.innerHTML="";
fetch(U+"places/"+s+"/").then(r=>r.ok?r.text():"").then(h=>{const d=new DOMParser().parseFromString(h,"text/html").querySelector("article.doc");d?.querySelector(".b-head")?.remove();PC[s]=d?d.innerHTML:"";if(t==pq)px.innerHTML=PC[s]},()=>{})}
function col(on){CO=on;fdr();c.classList.toggle("on",on);zc.classList.toggle("on",on);try{localStorage.ascwColors=on?1:0}catch{}hi()}
zc.onclick=()=>col(!CO);
function mode(n){MON=n;zm.classList.toggle("on",n==1);zk.classList.toggle("on",n==2);D.body.classList.toggle("msr",!!n);MS=[];msU()} // measuring: 0 off, 1 route (ruler), 2 circle
zm.onclick=()=>mode(MON==1?0:1);zk.onclick=()=>mode(MON==2?0:2);

m.onpointerdown=e=>{if(e.pointerType=="mouse"&&e.button)return;m.setPointerCapture(e.pointerId);P[e.pointerId]={x:e.clientX,y:e.clientY};mv=0;fst();HS=[];m.classList.add("dr");MG=mHit(e.clientX,e.clientY);if(MG<0)MG=null}; // pressing a measuring point drags it
m.onpointermove=e=>{const q=P[e.pointerId];if(!q)return m.classList.toggle("mh",mHit(e.clientX,e.clientY)>=0);
if(MG!=null){mv+=Math.abs(e.clientX-q.x)+Math.abs(e.clientY-q.y);q.x=e.clientX;q.y=e.clientY;const r=m.getBoundingClientRect(),mx=wx((e.clientX-r.left-x)/k),my=Math.min(H,Math.max(0,(e.clientY-r.top-y)/k));MS[MG]=ll2v(mx/W*360-180,90-my/H*180);return msU()}
const o=two(P),dx=e.clientX-q.x,dy=e.clientY-q.y;q.x=e.clientX;q.y=e.clientY;mv+=Math.abs(dx)+Math.abs(dy);
if(o){const n=two(P),r=m.getBoundingClientRect();x+=n.x-o.x;y+=n.y-o.y;zoom(n.d/o.d,n.x-r.left,n.y-r.top);vD=vT=vOf(k)}else{const t=performance.now();HS.push([t,e.clientX,e.clientY]);while(t-HS[0][0]>150)HS.shift();x+=dx;y+=dy;set()}};
m.onpointerup=m.onpointercancel=e=>{const one=Object.keys(P).length==1;delete P[e.pointerId];if(!Object.keys(P).length)m.classList.remove("dr");if(MG!=null){MG=null;if(mv>4)return} // a dragged point stays; a tapped one is removed below
if(one&&mv>6&&HS.length>1){const t=performance.now(),l=HS.at(-1),f=HS.find(h=>t-h[0]<=110)||HS[0],d=(l[0]-f[0])/1e3; // flick speed: averaged over the last ~0.1 s, so one uneven event does not throw the map
if(t-l[0]<60&&d>.012){fv=[(l[1]-f[1])/d,(l[2]-f[2])/d];fdc=8;fgo()}} // it goes on at the speed it was let go, then slows down (twice the old friction: half the glide)
if(!one||mv>6||e.type!="pointerup")return;const r=m.getBoundingClientRect(),t=Date.now();
if(MON){const mx=wx((e.clientX-r.left-x)/k),my=(e.clientY-r.top-y)/k;return msTap(my>=0&&my<=H&&ll2v(mx/W*360-180,90-my/H*180),MS.map(v=>{const[lo,la]=v2ll(v),w=W*k,X=x+(lo+180)/360*w;return[r.left+X+w*Math.round((e.clientX-r.left-X)/w),r.top+y+(90-la)/180*H*k]}),e.clientX,e.clientY)}
if(t-tap<300){tap=0;zst();vT=vcl(vT/1.8);ffl={mx:(e.clientX-r.left-x)/k,my:(e.clientY-r.top-y)/k};fan=fv=null;fgo();return} // double click: fly there and zoom in, as on the globe
tap=t;const mx=wx((e.clientX-r.left-x)/k),my=(e.clientY-r.top-y)/k,g=D.elementFromPoint(e.clientX,e.clientY)?.closest("#mw [data-m]");
if(g&&!MAP.onTap)return pickM(+g.dataset.m);if(!MAP.onTap?.(mx,my,g&&+g.dataset.m))pick(hit(mx,my))};
m.onlostpointercapture=e=>{delete P[e.pointerId];if(!Object.keys(P).length)m.classList.remove("dr")};
m.onwheel=e=>{e.preventDefault();fz(Math.exp(wd(e)*.0015),e.clientX-MR.left,e.clientY-MR.top)}; // the globe's wheel sensitivity and easing
zi.onclick=()=>G?(gT=cl(gT/1.5),anc=null,rq()):fz(1/1.5);
zo.onclick=()=>G?(gT=cl(gT*1.5),anc=null,rq()):fz(1.5);
pc.onclick=()=>{ms=null;pick()};

// ---- cursor coordinates (2D) ----

D.addEventListener("keydown",e=>{if(e.target.closest?.("input:not([type=range]),textarea,select,[contenteditable]"))return; /* typing in a field is not a shortcut */if(e.key=="Escape")tlOpen()?tlClose():MON?mode(0):pick();else if(tlOpen()||e.ctrlKey||e.metaKey||e.altKey)return;
else if(e.key=="+"||e.key=="=")zi.click();else if(e.key=="-")zo.click();
else if(/^Arrow/.test(e.key)){e.preventDefault();const h=e.key=="ArrowLeft"?1:e.key=="ArrowRight"?-1:0,v=e.key=="ArrowUp"?1:e.key=="ArrowDown"?-1:0; // arrows: look west / east / north / south
if(G){gv=[h*(gD-1)*.9,v*(gD-1)*.9];fly=null;rq()}else{ffl=null;fv=[h*1.235*VH,v*1.235*VH];fdc=3.5;fgo()}}});

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
D.addEventListener("lang",()=>{sbK=0;rs();drawM();panel();if(tlOpen())tlB();if(G)tq()});
addEventListener("resize",()=>{if(tlOpen())tlB()});
const MAP=window.MAP={ // editor hooks
redraw(){names();rs();drawM();panel();if(tlOpen())tlB();if(G)tq()},
markers(){drawM();if(G)tq()},pickM,yr:()=>yr,focus(o,a){if(G){fly={y:-o*Math.PI/180,p:Math.min(1.4,Math.max(-1.4,a*Math.PI/180))};gT=cl(Math.min(gT,2.2));return rq()}zst();vT=vcl(Math.min(vT,vOf(fit()*5)));ffl={mx:(o+180)/360*W,my:(90-a)/180*H};fan=fv=null;fgo()},timeline(){if(tlOpen())tlB()},
toMap(e){const r=m.getBoundingClientRect();return{mx:wx((e.clientX-r.left-x)/k),my:(e.clientY-r.top-y)/k}},
sel:()=>sel&&R[sel],pick,W,H};
function sz(){VW=m.clientWidth;VH=m.clientHeight;ZW=zc.parentNode.offsetWidth;GW=g.clientWidth||VW;GH=g.clientHeight||VH;MR=m.getBoundingClientRect();GR=G?g.getBoundingClientRect():MR}
addEventListener("scroll",sz,{passive:true}); // positions on screen are cached too // view sizes, read only when they change
new ResizeObserver(()=>{sz();set();if(G)rq()}).observe(m);
sz();fgI();upd();col(CO);k=fit();x=(VW-W*k)/2;set();rest();drawM();D.fonts.load("20px A").then(rs); // re-layout labels with real glyph widths

// ---- globe ----
// World space: the sun stays at a fixed direction SW, the planet spins slowly around its axis (sa), the camera orbits it (ya, pa; dragging moves the camera).
let gl,gc,go,gw,tc,tx2,tex,bt,ot,LV=2,AN,bp,pp,sp,fp,tb,pb,eb,gD=3,gT=3,gv=[0,0],gt0=0,fly=null,gtap=0,anc=null,GI=[],GO=[],gsig="",ya=0,pa=.15,sa=0,tm=0,SC,AS,tdirty,gm=0,busy,loop,last=0,FD;
const GP={},cl=v=>Math.min(4.5,Math.max(1.48,v)), // camera distance; closest 1.48 = 25% more zoom than before
SW=(v=>{const l=Math.hypot(...v);return v.map(a=>a/l)})([.62,.32,.72]),
SPIN=6.2832/573,CLOUD=[1/1200,1/1900], // one turn in ~9.5 min; cloud layers drift (uv/s)
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
PF=PR+CL+`uniform sampler2D T;uniform sampler2D B;uniform sampler2D O;uniform float d;uniform vec3 L;uniform vec3 Lo;varying vec2 v;varying vec3 q;varying vec3 o;
void main(){vec3 n=normalize(q),V=normalize(vec3(0.,0.,d)-q),ob=normalize(o),H=normalize(L+V);float ndl=dot(n,L),h=1./d,al=smoothstep(h,h+.03,q.z),nv=max(dot(n,V),0.);
float day=smoothstep(-.08,.3,ndl),tw=exp(-pow(ndl*6.,2.)),wr=clamp((ndl+.15)/1.15,0.,1.);
vec4 ov=texture2D(O,v);vec3 m=(texture2D(T,v).rgb*(1.-ov.a)+ov.rgb)*(1.-texture2D(B,v).a);float cd=cl(v),sh=cl(v+tl(ob,Lo)*.014);
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
bp=prog(FV,BF,["g"],["u","a","S"]);pp=prog(PV,PF,["p","t"],["u","a","R","d","L","Lo","cw","T","C","B","O"]);sp=prog(PV,CS,["p","t"],["u","a","R","d","L","Lo","cw","C"]);fp=prog(FV,FF,["g"],["u","S2"]);const cp=prog(FV,CF,["g"],["rs"]);
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
gl.activeTexture(gl.TEXTURE0);gl.useProgram(pp);gl.uniform1i(pp.u.T,0);gl.uniform1i(pp.u.C,1);gl.uniform1i(pp.u.B,2);gl.uniform1i(pp.u.O,3);gl.useProgram(sp);gl.uniform1i(sp.u.C,1);
// textures: base map (T) and borders (B) at the flat map's best level where the device can hold it; tint, graticule and dimming (O) are redrawn by tx()
const MX=gl.getParameter(gl.MAX_TEXTURE_SIZE),S=Math.min(4096,MX),mk=(w,h)=>{const e=D.createElement("canvas");e.width=w;e.height=h;return e};
LV=MX>=8192&&!(matchMedia("(pointer:coarse)").matches&&(navigator.deviceMemory||4)<6)?3:2; // 8192 px like the closest flat level; 4096 on small phones
AN=gl.getExtension("EXT_texture_filter_anisotropic");
const nt=u=>{gl.activeTexture(gl.TEXTURE0+u);const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);tp();
if(AN)gl.texParameterf(gl.TEXTURE_2D,AN.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,gl.getParameter(AN.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));return t};
tex=nt(0);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,MX<4096?(e=>{e.getContext("2d").drawImage(img,0,0,S,S/2);return e})(mk(S,S/2)):img);gl.generateMipmap(gl.TEXTURE_2D);
if(LV>2){const i=new Image;i.src=U+"map/g3.webp";i.decode().then(()=>{gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,i);gl.generateMipmap(gl.TEXTURE_2D);rq()},()=>{})} // sharp level after the quick one
bt=nt(2);upB([]);ot=nt(3);tc=mk(S,S/2);tx2=tc.getContext("2d");gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,tc);gl.activeTexture(gl.TEXTURE0);
g.onpointerdown=e=>{if(e.pointerType=="mouse"){if(e.button)return;for(const i in GP)delete GP[i]}g.setPointerCapture(e.pointerId);GP[e.pointerId]={x:e.clientX,y:e.clientY};gm=0;gv=[0,0];fly=null;anc=null;g.classList.add("dr");MG=mHit(e.clientX,e.clientY);if(MG<0)MG=null};
g.onpointermove=e=>{const q=GP[e.pointerId];if(!q)return g.classList.toggle("mh",mHit(e.clientX,e.clientY)>=0);
if(MG!=null){gm+=Math.abs(e.clientX-q.x)+Math.abs(e.clientY-q.y);q.x=e.clientX;q.y=e.clientY;const p=gll(e);if(p){MS[MG]=[p.x,p.y,p.z];msU()}return}const o=two(GP),dx=e.clientX-q.x,dy=e.clientY-q.y;q.x=e.clientX;q.y=e.clientY;gm+=Math.abs(dx)+Math.abs(dy);
if(o){const n=two(GP);gT=cl(gT*o.d/n.d);gm=99;at(n.x,n.y)}else{const s=2*(gD-1)*SC/GH,t=performance.now(),dt=Math.max(t-gt0,8)/1e3;gt0=t;ya+=dx*s;pa=Math.min(1.4,Math.max(-1.4,pa+dy*s));gv=[gv[0]*.4+dx*s/dt*.6,gv[1]*.4+dy*s/dt*.6]}};
g.onpointerup=g.onpointercancel=e=>{const one=GP[e.pointerId]&&Object.keys(GP).length==1;delete GP[e.pointerId];if(!Object.keys(GP).length)g.classList.remove("dr");if(MG!=null){MG=null;if(gm>4)return gv=[0,0]}if(performance.now()-gt0>80||gm>=99)gv=[0,0];
if(!one||gm>=6||e.type!="pointerup")return;gv=[0,0];const t=Date.now(),q=gll(e);
if(MON){const r=g.getBoundingClientRect();return msTap(q&&[q.x,q.y,q.z],MS.map(v=>{const p=gp(v);return p&&[r.left+p[0],r.top+p[1]]}),e.clientX,e.clientY)}
if(t-gtap<300){gtap=0;anc=null;if(q)fly={y:Math.atan2(-q.x,q.z),p:Math.min(1.4,Math.max(-1.4,Math.atan2(q.y,Math.hypot(q.x,q.z))))};gT=cl(gT/1.8);return} // double click: fly there and zoom in
gtap=t;const m=D.elementFromPoint(e.clientX,e.clientY)?.closest("#gw [data-m]");if(m)return pickM(+m.dataset.m);pick(q&&hit(q.mx,q.my))};
g.onlostpointercapture=e=>{delete GP[e.pointerId];if(!Object.keys(GP).length)g.classList.remove("dr")};
g.onwheel=e=>{e.preventDefault();fly=null;gT=cl(gT*Math.exp(wd(e)*.0015));at(e.clientX,e.clientY);rq()};
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
function tx(){ // globe overlay texture: country tint, graticule, dimming outside the selection (names float above: gL; vector edges: gO)
const S=tc.width,Sh=S/2,s=S/W,o=tx2;o.clearRect(0,0,S,Sh);
if(CO){o.save();o.scale(s,s);o.globalAlpha=.28;RG.forEach(r=>{if(r!=R[sel]){o.fillStyle=r.c;o.fill(path(r),"evenodd")}});o.restore()} // light tint; the colour bands are vector (gO)
o.strokeStyle="#00000059";o.lineWidth=2;o.beginPath();for(let i=1;i<24;i++){o.moveTo(i*S/24,0);o.lineTo(i*S/24,Sh)}for(let i=1;i<12;i++){o.moveTo(0,i*Sh/12);o.lineTo(S,i*Sh/12)}o.stroke();
o.strokeStyle="#000000b3";o.lineWidth=3;o.beginPath();o.moveTo(S/2,0);o.lineTo(S/2,Sh);o.moveTo(0,Sh/2);o.lineTo(S,Sh/2);o.stroke();
if(sel){const q=path(R[sel]),d=new Path2D;d.rect(0,0,W,H);d.addPath(q);o.save();o.scale(s,s);o.fillStyle="#04040a";o.globalAlpha=.5;o.fill(d,"evenodd");o.restore()}
gL();
gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,ot);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,tc);
gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.generateMipmap(gl.TEXTURE_2D);gl.activeTexture(gl.TEXTURE0)}
function upB(im){mipA(gl,bt,2,im)} // globe borders: the site's own levels as mipmaps
function at(cx,cy){const q=gll({clientX:cx,clientY:cy}),r=g.getBoundingClientRect();anc=q&&{p:[q.x,q.y,q.z],x:cx-r.left,y:cy-r.top}} // zoom anchor
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
sbU(Math.PI/(2*SC*(gD-1)),Math.PI/(2*SC*(cl(0)-1)),RE*2*SC*(gD-1)/h);if(!MS.length)return; // measured route, as on the flat map
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
fst();G=!G;D.body.classList.toggle("g",G);zg.textContent=G?"2D":"3D";sz();const cw=VW,ch=VH; // the view stays on the same place at a similar scale
if(G){const lo=(cw/2-x)/k/W*6.2832-3.1416,la=1.5708-(ch/2-y)/k/H*3.1416,sc=.364*Math.max(1,GH/GW);ya=-lo-sa;pa=Math.min(1.4,Math.max(-1.4,la));gv=[0,0];fly=anc=null;gD=gT=cl(1+Math.PI/(2*sc*k/fit()));gB()}
else{if(q&&isFinite(q.mx+q.my)){k=Math.min(Math.max(Math.PI/(2*SC*(gD-1))*fit(),fit()),kmax());x=cw/2-q.mx*k;y=ch/2-q.my*k}set()}}
function gB(){ // borders of the current version for the globe
const v=cv;if(!v.b){upB([]);return tq()}
Promise.all(Array.from({length:LV+1},(_,j)=>{const i=new Image;i.src=bsrc(LV-j);return i.decode().then(()=>i)})).then(a=>{if(v==cv){upB(a);tq()}},()=>{})}
zg.onclick=()=>{if(gl)return sw();if(busy)return;busy=1;ld.hidden=false;zg.setAttribute("aria-busy","true");const i=new Image,done=()=>{busy=0;ld.hidden=true;zg.removeAttribute("aria-busy")};i.onerror=done;
i.onload=()=>Promise.all([D.fonts.load("20px A"),D.fonts.load("20px Play")]).then(()=>new Promise(r=>requestAnimationFrame(()=>setTimeout(r)))).then(()=>{if(gi(i)){FD=done;sw()}else done()}); /* the spinner stays until the first globe frame is drawn (shaders compile on the first draw) */i.src=U+"map/g2.webp"}; // 4096 px level
