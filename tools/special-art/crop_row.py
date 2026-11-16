#!/usr/bin/env python3
"""Crop a full-tile row close-up (ice, lock, bomb, normal 4) from the staged shot."""
import json
import sys
from pathlib import Path

from PIL import Image

shot, cells_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(shot)
cells = json.loads(Path(cells_path).read_text())
dsf = 3
pts = cells["rowCells"]["pts"]
dx = pts[1]["x"] - pts[0]["x"]
# Generous padding: previous v4 crop cut the tops. cellPoint sits low in the tile.
pad_x = dx * 0.62
pad_top = dx * 0.92
pad_bot = dx * 0.78
l = int(pts[0]["x"] * dsf - pad_x * dsf)
t = int(pts[0]["y"] * dsf - pad_top * dsf)
r = int(pts[3]["x"] * dsf + pad_x * dsf)
b = int(pts[3]["y"] * dsf + pad_bot * dsf)
l, t = max(0, l), max(0, t)
r, b = min(im.width, r), min(im.height, b)
row = im.crop((l, t, r, b))
row2 = row.resize((row.width * 2, row.height * 2), Image.Resampling.LANCZOS)
Path(out).parent.mkdir(parents=True, exist_ok=True)
row2.save(out)
# also per-tile crops next to the close-up for self-review
names = ["ice", "bound", "bomb", "normal"]
tmp = Path("/tmp")
for name, p in zip(names, pts):
    cl = int(p["x"] * dsf - pad_x * dsf)
    ct = int(p["y"] * dsf - pad_top * dsf)
    cr = int(p["x"] * dsf + pad_x * dsf)
    cb = int(p["y"] * dsf + pad_bot * dsf)
    im.crop((max(0, cl), max(0, ct), min(im.width, cr), min(im.height, cb))).save(tmp / f"v5-{name}.png")
print(f"wrote {out} src=({r-l},{b-t}) out={row2.size} box=({l},{t},{r},{b})")
