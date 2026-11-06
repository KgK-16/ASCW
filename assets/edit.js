// ASCW map editor. Loaded only on the map page, in edit mode (✎ in the menu; unlocked once per browser by opening a page with ?edit).
// Every change goes into a draft kept in this browser (localStorage) and is published to GitHub as one commit with the editor's
// own access token; GitHub Actions then rebuilds the site.
// Files it edits: assets/markers.json, assets/events.json, assets/countries.json. Articles are written in Obsidian (tools/publish.ps1).
// Styles: assets/edit.css. Built by layouts/partials/js.html (esbuild: minified, in its own scope).

// ---------- setup ----------
const doc = document, root = doc.documentElement, byId = id => doc.getElementById(id), editButton = byId("ed");
const REPO = editButton.dataset.repo, BRANCH = "main";
const FILES = { markers: "assets/markers.json", events: "assets/events.json", countries: "assets/countries.json" };
const store = (() => { try { return localStorage } catch { return {} } })();
const MAP = window.MAP;                                   // the map page's hooks (assets/map.js)

const isRu = () => root.lang == "ru",
  inLang = (en, ru) => isRu() ? ru : en,
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

let draft = {}, base = {}, pending = {}, editing = false, token = store.ascwTok || "";
const readDraft = text => { // only the map's files: older drafts may still hold articles, which are not edited here any more
  try { draft = Object.fromEntries(Object.entries(JSON.parse(text || "{}")).filter(([path]) => Object.values(FILES).includes(path))) } catch { draft = {} }
};
readDraft(store.ascwDraft);
addEventListener("storage", e => { // another tab of the map
  if (e.key != "ascwDraft") return;
  readDraft(e.newValue);
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

async function readFile(path) { const d = draft[path]; return d ? d.t : published(path) }

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
  if (!changeCount()) return;
  const button = publishButtons.firstChild;
  button.disabled = true;
  toast(inLang("Publishing…", "Публикация…"));
  try {
    const head = (await github(`git/ref/heads/${BRANCH}`)).object.sha, commit = await github(`git/commits/${head}`), tree = [];
    const listing = await github(`git/trees/${commit.tree.sha}?recursive=1`), files = listing.tree.filter(e => e.type == "blob");
    const shaOf = Object.fromEntries(files.map(e => [e.path, e.sha]));
    const atHead = path => shaOf[path] ? github(`git/blobs/${shaOf[path]}`, { raw: 1 }) : Promise.resolve(null); // a file as it is on GitHub now
    // files changed on GitHub since this draft started changing them (from another browser or device): overwrite only if confirmed
    const changed = [];
    await Promise.all(Object.entries(draft).map(async ([path, v]) => { if ("from" in v && hash(await atHead(path) ?? "") != v.from) changed.push(path) }));
    if (changed.length && !confirm(inLang("Changed on GitHub after you began editing them here (in another browser or on another device?):\n\n",
      "Изменены на GitHub после того, как вы начали править их здесь (в другом браузере или на другом устройстве?):\n\n") + changed.join("\n") +
      inLang("\n\nPublish anyway? Those changes will be lost.", "\n\nВсё равно опубликовать? Те изменения пропадут."))) return toastEl.hidden = true;
    for (const [path, v] of Object.entries(draft)) {
      const blob = await github("git/blobs", { method: "POST", body: JSON.stringify({ content: v.t, encoding: "utf-8" }) });
      tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const newTree = await github("git/trees", { method: "POST", body: JSON.stringify({ base_tree: commit.tree.sha, tree }) });
    const newCommit = await github("git/commits", { method: "POST", body: JSON.stringify({ message: "Edit the map via the site's map editor", tree: newTree.sha, parents: [head] }) });
    await github(`git/refs/heads/${BRANCH}`, { method: "PATCH", body: JSON.stringify({ sha: newCommit.sha }) });
    for (const [path, v] of Object.entries(draft)) base[path] = v.t;
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

// ---------- interface: bar, messages, dialogs, inputs ----------
let bar, toastEl, publishButtons, toastTimer;

function updateBar() {
  if (!editing) return;
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

function pageField(value, onchange) { // the place's page: one of the notes in Obsidian's folder of places
  const pages = [...new Set([...(window.PL || []), ...value ? [value] : []])].sort();
  return label(inLang("Page", "Страница"), select(value || "", [["", "—"], ...pages.map(p => [p, p])], onchange));
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
    h("div", { cls: "row" }, pageField(q.pg, v => { change("pg", v); MAP.panel() })),
    h("div", { cls: "row" }, button(inLang("Done", "Готово"), closeProps),
      button("🗑 " + inLang("Delete", "Удалить"), () => { MK.splice(i, 1); saveMarkers(); closeProps(); byId("pc").click() })));
  if (openProps(form, "m" + i) && !q.n && !q.r) setTimeout(() => form.querySelector("input").focus());
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
    h("div", { cls: "row" }, slider("lk", -.2, 1.5, .02, inLang("Letter spacing", "Расстояние между буквами"), 0), pageField(o.pg, v => { change("pg", v, 0) })),
    h("div", { cls: "row" }, button(inLang("Name back to its place", "Вернуть название на место"), () => { delete o.lx; delete o.ly; change("lx", 0, 0) }))), "c" + r.c);
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
  store.ascwEditOn = 1;
  root.classList.add("ed");
  editButton.classList.add("on");
  const barButton = (icon, text, onclick, tip) => { const b = button(icon, onclick, tip || text); if (text) b.append(h("span", { cls: "lb" }, text)); return b };
  publishButtons = h("span", { style: "display:contents" },
    button("", publish, inLang("Send all changes to GitHub", "Отправить все изменения на GitHub")),
    button("↺", discardAll, inLang("Discard all unpublished changes", "Отменить все неопубликованные изменения")));
  bar = h("div", { id: "eb" }, publishButtons);
  toastEl = h("div", { id: "et", hidden: "" });
  doc.body.append(bar, toastEl);
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
    barButton("⏱", inLang("Events", "События"), eventsDialog, inLang("Timeline events", "События хронологии")),
    barButton("⚙", "", tokenDialog, inLang("GitHub access", "Доступ к GitHub")));
  updateBar();
  if (!token) toast(inLang("Map editing. Changes stay in this browser until you publish them (⚙ — GitHub access).",
    "Редактирование карты. Изменения хранятся в браузере, пока вы их не опубликуете (⚙ — доступ к GitHub)."));
  await initMap();
}

window.EDIT = { toggle() { if (editing) { store.ascwEditOn = ""; location.reload() } else start() } };
start();
