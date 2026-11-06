// ASCW site editor. Loaded only in edit mode (✎ in the menu; unlocked once per browser by opening any page with ?edit).
// Every change goes into a draft kept in this browser (localStorage) and is published to GitHub as one commit with the editor's
// own access token; GitHub Actions then rebuilds the site.
// Files it edits: content/**/_index.md (pages: JSON front matter), data/text.json (interface texts),
// assets/markers.json, assets/events.json, assets/countries.json (the map), static/img/* (uploaded images).
// Styles: assets/edit.css. Built by layouts/partials/js.html (esbuild: minified, in its own scope).

// ---------- setup ----------
const doc = document, root = doc.documentElement, byId = id => doc.getElementById(id), editButton = byId("ed");
const SITE = editButton.dataset.u;                                                      // the site's base address (images)
const PAGES = decodeURI(location.pathname).startsWith(SITE + "ru/") ? SITE + "ru/" : SITE; // pages in this language
const REPO = editButton.dataset.repo, BRANCH = "main";
const FILES = { texts: "data/text.json", markers: "assets/markers.json", events: "assets/events.json", countries: "assets/countries.json" };
const store = (() => { try { return localStorage } catch { return {} } })();
const srcMeta = doc.querySelector("meta[name=src]")?.content;
const NEW_PAGE = !srcMeta; // a page that exists only in the draft opens on the 404 page, at its future address
const SRC = srcMeta || (p => p && p + "/_index.md")(decodeURI(location.pathname).slice(SITE.length).replace(/^ru\//, "").replace(/\/?(index\.html)?$/, ""));
const PAGE = SRC && "content/" + SRC;                     // this page's file
const EMBEDDED = root.classList.contains("emb");          // a page inside the map's panel: only its text is edited here, the map's bar publishes
const PREVIEW = /[?&]preview\b/.test(location.search);    // the phone preview: the draft shown, nothing editable
const MAP = window.MAP;                                   // the map page's hooks (assets/map.js)

const isRu = () => root.lang == "ru",
  inLang = (en, ru) => isRu() ? ru : en,
  esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
  hash = t => { let x = 0x811c9dc5; for (let i = 0; i < t.length; i++) x = Math.imul(x ^ t.charCodeAt(i), 0x1000193); return x >>> 0 }; // FNV-1a: has a text changed

function h(tag, attrs = {}, ...children) { // an element: on* attributes are handlers, cls is the class
  const e = doc.createElement(tag);
  for (const k in attrs) {
    if (k.startsWith("on")) e[k] = attrs[k];
    else if (k == "cls") e.className = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  e.append(...children.flat().filter(c => c != null));
  return e;
}

let draft = {}, base = {}, pending = {}, blobs = {}, editing = false, token = store.ascwTok || "";
try { draft = JSON.parse(store.ascwDraft || "{}") } catch {}
addEventListener("storage", e => { // the map and the page in its panel share one draft
  if (e.key != "ascwDraft") return;
  try { draft = JSON.parse(e.newValue || "{}") } catch { draft = {} }
  base = {};
  pending = {};
  updateBar();
});

// ---------- the draft and GitHub ----------
const changeCount = () => Object.keys(draft).length;

function saveDraft() {
  try { store.ascwDraft = JSON.stringify(draft) }
  catch { toast(inLang("Draft too big to keep after closing the page — publish first", "Черновик слишком большой, чтобы пережить закрытие страницы — сначала опубликуйте"), 1) }
  updateBar();
}

async function github(path, o = {}) { // GitHub API of the repository
  const r = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    cache: "no-store", ...o,
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      Accept: o.raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      ...(o.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!r.ok) throw Error(r.status + " " + (await r.text()).slice(0, 200));
  return o.raw ? r.text() : r.json();
}

function published(path) { // the file as it is on GitHub (null if it does not exist); one request per file
  return pending[path] ??= (async () => {
    if (path in base) return base[path];
    try {
      base[path] = await github(`contents/${path}?ref=${BRANCH}`, { raw: 1 }).catch(e => /^404/.test(e.message) ? Promise.reject(e)
        : fetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/${path}?${Date.now()}`, { cache: "no-store" }) // the API refused (e.g. its limit without a token)
          .then(r => r.ok ? r.text() : Promise.reject(r.status)));
    } catch (e) {
      if (!/404/.test(e)) console.warn(path, e);
      base[path] = null;
    }
    return base[path];
  })();
}

async function readFile(path) { const d = draft[path]; return d ? d.del ? null : d.t : published(path) }

async function writeFile(path, text) {
  await published(path);
  if (base[path] == null && Object.values(FILES).includes(path)) // never replace a data file by a partial one
    return toast(inLang("Could not read the file from GitHub, the change is not saved: ", "Не удалось прочитать файл с GitHub, изменение не сохранено: ") + path, 1);
  if (text === base[path]) delete draft[path];
  else draft[path] = { t: text, from: draft[path]?.from ?? hash(base[path] ?? "") }; // from: the published file this change started from
  saveDraft();
}

const readJSON = async (path, fallback) => { try { return JSON.parse(await readFile(path)) ?? fallback } catch { return fallback } };
const oneItemPerLine = a => "[\n" + a.map(v => JSON.stringify(v)).join(",\n") + "\n]\n";
const FORMATS = { [FILES.markers]: oneItemPerLine, [FILES.events]: oneItemPerLine };
const writeJSON = (path, o) => writeFile(path, (FORMATS[path] || (v => JSON.stringify(v, null, 1) + "\n"))(o));

async function publish() {
  if (!token) return tokenDialog();
  await flushPage();
  if (!changeCount()) return;
  const button = publishButtons.firstChild;
  button.disabled = true;
  toast(inLang("Publishing…", "Публикация…"));
  try {
    const head = (await github(`git/ref/heads/${BRANCH}`)).object.sha, commit = await github(`git/commits/${head}`), tree = [];
    const listing = await github(`git/trees/${commit.tree.sha}?recursive=1`), files = listing.tree.filter(e => e.type == "blob");
    const all = files.map(e => e.path), shaOf = Object.fromEntries(files.map(e => [e.path, e.sha]));
    const atHead = path => shaOf[path] ? github(`git/blobs/${shaOf[path]}`, { raw: 1 }) : Promise.resolve(null); // a file as it is on GitHub now
    // files changed on GitHub since this draft started changing them (from another browser or device): overwrite only if confirmed
    const changed = [];
    await Promise.all(Object.entries(draft).map(async ([path, v]) => { if ("from" in v && hash(await atHead(path) ?? "") != v.from) changed.push(path) }));
    if (changed.length && !confirm(inLang("Changed on GitHub after you began editing them here (in another browser or on another device?):\n\n",
      "Изменены на GitHub после того, как вы начали править их здесь (в другом браузере или на другом устройстве?):\n\n") + changed.join("\n") +
      inLang("\n\nPublish anyway? Those changes will be lost.", "\n\nВсё равно опубликовать? Те изменения пропадут."))) return toastEl.hidden = true;
    const unused = listing.truncated ? new Set() : await unusedImages(all, atHead);
    for (const [path, v] of Object.entries(draft)) {
      if (unused.has(path)) continue; // an image uploaded and no longer used before publishing is not published at all
      if (v.del) { if (shaOf[path]) tree.push({ path, mode: "100644", type: "blob", sha: null }); continue }
      const blob = await github("git/blobs", { method: "POST", body: JSON.stringify(v.b ? { content: v.b, encoding: "base64" } : { content: v.t, encoding: "utf-8" }) });
      tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const removed = [...unused].filter(p => shaOf[p]);
    removed.forEach(path => tree.push({ path, mode: "100644", type: "blob", sha: null }));
    const newTree = await github("git/trees", { method: "POST", body: JSON.stringify({ base_tree: commit.tree.sha, tree }) });
    const message = "Edit via site editor" + (removed.length ? `; unused images removed: ${removed.map(p => p.slice(11)).join(", ")}` : "");
    const newCommit = await github("git/commits", { method: "POST", body: JSON.stringify({ message, tree: newTree.sha, parents: [head] }) });
    await github(`git/refs/heads/${BRANCH}`, { method: "PATCH", body: JSON.stringify({ sha: newCommit.sha }) });
    for (const [path, v] of Object.entries(draft)) base[path] = v.del ? null : v.t ?? base[path];
    removed.forEach(path => base[path] = null);
    pending = {}; // later reads give the published texts
    draft = {};
    saveDraft();
    followBuild(newCommit.sha);
  } catch (e) {
    toast(inLang("Publish failed: ", "Ошибка публикации: ") + e.message, 1);
  } finally {
    button.disabled = false;
  }
}

async function unusedImages(all, atHead) { // images in static/img that no page or data file mentions any more (after this publish)
  const paths = [...new Set([...all, ...Object.keys(draft)])];
  const images = new Set(paths.filter(p => p.startsWith("static/img/") && !draft[p]?.del));
  if (!images.size) return images;
  const texts = paths.filter(p => !draft[p]?.del && /^(content\/.*\.md|data\/.*\.json|assets\/(markers|events|countries)\.json|assets\/.*\.css|layouts\/.*\.html)$/.test(p));
  const contents = await Promise.all(texts.map(p => draft[p] ? draft[p].t : atHead(p).catch(() => null))); // the draft's text, or GitHub's at this moment
  if (contents.some(t => t == null)) return new Set(); // a file could not be read: nothing is removed this time
  const used = contents.join("\n");
  for (const p of images) if (used.includes("img/" + p.slice(11))) images.delete(p);
  return images;
}

async function followBuild(sha) { // the GitHub Actions build of this commit (needs Actions: read; otherwise just a hint)
  toast(inLang("Published. The site rebuilds in about a minute.", "Опубликовано. Сайт обновится примерно через минуту."));
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 6e3));
    try {
      const run = (await github(`actions/runs?head_sha=${sha}`)).workflow_runs[0];
      if (!run) continue;
      if (run.status == "completed") {
        const ok = run.conclusion == "success";
        return toast(ok ? inLang("Site updated (refresh in ~30 s).", "Сайт обновлён (обновите страницу через ~30 с).")
          : inLang("Build failed — see GitHub Actions.", "Сборка не удалась — см. GitHub Actions."), !ok);
      }
    } catch { return }
  }
}

function discardAll() {
  if (!changeCount() || !confirm(inLang("Discard all unpublished changes?", "Удалить все неопубликованные изменения?"))) return;
  draft = {};
  saveDraft();
  location.reload();
}

// ---------- interface: bar, messages, dialogs, inputs, menus ----------
let bar, toastEl, publishButtons, undoButton, redoButton, wordCountEl, toastTimer;

function updateBar() {
  if (!editing || PREVIEW) return;
  if (undoButton) { undoButton.disabled = !undoStack.length; redoButton.disabled = !redoStack.length }
  if (EMBEDDED) return;
  const n = changeCount(), button = publishButtons.firstChild;
  button.textContent = (n ? "● " + n + " · " : "") + inLang("Publish", "Опубликовать");
  button.classList.toggle("n", !!n);
  publishButtons.lastChild.disabled = !n;
}

function toast(text, isError) {
  if (!toastEl) return;
  const above = () => toastEl.style.bottom = bar.offsetHeight + 20 + "px"; // always above the bar, also when it wraps to two rows
  above();
  requestAnimationFrame(above);
  doc.fonts?.ready.then(above);
  toastEl.textContent = text;
  toastEl.className = isError ? "x" : "";
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.hidden = true, isError ? 12e3 : 6e3);
}

function dialog(title, ...content) { // a modal window; Escape or a click outside closes it
  const close = h("button", { type: "button", cls: "x", title: inLang("Close", "Закрыть"), "aria-label": inLang("Close", "Закрыть"), onclick: () => w.remove() }, "×");
  const box = h("div", { cls: "dlb", role: "dialog", "aria-label": title, tabindex: "-1" }, h("h3", {}, title, close), ...content);
  const w = h("div", { cls: "dl", onclick: e => { if (e.target == w) w.remove() } }, box);
  doc.body.append(w);
  doc.addEventListener("keydown", function onEscape(e) { // also when its rows were redrawn and nothing has the focus; not the map's Escape
    if (!w.isConnected) return doc.removeEventListener("keydown", onEscape, true);
    if (e.key == "Escape" && !e.isComposing && doc.body.lastElementChild == w) { e.stopPropagation(); w.remove() } // the topmost window only
  }, true);
  setTimeout(() => (box.querySelector("input,textarea,select,.dlb>:not(h3) button") || box).focus());
  return w;
}

const button = (text, onclick, tip) => h("button", { cls: "eb", type: "button", onclick, ...(tip ? { title: tip, "aria-label": tip } : {}) }, text),
  input = (value, oninput, o = {}) => {
    const e = h(o.area ? "textarea" : "input", { cls: "ei", ...(o.ph ? { placeholder: o.ph } : {}), ...(o.type ? { type: o.type } : {}) });
    e.value = value ?? "";
    e.oninput = () => oninput(e.value, e);
    return e;
  },
  select = (value, options, onchange) => {
    const s = h("select", { cls: "ei" }, ...options.map(([k, t]) => h("option", { value: k }, t)));
    s.value = value;
    s.onchange = () => onchange(s.value);
    return s;
  },
  label = (text, field) => h("label", {}, text, field);

// a menu: items {i icon, t text, k shortcut hint, on checked, f action}, "-" a separator; find: a search field on top (Enter picks the first)
function menu(x, y, items, find) {
  doc.querySelector(".mn")?.remove();
  const back = doc.activeElement, m = h("div", { cls: "mn", role: "menu" });
  const search = find && h("input", { cls: "ei", placeholder: inLang("Find a block…", "Найти блок…"), "aria-label": inLang("Find a block", "Найти блок") });
  if (search) m.append(search);
  for (const it of items) {
    if (it == "-") { m.append(h("hr")); continue }
    m.append(h("button", { type: "button", role: "menuitem", cls: it.on ? "on" : "", onclick: () => { m.remove(); it.f() } }, h("i", {}, it.i || ""), it.t, it.k ? h("small", {}, it.k) : null));
  }
  doc.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + "px";
  m.style.top = Math.max(56, Math.min(y, innerHeight - r.height - 8)) + "px";
  let focused = -1;
  const shown = () => [...m.querySelectorAll("button:not([hidden])")];
  (search || shown()[0])?.focus();
  if (!search) focused = 0;
  if (search) search.oninput = () => {
    const v = search.value.trim().toLowerCase();
    m.querySelectorAll("button").forEach(b => b.hidden = !!v && !b.textContent.toLowerCase().includes(v));
    m.querySelectorAll("hr").forEach(e => e.hidden = !!v);
    focused = -1;
  };
  m.addEventListener("keydown", e => {
    const buttons = shown();
    if (e.key == "Escape") { m.remove(); e.stopPropagation(); back?.focus?.() }
    else if (/Arrow(Down|Up)/.test(e.key) && buttons.length) {
      e.preventDefault();
      focused = e.key == "ArrowDown" ? (focused + 1) % buttons.length : focused <= 0 ? buttons.length - 1 : focused - 1;
      buttons[focused].focus();
    } else if (e.key == "Enter" && e.target == search) { e.preventDefault(); buttons[0]?.click() }
  });
  setTimeout(() => doc.addEventListener("pointerdown", function outside(e) {
    if (!m.contains(e.target)) { m.remove(); doc.removeEventListener("pointerdown", outside) }
  }));
  return m;
}

// ---------- GitHub access, images ----------
function tokenDialog() {
  const field = input(token, () => {}, { type: "password", ph: "github_pat_…" });
  const w = dialog(inLang("GitHub access", "Доступ к GitHub"),
    h("div", {}, inLang("A fine-grained personal access token for ", "Fine-grained токен для репозитория "), h("b", {}, REPO),
      inLang(" with permission Contents: read and write (Actions: read — optional, for build status). It is stored only in this browser.",
        " с правом Contents: Read and write (Actions: Read — по желанию, для статуса сборки). Хранится только в этом браузере.")),
    h("a", { href: "https://github.com/settings/personal-access-tokens/new", target: "_blank", rel: "noopener" }, inLang("Create a token on GitHub", "Создать токен на GitHub")),
    label("Token", field),
    h("div", { cls: "row" },
      button(inLang("Save", "Сохранить"), async () => {
        token = field.value.trim();
        store.ascwTok = token;
        base = {};
        pending = {};
        try {
          const r = await github("");
          toast(r.permissions?.push ? inLang("Token OK", "Токен работает") : inLang("Token has no write access", "У токена нет права записи"), !r.permissions?.push);
          w.remove();
        } catch (e) { toast(inLang("Token rejected: ", "Токен не принят: ") + e.message, 1) }
      }),
      button(inLang("Forget token", "Забыть токен"), () => { token = ""; store.ascwTok = ""; w.remove() })));
}

function uploadImage(file) { // into the draft as static/img/<name>-<time>.<ext>; returns its future site address
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => {
      const ext = (file.name.match(/\.(\w+)$/)?.[1] || file.type.split("/")[1] || "png").toLowerCase();
      const name = (file.name.replace(/\.\w+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "img") + "-" + Date.now().toString(36) + "." + ext;
      const url = SITE + "img/" + name;
      draft["static/img/" + name] = { b: reader.result.split(",")[1] };
      blobs[url] = URL.createObjectURL(file);
      saveDraft();
      resolve(url);
    };
    reader.readAsDataURL(file);
  });
}

function imageUrl(url) { // an unpublished image is shown from the draft
  const d = draft["static/" + String(url).slice(SITE.length)];
  if (!blobs[url] && d?.b) {
    const bytes = atob(d.b), a = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) a[i] = bytes.charCodeAt(i);
    const type = "image/" + (url.match(/\.(\w+)$/)?.[1] || "png").replace("jpg", "jpeg").replace("svg", "svg+xml");
    blobs[url] = URL.createObjectURL(new Blob([a], { type }));
  }
  return blobs[url] || url;
}

const pickFile = () => new Promise(resolve => {
  const f = h("input", { type: "file", accept: "image/*" });
  f.onchange = () => resolve(f.files[0]);
  f.click();
});

// ---------- interface texts (data/text.json): the menu, the brand line, button labels ----------
let TEXTS = {};
function showTexts() {
  doc.querySelectorAll("[data-k]").forEach(e => {
    const v = TEXTS[e.dataset.k]?.[e.lang];
    if (v != null && e != doc.activeElement) e.textContent = v;
  });
}
function setUiText(key, lang, value) { (TEXTS[key] = TEXTS[key] || {})[lang] = value; showTexts(); writeJSON(FILES.texts, TEXTS) }
function makeMenuEditable() { // the brand line is edited in place (the menu links stay links)
  doc.querySelectorAll("nav [data-k]").forEach(e => {
    if (e.closest("a")) return;
    e.contentEditable = "plaintext-only";
    e.oninput = () => setUiText(e.dataset.k, e.lang, e.textContent);
  });
}
doc.addEventListener("keydown", e => { if (e.key == "Enter" && e.target.closest?.("nav [contenteditable]")) e.preventDefault() }, true);
function textsDialog() {
  dialog(inLang("Interface texts", "Тексты интерфейса"), ...Object.keys(TEXTS).map(k =>
    h("div", { cls: "row" }, ...["en", "ru"].map(l => label(k + " · " + l.toUpperCase(), input(TEXTS[k][l], v => setUiText(k, l, v)))))));
}

// ---------- the page: blocks edited in place (the same markup as layouts/partials/blocks.html) ----------
let page = null, docEl = null, editable = true, undoStack = [], redoStack = [], typing = false, typingTimer, saveTimer;
let gutter, toolbar, dropLine, curBlock = null;
const blocks = () => page.blocks ??= [];

const blockTypes = () => [
  ["p", "¶", inLang("Text", "Текст")],
  ["h1", "A", inLang("Large heading", "Большой заголовок"), "#"],
  ["h2", "H", inLang("Heading", "Заголовок"), "##"],
  ["h3", "h", inLang("Subheading", "Подзаголовок"), "###"],
  ["quote", "❝", inLang("Quote", "Цитата"), ">"],
  ["ul", "•", inLang("List", "Список"), "-"],
  ["ol", "1.", inLang("Numbered list", "Нумерованный список"), "1."],
  "-",
  ["img", "🖼", inLang("Image", "Изображение")],
  ["cols", "◫", inLang("Two columns", "Две колонки")],
  ["card", "▤", inLang("Fact card", "Карточка фактов")],
  ["hr", "―", inLang("Divider", "Разделитель"), "---"],
  "-",
  ["links", "☰", inLang("Links to subpages", "Ссылки на подстраницы")],
  ["head", "▀", inLang("Page header", "Шапка страницы")],
];
const TEXT_KINDS = 7; // the first types are kinds of text a text block can be turned into
const newBlock = kind => ({
  p: { t: "p" }, h1: { t: "h", lv: 1 }, h2: { t: "h", lv: 2 }, h3: { t: "h", lv: 3 }, quote: { t: "quote" }, ul: { t: "list" }, ol: { t: "list", ord: true },
  img: { t: "img", al: "center" }, cols: { t: "cols", c: [{ t: "text" }, { t: "text" }] }, card: { t: "card", rows: [{}, {}] },
  hr: { t: "hr" }, links: { t: "links" }, head: { t: "head" },
})[kind];
const TEXT_TYPES = new Set(["p", "h", "quote", "list"]);
const alignments = () => [
  ["left", "⇤", inLang("Align left", "По левому краю")], ["center", "↔", inLang("Centre", "По центру")],
  ["right", "⇥", inLang("Align right", "По правому краю")], ["justify", "☰", inLang("Justify", "По ширине")],
];

// Stored HTML keeps only a few tags: inline (b, i, u, s, a, code, mark, sup, sub, br), list items, and in columns also paragraphs,
// subheadings and lists. mode: inline | li (list items) | block (column text)
function cleanHtml(html, mode) {
  const t = doc.createElement("template");
  t.innerHTML = html;
  const INLINE = { B: "b", STRONG: "b", I: "i", EM: "i", S: "s", STRIKE: "s", DEL: "s", U: "u", INS: "u", A: "a", BR: "br", CODE: "code", MARK: "mark", SUP: "sup", SUB: "sub" };
  const BLOCK = { P: "p", DIV: "p", H1: "h3", H2: "h3", H3: "h3", H4: "h3", UL: "ul", OL: "ol", LI: "li", BLOCKQUOTE: "p" };
  const walk = n => [...n.childNodes].map(c => {
    if (c.nodeType == 3) return esc(c.data.replace(/\u00a0/g, " "));
    if (c.nodeType != 1) return "";
    const tag = INLINE[c.tagName] || (mode == "block" && BLOCK[c.tagName]) || (mode == "li" && c.tagName == "LI" && "li"), inner = walk(c);
    if (!tag) return inner + (mode != "block" && /^(P|DIV)$/.test(c.tagName) && inner ? "<br>" : ""); // a line the browser wrapped in its own element
    if (tag == "br") return "<br>";
    if (tag == "a") { const u = c.getAttribute("href") || ""; return /^(https?:|\/|#|mailto:)/i.test(u) ? `<a href="${esc(u)}">${inner}</a>` : inner }
    return `<${tag}>${inner}</${tag}>`;
  }).join("");
  let r = walk(t.content).replace(/(<br>)+(<\/(p|li|h3)>|$)/g, "$2").replace(/<(p|li|h3|b|i|s|u|mark|sup|sub|code)><\/\1>/g, "").trim();
  if (mode == "li" && r && !/^<li>/.test(r)) r = "<li>" + r.replace(/<\/?li>/g, "") + "</li>";
  if (mode == "block" && r && !/^<(p|h3|ul|ol)>/.test(r)) r = "<p>" + r + "</p>";
  return r;
}

function plainValue(el) { // text of a plain field: no formatting, line breaks kept
  let out = "";
  const walk = n => {
    for (const c of n.childNodes) {
      if (c.nodeType == 3) out += esc(c.data.replace(/\u00a0/g, " ")).replace(/\n/g, "<br>");
      else if (c.nodeName == "BR") out += "<br>";
      else if (c.nodeType == 1) { if (/^(DIV|P)$/.test(c.nodeName) && out && !out.endsWith("<br>")) out += "<br>"; walk(c) }
    }
  };
  walk(el);
  return out.replace(/(<br>)+$/, "");
}

const plainText = html => { const t = doc.createElement("template"); t.innerHTML = (html || "").replace(/<\/(li|p)>|<br>/g, " $&"); return t.content.textContent.trim() };

function textFields(b) { // a block's text fields as [object, prefix]
  const r = [];
  if (TEXT_TYPES.has(b.t)) r.push([b, ""]);
  if (b.t == "quote") r.push([b, "cite_"]);
  if (b.t == "img") r.push([b, "cap_"]);
  if (b.t == "head") ["k_", "t_", "a_", "d_"].forEach(f => r.push([b, f]));
  if (b.t == "card") { r.push([b, "t_"]); (b.rows || []).forEach(o => r.push([o, "k_"], [o, "v_"])) }
  if (b.t == "cols") (b.c || []).forEach(o => r.push([o, o.t == "img" ? "cap_" : ""]));
  return r;
}

// the header's title and description belong to the page itself unless the header has its own text (the home page)
const boundToPage = (b, f) => b.t == "head" && (f == "t_" || f == "d_") && !(f + "en" in b) && !(f + "ru" in b),
  pageField = (f, l) => (f == "t_" ? "title" : "description") + (l == "ru" ? "_ru" : ""),
  getText = (b, o, f, l) => boundToPage(b, f) ? page[pageField(f, l)] || "" : o[f + l] || "",
  otherLang = l => l == "ru" ? "en" : "ru";
function setText(b, o, f, l, v) {
  if (boundToPage(b, f)) page[pageField(f, l)] = v;
  else if (v) o[f + l] = v;
  else if (b.t == "head" && o == b && /^[ktd]_$/.test(f)) o[f + l] = ""; // a header field the author empties stays empty (no default fills it)
  else delete o[f + l];
}

// undo / redo: whole-page snapshots; fast typing makes one step
const snapshotOf = () => JSON.stringify({ b: blocks(), t: [page.title, page.title_ru, page.description, page.description_ru] });
function snapshot() { undoStack.push(snapshotOf()); redoStack = []; typing = false }
function snapshotTyping() {
  if (!typing) { undoStack.push(snapshotOf()); redoStack = []; if (undoStack.length > 200) undoStack.shift() }
  typing = true;
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => typing = false, 1200);
}
function undo(back) {
  const from = back ? undoStack : redoStack, to = back ? redoStack : undoStack;
  if (!from.length) return;
  to.push(snapshotOf());
  const s = JSON.parse(from.pop());
  page.blocks = s.b;
  [page.title, page.title_ru, page.description, page.description_ru] = s.t;
  scheduleSave();
  render();
}
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(flushPage, 250) }
function flushPage() { // the page is saved 250 ms after the last change, at once before publishing or leaving
  clearTimeout(saveTimer);
  if (saveTimer) { saveTimer = 0; return writeJSON(PAGE, page) }
}
addEventListener("pagehide", flushPage);
const act = change => { snapshot(); change?.(); scheduleSave(); render() }; // one undo step: change, save, redraw

// one editable text field: data-f = field prefix, data-m = cleaning mode (plain | inline | li | block); an empty field shows the other language as a hint
function field(tag, b, o, f, mode, attrs = "", hint) {
  const l = root.lang, v = getText(b, o, f, l), other = getText(b, o, f, otherLang(l));
  if (!editable) return v || other ? `<${tag}${attrs}>${v || other}</${tag}>` : "";
  const ph = other ? otherLang(l).toUpperCase() + " · " + plainText(other).slice(0, 90) : hint || ({
    k_: inLang("Kicker", "Надзаголовок"), t_: inLang("Title", "Название"), a_: inLang("Second line", "Вторая строка"),
    d_: inLang("Description", "Описание"), cap_: inLang("Caption", "Подпись"), cite_: inLang("Source", "Источник"),
  }[f] || inLang("Write…", "Пишите…"));
  return `<${tag}${attrs} data-f="${f}" data-m="${mode}" contenteditable="${mode == "plain" ? "plaintext-only" : "true"}" data-ph="${esc(ph)}" spellcheck="true">${v}</${tag}>`;
}

function renderBlock(b, i) {
  const ta = b.ta ? ` class="ta-${b.ta}"` : "", di = editable ? ` data-i="${i}"` : "", l = root.lang;
  switch (b.t) {
    case "head": { // without its own kicker the header shows the shared "work in progress" text
      const own = "k_en" in b || "k_ru" in b, shared = { k_en: TEXTS.wip?.en || "", k_ru: TEXTS.wip?.ru || TEXTS.wip?.en || "" };
      return `<header class="b-head${b.tall ? " tall" : ""}"${di}>${field("p", b, own ? b : shared, "k_", "plain", ' class="k"', own ? null : shared["k_" + l])}` +
        `<h1>${field("span", b, b, "t_", "plain")}${b.a_en || b.a_ru || b.acc ? `<b>${field("span", b, b, "a_", "plain")}</b>` : ""}</h1><hr>` +
        `${field("p", b, b, "d_", "plain", ' class="ds"')}</header>`;
    }
    case "h": // lv 1: the large heading, the size and font of the page title
      return field(b.lv == 1 ? "h2" : "h" + (b.lv || 2), b, b, "", "plain", (b.lv == 1 ? ` class="big${b.ta ? " ta-" + b.ta : ""}"` : ta) + di);
    case "p":
      return field("p", b, b, "", "inline", ta + di, inLang("Write, or press / for blocks", "Пишите или нажмите / — меню блоков"));
    case "quote":
      return `<blockquote${ta}${di}>${field("p", b, b, "", "inline")}${field("cite", b, b, "cite_", "plain")}</blockquote>`;
    case "list": { // an empty list shows one empty item to write in
      const e = field(b.ord ? "ol" : "ul", b, b, "", "li", ta + di);
      return editable ? e.replace(/data-ph="([^"]*)"([^>]*)><\/(ul|ol)>$/, 'data-ph="$1"$2><li data-ph="$1"></li></$3>') : e;
    }
    case "img": {
      const handles = editable ? ["l", "r"].map(s => `<i class="rz" data-s="${s}" title="${inLang("Drag to resize", "Потяните, чтобы изменить размер")}"></i>`).join("") : "";
      const picture = b.src ? `<img src="${imageUrl(b.src)}" alt=""${editable ? ' data-pick=""' : ""}>${handles}`
        : editable ? `<button type="button" class="pi" data-pick="">🖼 ${inLang("Choose an image or drop a file here", "Выберите изображение или перетащите файл")}</button>` : "";
      return `<figure class="b-img al-${b.al || "center"}"${b.w ? ` style="--w:${b.w}%"` : ""}${di}>${picture}${field("figcaption", b, b, "cap_", "plain")}</figure>`;
    }
    case "card": {
      const rows = (b.rows || []).map((r, j) => `<div>${field("dt", b, r, "k_", "plain", ` data-r="${j}"`, inLang("Property", "Свойство"))}` +
        `${field("dd", b, r, "v_", "inline", ` data-r="${j}"`, inLang("Value", "Значение"))}</div>`).join("");
      return `<aside class="b-card"${di}>${b.src ? `<img src="${imageUrl(b.src)}" alt=""${editable ? ' data-pick=""' : ""}>` : ""}${field("h4", b, b, "t_", "plain")}` +
        `<dl>${rows}</dl>${editable ? `<button type="button" class="add" data-act="row">+ ${inLang("Row", "Строка")}</button>` : ""}</aside>`;
    }
    case "cols":
      return `<div class="b-cols"${di}>${(b.c || []).map((c, j) => `<div class="cell">${c.t == "img"
        ? `<figure class="b-img">${c.src ? `<img src="${imageUrl(c.src)}" alt=""${editable ? ` data-pick="" data-c="${j}"` : ""}>`
          : editable ? `<button type="button" class="pi" data-pick="" data-c="${j}">🖼</button>` : ""}${field("figcaption", b, c, "cap_", "plain", ` data-c="${j}"`)}</figure>`
        : field("div", b, c, "", "block", ` data-c="${j}"`)}</div>`).join("")}</div>`;
    case "hr":
      return `<hr class="b-hr"${di}>`;
    case "links":
      return `<ul class="b-links"${di}>${listedSubpages(b).map(q => `<li${q.nw ? ' class="nw"' : ""}><a href="${PAGES + q.src.replace(/_index\.md$/, "")}">${esc(l == "ru" ? q.ru || q.en : q.en)}</a></li>`).join("")
        || (editable ? `<li>${inLang("No subpages yet — add one in the block menu ⠿", "Подстраниц пока нет — добавьте в меню блока ⠿")}</li>` : "")}</ul>`;
  }
  return "";
}

function updateWordCount() { // words on the page in its language
  if (!wordCountEl) return;
  const n = blocks().flatMap(b => textFields(b).map(([o, f]) => plainText(getText(b, o, f, root.lang)))).join(" ").split(/\s+/).filter(Boolean).length;
  wordCountEl.textContent = isRu() ? n + " " + (n % 10 == 1 && n % 100 != 11 ? "слово" : n % 10 > 1 && n % 10 < 5 && (n % 100 < 12 || n % 100 > 14) ? "слова" : "слов") : n + (n == 1 ? " word" : " words");
}

function render() {
  if (!docEl) return;
  const active = doc.activeElement?.closest?.("[data-f]"), activeBlock = active?.closest("[data-i]")?.dataset.i, activeField = active?.dataset.f;
  docEl.innerHTML = blocks().map(renderBlock).join("") + (editable && !blocks().length
    ? `<button type="button" class="eb" data-act="first" style="display:block;margin:0 auto">+ ${inLang("Add the first block", "Добавить первый блок")}</button>` : "");
  if (editable) {
    docEl.append(gutter, dropLine);
    if (curBlock != null && !docEl.querySelector(`[data-i="${curBlock}"]`)) curBlock = null;
    showGutter(curBlock);
    updateWordCount();
    docEl.querySelectorAll(".b-img").forEach(placeSizeHandles);
  }
  if (activeBlock != null) focusField(+activeBlock, activeField);
}

function placeSizeHandles(figure) { // at the picture's lower corners
  const img = figure?.querySelector("img");
  if (!img) return;
  const a = figure.getBoundingClientRect(), r = img.getBoundingClientRect();
  figure.querySelectorAll(".rz").forEach(z => { z.style.left = ((z.dataset.s == "l" ? r.left : r.right) - a.left) + "px"; z.style.top = (r.bottom - a.top) + "px" });
}

function focusField(i, f, atEnd = true) {
  const k = docEl.querySelector(`[data-i="${i}"]`);
  if (!k) return;
  const e = f != null ? (k.matches(`[data-f="${f}"]`) ? k : k.querySelector(`[data-f="${f}"]`)) : k.matches("[data-f]") ? k : k.querySelector("[data-f]");
  if (!e) return;
  e.focus();
  const r = doc.createRange();
  r.selectNodeContents(e);
  r.collapse(!atEnd);
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
}

function insertBlock(b, at, focus = true) {
  act(() => blocks().splice(at, 0, b));
  curBlock = at;
  showGutter(at);
  if (focus) { if (b.t == "img" && !b.src) chooseImage(b); else focusField(at, null, false) }
}

async function chooseImage(o) {
  const file = await pickFile();
  if (!file) return;
  snapshot();
  o.src = await uploadImage(file);
  scheduleSave();
  render();
}

function convertBlock(i, kind) { // another kind of text, keeping the text
  const b = blocks()[i], n = newBlock(kind);
  snapshot();
  for (const l of ["en", "ru"]) {
    let v = b[l] || "";
    if (b.t == "list") v = v.replace(/<\/li><li>/g, "<br>").replace(/<\/?li>/g, "");
    if (n.t == "list" && v) v = "<li>" + v.split(/<br>/).join("</li><li>") + "</li>";
    if (n.t == "h") v = esc(plainText(v));
    if (v) n[l] = v;
  }
  if (b.cite_en) n.cite_en = b.cite_en;
  if (b.cite_ru) n.cite_ru = b.cite_ru;
  blocks()[i] = n;
  scheduleSave();
  render();
  focusField(i);
}

// block buttons: + adds a block after this one, ⠿ opens the block's menu (click) or moves the block (drag)
function showGutter(i) {
  if (!gutter) return;
  const k = i != null && docEl.querySelector(`[data-i="${i}"]`);
  gutter.hidden = !k;
  docEl.querySelectorAll(".cur").forEach(e => e.classList.remove("cur"));
  if (!k) return;
  k.classList.add("cur");
  const d = docEl.getBoundingClientRect(), r = k.getBoundingClientRect(), narrow = d.left < 38; // narrow screens: the text moves right to make room for the buttons
  if (root.classList.contains("ng") != narrow) { root.classList.toggle("ng", narrow); return showGutter(i) }
  gutter.style.top = Math.max(0, r.top - d.top - 6) + "px";
  gutter.style.left = (narrow ? 2 : -36) + "px";
  gutter.dataset.i = i;
}

function addMenu(i, x, y, replace) { // add a block after block i (or turn an empty paragraph into it)
  menu(x, y, blockTypes().map(t => t == "-" ? t : {
    i: t[1], t: t[2], k: t[3], f: () => {
      const b = newBlock(t[0]);
      if (replace) { act(() => blocks()[i] = b); b.t == "img" ? chooseImage(b) : focusField(i, null, false) }
      else insertBlock(b, i + 1);
    },
  }), true);
}

function blockMenu(i, x, y) {
  const b = blocks()[i], count = blocks().length, items = [];
  const set = (k, v) => act(() => { if (v == null) delete b[k]; else b[k] = v });
  if (TEXT_TYPES.has(b.t)) {
    const isKind = kind => ({ p: b.t == "p", h1: b.t == "h" && b.lv == 1, h2: b.t == "h" && b.lv != 3 && b.lv != 1, h3: b.t == "h" && b.lv == 3,
      quote: b.t == "quote", ul: b.t == "list" && !b.ord, ol: b.t == "list" && b.ord })[kind];
    items.push(...blockTypes().slice(0, TEXT_KINDS).map(t => ({ i: t[1], t: t[2], on: isKind(t[0]), f: () => convertBlock(i, t[0]) })), "-",
      ...alignments().map(([a, icon, t]) => ({ i: icon, t, on: (b.ta || "left") == a, f: () => set("ta", a == "left" ? null : a) })), "-");
  }
  if (b.t == "img") items.push(...[
    ["center", "▣", inLang("Centred, text width", "По центру, ширина текста")], ["full", "▭", inLang("Full strip width", "Во всю ширину ленты")],
    ["left", "◧", inLang("Left, text wraps", "Слева, текст обтекает")], ["right", "◨", inLang("Right, text wraps", "Справа, текст обтекает")],
  ].map(([a, icon, t]) => ({ i: icon, t, on: (b.al || "center") == a, f: () => set("al", a) })),
  ...(b.w ? [{ i: "↺", t: inLang("Original size", "Исходный размер"), f: () => set("w") }] : []),
  { i: "🖼", t: inLang("Replace image…", "Заменить изображение…"), f: () => chooseImage(b) }, "-");
  if (b.t == "card") items.push(
    { i: "🖼", t: b.src ? inLang("Replace image…", "Заменить изображение…") : inLang("Add image…", "Добавить изображение…"), f: () => chooseImage(b) },
    ...(b.src ? [{ i: "✕", t: inLang("Remove image", "Убрать изображение"), f: () => set("src") }] : []),
    { i: "+", t: inLang("Add row", "Добавить строку"), f: () => act(() => (b.rows ??= []).push({})) },
    ...((b.rows || []).length ? [{ i: "−", t: inLang("Remove last row", "Убрать последнюю строку"), f: () => act(() => b.rows.pop()) }] : []), "-");
  if (b.t == "cols") {
    b.c.forEach((c, j) => items.push({
      i: c.t == "img" ? "¶" : "🖼",
      t: (j ? inLang("Right column: ", "Правая колонка: ") : inLang("Left column: ", "Левая колонка: ")) + (c.t == "img" ? inLang("text", "текст") : inLang("image", "изображение")),
      f: () => act(() => b.c[j] = c.t == "img" ? { t: "text" } : { t: "img" }),
    }));
    items.push("-");
  }
  if (b.t == "head") items.push(
    { i: "↕", t: inLang("Centred on the screen", "По центру экрана"), on: !!b.tall, f: () => set("tall", b.tall ? null : true) },
    { i: "B", t: inLang("Second (accent) line", "Вторая (акцентная) строка"), on: !!(b.a_en || b.a_ru || b.acc),
      f: () => act(() => { if (b.a_en || b.a_ru || b.acc) { delete b.a_en; delete b.a_ru; delete b.acc } else b.acc = true }) },
    ...(b.t_en || b.t_ru || b.d_en || b.d_ru ? [{ i: "↺", t: inLang("Use the page title and description", "Взять название и описание страницы"),
      f: () => act(() => ["t_en", "t_ru", "d_en", "d_ru"].forEach(k => delete b[k])) }] : []), "-");
  if (b.t == "links") items.push({ i: "✎", t: inLang("Edit links…", "Ссылки…"), f: () => linksDialog(b) }, { i: "+", t: inLang("New subpage…", "Новая подстраница…"), f: () => newSubpageDialog() }, "-");
  if (i > 0) items.push({ i: "↑", t: inLang("Move up", "Выше"), k: "Alt+↑", f: () => moveBlock(i, i - 1) });
  if (i < count - 1) items.push({ i: "↓", t: inLang("Move down", "Ниже"), k: "Alt+↓", f: () => moveBlock(i, i + 1) });
  items.push({ i: "⧉", t: inLang("Duplicate", "Дублировать"), k: "Ctrl+D", f: () => insertBlock(JSON.parse(JSON.stringify(b)), i + 1, false) },
    { i: "🗑", t: inLang("Delete", "Удалить"), f: () => act(() => { blocks().splice(i, 1); curBlock = null }) });
  menu(x, y, items);
}

function moveBlock(i, j) {
  if (j >= 0 && j < blocks().length) act(() => { const [b] = blocks().splice(i, 1); blocks().splice(j, 0, b); curBlock = j });
}

function blockIndexAt(y) { // where a block dropped at this screen height goes
  for (const k of docEl.querySelectorAll(":scope>[data-i]")) { const r = k.getBoundingClientRect(); if (y < r.top + r.height / 2) return +k.dataset.i }
  return blocks().length;
}

let draggedBlock = null;
function startBlockDrag(e) { // ⠿ pressed: a click opens the menu, a drag moves the block (a line shows where it goes)
  e.preventDefault();
  const i = +gutter.dataset.i, handle = e.currentTarget;
  draggedBlock = { i, y: e.clientY, moved: false, to: i };
  handle.setPointerCapture(e.pointerId);
  handle.onpointermove = m => {
    if (Math.abs(m.clientY - draggedBlock.y) > 4) draggedBlock.moved = true;
    if (!draggedBlock.moved) return;
    draggedBlock.to = blockIndexAt(m.clientY);
    const all = [...docEl.querySelectorAll(":scope>[data-i]")], d = docEl.getBoundingClientRect(), k = all.find(x => +x.dataset.i == draggedBlock.to),
      r = (k || all.at(-1)).getBoundingClientRect();
    dropLine.hidden = false;
    dropLine.style.top = (k ? r.top - d.top - 8 : r.bottom - d.top + 6) + "px";
    dropLine.style.left = r.left - d.left + "px";
    dropLine.style.width = r.width + "px";
  };
  handle.onpointerup = () => {
    handle.onpointermove = handle.onpointerup = null;
    dropLine.hidden = true;
    const g = draggedBlock;
    draggedBlock = null;
    if (!g.moved) { const r = handle.getBoundingClientRect(); return blockMenu(g.i, r.left, r.bottom + 4) }
    const to = g.to > g.i ? g.to - 1 : g.to;
    if (to != g.i) moveBlock(g.i, to);
  };
}

function onKey(e) { // keys in a text field
  const el = e.target.closest?.("[data-f]");
  if (!el) return;
  const k = el.closest("[data-i]"), i = +k.dataset.i, b = blocks()[i], mode = el.dataset.m, ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() == "k" && mode != "plain") { e.preventDefault(); format("link"); return }
  if (e.altKey && /^Arrow(Up|Down)$/.test(e.key)) {
    e.preventDefault();
    const j = i + (e.key == "ArrowUp" ? -1 : 1);
    if (j >= 0 && j < blocks().length) { moveBlock(i, j); focusField(j, el.dataset.f) }
    return;
  }
  if (ctrl && e.key.toLowerCase() == "d") { e.preventDefault(); insertBlock(JSON.parse(JSON.stringify(b)), i + 1); return }
  if (e.key == "/" && b.t == "p" && !el.textContent) { e.preventDefault(); const r = el.getBoundingClientRect(); addMenu(i, r.left, r.bottom + 4, true); return }
  if (e.key == "Enter" && (mode == "plain" || mode == "inline")) { // Enter: a new line inside the same block (lists and columns: the browser's own)
    e.preventDefault();
    if (!boundToPage(b, el.dataset.f)) doc.execCommand("insertLineBreak"); // the page's own title / description: one line
  }
}

function onPaste(e) { // plain text only
  const el = e.target.closest?.("[data-f]");
  if (!el) return;
  e.preventDefault();
  const text = (e.clipboardData.getData("text/plain") || "").replace(/\r/g, "");
  if (!text) return;
  const mode = el.dataset.m;
  if (mode == "li" || mode == "block") return doc.execCommand("insertText", false, text);
  const b = blocks()[+el.closest("[data-i]").dataset.i], lines = boundToPage(b, el.dataset.f) ? [text.replace(/\s*\n\s*/g, " ")] : text.split("\n");
  lines.forEach((line, j) => { if (j) doc.execCommand("insertLineBreak"); if (line) doc.execCommand("insertText", false, line) });
}

function initDocument() {
  gutter = h("div", { id: "gut", hidden: "" },
    h("button", { type: "button", title: inLang("Add a block", "Добавить блок"), "aria-label": inLang("Add a block", "Добавить блок"),
      onclick: e => { const r = e.currentTarget.getBoundingClientRect(); addMenu(+gutter.dataset.i, r.left, r.bottom + 4) } }, "+"),
    h("button", { type: "button", cls: "hd", title: inLang("Drag to move · click for block options", "Перетащите, чтобы переместить · клик — настройки блока"),
      "aria-label": inLang("Block options", "Настройки блока") }, "⠿"));
  dropLine = h("div", { id: "dln", hidden: "" });
  toolbar = h("div", { id: "ift", hidden: "" }, ...[
    ["B", "bold", inLang("Bold", "Жирный") + " (Ctrl+B)"], ["I", "italic", inLang("Italic", "Курсив") + " (Ctrl+I)"],
    ["U", "underline", inLang("Underline", "Подчёркнутый") + " (Ctrl+U)"], ["S", "strikeThrough", inLang("Strikethrough", "Зачёркнутый")],
    ["▮", "mark", inLang("Highlight", "Выделить маркером")], ["</>", "code", inLang("Code", "Код")],
    ["x²", "superscript", inLang("Superscript", "Надстрочный")], ["x₂", "subscript", inLang("Subscript", "Подстрочный")],
    ["🔗", "link", inLang("Link", "Ссылка") + " (Ctrl+K)"], ["⌫", "removeFormat", inLang("Clear formatting", "Убрать оформление")],
    "|", ...alignments().map(([a, icon, t]) => [icon, "ta:" + a, t]),
  ].map(x => x == "|" ? h("i", { cls: "sep" })
    : h("button", { type: "button", title: x[2], "aria-label": x[2], "data-c": x[1], onmousedown: e => { e.preventDefault(); format(x[1]) } }, x[0])));
  doc.body.append(toolbar);

  let hoverTimer;
  docEl.addEventListener("mouseover", e => { // the block buttons follow the mouse, a little late
    if (gutter.contains(e.target)) return clearTimeout(hoverTimer);
    const k = e.target.closest("[data-i]");
    clearTimeout(hoverTimer);
    if (k && !draggedBlock && +k.dataset.i !== curBlock) hoverTimer = setTimeout(() => showGutter(curBlock = +k.dataset.i), 90);
  });
  docEl.addEventListener("pointerdown", e => { const k = e.target.closest("[data-i]"); if (k) showGutter(curBlock = +k.dataset.i) });
  docEl.addEventListener("focusin", e => { const k = e.target.closest("[data-i]"); if (k) showGutter(curBlock = +k.dataset.i) });

  let countTimer;
  docEl.addEventListener("input", e => { // typing: the text goes into the page (Markdown-like shortcuts at the start of a paragraph)
    const el = e.target.closest("[data-f]");
    if (!el) return;
    const i = +el.closest("[data-i]").dataset.i, b = blocks()[i], l = root.lang, f = el.dataset.f, mode = el.dataset.m;
    const o = el.dataset.r != null ? b.rows[+el.dataset.r] : el.dataset.c != null ? b.c[+el.dataset.c] : b;
    if (el.innerHTML == "<br>") el.innerHTML = "";
    if (b.t == "p" && f == "") {
      const t = el.textContent, mark = t.match(/^(#{1,3}|[-*]|1\.|>)\s/) || (t == "---" && [t]);
      if (mark) {
        const kind = { "#": "h1", "##": "h2", "###": "h3", "-": "ul", "*": "ul", "1.": "ol", ">": "quote", "---": "hr" }[mark[1] || mark[0]];
        snapshot();
        b[l] = cleanHtml(el.innerHTML, "inline").replace(/^(#{1,3}|[-*]|1\.|&gt;|---)\s?/, "");
        if (!b[l]) delete b[l];
        if (kind == "hr") { blocks()[i] = { t: "hr" }; blocks().splice(i + 1, 0, { t: "p" }); scheduleSave(); render(); focusField(i + 1) }
        else convertBlock(i, kind);
        return;
      }
    }
    snapshotTyping();
    setText(b, o, f, l, mode == "plain" ? plainValue(el) : cleanHtml(el.innerHTML, mode));
    scheduleSave();
    if (boundToPage(b, f) && f == "t_") doc.title = (page[pageField(f, l)] || "") + " · ASCW";
    clearTimeout(countTimer);
    countTimer = setTimeout(updateWordCount, 400);
  });

  // image size: drag a handle at the picture's corner (10–100 % of the text width; a centred picture grows on both sides)
  docEl.addEventListener("pointerover", e => { const f = e.target.closest?.(".b-img"); if (f) placeSizeHandles(f) });
  docEl.addEventListener("load", e => { if (e.target.tagName == "IMG") placeSizeHandles(e.target.closest(".b-img")) }, true);
  docEl.addEventListener("pointerdown", e => {
    const z = e.target.closest(".rz");
    if (!z) return;
    e.preventDefault();
    e.stopPropagation();
    const figure = z.parentNode, b = blocks()[+figure.dataset.i], img = figure.querySelector("img"), textW = docEl.getBoundingClientRect().width,
      align = b.al || "center", sign = z.dataset.s == "l" ? -1 : 1, both = align == "center" || align == "full" ? 2 : 1, x0 = e.clientX, w0 = img.getBoundingClientRect().width;
    let width = null;
    z.setPointerCapture(e.pointerId);
    figure.classList.add("rzg");
    if (align == "full") figure.classList.replace("al-full", "al-center");
    z.onpointermove = m => {
      width = Math.round(Math.min(100, Math.max(10, (w0 + sign * both * (m.clientX - x0)) / textW * 100)));
      figure.style.setProperty("--w", width + "%");
      z.dataset.v = width + "%";
      placeSizeHandles(figure);
    };
    z.onpointerup = z.onpointercancel = () => {
      z.onpointermove = z.onpointerup = z.onpointercancel = null;
      figure.classList.remove("rzg");
      if (width != null) act(() => { b.w = width; if (align == "full") delete b.al });
      else placeSizeHandles(figure);
    };
  }, true);

  docEl.addEventListener("keydown", onKey);
  docEl.addEventListener("paste", onPaste);
  docEl.addEventListener("click", e => {
    const pick = e.target.closest("[data-pick]");
    if (pick) { const b = blocks()[+pick.closest("[data-i]").dataset.i]; chooseImage(pick.dataset.c != null ? b.c[+pick.dataset.c] : b); return }
    const first = e.target.closest("[data-act=first]");
    if (first) { const r = first.getBoundingClientRect(); addMenu(-1, r.left, r.bottom + 4); return }
    const row = e.target.closest("[data-act=row]");
    if (row) { const b = blocks()[+row.closest("[data-i]").dataset.i]; act(() => (b.rows ??= []).push({})) }
    if (e.target.closest("a") && e.target.closest("[contenteditable]")) e.preventDefault(); // links in the text are edited, not followed
  });
  // image files dropped on the page: new image blocks where they are dropped
  docEl.addEventListener("dragover", e => { if ([...e.dataTransfer.items].some(x => x.kind == "file")) { e.preventDefault(); docEl.classList.add("dropping") } });
  docEl.addEventListener("dragleave", () => docEl.classList.remove("dropping"));
  docEl.addEventListener("drop", async e => {
    docEl.classList.remove("dropping");
    if (!e.dataTransfer.files.length) return; // text moved inside the page: the browser's own
    e.preventDefault(); // other files are not opened in place of the editor either
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith("image/")), at = blockIndexAt(e.clientY);
    if (!files.length) return;
    const added = await Promise.all(files.map(async f => ({ t: "img", al: "center", src: await uploadImage(f) })));
    act(() => blocks().splice(at, 0, ...added)); // one undo step
  });
  gutter.querySelector(".hd").addEventListener("pointerdown", startBlockDrag);
  doc.addEventListener("selectionchange", updateToolbar);
  doc.addEventListener("mouseup", () => setTimeout(updateToolbar));
  doc.addEventListener("keyup", e => { if (e.shiftKey) updateToolbar() });
  addEventListener("scroll", updateToolbar, { passive: true });
  addEventListener("resize", () => showGutter(curBlock));
  doc.addEventListener("keydown", e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if ((k == "z" || k == "y") && !e.target.closest?.("input,textarea,select,nav,.dl")) { e.preventDefault(); undo(k == "z" && !e.shiftKey) }
    if (k == "s") { e.preventDefault(); flushPage(); toast(inLang("The draft is saved in this browser", "Черновик сохранён в браузере")) }
  });
}

// ---------- formatting toolbar (over selected text) ----------
const selectionElement = s => s.anchorNode?.nodeType == 1 ? s.anchorNode : s.anchorNode?.parentElement;

function updateToolbar() {
  const s = getSelection(), el = s.rangeCount && !s.isCollapsed && selectionElement(s)?.closest?.('.doc [contenteditable]:not([contenteditable=false])');
  if (!el || toolbar.contains(doc.activeElement)) { if (!toolbar.contains(doc.activeElement)) toolbar.hidden = true; return }
  const r = s.getRangeAt(0).getBoundingClientRect(), target = selectionElement(s), b = blocks()[+el.closest("[data-i]")?.dataset.i];
  const plain = el.dataset.m == "plain"; // headings, captions: plain text, only the alignment applies
  if (plain && !(b && TEXT_TYPES.has(b.t))) { toolbar.hidden = true; return }
  toolbar.hidden = false;
  for (const x of toolbar.children) x.hidden = plain && !(x.dataset.c || "").startsWith("ta:");
  for (const x of toolbar.querySelectorAll("button")) { // which buttons are already applied here
    const c = x.dataset.c;
    let on = false;
    try {
      on = c.startsWith("ta:") ? (b?.ta || "left") == c.slice(3) : c == "mark" || c == "code" ? !!target.closest(c)
        : /^(bold|italic|underline|strikeThrough|superscript|subscript)$/.test(c) && doc.queryCommandState(c);
    } catch {}
    x.classList.toggle("on", on);
  }
  toolbar.style.left = Math.max(8, Math.min(r.left + scrollX + r.width / 2 - toolbar.offsetWidth / 2, innerWidth - toolbar.offsetWidth - 8)) + "px";
  toolbar.style.top = Math.max(scrollY + 56, r.top + scrollY - toolbar.offsetHeight - 8) + "px";
}

function format(c) {
  const s = getSelection(), el = selectionElement(s)?.closest?.('[contenteditable]:not([contenteditable=false])');
  if (!el) return;
  if (c.startsWith("ta:")) { // alignment of the whole block
    const k = el.closest("[data-i]"), b = k && blocks()[+k.dataset.i];
    if (b && TEXT_TYPES.has(b.t)) { const a = c.slice(3); act(() => { if (a == "left") delete b.ta; else b.ta = a }) }
    return;
  }
  if (c == "mark" || c == "code") { // toggle a wrapping tag
    const r = s.rangeCount && s.getRangeAt(0), on = selectionElement(s).closest(c);
    if (!r) return;
    if (on && el.contains(on)) on.replaceWith(...on.childNodes);
    else if (!r.collapsed) { const w = doc.createElement(c); w.append(r.extractContents()); r.insertNode(w); s.selectAllChildren(w) }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  if (c == "link") {
    const r = s.rangeCount && s.getRangeAt(0).cloneRange(), current = s.anchorNode.parentElement?.closest("a")?.getAttribute("href") || "https://";
    const address = input(current, () => {});
    const ok = () => {
      w.remove();
      el.focus();
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      const u = address.value.trim();
      doc.execCommand(u && u != "https://" ? "createLink" : "unlink", false, u);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const w = dialog(inLang("Link", "Ссылка"), label(inLang("Address (empty — remove the link)", "Адрес (пусто — убрать ссылку)"), address), h("div", { cls: "row" }, button("OK", ok)));
    address.onkeydown = e => { if (e.key == "Enter") ok() };
    return;
  }
  doc.execCommand(c);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

// ---------- page settings, new pages, subpages ----------
const DIR = (PAGE || "").replace(/^content\/|_index\.md$/g, ""); // this page's folder in content/
let subpages = [];
const liveSubpages = () => subpages.filter(q => !q.del);

async function loadSubpages() { // the published list (kids, in the page) and the draft's new / renamed / deleted subpages
  try { subpages = JSON.parse(byId("kids")?.textContent || "[]") } catch { subpages = [] }
  const re = new RegExp(`^content/${DIR.replace(/[/.-]/g, "\\$&")}([^/]+)/_index\\.md$`);
  for (const path in draft) {
    const m = path.match(re);
    if (!m) continue;
    const q = subpages.find(k => "content/" + k.src == path);
    if (draft[path].del) { if (q) q.del = 1; continue }
    let o = {};
    try { o = JSON.parse(draft[path].t) } catch {}
    if (q) { q.en = o.title || q.en; q.ru = o.title_ru || o.title || q.ru }
    else subpages.push({ src: path.slice(8), en: o.title || m[1], ru: o.title_ru || o.title || m[1], nw: 1, w: o.weight || 0 });
  }
  subpages.sort((a, b) => (a.nw ? 1 : 0) - (b.nw ? 1 : 0));
}

const readPage = async path => { const t = await readFile(path); if (t == null) return null; try { return JSON.parse(t) } catch { return null } };
const slug = v => v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function newSubpageDialog() {
  let en, ru, address;
  dialog(inLang("New subpage", "Новая подстраница"),
    label(inLang("Title", "Название") + " · EN", en = input("", v => { if (!address.dataset.t) address.value = slug(v) })),
    label(inLang("Title", "Название") + " · RU", ru = input("", () => {})),
    label(inLang("Address", "Адрес") + " (" + PAGES + DIR + "…)", address = input("", (v, e) => { e.dataset.t = 1 })),
    h("div", { cls: "row" }, button(inLang("Create and open", "Создать и открыть"), async () => {
      const s = slug(address.value);
      if (!s || !en.value.trim()) return toast(inLang("Title (EN) and address are required", "Нужны название (EN) и адрес"), 1);
      const path = `content/${DIR}${s}/_index.md`;
      if (await readFile(path) != null) return toast(inLang("This address is taken", "Такой адрес уже занят"), 1);
      if (!blocks().some(b => b.t == "links")) { blocks().push({ t: "links" }); await writeJSON(PAGE, page) } // so the new page can be reached from this one
      await writeJSON(path, { title: en.value.trim(), title_ru: ru.value.trim(), description: "", description_ru: "", weight: (subpages.length + 1) * 10, blocks: [{ t: "head" }, { t: "p" }] });
      await new Promise(r => setTimeout(r, 300));
      location.href = PAGES + DIR + s + "/";
    })));
  en.focus();
}

async function deletePage() {
  const up = DIR.replace(/[^/]+\/$/, "");
  if (!up) return toast(inLang("This page cannot be deleted", "Эту страницу удалить нельзя"), 1);
  if (liveSubpages().length) return toast(inLang("Delete its subpages first", "Сначала удалите её подстраницы"), 1);
  if (!confirm(inLang("Delete this page when publishing?", "Удалить эту страницу при публикации?"))) return;
  await published(PAGE);
  if (base[PAGE] == null) delete draft[PAGE];
  else draft[PAGE] = { del: 1, from: draft[PAGE]?.from ?? hash(base[PAGE]) };
  saveDraft();
  location.href = PAGES + up;
}

function pageDialog() { // title, description, background, subpages
  const set = (k, v) => { snapshotTyping(); if (v) page[k] = v; else delete page[k]; scheduleSave(); render() };
  const showBg = () => doc.querySelector("main").style.setProperty("--bg", page.bg ? page.bg == "none" ? "none" : `url(${imageUrl(page.bg)})` : "");
  // background: the site's backgrounds (hugo.toml; the first is the default), the page's own picture, none, or a new picture
  const siteBgs = editButton.dataset.bgs.split(" "), gallery = h("div", { cls: "bgs" });
  const setBg = v => { if (v) page.bg = v; else delete page.bg; scheduleSave(); showBg(); tiles() };
  const tile = (src, text, on, onclick) => h("button", { type: "button", cls: "bgt" + (on ? " on" : ""), title: text, "aria-label": text, "aria-pressed": on ? "true" : "false", onclick },
    src ? h("img", { src, alt: "" }) : h("span", {}), h("small", {}, text));
  const tiles = () => gallery.replaceChildren(
    ...siteBgs.map((u, i) => tile(u, i ? inLang("Site background", "Фон сайта") + " " + (i + 1) : inLang("Default", "По умолчанию"),
      i ? page.bg == u : !page.bg || page.bg == u, () => setBg(i ? u : null))),
    ...(page.bg && page.bg != "none" && !siteBgs.includes(page.bg) ? [tile(imageUrl(page.bg), inLang("This page's own", "Своё у страницы"), true, () => {})] : []),
    tile(null, inLang("None", "Без фона"), page.bg == "none", () => setBg("none")),
    tile(null, "+ " + inLang("Your picture…", "Своё изображение…"), false, async () => { const f = await pickFile(); if (f) setBg(await uploadImage(f)) }));
  tiles();
  dialog(inLang("Page", "Страница"),
    h("div", { cls: "row" },
      label(inLang("Title", "Название") + " · EN", input(page.title, v => set("title", v))),
      label(inLang("Title", "Название") + " · RU", input(page.title_ru, v => set("title_ru", v)))),
    h("div", { cls: "row" },
      label(inLang("Description (also shown in link previews)", "Описание (видно и в превью ссылок)") + " · EN", input(page.description, v => set("description", v), { area: 1 })),
      label(inLang("Description", "Описание") + " · RU", input(page.description_ru, v => set("description_ru", v), { area: 1 }))),
    h("div", { style: "display:flex;flex-direction:column;gap:4px" }, h("label", {}, inLang("Background", "Фон")), gallery), // not inside the label: a label passes clicks to its first button
    h("div", { style: "font-size:12px;color:#e8e8e080" }, inLang("Address: ", "Адрес: ") + PAGES + DIR),
    h("div", { cls: "row" }, button("+ " + inLang("New subpage…", "Новая подстраница…"), newSubpageDialog), button("🗑 " + inLang("Delete page", "Удалить страницу"), deletePage)));
}

async function saveSubpageOrder() { // the order is the pages' weight
  const list = liveSubpages(), pages = await Promise.all(list.map(q => readPage("content/" + q.src)));
  pages.forEach((o, i) => { if (o && o.weight != (i + 1) * 10) { o.weight = (i + 1) * 10; writeJSON("content/" + list[i].src, o) } });
}

// the links block lists the subpages; "hide" (page sources) takes pages out of this list without deleting them
const listedSubpages = b => liveSubpages().filter(q => !(b.hide || []).includes(q.src));

function linksDialog(b) {
  const box = h("div", { style: "display:flex;flex-direction:column;gap:8px" }), hiddenBox = h("div", { style: "display:flex;flex-direction:column;gap:6px" });
  const show = (q, on) => { act(() => { b.hide = (b.hide || []).filter(x => x != q.src); if (!on) b.hide.push(q.src); if (!b.hide.length) delete b.hide }); rows() };
  const rows = () => {
    box.replaceChildren(...listedSubpages(b).map((q, i, list) => {
      const rename = async (l, v) => { q[l] = v; const path = "content/" + q.src, o = await readPage(path); if (o) { o[l == "en" ? "title" : "title_ru"] = v; await writeJSON(path, o) } render() };
      const swap = async d => {
        if (!list[i + d]) return;
        const j = subpages.indexOf(list[i + d]), k = subpages.indexOf(q);
        [subpages[j], subpages[k]] = [subpages[k], subpages[j]];
        await saveSubpageOrder();
        rows();
        render();
      };
      return h("div", { cls: "row", style: "align-items:flex-end" },
        label("EN", input(q.en, v => rename("en", v))), label("RU", input(q.ru, v => rename("ru", v))),
        button("↑", () => swap(-1), inLang("Up", "Выше")), button("↓", () => swap(1), inLang("Down", "Ниже")),
        button("✕", () => show(q, false), inLang("Remove from this list (the page stays on the site)", "Убрать из списка (страница остаётся на сайте)")));
    }));
    const hidden = liveSubpages().filter(q => (b.hide || []).includes(q.src));
    hiddenBox.replaceChildren(
      ...(hidden.length ? [h("div", { style: "font:400 11px 'Exo 2',sans-serif;letter-spacing:1px;color:#e8e8e099;text-transform:uppercase;margin-top:6px" }, inLang("Not in the list", "Не в списке"))] : []),
      ...hidden.map(q => h("div", { cls: "row" }, h("span", {}, isRu() ? q.ru || q.en : q.en), button("+ " + inLang("Add to the list", "Добавить в список"), () => show(q, true)))));
  };
  rows();
  dialog(inLang("Links to subpages", "Ссылки на подстраницы"), box, hiddenBox, h("div", { cls: "row" }, button("+ " + inLang("New subpage…", "Новая подстраница…"), newSubpageDialog)));
}

function phonePreview() { // the page with the draft, in a phone-sized frame
  const u = new URL(location.href);
  u.searchParams.set("preview", "");
  const w = h("div", { id: "pvw", onclick: e => { if (e.target == w) w.remove() } },
    h("iframe", { src: u.href, title: inLang("Phone preview", "Предпросмотр на телефоне") }),
    button(inLang("Close preview", "Закрыть предпросмотр"), () => w.remove()));
  doc.body.append(w);
}

// ---------- the map: markers, timeline events, country names and settings ----------
let addingMarkers = false, movingNames = false, propsWindow = null;
const markerKinds = () => [["●", inLang("Circle", "Круг")], ["◈", inLang("Circle in a diamond", "Круг в ромбе")], ["▲", inLang("Triangle", "Треугольник")]],
  latLonOf = (my, mx) => ({ a: +(90 - my / MAP.H * 180).toFixed(3), o: +(mx / MAP.W * 360 - 180).toFixed(3) }),
  saveMarkers = () => { writeJSON(FILES.markers, MK); MAP.markers() },
  closeProps = () => { propsWindow?.remove(); propsWindow = null };

function openProps(content, key) { // a marker's / country's properties: a small window next to it, moved by its title row
  if (propsWindow?.key == key && propsWindow.isConnected) return false;
  propsWindow?.remove();
  const title = h("h3", {}, h("span", {}, byId("pt").textContent),
    h("button", { type: "button", cls: "x", title: inLang("Close", "Закрыть"), "aria-label": inLang("Close", "Закрыть"), onclick: closeProps }, "×"));
  const w = propsWindow = h("div", { cls: "dlb cx", tabindex: -1 }, title, content);
  w.key = key;
  doc.body.append(w);
  title.onpointerdown = e => {
    if (e.target.closest("button")) return;
    e.preventDefault();
    title.setPointerCapture(e.pointerId);
    const r = w.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    w.classList.add("mv");
    title.onpointermove = m => {
      w.style.left = Math.max(8, Math.min(innerWidth - w.offsetWidth - 8, m.clientX - dx)) + "px";
      w.style.top = Math.max(8, Math.min(innerHeight - w.offsetHeight - 8, m.clientY - dy)) + "px";
    };
    title.onpointerup = title.onpointercancel = () => { title.onpointermove = title.onpointerup = title.onpointercancel = null; w.classList.remove("mv") };
  };
  const [x, y] = MAP.lp(), width = w.offsetWidth, height = w.offsetHeight, left = x + 18 + width < innerWidth ? x + 18 : x - 18 - width; // beside the click
  w.style.left = Math.max(8, Math.min(innerWidth - width - 8, left)) + "px";
  w.style.top = Math.max(56, Math.min(innerHeight - height - 8, y - 30)) + "px";
  return true;
}

function offerPlacePage(o, save, en, ru) { // no page yet: the empty panel offers to create it
  byId("px").append(h("div", { cls: "row", style: "justify-content:center;margin-top:24px" }, button("📄 " + inLang("Create its page", "Создать страницу"), async () => {
    let s = slug(en() || "place") || "place";
    const stem = s;
    for (let j = 2; await readFile(`content/places/${s}/_index.md`) != null || (window.PL || []).includes(s); j++) s = stem + "-" + j;
    await writeJSON(`content/places/${s}/_index.md`, { title: en() || ru(), title_ru: ru() || en(), description: "", description_ru: "", blocks: [{ t: "head" }, { t: "p" }] });
    o.pg = s;
    save();
    MAP.panel();
  })));
}

async function initMap() {
  window.MK = await readJSON(FILES.markers, MK);
  window.EV = await readJSON(FILES.events, EV);
  window.COU = await readJSON(FILES.countries, COU);
  MAP.redraw();
  MAP.onTap = (mx, my, i) => { // a marker opens its form; in the new markers mode a click places one
    if (i != null) { MAP.pickM(i); return true }
    if (!addingMarkers) return false;
    MK.push({ ...latLonOf(my, mx), n: "", r: "" });
    saveMarkers();
    MAP.pickM(MK.length - 1);
    return true;
  };
  MAP.pageOK = g => (window.PL || []).includes(g) || !!draft[`content/places/${g}/_index.md`];
  MAP.onMarker = i => markerForm(i);
  MAP.onPanel = r => countryForm(r);
  initNameDragging();
  if (MAP.sel()) countryForm(MAP.sel());
  byId("pc").addEventListener("click", () => { // closing: unnamed new markers are dropped
    closeProps();
    const n = MK.length;
    window.MK = MK.filter(q => q.n || q.r || q.pg);
    if (MK.length != n) saveMarkers();
  });
  const markersSvg = byId("mw");
  let drag = null; // markers are dragged to move them
  markersSvg.addEventListener("pointerdown", e => {
    const g = e.target.closest("[data-m]");
    if (!g) return;
    e.stopPropagation();
    markersSvg.setPointerCapture(e.pointerId);
    drag = { i: +g.dataset.m, x: e.clientX, y: e.clientY, moved: 0 };
  });
  markersSvg.addEventListener("pointermove", e => {
    if (!drag) return;
    drag.moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (drag.moved < 4) return;
    const { mx, my } = MAP.toMap(e);
    Object.assign(MK[drag.i], latLonOf(my, mx));
    MAP.markers();
  });
  markersSvg.addEventListener("pointerup", () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.moved < 4) return MAP.pickM(d.i);
    saveMarkers();
    if (propsWindow?.key == "m" + d.i) { propsWindow = null; markerForm(d.i) }
  });
  byId("xt")?.after(h("button", { type: "button", id: "xe", style: "position:absolute;right:56px;top:4px;z-index:2;width:44px;height:44px;font-size:18px;cursor:pointer;color:#e8e8e0a6",
    title: inLang("Edit events", "Редактировать события"), onclick: eventsDialog }, "✎")); // in the timeline
}

function markerForm(i) {
  const q = MK[i];
  if (!q) return;
  const change = (k, v) => { if (v === "" || v == null) delete q[k]; else q[k] = v; saveMarkers(); byId("pt").textContent = (isRu() ? q.r || q.n : q.n || q.r) || "" };
  const number = (k, ph) => input(q[k], v => change(k, v === "" ? "" : +v), { type: "number", ph });
  const form = h("div", { cls: "ef" },
    h("div", { cls: "row" }, label(inLang("Name", "Название") + " · EN", input(q.n, v => change("n", v))), label(inLang("Name", "Название") + " · RU", input(q.r, v => change("r", v)))),
    h("div", { cls: "row" },
      label(inLang("Icon", "Значок"), select(q.k == 1 || q.k == 2 ? q.k : 0, markerKinds().map(([s, t], j) => [j, s + " " + t]), v => change("k", +v || ""))),
      label(inLang("Font", "Шрифт"), select(q.f == "cap" ? "cap" : "", [["", "Play"], ["cap", inLang("Play, large, underlined (capital)", "Play, крупный с подчёркиванием (столица)")]], v => change("f", v)))),
    h("div", { cls: "row" }, label(inLang("Shown from year", "Видна с года"), number("y0", "—")), label(inLang("to year", "по год"), number("y1", "—"))),
    h("div", { cls: "row" }, label(inLang("Latitude", "Широта"), number("a")), label(inLang("Longitude", "Долгота"), number("o"))),
    h("div", { cls: "row" }, button(inLang("Done", "Готово"), closeProps),
      button("🗑 " + inLang("Delete", "Удалить"), () => { MK.splice(i, 1); saveMarkers(); closeProps(); byId("pc").click() })));
  if (openProps(form, "m" + i) && !q.n && !q.r) setTimeout(() => form.querySelector("input").focus());
  if (!(q.pg && MAP.pageOK(q.pg))) offerPlacePage(q, saveMarkers, () => q.n || q.r, () => q.r || q.n);
}

function markersDialog() { // all markers, with a search; a click shows one
  const box = h("div", { cls: "ml" }), search = input("", v => rows(v), { ph: inLang("Search", "Поиск") });
  const rows = (s = "") => box.replaceChildren(...MK.map((q, i) => [q, i])
    .filter(([q]) => ((q.n || "") + " " + (q.r || "")).toLowerCase().includes(s.toLowerCase()))
    .map(([q, i]) => h("button", { type: "button", onclick: () => { w.remove(); MAP.focus(q.o, q.a); MAP.pickM(i) } },
      (isRu() ? q.r || q.n : q.n || q.r) || "—", h("small", {}, q.y0 != null || q.y1 != null ? `${q.y0 ?? "…"}–${q.y1 ?? "…"}` : ""))));
  rows();
  const w = dialog(inLang("Markers", "Метки") + " · " + MK.length, search, box);
}

function eventsDialog() { // timeline events: year, EN, RU
  const box = h("div", { style: "display:flex;flex-direction:column;gap:10px" });
  const save = () => { writeJSON(FILES.events, EV); MAP.timeline() }, sortAndSave = () => { EV.sort((a, b) => a[0] - b[0]); save() };
  const rows = () => box.replaceChildren(...EV.map((v, i) => {
    const row = h("div", { cls: "row", style: "align-items:flex-end" },
      label(inLang("Year", "Год"), input(v[0], x => { v[0] = +x; save() }, { type: "number" })),
      label("EN", input(v[1], x => { v[1] = x; save() }, { area: 1 })),
      label("RU", input(v[2], x => { v[2] = x; save() }, { area: 1 })),
      button("✕", () => { EV.splice(i, 1); sortAndSave(); rows() }, inLang("Delete", "Удалить")));
    row.firstChild.style.flex = "0 0 80px";
    return row;
  }));
  rows();
  const w = dialog(inLang("Timeline events", "События хронологии"), box, h("div", { cls: "row" },
    button("+ " + inLang("Event", "Событие"), () => { EV.push([MAP.yr(), "", ""]); writeJSON(FILES.events, EV); rows(); box.lastChild?.querySelector("textarea")?.focus() }),
    button(inLang("Done", "Готово"), () => { sortAndSave(); w.remove() })));
  w.onclick = e => { if (e.target == w) { sortAndSave(); w.remove() } };
}

const DEFAULT_NAME_PT = 25; // as in assets/map.js
function countryForm(r) { // a country's names, its name's size / opacity / letter spacing, its name back to its place
  const o = COU[r.c] = COU[r.c] || {};
  const tidy = () => { // empty and default values are not stored
    for (const k in o) if (o[k] === "" || o[k] == null || k == "lo" && o[k] == 1 || (k == "lx" || k == "ly" || k == "lk") && !o[k]) delete o[k];
    if (!Object.keys(o).length) delete COU[r.c];
    writeJSON(FILES.countries, COU);
  };
  let redrawTimer;
  const change = (k, v, delay = 250) => { o[k] = v; COU[r.c] = o; tidy(); clearTimeout(redrawTimer); redrawTimer = setTimeout(() => MAP.redraw(), delay) };
  const slider = (k, min, max, step, text, initial = 1, unit = v => Math.round(v * 100) + "%") => {
    const e = h("input", { type: "range", min, max, step, cls: "ei" }), value = h("span", { style: "text-transform:none" });
    e.value = o[k] ?? initial;
    const show = () => value.textContent = " " + unit(e.value);
    show();
    e.oninput = () => { show(); change(k, +e.value, 60) };
    return label(h("span", {}, text, value), e);
  };
  openProps(h("div", { cls: "ef" },
    h("div", { cls: "row" },
      label(inLang("Name", "Название") + " · EN", input(o.en, v => change("en", v), { ph: r.n0 })),
      label(inLang("Name", "Название") + " · RU", input(o.ru, v => change("ru", v), { ph: r.r0 }))),
    h("div", { cls: "row" },
      slider("lz", 4, 150, 1, inLang("Name size", "Размер названия"), DEFAULT_NAME_PT, v => v + " pt"),
      slider("lo", 0, 1, .05, inLang("Name opacity", "Прозрачность названия"))),
    h("div", { cls: "row" }, slider("lk", -.2, 1.5, .02, inLang("Letter spacing", "Расстояние между буквами"), 0), h("div", {})),
    h("div", { cls: "row" }, button(inLang("Name back to its place", "Вернуть название на место"), () => { delete o.lx; delete o.ly; change("lx", 0, 0) }))), "c" + r.c);
  if (!(o.pg && MAP.pageOK(o.pg))) offerPlacePage(o, () => { COU[r.c] = o; writeJSON(FILES.countries, COU) }, () => o.en || r.n0 || r.name, () => o.ru || r.r0 || r.ru);
}

function initNameDragging() { // country names are dragged in the "names" mode (the shift is stored as lx / ly, map px)
  const names = byId("sl");
  let drag = null;
  names.addEventListener("pointerdown", e => {
    const t = e.target.closest("text[data-i]");
    if (!t || !movingNames) return;
    e.stopPropagation();
    e.preventDefault();
    names.setPointerCapture(e.pointerId);
    drag = { t, id: +t.dataset.i, from: MAP.toMap(e), moved: 0 };
  });
  names.addEventListener("pointermove", e => {
    if (!drag) return;
    const p = MAP.toMap(e), dx = p.mx - drag.from.mx, dy = p.my - drag.from.my;
    drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
    drag.dx = dx;
    drag.dy = dy;
    drag.t.setAttribute("transform", `translate(${dx} ${dy})`);
  });
  names.addEventListener("pointerup", () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    MAP.pick(d.id);
    const r = MAP.sel();
    if (!r || d.moved <= 1) return;
    const o = COU[r.c] = COU[r.c] || {};
    o.lx = Math.round((o.lx || 0) + d.dx);
    o.ly = Math.round((o.ly || 0) + d.dy);
    writeJSON(FILES.countries, COU);
    closeProps();
    countryForm(r);
    MAP.redraw();
  });
}

// ---------- on / off ----------
async function start() {
  editing = true;
  await new Promise(r => { // the editor's styles first
    const link = h("link", { rel: "stylesheet", href: editButton.dataset.css });
    link.onload = link.onerror = r;
    doc.head.append(link);
  });
  TEXTS = await readJSON(FILES.texts, {});
  const notMapPage = PAGE && !/^map\//.test(SRC);
  if (PREVIEW) {
    editable = false;
    editButton.hidden = true;
  } else {
    store.ascwEditOn = 1;
    root.classList.add("ed");
    editButton.classList.add("on");
    const barButton = (icon, text, onclick, tip) => { const b = button(icon, onclick, tip || text); if (text) b.append(h("span", { cls: "lb" }, text)); return b };
    publishButtons = h("span", { style: "display:contents" },
      button("", publish, inLang("Send all changes to GitHub", "Отправить все изменения на GitHub")),
      button("↺", discardAll, inLang("Discard all unpublished changes", "Отменить все неопубликованные изменения")));
    bar = h("div", { id: "eb" }, ...EMBEDDED ? [] : [publishButtons]);
    toastEl = h("div", { id: "et", hidden: "" });
    doc.body.append(bar, toastEl);
    if (draft[FILES.texts]) showTexts();
    if (notMapPage && (page = await readPage(PAGE))) {
      if (NEW_PAGE) doc.title = (page.title || "") + " · ASCW";
      bar.append(
        undoButton = barButton("↶", "", () => undo(true), inLang("Undo", "Отменить") + " (Ctrl+Z)"),
        redoButton = barButton("↷", "", () => undo(false), inLang("Redo", "Повторить") + " (Ctrl+Shift+Z)"),
        ...EMBEDDED ? [] : [
          barButton("📄", inLang("Page", "Страница"), pageDialog, inLang("Title, description, background, subpages", "Название, описание, фон, подстраницы")),
          barButton("📱", inLang("Phone", "Телефон"), phonePreview, inLang("Preview on a phone screen", "Как на экране телефона")),
        ],
        wordCountEl = h("span", { cls: "st" }));
    }
    if (MAP) {
      const namesButton = barButton("🏷", inLang("Country names", "Названия стран"), e => {
        movingNames = !movingNames;
        e.currentTarget.classList.toggle("on", movingNames);
        root.classList.toggle("lbe", movingNames);
        if (movingNames && addingMarkers) markersButton.click();
        if (movingNames) toast(inLang("Drag country names to move them; click a name to change its size, letter spacing and opacity.",
          "Названия стран можно перетаскивать; клик по названию — размер, расстояние между буквами и прозрачность."));
      }, inLang("Move and adjust country names", "Двигать и настраивать названия стран"));
      namesButton.id = "lbb";
      const markersButton = barButton("📍", inLang("Add markers", "Новые метки"), e => {
        addingMarkers = !addingMarkers;
        e.currentTarget.classList.toggle("on", addingMarkers);
        root.classList.toggle("mke", addingMarkers);
        if (addingMarkers && movingNames) namesButton.click();
        if (addingMarkers) toast(inLang("Click the map to place a marker. Drag markers to move them; click one to edit it.",
          "Клик по карте ставит метку. Метки можно перетаскивать, клик по метке — редактировать."));
      }, inLang("Place markers by clicking the map", "Ставить метки кликом по карте"));
      bar.append(markersButton, barButton("☰", inLang("Markers", "Метки"), markersDialog, inLang("All markers", "Все метки")), namesButton,
        barButton("⏱", inLang("Events", "События"), eventsDialog, inLang("Timeline events", "События хронологии")));
    }
    if (!EMBEDDED) {
      bar.append(barButton("⚙", "", tokenDialog, inLang("GitHub access", "Доступ к GitHub")), barButton("Aa", "", textsDialog, inLang("Interface texts", "Тексты интерфейса")));
      makeMenuEditable();
    }
    updateBar();
    if (!token && !EMBEDDED) toast(inLang("Edit mode. Changes stay in this browser until you publish them (⚙ — GitHub access).",
      "Режим редактирования. Изменения хранятся в браузере, пока вы их не опубликуете (⚙ — доступ к GitHub)."));
  }
  if (PREVIEW && notMapPage) page = draft[PAGE] && await readPage(PAGE); // the preview shows a page only when the draft changed it
  if (page) {
    if (page.bg) doc.querySelector("main").style.setProperty("--bg", page.bg == "none" ? "none" : `url(${imageUrl(page.bg)})`);
    page.blocks ??= [{ t: "head" }, ...(byId("kids") ? [{ t: "links" }] : [])];
    docEl = doc.querySelector("article.doc")
      || (NEW_PAGE ? (doc.querySelector("main>section").replaceChildren(h("article", { cls: "doc" })), doc.querySelector("article.doc")) : null);
    if (docEl) {
      await loadSubpages();
      if (editable) initDocument();
      render();
    }
  }
  if (MAP && !PREVIEW) await initMap();
}

window.EDIT = { toggle() { if (editing) { store.ascwEditOn = ""; location.reload() } else start() } };
start();
