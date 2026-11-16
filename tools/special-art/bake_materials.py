#!/usr/bin/env python3
"""Build tileable squish materials and clean symbol decals from the concept.

Outputs (1024, sharp, sRGB):
  ice-albedo, stone-albedo, black-albedo  — tileable, wrap all sides
  ice-decal, lock-decal, bomb-decal, joker-decal — RGBA, symbol only
  band — tileable horizontal metal strip (U wraps, V is across the band)
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageEnhance

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "concept.jpg"
OUT = ROOT.parents[1] / "game" / "assets" / "specials"
PREVIEW = ROOT / "material-preview"
SIZE = 1024
DECAL = 1024
BODIES = {
    "ice": (53, 165, 425, 537),
    "bound": (456, 171, 822, 537),
    "bomb": (857, 170, 1224, 537),
}


# --- noise ------------------------------------------------------------
def _hash2(i, j):
    n = np.sin(i * 127.1 + j * 311.7) * 43758.5453
    return n - np.floor(n)


def value_noise(h, w, period, seed=0.0):
    gy, gx = int(np.ceil(h / period)) + 2, int(np.ceil(w / period)) + 2
    rng = np.random.RandomState(int(seed * 1000 + period) & 0xFFFFFFFF)
    grid = rng.rand(gy, gx)
    ys = np.arange(h)[:, None] / period
    xs = np.arange(w)[None, :] / period
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    fy = ys - y0
    fx = xs - x0
    # fade
    fy = fy * fy * (3 - 2 * fy)
    fx = fx * fx * (3 - 2 * fx)
    n00 = grid[y0, x0]
    n10 = grid[y0 + 1, x0]
    n01 = grid[y0, x0 + 1]
    n11 = grid[y0 + 1, x0 + 1]
    return n00 * (1 - fy) * (1 - fx) + n10 * fy * (1 - fx) + n01 * (1 - fy) * fx + n11 * fy * fx


def fbm(h, w, periods, amps=None, seed=1.0):
    amps = amps or [0.5 ** i for i in range(len(periods))]
    acc = np.zeros((h, w), np.float32)
    s = 0.0
    for p, a in zip(periods, amps):
        acc += a * value_noise(h, w, p, seed + p).astype(np.float32)
        s += a
    return acc / max(s, 1e-6)


def make_seamless_from_patch(patch: np.ndarray, size: int) -> np.ndarray:
    """Tile a photo patch to `size` and blend opposite edges so it wraps."""
    if patch.dtype != np.uint8:
        patch = np.clip(patch, 0, 255).astype(np.uint8)
    img = Image.fromarray(patch)
    # scale so the patch covers a bit more than half, then tile
    side = max(patch.shape[0], patch.shape[1])
    tiled = Image.new("RGB", (size * 2, size * 2))
    src = img.resize((size, size), Image.Resampling.LANCZOS)
    for y in (0, size):
        for x in (0, size):
            tiled.paste(src, (x, y))
    arr = np.array(tiled, np.float32)
    # roll-blend to hide seams (classic offset + gradient cross)
    rolled = np.roll(np.roll(arr, size // 2, 0), size // 2, 1)
    yy, xx = np.ogrid[: arr.shape[0], : arr.shape[1]]
    # distance to the mid seams of the rolled image (where original edges sit)
    cy, cx = arr.shape[0] // 2, arr.shape[1] // 2
    wy = 1.0 - np.clip(np.abs(yy - cy) / (size * 0.22), 0, 1)
    wx = 1.0 - np.clip(np.abs(xx - cx) / (size * 0.22), 0, 1)
    w = np.maximum(wx, wy)[..., None]
    w = w * w * (3 - 2 * w)
    mix = arr * (1 - w) + rolled * w
    # take the centre square after the roll (now seamless)
    y0, x0 = size // 2, size // 2
    out = mix[y0 : y0 + size, x0 : x0 + size]
    return np.clip(out, 0, 255).astype(np.uint8)


def crop_body(arr, box, pad=8):
    x0, y0, x1, y1 = box
    return arr[y0:y1, x0:x1].copy()


# --- materials --------------------------------------------------------
def ice_albedo(src: np.ndarray) -> Image.Image:
    x0, y0, x1, y1 = BODIES["ice"]
    tile = src[y0:y1, x0:x1].astype(np.float32)
    h, w, _ = tile.shape
    # Smooth inner ice (not the snowflake, not the frosty rim).
    yy, xx = np.ogrid[:h, :w]
    cy, cx = h * 0.49, w * 0.50
    r = np.sqrt(((xx - cx) / (w * 0.34)) ** 2 + ((yy - cy) / (h * 0.34)) ** 2)
    # rounded-rect interior, inset from the rim
    rx = np.maximum(0.0, np.abs((xx + 0.5) / w * 2 - 1) - 0.55)
    ry = np.maximum(0.0, np.abs((yy + 0.5) / h * 2 - 1) - 0.55)
    rim = np.sqrt(rx * rx + ry * ry)
    inner = (r > 1.08) & (rim < 0.16)
    samples = tile[inner]
    if samples.size < 100:
        samples = tile[(r > 1.1) & (r < 1.4)]
    mid = np.median(samples, axis=0)
    lo = np.percentile(samples, 20, axis=0)
    hi = np.percentile(samples, 85, axis=0)
    n1 = fbm(SIZE, SIZE, [96, 48, 24, 12, 6], [1, 0.55, 0.3, 0.16, 0.08], 2.1)
    n2 = fbm(SIZE, SIZE, [40, 16, 8], [1, 0.45, 0.2], 7.7)
    spark = (fbm(SIZE, SIZE, [7, 3], [1, 0.5], 11.0) > 0.82).astype(np.float32)
    t = n1[..., None]
    base = lo * (1 - t) + mid * t
    base = base + (hi - mid) * np.clip((n1 - 0.62) / 0.35, 0, 1)[..., None]
    frost = np.array([230, 244, 252], np.float32)
    crust = np.clip((n2 - 0.58) / 0.28, 0, 1)[..., None]
    base = base * (1 - crust * 0.28) + frost * crust * 0.85 + base * crust * 0.15
    base = base + spark[..., None] * 22
    # very slight photo grain from a tiny inner patch, colour-matched
    py0, py1 = int(h * 0.62), int(h * 0.74)
    px0, px1 = int(w * 0.14), int(w * 0.28)
    patch = tile[py0:py1, px0:px1]
    photo = make_seamless_from_patch(patch, SIZE).astype(np.float32)
    photo = photo * (mid / (np.median(photo.reshape(-1, 3), axis=0) + 1e-3))
    mix = 0.78 * base + 0.22 * photo
    img = Image.fromarray(np.clip(mix, 0, 255).astype(np.uint8), "RGB")
    return ImageEnhance.Color(img).enhance(1.05)


def stone_albedo(src: np.ndarray) -> Image.Image:
    x0, y0, x1, y1 = BODIES["bound"]
    tile = src[y0:y1, x0:x1].astype(np.float32)
    h, w, _ = tile.shape
    corners = [
        tile[int(h * 0.07) : int(h * 0.20), int(w * 0.10) : int(w * 0.28)],
        tile[int(h * 0.07) : int(h * 0.20), int(w * 0.72) : int(w * 0.90)],
        tile[int(h * 0.80) : int(h * 0.93), int(w * 0.10) : int(w * 0.28)],
        tile[int(h * 0.80) : int(h * 0.93), int(w * 0.72) : int(w * 0.90)],
    ]
    # drop any leftover gold/blue pixels
    clean = []
    for p in corners:
        r, g, b = p[:, :, 0], p[:, :, 1], p[:, :, 2]
        ok = ~((b > r + 12) | ((r > g + 10) & (r > b + 16)))
        if ok.any():
            clean.append(p[ok])
        # also keep the patch itself if mostly stone
        if ok.mean() > 0.85:
            q = p.copy()
            q[~ok] = np.median(p[ok], axis=0)
            clean_patch = q
        else:
            clean_patch = None
        corners_ok = clean
    samples = np.concatenate(clean, axis=0) if clean else tile.reshape(-1, 3)
    mid = np.median(samples, axis=0)
    lo = np.percentile(samples, 15, axis=0)
    hi = np.percentile(samples, 88, axis=0)
    # stitch cleaned corner patches for photo grain
    def prep(p):
        r, g, b = p[:, :, 0], p[:, :, 1], p[:, :, 2]
        ok = ~((b > r + 12) | ((r > g + 10) & (r > b + 16)))
        q = p.copy()
        q[~ok] = mid
        return np.array(Image.fromarray(q.astype(np.uint8)).resize((160, 120)))
    ph = np.concatenate([np.concatenate([prep(corners[0]), prep(corners[1])], 1),
                         np.concatenate([prep(corners[2]), prep(corners[3])], 1)], 0)
    photo = make_seamless_from_patch(ph, SIZE).astype(np.float32)
    photo = photo * (mid / (np.median(photo.reshape(-1, 3), axis=0) + 1e-3))
    n1 = fbm(SIZE, SIZE, [96, 48, 24, 12, 6], [1, 0.55, 0.3, 0.18, 0.1], 3.3)
    pits = fbm(SIZE, SIZE, [16, 8, 4], [1, 0.5, 0.3], 9.2)
    t = n1[..., None]
    base = lo * (1 - t) + mid * t
    base = base + (hi - mid) * np.clip((n1 - 0.65) / 0.35, 0, 1)[..., None]
    pore = np.clip((0.36 - pits) / 0.2, 0, 1)[..., None]
    base = base * (1 - pore * 0.28)
    mix = 0.40 * base + 0.60 * photo
    return Image.fromarray(np.clip(mix, 0, 255).astype(np.uint8), "RGB")


def black_albedo(src: np.ndarray) -> Image.Image:
    # Mostly procedural glossy black — photo rivets/big sweeps would tile badly.
    n1 = fbm(SIZE, SIZE, [80, 40, 20, 10], [1, 0.5, 0.25, 0.12], 4.4)
    n2 = fbm(SIZE, SIZE, [24, 10], [1, 0.4], 14.0)
    lo = np.array([10, 11, 14], np.float32)
    mid = np.array([24, 26, 30], np.float32)
    hi = np.array([44, 46, 52], np.float32)
    t = n1[..., None]
    base = lo * (1 - t) + mid * t
    base = base + (hi - mid) * np.clip((n1 - 0.72) / 0.28, 0, 1)[..., None] * 0.45
    # faint anisotropic streaks (glossy metal)
    yy, xx = np.ogrid[:SIZE, :SIZE]
    streak = np.sin((xx * 0.035 + n2 * 8) ) * 0.5 + 0.5
    base = base + (streak[..., None] - 0.5) * 6
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")


def metal_band(src: np.ndarray) -> Image.Image:
    x0, y0, x1, y1 = BODIES["bound"]
    tile = src[y0:y1, x0:x1]
    h, w, _ = tile.shape
    by = int(h * 0.50)
    bh = max(10, int(h * 0.07))
    left = tile[by - bh : by + bh, int(w * 0.02) : int(w * 0.18)]
    right = tile[by - bh : by + bh, int(w * 0.82) : int(w * 0.98)]
    strip = np.concatenate([left, right], axis=1)
    ribbon = Image.fromarray(strip).resize((SIZE, 256), Image.Resampling.LANCZOS)
    arr = np.array(ribbon, np.float32)
    fade = 64
    wgt = np.linspace(0, 1, fade, dtype=np.float32)[None, :, None]
    left_e, right_e = arr[:, :fade], arr[:, -fade:]
    blended = right_e * (1 - wgt) + left_e * wgt
    arr[:, :fade] = blended
    arr[:, -fade:] = blended
    v = np.linspace(-1, 1, arr.shape[0], dtype=np.float32)
    edge = np.clip((np.abs(v) - 0.55) / 0.45, 0, 1)
    dark = np.array([64, 68, 74], np.float32)
    arr = arr * (1 - edge[:, None, None] * 0.4) + dark * (edge[:, None, None] * 0.3)
    hi = np.exp(-((v + 0.25) ** 2) / 0.05)[:, None, None]
    arr = arr + hi * 36
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")


# --- decals -----------------------------------------------------------
def _rgba(rgb, alpha):
    a = np.clip(alpha, 0, 1)
    out = np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def place_decal(tile: Image.Image, margin=0.10) -> Image.Image:
    """Centre the opaque symbol on a square canvas with even padding."""
    arr = np.array(tile)
    a = arr[:, :, 3]
    ys, xs = np.where(a > 12)
    if len(xs) == 0:
        return Image.new("RGBA", (DECAL, DECAL), (0, 0, 0, 0))
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    cropped = tile.crop(box)
    bw, bh = cropped.size
    side = max(bw, bh)
    pad = int(side * margin)
    canvas = Image.new("RGBA", (side + pad * 2, side + pad * 2), (0, 0, 0, 0))
    canvas.paste(cropped, (pad + (side - bw) // 2, pad + (side - bh) // 2), cropped)
    return canvas.resize((DECAL, DECAL), Image.Resampling.LANCZOS)


def snowflake_decal(src: np.ndarray) -> Image.Image:
    x0, y0, x1, y1 = BODIES["ice"]
    tile = src[y0:y1, x0:x1].astype(np.float32)
    h, w, _ = tile.shape
    yy, xx = np.ogrid[:h, :w]
    cy, cx = h * 0.485, w * 0.50
    img = Image.fromarray(tile.astype(np.uint8))
    blur = np.array(img.filter(ImageFilter.GaussianBlur(radius=18)), np.float32)
    luma = tile @ np.array([0.25, 0.45, 0.30], np.float32)
    blur_l = blur @ np.array([0.25, 0.45, 0.30], np.float32)
    rel = luma - blur_l
    r = np.sqrt(((xx - cx) / (w * 0.34)) ** 2 + ((yy - cy) / (h * 0.34)) ** 2)
    inside = r < 1.0
    alpha = np.clip((rel - 4.0) / 16.0, 0, 1) * inside
    solid = (rel > 2.0) & (r < 0.92)
    aimg = Image.fromarray((np.clip(np.maximum(alpha, solid.astype(np.float32)), 0, 1) * 255).astype(np.uint8))
    aimg = aimg.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(3))
    # fill the flake hub
    hub = (np.sqrt(((xx - cx) / (w * 0.045)) ** 2 + ((yy - cy) / (h * 0.045)) ** 2) < 1).astype(np.uint8) * 255
    a = np.maximum(np.array(aimg), hub)
    a = np.array(Image.fromarray(a).filter(ImageFilter.GaussianBlur(radius=0.7)), np.float32) / 255.0
    a = np.where(r > 1.02, 0, a)
    return place_decal(_rgba(tile, a), margin=0.08)


def lock_decal(src: np.ndarray, gold=False) -> Image.Image:
    x0, y0, x1, y1 = BODIES["bound"]
    tile = src[y0:y1, x0:x1].astype(np.float32)
    h, w, _ = tile.shape
    r, g, bch = tile[:, :, 0], tile[:, :, 1], tile[:, :, 2]
    luma = r * 0.3 + g * 0.59 + bch * 0.11
    yy, xx = np.ogrid[:h, :w]
    cx, cy = w * 0.50, h * 0.50
    # Face (blue + gold frame + dark keyhole), slightly below geometric centre.
    fx, fy = cx, h * 0.54
    face = (np.abs(xx - fx) < w * 0.195) & (np.abs(yy - fy) < h * 0.195)
    # rounded-square falloff for the face
    qx = (np.abs(xx - fx) - w * 0.13) / (w * 0.002 + 1)
    qy = (np.abs(yy - fy) - h * 0.13) / (h * 0.002 + 1)
    # simpler: colour inside a slightly generous rounded box
    dx = np.maximum(0, np.abs(xx - fx) - w * 0.135)
    dy = np.maximum(0, np.abs(yy - fy) - h * 0.135)
    face_r = np.sqrt(dx * dx + dy * dy) / (w * 0.055)
    face_m = face_r < 1.0
    blue = (bch > r + 12) & (bch > 60)
    goldm = (r > g + 6) & (r > bch + 16) & (r > 80)
    keyhole = (luma < 55) & (np.abs(xx - fx) < w * 0.075) & (np.abs(yy - fy) < h * 0.11)
    face_keep = face_m & (blue | goldm | keyhole | ((luma > 40) & (face_r < 0.85)))

    # Shackle: two legs + a circular arch, silver only, hole punched out.
    # Legs sit on top of the gold frame.
    leg_x = w * 0.145
    leg_w = w * 0.055
    leg_top, leg_bot = h * 0.25, h * 0.51
    legs = (((np.abs(xx - (cx - leg_x)) < leg_w) | (np.abs(xx - (cx + leg_x)) < leg_w))
            & (yy > leg_top) & (yy < leg_bot))
    arch_cx, arch_cy = cx, h * 0.30
    ro, ri = w * 0.198, w * 0.122
    da = np.sqrt((xx - arch_cx) ** 2 + (yy - arch_cy) ** 2)
    arch = (da < ro) & (da > ri) & (yy < arch_cy + h * 0.04)
    silver = (luma > 105) & (np.abs(r - g) < 32) & (np.abs(g - bch) < 36)
    shackle = (legs | arch) & (silver | (luma > 80))
    # punch the hole inside the arch (stone must show through)
    hole = (da < ri * 1.02) & (yy < arch_cy + h * 0.02)
    shackle = shackle & (~hole)

    mask = face_keep | shackle
    aimg = Image.fromarray((mask.astype(np.uint8) * 255))
    aimg = aimg.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    alpha = np.array(aimg.filter(ImageFilter.GaussianBlur(radius=0.6)), np.float32) / 255.0
    alpha = np.where(hole, 0, alpha)
    # discard anything far from the lock
    dist = np.sqrt(((xx - cx) / (w * 0.26)) ** 2 + ((yy - (cy - h * 0.04)) / (h * 0.34)) ** 2)
    alpha = np.where(dist > 1.12, 0, alpha)

    rgb = tile.copy()
    if gold:
        in_face = blue & face_m
        goldc = np.stack([luma * 1.15 + 48, luma * 0.92 + 24, luma * 0.22], axis=-1)
        mix = (
            np.array(Image.fromarray((in_face.astype(np.uint8) * 255)).filter(ImageFilter.GaussianBlur(radius=1.0))).astype(
                np.float32
            )
            / 255.0
        )
        rgb = rgb * (1 - mix[..., None]) + goldc * mix[..., None]
    return place_decal(_rgba(rgb, alpha), margin=0.08)


def bomb_decal(src: np.ndarray) -> Image.Image:
    x0, y0, x1, y1 = BODIES["bomb"]
    tile = src[y0:y1, x0:x1].astype(np.float32)
    h, w, _ = tile.shape
    r, g, bch = tile[:, :, 0], tile[:, :, 1], tile[:, :, 2]
    luma = r * 0.3 + g * 0.59 + bch * 0.11
    yy, xx = np.ogrid[:h, :w]
    # Sphere (the cartoon bomb), slightly right and down of centre.
    cx, cy, rad = w * 0.495, h * 0.575, w * 0.255
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    sphere = d < rad * 1.04
    # Fuse / cap on the upper-right of the sphere.
    fuse = (yy < cy - rad * 0.25) & (yy > cy - rad * 0.95) & (xx > cx) & (xx < cx + rad * 1.15) & (luma > 35) & (d < rad * 1.55)
    # Spark: warm / very bright, upper-right, keep isolated rays.
    warm = (r > g + 6) & (r > 70)
    bright = luma > 150
    spark_zone = (xx > w * 0.50) & (yy < h * 0.52)
    spark = (warm | bright) & spark_zone & (~sphere)
    # Soft-grow the spark only (rays), not the black body.
    spark_a = np.array(
        Image.fromarray((spark.astype(np.uint8) * 255)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(radius=0.9))
    ).astype(np.float32) / 255.0
    # drop dark glossy body caught around the rays
    spark_a = spark_a * np.clip((np.maximum(luma, (r - bch)) - 28.0) / 36.0, 0, 1)
    # Four rivets on the glossy body — include as part of the top symbol.
    rivets = [
        (0.22, 0.30, 0.055),
        (0.155, 0.50, 0.048),
        (0.22, 0.80, 0.050),
        (0.80, 0.80, 0.050),
        (0.84, 0.52, 0.048),
    ]
    riv = np.zeros((h, w), np.float32)
    for ux, uy, ur in rivets:
        rd = np.sqrt((xx - ux * w) ** 2 + (yy - uy * h) ** 2)
        riv = np.maximum(riv, np.clip((ur * w - rd) / 1.5 + 0.7, 0, 1))

    sphere_a = np.array(
        Image.fromarray((sphere.astype(np.uint8) * 255)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(radius=0.6))
    ).astype(np.float32) / 255.0
    fuse_a = np.array(
        Image.fromarray((fuse.astype(np.uint8) * 255)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(radius=0.6))
    ).astype(np.float32) / 255.0
    alpha = np.clip(np.maximum.reduce([sphere_a, fuse_a, spark_a]), 0, 1)
    return place_decal(_rgba(tile, alpha), margin=0.10)


def main():
    src = np.array(Image.open(SRC).convert("RGB"))
    OUT.mkdir(parents=True, exist_ok=True)
    PREVIEW.mkdir(parents=True, exist_ok=True)
    assets = {
        "ice-albedo": ice_albedo(src).convert("RGB"),
        "stone-albedo": stone_albedo(src).convert("RGB"),
        "black-albedo": black_albedo(src).convert("RGB"),
        "band": metal_band(src).convert("RGB"),
        "ice-decal": snowflake_decal(src),
        "lock-decal": lock_decal(src, gold=False),
        "joker-decal": lock_decal(src, gold=True),
        "bomb-decal": bomb_decal(src),
    }
    for name, img in assets.items():
        dest = OUT / f"{name}.webp"
        if img.mode == "RGBA":
            img.save(dest, "WEBP", lossless=True, quality=100, method=4)
        else:
            img.save(dest, "WEBP", quality=92, method=4)
        # preview on navy / checker
        if img.mode == "RGBA":
            bg = Image.new("RGBA", img.size, (7, 16, 36, 255))
            bg.alpha_composite(img)
            bg.convert("RGB").resize((512, 512), Image.Resampling.LANCZOS).save(PREVIEW / f"{name}.png")
        else:
            img.resize((512, min(512, img.size[1])), Image.Resampling.LANCZOS).save(PREVIEW / f"{name}.png")
        print(name, dest, dest.stat().st_size, img.size, img.mode)


if __name__ == "__main__":
    main()
