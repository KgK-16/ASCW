"""Builds the site map from a Krita file.

usage: python3 tools/map.py General_Map.kra

Krita file layout (layer names matter):
  top-level visible paint layers  -> the geographic base (static/map/g1..g3.webp), always shown
  group "y<year>" (e.g. y410)     -> one map version:
      "borders"    black lines, always shown           -> static/map/<year>/b0..b3.webp
      "countries"  flat fills, one hex colour a country -> vector territories in assets/map.json
  other groups (e.g. weather) are ignored.
Countries are matched by hex colour from tools/labels.json (their names may be overridden on the site: assets/countries.json);
unknown colours are reported. A country's name stays where it was in the previous assets/map.json; a new country's name is put in
the middle of its territory (it is moved, sized and spaced by hand on the site).
"""
import sys, os, re, json, zipfile, ctypes, subprocess, tempfile
import xml.etree.ElementTree as ET
import numpy as np, cv2
from PIL import Image
from snap import snap  # neighbouring countries share one border line

TOOLS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(TOOLS)
MAP_JSON = ROOT + '/assets/map.json'
W4, H4 = 4096, 2048  # the map coordinate space used by the site

LABELS = json.load(open(TOOLS + '/labels.json'))
SITE = json.load(open(ROOT + '/assets/countries.json')) if os.path.exists(ROOT + '/assets/countries.json') else {}
for l in LABELS:  # names edited on the site win over labels.json
    o = SITE.get(l['hex'], {})
    l['en'] = o.get('en') or l['en']
    l['ru'] = o.get('ru') or l['ru']
OLD_NAMES = {}  # where each country's name stood: (version, hex) -> (x, y)
if os.path.exists(MAP_JSON):
    for v in json.load(open(MAP_JSON)):
        for r in v['r']:
            if 'x' in r: OLD_NAMES[(v['y'], r['c'])] = (r['x'], r['y'])


def load_lzf():
    """the LZF decoder (tools/lzf.c), compiled once"""
    so = os.path.join(tempfile.gettempdir(), 'ascw_lzf.so')
    if not os.path.exists(so):
        subprocess.check_call(['gcc', '-O2', '-shared', '-fPIC', '-o', so, TOOLS + '/lzf.c'])
    lib = ctypes.CDLL(so)
    lib.lzf_dec.argtypes = [ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_int]
    return lib
LZF = load_lzf()


def read_layer(z, path, W, H):
    """a Krita tiled layer (8-bit RGBA, planar BGRA, LZF) -> RGBA array"""
    d = z.read(path)
    p = 0
    head = {}
    for _ in range(5):
        e = d.index(b'\n', p)
        k, v = d[p:e].split(b' ')
        head[k] = int(v)
        p = e + 1
    tw, th, ps = head[b'TILEWIDTH'], head[b'TILEHEIGHT'], head[b'PIXELSIZE']
    if ps != 4:
        sys.exit('only 8-bit RGBA Krita files are supported')
    out = np.zeros((H, W, 4), np.uint8)
    buf = ctypes.create_string_buffer(tw * th * ps)
    for _ in range(head[b'DATA']):
        e = d.index(b'\n', p)
        x, y, _c, size = d[p:e].split(b',')
        p = e + 1
        x, y, size = int(x), int(y), int(size)
        tile = d[p:p + size]
        p += size
        if tile[0]:  # compressed
            if LZF.lzf_dec(tile[1:], len(tile) - 1, buf, len(buf)) != len(buf):
                sys.exit('bad tile in ' + path)
            raw = buf.raw
        else:
            raw = tile[1:]
        if x < 0 or y < 0 or x >= W or y >= H:
            continue
        px = np.frombuffer(raw, np.uint8).reshape(ps, th, tw).transpose(1, 2, 0)
        x1, y1 = min(x + tw, W), min(y + th, H)
        out[y:y1, x:x1] = px[:y1 - y, :x1 - x]
    return out[..., [2, 1, 0, 3]]


def over(dst, src, opacity=1.):
    """paints src over dst (both float RGBA)"""
    a = src[..., 3:4] / 255. * opacity
    dst[..., :3] = src[..., :3] * a + dst[..., :3] * (1 - a)
    dst[..., 3:4] = np.maximum(dst[..., 3:4], a * 255)


def levels(img, name, lossless=False, first=0):
    """zoom levels from first: 0 = 1024, 1 = 2048, 2 = 4096 (also the globe texture), 3 = full width"""
    W = img.width
    for i, w in enumerate((1024, 2048, 4096, W)):
        if i < first:
            continue
        im = img if w == W else img.resize((w, w // 2), Image.LANCZOS)
        if lossless and w != W:  # thin lines stay visible when downscaled: alpha = the block's max
            f = W // w
            a = np.asarray(img.getchannel('A')).reshape(w // 2, f, w, f).max(axis=(1, 3))
            im = Image.merge('RGBA', (*Image.new('RGB', (w, w // 2), (0, 0, 0)).split(), Image.fromarray(a)))
        im.save(f'{name}{i}.webp', lossless=lossless, quality=100 if lossless else 90, method=6)


def path_d(c):
    """a contour (full-resolution px) -> SVG path in the 4096 space: relative segments, h / v for straight ones"""
    num = lambda v: ''.join((('' if k == 0 or str(n)[0] == '-' else ' ') + str(n)) for k, n in enumerate(v))
    c = np.round(c / 2).astype(int)
    c = c[np.r_[True, np.any(c[1:] != c[:-1], axis=1)]]
    if len(c) < 3:
        return ''
    out = 'M' + num(c[0].tolist())
    cmd, buf = None, []
    for (a, b), (p, q) in zip(c[1:], c[:-1]):
        dx, dy = int(a - p), int(b - q)
        c2, v = ('h', [dx]) if dy == 0 else ('v', [dy]) if dx == 0 else ('l', [dx, dy])
        if c2 != cmd:
            if cmd:
                out += cmd + num(buf)
            cmd, buf = c2, []
        buf += v
    return out + (cmd + num(buf) if cmd else '') + 'z'


def middle(mask):
    """the point of a shape farthest from all its borders (on the mask's grid)"""
    d = cv2.distanceTransform(np.pad(mask, 1).astype(np.uint8), cv2.DIST_L2, 5)[1:-1, 1:-1]
    y, x = np.unravel_index(d.argmax(), d.shape)
    return x, y


def countries(img, version):
    """the countries of one version: outlines and name positions"""
    rgb = img[..., :3].astype(int)
    on = img[..., 3] > 127
    hexes = [tuple(int(l['hex'][i:i + 2], 16) for i in (1, 3, 5)) for l in LABELS]
    colours, inverse = np.unique(rgb[on], axis=0, return_inverse=True)
    label_of = np.full(len(colours), -1)
    for k, c in enumerate(colours):
        d = [max(abs(c - np.array(h))) for h in hexes]
        i = int(np.argmin(d))
        if d[i] <= 6:
            label_of[k] = i
        else:
            print(f'  y{version}: unknown colour #{c[0]:02x}{c[1]:02x}{c[2]:02x} ({np.sum(inverse.ravel() == k)} px)')
    owner = np.full(on.shape, -1, np.int16)
    owner[on] = label_of[inverse.ravel()]
    out = []
    for i, l in enumerate(LABELS):
        mask = (owner == i).astype(np.uint8)
        if not mask.any():
            continue
        contours, _ = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
        d = ''.join(path_d(cv2.approxPolyDP(c, 2., True).reshape(-1, 2)) for c in contours if cv2.contourArea(c) >= 60)
        r = dict(id=i + 1, c=l['hex'], name=l['en'], ru=l['ru'], d=d)
        if (version, l['hex']) in OLD_NAMES:  # the name stays where it was (it may have been moved by hand)
            r['x'], r['y'] = OLD_NAMES[(version, l['hex'])]
        else:
            x, y = middle(cv2.resize(mask, (W4, H4), interpolation=cv2.INTER_AREA) > 0 if mask.shape[1] != W4 else mask > 0)
            r['x'], r['y'] = int(x), int(y)
        out.append(r)
    return out


def main(src):
    z = zipfile.ZipFile(src)
    doc = ET.fromstring(z.read('maindoc.xml'))
    ns = {'k': 'http://www.calligra.org/DTD/krita'}
    image = doc.find('k:IMAGE', ns)
    W, H, base = int(image.get('width')), int(image.get('height')), image.get('name')
    top = image.find('k:layers', ns).findall('k:layer', ns)
    read = lambda e: read_layer(z, f'{base}/layers/{e.get("filename")}', W, H)
    geo = np.zeros((H, W, 4), np.float32)
    versions = {}
    for e in reversed(top):  # bottom -> top
        name = e.get('name')
        if e.get('nodetype') == 'paintlayer' and e.get('visible') == '1':
            if e.get('compositeop') != 'normal':
                print('  warning: blend mode ignored for', name)
            print('geo layer:', name)
            over(geo, read(e).astype(np.float32), int(e.get('opacity')) / 255)
        elif e.get('nodetype') == 'grouplayer' and re.fullmatch(r'y-?\d+', name):
            versions[int(name[1:])] = {c.get('name'): c for c in e.find('k:layers', ns).findall('k:layer', ns)}
    os.makedirs(ROOT + '/static/map', exist_ok=True)
    levels(Image.fromarray(geo[..., :3].round().astype(np.uint8)), ROOT + '/static/map/g', first=1)  # the site never shows level 0 of the geography
    data = []
    for y in sorted(versions):
        layers = versions[y]
        print('version', y)
        if 'borders' in layers:
            os.makedirs(f'{ROOT}/static/map/{y}', exist_ok=True)
            levels(Image.fromarray(read(layers['borders'])), f'{ROOT}/static/map/{y}/b', True)
        regions = snap(countries(read(layers['countries']), y)) if 'countries' in layers else []
        data.append(dict(y=y, b=int('borders' in layers), r=regions))
    json.dump(data, open(MAP_JSON, 'w'), separators=(',', ':'), ensure_ascii=False)
    print('assets/map.json', os.path.getsize(MAP_JSON), 'bytes')


if __name__ == '__main__':
    main(sys.argv[1])
