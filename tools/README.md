# tools

Rebuild the map from a Krita file (8-bit RGBA, layer names as described in map.py):

    python3 tools/map.py General_Map.kra

Outputs: static/map/g1..g3.webp (geography), static/map/<year>/b0..b3.webp (borders), assets/map.json (countries, name positions).
`labels.json`: country hex colour -> EN / RU name. A country's name keeps its position from the previous map.json; a new country's
name is put in the middle of its territory and then moved, sized and spaced by hand on the site (edit mode, 🏷 Country names).
`snap.py`: makes neighbouring countries share one border line (run by map.py). `lzf.c`: decompresses Krita layers (compiled by map.py).
