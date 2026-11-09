# tools

## Articles: from Obsidian to the site

Articles are written in the Obsidian vault AI Core (`C:\AI Core\2-ASCW`, folder `Публикация`). The author's guide is
`1-ME/Как публиковать.md` in the same vault.

    tools/publish.cmd          publish: pull, copy, test build, commit, push (the desktop shortcut runs this)
    tools/publish.ps1 -Local   only update the files here

`publish.ps1` generates `content/` (except `content/map/`), `static/notes/`, `data/notes.json` and `data/text.json`: do not edit them by hand.
Notes are copied byte for byte, so their text can never change on the way. Obsidian syntax is handled at build time:
`layouts/partials/body.html` (links, pictures) and `layouts/_markup/` (headings, pictures, callouts). The file must stay UTF-8 with a BOM:
Windows PowerShell reads it wrongly otherwise.

## The map

Rebuild the map from a Krita file (8-bit RGBA, layer names as described in map.py):

    python3 tools/map.py General_Map.kra

Outputs: static/map/g1..g3.webp (geography), static/map/<year>/b0..b3.webp (borders), assets/map.json (countries, name positions).
`labels.json`: country hex colour -> EN / RU name. A country's name keeps its position from the previous map.json; a new country's
name is put in the middle of its territory and then moved, sized and spaced by hand on the site (edit mode, 🏷 Country names).
`snap.py`: makes neighbouring countries share one border line (run by map.py). `lzf.c`: decompresses Krita layers (compiled by map.py).
