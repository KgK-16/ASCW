// Runs in the <head> of every page, before it is shown (layouts/partials/top.html puts it into the page, minified).
// Language: every page is built in English (/ASCW/…) and Russian (/ASCW/ru/…). A saved choice — or, on the first visit, the browser's
// language — opens the page in that language; search robots are not redirected. The 404 page is one file for every address: it takes the
// language of its address. The map editor (assets/edit.js) is unlocked once per browser with ?edit and loaded only in edit mode, on the map.
const doc = document, root = doc.documentElement, base = root.dataset.b, path = location.pathname;
const notFound = root.classList.contains("l2"), inRuPath = path.startsWith(base + "ru/");
const addressIn = lang => notFound // this page in a language
  ? lang == "ru" ? (inRuPath ? path : base + "ru/" + path.slice(base.length)) : (inRuPath ? base + path.slice(base.length + 3) : path)
  : doc.querySelector(`link[hreflang="${lang}"]`)?.dataset.u;
let local = {}, session = {};
try {
  local = localStorage;
  session = sessionStorage;
  if (/[?&]edit\b/.test(location.search)) local.ascwEdit = 1;
} catch {}

// the ← button: how many pages of this site lie behind this one in this tab (0: nothing to go back to). Kept in the history entry, so going
// back and forward restores it; ascwKeep carries it over when the same entry changes language.
const embedded = /[?&]embed\b/.test(location.search), fromSite = doc.referrer.startsWith(location.origin + base);
let depth = history.state?.depth ?? (fromSite ? (+session.ascwDepth || 0) + 1 : 0);
if (session.ascwKeep != null) { depth = +session.ascwKeep; try { delete session.ascwKeep } catch {} }
const keepDepth = () => { try { session.ascwKeep = depth } catch {} };
if (!embedded) history.replaceState({ ...history.state, depth }, "");

if (notFound) { // the 404 page: its texts (both languages in the file) and button tips in the address's language
  const lang = inRuPath ? "ru" : "en";
  root.lang = lang;
  doc.addEventListener("DOMContentLoaded", () => {
    doc.querySelectorAll("[data-ten]").forEach(e => {
      const tip = e.dataset[lang == "ru" ? "tru" : "ten"];
      e.title = tip;
      e.setAttribute("aria-label", tip);
    });
    if (lang == "ru") doc.querySelectorAll("nav a").forEach(a => a.setAttribute("href", base + "ru/" + a.getAttribute("href").slice(base.length))); // the menu in that language too
  });
}

const robot = navigator.webdriver || /bot|crawl|spider|slurp|yandex|google|bing/i.test(navigator.userAgent);
const wanted = (local.ascwLang || (robot ? root.lang : navigator.language) || "").slice(0, 2) == "ru" ? "ru" : "en";
if (wanted != root.lang && addressIn(wanted)) {
  root.style.visibility = "hidden";
  keepDepth();
  location.replace(addressIn(wanted) + location.search + location.hash);
}

if (embedded) { // a page shown inside the map's panel: no menu, links open in the whole window
  root.classList.add("emb");
  doc.head.append(Object.assign(doc.createElement("base"), { target: "_top" }));
}

doc.addEventListener("click", e => {
  if (e.target.closest("#bk")) return history.back();
  if (!e.target.closest("#lq")) return; // the language button: the other language opens at the same place of the page, in the same history entry
  const lang = root.lang == "ru" ? "en" : "ru", to = addressIn(lang);
  try { local.ascwLang = lang } catch {}
  doc.dispatchEvent(new Event("langgo")); // the map keeps its view
  try { session.ascwScroll = JSON.stringify([to, scrollY / Math.max(1, root.scrollHeight - innerHeight)]) } catch {}
  keepDepth();
  location.replace(to + location.search + location.hash);
});

for (const event of ["pageswap", "pagereveal"]) // a page change without its cross-fade (a hidden tab, say) is not an error
  addEventListener(event, e => e.viewTransition?.ready.catch(() => {}));

addEventListener("pageshow", () => { // also when the browser restores a page from its memory
  if (embedded) return;
  try { session.ascwDepth = depth } catch {}
  const back = doc.getElementById("bk");
  if (back) back.hidden = !depth || history.length < 2;
});

addEventListener("load", () => {
  try {
    const [to, part] = JSON.parse(session.ascwScroll || "[]");
    delete session.ascwScroll;
    if (to == location.pathname && part) scrollTo(0, part * (root.scrollHeight - innerHeight));
  } catch {}
});

doc.addEventListener("DOMContentLoaded", () => { // the ✎ button, once edit mode is unlocked in this browser
  const button = doc.getElementById("ed"), loadEditor = () => doc.head.append(Object.assign(doc.createElement("script"), { src: button.dataset.js }));
  if (!button || !local.ascwEdit) return;
  button.hidden = false;
  button.onclick = () => { if (window.EDIT) EDIT.toggle(); else { local.ascwEditOn = 1; loadEditor() } };
  if (local.ascwEditOn) loadEditor();
});
