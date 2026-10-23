# tools

Regenerate country outlines from a flat-colour political map:

    node tools/measure.js          # after changing names in labels.json
    python3 tools/regions.py       # tools/political.png -> assets/regions.json

`labels.json`: EN/RU names, optional x/y/s (label position/size) per country, in colour-area order.
