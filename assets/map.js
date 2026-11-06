// ASCW world map: a flat map, a timeline and a 3D globe.
//
// Data set by layouts/map/list.html before this script runs:
//   U   — the site's base address (pictures), UL — the pages in this language (U or U + "ru/")
//   V   — map versions: [{y: year, b: has borders, r: [countries]}];
//         a country: {id, c: hex colour, name, ru, d: SVG outline, x, y: where its name stands}
//   MK  — markers, EV — timeline events [year, EN, RU], PL — places that have a page,
//   COU — country settings made on the site, by hex colour: en / ru name, pg page,
//         lx / ly name shift (map px), lz name size (pt), lk letter spacing (in letter heights), lo opacity
// window.MAP connects the map editor (assets/edit.js) to the map.
//
// Flat map layers, bottom to top:
//   geography (static/map/g*.webp) < country colours < borders of the version (static/map/<year>/b*.webp) — these three are drawn by WebGL
//   < country shapes for hover and clicks (SVG) < selection: the rest dimmed, an outline < graticule and country names (SVG)
//   < markers and graticule labels (outside the zoomed layer, placed every frame so they stay crisp).
// Without WebGL the <img> / <canvas> layers inside #c show the pictures instead.

// ---------- page elements ----------
const doc = document, root = doc.documentElement, byId = id => doc.getElementById(id);
const mapEl = byId("m"), layersEl = byId("c"), baseImg = byId("im"), coloursCanvas = byId("ov"), shapesSvg = byId("sv"),
  bordersImg = byId("bi"), selectionSvg = byId("hl"), namesSvg = byId("sl"), markersSvg = byId("mw"), gridLabelsEl = byId("gx"),
  globeEl = byId("g"), panelEl = byId("p"), panelTitle = byId("pt"), panelText = byId("px"), panelFrame = byId("pf"), panelEmpty = byId("pe"),
  timelineEl = byId("tl"), timelineClose = byId("xt"), timelineYear = byId("ty"), timelineScroll = byId("tw"), timelineTrack = byId("tz"),
  yearSlider = byId("tr"), globeButton = byId("zg"), yearButton = byId("zt"), coloursButton = byId("zc"), panelClose = byId("pc"),
  loader = byId("ld"), scaleBar = byId("sb");

// the world repeats east and west: a second copy of the map layers, shown only where the seam is in view
const layersCopy = Object.assign(layersEl.cloneNode(false), { id: "", hidden: true });
layersEl.after(layersCopy);
layersCopy.setAttribute("aria-hidden", "true");

// ---------- constants ----------
const MAP_W = 4096, MAP_H = 2048;          // map coordinates: px of the 4096 px picture level
const YEAR_FROM = 320, YEAR_TO = 420;      // years shown on the timeline
const EARTH_KM = 6371;                     // the planet is Earth-sized: radius in km
const DEFAULT_NAME_PT = 25;                // country name size when none is set on the site (pt of the 4096 px map; 1 pt = 4/3 px)
const CAPITALS_FROM = 50, MARKERS_FROM = 80, NAMES_UNTIL = 80; // zoom %: capitals and other markers appear, country names fade out
const FLING_FRICTION = 8;                  // how fast a flicked flat map slows down
const MARKER_SHAPES = [                    // by marker kind (k)
  "M-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0z",                                                        // 0 circle
  "M0-10L10 0 0 10-10 0zM0-7L7 0 0 7-7 0zM-3.6 0a3.6 3.6 0 1 0 7.2 0a3.6 3.6 0 1 0-7.2 0z",     // 1 circle in a diamond (capital)
  "M0-6.2L5.8 4H-5.8z",                                                                           // 2 triangle
];
const HEMISPHERES = { en: ["N", "S", "E", "W"], ru: [" с. ш.", " ю. ш.", " в. д.", " з. д."] };

// ---------- state ----------
let panX = 0, panY = 0, scale = 1;                          // flat view: screen px = pan + map px × scale
let viewW = 0, viewH = 0, buttonsW = 0, globeW = 0, globeH = 0, mapRect, globeRect; // sizes, read only when they change
let year = 420, version, regions = [], regionById = {};
let selCountry = null, selMarker = null, globeOn = false, coloursOn = true;
let lastPointer = [0, 0];                                   // where the page was last pressed (the editor opens its window there)
try { coloursOn = localStorage.ascwColors != "0" } catch {}
const hitCtx = doc.createElement("canvas").getContext("2d"), coloursCtx = coloursCanvas.getContext("2d");

// ---------- small helpers ----------
const isRu = () => root.lang == "ru",
  inLang = (en, ru) => isRu() ? ru : en,
  countryName = r => isRu() ? r.ru : r.name,
  markerName = q => (isRu() ? q.r || q.n : q.n || q.r) || "",   // a missing language falls back to the other one
  degrees = (v, isLat) => Math.abs(v) + "°" + (v ? HEMISPHERES[isRu() ? "ru" : "en"][(isLat ? 0 : 2) + (v < 0)] : ""),
  esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;"),
  regionPath = r => r.path2d || (r.path2d = new Path2D(r.d)),
  wrapX = v => (v % MAP_W + MAP_W) % MAP_W,                   // a map x wrapped into the world
  versionFor = y => V.reduce((a, v) => v.y <= y ? v : a, V[0]), // the latest map version not after the year
  bordersSrc = level => U + `map/${version.y}/b${level}.webp`,
  timelineOpen = () => timelineEl.classList.contains("o"),
  markerShown = q => !(q.y0 != null && year < q.y0) && !(q.y1 != null && year > q.y1);

function pinch(pointers) { // two pointers: their distance and middle; null for one
  const [a, b] = Object.values(pointers);
  return b && { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function countryLabel(r) { // a country name as set on the site: position, size, letter spacing, opacity
  if (r.x == null) return null;
  const set = COU[r.c] || {}, size = (set.lz || DEFAULT_NAME_PT) / .75;
  return {
    text: countryName(r).toUpperCase(), size, spacing: (set.lk || 0) * size, opacity: set.lo,
    x: r.x + (set.lx || 0), y: r.y + (set.ly || 0),
  };
}

// zoom in %: 1 = the whole world, 100 = closest, on a log scale
const zoomPercent = (zoom, maxZoom) => Math.min(100, Math.max(1, 1 + 99 * Math.log(Math.max(zoom, 1)) / Math.log(maxZoom))),
  flatZoomPercent = () => zoomPercent(scale / fitScale(), maxScale() / fitScale()),
  globeZoomPercent = () => zoomPercent(Math.PI / (2 * viewConst * (camDistG - 1)), Math.PI / (2 * viewConst * (GLOBE_CLOSEST - 1))),
  markerHidden = (q, zoom = globeOn ? globeZoomPercent() : flatZoomPercent()) => zoom < (q.k == 1 ? CAPITALS_FROM : MARKERS_FROM);

// ---------- flat map: view ----------
const fitScale = () => Math.max(viewH / MAP_H, viewW / MAP_W), // the world fills the height and at least the width: each place at most once on screen
  maxScale = () => Math.max(3.75, fitScale());                // closest zoom: 3.75 screen px per map px
let applyFrame = 0, movingTimer, appliedScale, copyDirty = true;

function setView() { // keep the view in its limits; the screen follows in the next frame
  if (!isFinite(scale + panX + panY)) { scale = fitScale(); panX = panY = 0 }  // never keep a broken view
  scale = Math.min(Math.max(scale, fitScale()), maxScale());
  const w = MAP_W * scale, h = MAP_H * scale;
  panX -= w * Math.ceil(panX / w);                       // no east / west edge: panX stays in (-w, 0], the copy covers the rest
  panY = h < viewH ? (viewH - h) / 2 : Math.min(0, Math.max(viewH - h, panY));
  if (!applyFrame) applyFrame = requestAnimationFrame(applyView); // at most one screen update per frame
}

function applyView() {
  applyFrame = 0;
  drawFlatGL();
  placeMarkers();
  layersEl.style.transform = `translate(${panX}px,${panY}px) scale(${scale})`;
  const copyShown = panX + MAP_W * scale < viewW;
  if (copyShown) {
    if (copyDirty) refreshCopy();
    layersCopy.className = layersEl.className;
    layersCopy.style.transform = `translate(${panX + MAP_W * scale}px,${panY}px) scale(${scale})`;
  }
  if (layersCopy.hidden == copyShown) layersCopy.hidden = !copyShown;
  layersEl.classList.add("mv");                          // while moving: a GPU layer only, no restyle / repaint
  clearTimeout(movingTimer);
  movingTimer = setTimeout(settle, 250);
}

function settle() { // after a movement: zoom-dependent line widths (--k), crisp re-raster
  layersEl.classList.remove("mv");
  layersCopy.classList.remove("mv");
  if (scale != appliedScale) {
    layersEl.style.setProperty("--k", appliedScale = scale);
    layersCopy.style.setProperty("--k", scale);
  }
}

function refreshCopy() { // the copy is redrawn only after the layers changed, and only when it is in view
  copyDirty = false;
  layersCopy.innerHTML = layersEl.innerHTML;
  layersCopy.querySelectorAll("[id]").forEach(e => e.removeAttribute("id"));
  if (!flatGL) layersCopy.querySelector("canvas").getContext("2d").drawImage(coloursCanvas, 0, 0);
}

function zoomAt(f, px, py) { // instant zoom by a factor around a screen point (pinch)
  const s = Math.min(Math.max(scale * f, fitScale()), maxScale());
  panX = px - (px - panX) * s / scale;
  panY = py - (py - panY) * s / scale;
  scale = s;
  setView();
}

// ---------- flat map: smooth motion ----------
// Zoom is kept as a camera distance, as on the globe, and eased towards a target every frame: a wheel notch or a double click
// zooms smoothly and the point under the cursor stays under it. A double click also flies its point to the middle; a flick glides on.
const viewConstFor = (w, h) => .364 * Math.max(1, h / w),     // the globe's view constant for a window
  flatViewConst = () => viewConstFor(viewW, viewH),
  scaleOfDist = d => Math.PI / (2 * flatViewConst() * (d - 1)) * fitScale(), // camera distance <-> flat scale
  distOfScale = s => 1 + Math.PI * fitScale() / (2 * flatViewConst() * s),
  clampDist = d => Math.min(distOfScale(fitScale()), Math.max(distOfScale(maxScale()), d)),
  wheelPx = e => e.deltaY * (e.deltaMode == 1 ? 33 : e.deltaMode == 2 ? viewH : 1); // wheel delta in px whatever the browser reports
let camDist = 0, camTarget = 0, zoomAnchor = null, flyTo = null, fling = null, motionFrame = 0, lastMotionT = 0;

const startZoom = () => { if (Math.abs(camTarget - camDist) < 1e-4) camDist = camTarget = distOfScale(scale) }, // from the current scale unless a zoom is easing
  startMotion = () => { if (!motionFrame) { lastMotionT = 0; motionFrame = requestAnimationFrame(motionStep) } },
  stopMotion = () => { cancelAnimationFrame(motionFrame); motionFrame = lastMotionT = 0; fling = zoomAnchor = flyTo = null; camTarget = camDist };

function motionStep(t) { // one frame of flat-map motion
  const dt = Math.min(lastMotionT && t > lastMotionT ? (t - lastMotionT) / 1e3 : 1 / 60, .05);
  lastMotionT = t;
  motionFrame = 0;
  let moving = false;
  if (Math.abs(camTarget - camDist) > 1e-3) { // eased zoom around an anchor that keeps its place on screen
    camDist += (camTarget - camDist) * Math.min(1, dt * 8);
    const a = flyTo ? { mx: flyTo.mx, my: flyTo.my, sx: panX + flyTo.mx * scale, sy: panY + flyTo.my * scale }
      : zoomAnchor || { mx: (viewW / 2 - panX) / scale, my: (viewH / 2 - panY) / scale, sx: viewW / 2, sy: viewH / 2 };
    scale = scaleOfDist(camDist);
    panX = a.sx - a.mx * scale;
    panY = a.sy - a.my * scale;
    setView();
    moving = true;
  } else {
    camDist = camTarget;
    zoomAnchor = null;
  }
  if (flyTo) { // a map point flies to the middle of the screen; at the map's edge it stops where it can
    const f = Math.min(1, dt * 5), w = MAP_W * scale, ex0 = viewW / 2 - panX - flyTo.mx * scale, ex = ex0 - w * Math.round(ex0 / w),
      ey = viewH / 2 - panY - flyTo.my * scale, x0 = panX, y0 = panY;
    panX += ex * f;
    panY += ey * f;
    setView();
    if (Math.hypot(ex, ey) < .5 || (!moving && Math.abs(panX - x0) + Math.abs(panY - y0) < .01)) flyTo = null;
    else moving = true;
  }
  if (fling) { // a flicked map goes on at the speed it was let go, then slows down
    panX += fling[0] * dt;
    panY += fling[1] * dt;
    setView();
    const d = Math.exp(-dt * FLING_FRICTION);
    fling = [fling[0] * d, fling[1] * d];
    if (Math.hypot(...fling) < 12) fling = null;
    else moving = true;
  }
  if (moving) motionFrame = requestAnimationFrame(motionStep);
  else lastMotionT = 0;
}

function zoomBy(f, cx, cy) { // zoom by a camera distance factor towards a screen point
  startZoom();
  camTarget = clampDist(camTarget * f);
  fling = flyTo = null;
  zoomAnchor = { mx: (cx - panX) / scale, my: (cy - panY) / scale, sx: cx, sy: cy };
  startMotion();
}

// ---------- flat map: WebGL pictures ----------
// Relief, country colours and borders are mipmapped textures drawn by one full-screen triangle: panning and zooming only move
// a camera, nothing is decoded or re-rasterised; texture REPEAT makes the world endless east-west.
let flatGL = null;

const FLAT_VERTEX = "attribute vec2 g; void main() { gl_Position = vec4(g, 0., 1.); }";
const FLAT_FRAGMENT = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif
  uniform sampler2D T;  // relief
  uniform sampler2D B;  // borders (alpha)
  uniform sampler2D O;  // country colours
  uniform vec4 V;       // pan x, pan y, scale, device pixel ratio
  uniform vec2 S;       // canvas size
  uniform float co;     // colours on / off
  void main() {
    vec2 p = vec2(gl_FragCoord.x, S.y - gl_FragCoord.y) / V.w;
    vec2 u = vec2((p.x - V.x) / (V.z * 4096.), (p.y - V.y) / (V.z * 2048.));
    vec4 o = texture2D(O, u) * co;
    gl_FragColor = vec4((texture2D(T, u).rgb * (1. - o.a) + o.rgb) * (1. - texture2D(B, u).a), 1.);
  }`;

const coarseSmallDevice = () => matchMedia("(pointer:coarse)").matches && (navigator.deviceMemory || 4) < 6;
const bitmap = src => fetch(src).then(r => r.blob()).then(b => createImageBitmap(b)); // decoded off the main thread

function initFlatGL() {
  const canvas = byId("fcv"), gl = canvas && canvas.getContext("webgl", { alpha: false, antialias: false });
  if (!gl) return;
  const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s };
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, FLAT_VERTEX));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FLAT_FRAGMENT));
  gl.bindAttribLocation(prog, 0, "g");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, 0, 0, 0);
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE), aniso = gl.getExtension("EXT_texture_filter_anisotropic");
  const newTexture = (unit, format, pixel) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); // the endless east-west world
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    gl.texImage2D(gl.TEXTURE_2D, 0, format, 1, 1, 0, format, gl.UNSIGNED_BYTE, new Uint8Array(pixel));
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.uniform1i(gl.getUniformLocation(prog, "TBO"[unit]), unit);
    return t;
  };
  flatGL = {
    gl, canvas,
    view: gl.getUniformLocation(prog, "V"), size: gl.getUniformLocation(prog, "S"), coloursOn: gl.getUniformLocation(prog, "co"),
    relief: newTexture(0, gl.RGB, [21, 33, 57, 0]), borders: newTexture(1, gl.ALPHA, [0, 0, 0, 0]), colours: newTexture(2, gl.RGBA, [0, 0, 0, 0]),
    level: maxTex >= 8192 && !coarseSmallDevice() ? 3 : 2,  // the 8192 px level where the device can hold it
  };
  canvas.addEventListener("webglcontextlost", () => { // GPU reset: back to the picture layers
    flatGL = null;
    mapEl.classList.remove("fg");
    baseImg.src = U + "map/g2.webp";
    showBorders();
    drawColours();
    setView();
  });
  mapEl.classList.add("fg");
  bitmap(U + "map/g1.webp")                                   // a quick level first, then the sharp one
    .then(i => { setFlatRelief(i); return flatGL && bitmap(U + `map/g${flatGL.level}.webp`) })
    .then(i => i && whenStill(() => setFlatRelief(i)), () => {});
}

function whenStill(fn) { // big texture uploads wait until the map is still, so they never stall a movement
  (function wait() { motionFrame || applyFrame || Object.keys(flatPointers).length ? setTimeout(wait, 150) : fn() })();
}

function setFlatRelief(img) {
  if (!flatGL) return img.close?.();
  const gl = flatGL.gl;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, flatGL.relief);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
  gl.generateMipmap(gl.TEXTURE_2D);
  img.close?.();
  drawFlatGL();
}

function loadFlatBorders() { // borders of the version, the site's own levels as mipmaps (thin lines stay visible zoomed out)
  if (!flatGL) return;
  const v = version;
  if (!v.b) { setMipmaps(flatGL.gl, flatGL.borders, 1, []); return drawFlatGL() }
  Promise.all(Array.from({ length: flatGL.level + 1 }, (_, j) => bitmap(bordersSrc(flatGL.level - j))))
    .then(levels => whenStill(() => {
      if (flatGL && v == version) { setMipmaps(flatGL.gl, flatGL.borders, 1, levels); drawFlatGL() }
      levels.forEach(i => i.close?.());
    }), () => {});
}

function setFlatColours() { // country colours: uploaded only when they change
  if (!flatGL) return;
  const gl = flatGL.gl;
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, flatGL.colours);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, coloursCanvas);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.generateMipmap(gl.TEXTURE_2D);
  drawFlatGL();
}

function drawFlatGL() { // one frame
  if (!flatGL || globeOn) return;
  const gl = flatGL.gl, ratio = Math.min(devicePixelRatio || 1, 2), w = Math.round(viewW * ratio), h = Math.round(viewH * ratio);
  if (flatGL.canvas.width != w || flatGL.canvas.height != h) { flatGL.canvas.width = w; flatGL.canvas.height = h }
  gl.viewport(0, 0, w, h);
  gl.uniform4f(flatGL.view, panX, panY, scale, w / viewW);
  gl.uniform2f(flatGL.size, w, h);
  gl.uniform1f(flatGL.coloursOn, coloursOn ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function setMipmaps(gl, texture, unit, levels) { // an alpha texture whose mipmaps are the given levels; smaller ones are drawn from the last
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  const A = gl.ALPHA, T2 = gl.TEXTURE_2D, UB = gl.UNSIGNED_BYTE;
  if (!levels.length) {
    gl.texImage2D(T2, 0, A, 1, 1, 0, A, UB, new Uint8Array(1));
    gl.generateMipmap(T2);
  } else {
    let level = 0, last;
    for (const img of levels) gl.texImage2D(T2, level++, A, A, UB, last = img);
    let w = last.width, h = last.height;
    while (w > 1 || h > 1) {
      w = Math.max(1, w >> 1);
      h = Math.max(1, h >> 1);
      const c = doc.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d").drawImage(last, 0, 0, w, h);
      gl.texImage2D(T2, level++, A, A, UB, last = c);
    }
  }
  gl.activeTexture(gl.TEXTURE0);
}

function showBorders() { // borders of the version: WebGL draws them; the picture is only the fallback
  if (flatGL) return loadFlatBorders();
  bordersImg.hidden = !version.b;
  if (version.b) bordersImg.src = bordersSrc(2);
  copyDirty = true;
}

// ---------- flat map: SVG overlays, colours, selection ----------
function buildOverlays() { // country shapes, graticule, country names
  let shapes = "", grid = "", gridLabels = "", names = "";
  for (let lon = -180; lon <= 180; lon += 15) {
    const X = (lon + 180) / 360 * MAP_W;
    grid += `<path${lon ? "" : ' class="e"'} d="M${X} 0V${MAP_H}"/>`;
    if (lon % 30 == 0 && lon < 180) gridLabels += `<span data-o="${lon}">${degrees(lon)}</span>`;
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const Y = (90 - lat) / 180 * MAP_H;
    grid += `<path${lat ? "" : ' class="e"'} d="M0 ${Y}H${MAP_W}"/>`;
    if (lat % 30 == 0) gridLabels += `<span data-a="${lat}">${degrees(lat, 1)}</span>`;
  }
  regions.forEach(r => {
    shapes += `<path style="--c:${r.c}" fill-rule="evenodd" d="${r.d}"/>`;
    const a = countryLabel(r);
    if (a) names += `<text data-i="${r.id}"${a.opacity != null ? ` opacity="${a.opacity}"` : ""} x="${(a.x + a.spacing / 2).toFixed(1)}" y="${a.y}"` +
      ` font-size="${a.size.toFixed(1)}" letter-spacing="${a.spacing.toFixed(2)}">${esc(a.text)}</text>`; // centred; the last letter's spacing is evened out
  });
  shapesSvg.innerHTML = shapes;
  namesSvg.innerHTML = `<g class="gr">${grid}</g><g class="lb">${names}</g>`;
  copyDirty = true;
  gridLabelsEl.innerHTML = gridLabels;
  gridLabelItems = [...gridLabelsEl.children].map(e => ({ e, lon: e.dataset.o != null ? +e.dataset.o : null, lat: +e.dataset.a }));
  placeMarkers();
  showSelection();
}

let selectionKey;
function showSelection() { // the selected country keeps its relief colours, the rest of the map is dimmed, an outline on top
  const r = selCountry && regionById[selCountry], key = coloursOn + "|" + selCountry + "|" + version?.y;
  if (key == selectionKey) return;                       // nothing changed: skip the costly redraws (also of the globe texture)
  selectionKey = key;
  copyDirty = true;
  if (viewW) setView();
  selectionSvg.innerHTML = r ? `<path class="dm" fill-rule="evenodd" d="M0 0H${MAP_W}V${MAP_H}H0z${r.d}"/><path class="gw" d="${r.d}"/><path class="ol" d="${r.d}"/>` : "";
  drawColours();
}

function drawColours() { // country colours as one raster layer: a light tint + an inner colour band; the selected country keeps pure relief
  copyDirty = true;
  if (coloursOn) {
    const o = coloursCtx;
    o.clearRect(0, 0, MAP_W, MAP_H);
    o.lineJoin = "round";
    regions.forEach(r => {
      const p = regionPath(r);
      o.globalAlpha = r == regionById[selCountry] ? 0 : .28;
      o.fillStyle = r.c;
      o.fill(p, "evenodd");
      o.save();
      o.clip(p, "evenodd");
      o.globalAlpha = .85;
      o.strokeStyle = r.c;
      o.lineWidth = 14;
      o.stroke(p);
      o.restore();
    });
    o.globalAlpha = 1;
    setFlatColours();
  }
  if (globeOn) globeOverlayChanged();
}

function setColours(on) {
  coloursOn = on;
  drawFlatGL();
  layersEl.classList.toggle("on", on);
  coloursButton.classList.toggle("on", on);
  try { localStorage.ascwColors = on ? 1 : 0 } catch {}
  showSelection();
}
coloursButton.onclick = () => setColours(!coloursOn);

// ---------- flat map: markers, graticule labels, zoom %, scale bar ----------
let gridLabelItems = [], scaleKey;

function drawMarkers() {
  markersSvg.innerHTML = MK.map((q, i) =>
    `<g data-m="${i}"${markerShown(q) ? "" : " hidden"} class="${markerHidden(q) ? "z" : ""}${i === selMarker ? " s" : ""}">` +
    `<path fill-rule="evenodd" d="${MARKER_SHAPES[q.k | 0] || MARKER_SHAPES[0]}"/>` +
    `<text x="${q.k == 1 ? 15 : 12}" y="1"${q.f == "cap" ? ' class="c"' : ""}>${esc(markerName(q))}</text></g>`).join("");
  placeMarkers();
  if (globeOn) globeLabels.forEach(e => e.marker != null && e.el.classList.toggle("s", e.marker === selMarker));
}

function placeMarkers() { // markers, graticule labels, country names fading, zoom % and scale bar: every frame of the flat map
  const zoom = flatZoomPercent();
  if (mapEl.classList.contains("nl") != (zoom >= NAMES_UNTIL)) mapEl.classList.toggle("nl", zoom >= NAMES_UNTIL);
  const w = MAP_W * scale;
  [...markersSvg.children].forEach((e, i) => {
    const q = MK[i];
    if (!q) return;
    const X = panX + (q.o + 180) / 360 * w;
    e.style.transform = `translate(${X - w * Math.floor((X + 40) / w)}px,${panY + (90 - q.a) / 180 * MAP_H * scale}px)`;
    e.classList.toggle("z", markerHidden(q, zoom));
  });
  if (!globeOn) {
    const centreLat = Math.PI / 2 - (viewH / 2 - panY) / scale / MAP_H * Math.PI;
    updateZoomAndScale(scale / fitScale(), maxScale() / fitScale(), 2 * Math.PI * EARTH_KM * Math.max(.02, Math.cos(Math.min(1.5, Math.abs(centreLat)))) / w);
  }
  // graticule labels: pinned to the top / left edge of the view, hidden under the button column
  const top = Math.max(panY, 0) + 6, left = Math.max(panX, 0) + 6, right = viewW - buttonsW - 82, bottom = viewH - 30;
  for (const q of gridLabelItems) {
    let X, Y, hide;
    if (q.lon != null) {
      X = panX + (q.lon + 180) / 360 * w + 4;
      X -= w * Math.floor(X / w);
      Y = top;
      hide = X < left + 40 || X > right;
    } else {
      X = left;
      Y = panY + (90 - q.lat) / 180 * MAP_H * scale - 18;
      hide = Y < top + 18 || Y > bottom;
    }
    q.e.style.transform = `translate(${X}px,${Y}px)`;
    if (q.hidden !== hide) q.e.hidden = q.hidden = hide;
  }
}

function updateZoomAndScale(zoom, maxZoom, kmPerPx) { // zoom % and the scale bar: the longest round length (1, 2, 5 × 10ⁿ km) that fits in 100 px
  const percent = Math.round(zoomPercent(zoom, maxZoom)) + "%";
  if (scaleBar.children[0].textContent != percent) scaleBar.children[0].textContent = percent;
  const km100 = kmPerPx * 100, e = 10 ** Math.floor(Math.log10(km100)), len = [5, 2, 1].map(v => v * e).find(v => v <= km100) || e;
  const key = len + "|" + (len / kmPerPx).toFixed(0);
  if (key == scaleKey) return;
  scaleKey = key;
  scaleBar.children[1].textContent = len < 1 ? (len * 1e3).toLocaleString() + inLang(" m", " м") : len.toLocaleString(isRu() ? "ru-RU" : "en-US") + inLang(" km", " км");
  scaleBar.lastChild.style.width = (len / kmPerPx).toFixed(1) + "px";
}

// ---------- versions, selection, the place's page ----------
function applyNames() { // names edited on the site win over the generated ones
  regions.forEach(r => {
    r.n0 ??= r.name;
    r.r0 ??= r.ru;
    const o = COU[r.c] || {};
    r.name = o.en || r.n0;
    r.ru = o.ru || r.r0;
  });
}

function setVersion() { // switch to the map version of the selected year
  version = versionFor(year);
  regions = version.r;
  regionById = {};
  regions.forEach(r => regionById[r.id] = r);
  applyNames();
  if (selCountry && !regionById[selCountry]) { selCountry = null; panelEl.classList.remove("o") }
  else showPanel();
  showBorders();
  buildOverlays();
  if (globeOn) loadGlobeBorders();
}

function setYear() { // apply the selected year
  yearButton.textContent = timelineYear.textContent = year;
  timelineTrack.querySelectorAll(".f").forEach(f => f.classList.toggle("a", f.dataset.y <= year));
  if (versionFor(year) != version) setVersion();
  drawMarkers();
  if (globeOn) globeOverlayChanged();
}

const countryAt = (mx, my) => regions.find(r => hitCtx.isPointInPath(regionPath(r), mx, my, "evenodd"))?.id; // the country under a map point

function pickCountry(id) {
  id = id && regionById[id] ? +id : null;
  if (id != null) selMarker = null;
  selCountry = id;
  if (selCountry) showPanel();
  panelEl.classList.toggle("o", !!(selCountry || selMarker != null));
  showSelection();
  drawMarkers();
}

function pickMarker(i) {
  selMarker = i;
  selCountry = null;
  showSelection();
  showPanel();
  panelEl.classList.add("o");
  drawMarkers();
}

function showPanel() { // the place's own page in the middle of the map; a placeholder without one
  let page, placeholder = "", hook;
  if (selMarker != null && MK[selMarker]) {
    const q = MK[selMarker];
    panelTitle.textContent = markerName(q);
    page = q.pg;
    hook = () => MAP.onMarker?.(selMarker);
  } else if (selCountry) {
    const r = regionById[selCountry];
    panelTitle.textContent = countryName(r);
    page = (COU[r.c] || {}).pg;
    placeholder = `<p class="ph">${inLang("Placeholder text", "Текст-заглушка")}</p>`;
    hook = () => MAP.onPanel?.(r);
  } else return;
  const ok = page && PL.includes(page), src = ok && UL + "places/" + page + "/?embed";
  panelFrame.hidden = !ok;
  panelEmpty.hidden = !!ok;
  if (ok) { if (panelFrame.dataset.s != src) { panelFrame.dataset.s = src; panelFrame.src = src } }
  else panelText.innerHTML = placeholder;
  hook(); // the editor's hook: its form for this place
}

panelClose.onclick = () => { selMarker = null; pickCountry() };
panelEl.onclick = e => { if (e.target == panelEl) panelClose.click() }; // a click on the dimmed map beside the page goes back to the map
doc.addEventListener("pointerdown", e => { lastPointer = [e.clientX, e.clientY] }, true);
doc.addEventListener("keydown", e => {
  if (e.key != "Escape" || e.target.closest?.("input:not([type=range]),textarea,select")) return;
  if (timelineOpen()) closeTimeline(); else panelClose.click(); // closes the place's page
});

// ---------- flat map: pointer input ----------
const flatPointers = {};
let moved = 0, dragHistory = [], lastTap = 0;

mapEl.onpointerdown = e => {
  if (e.pointerType == "mouse" && e.button) return;
  mapEl.setPointerCapture(e.pointerId);
  flatPointers[e.pointerId] = { x: e.clientX, y: e.clientY };
  moved = 0;
  stopMotion();
  dragHistory = [];
  mapEl.classList.add("dr");
};

mapEl.onpointermove = e => {
  const q = flatPointers[e.pointerId];
  if (!q) return;
  const before = pinch(flatPointers), dx = e.clientX - q.x, dy = e.clientY - q.y;
  q.x = e.clientX;
  q.y = e.clientY;
  moved += Math.abs(dx) + Math.abs(dy);
  if (before) { // two fingers: pan with their middle, zoom with their distance
    const now = pinch(flatPointers);
    panX += now.x - before.x;
    panY += now.y - before.y;
    zoomAt(now.d / before.d, now.x - mapRect.left, now.y - mapRect.top);
    camDist = camTarget = distOfScale(scale);
  } else {
    const t = performance.now();
    dragHistory.push([t, e.clientX, e.clientY]);
    while (t - dragHistory[0][0] > 150) dragHistory.shift();
    panX += dx;
    panY += dy;
    setView();
  }
};

mapEl.onpointerup = mapEl.onpointercancel = e => {
  const single = Object.keys(flatPointers).length == 1;
  delete flatPointers[e.pointerId];
  if (!Object.keys(flatPointers).length) mapEl.classList.remove("dr");
  if (single && moved > 6 && dragHistory.length > 1) { // flick speed: averaged over the last ~0.1 s, so one uneven event does not throw the map
    const t = performance.now(), last = dragHistory.at(-1), first = dragHistory.find(h => t - h[0] <= 110) || dragHistory[0], d = (last[0] - first[0]) / 1e3;
    if (t - last[0] < 60 && d > .012) { fling = [(last[1] - first[1]) / d, (last[2] - first[2]) / d]; startMotion() }
  }
  if (!single || moved > 6 || e.type != "pointerup") return;
  const mx = (e.clientX - mapRect.left - panX) / scale, my = (e.clientY - mapRect.top - panY) / scale, now = Date.now();
  if (now - lastTap < 300) { // double click: fly there and zoom in
    lastTap = 0;
    startZoom();
    camTarget = clampDist(camTarget / 1.8);
    flyTo = { mx, my };
    zoomAnchor = fling = null;
    startMotion();
    return;
  }
  lastTap = now;
  const marker = doc.elementFromPoint(e.clientX, e.clientY)?.closest("#mw [data-m]");
  if (marker && !MAP.onTap) return pickMarker(+marker.dataset.m);
  if (!MAP.onTap?.(wrapX(mx), my, marker && +marker.dataset.m)) pickCountry(countryAt(wrapX(mx), my));
};

mapEl.onlostpointercapture = e => {
  delete flatPointers[e.pointerId];
  if (!Object.keys(flatPointers).length) mapEl.classList.remove("dr");
};

mapEl.onwheel = e => { e.preventDefault(); zoomBy(Math.exp(wheelPx(e) * .0015), e.clientX - mapRect.left, e.clientY - mapRect.top) };

// ---------- timeline ----------
let pxPerYear = 0;

function buildTimeline() {
  const w = Math.max(timelineScroll.clientWidth - 120, 1200), events = {}, ends = [[], []];
  let html = "", lastSide = 0;
  pxPerYear = w / (YEAR_TO - YEAR_FROM);
  timelineTrack.style.width = w + 120 + "px";
  yearSlider.style.left = "53px";
  yearSlider.style.width = w + 14 + "px";
  EV.forEach(v => { if (v[0] >= YEAR_FROM && v[0] <= YEAR_TO) (events[v[0]] = events[v[0]] || []).push(v[isRu() ? 2 : 1]) });
  for (let n = YEAR_FROM; n <= YEAR_TO; n += 5) {
    const X = 60 + (n - YEAR_FROM) * pxPerYear;
    html += `<i class="t${n % 10 ? "" : " l"}" style="left:${X}px"></i>` + (n % 10 ? "" : `<em class="n" style="left:${X}px">${n}</em>`);
  }
  Object.keys(events).forEach(n => { // flags alternate up / down and stack so texts never overlap
    const X = (n - YEAR_FROM) * pxPerYear;
    let side = 0, row = 99;
    [lastSide, 1 - lastSide].forEach(d => { let l = 0; while (ends[d][l] > X) l++; if (l < row) { row = l; side = d } });
    ends[side][row] = X + 210;
    lastSide = 1 - side;
    html += `<div class="f ${side ? "d" : "u"}" data-y="${n}" style="left:${60 + X}px;height:${96 + row * 92}px"><b>${n}</b><span>${esc(events[n].join("; "))}</span></div>`;
  });
  timelineTrack.querySelectorAll("i,em,.f").forEach(e => e.remove());
  yearSlider.insertAdjacentHTML("beforebegin", html);
  setYear();
}

const closeTimeline = () => { timelineEl.classList.remove("o"); yearButton.focus() }; // keyboard focus goes into the timeline and back
yearSlider.min = YEAR_FROM;
yearSlider.max = YEAR_TO;
yearSlider.value = year;
yearSlider.oninput = () => { year = +yearSlider.value; setYear() };
timelineTrack.onclick = e => { const f = e.target.closest(".f"); if (f) { year = yearSlider.value = +f.dataset.y; setYear() } };
yearButton.onclick = () => {
  timelineEl.classList.add("o");
  buildTimeline();
  timelineScroll.scrollLeft = 60 + (year - YEAR_FROM) * pxPerYear - timelineScroll.clientWidth / 2;
  yearSlider.focus({ preventScroll: true });
};
timelineClose.onclick = closeTimeline;
addEventListener("resize", () => { if (timelineOpen()) buildTimeline() });

// ---------- start ----------
if (matchMedia("(hover:none)").matches) { // touch screens: the button labels show for a few seconds
  const buttons = doc.querySelector(".z");
  buttons.classList.add("hint");
  setTimeout(() => buttons.classList.remove("hint"), 3500);
  buttons.addEventListener("pointerdown", () => buttons.classList.remove("hint"), { once: true });
}

doc.addEventListener("langgo", () => { // the page is about to open in the other language: keep the view for it
  const view = { mx: wrapX((viewW / 2 - panX) / scale), my: (viewH / 2 - panY) / scale, k: scale / fitScale(), year, selCountry, selMarker };
  if (globeOn) view.globe = { yaw: yaw + spin, pitch, dist: camDistG };
  try { sessionStorage.ascwMap = JSON.stringify(view) } catch {}
});

const MAP = window.MAP = { // for the map editor
  redraw() { applyNames(); buildOverlays(); drawMarkers(); showPanel(); if (timelineOpen()) buildTimeline(); if (globeOn) globeOverlayChanged() },
  markers() { drawMarkers(); if (globeOn) globeOverlayChanged() },
  timeline() { if (timelineOpen()) buildTimeline() },
  focus(lon, lat) { // show a place (instantly on the globe, flying on the flat map)
    if (globeOn) { yaw = -lon * Math.PI / 180 - spin; pitch = clampPitch(lat * Math.PI / 180); camTargetG = clampDistG(Math.min(camTargetG, 2.2)); return requestFrame() }
    startZoom();
    camTarget = clampDist(Math.min(camTarget, distOfScale(fitScale() * 5)));
    flyTo = { mx: (lon + 180) / 360 * MAP_W, my: (90 - lat) / 180 * MAP_H };
    zoomAnchor = fling = null;
    startMotion();
  },
  toMap(e) { return { mx: wrapX((e.clientX - mapRect.left - panX) / scale), my: (e.clientY - mapRect.top - panY) / scale } },
  sel: () => selCountry && regionById[selCountry],
  yr: () => year,
  lp: () => lastPointer,
  pick: pickCountry, pickM: pickMarker, panel: showPanel, W: MAP_W, H: MAP_H,
};

function readSizes() {
  viewW = mapEl.clientWidth;
  viewH = mapEl.clientHeight;
  buttonsW = coloursButton.parentNode.offsetWidth;
  globeW = globeEl.clientWidth || viewW;
  globeH = globeEl.clientHeight || viewH;
  mapRect = mapEl.getBoundingClientRect();
  globeRect = globeOn ? globeEl.getBoundingClientRect() : mapRect;
}
addEventListener("scroll", readSizes, { passive: true }); // positions on screen are cached too
new ResizeObserver(() => { readSizes(); setView(); if (globeOn) requestFrame() }).observe(mapEl);

readSizes();
initFlatGL();
if (!flatGL) baseImg.src = U + "map/g2.webp"; // without WebGL: one picture level
setYear();
setColours(coloursOn);
scale = fitScale();
panX = (viewW - MAP_W * scale) / 2;
setView();
settle();
drawMarkers();
let pendingGlobeView = null;
try { // the same view after switching the language
  const v = JSON.parse(sessionStorage.ascwMap || "null");
  delete sessionStorage.ascwMap;
  if (v) {
    if (v.year != year) { year = yearSlider.value = v.year; setYear() }
    scale = Math.min(Math.max(v.k * fitScale(), fitScale()), maxScale());
    panX = viewW / 2 - v.mx * scale;
    panY = viewH / 2 - v.my * scale;
    camDist = camTarget = distOfScale(scale);
    setView();
    settle();
    drawMarkers();
    if (v.selMarker != null && MK[v.selMarker]) pickMarker(v.selMarker);
    else if (v.selCountry) pickCountry(v.selCountry);
    if (v.globe) { pendingGlobeView = v.globe; setTimeout(() => globeButton.click()) }
  }
} catch {}

// ---------- globe ----------
// The sun stays at a fixed direction (south-west), the planet spins slowly around its axis (spin), the camera orbits it (yaw, pitch);
// dragging moves the camera and glides on when let go, the wheel or two fingers zoom towards the pointer.
const GLOBE_CLOSEST = 1.32, GLOBE_FARTHEST = 4.5;          // camera distance in planet radii
const SPIN = 2 * Math.PI / 573;                           // one turn in ~9.5 minutes
const SUN = (v => { const l = Math.hypot(...v); return v.map(a => a / l) })([.62, .32, .72]);
const clampDistG = v => Math.min(GLOBE_FARTHEST, Math.max(GLOBE_CLOSEST, v)),
  clampPitch = v => Math.min(1.4, Math.max(-1.4, v)),
  rotY = (v, t) => { const c = Math.cos(t), s = Math.sin(t); return [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]] },
  rotX = (v, t) => { const c = Math.cos(t), s = Math.sin(t); return [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]] };

let gl, globeCanvas, edgesCanvas, labelsEl, overlayCanvas, overlayCtx, mapTex, bordersTex, overlayTex, textureLevel = 2;
let skyProg, groundProg, cloudProg, triangleBuf, sphereBuf, sphereIdx;
let camDistG = 3, camTargetG = 3, yaw = 0, pitch = .15, spin = 0, viewConst, aspect, dragVel = [0, 0], lastDragT = 0, dragMoved = 0;
let zoomAnchorG = null, overlayDirty = false, frame = 0, lastFrameT = 0, onFirstFrame = null, loading = false;
let globeLabels = [], labelOrder = [], labelsSig = "";
const globePointers = {};

const requestFrame = () => { if (!frame && globeOn) { lastFrameT = 0; frame = requestAnimationFrame(tick) } }, // the render loop runs while the globe is shown
  globeOverlayChanged = () => { overlayDirty = true; requestFrame() };                // overlay rebuilds are coalesced to one per frame
doc.addEventListener("visibilitychange", requestFrame);

function tick(t) {
  frame = 0;
  if (!globeOn || doc.hidden) return;
  const busy = overlayDirty || zoomAnchorG || dragVel[0] || dragVel[1] || Math.abs(camTargetG - camDistG) > 1e-4 || Object.keys(globePointers).length;
  if (lastFrameT && t - lastFrameT < 31 && !busy) { frame = requestAnimationFrame(tick); return } // idle: ~30 frames/s is plenty for the slow spin
  const dt = lastFrameT ? Math.min((t - lastFrameT) / 1e3, .1) : 0;
  lastFrameT = t;
  spin += dt * SPIN;
  moveCamera(dt);
  drawGlobe();
  if (onFirstFrame) { gl.finish(); const f = onFirstFrame; onFirstFrame = null; requestAnimationFrame(f) }
  frame = requestAnimationFrame(tick);
}

function moveCamera(dt) { // eased zoom towards the pointer, drag glide
  camDistG += (camTargetG - camDistG) * Math.min(1, dt * 8);
  if (zoomAnchorG) { // the planet point under the pointer stays under it
    const Y = yaw + spin, c = Math.cos(Y), s = Math.sin(Y), e = Math.cos(pitch), f = Math.sin(pitch), [px, py, pz] = zoomAnchorG.p,
      x1 = c * px + s * pz, z1 = -s * px + c * pz, y2 = e * py - f * z1, depth = camDistG - (f * py + e * z1), k = 2 * (camDistG - 1) * viewConst / globeH;
    yaw += (zoomAnchorG.x - (x1 / (viewConst * aspect) / depth + 1) * globeW / 2) * k;
    pitch = clampPitch(pitch + (zoomAnchorG.y - (1 - y2 / viewConst / depth) * globeH / 2) * k);
    if (Math.abs(camTargetG - camDistG) < 1e-3) zoomAnchorG = null;
  }
  if (!Object.keys(globePointers).length && (dragVel[0] || dragVel[1])) {
    yaw += dragVel[0] * dt;
    pitch = clampPitch(pitch + dragVel[1] * dt);
    const k = Math.exp(-dt * 3.5);
    dragVel = dragVel.map(v => Math.abs(v * k) < .003 ? 0 : v * k);
  }
}

// ---- globe shaders ----
const PRECISION = "#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n";
const SCREEN_VERTEX = "attribute vec2 g; varying vec2 n; void main() { n = g; gl_Position = vec4(g, 0., 1.); }";

// the sphere mesh, radius R (1 = ground, > 1 = cloud shell); the planet's rotation: a.x = camera yaw + spin, a.y = camera pitch
const SPHERE_VERTEX = `
  attribute vec3 p; attribute vec2 t;
  uniform vec3 u;   // camera distance, aspect, view constant
  uniform vec2 a;
  uniform float R;
  varying vec2 v; varying vec3 q; varying vec3 o;
  void main() {
    float c = cos(a.x), s = sin(a.x), e = cos(a.y), f = sin(a.y);
    vec3 r = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z) * R;
    r = vec3(r.x, e * r.y - f * r.z, f * r.y + e * r.z);
    q = r; o = p; v = t;
    gl_Position = vec4(r.x / (u.z * u.y), r.y / u.z, 0., u.x - r.z);
  }`;

const CLOUDS = `
  uniform sampler2D C;
  float cl(vec2 w) { return texture2D(C, w).r; }   // cloud density (static/map/clouds.webp)
  vec2 tl(vec3 ob, vec3 Lo) {                       // a step on the map towards the sun
    vec3 e = normalize(vec3(ob.z, 0., -ob.x) + vec3(1e-4, 0., 0.)), nr = cross(ob, e);
    float cs = max(sqrt(1. - ob.y * ob.y), .1);
    return vec2(dot(Lo, e) / (6.2832 * cs), -dot(Lo, nr) / 3.1416);
  }`;

// ground: map, day / night, ocean glint + sky reflection, cloud shadows, atmospheric haze
const GROUND_FRAGMENT = PRECISION + CLOUDS + `
  uniform sampler2D T; uniform sampler2D B; uniform sampler2D O;
  uniform float d; uniform vec3 L; uniform vec3 Lo;
  varying vec2 v; varying vec3 q; varying vec3 o;
  void main() {
    vec3 n = normalize(q), V = normalize(vec3(0., 0., d) - q), ob = normalize(o), H = normalize(L + V);
    float ndl = dot(n, L), h = 1. / d, al = smoothstep(h, h + .03, q.z), nv = max(dot(n, V), 0.);
    float day = smoothstep(-.08, .3, ndl), tw = exp(-pow(ndl * 6., 2.)), wr = clamp((ndl + .15) / 1.15, 0., 1.);
    vec4 ov = texture2D(O, v);
    vec3 m = (texture2D(T, v).rgb * (1. - ov.a) + ov.rgb) * (1. - texture2D(B, v).a);
    float cd = cl(v), sh = cl(v + tl(ob, Lo) * .014);
    float sea = smoothstep(.02, .07, m.b - m.r) * (1. - smoothstep(.18, .28, m.r));
    vec3 g = m * (1. - .55 * sh * day) * mix(1., .82, sea);
    vec3 c = mix(m * vec3(.045, .06, .1), g * (.08 + 1.02 * wr), day);
    c += sea * day * (1. - cd) * (vec3(1., .95, .85) * (pow(max(dot(n, H), 0.), 160.) * .8 + pow(max(dot(n, H), 0.), 18.) * .05)
       + vec3(.3, .45, .85) * pow(1. - nv, 5.) * .35);
    c += vec3(1., .35, .1) * tw * .05;
    float fr = pow(1. - nv, 2.5);
    vec3 atm = mix(vec3(.16, .32, .9), vec3(.5, .72, 1.), day) * smoothstep(-.28, .3, ndl) + vec3(1., .42, .14) * exp(-pow(ndl * 5., 2.)) * .7;
    c = mix(c, atm, fr * .78);
    c = mix(c, vec3(.52, .68, 1.), .06 * day);
    gl_FragColor = vec4(c * al, al);
  }`;

// cloud shell: soft density, self-shadowing towards the sun, warm light at the terminator, fading into the atmosphere at the edge
const CLOUD_FRAGMENT = PRECISION + CLOUDS + `
  uniform float d; uniform float R; uniform vec3 L; uniform vec3 Lo;
  varying vec2 v; varying vec3 q; varying vec3 o;
  void main() {
    vec3 n = normalize(q), V = normalize(vec3(0., 0., d) - q), ob = normalize(o);
    float h = R * R / d, al = smoothstep(h, h + .02, q.z), ndl = dot(n, L);
    float cd = cl(v), c2 = cl(v + tl(ob, Lo) * .005), sf = clamp((c2 - cd) * 2.5, 0., 1.), day = smoothstep(-.22, .25, ndl);
    vec3 lit = vec3(1., .985, .96) * (1. - .5 * sf) + vec3(.05, .07, .12) * sf;
    vec3 col = mix(vec3(.02, .025, .04), mix(vec3(1., .62, .42), lit, smoothstep(-.02, .3, ndl)), day);
    float fr = pow(1. - max(dot(n, V), 0.), 3.);
    col = mix(col, mix(vec3(.2, .35, .9), vec3(.6, .76, 1.), day) * day, fr * .5);
    float k = cd * .95 * al * (1. - fr * .4);
    gl_FragColor = vec4(col * k, k);
  }`;

// background: stars, the sun's disc and glow, the atmosphere's halo (sunlit side, sunset rim, forward scattering when backlit)
const SKY_FRAGMENT = PRECISION + `
  uniform vec3 u; uniform vec2 a; uniform vec3 S;
  varying vec2 n;
  float h3(vec3 p) { p = fract(p * .1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
  void main() {
    vec2 tp = vec2(n.x * u.z * u.y, n.y * u.z);
    vec3 rd = normalize(vec3(tp, -1.));
    float ce = cos(a.y), se = sin(a.y), cy = cos(a.x), sy = sin(a.x);
    vec3 w = vec3(rd.x, ce * rd.y + se * rd.z, -se * rd.y + ce * rd.z);
    w = vec3(cy * w.x - sy * w.z, w.y, sy * w.x + cy * w.z);
    vec3 col = vec3(0.);
    for (int k = 0; k < 2; k++) {
      float z = float(k);
      vec3 gp = w * (80. + z * 80.) + z * 17., id = floor(gp), f = fract(gp) - .5, of = (vec3(h3(id + 7.), h3(id + 13.), h3(id + 29.)) - .5) * .6;
      col += vec3(.85, .88, 1.) * step(.965, h3(id + z * 31.)) * smoothstep(.1, 0., length(f - of)) * (.3 + .7 * h3(id + 3.)) * (1.1 - .4 * z);
    }
    vec3 o = vec3(0., 0., u.x);
    float tc = -dot(o, rd);
    vec3 P = o + rd * tc;
    float dist = length(P), hh = max(dist - 1., 0.), ss = dot(P / max(dist, 1e-4), S);
    float lit = smoothstep(-.35, .4, ss), fw = pow(max(dot(rd, S), 0.), 6.), hz = exp(-hh * 30.) * .75 + exp(-hh * 9.) * .25;
    col += (mix(vec3(.12, .3, 1.), vec3(.42, .66, 1.), lit) * lit * 1.15 + vec3(1., .45, .18) * exp(-pow(ss * 3.2, 2.)) * .55
         + vec3(.7, .82, 1.) * fw * 1.8) * hz * step(0., tc);
    float sd = max(1. - dot(rd, S), 0.);
    col += step(0., -S.z) * (vec3(1., .98, .94) * smoothstep(.00016, .00008, sd) * 12. + vec3(1., .88, .7) * (.0011 / (sd + .0011)) * .6);
    gl_FragColor = vec4(1. - exp(-col * 1.4), 1.);
  }`;

function program(vertex, fragment, attributes, uniforms) {
  const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s };
  const p = gl.createProgram();
  gl.attachShader(p, shader(gl.VERTEX_SHADER, vertex));
  gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fragment));
  attributes.forEach((name, i) => gl.bindAttribLocation(p, i, name));
  gl.linkProgram(p);
  p.u = {};
  uniforms.forEach(name => p.u[name] = gl.getUniformLocation(p, name));
  return p;
}

function initGlobe(mapImg) { // false without WebGL
  globeCanvas = doc.createElement("canvas");
  gl = globeCanvas.getContext("webgl", { antialias: true });
  if (!gl) { globeButton.style.display = "none"; return false }
  edgesCanvas = doc.createElement("canvas");
  labelsEl = doc.createElement("div");
  labelsEl.id = "gw";
  globeEl.append(globeCanvas, edgesCanvas, labelsEl);
  new ResizeObserver(() => { if (globeOn) { readSizes(); requestFrame() } }).observe(globeEl);

  skyProg = program(SCREEN_VERTEX, SKY_FRAGMENT, ["g"], ["u", "a", "S"]);
  groundProg = program(SPHERE_VERTEX, GROUND_FRAGMENT, ["p", "t"], ["u", "a", "R", "d", "L", "Lo", "T", "C", "B", "O"]);
  cloudProg = program(SPHERE_VERTEX, CLOUD_FRAGMENT, ["p", "t"], ["u", "a", "R", "d", "L", "Lo", "C"]);

  triangleBuf = gl.createBuffer();                         // one full-screen triangle
  gl.bindBuffer(gl.ARRAY_BUFFER, triangleBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const vertices = [], indices = [];                       // the sphere: 96 × 48 cells, position + map coordinates
  for (let j = 0; j <= 48; j++) for (let i = 0; i <= 96; i++) {
    const lon = (i / 96 - .5) * 2 * Math.PI, lat = (.5 - j / 48) * Math.PI;
    vertices.push(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon), i / 96, j / 48);
  }
  for (let j = 0; j < 48; j++) for (let i = 0; i < 96; i++) { const a = j * 97 + i; indices.push(a, a + 1, a + 97, a + 1, a + 98, a + 97) }
  sphereBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, sphereBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  sphereIdx = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphereIdx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

  // textures: 0 map, 1 clouds, 2 borders, 3 overlay (tint, graticule, dimming: drawn by buildOverlayTexture)
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE), size = Math.min(4096, maxTex), aniso = gl.getExtension("EXT_texture_filter_anisotropic");
  const canvas = (w, h) => { const c = doc.createElement("canvas"); c.width = w; c.height = h; return c };
  const fitted = img => maxTex < 4096 ? (c => { c.getContext("2d").drawImage(img, 0, 0, size, size / 2); return c })(canvas(size, size / 2)) : img;
  const newTexture = unit => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    return t;
  };
  const upload = (unit, texture, img) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.activeTexture(gl.TEXTURE0);
  };
  textureLevel = maxTex >= 8192 && !coarseSmallDevice() ? 3 : 2; // 8192 px like the closest flat level; 4096 on small phones
  mapTex = newTexture(0);
  upload(0, mapTex, fitted(mapImg));
  if (textureLevel > 2) { // the sharp level after the quick one
    const sharp = new Image();
    sharp.src = U + "map/g3.webp";
    sharp.decode().then(() => { upload(0, mapTex, sharp); requestFrame() }, () => {});
  }
  const cloudTex = newTexture(1);                          // no clouds until their picture is loaded
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array(3));
  gl.generateMipmap(gl.TEXTURE_2D);
  const clouds = new Image();
  clouds.src = U + "map/clouds.webp";
  clouds.decode().then(() => { upload(1, cloudTex, fitted(clouds)); requestFrame() }, () => {});
  bordersTex = newTexture(2);
  setGlobeBorders([]);
  overlayTex = newTexture(3);
  overlayCanvas = canvas(size, size / 2);
  overlayCtx = overlayCanvas.getContext("2d");
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, overlayCanvas);
  gl.activeTexture(gl.TEXTURE0);
  gl.useProgram(groundProg);
  gl.uniform1i(groundProg.u.T, 0);
  gl.uniform1i(groundProg.u.C, 1);
  gl.uniform1i(groundProg.u.B, 2);
  gl.uniform1i(groundProg.u.O, 3);
  gl.useProgram(cloudProg);
  gl.uniform1i(cloudProg.u.C, 1);

  globeEl.onpointerdown = e => {
    if (e.pointerType == "mouse") { if (e.button) return; for (const i in globePointers) delete globePointers[i] }
    globeEl.setPointerCapture(e.pointerId);
    globePointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    dragMoved = 0;
    dragVel = [0, 0];
    zoomAnchorG = null;
    globeEl.classList.add("dr");
  };
  globeEl.onpointermove = e => {
    const q = globePointers[e.pointerId];
    if (!q) return;
    const before = pinch(globePointers), dx = e.clientX - q.x, dy = e.clientY - q.y;
    q.x = e.clientX;
    q.y = e.clientY;
    dragMoved += Math.abs(dx) + Math.abs(dy);
    if (before) { // two fingers: zoom towards their middle
      const now = pinch(globePointers);
      camTargetG = clampDistG(camTargetG * before.d / now.d);
      dragMoved = 99;
      anchorAt(now.x, now.y);
    } else { // drag: the camera turns with the finger; its speed is kept for the glide
      const k = 2 * (camDistG - 1) * viewConst / globeH, t = performance.now(), dt = Math.max(t - lastDragT, 8) / 1e3;
      lastDragT = t;
      yaw += dx * k;
      pitch = clampPitch(pitch + dy * k);
      dragVel = [dragVel[0] * .4 + dx * k / dt * .6, dragVel[1] * .4 + dy * k / dt * .6];
    }
  };
  globeEl.onpointerup = globeEl.onpointercancel = e => {
    const single = globePointers[e.pointerId] && Object.keys(globePointers).length == 1;
    delete globePointers[e.pointerId];
    if (!Object.keys(globePointers).length) globeEl.classList.remove("dr");
    if (performance.now() - lastDragT > 80 || dragMoved >= 99) dragVel = [0, 0]; // held still before letting go, or a pinch: no glide
    if (!single || dragMoved >= 6 || e.type != "pointerup") return;
    dragVel = [0, 0];
    const marker = doc.elementFromPoint(e.clientX, e.clientY)?.closest("#gw [data-m]");
    if (marker) return pickMarker(+marker.dataset.m);
    const q = globePoint(e);
    pickCountry(q && countryAt(q.mx, q.my));
  };
  globeEl.onlostpointercapture = e => {
    delete globePointers[e.pointerId];
    if (!Object.keys(globePointers).length) globeEl.classList.remove("dr");
  };
  globeEl.onwheel = e => {
    e.preventDefault();
    camTargetG = clampDistG(camTargetG * Math.exp(wheelPx(e) * .0015));
    anchorAt(e.clientX, e.clientY);
    requestFrame();
  };
  return true;
}

function drawGlobe() {
  if (overlayDirty) { overlayDirty = false; buildOverlayTexture() }
  const w = globeW, h = globeH, ratio = Math.min(devicePixelRatio || 1, 2), cw = Math.round(w * ratio), ch = Math.round(h * ratio);
  if (globeCanvas.width != cw || globeCanvas.height != ch) { globeCanvas.width = edgesCanvas.width = cw; globeCanvas.height = edgesCanvas.height = ch }
  gl.viewport(0, 0, cw, ch);
  aspect = w / h;
  viewConst = viewConstFor(w, h);
  const sunView = rotX(rotY(SUN, yaw), pitch), sunPlanet = rotY(SUN, -spin); // the sun's direction in view / planet space

  gl.disable(gl.BLEND); // sky
  gl.useProgram(skyProg);
  gl.bindBuffer(gl.ARRAY_BUFFER, triangleBuf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, 0, 0, 0);
  gl.disableVertexAttribArray(1);
  gl.uniform3f(skyProg.u.u, camDistG, aspect, viewConst);
  gl.uniform2f(skyProg.u.a, yaw, pitch);
  gl.uniform3f(skyProg.u.S, ...sunView);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.enable(gl.BLEND); // ground, then the cloud shell
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.bindBuffer(gl.ARRAY_BUFFER, sphereBuf);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphereIdx);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, 0, 20, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, 0, 20, 12);
  for (const [prog, radius] of [[groundProg, 1], [cloudProg, 1.012]]) {
    gl.useProgram(prog);
    gl.uniform3f(prog.u.u, camDistG, aspect, viewConst);
    gl.uniform2f(prog.u.a, yaw + spin, pitch);
    gl.uniform1f(prog.u.R, radius);
    gl.uniform1f(prog.u.d, camDistG);
    gl.uniform3f(prog.u.L, ...sunView);
    gl.uniform3f(prog.u.Lo, ...sunPlanet);
    gl.drawElements(gl.TRIANGLES, 27648, gl.UNSIGNED_SHORT, 0);
  }
  drawEdges(w, h, ratio);
  placeGlobeLabels(w, h);
}

function buildOverlayTexture() { // country tint, graticule, dimming outside the selection (names float above; edges are vector)
  const S = overlayCanvas.width, Sh = S / 2, s = S / MAP_W, o = overlayCtx;
  o.clearRect(0, 0, S, Sh);
  if (coloursOn) { // a light tint; the colour bands are drawn as vectors (drawEdges)
    o.save();
    o.scale(s, s);
    o.globalAlpha = .28;
    regions.forEach(r => { if (r != regionById[selCountry]) { o.fillStyle = r.c; o.fill(regionPath(r), "evenodd") } });
    o.restore();
  }
  o.strokeStyle = "#00000059";
  o.lineWidth = 2;
  o.beginPath();
  for (let i = 1; i < 24; i++) { o.moveTo(i * S / 24, 0); o.lineTo(i * S / 24, Sh) }
  for (let i = 1; i < 12; i++) { o.moveTo(0, i * Sh / 12); o.lineTo(S, i * Sh / 12) }
  o.stroke();
  o.strokeStyle = "#000000b3"; // equator and prime meridian
  o.lineWidth = 3;
  o.beginPath();
  o.moveTo(S / 2, 0); o.lineTo(S / 2, Sh);
  o.moveTo(0, Sh / 2); o.lineTo(S, Sh / 2);
  o.stroke();
  if (selCountry) {
    const rest = new Path2D();
    rest.rect(0, 0, MAP_W, MAP_H);
    rest.addPath(regionPath(regionById[selCountry]));
    o.save();
    o.scale(s, s);
    o.fillStyle = "#04040a";
    o.globalAlpha = .5;
    o.fill(rest, "evenodd");
    o.restore();
  }
  buildGlobeLabels();
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, overlayTex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, overlayCanvas);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.activeTexture(gl.TEXTURE0);
}

const setGlobeBorders = levels => setMipmaps(gl, bordersTex, 2, levels); // the site's own border levels as mipmaps

function anchorAt(cx, cy) { // zoom anchor: the planet point under the pointer
  const q = globePoint({ clientX: cx, clientY: cy }), r = globeEl.getBoundingClientRect();
  zoomAnchorG = q && { p: [q.x, q.y, q.z], x: cx - r.left, y: cy - r.top };
}

function globePoint(e) { // screen point -> planet point {x, y, z} and map point {mx, my}; null off the planet
  const r = globeRect, nx = (e.clientX - r.left) / r.width * 2 - 1, ny = 1 - (e.clientY - r.top) / r.height * 2,
    dx = nx * viewConst * aspect, dy = ny * viewConst, a = dx * dx + dy * dy + 1, b = -2 * camDistG, c = camDistG * camDistG - 1, disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a), X = dx * t, Y = dy * t, Z = camDistG - t,
    cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw + spin), sy = Math.sin(yaw + spin),
    y1 = cp * Y + sp * Z, z1 = -sp * Y + cp * Z, qx = cy * X - sy * z1, qz = sy * X + cy * z1;
  return { x: qx, y: y1, z: qz, mx: (Math.atan2(qx, qz) / (2 * Math.PI) + .5) * MAP_W, my: (.5 - Math.asin(y1) / Math.PI) * MAP_H };
}

function buildGlobeLabels() { // names floating above the globe: screen-aligned, constant size; rebuilt only when names or markers change
  const items = [];
  regions.forEach(r => {
    const a = countryLabel(r);
    if (a) items.push({ country: 1, text: a.text, size: a.size, opacity: a.opacity ?? 1, spacing: (COU[r.c] || {}).lk || 0, lon: a.x / MAP_W * 360 - 180, lat: 90 - a.y / MAP_H * 180 });
  });
  MK.forEach((q, i) => { if (markerShown(q)) items.push({ marker: i, q, text: markerName(q), lon: q.o, lat: q.a }) });
  const sig = JSON.stringify(items);
  if (sig != labelsSig) {
    labelsSig = sig;
    globeLabels = items;
    labelsEl.innerHTML = items.map(e => e.country
      ? `<div class="gh"><span class="cn" style="letter-spacing:${(.08 + e.spacing).toFixed(3)}em">${esc(e.text)}</span></div>`
      : `<div class="gh" data-m="${e.marker}"><i><svg viewBox="-11 -11 22 22"><path fill-rule="evenodd" d="${MARKER_SHAPES[e.q.k | 0] || MARKER_SHAPES[0]}"/></svg>` +
        `<b${e.q.k == 1 ? ' class="d"' : ""}${e.q.f == "cap" ? " data-c" : ""}>${esc(e.text)}</b></i></div>`).join("");
    [...labelsEl.children].forEach((el, j) => {
      const e = items[j], la = e.lat * Math.PI / 180, lo = e.lon * Math.PI / 180;
      e.el = el;
      e.w = el.firstChild.offsetWidth;
      e.h = el.firstChild.offsetHeight;
      e.p = [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
    });
    labelOrder = [...items].sort((a, b) => (b.country ? 1e3 + b.size : b.q.k == 1) - (a.country ? 1e3 + a.size : a.q.k == 1)); // big country names first, then capitals, then other markers
  }
  globeLabels.forEach(e => e.marker != null && e.el.classList.toggle("s", e.marker === selMarker));
}

function regionSphere(r) { // a country outline as points on the unit sphere (cached); long edges are split so they follow the curve
  if (r.sphere) return r.sphere;
  const tokens = r.d.match(/[a-zA-Z]|-?[\d.]+/g), rings = r.sphere = [];
  let i = 0, cmd, x = 0, y = 0, ring, x0 = 0, y0 = 0;
  const num = () => +tokens[i++];
  const add = (X, Y) => { const lo = X / MAP_W * 2 * Math.PI - Math.PI, la = Math.PI / 2 - Y / MAP_H * Math.PI; ring.push(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)) };
  const lineTo = (X, Y) => { const n = Math.ceil(Math.hypot(X - x, Y - y) / 8); for (let j = 1; j <= n; j++) add(x + (X - x) * j / n, y + (Y - y) * j / n); x = X; y = Y };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    if (cmd == "M" || cmd == "m") {
      x = x0 = num() + (cmd == "m" ? x : 0);
      y = y0 = num() + (cmd == "m" ? y : 0);
      rings.push(ring = []);
      add(x, y);
      cmd = cmd == "m" ? "l" : "L";
    } else if (cmd == "l") lineTo(x + num(), y + num());
    else if (cmd == "L") lineTo(num(), num());
    else if (cmd == "h") lineTo(x + num(), y);
    else if (cmd == "H") lineTo(num(), y);
    else if (cmd == "v") lineTo(x, y + num());
    else if (cmd == "V") lineTo(x, num());
    else if (cmd == "z" || cmd == "Z") { lineTo(x0, y0); cmd = "" }
    else i++;
  }
  let a = 0, b = 0, c = 0; // the country's middle direction (for its light)
  rings.flat().forEach((v, j) => j % 3 == 0 ? a += v : j % 3 == 1 ? b += v : c += v);
  const l = Math.hypot(a, b, c) || 1;
  r.middle = [a / l, b / l, c / l];
  return rings;
}

function drawEdges(w, h, ratio) { // vector country edges above the globe: colour bands inside the borders, the selection's glow + 2 px line
  const o = edgesCanvas.getContext("2d");
  o.setTransform(ratio, 0, 0, ratio, 0, 0);
  o.clearRect(0, 0, w, h);
  const Y = yaw + spin, c = Math.cos(Y), s = Math.sin(Y), e = Math.cos(pitch), f = Math.sin(pitch), horizon = 1 / camDistG,
    rimR = h / (2 * viewConst * Math.sqrt(camDistG * camDistG - 1)), sunPlanet = rotY(SUN, -spin), selected = regionById[selCountry];
  o.lineJoin = o.lineCap = "round";
  const project = (region, withClip) => { // visible edges, and an area for clipping with hidden points pushed onto the planet's rim
    const edges = new Path2D(), clip = withClip && new Path2D();
    let any = false;
    for (const ring of regionSphere(region)) {
      let on = false;
      for (let i = 0; i < ring.length; i += 3) {
        const x1 = c * ring[i] + s * ring[i + 2], z1 = -s * ring[i] + c * ring[i + 2], y2 = e * ring[i + 1] - f * z1, z2 = f * ring[i + 1] + e * z1;
        if (z2 < horizon) {
          on = false;
          if (clip) { const l = Math.hypot(x1, y2) || 1; clip[i ? "lineTo" : "moveTo"](w / 2 + x1 / l * rimR, h / 2 - y2 / l * rimR) }
          continue;
        }
        const depth = camDistG - z2, X = (x1 / (viewConst * aspect) / depth + 1) * w / 2, V = (1 - y2 / viewConst / depth) * h / 2;
        on ? edges.lineTo(X, V) : edges.moveTo(X, V);
        if (clip) clip[i ? "lineTo" : "moveTo"](X, V);
        on = any = true;
      }
      clip?.closePath();
    }
    return any && [edges, clip];
  };
  if (coloursOn) for (const region of regions) {
    if (region == selected) continue;
    const p = project(region, true);
    if (!p) continue;
    const n = region.middle, light = n[0] * sunPlanet[0] + n[1] * sunPlanet[1] + n[2] * sunPlanet[2];
    o.save();
    o.clip(p[1], "evenodd");
    o.globalAlpha = .85 * Math.min(1, Math.max(.2, .6 + light * 2)); // dimmer on the night side
    o.strokeStyle = region.c;
    o.lineWidth = 7;
    o.stroke(p[0]);
    o.restore();
  }
  const sel = selected && project(selected);
  if (sel) {
    o.strokeStyle = "#e8e8e0";
    o.globalAlpha = .22;
    o.lineWidth = 7;
    o.stroke(sel[0]);
    o.globalAlpha = 1;
    o.lineWidth = 2;
    o.stroke(sel[0]);
  }
  updateZoomAndScale(Math.PI / (2 * viewConst * (camDistG - 1)), Math.PI / (2 * viewConst * (GLOBE_CLOSEST - 1)), EARTH_KM * 2 * viewConst * (camDistG - 1) / h);
}

function placeGlobeLabels(w, h) { // every frame: project the names, fade them at the horizon, hide them by zoom and where a more important one is
  const Y = yaw + spin, c = Math.cos(Y), s = Math.sin(Y), e = Math.cos(pitch), f = Math.sin(pitch), zoom = globeZoomPercent(), horizon = 1 / camDistG,
    pxPerMapPx = Math.PI / MAP_H * h / 2 / viewConst, maxFont = Math.min(20, Math.max(13, Math.min(w, h) / 28)), taken = [],
    selected = labelOrder.find(q => q.marker === selMarker);
  for (const q of selected ? [selected, ...labelOrder.filter(v => v != selected)] : labelOrder) {
    const [px, py, pz] = q.p, x1 = c * px + s * pz, z1 = -s * px + c * pz, y2 = e * py - f * z1, z2 = f * py + e * z1, depth = camDistG - z2,
      X = (x1 / (viewConst * aspect) / depth + 1) * w / 2, V = (1 - y2 / viewConst / depth) * h / 2,
      alpha = Math.min(1, Math.max(0, (z2 - horizon) / .12)),
      font = q.country ? Math.round(Math.min(maxFont, Math.max(10, q.size * pxPerMapPx / depth)) * 2) / 2 : 0, k = font / 20,
      box = q.country ? [X - q.w * k / 2 - 4, V - q.h * k / 2, X + q.w * k / 2 + 4, V + q.h * k / 2] : [X - 11, V - 10, X - 11 + q.w + 4, V + 10];
    const gap = q.on ? 3 : 0; // a shown name yields only to a clear overlap: no flicker at the edge
    const on = alpha > .05 && (q.country ? zoom < NAMES_UNTIL : !markerHidden(q.q, zoom)) &&
      !taken.some(b => b[0] < box[2] - gap && box[0] + gap < b[2] && b[1] < box[3] - gap && box[1] + gap < b[3]);
    if (on) taken.push(box);
    q.el.style.transform = `translate(${Math.round(X)}px,${Math.round(V)}px)`; // whole pixels and real font sizes: the text does not shimmer
    if (q.country && q.font !== font) q.el.firstChild.style.fontSize = (q.font = font) + "px";
    const opacity = (alpha * (q.opacity ?? 1)).toFixed(2);
    if (q.shownOpacity !== opacity) q.el.style.opacity = q.shownOpacity = opacity;
    if (q.on !== on) q.el.classList.toggle("gh", !(q.on = on));
  }
}

function toggleGlobe() {
  stopMotion();
  globeOn = !globeOn;
  doc.body.classList.toggle("g", globeOn);
  globeButton.textContent = globeOn ? "2D" : "3D";
  readSizes();
  if (globeOn) {
    if (pendingGlobeView) { // the same view after switching the language
      yaw = pendingGlobeView.yaw - spin;
      pitch = pendingGlobeView.pitch;
      camDistG = camTargetG = pendingGlobeView.dist;
      pendingGlobeView = null;
    }
    dragVel = [0, 0];
    zoomAnchorG = null;
    loadGlobeBorders();
    requestFrame();
  } else setView();
}

function loadGlobeBorders() { // borders of the current version for the globe
  const v = version;
  if (!v.b) { setGlobeBorders([]); return globeOverlayChanged() }
  Promise.all(Array.from({ length: textureLevel + 1 }, (_, j) => { const i = new Image(); i.src = bordersSrc(textureLevel - j); return i.decode().then(() => i) }))
    .then(levels => { if (v == version) { setGlobeBorders(levels); globeOverlayChanged() } }, () => {});
}

globeButton.onclick = () => { // the first time: load the 4096 px map and the fonts, build the globe; the spinner stays until its first frame is drawn
  if (gl) return toggleGlobe();
  if (loading) return;
  loading = true;
  loader.hidden = false;
  globeButton.setAttribute("aria-busy", "true");
  const done = () => { loading = false; loader.hidden = true; globeButton.removeAttribute("aria-busy") };
  const img = new Image();
  img.onerror = done;
  img.onload = () => Promise.all([doc.fonts.load("20px A"), doc.fonts.load("20px Play")])
    .then(() => new Promise(r => requestAnimationFrame(() => setTimeout(r)))) // shaders compile on the first draw
    .then(() => { if (initGlobe(img)) { onFirstFrame = done; toggleGlobe() } else done() });
  img.src = U + "map/g2.webp";
};
