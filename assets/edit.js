// ASCW site editor. Loaded only when edit mode is on (✎ in the nav; unlocked once per browser by opening any page with ?edit).
// Every change goes into a local draft (localStorage) and is published to GitHub as one commit with the editor's own access token;
// GitHub Actions then rebuilds the site. Source files: content/**/_index.md (JSON front matter), data/text.json (interface texts),
// assets/markers.json, assets/events.json, assets/countries.json (map), static/img/* (uploaded images).
const D=document,HT=D.documentElement,BT=D.getElementById("ed"),U=BT.dataset.u,REPO=BT.dataset.repo,BR="main",
LS=(()=>{try{return localStorage}catch{return{}}})(),
SRC=D.querySelector("meta[name=src]")?.content||"",PAGE=SRC&&"content/"+SRC,
F={text:"data/text.json",mk:"assets/markers.json",ev:"assets/events.json",co:"assets/countries.json"},
ru=()=>HT.lang=="ru",L=(e,r)=>ru()?r:e,
h=(t,a={},...c)=>{const e=D.createElement(t);for(const k in a)k.startsWith("on")?e[k]=a[k]:k=="cls"?e.className=a[k]:e.setAttribute(k,a[k]);e.append(...c.flat().filter(v=>v!=null));return e},
esc=t=>String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
let draft={},base={},pend={},blobs={},on=0,tok=LS.ascwTok||"";
try{draft=JSON.parse(LS.ascwDraft||"{}")}catch{}

// ---------- storage: draft, GitHub ----------
function save(){try{LS.ascwDraft=JSON.stringify(draft)}catch{toast(L("Draft too big to keep after closing the page — publish first","Черновик слишком большой, чтобы пережить закрытие страницы — сначала опубликуйте"),1)}bar()}
async function gh(p,o={}){const r=await fetch(`https://api.github.com/repos/${REPO}/${p}`,{cache:"no-store",...o,headers:{Authorization:"Bearer "+tok,Accept:o.raw?"application/vnd.github.raw+json":"application/vnd.github+json",...(o.body?{"Content-Type":"application/json"}:{})}});
if(!r.ok)throw Error(r.status+" "+(await r.text()).slice(0,200));return o.raw?r.text():r.json()}
function src(p){ // current published source of a file (null if it does not exist); one request per file, writes stay in call order
return pend[p]??=(async()=>{if(p in base)return base[p];
try{base[p]=tok?await gh(`contents/${p}?ref=${BR}`,{raw:1}):await fetch(`https://raw.githubusercontent.com/${REPO}/${BR}/${p}?${Date.now()}`,{cache:"no-store"}).then(r=>r.ok?r.text():Promise.reject(r.status))}
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
.ed [contenteditable]{outline:1px dashed #6665c0aa;outline-offset:3px;cursor:text;min-width:1em;display:inline-block}
.ed [contenteditable]:focus{outline:1px solid #8d8cf0;background:#6665c01f}
.ed .ds{display:block!important}.ed .ds [contenteditable]:empty::before,.ed h1 [contenteditable]:empty::before{content:"…";opacity:.4}
#eb{position:fixed;left:12px;bottom:12px;z-index:40;display:flex;gap:4px;flex-wrap:wrap;max-width:calc(100% - 24px);text-transform:none}
.eb{font:400 13px "Exo 2",sans-serif;letter-spacing:.5px;color:#e8e8e0;background:#020206f2;border:1px solid #6665c0;padding:6px 10px;cursor:pointer;line-height:1.2;min-height:32px}
.eb:hover{background:#6665c040}.eb.on{background:#6665c0;color:#fff}.eb:disabled{opacity:.4;cursor:default}
#eb .eb.n{border-color:#e8b04a;color:#e8b04a}
#et{position:fixed;left:12px;bottom:56px;z-index:41;max-width:min(420px,calc(100% - 24px));font:400 13px "Exo 2",sans-serif;color:#e8e8e0;background:#020206f2;border:1px solid #6665c0;padding:8px 12px;text-transform:none}#et.x{border-color:#e85a4a}
.dl{position:fixed;inset:0;z-index:50;background:#020206b3;display:flex;align-items:center;justify-content:center;padding:16px;text-transform:none}
.dlb{background:#05050d;border:1px solid #6665c0;width:min(640px,100%);max-height:100%;overflow:auto;padding:18px;display:flex;flex-direction:column;gap:10px;font:400 14px "Exo 2",sans-serif;color:#e8e8e0}
.dlb h3{font:400 15px "Exo 2",sans-serif;letter-spacing:2px;text-transform:uppercase;margin:0}
.dlb label{display:flex;flex-direction:column;gap:4px;font-size:11px;letter-spacing:1px;color:#e8e8e099;text-transform:uppercase}
.ei{font:400 14px Inter,sans-serif;color:#e8e8e0;background:#0b0b18;border:1px solid #6665c066;padding:7px 9px;width:100%;text-transform:none;letter-spacing:0}
.ei:focus{outline:none;border-color:#8d8cf0}textarea.ei{resize:vertical;min-height:70px;line-height:1.5}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.row>*{flex:1}.row>.eb{flex:0 0 auto}
.dlb a{font-size:13px;letter-spacing:0;color:#8d8cf0;text-decoration:underline;white-space:normal}
#ae{position:fixed;top:48px;right:0;bottom:0;width:min(760px,55vw);z-index:45;background:#05050df7;border-left:1px solid #6665c0;display:flex;flex-direction:column;text-transform:none}
#ae .hd{display:flex;gap:4px;padding:8px;border-bottom:1px solid #6665c04d;flex-wrap:wrap}#ae .hd .sp{flex:1}
#ae .fl{display:flex;flex-direction:column;gap:8px;padding:10px;border-bottom:1px solid #6665c04d}
#ae .tb{display:flex;gap:2px;padding:6px 8px;flex-wrap:wrap;border-bottom:1px solid #6665c04d}#ae .tb .eb{min-width:34px;padding:4px 8px}
#ae .bd{flex:1;display:flex;min-height:0}#ae .bd>*{flex:1;min-width:0;overflow:auto}
#ae textarea{border:0;resize:none;padding:14px;font:400 15px/1.6 Inter,sans-serif;min-height:0;height:100%}
#ae .pv{padding:14px 20px;border-left:1px solid #6665c04d;background:#020206}#ae.tg .pv{display:none}
#ae .ft{display:flex;gap:8px;padding:8px;border-top:1px solid #6665c04d;align-items:center;font:400 12px "Exo 2",sans-serif;color:#e8e8e099}
#ae .ft input{width:70px}
.ed li .mv{font:400 13px "Exo 2";margin-left:8px;cursor:pointer;opacity:.6}.ed li .mv:hover{opacity:1}
.ed li.nw a{color:#e8b04a}
.ed #mw g{pointer-events:auto;cursor:grab}.mke #m{cursor:crosshair}
.ed aside .ef{display:flex;flex-direction:column;gap:6px;margin-top:14px;text-align:left}.ed aside .ef textarea{min-height:90px}
#ae.nb .tb,#ae.nb .bd{display:none}#ae.nb{bottom:auto}#ae.tx .fl,#ae.tx .ft{display:none}
.lea{position:relative}.lea .fr{min-height:160px;outline:1px dashed #6665c055;outline-offset:6px;position:relative;
background-image:linear-gradient(90deg,transparent calc(50% - .5px),#6665c033 0 calc(50% + .5px),transparent 0)}
.lea .fr{-webkit-user-select:none;user-select:none}.lea .fr img{-webkit-user-drag:none;pointer-events:none}.lea .fi{position:relative;outline:1px dashed #6665c066;cursor:move;min-height:14px;touch-action:none}.lea .fi:hover{outline-color:#8d8cf0}.lea .fi.sel{outline:1px solid #e8b04a}
.lea .f-hr{padding:6px 0;margin-top:calc(var(--y)*100cqw/var(--dw) - 6px)}.lea .ph{opacity:.35}.lea .pi{font-size:28px;text-align:center;padding:24px;border:1px dashed #6665c0}
.lea .rl,.lea .rr{position:absolute;top:0;bottom:0;width:8px;cursor:ew-resize;display:none;font-style:normal}.lea .rl{left:-5px}.lea .rr{right:-5px}.lea .sel>.rl,.lea .sel>.rr{display:block;background:#e8b04a88}
.lea .gd{position:absolute;display:none;background:#e8b04a;pointer-events:none;z-index:99;font-style:normal}.lea .gv{top:0;bottom:0;width:1px}.lea .gh{left:0;right:0;height:1px}
.lea .bk-links .nw a{color:#e8b04a}.lea .bk-links a{pointer-events:none}
@media(max-width:700px){.lea .fr{display:grid}.lea .fi{margin-left:calc(var(--x)*100cqw/var(--dw));margin-top:calc(var(--y)*100cqw/var(--dw));width:calc(var(--w)*100cqw/var(--dw))}}
.lad{display:flex;gap:4px;flex-wrap:wrap;margin:22px 0 8px;justify-content:center}
.ltb .tbh{cursor:move;padding:0 6px;font-size:18px;line-height:28px;color:#8d8cf0;user-select:none;touch-action:none}
.ltb[hidden]{display:none}.ltb{position:absolute;z-index:30;display:flex;gap:2px;flex-wrap:wrap;background:#05050df2;border:1px solid #6665c0;padding:3px;max-width:100%}.ltb .eb{min-height:28px;padding:3px 7px}
@media(max-width:800px){#ae{width:100%}#ae .pv{border-left:0;display:none}#ae.tg .pv{display:block}#ae.tg textarea{display:none}}
`));
let pb,eb,et;
function bar(){if(!on)return;pb.firstChild.textContent=(n()?"● "+n()+" · ":"")+L("Publish","Опубликовать");pb.firstChild.classList.toggle("n",!!n());pb.lastChild.disabled=!n()}
let tt;function toast(t,x){et.style.bottom=eb.offsetHeight+20+"px";et.textContent=t;et.className=x?"x":"";et.hidden=false;clearTimeout(tt);tt=setTimeout(()=>et.hidden=true,x?12e3:6e3)}
function dialog(title,...c){const b=h("div",{cls:"dlb"},h("h3",{},title),...c),w=h("div",{cls:"dl",onclick:e=>{if(e.target==w)w.remove()}},b);D.body.append(w);return w}
const btn=(t,f,ti)=>h("button",{cls:"eb",type:"button",onclick:f,...(ti?{title:ti}:{})},t),
inp=(v,f,a={})=>{const e=h(a.area?"textarea":"input",{cls:"ei",...(a.ph?{placeholder:a.ph}:{}),...(a.type?{type:a.type}:{})});e.value=v??"";e.oninput=()=>f(e.value,e);return e},
lab=(t,e)=>h("label",{},t,e);

function token(){const i=inp(tok,()=>{},{type:"password",ph:"github_pat_…"});
const w=dialog(L("GitHub access","Доступ к GitHub"),
h("div",{},L("A fine-grained personal access token for ","Fine-grained токен для репозитория "),h("b",{},REPO),L(" with permission Contents: read and write (Actions: read — optional, for build status). It is stored only in this browser.",
" с правом Contents: Read and write (Actions: Read — по желанию, для статуса сборки). Хранится только в этом браузере.")),
h("a",{href:"https://github.com/settings/personal-access-tokens/new",target:"_blank",rel:"noopener"},L("Create a token on GitHub","Создать токен на GitHub")),
lab("Token",i),h("div",{cls:"row"},btn(L("Save","Сохранить"),async()=>{tok=i.value.trim();LS.ascwTok=tok;base={};
try{const r=await gh("");toast(r.permissions?.push?L("Token OK","Токен работает"):L("Token has no write access","У токена нет права записи"),!r.permissions?.push);w.remove()}catch(e){toast(L("Token rejected: ","Токен не принят: ")+e.message,1)}}),
btn(L("Forget token","Забыть токен"),()=>{tok="";LS.ascwTok="";w.remove()})))}

// ---------- markdown preview (close to Hugo's Goldmark for the common syntax) ----------
const img=u=>blobs[u]||u;
function inl(t){return esc(t).replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g,(_,a,u)=>`<img src="${img(u)}" alt="${a}">`)
.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,'<a href="$2">$1</a>').replace(/`([^`]+)`/g,"<code>$1</code>")
.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/~~(.+?)~~/g,"<del>$1</del>").replace(/(^|[^*])\*([^*\s][^*]*?)\*/g,"$1<em>$2</em>").replace(/(?: {2,}|\\)\n/g,"<br>")}
function md(s){const o=[],L2=(s||"").replace(/\r/g,"").split("\n");let p=[],q=[],li=null,lt="";
const fp=()=>{if(p.length)o.push("<p>"+inl(p.join("\n"))+"</p>");p=[]},fq=()=>{if(q.length)o.push("<blockquote>"+md(q.join("\n"))+"</blockquote>");q=[]},
fl=()=>{if(li)o.push(`<${lt}>`+li.map(v=>"<li>"+inl(v)+"</li>").join("")+`</${lt}>`);li=null},all=()=>{fp();fq();fl()};
for(let i=0;i<L2.length;i++){const l=L2[i];let m;
if(/^\s*$/.test(l)){all();continue}
if(/^>\s?/.test(l)){fp();fl();q.push(l.replace(/^>\s?/,""));continue}else fq();
if(m=l.match(/^(#{1,6})\s+(.*)/)){all();o.push(`<h${m[1].length}>${inl(m[2])}</h${m[1].length}>`);continue}
if(/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)){all();o.push("<hr>");continue}
if(/^\|.*\|\s*$/.test(l)&&/^\|[\s:|-]+\|\s*$/.test(L2[i+1]||"")){all();const row=(r,t)=>"<tr>"+r.trim().slice(1,-1).split("|").map(c=>`<${t}>${inl(c.trim())}</${t}>`).join("")+"</tr>";
let t="<table><thead>"+row(l,"th")+"</thead><tbody>";i+=2;while(i<L2.length&&/^\|.*\|\s*$/.test(L2[i]))t+=row(L2[i++],"td");i--;o.push(t+"</tbody></table>");continue}
if(m=l.match(/^\s*([-*+]|\d+[.)])\s+(.*)/)){fp();const t=/\d/.test(m[1])?"ol":"ul";if(li&&t!=lt)fl();lt=t;(li=li||[]).push(m[2]);continue}
if(li&&/^\s{2,}\S/.test(l)){li[li.length-1]+="\n"+l.trim();continue}
fl();p.push(l)}
all();return o.join("")}

// ---------- texts: interface strings (data/text.json) and page fields (title, description) ----------
let TX={},PG=null;
const pageObj=async p=>{const t=await read(p);if(t==null)return null;try{return JSON.parse(t)}catch{return null}};
function showPage(o){if(!o)return;D.querySelectorAll("[data-f]").forEach(e=>{const f=e.dataset.f;if(e==D.activeElement)return;
if(f.startsWith("body_"))e.innerHTML=md(o[f]);else e.textContent=o[f]??""})}
function showText(){D.querySelectorAll("[data-k]").forEach(e=>{const v=TX[e.dataset.k]?.[e.lang];if(v!=null&&e!=D.activeElement)e.textContent=v})}
const setText=(k,l,v)=>{(TX[k]=TX[k]||{})[l]=v;showText();WJ(F.text,TX)},
setPage=(f,v)=>{PG[f]=v;WJ(PAGE,PG);showPage(PG);syncAE()};
function editable(){
D.querySelectorAll("[data-k]").forEach(e=>{if(e.closest("a"))return;e.contentEditable="plaintext-only";e.oninput=()=>setText(e.dataset.k,e.lang,e.textContent)});
if(PG)D.querySelectorAll("[data-f]").forEach(e=>{if(e.dataset.f.startsWith("body_"))return;e.contentEditable="plaintext-only";e.oninput=()=>setPage(e.dataset.f,e.textContent)})}
D.addEventListener("keydown",e=>{if(e.key=="Enter"&&e.target.isContentEditable)e.preventDefault()},true);
function texts(){const rows=Object.keys(TX).map(k=>h("div",{cls:"row"},...["en","ru"].map(l=>lab(k+" · "+l.toUpperCase(),inp(TX[k][l],v=>setText(k,l,v))))));
dialog(L("Interface texts","Тексты интерфейса"),...rows)}

// ---------- article editor ----------
let AE=null,AL="en",AP=null,AO=null;
const nameOf=o=>o&&(o.title||"");
async function openAE(p=PAGE,tg=null){AP=p;AO=p==PAGE?PG:await pageObj(p);if(!AO)return toast(L("Page source not found","Исходник страницы не найден"),1);
AL=HT.lang;AE?.remove();const T=tg||(p!=PAGE?{get:l=>AO["body_"+l]||"",set:(l,v)=>upd("body_"+l,v)}:null);
const ta=h("textarea",{cls:"ei",spellcheck:"true",placeholder:L("Article text (Markdown)","Текст статьи (Markdown)")}),pv=h("div",{cls:"pv"},h("article")),
F2=h("div",{cls:"fl"}),ft=h("div",{cls:"ft"});
const tab=l=>btn(l.toUpperCase(),()=>{AL=l;fill()}),tabs=[tab("en"),tab("ru")];
const tool=(t,ti,f)=>btn(t,()=>{f();ta.focus()},ti);
AE=h("div",{id:"ae"},
h("div",{cls:"hd"},...tabs,h("span",{cls:"sp"}),btn(L("Preview","Просмотр"),()=>AE.classList.toggle("tg")),btn("✕",()=>{AE.remove();AE=null})),F2,
h("div",{cls:"tb"},tool("H2",L("Heading","Заголовок"),()=>pre("## ")),tool("H3",L("Subheading","Подзаголовок"),()=>pre("### ")),
tool("B","Ctrl+B",()=>wrap("**")),tool("I","Ctrl+I",()=>wrap("*")),tool("S",L("Strikethrough","Зачёркнутый"),()=>wrap("~~")),
tool("❝",L("Quote","Цитата"),()=>pre("> ")),tool("•",L("List","Список"),()=>pre("- ")),tool("1.",L("Numbered list","Нумерованный список"),()=>pre("1. ")),
tool("🔗","Ctrl+K",link),tool("🖼",L("Image","Изображение"),pick),tool("▦",L("Table","Таблица"),()=>ins("\n| | |\n|---|---|\n| | |\n")),
tool("―",L("Divider","Разделитель"),()=>ins("\n\n---\n\n")),tool("</>",L("Code","Код"),()=>wrap("`"))),
h("div",{cls:"bd"},ta,pv),ft);if(!T)AE.classList.add("nb");else if(tg)AE.classList.add("tx");
D.body.append(AE);
function fill(){tabs.forEach((b,i)=>b.classList.toggle("on",["en","ru"][i]==AL));const s=AL=="ru"?"_ru":"";
F2.replaceChildren(lab(L("Title","Заголовок")+" · "+AL.toUpperCase(),inp(AO["title"+s],v=>upd("title"+s,v))),
lab(L("Description","Описание")+" · "+AL.toUpperCase(),inp(AO["description"+s],v=>upd("description"+s,v))));
ta.value=T?T.get(AL):"";render()}
const render=()=>{pv.firstChild.innerHTML=md(ta.value)};
function upd(f,v){AO[f]=v;WJ(AP,AO);if(AP==PAGE)showPage(PG)}
let st=0;ta.oninput=()=>{if(!st){st=1;T.start?.()}T.set(AL,ta.value);render()};
ft.append(L("Order","Порядок")+":",inp(AO.weight,v=>upd("weight",+v||0),{type:"number"}),h("span",{cls:"sp"},AP.replace(/^content\/|\/?_index\.md$/g,"")||"/"));
// editing helpers keep the browser's undo history (execCommand insertText)
function put(t,s0,s1){ta.focus();if(!D.execCommand(t?"insertText":"delete",false,t))ta.setRangeText(t,ta.selectionStart,ta.selectionEnd,"end");
if(s0!=null){const e=ta.selectionEnd-t.length;ta.setSelectionRange(e+s0,e+s1)}ta.oninput()}
function wrap(a,b=a){const s=ta.value.slice(ta.selectionStart,ta.selectionEnd);put(a+s+b,a.length,a.length+s.length)}
function ins(t){put(t)}
function pre(p){const v=ta.value,s=v.lastIndexOf("\n",ta.selectionStart-1)+1;let e=v.indexOf("\n",ta.selectionEnd);if(e<0)e=v.length;
ta.setSelectionRange(s,e);const t=v.slice(s,e).split("\n").map(l=>l.startsWith(p)?l.slice(p.length):p+l.replace(/^(#{1,6} |> |- |1\. )/,"")).join("\n");put(t)} // caret stays at the end of the line
function link(){const s=ta.value.slice(ta.selectionStart,ta.selectionEnd);put(`[${s}](https://)`,s.length+3,s.length+11)}
function pick(){const f=h("input",{type:"file",accept:"image/*"});f.onchange=()=>f.files[0]&&up(f.files[0]);f.click()}
async function up(file){const u=await upload(file),v=ta.value,a=ta.selectionStart,nl=a&&v[a-1]!="\n"?"\n\n":"";put(`${nl}![](${u})\n`)}
ta.onkeydown=e=>{if(e.key=="Enter"&&!e.shiftKey&&ta.selectionStart==ta.selectionEnd){ // lists and quotes continue on Enter; Enter on an empty item ends them
const v=ta.value,a=ta.selectionStart,s=v.lastIndexOf("\n",a-1)+1,l=v.slice(s,a),m=l.match(/^(\s*)([-*+]|\d+[.)]|>)\s+/);
if(m){e.preventDefault();if(l==m[0]){ta.setSelectionRange(s,a);put("")}else{const nx=/\d/.test(m[2])?(parseInt(m[2])+1)+m[2].slice(-1):m[2];put("\n"+m[1]+nx+" ")}return}}
if(!(e.ctrlKey||e.metaKey))return;const k=e.key.toLowerCase();if(k=="b"){e.preventDefault();wrap("**")}else if(k=="i"){e.preventDefault();wrap("*")}else if(k=="k"){e.preventDefault();link()}};
ta.onpaste=e=>{const f=[...e.clipboardData.files].find(f=>f.type.startsWith("image/"));if(f){e.preventDefault();up(f)}};
ta.ondragover=e=>e.preventDefault();ta.ondrop=e=>{const f=[...e.dataTransfer.files].find(f=>f.type.startsWith("image/"));if(f){e.preventDefault();up(f)}};
AE.sync=()=>{if(AP==PAGE){const a=D.activeElement;F2.querySelectorAll("input").forEach((e,i)=>{if(e!=a)e.value=AO[(i?"description":"title")+(AL=="ru"?"_ru":"")]??""})}};
fill();if(tg)ta.focus()}
const syncAE=()=>AE?.sync?.();
function upload(file){return new Promise(res=>{const r=new FileReader;r.onload=()=>{
const ext=(file.name.match(/\.(\w+)$/)?.[1]||file.type.split("/")[1]||"png").toLowerCase(),
nm=(file.name.replace(/\.\w+$/,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"img")+"-"+Date.now().toString(36)+"."+ext,u=U+"img/"+nm;
draft["static/img/"+nm]={b:r.result.split(",")[1]};blobs[u]=URL.createObjectURL(file);save();res(u)};r.readAsDataURL(file)})}

// ---------- free layout: rectangles with text, images, links or a line anywhere in the strip (same markup as layouts/partials/layout.html) ----------
// item: {t:"text"|"img"|"links"|"hr", x, y, w (px of the design width = strip − 80), st, col, al, z, fs (from the style), en, ru, bind, src, cap_en, cap_ru}
// moving snaps to a 10 px grid and to the centre / edges of the strip and of the other items
let LY=null,SI=null,HI=[],HR=[],DG=null;
const IT=()=>PG.items??=(PG.body_en||PG.body_ru?[{t:"text",x:0,y:0,w:DW(),fs:16,en:PG.body_en||"",ru:PG.body_ru||""}]:[]),
cl=(v,a,b)=>Math.min(b,Math.max(a,v)),
snap=()=>JSON.stringify(IT()),
DW=()=>Math.min(PG.width||765,1200)-80, // design width of the layout, px
// fixed design system: text sizes come only from styles, colours only from the site palette, strip width up to 1200 px
STY={"":16,h:22,k:11,t:45,s:13},PAL=[["","Default","По умолчанию"],["#e8e8e0","Light","Светлый"],["#6665c0","Accent","Акцент"],["#8d8cf0","Accent light","Светлый акцент"],["#e8e8e099","Muted","Приглушённый"]],
fixSz=o=>{if(o.t=="text"||o.t=="links")o.fs=STY[o.st||""];else delete o.fs;if(o.col&&!PAL.some(c=>c[0]==o.col))delete o.col};
function commit(hist=1){if(hist){HI.push(LY.last);HR=[];if(HI.length>200)HI.shift()}PG.body_en=PG.body_ru="";WJ(PAGE,PG);LY.last=snap();draw()}
function undo(back){const a=back?HI:HR,b=back?HR:HI;if(!a.length)return;b.push(snap());PG.items=JSON.parse(a.pop());SI=null;LY.last=snap();PG.body_en=PG.body_ru="";WJ(PAGE,PG);draw()}
// text bound to a page field (title, description) or to an interface string (k:<key>, data/text.json)
const bt=(k,l)=>k.startsWith("k:")?TX[k.slice(2)]?.[l]??"":l=="ru"?PG[k+"_ru"]||PG[k]||"":PG[k]||"",
sc=o=>(o.st?" st-"+o.st:""),col=o=>o.col?`;color:${o.col}`:"";
function cell(q,j){const l=HT.lang,ph=`<p class="ph">${L("Text","Текст")}</p>`,
st=`--x:${q.x};--y:${q.y};--w:${q.w};--f:${q.fs||16};text-align:${q.al||"left"};z-index:${q.z|0}${col(q)}`;
const body=q.t=="img"?(q.src?`<img src="${img(q.src)}" alt="" draggable="false">`:`<div class="ph pi">🖼</div>`)+(q["cap_"+l]?`<figcaption>${esc(q["cap_"+l])}</figcaption>`:"")
:q.t=="hr"?"<hr>":q.t=="links"?`<ul class="bk-links">${kids().map(k=>`<li${k.nw?' class="nw"':""}><a>${esc(l=="ru"?k.ru||k.en:k.en)}</a></li>`).join("")||`<li class="ph">${L("No pages yet","Страниц пока нет")}</li>`}</ul>`
:q.bind?`<div>${esc(bt(q.bind,l))||ph}</div>`:(md(q[l])||ph);
const cx=(q.x+q.w/2)/DW(),pos=cx<.4?"pl":cx>.6?"pr":"pc";
return`<div class="fi f-${q.t} ${pos}${sc(q)}${j===SI?" sel":""}" data-i="${j}" style="${st}">${body}<i class="rl"></i><i class="rr"></i></div>`}
function draw(){if(!LY)return;LY.fr.style.setProperty("--dw",DW());LY.fr.innerHTML=IT().map(cell).join("")+'<i class="gd gv"></i><i class="gd gh"></i>';tools()}
function mark(){LY.fr.querySelectorAll(".sel").forEach(e=>e.classList.remove("sel"));LY.fr.querySelector(`[data-i="${SI}"]`)?.classList.add("sel");tools()} // selection without re-rendering
function tools(){LY.tb.hidden=SI==null;if(SI==null)return;const q=IT()[SI],e=LY.fr.querySelector(`[data-i="${SI}"]`);if(!q||!e){SI=null;LY.tb.hidden=true;return}
const set=(k,v)=>{q[k]=v;commit()},B=[];
if(q.t!="hr"&&q.t!="img")B.push(...["left","center","right","justify"].map((a,j)=>btn(["⯇","≡","⯈","☰"][j],()=>set("al",a),{left:L("Left","Влево"),center:L("Centre","По центру"),right:L("Right","Вправо"),justify:L("Justify","По ширине")}[a])));
B.push(btn("⇔",()=>{q.x=Math.round((DW()-q.w)/2);commit()},L("Centre on the strip","По центру ленты")),btn("⬆",()=>set("z",(q.z|0)+1),L("Bring forward","Выше")),btn("⬇",()=>set("z",Math.max(0,(q.z|0)-1)),L("Send backward","Ниже")));
if(q.t=="text"||q.t=="links"){const se=h("select",{cls:"eb",title:L("Text style","Стиль текста")},...[["",L("Text","Текст")],["h",L("Heading","Заголовок раздела")],["k",L("Kicker","Надзаголовок")],["t",L("Title","Заголовок")],["s",L("Subtitle","Подзаголовок")]].map(([v,t])=>h("option",{value:v},t)));
se.value=q.st||"";se.onchange=()=>{if(se.value)q.st=se.value;else delete q.st;fixSz(q);commit()};B.push(se,pal(q))}
if(q.t=="hr")B.push(pal(q));
if(q.t=="text")B.push(btn("✎",()=>editText(q),L("Edit text","Редактировать текст")));
if(q.t=="links")B.push(btn("🔗",links,L("Edit links","Ссылки")),btn("+",()=>newPage(),L("New page","Новая страница")));
if(q.t=="img")B.push(btn("🖼",()=>pickImg(q),L("Choose image","Выбрать изображение")),btn("Aa",()=>caption(q),L("Caption","Подпись")));
B.push(btn("⧉",()=>{IT().push({...q,x:cl(q.x+20,0,DW()-q.w),y:q.y+20});SI=IT().length-1;commit()},L("Duplicate","Дублировать")),btn("🗑",del,L("Delete","Удалить")));
LY.tb.replaceChildren(grip(),...B);
const t=e.getBoundingClientRect(),pr=LY.el.getBoundingClientRect();
let fx=null;try{fx=JSON.parse(LS.ascwTb||"null")}catch{} // toolbar moved by the user stays where it was put (fixed on screen)
if(fx){LY.tb.style.position="fixed";LY.tb.style.left=cl(fx.x,0,innerWidth-LY.tb.offsetWidth)+"px";LY.tb.style.top=cl(fx.y,48,innerHeight-LY.tb.offsetHeight)+"px";return}
LY.tb.style.position="";const hgt=LY.tb.offsetHeight+6; // otherwise above the item, or below it when there is no room
LY.tb.style.top=(t.top-hgt<56?t.bottom-pr.top+6:t.top-pr.top-hgt)+"px";LY.tb.style.left=cl(t.left-pr.left,0,Math.max(0,pr.width-LY.tb.offsetWidth))+"px"}
function pal(o){const s=h("select",{cls:"eb",title:L("Colour","Цвет")},...PAL.map(([v,e,r])=>h("option",{value:v,style:v?`color:${v}`:""},(v?"■ ":"")+L(e,r))));
s.value=o.col||"";s.onchange=()=>{if(s.value)o.col=s.value;else delete o.col;commit()};return s}
function grip(){const g=h("span",{cls:"tbh",title:L("Drag the panel; double-click — back to the item","Перетащите панель; двойной клик — вернуть к элементу")},"⠿");
g.onpointerdown=e=>{e.preventDefault();g.setPointerCapture(e.pointerId);const r=LY.tb.getBoundingClientRect(),ox=e.clientX-r.left,oy=e.clientY-r.top;
g.onpointermove=m=>{const x=m.clientX-ox,y=m.clientY-oy;LS.ascwTb=JSON.stringify({x,y});LY.tb.style.position="fixed";LY.tb.style.left=cl(x,0,innerWidth-r.width)+"px";LY.tb.style.top=cl(y,48,innerHeight-r.height)+"px"};
g.onpointerup=()=>{g.onpointermove=null}};
g.ondblclick=()=>{LS.ascwTb="";tools()};return g}
function del(){if(SI==null)return;IT().splice(SI,1);SI=null;commit()}
function add(t){const I=IT(),dw=DW(),bot=Math.max(0,...[...LY.fr.querySelectorAll(".fi")].map(e=>e.offsetTop+e.offsetHeight))*dw/(LY.fr.clientWidth||dw),
w=t=="hr"?Math.round(dw*.1):t=="text"||t=="img"?Math.min(dw,600):dw,q={t,x:Math.round((dw-w)/2),y:Math.round((bot?bot+24:0)/10)*10,w};
if(t=="text"||t=="links"){q.al=t=="links"?"center":"left";fixSz(q)}I.push(q);SI=I.length-1;commit();if(t=="text")editText(q);if(t=="img")pickImg(q)}
function editText(o){const k=o.bind,f=l=>k+(l=="ru"?"_ru":"");
openAE(PAGE,{get:l=>k?(k.startsWith("k:")?TX[k.slice(2)]?.[l]:PG[f(l)])||"":o[l]||"",
set:(l,v)=>{if(k?.startsWith("k:"))setText(k.slice(2),l,v);else if(k){PG[f(l)]=v;WJ(PAGE,PG);syncAE()}else{o[l]=v;PG.body_en=PG.body_ru="";WJ(PAGE,PG);LY.last=snap()}draw()},
start:()=>{if(!k){HI.push(LY.last);HR=[]}}})}
function pickImg(o){const f=h("input",{type:"file",accept:"image/*"});f.onchange=async()=>{if(!f.files[0])return;o.src=await upload(f.files[0]);commit()};f.click()}
function caption(b){dialog(L("Caption","Подпись"),...["en","ru"].map(l=>lab(l.toUpperCase(),inp(b["cap_"+l],v=>{b["cap_"+l]=v;commit(0)}))))}
function pageSet(){const S=D.querySelector("section"),M=D.querySelector("main"),ap=()=>{S.style.setProperty("--sw",PG.width?PG.width+"px":"");
M.style.setProperty("--bg",PG.bg?PG.bg=="none"?"none":`url(${img(PG.bg)})`:"");tools()},sv=()=>{WJ(PAGE,PG);ap()},
rg=h("input",{type:"range",min:800,max:1200,step:100,cls:"ei"}),nv=h("span",{});rg.value=cl(PG.width||800,800,1200);nv.textContent=rg.value+" px";
rg.oninput=()=>{const d0=DW();PG.width=+rg.value;const d1=DW(),dx=Math.round((d1-d0)/2); // items stay centred and inside the strip; their size does not change
IT().forEach(q=>{q.w=Math.min(q.w,d1);q.x=cl(q.x+dx,0,d1-q.w)});nv.textContent=rg.value+" px";sv();draw()};
dialog(L("Page","Страница"),lab(L("Width of the central strip","Ширина центральной ленты"),h("div",{cls:"row"},rg,nv)),
h("div",{cls:"row"},btn(L("Background image…","Фоновое изображение…"),()=>{const f=h("input",{type:"file",accept:"image/*"});f.onchange=async()=>{if(f.files[0]){PG.bg=await upload(f.files[0]);sv()}};f.click()}),
btn(L("No background","Без фона"),()=>{PG.bg="none";sv()}),btn(L("Default background","Фон по умолчанию"),()=>{delete PG.bg;sv()})))}
function layout(){const a=D.querySelector("section article");if(!a||!PG)return;
const fr=h("div",{cls:"fr"}),tb=h("div",{cls:"ltb",hidden:""}),
bar2=h("div",{cls:"lad"},btn("+ "+L("Text","Текст"),()=>add("text")),btn("+ "+L("Image","Изображение"),()=>add("img")),btn("+ "+L("Links","Ссылки"),()=>add("links")),btn("+ ―",()=>add("hr"),L("Line","Линия")),
btn("↶",()=>undo(1),"Ctrl+Z"),btn("↷",()=>undo(0),"Ctrl+Shift+Z"),btn("▭ "+L("Page","Страница"),pageSet,L("Width and background","Ширина и фон")));
if(PG.width>1200)PG.width=1200;
if(PG.width)D.querySelector("section").style.setProperty("--sw",PG.width+"px");if(PG.bg)D.querySelector("main").style.setProperty("--bg",PG.bg=="none"?"none":`url(${img(PG.bg)})`);
a.replaceChildren(fr,bar2,tb);a.classList.add("lea");IT().forEach(fixSz);LY={el:a,fr,tb,last:snap()};draw();
fr.addEventListener("pointerdown",down);fr.addEventListener("dragstart",e=>e.preventDefault());fr.addEventListener("selectstart",e=>e.preventDefault());fr.addEventListener("pointermove",move);fr.addEventListener("pointerup",up);fr.addEventListener("pointercancel",up);
fr.addEventListener("dblclick",e=>{const t=(D.elementFromPoint(e.clientX,e.clientY)||e.target).closest(".fi");if(!t)return;const o=IT()[+t.dataset.i]; // pointer capture retargets dblclick
if(o.t=="text")editText(o);else if(o.t=="img")pickImg(o);else if(o.t=="links")links()});
D.addEventListener("pointerdown",e=>{if(SI!=null&&!e.target.closest(".fr,.ltb,#ae,.dl")){SI=null;mark()}});
D.addEventListener("keydown",e=>{if(!LY||e.target.closest("input,textarea,select,[contenteditable]"))return;const k=e.key;
if((e.ctrlKey||e.metaKey)&&k.toLowerCase()=="z"){e.preventDefault();undo(!e.shiftKey);return}
if(SI==null)return;if(k=="Delete"||k=="Backspace"){e.preventDefault();del();return}
const q=IT()[SI],d=e.shiftKey?10:1,mv={ArrowLeft:[-d,0],ArrowRight:[d,0],ArrowUp:[0,-d],ArrowDown:[0,d]}[k];
if(mv){e.preventDefault();q.x=cl(q.x+mv[0],0,DW()-q.w);q.y=Math.max(0,q.y+mv[1]);commit()}});
addEventListener("resize",()=>tools())}
// drag: move (snapped) and resize the width of items; height follows the content
function down(e){const t=e.target.closest(".fi");if(!t||e.button)return;e.preventDefault();getSelection().removeAllRanges(); // no native image drag, no text selection
SI=+t.dataset.i;const q=IT()[SI],hd=e.target.closest(".rl,.rr");
DG={x:e.clientX,y:e.clientY,q,o:{...q},m:hd?hd.className:"mv",s:DW()/LY.fr.clientWidth,moved:0,h:t.offsetHeight*DW()/LY.fr.clientWidth};
LY.fr.setPointerCapture(e.pointerId);mark()}
function snapTo(v,cands,tol){let b=null;for(const c of cands)if(Math.abs(v-c)<=tol&&(b==null||Math.abs(v-c)<Math.abs(v-b)))b=c;return b}
function move(e){if(!DG)return;const dx=(e.clientX-DG.x)*DG.s,dy=(e.clientY-DG.y)*DG.s;if(!DG.moved&&Math.hypot(dx,dy)<4)return;
if(!DG.moved){DG.moved=1;HI.push(LY.last);HR=[];LY.fr.classList.add("drag")}
const q=DG.q,o=DG.o,dw=DW(),tol=6*DG.s,others=IT().filter(v=>v!=q),gv=LY.fr.querySelector(".gv"),gh=LY.fr.querySelector(".gh");let sx=null,sy=null;
if(DG.m=="mv"){let x=o.x+dx,y=Math.max(0,o.y+dy);
const xs=[0,dw/2,dw,...others.flatMap(v=>[v.x,v.x+v.w/2,v.x+v.w])]; // snap left edge, centre or right edge to the strip and to other items
for(const [off,k] of [[0,"l"],[q.w/2,"c"],[q.w,"r"]]){const c=snapTo(x+off,xs,tol);if(c!=null&&sx==null){sx=c;x=c-off}}
const ys=others.flatMap(v=>[v.y]);const cy=snapTo(y,ys,tol);if(cy!=null){sy=cy;y=cy}
q.x=Math.round(cl(sx==null?Math.round(x/10)*10:x,0,dw-q.w));q.y=Math.round(sy==null?Math.round(y/10)*10:y)}
else if(DG.m=="rr"){q.w=Math.round(cl(Math.round((o.w+dx)/10)*10,20,dw-q.x))}
else if(DG.m=="rl"){const nx=cl(Math.round((o.x+dx)/10)*10,0,o.x+o.w-20);q.x=Math.round(nx);q.w=Math.round(o.w+o.x-nx)}
const el=LY.fr.querySelector(`[data-i="${SI}"]`);if(el){el.style.setProperty("--x",q.x);el.style.setProperty("--y",q.y);el.style.setProperty("--w",q.w)}
const k=LY.fr.clientWidth/dw;gv.style.cssText=sx!=null?`display:block;left:${sx*k}px`:"";gh.style.cssText=sy!=null?`display:block;top:${sy*k}px`:"";tools()}
function up(){if(!DG)return;const d=DG;DG=null;LY.fr.classList.remove("drag");if(d.moved){PG.body_en=PG.body_ru="";WJ(PAGE,PG);LY.last=snap();draw()}}

// ---------- pages: new, delete, order ----------
const dir=SRC.replace(/_index\.md$/,"");
// subpages of this page (the "links" block); new ones live in the draft until published
let KIDS=[];
const kids=()=>KIDS.filter(q=>!q.del);
async function initKids(){const seen={};
KIDS=[...D.querySelectorAll("section ul li a,section .bk-links li a")].map(a=>({src:decodeURI(a.getAttribute("href")).replace(U,"")+"_index.md",en:a.querySelector("[lang=en]")?.textContent||"",ru:a.querySelector("[lang=ru]")?.textContent||""})).filter(q=>!seen[q.src]&&(seen[q.src]=1));
for(const p in draft){const m=p.match(new RegExp(`^content/${dir.replace(/[/.-]/g,"\\$&")}([^/]+)/_index\\.md$`));if(!m)continue;const q=KIDS.find(k=>"content/"+k.src==p);
if(draft[p].del){if(q)q.del=1;continue}let o={};try{o=JSON.parse(draft[p].t)}catch{}
if(q){q.en=o.title||q.en;q.ru=o.title_ru||o.title||q.ru}else KIDS.push({src:p.slice(8),en:o.title||m[1],ru:o.title_ru||o.title||m[1],nw:1,w:o.weight||0})}
KIDS.sort((a,b)=>(a.nw?1:0)-(b.nw?1:0)||(a.w||0)-(b.w||0))}
function newPage(done){let en,ruI,sl;const slug=v=>v.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const w=dialog(L("New page","Новая страница"),lab(L("Title","Заголовок")+" · EN",en=inp("",v=>{if(!sl.dataset.t)sl.value=slug(v)})),
lab(L("Title","Заголовок")+" · RU",ruI=inp("",()=>{})),lab(L("Address","Адрес")+" ("+U+dir+"…)",sl=inp("",(v,e)=>{e.dataset.t=1})),
h("div",{cls:"row"},btn(L("Create","Создать"),async()=>{const s=slug(sl.value);if(!s||!en.value.trim())return toast(L("Title and address are required","Нужны заголовок и адрес"),1);
const p=`content/${dir}${s}/_index.md`;if(await read(p)!=null)return toast(L("This address is taken","Такой адрес уже занят"),1);
const ws=await Promise.all(kids().map(q=>pageObj("content/"+q.src))),wt=Math.max(0,...ws.map(o=>o?.weight||0))+1;
await WJ(p,{title:en.value.trim(),title_ru:ruI.value.trim(),description:"",description_ru:"",weight:wt,body_en:"",body_ru:"",items:[ // same headings as the other pages
{t:"text",al:"center",bind:"k:wip",st:"k",fs:11,x:0,y:0,w:685},{t:"text",al:"center",bind:"title",st:"t",fs:45,x:0,y:34,w:685},{t:"hr",x:319,y:112,w:48},
{t:"text",al:"center",bind:"description",st:"s",fs:13,x:0,y:136,w:685}]});
KIDS.push({src:p.slice(8),en:en.value.trim(),ru:ruI.value.trim()||en.value.trim(),nw:1,w:wt});w.remove();draw();done?.();
toast(L("The page appears on the site after publishing","Страница появится на сайте после публикации"))})));en.focus()}
async function delPage(){if(!PAGE||!/\/.+\//.test(PAGE.replace(/^content\//,"")))return toast(L("Top-level pages cannot be deleted","Страницы верхнего уровня удалить нельзя"),1);
if(kids().length)return toast(L("Delete or move its subpages first","Сначала удалите вложенные страницы"),1);
if(!confirm(L("Delete this page after publishing?","Удалить эту страницу при публикации?")))return;
await src(PAGE);if(base[PAGE]==null)delete draft[PAGE];else draft[PAGE]={del:1};save();toast(L("Page will be deleted on publish","Страница будет удалена при публикации"))}
async function reorder(){const K=kids(),os=await Promise.all(K.map(q=>pageObj("content/"+q.src)));os.forEach((o,i)=>{K[i].w=i+1;if(o&&o.weight!=i+1){o.weight=i+1;WJ("content/"+K[i].src,o)}})}
function links(){const box=h("div",{style:"display:flex;flex-direction:column;gap:8px"}),
rows=()=>box.replaceChildren(...kids().map((q,i,K)=>{const set=async(l,v)=>{q[l]=v;const p="content/"+q.src,o=await pageObj(p);if(o){o[l=="en"?"title":"title_ru"]=v;await WJ(p,o)}draw()};
return h("div",{cls:"row",style:"align-items:flex-end"},lab("EN",inp(q.en,v=>set("en",v))),lab("RU",inp(q.ru,v=>set("ru",v))),
btn("↑",async()=>{if(!i)return;const j=KIDS.indexOf(K[i-1]),k=KIDS.indexOf(q);[KIDS[j],KIDS[k]]=[KIDS[k],KIDS[j]];await reorder();rows();draw()},L("Up","Выше")),
btn("↓",async()=>{if(i==K.length-1)return;const j=KIDS.indexOf(K[i+1]),k=KIDS.indexOf(q);[KIDS[j],KIDS[k]]=[KIDS[k],KIDS[j]];await reorder();rows();draw()},L("Down","Ниже")),
btn("🗑",async()=>{if(!confirm(L("Delete this page after publishing?","Удалить эту страницу при публикации?")))return;const p="content/"+q.src;await src(p);
if(base[p]==null)delete draft[p];else draft[p]={del:1};q.del=1;save();rows();draw()},L("Delete page","Удалить страницу")))}));
rows();dialog(L("Links to pages","Ссылки на страницы"),box,h("div",{cls:"row"},btn("+ "+L("New page","Новая страница"),()=>newPage(rows))))}

// ---------- map: markers, timeline events, countries ----------
let MKon=0;
const MP=window.MAP;
async function mapInit(){if(!MP)return;
window.MK=await J(F.mk,MK);window.EV=await J(F.ev,EV);window.COU=await J(F.co,COU);MP.redraw();
MP.onTap=(mx,my)=>{if(!MKon)return 0;const a=+(90-my/MP.H*180).toFixed(3),o=+(mx/MP.W*360-180).toFixed(3);MK.push({o,a,n:"",r:"",k:0});saveMK();mkForm(MK.length-1);return 1};
MP.onPanel=r=>coForm(r);if(MP.sel())coForm(MP.sel());
const mw=D.getElementById("mw");let dg=null;
mw.addEventListener("pointerdown",e=>{const g=e.target.closest("[data-m]");if(!g)return;e.stopPropagation();mw.setPointerCapture(e.pointerId);dg={i:+g.dataset.m,x:e.clientX,y:e.clientY,mv:0}});
mw.addEventListener("pointermove",e=>{if(!dg)return;dg.mv+=Math.abs(e.clientX-dg.x)+Math.abs(e.clientY-dg.y);dg.x=e.clientX;dg.y=e.clientY;if(dg.mv<4)return;
const {mx,my}=MP.toMap(e),q=MK[dg.i];q.a=+(90-my/MP.H*180).toFixed(3);q.o=+(mx/MP.W*360-180).toFixed(3);MP.markers()});
mw.addEventListener("pointerup",e=>{if(!dg)return;const d=dg;dg=null;if(d.mv<4)mkForm(d.i);else saveMK()});
D.getElementById("tl")?.querySelector("#xt")?.after(h("a",{id:"xe",style:"position:absolute;right:56px;top:14px;z-index:2;font-size:16px",title:L("Edit events","Редактировать события"),onclick:events},"✎"))}
const saveMK=()=>{WJ(F.mk,MK);MP.markers()};
function mkForm(i){const q=MK[i];if(!q)return;const ch=()=>{saveMK()};
const w=dialog(L("Map marker","Метка на карте"),
h("div",{cls:"row"},lab(L("Name","Название")+" · EN",inp(q.n,v=>{q.n=v;ch()})),lab(L("Name","Название")+" · RU",inp(q.r,v=>{q.r=v;ch()}))),
h("div",{cls:"row"},lab(L("Latitude","Широта"),inp(q.a,v=>{q.a=+v;ch()},{type:"number"})),lab(L("Longitude","Долгота"),inp(q.o,v=>{q.o=+v;ch()},{type:"number"})),
lab(L("Kind","Тип"),(()=>{const s=h("select",{cls:"ei"},...[["●",L("Circle","Круг")],["★",L("Star","Звезда")],["■",L("Square","Квадрат")],["▲",L("Triangle","Треугольник")],["◆",L("Diamond","Ромб")],
["✕",L("Cross","Крест")],["⚓",L("Anchor","Якорь")],["⚑",L("Flag","Флаг")],["♜",L("Fort","Крепость")],["◎",L("Ring","Кольцо")]].map(([i,t],j)=>h("option",{value:j},i+" "+t)));s.value=q.k|0;s.onchange=()=>{q.k=+s.value;ch()};return s})()),
lab(L("Font","Шрифт"),(()=>{const s=h("select",{cls:"ei"},...[["play","Play"],["exo","Exo 2"],["inter","Inter"],["a","Airborne"]].map(([v,t])=>h("option",{value:v,style:`font-family:${MP.FN[v]}`},t)));s.value=q.f||"play";s.onchange=()=>{if(s.value=="play")delete q.f;else q.f=s.value;ch()};return s})())),
h("div",{cls:"row"},btn(L("Done","Готово"),()=>{if(!q.n&&!q.r){MK.splice(i,1);saveMK()}w.remove()}),btn(L("Delete","Удалить"),()=>{MK.splice(i,1);saveMK();w.remove()})));
w.querySelector("input").focus()}
function events(){const box=h("div",{style:"display:flex;flex-direction:column;gap:10px"}),
sv=()=>{EV.sort((a,b)=>a[0]-b[0]);WJ(F.ev,EV);MP.timeline()},
rows=()=>box.replaceChildren(...EV.map((v,i)=>h("div",{cls:"row",style:"align-items:flex-end"},
lab(L("Year","Год"),inp(v[0],x=>{v[0]=+x;WJ(F.ev,EV);MP.timeline()},{type:"number"})),
lab("EN",inp(v[1],x=>{v[1]=x;WJ(F.ev,EV);MP.timeline()},{area:1})),lab("RU",inp(v[2],x=>{v[2]=x;WJ(F.ev,EV);MP.timeline()},{area:1})),
btn("✕",()=>{EV.splice(i,1);sv();rows()},L("Delete","Удалить")))).map(r=>{r.firstChild.style.flex="0 0 80px";return r}));
rows();const w=dialog(L("Timeline events","События таймлайна"),box,h("div",{cls:"row"},btn("+ "+L("Event","Событие"),()=>{EV.push([EV.at(-1)?.[0]??0,"",""]);WJ(F.ev,EV);rows();box.lastChild?.querySelector("textarea")?.focus()}),
btn(L("Done","Готово"),()=>{sv();w.remove()})));w.onclick=e=>{if(e.target==w){sv();w.remove()}}}
let CF=null;
function coForm(r){const a=D.getElementById("p");if(!on||!a)return;if(CF?.hex==r.c&&a.contains(CF))return;CF?.remove();
const o=COU[r.c]=COU[r.c]||{},t0=()=>{for(const k in o)if(!o[k])delete o[k];if(!Object.keys(o).length)delete COU[r.c];WJ(F.co,COU)};let tm;
const ch=(k,v)=>{o[k]=v;COU[r.c]=o;t0();clearTimeout(tm);tm=setTimeout(()=>MP.redraw(),250)};
CF=h("div",{cls:"ef"},lab(L("Name","Название")+" · EN",inp(o.en,v=>ch("en",v),{ph:r.n0})),lab(L("Name","Название")+" · RU",inp(o.ru,v=>ch("ru",v),{ph:r.r0})),
lab(L("Text","Текст")+" · EN",inp(o.ten,v=>ch("ten",v),{area:1})),lab(L("Text","Текст")+" · RU",inp(o.tru,v=>ch("tru",v),{area:1})));CF.hex=r.c;a.append(CF)}

// ---------- on / off ----------
async function start(){on=1;LS.ascwEditOn=1;HT.classList.add("ed");BT.classList.add("on");
pb=h("span",{style:"display:contents"},btn("",publish,L("Commit all changes to GitHub","Отправить все изменения на GitHub")),btn("↺",discard,L("Discard changes","Отменить изменения")));
eb=h("div",{id:"eb"},pb,btn("⚙",token,L("GitHub access","Доступ к GitHub")),btn("Aa",texts,L("Interface texts","Тексты интерфейса")));
et=h("div",{id:"et",hidden:""});D.body.append(eb,et);
TX=await J(F.text,{});if(draft[F.text])showText();
if(PAGE&&!/^map\//.test(SRC)){PG=await pageObj(PAGE);if(PG){if(draft[PAGE])showPage(PG);
eb.append(btn("✎ "+L("Article","Статья"),()=>openAE()),btn("+ "+L("Page","Страница"),newPage),btn("🗑",delPage,L("Delete page","Удалить страницу")));
await initKids();layout()}}
if(MP){eb.append(btn("📍 "+L("Markers","Метки"),e=>{MKon^=1;e.currentTarget.classList.toggle("on",!!MKon);HT.classList.toggle("mke",!!MKon);if(MKon)toast(L("Click the map to add a marker; drag markers to move them, click to edit.","Клик по карте — новая метка; метки можно перетаскивать, клик — редактировать."))}),
btn("☰ "+L("Events","События"),events));await mapInit()}
editable();bar();if(!tok)toast(L("Edit mode. Changes stay in this browser until you publish them (⚙ — GitHub access).","Режим редактирования. Изменения хранятся в браузере, пока вы их не опубликуете (⚙ — доступ к GitHub)."))}
window.EDIT={toggle(){if(on){LS.ascwEditOn="";location.reload()}else start()}};
D.addEventListener("lang",()=>{if(!on)return;bar();showText();if(PG)showPage(PG);draw()});
start();
