// ASCW world map: flat raster + SVG viewer, timeline overlay and WebGL globe.
// Globals injected by layouts/map/list.html: U (base URL), V (map versions: [{y:year,b:has borders,r:[countries]}]), MK (markers), EV (timeline events).
// Layers: geographic base (static/map/g*.webp) < country colours: light tint + inner colour band (canvas, toggleable) < country shapes for clicks/hover (svg) < borders of the version (static/map/<year>/b*.webp)
// < selection: everything else dimmed, outline on top < graticule, labels, markers.
const D=document,HT=D.documentElement,$=i=>D.getElementById(i),
[m,c,im,ov,sv,bi,hl,sl,mw,g,p,pt,px,cd,tl,xt,ty,tw,tz,tr,zg,zt,zc,zi,zo,pc]="m c im ov sv bi hl sl mw g p pt px cd tl xt ty tw tz tr zg zt zc zi zo pc".split(" ").map($),
W=4096,H=2048,T0=350,T1=450,
SH=["M-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0z","M0-9L2.6-3 9-3 4-1 5.6 7 0 3.5-5.6 7-4-1-9-3-2.6-3z"], // marker shapes by kind (k)
HM={en:["N","S","E","W"],ru:[" с. ш."," ю. ш."," в. д."," з. д."]},
P={},hc=D.createElement("canvas").getContext("2d"),ox=ov.getContext("2d");
let k=1,kk,mvT,raf,an,x=0,y=0,lv=-1,sel=null,yr=420,cv,RG=[],R={},CO=1,CP,CT="—",fl=0,lx,ly,mv=0,tap=0,PY=0,G=0;
try{CO=localStorage.ascwColors!="0"}catch{}
const ru=()=>HT.lang=="ru",
L=(e,r)=>ru()?r:e,
nm=r=>ru()?r.ru:r.name,
mn=q=>ru()&&q.r||q.n,
hemi=(v,lat)=>v?HM[ru()?"ru":"en"][(lat?0:2)+(v<0)]:"",
deg=(v,lat)=>Math.abs(v)+"°"+hemi(v,lat),
path=r=>r.p||(r.p=new Path2D(r.d)),
tlOpen=()=>tl.classList.contains("o"),
two=o=>{const a=Object.values(o);return a[1]&&{d:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2}},
ver=()=>V.reduce((a,v)=>v.y<=yr?v:a,V[0]), // latest map version not after the selected year
bsrc=l=>U+`map/${cv.y}/b${l}.webp`;
function glyphs(r){ // label letters keep their proportions; letter spacing stretches the name to its box width
const q=ru()?r.sr:r.s;if(!q)return null;
const t=nm(r).toUpperCase(),n=t.length,w=ru()?r.wr:r.w;hc.font=q+"px A";
const ws=[...t].map(ch=>hc.measureText(ch).width),nat=ws.reduce((a,v)=>a+v,0),ls=n>1?Math.max(0,(w-nat)/(n-1)):0;
let X=(ru()?r.xr:r.x)-(nat+ls*(n-1))/2;
return{t,s:q,y:ru()?r.yr:r.y,xs:ws.map(v=>{const o=X;X+=v+ls;return o})}}
function load(el,src){el._s=src;const i=new Image;i.src=src;i.decode().then(()=>{if(el._s==src)el.src=src},()=>{})} // decode off the main thread, then swap

// ---- flat map ----
const fit=()=>m.clientHeight/H,kmax=()=>Math.max(2,fit());
function set(anim){
k=Math.min(Math.max(k,fit()),kmax());
const w=W*k,h=H*k,cw=m.clientWidth,ch=m.clientHeight;
x=w<cw?(cw-w)/2:Math.min(0,Math.max(cw-w,x));
y=h<ch?(ch-h)/2:Math.min(0,Math.max(ch-h,y));
an=anim;if(!raf)raf=requestAnimationFrame(apply); // at most one DOM update per frame
const n=W*k*devicePixelRatio,l=n>4500?3:n>2200?2:n>1100?1:0; // image levels 1024/2048/4096/8192 px
if(l>lv){if(lv<0&&l)im.src=U+"map/g0.webp"; // light preview while the sharp level loads
lv=l;load(im,U+`map/g${l}.webp`);lvB()}}
function lvB(){if(lv<0)return;bi.hidden=!cv.b;if(cv.b)load(bi,bsrc(lv))}
function apply(){raf=0;c.classList.toggle("t",!!an);c.style.transform=`translate(${x}px,${y}px) scale(${k})`;
c.classList.add("mv");clearTimeout(mvT);mvT=setTimeout(rest,250)} // while moving: GPU layer only, no restyle/repaint
function rest(){c.classList.remove("mv");if(k!=kk)c.style.setProperty("--k",kk=k)} // after: zoom-dependent widths, crisp re-raster
function zoom(f,px,py,anim){const k2=Math.min(Math.max(k*f,fit()),kmax());x=px-(px-x)*k2/k;y=py-(py-y)*k2/k;k=k2;set(anim)}

function rs(){ // (re)build the SVG overlays: country shapes, graticule, labels
let s="",q="",l="",t="";
for(let i=-180;i<=180;i+=15){const X=(i+180)/360*W;q+=`<path${i?"":' class="e"'} d="M${X} 0V${H}"/>`;if(i%30==0&&i<180)l+=`<text x="${X+4}" y="38">${deg(i)}</text>`}
for(let i=-75;i<=75;i+=15){const Y=(90-i)/180*H;q+=`<path${i?"":' class="e"'} d="M0 ${Y}H${W}"/>`;if(i%30==0)l+=`<text x="10" y="${Y-8}">${deg(i,1)}</text>`}
RG.forEach(r=>{s+=`<path id="r${r.id}" data-i="${r.id}" style="--c:${r.c}" fill-rule="evenodd" d="${r.d}"/>`;const a=glyphs(r);
if(a)t+=`<text x="${a.xs.map(v=>v.toFixed(1)).join(" ")}" y="${a.y}" font-size="${a.s}">${a.t}</text>`});
sv.innerHTML=s;sl.innerHTML=`<g class="gr">${q}</g><g class="gl">${l}</g><g class="lb">${t}</g>`;
RG.forEach(r=>r.el=$("r"+r.id));
hi()}
function hi(){ // selection layer above the borders: the rest of the map is dimmed, the country keeps its own relief colours
const r=sel&&R[sel];
hl.innerHTML=r?`<path class="dm" fill-rule="evenodd" d="M0 0H${W}V${H}H0z${r.d}"/><path class="gw" d="${r.d}"/><path class="ol" d="${r.d}"/>`:"";
drawOv()}
function drawOv(){ // country colours as one raster layer (cheap to pan/zoom): light tint + inner colour band; the selected country keeps pure relief
if(CO){const o=ox;o.clearRect(0,0,W,H);o.lineJoin="round";
RG.forEach(r=>{const q=path(r);o.globalAlpha=r==R[sel]?0:.28;o.fillStyle=r.c;o.fill(q,"evenodd");o.save();o.clip(q,"evenodd");o.globalAlpha=.85;o.strokeStyle=r.c;o.lineWidth=14;o.stroke(q);o.restore()});o.globalAlpha=1}
if(G)tq()}
const drawM=()=>mw.innerHTML=MK.map(q=>`<g transform="translate(${(q.o+180)/360*W} ${(90-q.a)/180*H})"><g class="ms"><path d="${SH[q.k|0]}"/><text x="12" y="1">${mn(q)}</text></g></g>`).join("");

function setVer(){ // switch to the map version of the selected year
cv=ver();RG=cv.r;R={};RG.forEach(r=>R[r.id]=r);
if(sel&&!R[sel]){sel=null;p.classList.remove("o")}else panel();
lvB();rs();if(G)gB()}
function upd(){ // apply the selected year
zt.textContent=ty.textContent=yr;
tz.querySelectorAll(".f").forEach(f=>f.classList.toggle("a",f.dataset.y<=yr));
if(ver()!=cv)setVer()}
const hit=(mx,my)=>RG.find(r=>hc.isPointInPath(path(r),mx,my,"evenodd"))?.id; // country under a map point
function pick(id){
id=id&&R[id]?+id:null;
sel=id;if(sel)panel();
p.classList.toggle("o",!!sel);hi()}
function panel(){if(sel){const r=R[sel];pt.textContent=nm(r);px.textContent=r.text||L("Placeholder text","Текст-заглушка")}}
function col(on){CO=on;c.classList.toggle("on",on);zc.classList.toggle("on",on);try{localStorage.ascwColors=on?1:0}catch{}drawOv()}
zc.onclick=()=>col(!CO);

m.onpointerdown=e=>{m.setPointerCapture(e.pointerId);P[e.pointerId]={x:e.clientX,y:e.clientY};mv=0};
m.onpointermove=e=>{coords(e);const q=P[e.pointerId];if(!q)return;
const o=two(P),dx=e.clientX-q.x,dy=e.clientY-q.y;q.x=e.clientX;q.y=e.clientY;mv+=Math.abs(dx)+Math.abs(dy);
if(o){const n=two(P),r=m.getBoundingClientRect();x+=n.x-o.x;y+=n.y-o.y;zoom(n.d/o.d,n.x-r.left,n.y-r.top)}else{x+=dx;y+=dy;set()}};
m.onpointerup=m.onpointercancel=e=>{const one=Object.keys(P).length==1;delete P[e.pointerId];
if(!one||mv>6||e.type!="pointerup")return;const r=m.getBoundingClientRect(),t=Date.now();
if(t-tap<300){zoom(2,e.clientX-r.left,e.clientY-r.top,1);tap=0;return}
tap=t;pick(hit((e.clientX-r.left-x)/k,(e.clientY-r.top-y)/k))};
m.onlostpointercapture=e=>{delete P[e.pointerId]};
m.onwheel=e=>{e.preventDefault();const r=m.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.002),e.clientX-r.left,e.clientY-r.top)};
zi.onclick=()=>G?(gD=cl(gD/1.3),rq()):zoom(1.6,m.clientWidth/2,m.clientHeight/2,1);
zo.onclick=()=>G?(gD=cl(gD*1.3),rq()):zoom(1/1.6,m.clientWidth/2,m.clientHeight/2,1);
pc.onclick=()=>pick();

// ---- cursor coordinates (2D) ----
function coords(e){const r=m.getBoundingClientRect();lx=(e.clientX-r.left-x)/k;ly=(e.clientY-r.top-y)/k;showC()}
function showC(){if(lx==null||lx<0||ly<0||lx>W||ly>H)return;const lo=lx/W*360-180,la=90-ly/H*180;
CP=la.toFixed(3)+", "+lo.toFixed(3);
CT=Math.abs(la).toFixed(3)+"°"+hemi(la,1)+" "+Math.abs(lo).toFixed(3)+"°"+hemi(lo)+"<br>x "+lx.toFixed(1)+" y "+ly.toFixed(1);
if(!fl)cd.innerHTML=CT}
function copy(){if(!CP)return;
const fb=()=>{const t=D.createElement("textarea");t.value=CP;D.body.append(t);t.select();try{D.execCommand("copy")}catch{}t.remove()};
navigator.clipboard?navigator.clipboard.writeText(CP).catch(fb):fb();
cd.textContent=L("COPIED: ","СКОПИРОВАНО: ")+CP;clearTimeout(fl);fl=setTimeout(()=>{fl=0;cd.innerHTML=CT},1200)}
cd.onclick=copy;
D.addEventListener("keydown",e=>{if(e.key=="Escape")tlOpen()?tlClose():pick();else if(e.code=="KeyC"&&!G&&!tlOpen()&&!getSelection().toString())copy()});

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
const tlClose=()=>tl.classList.remove("o");
tr.min=T0;tr.max=T1;tr.value=yr;
tr.oninput=()=>{yr=+tr.value;upd()};
tz.onclick=e=>{const f=e.target.closest(".f");if(f){yr=tr.value=+f.dataset.y;upd()}};
zt.onclick=()=>{tl.classList.add("o");tlB();tw.scrollLeft=60+(yr-T0)*PY-tw.clientWidth/2};
xt.onclick=tlClose;

D.addEventListener("lang",()=>{rs();drawM();panel();showC();if(tlOpen())tlB();if(G)tq()});
addEventListener("resize",()=>{set();if(G)rq();if(tlOpen())tlB()});
upd();col(CO);k=fit();x=(m.clientWidth-W*k)/2;set();rest();drawM();D.fonts.load("20px A").then(rs); // re-layout labels with real glyph widths

// ---- globe ----
let gl,gc,tc,tx2,bc,bb,tex,bp,pp,tb,pb,eb,gD=3,ya=0,pa=.15,SC,AS,dirty,tdirty,gm=0,busy;
const GP={},cl=v=>Math.min(4.5,Math.max(1.6,v)),
rq=()=>{if(!dirty){dirty=1;requestAnimationFrame(dr)}},
tq=()=>{tdirty=1;rq()}; // texture rebuilds are coalesced to one per frame
const PR="#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n",
NZ=`float h3(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}float n3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}float fb(vec3 x){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*n3(x);x=x*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s;}`,
FV="attribute vec2 g;varying vec2 n;void main(){n=g;gl_Position=vec4(g,0.,1.);}",
PV=`attribute vec3 p;attribute vec2 t;uniform vec3 u;uniform vec2 a;varying vec2 v;varying vec3 q;varying vec3 o;void main(){float c=cos(a.x),s=sin(a.x),e=cos(a.y),f=sin(a.y);vec3 r=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);r=vec3(r.x,e*r.y-f*r.z,f*r.y+e*r.z);q=r;o=p;v=t;gl_Position=vec4(r.x/(u.z*u.y),r.y/u.z,0.,u.x-r.z);}`,
PF=PR+`uniform sampler2D T;uniform sampler2D C;uniform float d;uniform vec3 Lo;varying vec2 v;varying vec3 q;varying vec3 o;void main(){vec3 n=normalize(q),L=normalize(vec3(.62,.38,.68)),V=normalize(vec3(0.,0.,d)-q),ob=normalize(o);float ndl=dot(n,L),day=smoothstep(-.35,.45,ndl),h=1./d,al=smoothstep(h,h+.03,q.z);vec3 m=texture2D(T,v).rgb;float cd=texture2D(C,v).r;vec3 e=normalize(vec3(ob.z,0.,-ob.x)+vec3(1e-4,0.,0.)),nr=cross(ob,e);float cs=max(sqrt(1.-ob.y*ob.y),.1);float sh=texture2D(C,v+vec2(dot(Lo,e)/(6.2832*cs),-dot(Lo,nr)/3.1416)*.018).r;vec3 c=m*(1.-.5*sh);float sea=smoothstep(.02,.07,m.b-m.r)*(1.-smoothstep(.18,.28,m.r));c+=vec3(1.,.93,.8)*pow(max(dot(n,normalize(L+V)),0.),70.)*.55*sea*(1.-cd)*day;c*=.26+.74*day;c=mix(c,vec3(.96,.97,1.)*(.22+.78*day),cd*.8);float tw=exp(-pow(ndl*3.2,2.));c+=vec3(1.,.42,.12)*tw*.14;float fr=pow(1.-max(dot(n,V),0.),4.);c=mix(c,mix(vec3(.18,.35,.9),vec3(.45,.7,1.),day)*(.2+.8*day)+vec3(1.,.5,.2)*tw*.15,fr*.55);gl_FragColor=vec4(c*al,al);}`,
BF=PR+NZ+`uniform vec3 u;uniform vec2 a;varying vec2 n;float h2(vec2 p){p=fract(p*vec2(.1031,.103));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}void main(){const vec3 S=vec3(.30,.17,-.94);vec2 tp=vec2(n.x*u.z*u.y,n.y*u.z),sk=tp+a*.15;vec3 rd=normalize(vec3(tp,-1.)),col=vec3(0.);for(int k=0;k<3;k++){float z=float(k),sc=40.+z*45.;vec2 g=sk*sc+z*17.,id=floor(g),f=fract(g)-.5;vec2 of=(vec2(h2(id+7.),h2(id+13.))-.5)*.7;float br=step(.96+z*.01,h2(id+z*31.))*smoothstep(.07+.02*(2.-z),0.,length(f-of))*(.4+.6*h2(id+3.));col+=mix(vec3(.7,.8,1.),vec3(1.,.82,.6),h2(id+19.))*br*(1.2-.3*z);}vec3 o=vec3(0.,0.,u.x);vec3 P=o-dot(o,rd)*rd;float dist=length(P),ss=max(dot(normalize(P.xy+1e-4),normalize(S.xy)),0.),hh=max(dist-1.,0.);col+=mix(vec3(.25,.5,1.),vec3(1.,.7,.45),pow(ss,4.)*.4)*exp(-hh*55.)*(.08+1.2*ss*ss);vec2 ts=S.xy/-S.z;float ds=length(tp-ts);col+=vec3(1.,.97,.92)*smoothstep(.012,.009,ds)*9.;col+=vec3(1.,.95,.85)*.004/(ds+.004);gl_FragColor=vec4(1.-exp(-col*1.4),1.);}`,
CF=PR+NZ+`void main(){vec2 uv=gl_FragCoord.xy/vec2(2048.,1024.);float th=(uv.x-.5)*6.2832,ph=(.5-uv.y)*3.1416;vec3 p=vec3(cos(ph)*sin(th),sin(ph),cos(ph)*cos(th)),w=p*3.5;vec3 q=vec3(fb(w),fb(w+vec3(5.2,1.3,2.8)),fb(w+vec3(1.7,9.2,4.1)));float n=fb(p*6.+5.*(q-.5)),y=p.y;float fr=exp(-pow((y-.52-.28*(fb(p*2.+9.)-.5))*5.5,2.))+exp(-pow((y+.46-.28*(fb(p*2.+4.)-.5))*5.5,2.))+.6*exp(-pow((y-.1*(fb(p*2.+2.)-.5))*9.,2.));float c=n*1.05+fr*.4-.8+(fb(p*30.+q*3.)-.5)*.25,d=smoothstep(0.,.16,c);gl_FragColor=vec4(d,d,d,1.);}`;

function sh(t,s){const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);return o}
function prog(v,f,a,u){const q=gl.createProgram();gl.attachShader(q,sh(gl.VERTEX_SHADER,v));gl.attachShader(q,sh(gl.FRAGMENT_SHADER,f));
a.forEach((n,i)=>gl.bindAttribLocation(q,i,n));gl.linkProgram(q);q.u={};u.forEach(n=>q.u[n]=gl.getUniformLocation(q,n));return q}
function tp(){gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE)}
function gi(img){
gc=D.createElement("canvas");gl=gc.getContext("webgl",{antialias:true});if(!gl){zg.style.display="none";return}g.append(gc);
bp=prog(FV,BF,["g"],["u","a"]);pp=prog(PV,PF,["p","t"],["u","a","d","Lo","T","C"]);const cp=prog(FV,CF,["g"],[]);
tb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,tb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
const b=[],ix=[];for(let j=0;j<=48;j++)for(let i=0;i<=96;i++){const th=(i/96-.5)*6.2832,ph=(.5-j/48)*3.1416;b.push(Math.cos(ph)*Math.sin(th),Math.sin(ph),Math.cos(ph)*Math.cos(th),i/96,j/48)}
for(let j=0;j<48;j++)for(let i=0;i<96;i++){const a=j*97+i;ix.push(a,a+1,a+97,a+1,a+98,a+97)}
pb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,pb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(b),gl.STATIC_DRAW);
eb=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,eb);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(ix),gl.STATIC_DRAW);
// clouds: rendered once into a texture
gl.activeTexture(gl.TEXTURE1);const ct=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,ct);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,2048,1024,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);tp();
const fo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,ct,0);
gl.viewport(0,0,2048,1024);gl.useProgram(cp);gl.bindBuffer(gl.ARRAY_BUFFER,tb);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,0,0,0);gl.drawArrays(gl.TRIANGLES,0,3);
gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.deleteFramebuffer(fo);gl.deleteProgram(cp);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.generateMipmap(gl.TEXTURE_2D);
gl.activeTexture(gl.TEXTURE0);gl.useProgram(pp);gl.uniform1i(pp.u.T,0);gl.uniform1i(pp.u.C,1);
// map texture: base image is downscaled once, overlays are redrawn on top of it by tx()
const S=Math.min(4096,gl.getParameter(gl.MAX_TEXTURE_SIZE)),mk=()=>{const e=D.createElement("canvas");e.width=S;e.height=S/2;return e};
bc=mk();bb=mk();const bx=bc.getContext("2d");bx.imageSmoothingQuality="high";bx.drawImage(img,0,0,S,S/2);
tc=mk();tx2=tc.getContext("2d");
tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bc);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);tp();
const e=gl.getExtension("EXT_texture_filter_anisotropic");if(e)gl.texParameterf(gl.TEXTURE_2D,e.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,gl.getParameter(e.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
g.onpointerdown=e=>{if(e.pointerType=="mouse")for(const i in GP)delete GP[i];g.setPointerCapture(e.pointerId);GP[e.pointerId]={x:e.clientX,y:e.clientY};gm=0};
g.onpointermove=e=>{const q=GP[e.pointerId];if(!q)return;const o=two(GP),dx=e.clientX-q.x,dy=e.clientY-q.y;q.x=e.clientX;q.y=e.clientY;gm+=Math.abs(dx)+Math.abs(dy);
if(o){gD=cl(gD*o.d/two(GP).d);gm=99}else{const s=2*(gD-1)*SC/g.clientHeight;ya+=dx*s;pa=Math.min(1.4,Math.max(-1.4,pa+dy*s))}rq()};
g.onpointerup=g.onpointercancel=e=>{const one=GP[e.pointerId]&&Object.keys(GP).length==1;delete GP[e.pointerId];if(one&&gm<6&&e.type=="pointerup")pk(e)};
g.onlostpointercapture=e=>{delete GP[e.pointerId]};
g.onwheel=e=>{e.preventDefault();gD=cl(gD*Math.exp(e.deltaY*.0015));rq()};
return 1}
function dr(){dirty=0;if(tdirty){tdirty=0;tx()}
const w=g.clientWidth,h=g.clientHeight,r=Math.min(devicePixelRatio||1,2),cw=Math.round(w*r),ch=Math.round(h*r);
if(gc.width!=cw||gc.height!=ch){gc.width=cw;gc.height=ch}
gl.viewport(0,0,cw,ch);AS=w/h;SC=.364*Math.max(1,1/AS);
gl.disable(gl.BLEND);gl.useProgram(bp);gl.bindBuffer(gl.ARRAY_BUFFER,tb);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,0,0,0);gl.disableVertexAttribArray(1);
gl.uniform3f(bp.u.u,gD,AS,SC);gl.uniform2f(bp.u.a,ya,pa);gl.drawArrays(gl.TRIANGLES,0,3);
gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.useProgram(pp);gl.bindBuffer(gl.ARRAY_BUFFER,pb);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,eb);
gl.vertexAttribPointer(0,3,gl.FLOAT,0,20,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,0,20,12);
const cy=Math.cos(ya),sy=Math.sin(ya),cp=Math.cos(pa),sp=Math.sin(pa),Lx=.6227,Ly=.3817,Lz=.683,y1=cp*Ly+sp*Lz,z1=-sp*Ly+cp*Lz;
gl.uniform3f(pp.u.u,gD,AS,SC);gl.uniform2f(pp.u.a,ya,pa);gl.uniform1f(pp.u.d,gD);gl.uniform3f(pp.u.Lo,cy*Lx-sy*z1,y1,sy*Lx+cy*z1);
gl.drawElements(gl.TRIANGLES,27648,gl.UNSIGNED_SHORT,0)}
function tx(){ // rebuild the globe texture: base map, country colours, borders, graticule, selection, labels, markers
const S=tc.width,Sh=S/2,s=S/W,o=tx2;
o.drawImage(bc,0,0);
if(CO)o.drawImage(ov,0,0,S,Sh);
if(cv.b)o.drawImage(bb,0,0);
o.strokeStyle="#00000059";o.lineWidth=2;o.beginPath();for(let i=1;i<24;i++){o.moveTo(i*S/24,0);o.lineTo(i*S/24,Sh)}for(let i=1;i<12;i++){o.moveTo(0,i*Sh/12);o.lineTo(S,i*Sh/12)}o.stroke();
o.strokeStyle="#000000b3";o.lineWidth=3;o.beginPath();o.moveTo(S/2,0);o.lineTo(S/2,Sh);o.moveTo(0,Sh/2);o.lineTo(S,Sh/2);o.stroke();
if(sel){const q=path(R[sel]),d=new Path2D;d.rect(0,0,W,H);d.addPath(q);o.save();o.scale(s,s);o.lineJoin="round";
o.fillStyle="#04040a";o.globalAlpha=.5;o.fill(d,"evenodd");o.strokeStyle="#e8e8e0";o.globalAlpha=.25;o.lineWidth=9;o.stroke(q);o.globalAlpha=1;o.lineWidth=3;o.stroke(q);o.restore()}
o.fillStyle="#e8e8e0";o.textAlign="left";o.textBaseline="middle";o.lineJoin="round";o.strokeStyle="#000000b3";
RG.forEach(r=>{const a=glyphs(r);if(!a)return;const f=a.s*s;o.font=f+"px A";o.lineWidth=f*.14;[...a.t].forEach((ch,i)=>{o.strokeText(ch,a.xs[i]*s,a.y*s);o.fillText(ch,a.xs[i]*s,a.y*s)})});
o.font=24*s+"px Play,sans-serif";
MK.forEach(q=>{const X=(q.o+180)/360*S,Y=(90-q.a)/180*Sh,n=mn(q).toUpperCase(),sp=new Path2D(SH[q.k|0]);
o.save();o.translate(X,Y);o.scale(1.6*s,1.6*s);o.lineWidth=1.9;o.strokeStyle="#000";o.fill(sp);o.stroke(sp);o.restore();
o.lineWidth=5*s;o.strokeStyle="#000000b3";o.strokeText(n,X+19*s,Y);o.fillText(n,X+19*s,Y)});
gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,tc);gl.generateMipmap(gl.TEXTURE_2D)}
function pk(e){ // globe click -> region under the cursor
const r=g.getBoundingClientRect(),nx=(e.clientX-r.left)/r.width*2-1,ny=1-(e.clientY-r.top)/r.height*2,dx=nx*SC*AS,dy=ny*SC,a=dx*dx+dy*dy+1,b=-2*gD,cc=gD*gD-1,f=b*b-4*a*cc;
if(f<0)return pick();
const t=(-b-Math.sqrt(f))/(2*a),X=dx*t,Y=dy*t,Z=gD-t,cp=Math.cos(pa),sp=Math.sin(pa),cy=Math.cos(ya),sy=Math.sin(ya),
y1=cp*Y+sp*Z,z1=-sp*Y+cp*Z,qx=cy*X-sy*z1,qz=sy*X+cy*z1,mx=(Math.atan2(qx,qz)/6.2832+.5)*W,my=(.5-Math.asin(y1)/3.1416)*H;
pick(hit(mx,my))}
function sw(){G=!G;D.body.classList.toggle("g",G);zg.textContent=G?"2D":"3D";if(G)gB()}
function gB(){ // borders of the current version for the globe texture
const v=cv;if(!v.b)return tq();const i=new Image;i.onload=()=>{if(v!=cv)return;const o=bb.getContext("2d");o.clearRect(0,0,bb.width,bb.height);o.drawImage(i,0,0,bb.width,bb.height);tq()};i.src=bsrc(2)} // 4096 px level = globe texture size
zg.onclick=()=>{if(gl)return sw();if(busy)return;busy=1;const i=new Image;i.onerror=()=>busy=0;
i.onload=()=>Promise.all([D.fonts.load("20px A"),D.fonts.load("20px Play")]).then(()=>{if(gi(i))sw()});i.src=U+"map/g2.webp"}; // 4096 px level
