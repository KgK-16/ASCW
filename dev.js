(function(){function run(){
var T=localStorage.ascw_tk,O="KgK-16/ASCW",B="main",on=+localStorage.ascw_on||0,ed={t:{},r:{}},dirty={},ad=0,d=document,
H=function(){return{Authorization:"Bearer "+T,Accept:"application/vnd.github+json"}};
if(!T){T=prompt("GitHub token");if(!T)return;localStorage.ascw_tk=T}
history.replaceState(0,"",location.pathname+location.search);
var nv=d.querySelector("nav div"),st=d.createElement("style");
st.textContent="body.dev [data-t],body.dev #pt,body.dev #px{outline:1px dashed #6665c0;outline-offset:2px;cursor:text;min-width:24px}#pd{display:none;gap:16px;margin-top:20px;justify-content:center}#pd.o{display:flex}.z a.on{background:#6665c0}@media(max-width:900px){nav{height:auto;min-height:48px;padding:8px 16px}nav div{flex-wrap:wrap;gap:6px 10px}}";
d.head.appendChild(st);
function mk(t,f){var a=d.createElement("a");a.textContent=t;a.onclick=f;return a}
var be=mk("",function(){tg(!on)}),bs=mk("Save",save);bs.style.display="none";nv.insertBefore(bs,nv.firstChild);nv.insertBefore(be,nv.firstChild);
var map=typeof M!="undefined",za,pd;
function ce(v){d.querySelectorAll("[data-t]").forEach(function(e){e.contentEditable=v?"true":"false"});["pt","px"].forEach(function(i){var e=d.getElementById(i);if(e)e.contentEditable=v?"true":"false"})}
function tg(v){on=v?1:0;localStorage.ascw_on=on;d.body.classList.toggle("dev",!!on);be.textContent=on?"Edit: on":"Edit: off";be.style.color=on?"#6665c0":"";ce(on);if(za)za.style.display=on?"":"none";if(!on){ad=0;za&&za.classList.remove("on")}
if(on&&map)fetch("https://api.github.com/repos/"+O+"/contents/static/markers.json?ref="+B,{headers:Object.assign(H(),{Accept:"application/vnd.github.raw+json"}),cache:"no-store"}).then(function(r){return r.json()}).then(function(a){if(!dirty.markers&&Array.isArray(a)){M=a;drawM();window.G&&tx()}}).catch(function(){})}
function mark(k){dirty[k]=1;bs.style.display="";bs.textContent="Save *"}
d.addEventListener("input",function(e){var el=e.target.closest&&e.target.closest("[data-t]");if(el){ed.t[el.dataset.t]=el.textContent;mark("t");return}
if(!map||!cur||(e.target.id!="pt"&&e.target.id!="px"))return;var n=e.target.id=="pt",v=e.target.textContent;
if(cur.m){cur.o[n?"n":"t"]=v;mark("markers");n&&drawM()}else{cur.o[n?"name":"text"]=v;(ed.r[cur.o.id]=1);mark("regions");if(n){var l=d.querySelector('[data-l="'+cur.o.id+'"]');if(l)l.textContent=v}}
if(window.G)tx()});
d.addEventListener("keydown",function(e){if(on&&e.key=="Enter"&&e.target.isContentEditable)e.preventDefault()});
d.addEventListener("paste",function(e){if(on&&e.target.isContentEditable){e.preventDefault();d.execCommand("insertText",false,e.clipboardData.getData("text/plain").replace(/\n/g," "))}});
d.addEventListener("click",function(e){if(on&&e.target.closest("[data-t]"))e.preventDefault()},true);
if(map){
za=mk("+M",function(){ad=!ad;za.classList.toggle("on",!!ad)});za.id="za";za.title="Add marker";za.style.cssText="font-size:12px;display:none";d.querySelector(".z").appendChild(za);
pd=d.createElement("div");pd.id="pd";var bk=mk("City",function(){cur.o.k=((cur.o.k||0)+1)%3;mark("markers");drawM();dv2();window.G&&tx()}),bd=mk("Delete",function(){M.splice(cur.i,1);mark("markers");drawM();pick();window.G&&tx()});pd.append(bk,bd);d.getElementById("p").appendChild(pd);
window.dv2=function(){var m=on&&cur&&cur.m;pd.classList.toggle("o",!!m);if(m)bk.textContent=["City","Capital","Point"][cur.o.k||0]};
window.hk=function(e,x,y){if(!on||!ad||x<0||y<0||x>W0||y>H0)return;ad=0;za.classList.remove("on");M.push({o:x/W0*360-180,a:90-y/H0*180,n:"New",t:"",k:0});mark("markers");drawM();pm(M.length-1);window.G&&tx();return 1};
d.addEventListener("pointerdown",function(e){var g=on&&e.target.closest&&e.target.closest(".mk");if(!g)return;e.stopPropagation();e.preventDefault();var i=+g.dataset.m,o=M[i],mv=0;pm(i);
function mo(v){var r=m.getBoundingClientRect(),x=(v.clientX-r.left-window.x)/k,y=(v.clientY-r.top-window.y)/k;o.o=Math.max(-180,Math.min(180,x/W0*360-180));o.a=Math.max(-90,Math.min(90,90-y/H0*180));mv=1;g.setAttribute("transform","translate("+(o.o+180)/360*W0+" "+(90-o.a)/180*H0+")")}
function up(){removeEventListener("pointermove",mo);removeEventListener("pointerup",up);if(mv){mark("markers");window.G&&tx()}}
addEventListener("pointermove",mo);addEventListener("pointerup",up)},true)}
function gh(p,o){return fetch("https://api.github.com/repos/"+O+p,Object.assign({headers:H()},o)).then(function(r){return r.ok?r.json():r.text().then(function(t){throw new Error(r.status+" "+t)})})}
function raw(p){return fetch("https://api.github.com/repos/"+O+"/contents/"+p+"?ref="+B,{headers:Object.assign(H(),{Accept:"application/vnd.github.raw+json"}),cache:"no-store"}).then(function(r){return r.ok?r.json():null})}
async function save(){bs.textContent="Saving...";try{var f={};
if(dirty.t){var t=await raw("data/texts.json")||{};Object.assign(t,ed.t);f["data/texts.json"]=JSON.stringify(t,null,1)}
if(dirty.markers)f["static/markers.json"]=JSON.stringify(M);
if(dirty.regions){var g=await raw("static/regions.json");g.forEach(function(r){if(ed.r[r.id]){var a=R[r.id];r.name=a.name;r.text=a.text}});f["static/regions.json"]=JSON.stringify(g)}
var rf=await gh("/git/ref/heads/"+B),hc=await gh("/git/commits/"+rf.object.sha),
tr=await gh("/git/trees",{method:"POST",body:JSON.stringify({base_tree:hc.tree.sha,tree:Object.keys(f).map(function(p){return{path:p,mode:"100644",type:"blob",content:f[p]}})})}),
cm=await gh("/git/commits",{method:"POST",body:JSON.stringify({message:"Edit via dev mode",tree:tr.sha,parents:[rf.object.sha]})});
await gh("/git/refs/heads/"+B,{method:"PATCH",body:JSON.stringify({sha:cm.sha})});
dirty={};ed={t:{},r:{}};bs.textContent="Saved";setTimeout(function(){bs.style.display="none"},4000)}catch(e){bs.textContent="Save *";alert(e.message);if(/^401/.test(e.message))localStorage.removeItem("ascw_tk")}}
tg(on)}document.readyState=="complete"?run():addEventListener("load",run)})();
