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
.lea .bk-links .nw a{color:#e8b04a}.lea .bk-links a{pointer-events:none}.ed li .mv{font:400 13px "Exo 2";margin-left:8px;cursor:pointer;opacity:.6}.ed li .mv:hover{opacity:1}
.ed li.nw a{color:#e8b04a}
.ed #mw g{pointer-events:auto;cursor:grab}.mke #m{cursor:crosshair}
.ed aside .ef{display:flex;flex-direction:column;gap:6px;margin-top:14px;text-align:left}.ed aside .ef textarea{min-height:90px}
#ae.nb .tb,#ae.nb .bd{display:none}#ae.nb{bottom:auto}#ae.tx .fl,#ae.tx .ft{display:none}
.lea{position:relative}.lea .lay{min-height:80px;outline:1px dashed #6665c055;outline-offset:6px}
.lea .lay{background-image:repeating-linear-gradient(90deg,#6665c012 0 calc((100% - 220px)/12),transparent 0 calc((100% - 220px)/12 + 20px))}
.lea .bk{position:relative;outline:1px dashed #6665c066;cursor:grab;min-height:28px;touch-action:none}.lea .bk:hover{outline-color:#8d8cf0}.lea .bk.sel{outline:1px solid #8d8cf0}
.lea .drag .bk{cursor:grabbing}.lea .ph{opacity:.35}.lea .pi{font-size:28px;text-align:center;padding:24px;border:1px dashed #6665c0}
.lea .rl,.lea .rr{position:absolute;top:0;bottom:0;width:8px;cursor:ew-resize;display:none}.lea .rl{left:-5px}.lea .rr{right:-5px}.lea .sel>.rl,.lea .sel>.rr{display:block;background:#8d8cf066}
.lea .cv{background-image:linear-gradient(#6665c022 1px,transparent 1px),linear-gradient(90deg,#6665c022 1px,transparent 1px);background-size:5% 5%;outline:1px dashed #6665c066}
.lea .it{outline:1px dashed #6665c088;cursor:move;min-height:12px}.lea .it.sel{outline:1px solid #e8b04a}
.lea .it .rl,.lea .it .rr{display:none}.lea .it.sel .rl,.lea .it.sel .rr{display:block;background:#e8b04a88}
.lea .hh{position:absolute;left:0;right:0;bottom:-5px;height:8px;cursor:ns-resize;display:none;font-style:normal}.lea .sel .hh{display:block;background:#8d8cf066}
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

// ---------- article layout: blocks on a 12-column grid + free canvases (same markup as layouts/partials/page.html) ----------
// block: {t:"text",c,w,al,va,en,ru} | {t:"img",c,w,al,va,src,cap_en,cap_ru} | {t:"cv",c,w,h,items:[{t:"text"|"img",x,y,w,fs,al,z,en,ru,src}]}
// c = first column (0..11), w = width in columns, h = canvas height in % of its width; item x,y,w in % of the canvas, fs = font size in px at 700 px width
let LY=null,SB=null,SI=null,HI=[],HR=[],DG=null;
const BL=()=>PG.blocks??=(PG.body_en||PG.body_ru?[{t:"text",c:0,w:12,en:PG.body_en||"",ru:PG.body_ru||""}]:[]),
cl=(v,a,b)=>Math.min(b,Math.max(a,v)),r1=v=>Math.round(v*10)/10,
snap=()=>JSON.stringify(BL());
function commit(hist=1){if(hist){HI.push(LY.last);HR=[];if(HI.length>200)HI.shift()}PG.body_en=PG.body_ru="";WJ(PAGE,PG);LY.last=snap();draw()}
function undo(back){const a=back?HI:HR,b=back?HR:HI;if(!a.length)return;b.push(snap());PG.blocks=JSON.parse(a.pop());SB=SI=null;LY.last=snap();PG.body_en=PG.body_ru="";WJ(PAGE,PG);draw()}
// text bound to a page field (title, description) or to an interface string (k:<key>, data/text.json)
const bt=(k,l)=>k.startsWith("k:")?TX[k.slice(2)]?.[l]??"":l=="ru"?PG[k+"_ru"]||PG[k]||"":PG[k]||"",
sc=o=>(o.st?" st-"+o.st:""),col=o=>o.col?`;color:${o.col}`:"";
function cell(b,i){const st=`grid-column:${(b.c|0)+1}/span ${b.w||12};text-align:${b.al||"left"};align-self:${b.va||"start"}${col(b)}`,l=HT.lang,
ph=`<p class="ph">${L("Text","Текст")}</p>`;
if(b.t=="img")return`<figure class="bk bk-img${i===SB?" sel":""}" data-b="${i}" style="${st}">${b.src?`<img src="${img(b.src)}" alt="">`:`<div class="ph pi">🖼</div>`}${b["cap_"+l]?`<figcaption>${esc(b["cap_"+l])}</figcaption>`:""}</figure>`;
if(b.t=="cv")return`<div class="bk bk-cv${i===SB?" sel":""}" data-b="${i}" style="${st}"><div class="cv" style="aspect-ratio:100/${b.h||50}">${(b.items||[]).map((q,j)=>
`<div class="it it-${q.t}${sc(q)}${i===SB&&j===SI?" sel":""}" data-it="${j}" style="left:${q.x}%;top:${q.y}cqw;width:${q.w}%;--f:${q.fs||16};text-align:${q.al||"left"};z-index:${q.z|0}${col(q)}">${
q.t=="img"?(q.src?`<img src="${img(q.src)}" alt="">`:`<div class="ph pi">🖼</div>`):q.t=="hr"?"<hr>":q.bind?`<div>${esc(bt(q.bind,l))||ph}</div>`:(md(q[l])||ph)}</div>`).join("")}<i class="hh" title="${L("Height","Высота")}"></i></div></div>`;
if(b.t=="links")return`<ul class="bk bk-links${sc(b)}${i===SB?" sel":""}" data-b="${i}" style="${st}${b.fs?`;font-size:${b.fs}px`:""}">${kids().map(q=>`<li${q.nw?' class="nw"':""}><a>${esc(l=="ru"?q.ru||q.en:q.en)}</a></li>`).join("")||`<li class="ph">${L("No pages yet","Страниц пока нет")}</li>`}</ul>`;
return`<div class="bk bk-text${sc(b)}${i===SB?" sel":""}" data-b="${i}" style="${st}">${md(b[l])||ph}</div>`}
function draw(){if(!LY)return;const B=BL();
LY.grid.innerHTML=B.map(cell).join("");
LY.grid.querySelectorAll(".bk,.it").forEach(e=>e.insertAdjacentHTML("beforeend",'<i class="rl"></i><i class="rr"></i>'));
tools()}
function mark(){LY.grid.querySelectorAll(".sel").forEach(e=>e.classList.remove("sel")); // selection without re-rendering (keeps double-click working)
const k=LY.grid.querySelector(`[data-b="${SB}"]`);k?.classList.add("sel");if(SI!=null)k?.querySelector(`[data-it="${SI}"]`)?.classList.add("sel");tools()}
function tools(){LY.tb.hidden=SB==null;if(SB==null)return;const b=BL()[SB],e=LY.grid.querySelector(`[data-b="${SB}"]`);if(!b||!e){SB=null;LY.tb.hidden=true;return}
const it=b.t=="cv"&&SI!=null?b.items[SI]:null,tg=it||b,set=(k,v)=>{tg[k]=v;commit()},
alg=["left","center","right",...(it?[]:["justify"])].map((a,j)=>btn(["⯇","≡","⯈","☰"][j],()=>set("al",a),{left:L("Left","Влево"),center:L("Centre","По центру"),right:L("Right","Вправо"),justify:L("Justify","По ширине")}[a])),
B=[];
if(!it){B.push(...alg,btn("⤒",()=>set("va","start"),L("Top","Сверху")),btn("↕",()=>set("va","center"),L("Middle","По середине")),btn("⤓",()=>set("va","end"),L("Bottom","Снизу")));
if(b.t=="cv")B.push(btn("+T",()=>addItem("text"),L("Text on canvas","Текст на холсте")),btn("+🖼",()=>addItem("img"),L("Image on canvas","Изображение на холсте")),btn("+―",()=>addItem("hr"),L("Line on canvas","Линия на холсте")))}
else{B.push(...alg,btn("A−",()=>set("fs",Math.max(6,(it.fs||16)-2))),btn("A+",()=>set("fs",(it.fs||16)+2)),
btn("⬆",()=>set("z",(it.z|0)+1),L("Bring forward","Выше")),btn("⬇",()=>set("z",Math.max(0,(it.z|0)-1)),L("Send backward","Ниже")))}
if(tg.t=="links")B.push(btn("A−",()=>set("fs",Math.max(8,(tg.fs||16)-2))),btn("A+",()=>set("fs",(tg.fs||16)+2)),btn("🔗",links,L("Edit links","Ссылки")),btn("+",()=>newPage(),L("New page","Новая страница")));
if(tg.t=="text"||tg.t=="links"){const se=h("select",{cls:"eb",title:L("Text style","Стиль текста")},...[["",L("Text","Текст")],["k",L("Kicker","Надзаголовок")],["t",L("Title","Заголовок")],["s",L("Subtitle","Подзаголовок")]].map(([v,t])=>h("option",{value:v},t)));
se.value=tg.st||"";se.onchange=()=>{if(se.value)tg.st=se.value;else delete tg.st;commit()};
const cc=h("input",{type:"color",cls:"eb",title:L("Colour","Цвет"),style:"width:34px;padding:2px"});cc.value=tg.col||"#e8e8e0";cc.oninput=()=>{tg.col=cc.value;commit()};
B.push(se,cc,btn("⌀",()=>{delete tg.col;commit()},L("Default colour","Цвет по умолчанию")));if(tg.t=="text")B.push(btn("✎",()=>editText(tg),L("Edit text","Редактировать текст")))}
if(tg.t=="hr"){const cc=h("input",{type:"color",cls:"eb",title:L("Colour","Цвет"),style:"width:34px;padding:2px"});cc.value=tg.col||"#6665c0";cc.oninput=()=>{tg.col=cc.value;commit()};B.push(cc)}
if(tg.t=="img")B.push(btn("🖼",()=>pickImg(tg),L("Choose image","Выбрать изображение")));
if(b.t=="img"&&!it)B.push(btn("Aa",()=>caption(b),L("Caption","Подпись")));
B.push(btn("⧉",()=>{if(it){b.items.push({...it,x:cl(it.x+3,0,95),y:cl(it.y+3,0,95)});SI=b.items.length-1}else{BL().splice(SB+1,0,JSON.parse(JSON.stringify(b)));SB++}commit()},L("Duplicate","Дублировать")),
btn("🗑",del,L("Delete","Удалить")));
LY.tb.replaceChildren(grip(),...B);
const r=e.getBoundingClientRect(),pr=LY.el.getBoundingClientRect(),ir=it&&e.querySelector(`[data-it="${SI}"]`)?.getBoundingClientRect(),t=ir||r;
let fx=null;try{fx=JSON.parse(LS.ascwTb||"null")}catch{} // toolbar moved by the user stays where it was put (fixed on screen)
if(fx){LY.tb.style.position="fixed";LY.tb.style.left=cl(fx.x,0,innerWidth-LY.tb.offsetWidth)+"px";LY.tb.style.top=cl(fx.y,48,innerHeight-LY.tb.offsetHeight)+"px";return}
LY.tb.style.position="";const hgt=LY.tb.offsetHeight+6,above=t.top-pr.top-hgt; // otherwise above the element, or below it when there is no room
LY.tb.style.top=(t.top-hgt<56?t.bottom-pr.top+6:above)+"px";LY.tb.style.left=cl(t.left-pr.left,0,Math.max(0,pr.width-LY.tb.offsetWidth))+"px"}
function grip(){const g=h("span",{cls:"tbh",title:L("Drag the panel; double-click — back to the element","Перетащите панель; двойной клик — вернуть к элементу")},"⠿");
g.onpointerdown=e=>{e.preventDefault();g.setPointerCapture(e.pointerId);const r=LY.tb.getBoundingClientRect(),ox=e.clientX-r.left,oy=e.clientY-r.top;
g.onpointermove=m=>{const x=m.clientX-ox,y=m.clientY-oy;LS.ascwTb=JSON.stringify({x,y});LY.tb.style.position="fixed";LY.tb.style.left=cl(x,0,innerWidth-r.width)+"px";LY.tb.style.top=cl(y,48,innerHeight-r.height)+"px"};
g.onpointerup=()=>{g.onpointermove=null}};
g.ondblclick=()=>{LS.ascwTb="";tools()};return g}
function del(){const B=BL();if(SB==null)return;if(SI!=null){B[SB].items.splice(SI,1);SI=null}else{B.splice(SB,1);SB=null}commit()}
function add(t){const B=BL(),b=t=="cv"?{t,c:0,w:12,h:50,items:[]}:{t,c:0,w:12,al:"left"};B.push(b);SB=B.length-1;SI=null;commit();if(t=="text")editText(b);if(t=="img")pickImg(b)}
function addItem(t){const b=BL()[SB],q=t=="img"?{t,x:30,y:20,w:40}:t=="hr"?{t,x:40,y:20,w:20}:{t,x:10,y:10,w:40,fs:18,al:"left"};b.items.push(q);SI=b.items.length-1;commit();if(t=="text")editText(q);else if(t=="img")pickImg(q)}
function editText(o){const k=o.bind,f=l=>k+(l=="ru"?"_ru":"");
openAE(PAGE,{get:l=>k?(k.startsWith("k:")?TX[k.slice(2)]?.[l]:PG[f(l)])||"":o[l]||"",
set:(l,v)=>{if(k?.startsWith("k:"))setText(k.slice(2),l,v);else if(k){PG[f(l)]=v;WJ(PAGE,PG);syncAE()}else{o[l]=v;PG.body_en=PG.body_ru="";WJ(PAGE,PG);LY.last=snap()}draw()},
start:()=>{if(!k){HI.push(LY.last);HR=[]}}})}
function pickImg(o){const f=h("input",{type:"file",accept:"image/*"});f.onchange=async()=>{if(!f.files[0])return;o.src=await upload(f.files[0]);commit()};f.click()}
function caption(b){dialog(L("Caption","Подпись"),...["en","ru"].map(l=>lab(l.toUpperCase(),inp(b["cap_"+l],v=>{b["cap_"+l]=v;commit(0)}))))}
function pageSet(){const S=D.querySelector("section"),M=D.querySelector("main"),ap=()=>{S.style.setProperty("--sw",PG.width?PG.width+"px":"");
M.style.setProperty("--bg",PG.bg?PG.bg=="none"?"none":`url(${img(PG.bg)})`:"");tools()},sv=()=>{WJ(PAGE,PG);ap()},
rg=h("input",{type:"range",min:400,max:1600,step:5,cls:"ei"}),nv=h("span",{});rg.value=PG.width||765;nv.textContent=rg.value+" px";
rg.oninput=()=>{PG.width=+rg.value==765?undefined:+rg.value;nv.textContent=rg.value+" px";sv()};
dialog(L("Page","Страница"),lab(L("Width of the central strip","Ширина центральной ленты"),h("div",{cls:"row"},rg,nv)),
h("div",{cls:"row"},btn(L("Background image…","Фоновое изображение…"),()=>{const f=h("input",{type:"file",accept:"image/*"});f.onchange=async()=>{if(f.files[0]){PG.bg=await upload(f.files[0]);sv()}};f.click()}),
btn(L("No background","Без фона"),()=>{PG.bg="none";sv()}),btn(L("Default background","Фон по умолчанию"),()=>{delete PG.bg;sv()})))}
function layout(){const a=D.querySelector("section article");if(!a||!PG)return;
const grid=h("div",{cls:"lay"}),tb=h("div",{cls:"ltb",hidden:""}),
bar2=h("div",{cls:"lad"},btn("+ "+L("Text","Текст"),()=>add("text")),btn("+ "+L("Image","Изображение"),()=>add("img")),btn("+ "+L("Canvas","Холст"),()=>add("cv")),btn("+ "+L("Links","Ссылки"),()=>add("links")),
btn("↶",()=>undo(1),"Ctrl+Z"),btn("↷",()=>undo(0),"Ctrl+Shift+Z"),btn("▭ "+L("Page","Страница"),pageSet,L("Width and background","Ширина и фон")));
if(PG.width)D.querySelector("section").style.setProperty("--sw",PG.width+"px");if(PG.bg)D.querySelector("main").style.setProperty("--bg",PG.bg=="none"?"none":`url(${img(PG.bg)})`);
a.replaceChildren(grid,bar2,tb);a.classList.add("lea");LY={el:a,grid,tb,last:snap()};draw();
grid.addEventListener("pointerdown",down);grid.addEventListener("pointermove",move);grid.addEventListener("pointerup",up);grid.addEventListener("pointercancel",up);
grid.addEventListener("dblclick",e=>{const t=D.elementFromPoint(e.clientX,e.clientY)||e.target,k=t.closest(".bk");if(!k)return;const b=BL()[+k.dataset.b],q=t.closest(".it");const o=q?b.items[+q.dataset.it]:b;
if(o.t=="text")editText(o);else if(o.t=="img")pickImg(o);else if(o.t=="links")links()});
D.addEventListener("pointerdown",e=>{if(SB!=null&&!e.target.closest(".lay,.ltb,#ae,.dl")){SB=SI=null;mark()}});
D.addEventListener("keydown",e=>{if(!LY||e.target.closest("input,textarea,[contenteditable]"))return;const k=e.key;
if((e.ctrlKey||e.metaKey)&&k.toLowerCase()=="z"){e.preventDefault();undo(!e.shiftKey);return}
if(SB==null)return;if(k=="Delete"||k=="Backspace"){e.preventDefault();del();return}
const b=BL()[SB],it=SI!=null&&b.items[SI],d=e.shiftKey?2:.5,mv={ArrowLeft:[-d,0],ArrowRight:[d,0],ArrowUp:[0,-d],ArrowDown:[0,d]}[k];
if(mv&&it){e.preventDefault();it.x=r1(cl(it.x+mv[0],0,100-it.w));it.y=r1(cl(it.y+mv[1],0,99));commit()}
else if(mv&&!it&&mv[0]){e.preventDefault();b.c=cl((b.c|0)+Math.sign(mv[0]),0,12-(b.w||12));commit()}});
addEventListener("resize",()=>tools())}
// drag: move / resize blocks on the grid (snapped to columns), move / resize canvas items freely (0.1 %), canvas height
function down(e){const k=e.target.closest(".bk");if(!k||e.button)return;const i=+k.dataset.b,b=BL()[i],q=e.target.closest(".it"),hd=e.target.closest(".rl,.rr,.hh");
SB=i;SI=q?+q.dataset.it:null;
const g=LY.grid,gr=g.getBoundingClientRect(),cs=getComputedStyle(g),gap=parseFloat(cs.columnGap)||0,cw=(gr.width+gap)/12,cv=k.querySelector(".cv")?.getBoundingClientRect();
DG={x:e.clientX,y:e.clientY,i,b,cw,cv,m:hd?hd.className:q?"it":"bk",o:JSON.parse(JSON.stringify(b)),moved:0,it:SI!=null?b.items[SI]:null,itR:q?.getBoundingClientRect()};
g.setPointerCapture(e.pointerId);mark()}
function move(e){if(!DG)return;const dx=e.clientX-DG.x,dy=e.clientY-DG.y;if(!DG.moved&&Math.hypot(dx,dy)<4)return;
if(!DG.moved){DG.moved=1;HI.push(LY.last);HR=[];LY.grid.classList.add("drag")}
const b=DG.b,o=DG.o,B=BL(),W12=n=>Math.round(n/DG.cw);
if(DG.m=="it"){const it=DG.it,o2=o.items[SI];it.x=r1(cl(o2.x+dx/DG.cv.width*100,0,100-it.w));it.y=r1(cl(o2.y+dy/DG.cv.width*100,-5,(b.h||50)-1))}
else if(DG.m=="rr"&&DG.it){const o2=o.items[SI];DG.it.w=r1(cl(o2.w+dx/DG.cv.width*100,3,100-DG.it.x))}
else if(DG.m=="rl"&&DG.it){const o2=o.items[SI],nx=cl(o2.x+dx/DG.cv.width*100,0,o2.x+o2.w-3);DG.it.x=r1(nx);DG.it.w=r1(o2.w+o2.x-nx)}
else if(DG.m=="hh"){b.h=r1(cl((o.h||50)+dy/DG.cv.width*100,5,300))}
else if(DG.m=="rr"){b.w=cl((o.w||12)+W12(dx),1,12-(b.c|0))}
else if(DG.m=="rl"){const c=cl((o.c|0)+W12(dx),0,(o.c|0)+(o.w||12)-1);b.c=c;b.w=(o.c|0)+(o.w||12)-c}
else{b.c=cl((o.c|0)+W12(dx),0,12-(b.w||12)); // horizontal: columns; vertical: position among the other blocks
const els=[...LY.grid.querySelectorAll(".bk")].filter(x=>+x.dataset.b!=DG.i);let n=0;
for(const x of els){const r=x.getBoundingClientRect();if(r.bottom<e.clientY||(r.top<=e.clientY&&e.clientY<=r.bottom&&r.left+r.width/2<e.clientX))n++}
const cur=B.indexOf(b);if(n!=cur){B.splice(cur,1);B.splice(n,0,b);DG.i=SB=n}}
draw()}
function up(e){if(!DG)return;const d=DG;DG=null;LY.grid.classList.remove("drag");if(d.moved){PG.body_en=PG.body_ru="";WJ(PAGE,PG);LY.last=snap();draw()}}

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
await WJ(p,{title:en.value.trim(),title_ru:ruI.value.trim(),description:"",description_ru:"",weight:wt,body_en:"",body_ru:"",blocks:[{t:"cv",c:0,w:12,h:23.9,items:[ // same headings canvas as the other pages
{t:"text",x:0,y:0,w:100,al:"center",bind:"k:wip",st:"k",fs:11},{t:"text",x:0,y:5,w:100,al:"center",bind:"title",st:"t",fs:45},{t:"hr",x:46.5,y:16.3,w:7},
{t:"text",x:0,y:19.9,w:100,al:"center",bind:"description",st:"s",fs:13}]}]});
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
