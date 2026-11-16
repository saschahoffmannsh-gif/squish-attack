#!/usr/bin/env python3
"""Bake opaque, full-bleed body textures that wrap a gel via its XZ UVs.

The gel's equator maps to UV 0–1 with a corner radius of about 0.183.
A rounded-rect concept tile, scaled to that footprint and flattened onto
an opaque fill, covers the whole body including the sides — no square
backdrop, no transparent padding, no second silhouette.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "concept.jpg"
OUT = ROOT.parents[1] / "game" / "assets" / "specials"
SIZE = 1024
# Gel corner radius / width ≈ 0.34 / 1.86
GEL_RADIUS = 0.183
BODIES = {
    "ice": (54, 170, 424, 540),
    "bound": (456, 170, 822, 536),
    "bomb": (858, 170, 1224, 536),
}


def rounded_mask(w: int, h: int, radius: float) -> np.ndarray:
    yy, xx = np.ogrid[:h, :w]
    cx0, cy0, cx1, cy1 = radius, radius, w - 1 - radius, h - 1 - radius
    dx = np.where(xx < cx0, cx0 - xx, np.where(xx > cx1, xx - cx1, 0.0))
    dy = np.where(yy < cy0, cy0 - yy, np.where(yy > cy1, yy - cy1, 0.0))
    dist = np.sqrt(dx * dx + dy * dy)
    return np.clip(radius + 0.5 - dist, 0, 1).astype(np.float32)


def extract_tile(arr: np.ndarray, body: tuple[int, int, int, int], pad: int = 16) -> Image.Image:
    x0, y0, x1, y1 = body
    cx0, cy0 = max(0, x0 - pad), max(0, y0 - pad)
    cx1, cy1 = min(arr.shape[1], x1 + pad), min(arr.shape[0], y1 + pad)
    crop = arr[cy0:cy1, cx0:cx1].copy()
    h, w, _ = crop.shape
    bx0, by0, bx1, by1 = x0 - cx0, y0 - cy0, x1 - cx0, y1 - cy0
    bw, bh = bx1 - bx0, by1 - by0
    radius = 0.22 * min(bw, bh)
    body_a = np.zeros((h, w), np.float32)
    body_a[by0:by1, bx0:bx1] = rounded_mask(bw, bh, radius)
    body_soft = (
        np.array(Image.fromarray((body_a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius=3))).astype(
            np.float32
        )
        / 255.0
    )
    rgb = crop.astype(np.float32)
    corners = np.concatenate(
        [
            rgb[0:8, 0:8].reshape(-1, 3),
            rgb[0:8, -8:].reshape(-1, 3),
            rgb[-8:, 0:8].reshape(-1, 3),
            rgb[-8:, -8:].reshape(-1, 3),
        ]
    )
    bg = np.median(corners, axis=0)
    d = np.linalg.norm(rgb - bg, axis=2)
    luma = rgb @ np.array([0.3, 0.59, 0.11], np.float32)
    warm = np.clip((rgb[:, :, 0] - rgb[:, :, 2]) / 40.0, 0, 1)
    ice_glow = np.clip((rgb[:, :, 2] - bg[2]) / 50.0, 0, 1) * np.clip((luma - 30) / 40.0, 0, 1)
    key = np.clip((d - 18) / 28.0, 0, 1)
    fx = np.clip(np.maximum(warm, ice_glow), 0, 1)
    alpha = np.clip(body_soft + (1.0 - body_soft) * np.maximum(key * key, fx), 0, 1)
    navyish = (d < 22) & (luma < 50) & (warm < 0.15)
    alpha = np.where(navyish & (body_soft < 0.35), 0.0, alpha)
    alpha = (
        np.array(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius=0.6))).astype(
            np.float32
        )
        / 255.0
    )
    a = np.clip(alpha, 0, 1)[..., None]
    with np.errstate(divide="ignore", invalid="ignore"):
        fg = np.where(a > 1e-3, (rgb - bg * (1.0 - a)) / np.maximum(a, 1e-3), 0)
    fg = np.clip(fg, 0, 255)
    return Image.fromarray(np.dstack([fg, (alpha * 255)]).astype(np.uint8), "RGBA")


def rim_color(tile: Image.Image) -> tuple[int, int, int]:
    arr = np.array(tile)
    a = arr[:, :, 3]
    solid = a > 230
    if solid.sum() < 200:
        solid = a > 160
    # Pixels just inside the opaque silhouette (the material at the cube's sides).
    from PIL import ImageFilter as _F
    eroded = np.array(Image.fromarray(solid.astype(np.uint8) * 255).filter(_F.MinFilter(9))) > 128
    band = solid & (~eroded)
    if band.sum() < 80:
        band = solid
    cols = arr[:, :, :3][band]
    # Drop leftover navy: keep the brighter, less-blue-dark samples if possible.
    luma = cols.astype(np.float32) @ np.array([0.3, 0.59, 0.11])
    if (luma > 40).sum() > 40:
        cols = cols[luma > 40]
    med = np.median(cols, axis=0)
    return tuple(int(x) for x in med)


def flatten(kind: str, tile: Image.Image) -> Image.Image:
    fill = rim_color(tile)
    canvas = Image.new("RGB", (SIZE, SIZE), fill)
    # Slight radial variation so sides aren't a flat plate.
    yy, xx = np.ogrid[:SIZE, :SIZE]
    cx = cy = (SIZE - 1) / 2
    r = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / (SIZE * 0.5)
    shade = np.clip(1.0 - 0.18 * np.clip(r - 0.55, 0, 1) / 0.45, 0.7, 1.0)
    base = (np.array(canvas, np.float32) * shade[..., None]).clip(0, 255).astype(np.uint8)
    canvas = Image.fromarray(base, "RGB")

    # Scale the concept body so its rounded square matches the gel footprint.
    arr = np.array(tile)
    ys, xs = np.where(arr[:, :, 3] > 24)
    if len(xs) == 0:
        return canvas
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    cropped = tile.crop(box)
    # Almost edge-to-edge: 2px margin, gel outline provides the silhouette.
    target = SIZE - 2
    cropped = cropped.resize((target, target), Image.Resampling.LANCZOS)
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    off = (SIZE - target) // 2
    layer.paste(cropped, (off, off), cropped)
    # Feather the very edge so the fill and the concept meet without a hard square.
    a = np.array(layer.split()[-1], np.float32) / 255.0
    a = np.array(
        Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius=1.2)),
        np.float32,
    ) / 255.0
    rgba = np.array(layer)
    rgba[:, :, 3] = (a * 255).astype(np.uint8)
    layer = Image.fromarray(rgba, "RGBA")
    canvas = canvas.convert("RGBA")
    canvas.alpha_composite(layer)
    return canvas.convert("RGB")


def open_lock(bound: Image.Image) -> Image.Image:
    """Freed lock / joker: same stone and band, gold lock face (unlocked)."""
    arr = np.array(bound.convert("RGB")).astype(np.float32)
    h, w, _ = arr.shape
    yy, xx = np.ogrid[:h, :w]
    cx, cy = w / 2, h / 2
    in_lock = (np.abs(xx - cx) < w * 0.22) & (np.abs(yy - cy) < h * 0.22)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    blueish = (b > r + 18) & (b > 70) & (b > g - 5) & in_lock
    luma = r * 0.3 + g * 0.59 + b * 0.11
    gold = np.stack([luma * 1.2 + 48, luma * 0.92 + 24, luma * 0.22], axis=-1)
    mix = np.array(
        Image.fromarray((blueish.astype(np.uint8) * 255)).filter(ImageFilter.GaussianBlur(radius=1.2))
    ).astype(np.float32) / 255.0
    arr = np.clip(arr * (1 - mix[..., None]) + gold * mix[..., None], 0, 255).astype(np.uint8)
    img = Image.fromarray(arr, "RGB")
    from PIL import ImageEnhance
    return ImageEnhance.Brightness(img).enhance(1.04)



def main() -> None:
    arr = np.array(Image.open(SRC).convert("RGB"))
    OUT.mkdir(parents=True, exist_ok=True)
    tiles = {name: flatten(name, extract_tile(arr, body)) for name, body in BODIES.items()}
    tiles["joker"] = open_lock(tiles["bound"])
    for name, img in tiles.items():
        dest = OUT / f"{name}.webp"
        img.save(dest, "WEBP", quality=92, method=6)
        print(name, dest, dest.stat().st_size, img.size, img.getpixel((0, 0)), img.getpixel((SIZE // 2, SIZE // 2)))


if __name__ == "__main__":
    main()
