#!/usr/bin/env python3
"""Cut ice / lock / bomb tiles from the approved concept and write game textures."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "concept.jpg"
OUT = ROOT.parents[1] / "game" / "assets" / "specials"

# Tight body boxes in the 1280x720 concept (x0, y0, x1, y1), inclusive-end exclusive.
BODIES = {
    "ice": (54, 170, 424, 540),
    "bound": (456, 170, 822, 536),
    "bomb": (858, 170, 1224, 536),
}
PAD = 14
RADIUS_RATIO = 0.22
SIZE = 1024


def rounded_mask(w: int, h: int, radius: float) -> np.ndarray:
    yy, xx = np.ogrid[:h, :w]
    cx0, cy0, cx1, cy1 = radius, radius, w - 1 - radius, h - 1 - radius
    dx = np.where(xx < cx0, cx0 - xx, np.where(xx > cx1, xx - cx1, 0.0))
    dy = np.where(yy < cy0, cy0 - yy, np.where(yy > cy1, yy - cy1, 0.0))
    dist = np.sqrt(dx * dx + dy * dy)
    return np.clip(radius + 0.5 - dist, 0, 1).astype(np.float32)


def extract(arr: np.ndarray, body: tuple[int, int, int, int], pad: int = PAD) -> Image.Image:
    x0, y0, x1, y1 = body
    cx0, cy0 = max(0, x0 - pad), max(0, y0 - pad)
    cx1, cy1 = min(arr.shape[1], x1 + pad), min(arr.shape[0], y1 + pad)
    crop = arr[cy0:cy1, cx0:cx1].copy()
    h, w, _ = crop.shape
    bx0, by0, bx1, by1 = x0 - cx0, y0 - cy0, x1 - cx0, y1 - cy0
    bw, bh = bx1 - bx0, by1 - by0
    radius = RADIUS_RATIO * min(bw, bh)
    body_a = np.zeros((h, w), np.float32)
    body_a[by0:by1, bx0:bx1] = rounded_mask(bw, bh, radius)
    body_soft = (
        np.array(Image.fromarray((body_a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius=4))).astype(
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
    outside = 1.0 - body_soft
    alpha = np.clip(body_soft + outside * np.maximum(key * key, fx), 0, 1)
    navyish = (d < 22) & (luma < 50) & (warm < 0.15)
    alpha = np.where(navyish & (body_soft < 0.35), 0.0, alpha)
    alpha = (
        np.array(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius=0.6))).astype(
            np.float32
        )
        / 255.0
    )

    # Despill: edge pixels were antialiased against the navy backdrop.
    a = np.clip(alpha, 0, 1)[..., None]
    with np.errstate(divide="ignore", invalid="ignore"):
        fg = np.where(a > 1e-3, (rgb - bg * (1.0 - a)) / np.maximum(a, 1e-3), 0)
    fg = np.clip(fg, 0, 255)
    rgba = np.dstack([fg, (alpha * 255)]).astype(np.uint8)
    img = Image.fromarray(rgba, "RGBA")

    side = max(bw, bh) + 2 * pad
    bcx, bcy = (bx0 + bx1) / 2, (by0 + by1) / 2
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.alpha_composite(img, (int(round(side / 2 - bcx)), int(round(side / 2 - bcy))))
    return sq.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def main() -> None:
    arr = np.array(Image.open(SRC).convert("RGB"))
    OUT.mkdir(parents=True, exist_ok=True)
    for name, body in BODIES.items():
        img = extract(arr, body)
        webp = OUT / f"{name}.webp"
        img.save(webp, "WEBP", quality=92, method=6, lossless=False)
        print(name, webp, webp.stat().st_size)


if __name__ == "__main__":
    main()
