#!/usr/bin/env python3
"""Extract each concept tile as a complete, sharp RGBA sprite.

The whole painted stone (rim, bevel, side, shading, frost, band, sparks)
is kept. Navy backdrop is keyed out. No rounded-rect mask that would cut
symbols or the lock band. A square 'body' box is recorded so the game can
map that body onto the squish footprint while glow/sparks may overflow.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageEnhance

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "concept.jpg"
OUT = ROOT.parents[1] / "game" / "assets" / "specials"
# Body AABB in the 1280x720 concept (inclusive-exclusive), visually fitted
# so the painted rounded stone is complete and centred. Padding is added
# around it so frost crumbs, the bomb spark and AA are not clipped.
BODIES = {
    "ice": (53, 165, 425, 537),
    "bound": (456, 171, 822, 537),
    "bomb": (857, 170, 1224, 537),
}
PAD = 28
SIZE = 2048  # body maps to the inner square; padding scales with it


def key_alpha(rgb: np.ndarray, bg: np.ndarray, body_mask: np.ndarray) -> np.ndarray:
    """Chroma-key navy, but keep every pixel inside the stone body (even black)."""
    d = np.linalg.norm(rgb.astype(np.float32) - bg, axis=2)
    luma = rgb.astype(np.float32) @ np.array([0.3, 0.59, 0.11], np.float32)
    # Soft key for anything clearly not navy (ice, stone, sparks, frost).
    chroma = np.clip((d - 14.0) / 22.0, 0, 1)
    # Warm / bright effects (bomb spark, ice glow) even when close to the edge.
    warm = np.clip((rgb[:, :, 0].astype(np.float32) - rgb[:, :, 2]) / 28.0, 0, 1)
    bright = np.clip((luma - 48.0) / 36.0, 0, 1)
    fx = np.maximum(warm, bright * (d > 10))
    alpha = np.maximum(chroma, fx)
    # Inside the fitted stone, force opaque (bomb's black rim is near navy).
    alpha = np.maximum(alpha, body_mask)
    # Kill leftover navy clearly outside the body.
    navy = (d < 16) & (luma < 42) & (warm < 0.12) & (body_mask < 0.05)
    alpha = np.where(navy, 0.0, alpha)
    alpha = (
        np.array(
            Image.fromarray((np.clip(alpha, 0, 1) * 255).astype(np.uint8)).filter(
                ImageFilter.GaussianBlur(radius=0.6)
            )
        ).astype(np.float32)
        / 255.0
    )
    # Re-assert a firm body so the blur cannot eat the rim.
    alpha = np.maximum(alpha, np.clip(body_mask, 0, 1))
    return np.clip(alpha, 0, 1)


def rounded_mask(w: int, h: int, radius: float) -> np.ndarray:
    yy, xx = np.ogrid[:h, :w]
    cx0, cy0, cx1, cy1 = radius, radius, w - 1 - radius, h - 1 - radius
    dx = np.where(xx < cx0, cx0 - xx, np.where(xx > cx1, xx - cx1, 0.0))
    dy = np.where(yy < cy0, cy0 - yy, np.where(yy > cy1, yy - cy1, 0.0))
    dist = np.sqrt(dx * dx + dy * dy)
    return np.clip(radius + 0.75 - dist, 0, 1).astype(np.float32)


def extract(arr: np.ndarray, bg: np.ndarray, box: tuple[int, int, int, int]) -> Image.Image:
    x0, y0, x1, y1 = box
    cx0, cy0 = max(0, x0 - PAD), max(0, y0 - PAD)
    cx1, cy1 = min(arr.shape[1], x1 + PAD), min(arr.shape[0], y1 + PAD)
    crop = arr[cy0:cy1, cx0:cx1].copy()
    h, w, _ = crop.shape
    bx0, by0, bx1, by1 = x0 - cx0, y0 - cy0, x1 - cx0, y1 - cy0
    bw, bh = bx1 - bx0, by1 - by0
    # Slightly generous corner radius so frost / band at the corners stay inside.
    radius = 0.20 * min(bw, bh)
    body = np.zeros((h, w), np.float32)
    body[by0:by1, bx0:bx1] = rounded_mask(bw, bh, radius)
    body = (
        np.array(Image.fromarray((body * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius=1.2))).astype(
            np.float32
        )
        / 255.0
    )
    alpha = key_alpha(crop, bg, body)
    rgb = crop.astype(np.float32)
    a = alpha[..., None]
    with np.errstate(divide="ignore", invalid="ignore"):
        fg = np.where(a > 1e-3, (rgb - bg * (1.0 - a)) / np.maximum(a, 1e-3), 0)
    fg = np.clip(fg, 0, 255)
    rgba = np.dstack([fg, alpha * 255]).astype(np.uint8)
    tile = Image.fromarray(rgba, "RGBA")
    # Place the body in a square canvas so the game can map UV 0–1 = the stone.
    # Padding around the body (as a fraction) is stored in the pixel layout:
    # body occupies the centred square of side `inner`, padding is symmetric.
    side = max(bw, bh)
    # Keep the same relative pad (PAD px) on the output square.
    pad_frac = PAD / side
    inner = int(round(SIZE / (1 + 2 * pad_frac)))
    if inner % 2:
        inner -= 1
    pad_px = (SIZE - inner) // 2
    scale = inner / side
    overflow = tile.resize((max(1, int(round(w * scale))), max(1, int(round(h * scale)))), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ox = pad_px - int(round(bx0 * scale))
    oy = pad_px - int(round(by0 * scale))
    canvas.alpha_composite(overflow, (ox, oy))
    # Drop residual navy haze in the padding: keep only a tight halo around the
    # stone plus strong effects (frost crumbs, bomb spark). No square frame.
    rgba = np.array(canvas)
    aa = rgba[:, :, 3].astype(np.float32) / 255.0
    core = np.zeros((SIZE, SIZE), np.float32)
    core[pad_px:pad_px + inner, pad_px:pad_px + inner] = rounded_mask(inner, inner, 0.20 * inner)
    halo = np.array(Image.fromarray((core * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(21))).astype(np.float32) / 255.0
    rgb = rgba[:, :, :3].astype(np.float32)
    luma = rgb @ np.array([0.3, 0.59, 0.11], np.float32)
    warm = np.clip((rgb[:, :, 0] - rgb[:, :, 2]) / 24.0, 0, 1)
    fx = ((warm > 0.35) & (luma > 40)) | ((luma > 90) & (aa > 0.08))
    keep = np.clip(np.maximum(halo, fx.astype(np.float32)), 0, 1)
    aa = aa * keep
    # Crisp-ish stone edge: fully opaque inside a slightly inset body.
    firm = np.array(Image.fromarray((core * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5))).astype(np.float32) / 255.0
    aa = np.maximum(aa, firm * (aa > 0.2))
    rgba[:, :, 3] = (np.clip(aa, 0, 1) * 255).astype(np.uint8)
    canvas = Image.fromarray(rgba, "RGBA")
    sharp = canvas.filter(ImageFilter.UnsharpMask(radius=1.6, percent=85, threshold=2))
    sharp.putalpha(canvas.split()[-1])
    return sharp, pad_px / SIZE


def open_lock(bound: Image.Image) -> Image.Image:
    """Freed lock / joker: same stone and band, gold lock face."""
    arr = np.array(bound.convert("RGBA")).astype(np.float32)
    h, w, _ = arr.shape
    yy, xx = np.ogrid[:h, :w]
    cx, cy = w / 2, h / 2
    in_lock = (np.abs(xx - cx) < w * 0.18) & (np.abs(yy - cy) < h * 0.18)
    r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
    blueish = (b > r + 18) & (b > 70) & (b > g - 5) & in_lock
    luma = r * 0.3 + g * 0.59 + b * 0.11
    gold = np.stack([luma * 1.2 + 48, luma * 0.92 + 24, luma * 0.22, a], axis=-1)
    mix = (
        np.array(Image.fromarray((blueish.astype(np.uint8) * 255)).filter(ImageFilter.GaussianBlur(radius=1.4))).astype(
            np.float32
        )
        / 255.0
    )
    out = np.clip(arr * (1 - mix[..., None]) + gold * mix[..., None], 0, 255).astype(np.uint8)
    img = Image.fromarray(out, "RGBA")
    return ImageEnhance.Brightness(img).enhance(1.04)


def main() -> None:
    src = Image.open(SRC).convert("RGB")
    arr = np.array(src)
    bg = np.median(
        np.concatenate(
            [
                arr[0:16, 0:16].reshape(-1, 3),
                arr[0:16, -16:].reshape(-1, 3),
                arr[-16:, 0:16].reshape(-1, 3),
                arr[-16:, -16:].reshape(-1, 3),
            ]
        ),
        axis=0,
    ).astype(np.float32)
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {}
    tiles = {}
    for name, box in BODIES.items():
        img, pad = extract(arr, bg, box)
        tiles[name] = img
        meta[name] = pad
        dest = OUT / f"{name}.webp"
        img.save(dest, "WEBP", lossless=True, quality=100, method=4)
        a = np.array(img)[:, :, 3]
        print(name, dest, dest.stat().st_size, img.size, "pad", round(pad, 4), "opaque", int((a > 8).sum()))
    joker = open_lock(tiles["bound"])
    dest = OUT / "joker.webp"
    joker.save(dest, "WEBP", lossless=True, quality=100, method=4)
    print("joker", dest, dest.stat().st_size)
    (ROOT / "sprite-pad.txt").write_text("\n".join(f"{k} {v:.6f}" for k, v in meta.items()) + "\n")
    # Also write preview-sized concept cutouts (on navy) for the v3 composites.
    preview = ROOT / "concept-cutouts"
    preview.mkdir(exist_ok=True)
    navy = (7, 16, 36, 255)
    for name, img in {**tiles, "joker": joker}.items():
        bgim = Image.new("RGBA", img.size, navy)
        bgim.alpha_composite(img)
        bgim.convert("RGB").save(preview / f"{name}.png")


if __name__ == "__main__":
    main()
