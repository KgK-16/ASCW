# tools

Rebuild the map from a Krita file (8-bit RGBA, layer names as described in map.py):

    node tools/measure.js              # after changing names in labels.json
    python3 tools/map.py General_Map.kra

Outputs: static/map/g0..g3.webp (geography), static/map/<year>/b0..b3.webp (borders), assets/map.json (countries, labels).
`labels.json`: country hex colour -> EN/RU name.
