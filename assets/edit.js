// ASCW site editor. Loaded only when edit mode is on (✎ in the nav; unlocked once per browser by opening any page with ?edit).
// Every change goes into a local draft (localStorage) and is published to GitHub as one commit with the editor's own access token;
// GitHub Actions then rebuilds the site. Source files: content/**/_index.md (JSON front matter), data/text.json (interface texts),
// assets/markers.json, assets/events.json, assets/countries.json (map), static/img/* (uploaded images).
(()=>{
const D=document,HT=D.documentElement,BT=D.getElementById("ed"),U=BT.dataset.u,REPO=BT.dataset.repo,BR="main",
LS=(()=>{try{return localStorage}catch{return{}}})(),
NEWP=!D.querySelector("meta[name=src]")?.content, // a page that exists only in the draft opens on the 404 page at its future address
SRC=D.querySelector("meta[name=src]")?.content||(p=>p&&p+"/_index.md")(decodeURI(location.pathname).slice(U.length).replace(/\/?(index\.html)?$/,"")),PAGE=SRC&&"content/"+SRC,
F={text:"data/text.json",mk:"assets/markers.json",ev:"assets/events.json",co:"assets/countries.json"},
ru=()=>HT.lang=="ru",L=(e,r)=>ru()?r:e,
h=(t,a={},...c)=>{const e=D.createElement(t);for(const k in a)k.startsWith("on")?e[k]=a[k]:k=="cls"?e.className=a[k]:e.setAttribute(k,a[k]);e.append(...c.flat().filter(v=>v!=null));return e},
esc=t=>String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
let draft={},base={},pend={},blobs={},on=0,tok=LS.ascwTok||"";
try{draft=JSON.parse(LS.ascwDraft||"{}")}catch{}

// ---------- storage: draft, GitHub ----------
function save(){try{LS.ascwDraft=JSON.stringify(draft)}catch{toast(L("Draft too big to keep after closing the page — publish first","Черновик слишком большой, чтобы пережить закрытие страницы — сначала опубликуйте"),1)}bar()}
async function gh(p,o={}){const r=await fetch(`https://api.github.com/repos/${REPO}/${p}`,{cache:"no-store",...o,headers:{...(tok?{Authorization:"Bearer "+tok}:{}),Accept:o.raw?"application/vnd.github.raw+json":"application/vnd.github+json",...(o.body?{"Content-Type":"application/json"}:{})}});
if(!r.ok)throw Error(r.status+" "+(await r.text()).slice(0,200));return o.raw?r.text():r.json()}
function src(p){ // current published source of a file (null if it does not exist); one request per file, writes stay in call order
return pend[p]??=(async()=>{if(p in base)return base[p];
try{base[p]=await gh(`contents/${p}?ref=${BR}`,{raw:1}).catch(e=>/^404/.test(e.message)?Promise.reject(e):fetch(`https://raw.githubusercontent.com/${REPO}/${BR}/${p}?${Date.now()}`,{cache:"no-store"}).then(r=>r.ok?r.text():Promise.reject(r.status)))}
catch(e){if(!/404/.test(e))console.warn(p,e);base[p]=null}return base[p]})()}
async function read(p){const d=draft[p];return d?d.del?null:d.t:src(p)}
async function write(p,t){await src(p);if(t===base[p])delete draft[p];else draft[p]={t};save()}
const J=async(p,def)=>{try{return JSON.parse(await read(p))??def}catch{return def}},
fmt={[F.mk]:a=>"[\n"+a.map(v=>JSON.stringify(v)).join(",\n")+"\n]\n",[F.ev]:a=>"[\n"+a.map(v=>JSON.stringify(v)).join(",\n")+"\n]\n"},
WJ=(p,o)=>write(p,(fmt[p]||(v=>JSON.stringify(v,null,1)+"\n"))(o));
const n=()=>Object.keys(draft).length;

async function publish(){
if(!tok)return token();if(!n())return;
const b=pb.firstChild;b.disabled=1;toast(L("Publishing…","Публикация…"));
try{const ref=await gh(`git/ref/heads/${BR}`),head=ref.object.sha,c=await gh(`git/commits/${head}`),tree=[];
for(const [p,v] of Object.entries(draft)){
if(v.del){if(await src(p)!=null)tree.push({path:p,mode:"100644",type:"blob",sha:null});continue}
const bl=await gh("git/blobs",{method:"POST",body:JSON.stringify(v.b?{content:v.b,encoding:"base64"}:{content:v.t,encoding:"utf-8"})});
tree.push({path:p,mode:"100644",type:"blob",sha:bl.sha})}
const t=await gh("git/trees",{method:"POST",body:JSON.stringify({base_tree:c.tree.sha,tree})}),
nc=await gh("git/commits",{method:"POST",body:JSON.stringify({message:"Edit via site editor",tree:t.sha,parents:[head]})});
await gh(`git/refs/heads/${BR}`,{method:"PATCH",body:JSON.stringify({sha:nc.sha})});
for(const [p,v] of Object.entries(draft))base[p]=v.del?null:v.t??base[p];
draft={};save();deploy(nc.sha)}
catch(e){toast(L("Publish failed: ","Ошибка публикации: ")+e.message,1)}b.disabled=0}
async function deploy(sha){ // follow the GitHub Actions build of this commit (needs Actions: read; otherwise just a hint)
toast(L("Published. The site rebuilds in about a minute.","Опубликовано. Сайт обновится примерно через минуту."));
for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,6e3));
try{const r=(await gh(`actions/runs?head_sha=${sha}`)).workflow_runs[0];if(!r)continue;
if(r.status=="completed"){toast(r.conclusion=="success"?L("Site updated (refresh in ~30 s).","Сайт обновлён (обновите страницу через ~30 с)."):L("Build failed — see GitHub Actions.","Сборка не удалась — см. GitHub Actions."),r.conclusion!="success");return}}catch{return}}}
function discard(){if(!n()||!confirm(L("Discard all unpublished changes?","Удалить все неопубликованные изменения?")))return;draft={};save();location.reload()}

// ---------- UI shell ----------
D.head.append(h("style",{},`
#eb{position:fixed;left:12px;bottom:12px;z-index:40;display:flex;gap:4px;flex-wrap:wrap;max-width:calc(100% - 24px);text-transform:none}
.eb{font:400 13px "Exo 2",sans-serif;letter-spacing:.5px;color:#e8e8e0;background:#020206f2;border:1px solid #6665c0;padding:6px 10px;cursor:pointer;line-height:1.2;min-height:32px;text-transform:none}
.eb:hover{background:#6665c040}.eb.on{background:#6665c0;color:#fff}.eb:disabled{opacity:.4;cursor:default}#eb .eb.n{border-color:#e8b04a;color:#e8b04a}
#et{position:fixed;left:12px;bottom:56px;z-index:41;max-width:min(420px,calc(100% - 24px));font:400 13px "Exo 2",sans-serif;color:#e8e8e0;background:#020206f2;border:1px solid #6665c0;padding:8px 12px;text-transform:none}#et.x{border-color:#e85a4a}
.dl{position:fixed;inset:0;z-index:50;background:#020206b3;display:flex;align-items:center;justify-content:center;padding:16px;text-transform:none}
.dlb{background:#05050d;border:1px solid #6665c0;width:min(640px,100%);max-height:100%;overflow:auto;padding:18px;display:flex;flex-direction:column;gap:10px;font:400 14px "Exo 2",sans-serif;color:#e8e8e0;text-align:left}
.dlb h3{font:400 15px "Exo 2",sans-serif;letter-spacing:2px;text-transform:uppercase;margin:0}
.dlb label,.ef label{display:flex;flex-direction:column;gap:4px;font:400 11px "Exo 2",sans-serif;letter-spacing:1px;color:#e8e8e099;text-transform:uppercase}
.ei{font:400 14px Inter,sans-serif;color:#e8e8e0;background:#0b0b18;border:1px solid #6665c066;padding:7px 9px;width:100%;text-transform:none;letter-spacing:0}
.ei:focus{outline:none;border-color:#8d8cf0}textarea.ei{resize:vertical;min-height:70px;line-height:1.5}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.row>*{flex:1}.row>.eb{flex:0 0 auto}
.dlb a{font-size:13px;letter-spacing:0;color:#8d8cf0;text-decoration:underline;white-space:normal}
.ed [data-k][contenteditable]{outline:1px dashed #6665c0aa;outline-offset:3px;cursor:text}
/* document editor */
.ed .doc [contenteditable]{outline:none;cursor:text}.ed .doc :is([contenteditable],li[data-ph]):empty::before{content:attr(data-ph);color:#e8e8e040;font-style:italic;pointer-events:none}
.ed .doc [data-i]{position:relative}.ed .doc :is(.b-card,.al-left,.al-right){z-index:1} /* floats stay above the text that wraps them */.ed .doc [data-i].cur{box-shadow:-14px 0 0 -12px #6665c0}
.ed .doc .b-img img,.ed .doc .b-card img{cursor:pointer}.ed .doc .pi{display:block;width:100%;padding:36px 12px;border:1px dashed #6665c0;color:#e8e8e080;font:400 13px "Exo 2",sans-serif;cursor:pointer;text-align:center}
.ed .doc .b-links .nw a{color:#e8b04a}.ed .doc .b-links a{pointer-events:none}
.ed .doc .add{display:block;margin:4px 0 0;font:400 12px "Exo 2",sans-serif;color:#8d8cf0;cursor:pointer;text-transform:none;letter-spacing:.5px}
.ed .doc .b-cols .cell{outline:1px dashed #6665c033;outline-offset:6px;min-height:40px}
#gut{position:absolute;z-index:30;display:flex;gap:2px;transform:translateX(calc(-100% - 10px))}#gut[hidden]{display:none}
#gut button{width:26px;height:26px;font:400 15px/24px "Exo 2",sans-serif;color:#8d8cf0;background:#05050df2;border:1px solid #6665c066;cursor:pointer;touch-action:none}#gut button:hover{color:#fff;border-color:#8d8cf0}
#gut .hd{cursor:grab}#gut.nr{transform:translateX(-100%)}#gut.rt{transform:translateX(10px)}.ed .doc{position:relative;padding-bottom:140px}
#eb .lb{margin-left:5px}@media(max-width:700px){#eb .lb{display:none}#eb{left:8px;bottom:8px;max-width:calc(100% - 16px);gap:3px}#eb .eb{padding:6px 8px;font-size:12px}}
.mn{position:fixed;z-index:46;background:#05050d;border:1px solid #6665c0;min-width:220px;max-height:min(70vh,520px);overflow:auto;padding:4px;display:flex;flex-direction:column;text-transform:none;font:400 13px "Exo 2",sans-serif;box-shadow:0 8px 30px #000a}
.mn button{display:flex;gap:10px;align-items:center;text-align:left;padding:7px 10px;color:#e8e8e0;cursor:pointer;letter-spacing:.3px}.mn button:hover,.mn button.f{background:#6665c040}
.mn button i{width:20px;text-align:center;font-style:normal;color:#8d8cf0}.mn hr{width:auto;margin:4px 6px;opacity:.25}.mn .on i::after{content:" ✓"}
#ift{position:absolute;z-index:47;display:flex;gap:2px;background:#05050d;border:1px solid #6665c0;padding:2px;text-transform:none}#ift[hidden]{display:none}
#ift button{min-width:30px;height:28px;padding:0 6px;font:600 13px Inter,sans-serif;color:#e8e8e0;cursor:pointer}#ift button:hover{background:#6665c040}
#dln{position:absolute;z-index:29;height:2px;background:#e8b04a;pointer-events:none}#dln[hidden]{display:none}
.ed .doc.dropping{outline:1px dashed #e8b04a;outline-offset:-4px}
#pvw{position:fixed;inset:0;z-index:55;background:#020206e6;display:flex;align-items:center;justify-content:center;gap:16px;flex-direction:column}
#pvw iframe{width:390px;height:min(844px,calc(100vh - 90px));border:1px solid #6665c0;border-radius:16px;background:#04040a}
.ed aside{justify-content:flex-start;overflow:auto;padding-top:44px}.ed aside .ef{display:flex;flex-direction:column;gap:8px;margin-top:14px;text-align:left}.ed aside .ef textarea{min-height:80px}
.ef .row>label{min-width:0}@media(max-width:700px){.ed aside{height:62%}body:has(#p.o) :is(#eb,#et),.ed aside.o~#cd{display:none}}body:has(#p.o) :is(#eb,#et){left:572px}
.lbe #sl .lb text{pointer-events:auto;cursor:move}.lbe #sl .lb text:hover{fill:#e8b04a}.ef input[type=range]{padding:0;accent-color:#8d8cf0}
.ed #mw g{cursor:grab}.mke #m{cursor:crosshair}
.ml{display:flex;flex-direction:column;gap:2px;max-height:60vh;overflow:auto}.ml button{display:flex;justify-content:space-between;gap:12px;text-align:left;padding:6px 8px;color:#e8e8e0;cursor:pointer;font:400 14px Inter,sans-serif}.ml button:hover{background:#6665c040}.ml small{color:#e8e8e080}
`));
let pb,eb,et;
function bar(){if(!on||PV)return;pb.firstChild.textContent=(n()?"● "+n()+" · ":"")+L("Publish","Опубликовать");pb.firstChild.classList.toggle("n",!!n());pb.lastChild.disabled=!n()}
let tt;function toast(t,x){if(!et)return;et.style.bottom=eb.offsetHeight+20+"px";et.textContent=t;et.className=x?"x":"";et.hidden=false;clearTimeout(tt);tt=setTimeout(()=>et.hidden=true,x?12e3:6e3)}
function dialog(title,...c){const b=h("div",{cls:"dlb",role:"dialog","aria-label":title},h("h3",{},title),...c),w=h("div",{cls:"dl",onclick:e=>{if(e.target==w)w.remove()}},b);D.body.append(w);
w.addEventListener("keydown",e=>{if(e.key=="Escape"){e.stopPropagation();w.remove()}});setTimeout(()=>b.querySelector("input,textarea,select,button")?.focus());return w}
const btn=(t,f,ti)=>h("button",{cls:"eb",type:"button",onclick:f,...(ti?{title:ti,"aria-label":ti}:{})},t),
inp=(v,f,a={})=>{const e=h(a.area?"textarea":"input",{cls:"ei",...(a.ph?{placeholder:a.ph}:{}),...(a.type?{type:a.type}:{})});e.value=v??"";e.oninput=()=>f(e.value,e);return e},
sel=(v,opts,f)=>{const s=h("select",{cls:"ei"},...opts.map(([k,t])=>h("option",{value:k},t)));s.value=v;s.onchange=()=>f(s.value);return s},
lab=(t,e)=>h("label",{},t,e);
function menu(x,y,items){D.querySelector(".mn")?.remove();const m=h("div",{cls:"mn",role:"menu"});
for(const it of items){if(it=="-"){m.append(h("hr"));continue}m.append(h("button",{type:"button",role:"menuitem",cls:it.on?"on":"",onclick:()=>{m.remove();it.f()}},h("i",{},it.i||""),it.t))}
D.body.append(m);const r=m.getBoundingClientRect();m.style.left=Math.max(8,Math.min(x,innerWidth-r.width-8))+"px";m.style.top=Math.max(56,Math.min(y,innerHeight-r.height-8))+"px";
let fi=0;const bs=[...m.querySelectorAll("button")];bs[0]?.focus();
m.addEventListener("keydown",e=>{if(e.key=="Escape"){m.remove();e.stopPropagation()}else if(/Arrow(Down|Up)/.test(e.key)){e.preventDefault();fi=(fi+(e.key=="ArrowDown"?1:bs.length-1))%bs.length;bs[fi].focus()}});
setTimeout(()=>D.addEventListener("pointerdown",function f(e){if(!m.contains(e.target)){m.remove();D.removeEventListener("pointerdown",f)}}));return m}

function token(){const i=inp(tok,()=>{},{type:"password",ph:"github_pat_…"});
const w=dialog(L("GitHub access","Доступ к GitHub"),
h("div",{},L("A fine-grained personal access token for ","Fine-grained токен для репозитория "),h("b",{},REPO),L(" with permission Contents: read and write (Actions: read — optional, for build status). It is stored only in this browser.",
" с правом Contents: Read and write (Actions: Read — по желанию, для статуса сборки). Хранится только в этом браузере.")),
h("a",{href:"https://github.com/settings/personal-access-tokens/new",target:"_blank",rel:"noopener"},L("Create a token on GitHub","Создать токен на GitHub")),
lab("Token",i),h("div",{cls:"row"},btn(L("Save","Сохранить"),async()=>{tok=i.value.trim();LS.ascwTok=tok;base={};pend={};
try{const r=await gh("");toast(r.permissions?.push?L("Token OK","Токен работает"):L("Token has no write access","У токена нет права записи"),!r.permissions?.push);w.remove()}catch(e){toast(L("Token rejected: ","Токен не принят: ")+e.message,1)}}),
btn(L("Forget token","Забыть токен"),()=>{tok="";LS.ascwTok="";w.remove()})))}
function upload(file){return new Promise(res=>{const r=new FileReader;r.onload=()=>{
const ext=(file.name.match(/\.(\w+)$/)?.[1]||file.type.split("/")[1]||"png").toLowerCase(),
nm=(file.name.replace(/\.\w+$/,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"img")+"-"+Date.now().toString(36)+"."+ext,u=U+"img/"+nm;
draft["static/img/"+nm]={b:r.result.split(",")[1]};blobs[u]=URL.createObjectURL(file);save();res(u)};r.readAsDataURL(file)})}
const img=u=>{const d=draft["static/"+String(u).slice(U.length)];if(!blobs[u]&&d?.b){const x=atob(d.b),a=new Uint8Array(x.length);for(let i=0;i<x.length;i++)a[i]=x.charCodeAt(i);
blobs[u]=URL.createObjectURL(new Blob([a],{type:"image/"+(u.match(/\.(\w+)$/)?.[1]||"png").replace("jpg","jpeg").replace("svg","svg+xml")}))}return blobs[u]||u}, // unpublished images come from the draft
pickFile=()=>new Promise(r=>{const f=h("input",{type:"file",accept:"image/*"});f.onchange=()=>r(f.files[0]);f.click()});

// ---------- interface texts (data/text.json): nav, brand, button labels ----------
let TX={};
function showText(){D.querySelectorAll("[data-k]").forEach(e=>{const v=TX[e.dataset.k]?.[e.lang];if(v!=null&&e!=D.activeElement)e.textContent=v})}
const setText=(k,l,v)=>{(TX[k]=TX[k]||{})[l]=v;showText();WJ(F.text,TX)};
function editable(){D.querySelectorAll("nav [data-k]").forEach(e=>{if(e.closest("a"))return;e.contentEditable="plaintext-only";e.oninput=()=>setText(e.dataset.k,e.lang,e.textContent)})}
D.addEventListener("keydown",e=>{if(e.key=="Enter"&&e.target.closest?.("nav [contenteditable]"))e.preventDefault()},true);
function texts(){dialog(L("Interface texts","Тексты интерфейса"),...Object.keys(TX).map(k=>h("div",{cls:"row"},...["en","ru"].map(l=>lab(k+" · "+l.toUpperCase(),inp(TX[k][l],v=>setText(k,l,v)))))))}

// ---------- page document: blocks edited in place (same markup as layouts/partials/blocks.html) ----------
let PG=null,DOC=null,HI=[],HR=[],burst=0,bt0,svT,PV=/[?&]preview\b/.test(location.search),gut,ift,dln,CB=null;
const B=()=>PG.blocks??=[],
TYPES=()=>[["p","¶",L("Text","Текст")],["h2","H",L("Heading","Заголовок")],["h3","h",L("Subheading","Подзаголовок")],["quote","❝",L("Quote","Цитата")],
["ul","•",L("List","Список")],["ol","1.",L("Numbered list","Нумерованный список")],"-",["img","🖼",L("Image","Изображение")],["cols","◫",L("Two columns","Две колонки")],
["card","▤",L("Fact card","Карточка фактов")],["hr","―",L("Divider","Разделитель")],"-",["links","☰",L("Links to subpages","Ссылки на подстраницы")],["head","▀",L("Page header","Шапка страницы")]],
mk=k=>({p:{t:"p"},h2:{t:"h",lv:2},h3:{t:"h",lv:3},quote:{t:"quote"},ul:{t:"list"},ol:{t:"list",ord:true},img:{t:"img",al:"center"},cols:{t:"cols",c:[{t:"text"},{t:"text"}]},
card:{t:"card",rows:[{},{}]},hr:{t:"hr"},links:{t:"links"},head:{t:"head"}})[k],
TXT=new Set(["p","h","quote","list"]);
// stored HTML is limited to a few tags: inline (b, i, s, a, code, br), list items, and for columns also paragraphs, subheadings and lists
function clean(html,mode){const t=D.createElement("template");t.innerHTML=html;
const INL={B:"b",STRONG:"b",I:"i",EM:"i",S:"s",STRIKE:"s",DEL:"s",A:"a",BR:"br",CODE:"code"},BLK={P:"p",DIV:"p",H1:"h3",H2:"h3",H3:"h3",H4:"h3",UL:"ul",OL:"ol",LI:"li",BLOCKQUOTE:"p"},
walk=n=>[...n.childNodes].map(c=>{if(c.nodeType==3)return esc(c.data.replace(/\u00a0/g," "));if(c.nodeType!=1)return"";
const g=INL[c.tagName]||(mode=="block"&&BLK[c.tagName])||(mode=="li"&&c.tagName=="LI"&&"li"),in_=walk(c);if(!g)return in_+(mode!="inline"&&/^(P|DIV)$/.test(c.tagName)?"<br>":"");
if(g=="br")return"<br>";if(g=="a"){const u=c.getAttribute("href")||"";return/^(https?:|\/|#|mailto:)/i.test(u)?`<a href="${esc(u)}">${in_}</a>`:in_}return`<${g}>${in_}</${g}>`}).join("");
let r=walk(t.content).replace(/(<br>)+(<\/(p|li|h3)>|$)/g,"$2").replace(/<(p|li|h3|b|i|s)><\/\1>/g,"").trim();
if(mode=="li"&&r&&!/^<li>/.test(r))r="<li>"+r.replace(/<\/?li>/g,"")+"</li>";
if(mode=="block"&&r&&!/^<(p|h3|ul|ol)>/.test(r))r="<p>"+r+"</p>";return r}
const plain=h=>{const t=D.createElement("template");t.innerHTML=(h||"").replace(/<\/(li|p)>|<br>/g," $&");return t.content.textContent.trim()};
// header title / description belong to the page itself unless the header has its own text (the home page)
const bound=(b,f)=>b.t=="head"&&(f=="t_"||f=="d_")&&!b[f+"en"]&&!b[f+"ru"],
pf=(f,l)=>(f=="t_"?"title":"description")+(l=="ru"?"_ru":""),
gv=(b,o,f,l)=>bound(b,f)?PG[pf(f,l)]||"":o[f+l]||"",
sv=(b,o,f,l,v)=>{if(bound(b,f))PG[pf(f,l)]=v;else if(v)o[f+l]=v;else delete o[f+l]},
other=l=>l=="ru"?"en":"ru";
function state(){return JSON.stringify({b:B(),t:[PG.title,PG.title_ru,PG.description,PG.description_ru]})}
function snap1(){if(!burst){HI.push(state());HR=[];if(HI.length>200)HI.shift()}burst=1;clearTimeout(bt0);bt0=setTimeout(()=>burst=0,1200)}
function snapN(){HI.push(state());HR=[];burst=0}
function store(){clearTimeout(svT);svT=setTimeout(()=>WJ(PAGE,PG),250)}
function undo(back){const a=back?HI:HR,o=back?HR:HI;if(!a.length)return;o.push(state());const s=JSON.parse(a.pop());PG.blocks=s.b;[PG.title,PG.title_ru,PG.description,PG.description_ru]=s.t;store();render()}
function commit(){snapN();store();render()}
// one editable text field: data-f = field prefix, data-m = cleaning mode (plain | inline | li | block); empty fields show the other language as a hint
function E(tag,b,o,f,m,a="",def){const l=HT.lang,v=gv(b,o,f,l),w=gv(b,o,f,other(l)),ph=w?other(l).toUpperCase()+" · "+plain(w).slice(0,90):def||({k_:L("Kicker","Надзаголовок"),t_:L("Title","Название"),a_:L("Second line","Вторая строка"),
d_:L("Description","Описание"),cap_:L("Caption","Подпись"),cite_:L("Source","Источник")}[f]||L("Write…","Пишите…"));
if(!ED)return v||w?`<${tag}${a}>${v||w}</${tag}>`:"";
return`<${tag}${a} data-f="${f}" data-m="${m}" contenteditable="${m=="plain"?"plaintext-only":"true"}" data-ph="${esc(ph)}" spellcheck="true">${v}</${tag}>`}
let ED=1;
function rb(b,i){const di=ED?` data-i="${i}"`:"",l=HT.lang;
switch(b.t){
case"head":{const own=b.k_en||b.k_ru,kd={k_en:TX.wip?.en||"",k_ru:TX.wip?.ru||TX.wip?.en||""}; // without its own kicker the header shows the shared "work in progress" text
return`<header class="b-head${b.tall?" tall":""}"${di}>${E("p",b,own||ED?b:kd,"k_","plain",' class="k"',own?null:kd["k_"+l])}<h1>${E("span",b,b,"t_","plain")}${b.a_en||b.a_ru||b.acc?`<b>${E("span",b,b,"a_","plain")}</b>`:""}</h1><hr>${E("p",b,b,"d_","plain",' class="ds"')}</header>`}
case"h":return E("h"+(b.lv||2),b,b,"","plain",di);
case"p":return E("p",b,b,"","inline",di);
case"quote":return`<blockquote${di}>${E("p",b,b,"","inline")}${E("cite",b,b,"cite_","plain")}</blockquote>`;
case"list":{const t=b.ord?"ol":"ul",e=E(t,b,b,"","li",di);return ED?e.replace(/data-ph="([^"]*)"([^>]*)><\/(ul|ol)>$/,'data-ph="$1"$2><li data-ph="$1"></li></$3>'):e}
case"img":return`<figure class="b-img al-${b.al||"center"}"${di}>${b.src?`<img src="${img(b.src)}" alt=""${ED?' data-pick=""':""}>`:ED?`<button type="button" class="pi" data-pick="">🖼 ${L("Choose an image or drop a file here","Выберите изображение или перетащите файл")}</button>`:""}${E("figcaption",b,b,"cap_","plain")}</figure>`;
case"card":return`<aside class="b-card"${di}>${b.src?`<img src="${img(b.src)}" alt=""${ED?' data-pick=""':""}>`:""}${E("h4",b,b,"t_","plain")}<dl>${(b.rows||[]).map((r,j)=>
`<div>${E("dt",b,r,"k_","plain",` data-r="${j}"`,L("Property","Свойство"))}${E("dd",b,r,"v_","inline",` data-r="${j}"`,L("Value","Значение"))}</div>`).join("")}</dl>${ED?`<button type="button" class="add" data-act="row">+ ${L("Row","Строка")}</button>`:""}</aside>`;
case"cols":return`<div class="b-cols"${di}>${(b.c||[]).map((c,j)=>`<div class="cell">${c.t=="img"?`<figure class="b-img">${c.src?`<img src="${img(c.src)}" alt=""${ED?` data-pick="" data-c="${j}"`:""}>`:ED?`<button type="button" class="pi" data-pick="" data-c="${j}">🖼</button>`:""}${E("figcaption",b,c,"cap_","plain",` data-c="${j}"`)}</figure>`
:E("div",b,c,"","block",` data-c="${j}"`)}</div>`).join("")}</div>`;
case"hr":return`<hr class="b-hr"${di}>`;
case"links":return`<ul class="b-links"${di}>${shown(b).map(q=>`<li${q.nw?' class="nw"':""}><a href="${U+q.src.replace(/_index\.md$/,"")}">${esc(l=="ru"?q.ru||q.en:q.en)}</a></li>`).join("")||(ED?`<li>${L("No subpages yet — add one in the block menu ⠿","Подстраниц пока нет — добавьте в меню блока ⠿")}</li>`:"")}</ul>`}
return""}
function render(){if(!DOC)return;const a=D.activeElement?.closest?.("[data-f]"),ai=a?.closest("[data-i]")?.dataset.i,af=a?.dataset.f;
DOC.innerHTML=B().map(rb).join("")+(ED&&!B().length?`<button type="button" class="eb" data-act="first" style="display:block;margin:0 auto">+ ${L("Add the first block","Добавить первый блок")}</button>`:"");
if(ED){DOC.append(gut,dln);if(CB!=null&&!DOC.querySelector(`[data-i="${CB}"]`))CB=null;gutAt(CB)}
if(ai!=null)focusF(+ai,af)}
function focusF(i,f,end=1){const k=DOC.querySelector(`[data-i="${i}"]`);if(!k)return;const e=f!=null?(k.matches(`[data-f="${f}"]`)?k:k.querySelector(`[data-f="${f}"]`)):k.matches("[data-f]")?k:k.querySelector("[data-f]");
if(!e)return;e.focus();const r=D.createRange();r.selectNodeContents(e);r.collapse(!end);const s=getSelection();s.removeAllRanges();s.addRange(r)}
function insert(b,at,focus=1){B().splice(at,0,b);commit();CB=at;gutAt(at);if(focus){if(b.t=="img"&&!b.src)pickImg(b);else focusF(at,null,0)}}
async function pickImg(o,file){file=file||await pickFile();if(!file)return;snapN();o.src=await upload(file);store();render()}
function convert(i,k){const b=B()[i],n=mk(k),l=["en","ru"];snapN();
for(const x of l){let v=b[x]||"";if(b.t=="list")v=v.replace(/<\/li><li>/g,"<br>").replace(/<\/?li>/g,"");if(n.t=="list"&&v)v="<li>"+v.split(/<br>/).join("</li><li>")+"</li>";if(n.t=="h")v=esc(plain(v));if(v)n[x]=v}
if(b.cite_en)n.cite_en=b.cite_en;if(b.cite_ru)n.cite_ru=b.cite_ru;B()[i]=n;store();render();focusF(i)}
// block gutter: + inserts after the block, ⠿ opens the block menu (click) or moves the block (drag)
function gutAt(i){if(!gut)return;const k=i!=null&&DOC.querySelector(`[data-i="${i}"]`);gut.hidden=!k;DOC.querySelectorAll(".cur").forEach(e=>e.classList.remove("cur"));if(!k)return;
k.classList.add("cur");const d=DOC.getBoundingClientRect(),r=k.getBoundingClientRect(),
rt=getComputedStyle(k).float=="right"&&r.right+70<innerWidth, // right-floated card / image: buttons on its outer side, not over the wrapping text
nr=!rt&&r.left<70;gut.classList.toggle("nr",nr);gut.classList.toggle("rt",rt); // phones: above the right end
gut.style.top=r.top-d.top-(nr?30:0)+"px";gut.style.left=(nr||rt?r.right:r.left)-d.left+"px";gut.dataset.i=i}
function addMenu(i,x,y,replace){menu(x,y,TYPES().map(t=>t=="-"?t:{i:t[1],t:t[2],f:()=>{const b=mk(t[0]);if(replace){snapN();B()[i]=b;store();render();b.t=="img"?pickImg(b):focusF(i,null,0)}else insert(b,i+1)}}))}
function blockMenu(i,x,y){const b=B()[i],N=B().length,set=(k,v)=>{snapN();if(v==null)delete b[k];else b[k]=v;store();render()},items=[];
if(TXT.has(b.t))items.push(...TYPES().slice(0,6).map(t=>({i:t[1],t:t[2],on:(t[0]=="p"&&b.t=="p")||(t[0]=="h2"&&b.t=="h"&&b.lv!=3)||(t[0]=="h3"&&b.t=="h"&&b.lv==3)||(t[0]=="quote"&&b.t=="quote")||(t[0]=="ul"&&b.t=="list"&&!b.ord)||(t[0]=="ol"&&b.t=="list"&&b.ord),f:()=>convert(i,t[0])})),"-");
if(b.t=="img")items.push(...[["center","▣",L("Centred, text width","По центру, ширина текста")],["full","▭",L("Full strip width","Во всю ширину ленты")],["left","◧",L("Left, text wraps","Слева, текст обтекает")],["right","◨",L("Right, text wraps","Справа, текст обтекает")]]
.map(([a,ic,t])=>({i:ic,t,on:(b.al||"center")==a,f:()=>set("al",a)})),{i:"🖼",t:L("Replace image…","Заменить изображение…"),f:()=>pickImg(b)},"-");
if(b.t=="card")items.push({i:"🖼",t:b.src?L("Replace image…","Заменить изображение…"):L("Add image…","Добавить изображение…"),f:()=>pickImg(b)},...(b.src?[{i:"✕",t:L("Remove image","Убрать изображение"),f:()=>set("src")}]:[]),
{i:"+",t:L("Add row","Добавить строку"),f:()=>{snapN();(b.rows??=[]).push({});store();render()}},...((b.rows||[]).length?[{i:"−",t:L("Remove last row","Убрать последнюю строку"),f:()=>{snapN();b.rows.pop();store();render()}}]:[]),"-");
if(b.t=="cols")b.c.forEach((c,j)=>items.push({i:c.t=="img"?"¶":"🖼",t:(j?L("Right column: ","Правая колонка: "):L("Left column: ","Левая колонка: "))+(c.t=="img"?L("text","текст"):L("image","изображение")),
f:()=>{snapN();b.c[j]=c.t=="img"?{t:"text"}:{t:"img"};store();render()}})),b.t=="cols"&&items.push("-");
if(b.t=="head")items.push({i:"↕",t:L("Centred on the screen","По центру экрана"),on:!!b.tall,f:()=>set("tall",b.tall?null:true)},
{i:"B",t:L("Second (accent) line","Вторая (акцентная) строка"),on:!!(b.a_en||b.a_ru||b.acc),f:()=>{snapN();if(b.a_en||b.a_ru||b.acc){delete b.a_en;delete b.a_ru;delete b.acc}else b.acc=true;store();render()}},
...(b.t_en||b.t_ru||b.d_en||b.d_ru?[{i:"↺",t:L("Use the page title and description","Взять название и описание страницы"),f:()=>{snapN();["t_en","t_ru","d_en","d_ru"].forEach(k=>delete b[k]);store();render()}}]:[]),"-");
if(b.t=="links")items.push({i:"✎",t:L("Edit links…","Ссылки…"),f:()=>links(b)},{i:"+",t:L("New subpage…","Новая подстраница…"),f:()=>newPage()},"-");
items.push({i:"↑",t:L("Move up","Выше"),f:()=>move(i,i-1)},{i:"↓",t:L("Move down","Ниже"),f:()=>move(i,i+1)},
{i:"⧉",t:L("Duplicate","Дублировать"),f:()=>insert(JSON.parse(JSON.stringify(b)),i+1,0)},{i:"🗑",t:L("Delete","Удалить"),f:()=>{snapN();B().splice(i,1);CB=null;store();render()}});
if(!i)items.splice(items.findIndex(x=>x.i=="↑"),1);if(i==N-1)items.splice(items.findIndex(x=>x.i=="↓"),1);menu(x,y,items)}
function move(i,j){if(j<0||j>=B().length)return;snapN();const [b]=B().splice(i,1);B().splice(j,0,b);CB=j;store();render()}
const caretAtStart=e=>{const s=getSelection();if(!s.rangeCount||!s.isCollapsed)return 0;const r=D.createRange();r.selectNodeContents(e);r.setEnd(s.anchorNode,s.anchorOffset);return!r.toString().length&&!r.cloneContents().querySelector?.("img")};
function docInit(){DOC.classList.add("edoc");
gut=h("div",{id:"gut",hidden:""},h("button",{type:"button",title:L("Add a block","Добавить блок"),"aria-label":L("Add a block","Добавить блок"),
onclick:e=>{const r=e.currentTarget.getBoundingClientRect();addMenu(+gut.dataset.i,r.left,r.bottom+4)}},"+"),
h("button",{type:"button",cls:"hd",title:L("Drag to move · click for block options","Перетащите, чтобы переместить · клик — настройки блока"),"aria-label":L("Block options","Настройки блока")},"⠿"));
dln=h("div",{id:"dln",hidden:""});
ift=h("div",{id:"ift",hidden:""},...[["B","bold",L("Bold","Жирный")+" (Ctrl+B)"],["I","italic",L("Italic","Курсив")+" (Ctrl+I)"],["S","strikeThrough",L("Strikethrough","Зачёркнутый")],["🔗","link",L("Link","Ссылка")+" (Ctrl+K)"],["⌫","removeFormat",L("Clear formatting","Убрать оформление")]]
.map(([t,c,ti])=>h("button",{type:"button",title:ti,"aria-label":ti,onmousedown:e=>{e.preventDefault();fmt2(c)}},t)));D.body.append(ift);
let hT;DOC.addEventListener("mouseover",e=>{if(gut.contains(e.target))return clearTimeout(hT);const k=e.target.closest("[data-i]");clearTimeout(hT);if(k&&!DG&&+k.dataset.i!==CB)hT=setTimeout(()=>gutAt(CB=+k.dataset.i),250)});
DOC.addEventListener("pointerdown",e=>{const k=e.target.closest("[data-i]");if(k)gutAt(CB=+k.dataset.i)});
DOC.addEventListener("focusin",e=>{const k=e.target.closest("[data-i]");if(k)gutAt(CB=+k.dataset.i)});
DOC.addEventListener("input",e=>{const el=e.target.closest("[data-f]");if(!el)return;const k=el.closest("[data-i]"),i=+k.dataset.i,b=B()[i],l=HT.lang,f=el.dataset.f,m=el.dataset.m;
const o=el.dataset.r!=null?b.rows[+el.dataset.r]:el.dataset.c!=null?b.c[+el.dataset.c]:b;
if(el.innerHTML=="<br>")el.innerHTML="";
if(b.t=="p"&&f==""){const t=el.textContent,mt=t.match(/^(#{2,3}|[-*]|1\.|>)\s/)||(t=="---"&&[t]); // Markdown-like shortcuts at the start of a paragraph
if(mt){const k2={"##":"h2","###":"h3","-":"ul","*":"ul","1.":"ol",">":"quote","---":"hr"}[mt[1]||mt[0]];snapN();b[l]=clean(el.innerHTML,"inline").replace(/^(#{2,3}|[-*]|1\.|&gt;|---)\s?/,"");if(!b[l])delete b[l];
if(k2=="hr"){B()[i]={t:"hr"};B().splice(i+1,0,{t:"p"});store();render();focusF(i+1)}else convert(i,k2);return}}
snap1();sv(b,o,f,l,m=="plain"?esc(el.textContent):clean(el.innerHTML,m));store();if(bound(b,f)&&f=="t_")D.title=(PG[pf(f,l)]||"")+" · ASCW"});
DOC.addEventListener("keydown",keys);
DOC.addEventListener("paste",paste);
DOC.addEventListener("click",e=>{const p=e.target.closest("[data-pick]");if(p){const k=p.closest("[data-i]"),b=B()[+k.dataset.i];pickImg(p.dataset.c!=null?b.c[+p.dataset.c]:b);return}
const fb=e.target.closest("[data-act=first]");if(fb){const r=fb.getBoundingClientRect();addMenu(-1,r.left,r.bottom+4);return}
const a=e.target.closest("[data-act=row]");if(a){const b=B()[+a.closest("[data-i]").dataset.i];snapN();(b.rows??=[]).push({});store();render()}
if(e.target.closest("a")&&e.target.closest("[contenteditable]"))e.preventDefault()});
// drag & drop of image files: a new image block where the file is dropped
DOC.addEventListener("dragover",e=>{if([...e.dataTransfer.items].some(x=>x.kind=="file")){e.preventDefault();DOC.classList.add("dropping")}});
DOC.addEventListener("dragleave",()=>DOC.classList.remove("dropping"));
DOC.addEventListener("drop",e=>{DOC.classList.remove("dropping");const f=[...e.dataTransfer.files].filter(f=>f.type.startsWith("image/"));if(!f.length)return;e.preventDefault();
let at=dropAt(e.clientY);f.forEach(file=>{const b={t:"img",al:"center"};B().splice(at++,0,b);pickImg(b,file)})});
gut.querySelector(".hd").addEventListener("pointerdown",gDown);
D.addEventListener("selectionchange",selTb);addEventListener("scroll",selTb,{passive:true});addEventListener("resize",()=>gutAt(CB));
D.addEventListener("keydown",e=>{const k=e.key.toLowerCase();if((e.ctrlKey||e.metaKey)&&(k=="z"||k=="y")&&!e.target.closest?.("input,textarea,select,nav,.dl")){e.preventDefault();undo(k=="z"&&!e.shiftKey)}})}
function dropAt(y){const ks=[...DOC.querySelectorAll(":scope>[data-i]")];for(const k of ks){const r=k.getBoundingClientRect();if(y<r.top+r.height/2)return+k.dataset.i}return B().length}
let DG=null;
function gDown(e){e.preventDefault();const i=+gut.dataset.i;DG={i,y:e.clientY,mv:0,to:i};const t=e.currentTarget;t.setPointerCapture(e.pointerId);
t.onpointermove=m=>{if(Math.abs(m.clientY-DG.y)>4)DG.mv=1;if(!DG.mv)return;DG.to=dropAt(m.clientY);const ks=[...DOC.querySelectorAll(":scope>[data-i]")],d=DOC.getBoundingClientRect(),
k=ks.find(x=>+x.dataset.i==DG.to),r=k?k.getBoundingClientRect():ks.at(-1).getBoundingClientRect();dln.hidden=false;dln.style.top=(k?r.top-d.top-8:r.bottom-d.top+6)+"px";dln.style.left=r.left-d.left+"px";dln.style.width=r.width+"px"};
t.onpointerup=m=>{t.onpointermove=t.onpointerup=null;dln.hidden=true;const g=DG;DG=null;if(!g.mv){const r=t.getBoundingClientRect();return blockMenu(g.i,r.left,r.bottom+4)}
let to=g.to>g.i?g.to-1:g.to;if(to!=g.i)move(g.i,to)}}
function keys(e){const el=e.target.closest?.("[data-f]");if(!el)return;const k=el.closest("[data-i]"),i=+k.dataset.i,b=B()[i],l=HT.lang,m=el.dataset.m;
if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()=="k"&&m!="plain"){e.preventDefault();fmt2("link");return}
if(e.key=="/"&&b.t=="p"&&!el.textContent){e.preventDefault();const r=el.getBoundingClientRect();addMenu(i,r.left,r.bottom+4,1);return}
if(e.key=="Enter"&&!e.shiftKey){
if(m=="li"){const s=getSelection(),li=s.anchorNode&&(s.anchorNode.nodeType==1?s.anchorNode:s.anchorNode.parentElement).closest("li");
if(li&&!li.textContent&&li==el.lastElementChild){e.preventDefault();li.remove();el.dispatchEvent(new Event("input",{bubbles:true}));insert({t:"p"},i+1)}return}
if(m=="block")return;e.preventDefault();if(!/^(p|h|quote)$/.test(b.t)||el.dataset.f!="")return;
// split the paragraph / heading at the caret: the rest goes to a new paragraph
const s=getSelection();if(!s.rangeCount)return;const r=s.getRangeAt(0);r.deleteContents();const tail=D.createRange();tail.selectNodeContents(el);tail.setStart(r.endContainer,r.endOffset);
const t=h("div");t.append(tail.extractContents());snapN();const rest=b.t=="h"?esc(t.textContent):clean(t.innerHTML,"inline");
sv(b,b,"",l,b.t=="h"?esc(el.textContent):clean(el.innerHTML,"inline"));
B().splice(i+1,0,rest?{t:"p",[l]:rest}:{t:"p"});CB=i+1;store();render();focusF(i+1,null,0);return}
if(e.key=="Backspace"&&TXT.has(b.t)&&el.dataset.f==""&&caretAtStart(el)){const pv=B()[i-1];
if(!el.textContent&&!el.querySelector("img")&&(m!="li"||el.children.length<=1)){e.preventDefault();snapN();B().splice(i,1);store();render();if(pv)focusF(i-1);return}
if(b.t=="p"&&pv?.t=="p"){e.preventDefault();snapN();const a=pv[l]||"",mk2=`<span id="cj"></span>`;pv[l]=a+(b[l]||"");B().splice(i,1);store();render();
const pe=DOC.querySelector(`[data-i="${i-1}"]`);pe.innerHTML=a+mk2+(pv[l].slice(a.length));const j=pe.querySelector("#cj"),r=D.createRange();r.setStartBefore(j);r.collapse(true);j.remove();pe.focus();getSelection().removeAllRanges();getSelection().addRange(r)}}}
function paste(e){const el=e.target.closest?.("[data-f]");if(!el)return;const cd=e.clipboardData,f=[...cd.files].find(f=>f.type.startsWith("image/")),k=el.closest("[data-i]"),i=+k.dataset.i;
e.preventDefault();if(f){insert({t:"img",al:"center"},i+1,0);pickImg(B()[i+1],f);return}
const t=(cd.getData("text/plain")||"").replace(/\r/g,"");if(el.dataset.m=="plain"||el.dataset.m=="li"||el.dataset.m=="block"){D.execCommand("insertText",false,el.dataset.m=="plain"?t.replace(/\s*\n\s*/g," "):t);return}
const parts=t.split(/\n\s*\n/).map(x=>x.replace(/\s*\n\s*/g," ").trim()).filter(Boolean);if(!parts.length)return;D.execCommand("insertText",false,parts[0]);
if(parts.length>1){snapN();B().splice(i+1,0,...parts.slice(1).map(x=>({t:"p",[HT.lang]:esc(x)})));store();render();focusF(i+parts.length-1)}}
function selTb(){const s=getSelection(),el=s.rangeCount&&!s.isCollapsed&&(s.anchorNode?.nodeType==1?s.anchorNode:s.anchorNode?.parentElement)?.closest?.('.doc [contenteditable="true"]');
if(!el||ift.contains(D.activeElement)){if(!ift.contains(D.activeElement))ift.hidden=true;return}const r=s.getRangeAt(0).getBoundingClientRect();ift.hidden=false;
ift.style.left=Math.max(8,Math.min(r.left+scrollX+r.width/2-ift.offsetWidth/2,innerWidth-ift.offsetWidth-8))+"px";ift.style.top=r.top+scrollY-ift.offsetHeight-8+"px"}
function fmt2(c){const s=getSelection(),el=(s.anchorNode?.nodeType==1?s.anchorNode:s.anchorNode?.parentElement)?.closest?.('[contenteditable="true"]');if(!el)return;
if(c=="link"){const r=s.rangeCount&&s.getRangeAt(0).cloneRange(),cur=(s.anchorNode.parentElement?.closest("a"))?.getAttribute("href")||"https://",i=inp(cur,()=>{}),
w=dialog(L("Link","Ссылка"),lab(L("Address (empty — remove the link)","Адрес (пусто — убрать ссылку)"),i),h("div",{cls:"row"},btn("OK",ok)));
i.onkeydown=e=>{if(e.key=="Enter")ok()};function ok(){w.remove();el.focus();getSelection().removeAllRanges();getSelection().addRange(r);const u=i.value.trim();
D.execCommand(u&&u!="https://"?"createLink":"unlink",false,u);el.dispatchEvent(new Event("input",{bubbles:true}))}return}
D.execCommand(c);el.dispatchEvent(new Event("input",{bubbles:true}))}

// ---------- page settings, new pages, subpages ----------
const dir=PAGE.replace(/^content\/|_index\.md$/g,"");
let KIDS=[];
const kids=()=>KIDS.filter(q=>!q.del);
async function initKids(){try{KIDS=JSON.parse(D.getElementById("kids")?.textContent||"[]")}catch{KIDS=[]}
for(const p in draft){const m=p.match(new RegExp(`^content/${dir.replace(/[/.-]/g,"\\$&")}([^/]+)/_index\\.md$`));if(!m)continue;const q=KIDS.find(k=>"content/"+k.src==p);
if(draft[p].del){if(q)q.del=1;continue}let o={};try{o=JSON.parse(draft[p].t)}catch{}
if(q){q.en=o.title||q.en;q.ru=o.title_ru||o.title||q.ru}else KIDS.push({src:p.slice(8),en:o.title||m[1],ru:o.title_ru||o.title||m[1],nw:1,w:o.weight||0})}
KIDS.sort((a,b)=>(a.nw?1:0)-(b.nw?1:0))}
const pageObj=async p=>{const t=await read(p);if(t==null)return null;try{return JSON.parse(t)}catch{return null}};
function newPage(){let en,ruI,sl;const slug=v=>v.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const w=dialog(L("New subpage","Новая подстраница"),lab(L("Title","Название")+" · EN",en=inp("",v=>{if(!sl.dataset.t)sl.value=slug(v)})),
lab(L("Title","Название")+" · RU",ruI=inp("",()=>{})),lab(L("Address","Адрес")+" ("+U+dir+"…)",sl=inp("",(v,e)=>{e.dataset.t=1})),
h("div",{cls:"row"},btn(L("Create and open","Создать и открыть"),async()=>{const s=slug(sl.value);if(!s||!en.value.trim())return toast(L("Title (EN) and address are required","Нужны название (EN) и адрес"),1);
const p=`content/${dir}${s}/_index.md`;if(await read(p)!=null)return toast(L("This address is taken","Такой адрес уже занят"),1);
if(!B().some(b=>b.t=="links")){B().push({t:"links"});await WJ(PAGE,PG)} // so the new page can be reached from this one
await WJ(p,{title:en.value.trim(),title_ru:ruI.value.trim(),description:"",description_ru:"",weight:(KIDS.length+1)*10,blocks:[{t:"head"},{t:"p"}]});
await new Promise(r=>setTimeout(r,300));location.href=U+dir+s+"/"})));en.focus()}
async function delPage(){const up=dir.replace(/[^/]+\/$/,"");if(!up)return toast(L("This page cannot be deleted","Эту страницу удалить нельзя"),1);
if(kids().length)return toast(L("Delete its subpages first","Сначала удалите её подстраницы"),1);
if(!confirm(L("Delete this page when publishing?","Удалить эту страницу при публикации?")))return;
await src(PAGE);if(base[PAGE]==null)delete draft[PAGE];else draft[PAGE]={del:1};save();location.href=U+up}
function settings(){const S=(k,v)=>{snap1();if(v)PG[k]=v;else delete PG[k];store();render()},bgv=()=>D.querySelector("main").style.setProperty("--bg",PG.bg?PG.bg=="none"?"none":`url(${img(PG.bg)})`:"");
dialog(L("Page","Страница"),h("div",{cls:"row"},lab(L("Title","Название")+" · EN",inp(PG.title,v=>S("title",v))),lab(L("Title","Название")+" · RU",inp(PG.title_ru,v=>S("title_ru",v)))),
h("div",{cls:"row"},lab(L("Description (also shown in link previews)","Описание (видно и в превью ссылок)")+" · EN",inp(PG.description,v=>S("description",v),{area:1})),lab(L("Description","Описание")+" · RU",inp(PG.description_ru,v=>S("description_ru",v),{area:1}))),
h("div",{cls:"row"},lab(L("Background","Фон"),h("div",{cls:"row"},btn(L("Image…","Изображение…"),async()=>{const f=await pickFile();if(f){PG.bg=await upload(f);store();bgv()}}),
btn(L("None","Без фона"),()=>{PG.bg="none";store();bgv()}),btn(L("Default","По умолчанию"),()=>{delete PG.bg;store();bgv()})))),
h("div",{style:"font-size:12px;color:#e8e8e080"},L("Address: ","Адрес: ")+U+dir),h("div",{cls:"row"},btn("+ "+L("New subpage…","Новая подстраница…"),newPage),btn("🗑 "+L("Delete page","Удалить страницу"),delPage)))}
async function reorder(){const K=kids(),os=await Promise.all(K.map(q=>pageObj("content/"+q.src)));os.forEach((o,i)=>{if(o&&o.weight!=(i+1)*10){o.weight=(i+1)*10;WJ("content/"+K[i].src,o)}})}
// the links block lists the subpages; "hide" (list of page sources) takes pages out of this list without deleting them
const shown=b=>kids().filter(q=>!(b.hide||[]).includes(q.src));
function links(b){const box=h("div",{style:"display:flex;flex-direction:column;gap:8px"}),hid=h("div",{style:"display:flex;flex-direction:column;gap:6px"}),
vis=(q,on)=>{snapN();b.hide=(b.hide||[]).filter(x=>x!=q.src);if(!on)b.hide.push(q.src);if(!b.hide.length)delete b.hide;store();render();rows()},
rows=()=>{box.replaceChildren(...shown(b).map((q,i,K)=>{const set=async(l,v)=>{q[l]=v;const p="content/"+q.src,o=await pageObj(p);if(o){o[l=="en"?"title":"title_ru"]=v;await WJ(p,o)}render()},
sw=async d=>{const j=KIDS.indexOf(K[i+d]),k=KIDS.indexOf(q);if(!K[i+d])return;[KIDS[j],KIDS[k]]=[KIDS[k],KIDS[j]];await reorder();rows();render()};
return h("div",{cls:"row",style:"align-items:flex-end"},lab("EN",inp(q.en,v=>set("en",v))),lab("RU",inp(q.ru,v=>set("ru",v))),btn("↑",()=>sw(-1),L("Up","Выше")),btn("↓",()=>sw(1),L("Down","Ниже")),
btn("✕",()=>vis(q,0),L("Remove from this list (the page stays on the site)","Убрать из списка (страница остаётся на сайте)")))}));
const H=kids().filter(q=>(b.hide||[]).includes(q.src));hid.replaceChildren(...(H.length?[h("div",{style:"font:400 11px 'Exo 2',sans-serif;letter-spacing:1px;color:#e8e8e099;text-transform:uppercase;margin-top:6px"},L("Not in the list","Не в списке"))]:[]),
...H.map(q=>h("div",{cls:"row"},h("span",{},ru()?q.ru||q.en:q.en),btn("+ "+L("Add to the list","Добавить в список"),()=>vis(q,1)))))};
rows();dialog(L("Links to subpages","Ссылки на подстраницы"),box,hid,h("div",{cls:"row"},btn("+ "+L("New subpage…","Новая подстраница…"),newPage)))}
function preview(){const u=new URL(location.href);u.searchParams.set("preview","");const w=h("div",{id:"pvw",onclick:e=>{if(e.target==w)w.remove()}},h("iframe",{src:u.href,title:L("Phone preview","Предпросмотр на телефоне")}),
btn(L("Close preview","Закрыть предпросмотр"),()=>w.remove()));D.body.append(w)}

// ---------- map: markers (form in the side panel), timeline events, countries ----------
const MP=window.MAP;let MKon=0,PF=null;
const KINDS=()=>[["●",L("Circle","Круг")],["★",L("Star","Звезда")],["■",L("Square","Квадрат")],["▲",L("Triangle","Треугольник")],["◆",L("Diamond","Ромб")],
["✕",L("Cross","Крест")],["⚓",L("Anchor","Якорь")],["⚑",L("Flag","Флаг")],["♜",L("Fort","Крепость")],["◎",L("Ring","Кольцо")]],
ll=(my,mx)=>({a:+(90-my/MP.H*180).toFixed(3),o:+(mx/MP.W*360-180).toFixed(3)}),
saveMK=()=>{WJ(F.mk,MK);MP.markers()};
function pform(el,key){const a=D.getElementById("p");if(PF?.key==key&&a.contains(PF))return 0;PF?.remove();PF=el;el.key=key;a.append(el);return 1}
async function mapInit(){if(!MP)return;
window.MK=await J(F.mk,MK);window.EV=await J(F.ev,EV);window.COU=await J(F.co,COU);MP.redraw();
MP.onTap=(mx,my,i)=>{if(i!=null){MP.pickM(i);return 1}if(!MKon)return 0;MK.push({...ll(my,mx),n:"",r:""});saveMK();MP.pickM(MK.length-1);return 1};
MP.onMarker=i=>mkForm(i);lbInit();MP.onPanel=r=>coForm(r);if(MP.sel())coForm(MP.sel());
D.getElementById("pc").addEventListener("click",()=>{PF?.remove();PF=null;const n=MK.length;window.MK=MK.filter(q=>q.n||q.r||q.ten||q.tru);if(MK.length!=n)saveMK()}); // unnamed new markers are dropped on close
const mw=D.getElementById("mw");let dg=null;
mw.addEventListener("pointerdown",e=>{const g=e.target.closest("[data-m]");if(!g)return;e.stopPropagation();mw.setPointerCapture(e.pointerId);dg={i:+g.dataset.m,x:e.clientX,y:e.clientY,mv:0}});
mw.addEventListener("pointermove",e=>{if(!dg)return;dg.mv+=Math.abs(e.clientX-dg.x)+Math.abs(e.clientY-dg.y);dg.x=e.clientX;dg.y=e.clientY;if(dg.mv<4)return;
const {mx,my}=MP.toMap(e);Object.assign(MK[dg.i],ll(my,mx));MP.markers()});
mw.addEventListener("pointerup",()=>{if(!dg)return;const d=dg;dg=null;if(d.mv<4)MP.pickM(d.i);else{saveMK();if(PF?.key=="m"+d.i){PF=null;mkForm(d.i)}}});
D.getElementById("xt")?.after(h("button",{type:"button",id:"xe",style:"position:absolute;right:56px;top:4px;z-index:2;width:44px;height:44px;font-size:18px;cursor:pointer;color:#e8e8e0a6",title:L("Edit events","Редактировать события"),onclick:events},"✎"))}
function mkForm(i){const q=MK[i];if(!q)return;const pt=D.getElementById("pt"),px=D.getElementById("px"),
ch=(k,v)=>{if(v===""||v==null)delete q[k];else q[k]=v;saveMK();pt.textContent=(ru()?q.r||q.n:q.n||q.r)||"";px.textContent=(ru()?q.tru||q.ten:q.ten||q.tru)||""},
num=(k,ph)=>inp(q[k],v=>ch(k,v===""?"":+v),{type:"number",ph}),
f=h("div",{cls:"ef"},h("div",{cls:"row"},lab(L("Name","Название")+" · EN",inp(q.n,v=>ch("n",v))),lab(L("Name","Название")+" · RU",inp(q.r,v=>ch("r",v)))),
lab(L("Text","Текст")+" · EN",inp(q.ten,v=>ch("ten",v),{area:1})),lab(L("Text","Текст")+" · RU",inp(q.tru,v=>ch("tru",v),{area:1})),
h("div",{cls:"row"},lab(L("Icon","Значок"),sel(q.k|0,KINDS().map(([s,t],j)=>[j,s+" "+t]),v=>ch("k",+v||""))),
lab(L("Font","Шрифт"),sel(q.f||"",[["","Play"],["exo","Exo 2"],["inter","Inter"],["a","Airborne"]],v=>ch("f",v)))),
h("div",{cls:"row"},lab(L("Shown from year","Видна с года"),num("y0","—")),lab(L("to year","по год"),num("y1","—"))),
lab(L("Visible","Видимость"),sel(q.z|0,[[0,L("Always","Всегда")],[1,L("From medium zoom","С среднего приближения")],[2,L("Close-up only","Только вблизи")]],v=>ch("z",+v||""))),
h("div",{cls:"row"},lab(L("Latitude","Широта"),num("a")),lab(L("Longitude","Долгота"),num("o"))),
h("div",{cls:"row"},btn(L("Done","Готово"),()=>D.getElementById("pc").click()),btn("🗑 "+L("Delete","Удалить"),()=>{MK.splice(i,1);saveMK();PF?.remove();PF=null;D.getElementById("pc").click()})));
if(pform(f,"m"+i)&&!q.n&&!q.r)setTimeout(()=>f.querySelector("input").focus())}
function mkList(){const box=h("div",{cls:"ml"}),q0=inp("",v=>rows(v),{ph:L("Search","Поиск")}),
rows=(s="")=>box.replaceChildren(...MK.map((q,i)=>[q,i]).filter(([q])=>(q.n+" "+q.r).toLowerCase().includes(s.toLowerCase())).map(([q,i])=>
h("button",{type:"button",onclick:()=>{w.remove();MP.focus(q.o,q.a);MP.pickM(i)}},(ru()?q.r||q.n:q.n||q.r)||"—",h("small",{},q.y0!=null||q.y1!=null?`${q.y0??"…"}–${q.y1??"…"}`:""))));
rows();const w=dialog(L("Markers","Метки")+" · "+MK.length,q0,box)}
function events(){const box=h("div",{style:"display:flex;flex-direction:column;gap:10px"}),
sv=()=>{EV.sort((a,b)=>a[0]-b[0]);WJ(F.ev,EV);MP.timeline()},
rows=()=>box.replaceChildren(...EV.map((v,i)=>h("div",{cls:"row",style:"align-items:flex-end"},
lab(L("Year","Год"),inp(v[0],x=>{v[0]=+x;WJ(F.ev,EV);MP.timeline()},{type:"number"})),
lab("EN",inp(v[1],x=>{v[1]=x;WJ(F.ev,EV);MP.timeline()},{area:1})),lab("RU",inp(v[2],x=>{v[2]=x;WJ(F.ev,EV);MP.timeline()},{area:1})),
btn("✕",()=>{EV.splice(i,1);sv();rows()},L("Delete","Удалить")))).map(r=>{r.firstChild.style.flex="0 0 80px";return r}));
rows();const w=dialog(L("Timeline events","События хронологии"),box,h("div",{cls:"row"},btn("+ "+L("Event","Событие"),()=>{EV.push([MP.yr(),"",""]);WJ(F.ev,EV);rows();box.lastChild?.querySelector("textarea")?.focus()}),
btn(L("Done","Готово"),()=>{sv();w.remove()})));w.onclick=e=>{if(e.target==w){sv();w.remove()}}}
function coForm(r){const o=COU[r.c]=COU[r.c]||{},t0=()=>{for(const k in o)if(o[k]===""||o[k]==null||(k=="ls"||k=="lo")&&o[k]==1||(k=="lx"||k=="ly")&&!o[k])delete o[k];if(!Object.keys(o).length)delete COU[r.c];WJ(F.co,COU)};let tm;
const ch=(k,v,t=250)=>{o[k]=v;COU[r.c]=o;t0();clearTimeout(tm);tm=setTimeout(()=>MP.redraw(),t)},
rng=(k,a,b,st,f)=>{const i=h("input",{type:"range",min:a,max:b,step:st,cls:"ei"}),n=h("span",{});i.value=o[k]??1;const sh=()=>n.textContent=" "+Math.round(i.value*100)+"%";sh();
i.oninput=()=>{sh();ch(k,+i.value,60)};return lab(h("span",{},f,n),i)};
pform(h("div",{cls:"ef"},h("div",{cls:"row"},lab(L("Name","Название")+" · EN",inp(o.en,v=>ch("en",v),{ph:r.n0})),lab(L("Name","Название")+" · RU",inp(o.ru,v=>ch("ru",v),{ph:r.r0}))),
lab(L("Text","Текст")+" · EN",inp(o.ten,v=>ch("ten",v),{area:1})),lab(L("Text","Текст")+" · RU",inp(o.tru,v=>ch("tru",v),{area:1})),
h("div",{cls:"row"},rng("ls",.3,3,.05,L("Name size","Размер названия")),rng("lo",0,1,.05,L("Name opacity","Прозрачность названия"))),
h("div",{cls:"row"},btn(L("Name back to its place","Вернуть название на место"),()=>{delete o.lx;delete o.ly;ch("lx",0,0)}))),"c"+r.c)}
// country names: drag in the "names" mode (the shift is stored in countries.json as lx / ly, map pixels)
function lbInit(){const sl=D.getElementById("sl");let dg=null;
sl.addEventListener("pointerdown",e=>{const t=e.target.closest("text[data-i]");if(!t||!LBon)return;e.stopPropagation();e.preventDefault();sl.setPointerCapture(e.pointerId);dg={t,id:+t.dataset.i,a:MP.toMap(e),mv:0}});
sl.addEventListener("pointermove",e=>{if(!dg)return;const b=MP.toMap(e),dx=b.mx-dg.a.mx,dy=b.my-dg.a.my;dg.mv=Math.max(dg.mv,Math.abs(dx)+Math.abs(dy));dg.dx=dx;dg.dy=dy;dg.t.setAttribute("transform",`translate(${dx} ${dy})`)});
sl.addEventListener("pointerup",()=>{if(!dg)return;const d=dg;dg=null;MP.pick(d.id);const r=MP.sel();if(!r)return;
if(d.mv>1){const o=COU[r.c]=COU[r.c]||{};o.lx=Math.round((o.lx||0)+d.dx);o.ly=Math.round((o.ly||0)+d.dy);WJ(F.co,COU);PF?.remove();PF=null;coForm(r);MP.redraw()}})}
let LBon=0;

// ---------- on / off ----------
async function start(){on=1;TX=await J(F.text,{});
if(PV){ED=0;HT.classList.add("pv");BT.hidden=true}else{LS.ascwEditOn=1;HT.classList.add("ed");BT.classList.add("on");
const ib=(i,t,f,ti)=>{const b=btn(i,f,ti||t);if(t)b.append(h("span",{cls:"lb"},t));return b};
pb=h("span",{style:"display:contents"},btn("",publish,L("Send all changes to GitHub","Отправить все изменения на GitHub")),btn("↺",discard,L("Discard all unpublished changes","Отменить все неопубликованные изменения")));
eb=h("div",{id:"eb"},pb);et=h("div",{id:"et",hidden:""});D.body.append(eb,et);if(draft[F.text])showText();
if(PAGE&&!/^map\//.test(SRC)&&(PG=await pageObj(PAGE))){
if(NEWP)D.title=(PG.title||"")+" · ASCW";
eb.append(ib("↶","",()=>undo(1),L("Undo","Отменить")+" (Ctrl+Z)"),ib("↷","",()=>undo(0),L("Redo","Повторить")+" (Ctrl+Shift+Z)"),
ib("📄",L("Page","Страница"),settings,L("Title, description, background, subpages","Название, описание, фон, подстраницы")),ib("📱",L("Phone","Телефон"),preview,L("Preview on a phone screen","Как на экране телефона")))}
if(MP)eb.append(ib("📍",L("Add markers","Новые метки"),e=>{MKon^=1;e.currentTarget.classList.toggle("on",!!MKon);HT.classList.toggle("mke",!!MKon);if(MKon&&LBon)D.getElementById("lbb").click();
if(MKon)toast(L("Click the map to place a marker. Drag markers to move them; click one to edit it.","Клик по карте ставит метку. Метки можно перетаскивать, клик по метке — редактировать."))},L("Place markers by clicking the map","Ставить метки кликом по карте")),
ib("☰",L("Markers","Метки"),mkList,L("All markers","Все метки")),
(b=>(b.id="lbb",b))(ib("🏷",L("Country names","Названия стран"),e=>{LBon^=1;e.currentTarget.classList.toggle("on",!!LBon);HT.classList.toggle("lbe",!!LBon);if(LBon&&MKon)eb.querySelector(".eb.on:not(#lbb)")?.click();
if(LBon)toast(L("Drag country names to move them; click a name to change its size and opacity.","Названия стран можно перетаскивать; клик по названию — размер и прозрачность."))},L("Move and adjust country names","Двигать и настраивать названия стран"))),ib("⏱",L("Events","События"),events,L("Timeline events","События хронологии")));
eb.append(ib("⚙","",token,L("GitHub access","Доступ к GitHub")),ib("Aa","",texts,L("Interface texts","Тексты интерфейса")));
editable();bar();if(!tok)toast(L("Edit mode. Changes stay in this browser until you publish them (⚙ — GitHub access).","Режим редактирования. Изменения хранятся в браузере, пока вы их не опубликуете (⚙ — доступ к GitHub)."))}
if(PV&&PAGE&&!/^map\//.test(SRC))PG=draft[PAGE]&&await pageObj(PAGE);
if(PG){if(PG.bg)D.querySelector("main").style.setProperty("--bg",PG.bg=="none"?"none":`url(${img(PG.bg)})`);
if(!Array.isArray(PG.blocks)){PG.blocks=[{t:"head"},...(D.getElementById("kids")?[{t:"links"}]:[])];delete PG.items;delete PG.body_en;delete PG.body_ru;delete PG.width}
DOC=D.querySelector("article.doc")||(NEWP?(D.querySelector("main>section").replaceChildren(h("article",{cls:"doc"})),D.querySelector("article.doc")):null);
if(DOC){await initKids();if(ED)docInit();render()}}
if(MP&&!PV)await mapInit()}
window.EDIT={toggle(){if(on){LS.ascwEditOn="";location.reload()}else start()}};
D.addEventListener("lang",()=>{if(!on)return;bar();showText();render()});
start();
})();
