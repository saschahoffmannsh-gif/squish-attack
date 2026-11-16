#!/usr/bin/env python3
"""Cut thick X-chains + gold padlock from the new concept, with clean alpha.

Writes:
  game/assets/specials/lock-decal.webp     — top-face decal, stone AABB, 1024
  game/assets/specials/lock-wrap.webp      — 2x2 atlas of corner end-links
  tools/special-art/material-preview/lock-*.png
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageDraw

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "concept-chains.jpg"
OUT = ROOT.parents[1] / "game" / "assets" / "specials"
PREVIEW = ROOT / "material-preview"
SIZE = 1024

# Mid-band AABB of the stone face (square).
STONE = (190, 182, 827, 819)  # x0,y0,x1,y1  (637 x 637)


def sd_round_box(xx, yy, cx, cy, hx, hy, r):
    dx = np.abs(xx - cx) - (hx - r)
    dy = np.abs(yy - cy) - (hy - r)
    q = np.sqrt(np.maximum(dx, 0) ** 2 + np.maximum(dy, 0) ** 2)
    return q + np.minimum(np.maximum(dx, dy), 0) - r



def _drop_islands(mask: np.ndarray, min_area: int = 80) -> np.ndarray:
    """Keep connected components larger than min_area. 4-connected."""
    h, w = mask.shape
    seen = np.zeros((h, w), np.uint8)
    out = np.zeros((h, w), bool)
    lab = 0
    for y in range(h):
        row = mask[y]
        for x in range(w):
            if not row[x] or seen[y, x]:
                continue
            # flood
            stack = [(y, x)]
            seen[y, x] = 1
            cells = [(y, x)]
            while stack:
                cy, cx = stack.pop()
                for ny, nx in ((cy-1, cx), (cy+1, cx), (cy, cx-1), (cy, cx+1)):
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = 1
                        stack.append((ny, nx))
                        cells.append((ny, nx))
            if len(cells) >= min_area:
                for cy, cx in cells:
                    out[cy, cx] = True
    return out


def cutout(im: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    h, w, _ = im.shape
    r, g, b = im[:, :, 0], im[:, :, 1], im[:, :, 2]
    luma = r * 0.30 + g * 0.59 + b * 0.11
    sat = im.max(2) - im.min(2)
    yy, xx = np.ogrid[:h, :w]

    navy = (b > r + 12) & (r < 70) & (luma < 85)

    luma_img = Image.fromarray(np.clip(luma, 0, 255).astype(np.uint8))
    blur = np.array(luma_img.filter(ImageFilter.GaussianBlur(2.8)), np.float32)
    contrast = np.abs(luma - blur)

    # Gold rim of the padlock only (exclude the warm reflection under it).
    gold = (
        (r > g + 10)
        & (r > b + 28)
        & (r > 70)
        & (b < r * 0.55)
        & (g < r * 0.85)
        & (g > b)
        & (xx > 440)
        & (xx < 590)
        & (yy > 510)
        & (yy < 642)
    )

    # Padlock body: rounded square covering the gold rim + dark face + keyhole.
    # Measured from the concept: outer gold ≈ (456,526)–(574,638).
    pad_cx, pad_cy = 515.0, 582.0
    pad_hx, pad_hy, pad_r = 62.0, 60.0, 16.0
    pad_d = sd_round_box(xx, yy, pad_cx, pad_cy, pad_hx, pad_hy, pad_r)
    pad_body = pad_d < 1.5

    # Shackle: U / ring above the body, going through the crossing.
    sh_cx, sh_cy = 515.0, 500.0
    sh_outer, sh_inner = 58.0, 28.0
    sh_d = np.sqrt((xx - sh_cx) ** 2 + (yy - sh_cy) ** 2)
    shackle = (sh_d < sh_outer + 2) & (sh_d > sh_inner - 2) & (yy < pad_cy - 8) & (yy > 420)
    # legs down to the body
    legs = (
        ((np.abs(xx - (sh_cx - 42)) < 11) | (np.abs(xx - (sh_cx + 42)) < 11))
        & (yy > 490)
        & (yy < pad_cy - 4)
    )
    shackle = shackle | legs

    # Diagonal X corridor (chains run corner to corner).
    dx = (xx - 508.5) / 318.5
    dy = (yy - 500.5) / 318.5
    diag = np.minimum(np.abs(dx - dy), np.abs(dx + dy))
    in_x = diag < 0.195
    in_x_wide = diag < 0.28
    in_center = np.sqrt(((xx - 515) / 130.0) ** 2 + ((yy - 530) / 160.0) ** 2) < 1.0

    spec = (luma > 162) & (~navy)
    edge_metal = (contrast > 9.0) & (~navy) & (sat < 55)
    steel_hi = (luma > 148) & (sat < 42) & (~navy)

    # High-confidence metal only: sharp specular, strong edges, gold, padlock, shackle.
    strong = (
        (spec & (in_x_wide | in_center | shackle))
        | gold
        | pad_body
        | shackle
        | ((contrast > np.where(yy > 600, 9.0, 13.0)) & (in_x | in_center | shackle) & (~navy))
        | (steel_hi & in_x & (contrast > np.where(yy > 600, 5.0, 7.0)))
    )
    # Grow a short way into dark link recesses (not into smooth stone).
    near = np.array(Image.fromarray(strong.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(7))) > 0
    stone_like = (luma > 96) & (luma < 175) & (contrast < 4.0) & (sat < 22) & (~gold) & (~pad_body)
    # Darker grainy stone under the lower chains (not glossy, not mid-grey).
    dim_stone = (luma > 38) & (luma < 120) & (contrast < 6.0) & (sat < 28) & (~gold) & (~pad_body) & (~shackle) & (yy > 560)

    # Smooth glossy stone highlight (the bright "wings" on the top face).
    glossy = (luma > 110) & (luma < 215) & (contrast < 7.0) & (sat < 26) & (~gold) & (~pad_body) & (~shackle)
    dark_near = (
        near
        & (~navy)
        & (in_x_wide | in_center | pad_body | shackle)
        & (luma < 140)
        & (sat < 58)
        & (~stone_like)
        & (~glossy)
        & (~dim_stone)
    )
    mask = strong | dark_near
    a = Image.fromarray(mask.astype(np.uint8) * 255)
    a = a.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    mask = np.array(a) > 127
    mask = mask & (in_x_wide | in_center | pad_body | shackle) & (~navy)

    # Anything that still looks like stone or glossy highlight is removed,
    # unless it sits right on a strong metal edge (chain rim).
    near_strong = np.array(Image.fromarray(strong.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(5))) > 0
    reject = (stone_like | glossy | dim_stone) & (~pad_body) & (~gold) & (~shackle)
    # allow a 1-2px rim so links stay closed
    reject = reject & (~(near_strong & (contrast > 8)))
    mask = (mask & (~reject)) | pad_body | gold | shackle
    mask = mask & (~navy)

    # Punch true link holes (stone visible through the ring).
    hole = stone_like & mask & (~pad_body) & (~gold)
    hole = np.array(Image.fromarray(hole.astype(np.uint8) * 255).filter(ImageFilter.MinFilter(3))) > 0
    mask = (mask & (~hole)) | pad_body | gold

    # Drop isolated crumbs (keep padlock even if it were small).
    mask = _drop_islands(mask, min_area=90) | pad_body | gold

    # Feathered alpha.
    alpha = (
        np.array(Image.fromarray(mask.astype(np.uint8) * 255).filter(ImageFilter.GaussianBlur(0.7))).astype(np.float32)
        / 255.0
    )
    alpha = np.where(alpha < 0.05, 0, alpha)
    alpha = np.where(pad_body | gold, np.maximum(alpha, 0.98), alpha)

    # Tight, texture-free contact shadow (a couple of pixels, no leftover stone).
    dil = (
        np.array(
            Image.fromarray(mask.astype(np.uint8) * 255)
            .filter(ImageFilter.MaxFilter(3))
            .filter(ImageFilter.GaussianBlur(1.15))
        ).astype(np.float32)
        / 255.0
    )
    shadow = np.clip(dil - alpha, 0, 1) * 0.45
    shadow = np.where(navy, 0, shadow)

    a_out = np.clip(alpha + shadow, 0, 1)
    w_m = alpha
    w_s = shadow * (1 - alpha)
    w_sum = np.maximum(w_m + w_s, 1e-6)
    shadow_rgb = np.array([18, 18, 22], np.float32)
    rgb = (im * w_m[:, :, None] + shadow_rgb * w_s[:, :, None]) / w_sum[:, :, None]

    rgba = np.zeros((h, w, 4), np.float32)
    rgba[:, :, :3] = rgb
    rgba[:, :, 3] = a_out * 255
    return np.clip(rgba, 0, 255).astype(np.uint8), mask


def crop_stone(rgba: np.ndarray) -> Image.Image:
    x0, y0, x1, y1 = STONE
    tile = Image.fromarray(rgba).crop((x0, y0, x1, y1))
    return tile.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def wrap_atlas(rgba: np.ndarray) -> Image.Image:
    """2x2 atlas of the four corner end-links, each 512²."""
    # Corner crops in the full concept, a bit outside the stone AABB so the
    # wrapping last link is included. Order: TL, TR / BL, BR.
    s = 200
    # STONE (190,182)-(827,819). Corners of the stone:
    corners = {
        "tl": (190 - 20, 182 - 20),
        "tr": (827 - s + 20, 182 - 20),
        "bl": (190 - 20, 819 - s + 20),
        "br": (827 - s + 20, 819 - s + 20),
    }
    atlas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    full = Image.fromarray(rgba)
    # Clamp
    def take(x, y):
        x = int(np.clip(x, 0, 1024 - s))
        y = int(np.clip(y, 0, 1024 - s))
        return full.crop((x, y, x + s, y + s)).resize((512, 512), Image.Resampling.LANCZOS)

    atlas.paste(take(*corners["tl"]), (0, 0))
    atlas.paste(take(*corners["tr"]), (512, 0))
    atlas.paste(take(*corners["bl"]), (0, 512))
    atlas.paste(take(*corners["br"]), (512, 512))
    return atlas


def preview(img: Image.Image, bg, path: Path):
    if img.mode != "RGBA":
        img.convert("RGB").save(path)
        return
    out = bg.convert("RGBA") if isinstance(bg, Image.Image) else Image.new("RGBA", img.size, bg)
    if out.size != img.size:
        out = out.resize(img.size, Image.Resampling.NEAREST)
    out.alpha_composite(img)
    out.convert("RGB").save(path)


def main():
    if not SRC.exists():
        raise SystemExit(f"missing concept: {SRC}")
    raw = np.array(Image.open(SRC).convert("RGB"), np.float32)
    rgba, mask = cutout(raw)
    Image.fromarray(rgba).save(PREVIEW / "lock-cutout-full.png")
    Image.fromarray((mask.astype(np.uint8) * 255)).save(PREVIEW / "lock-mask.png")

    decal = crop_stone(rgba)
    wraps = wrap_atlas(rgba)

    OUT.mkdir(parents=True, exist_ok=True)
    PREVIEW.mkdir(parents=True, exist_ok=True)
    decal.save(OUT / "lock-decal.webp", "WEBP", lossless=True, quality=100, method=4)
    wraps.save(OUT / "lock-wrap.webp", "WEBP", lossless=True, quality=100, method=4)
    print("lock-decal", OUT / "lock-decal.webp", (OUT / "lock-decal.webp").stat().st_size, decal.size)
    print("lock-wrap", OUT / "lock-wrap.webp", (OUT / "lock-wrap.webp").stat().st_size, wraps.size)

    navy = (7, 16, 36, 255)
    grey = (128, 128, 134, 255)
    # checker
    chk = np.zeros((SIZE, SIZE, 3), np.uint8)
    yy, xx = np.ogrid[:SIZE, :SIZE]
    t = ((xx // 32) + (yy // 32)) % 2
    chk[t == 0] = (36, 38, 44)
    chk[t == 1] = (86, 88, 96)
    preview(decal, navy, PREVIEW / "lock-decal-navy.png")
    preview(decal, grey, PREVIEW / "lock-decal-grey.png")
    preview(decal, Image.fromarray(chk), PREVIEW / "lock-decal-checker.png")
    preview(wraps, navy, PREVIEW / "lock-wrap-navy.png")
    preview(Image.fromarray(rgba).resize((768, 768), Image.Resampling.LANCZOS), navy, PREVIEW / "lock-full-navy.png")


if __name__ == "__main__":
    main()
