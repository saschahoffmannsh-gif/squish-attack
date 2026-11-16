#!/usr/bin/env python3
"""Build tileable squish materials and clean symbol decals from the concept.

Outputs (1024, sharp, sRGB, seamless where tiled):
  ice-albedo, stone-albedo, black-albedo  — tileable, wrap all sides
  ice-decal, lock-decal, bomb-decal, joker-decal — RGBA, symbol only
  band — tileable brushed-metal strip (U along the strap, V across it)
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


# --- seamless noise ---------------------------------------------------
def periodic_value_noise(size, cells, seed):
    rng = np.random.RandomState(int(seed) & 0xFFFFFFFF)
    grid = rng.rand(cells, cells).astype(np.float32)
    ys = np.arange(size) * (cells / size)
    xs = np.arange(size) * (cells / size)
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    fy = (ys - y0)[:, None]
    fx = (xs - x0)[None, :]
    fy = fy * fy * (3 - 2 * fy)
    fx = fx * fx * (3 - 2 * fx)
    y0m, y1m = y0 % cells, (y0 + 1) % cells
    x0m, x1m = x0 % cells, (x0 + 1) % cells
    n00 = grid[y0m][:, x0m]
    n10 = grid[y1m][:, x0m]
    n01 = grid[y0m][:, x1m]
    n11 = grid[y1m][:, x1m]
    return n00 * (1 - fy) * (1 - fx) + n10 * fy * (1 - fx) + n01 * (1 - fy) * fx + n11 * fy * fx


def fbm_seamless(size, cell_list, amps=None, seed=1):
    amps = amps or [0.5 ** i for i in range(len(cell_list))]
    acc = np.zeros((size, size), np.float32)
    s = 0.0
    for i, (cells, a) in enumerate(zip(cell_list, amps)):
        acc += a * periodic_value_noise(size, max(2, int(cells)), seed + i * 17)
        s += a
    return acc / max(s, 1e-6)


# --- materials --------------------------------------------------------
def ice_albedo(src: np.ndarray) -> Image.Image:
    """Smooth translucent icy blue with sparse wispy frost — no dense speckles."""
    n_broad = fbm_seamless(SIZE, [8, 16, 32], [1.0, 0.45, 0.2], 21)
    n_wisp = fbm_seamless(SIZE, [12, 24, 48], [1.0, 0.5, 0.22], 44)
    n_fine = fbm_seamless(SIZE, [64, 128], [1.0, 0.4], 77)
    # Concept inner ice ~ (80, 140, 195), lighter veins ~ (140, 185, 225)
    lo = np.array([72, 128, 186], np.float32)
    mid = np.array([96, 158, 210], np.float32)
    hi = np.array([150, 198, 230], np.float32)
    frost = np.array([220, 238, 250], np.float32)
    t = n_broad[..., None]
    base = lo * (1 - t) + mid * t
    base = base + (hi - mid) * np.clip((n_broad - 0.58) / 0.35, 0, 1)[..., None] * 0.55
    # sparse, larger frost wisps — not salt-and-pepper
    wisp = np.clip((n_wisp - 0.62) / 0.22, 0, 1)
    wisp = wisp * wisp * (3 - 2 * wisp)
    base = base * (1 - wisp[..., None] * 0.35) + frost * wisp[..., None] * 0.7 + base * wisp[..., None] * 0.3
    # tiny sparkle, very sparse
    spark = (n_fine > 0.88).astype(np.float32) * np.clip((n_wisp - 0.5) * 2, 0, 1)
    base = base + spark[..., None] * 18
    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")
    return ImageEnhance.Color(img).enhance(1.06)


def stone_albedo(src: np.ndarray) -> Image.Image:
    """Fine, non-repeating granite — subtle cool grey, no quilted patches."""
    # Colour from the concept top-face stone (lit mid-grey, cool).
    mid = np.array([152, 154, 162], np.float32)
    # Very fine grain + barely-there broad variation so one tile never shows a repeat.
    n_fine = fbm_seamless(SIZE, [16, 32, 64, 128, 256], [1.0, 0.7, 0.45, 0.28, 0.16], 31)
    n_micro = fbm_seamless(SIZE, [128, 256], [1.0, 0.6], 92)
    n_broad = fbm_seamless(SIZE, [6, 12], [1.0, 0.4], 15)
    base = mid + (n_fine[..., None] - 0.5) * 16.0
    base = base + (n_broad[..., None] - 0.5) * 6.0
    # granite mineral flecks: a few lighter mica, a few darker pores
    mica = np.clip((n_micro - 0.74) / 0.12, 0, 1)
    pore = np.clip((0.28 - n_micro) / 0.12, 0, 1)
    base = base + mica[..., None] * np.array([18, 18, 16], np.float32)
    base = base - pore[..., None] * np.array([20, 20, 18], np.float32)
    # slight cool/warm fleck
    cool = (fbm_seamless(SIZE, [48, 96], [1.0, 0.4], 61) - 0.5)[..., None]
    base = base + cool * np.array([-1, 0, 3], np.float32)
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")


def black_albedo(src: np.ndarray) -> Image.Image:
    """Glossy black gel: deep black with soft dark reflections, no blotchy tiles."""
    n_broad = fbm_seamless(SIZE, [5, 10, 20], [1.0, 0.5, 0.2], 41)
    n_sheen = fbm_seamless(SIZE, [8, 16], [1.0, 0.4], 18)
    yy, xx = np.ogrid[:SIZE, :SIZE]
    # soft anisotropic reflection streaks (like brushed/glossy black plastic)
    streak = np.sin(xx * (2 * np.pi * 3 / SIZE) + n_sheen * 2.2) * 0.5 + 0.5
    lo = np.array([10, 11, 14], np.float32)
    mid = np.array([22, 24, 30], np.float32)
    hi = np.array([48, 50, 58], np.float32)
    t = n_broad
    base = lo * (1 - t[..., None]) + mid * t[..., None]
    base = base + (hi - mid) * np.clip((n_broad - 0.62) / 0.30, 0, 1)[..., None] * 0.7
    base = base + (streak[..., None] - 0.5) * 8
    # a slightly lifted mid so the gel isn't crushed to pure black
    base = base * 0.92 + mid * 0.08
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")


def metal_band(src: np.ndarray) -> Image.Image:
    """Even brushed steel — highlight/shadow are added in the shader."""
    h, w = 256, SIZE
    yy = np.linspace(-1, 1, h, dtype=np.float32)
    cells_u = 16
    rng = np.random.RandomState(19)
    grain_l = rng.rand(h, cells_u).astype(np.float32)
    u = np.arange(w) * (cells_u / w)
    u0 = np.floor(u).astype(int)
    fu = u - u0
    fu = fu * fu * (3 - 2 * fu)
    g = grain_l[:, u0 % cells_u] * (1 - fu) + grain_l[:, (u0 + 1) % cells_u] * fu
    fine = rng.rand(h, cells_u * 4).astype(np.float32)
    u2 = np.arange(w) * (cells_u * 4 / w)
    u20 = np.floor(u2).astype(int)
    fu2 = u2 - u20
    fu2 = fu2 * fu2 * (3 - 2 * fu2)
    g2 = fine[:, u20 % (cells_u * 4)] * (1 - fu2) + fine[:, (u20 + 1) % (cells_u * 4)] * fu2
    g = g * 0.55 + g2 * 0.45
    mid = np.array([138, 142, 152], np.float32)
    lo = np.array([78, 80, 88], np.float32)
    edge = np.clip((np.abs(yy) - 0.70) / 0.30, 0, 1)
    base = mid + (g[..., None] - 0.5) * 28
    base = base * (1 - edge[:, None, None] * 0.35) + lo * edge[:, None, None] * 0.5
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")



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


def place_decal_at(tile: Image.Image, cx, cy, half) -> Image.Image:
    """Square crop of side 2*half centred on (cx, cy), resized to DECAL."""
    arr = np.array(tile)
    h, w = arr.shape[:2]
    x0, y0 = int(round(cx - half)), int(round(cy - half))
    x1, y1 = int(round(cx + half)), int(round(cy + half))
    side = max(x1 - x0, y1 - y0)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sx0, sy0 = max(0, x0), max(0, y0)
    sx1, sy1 = min(w, x0 + side), min(h, y0 + side)
    dx, dy = sx0 - x0, sy0 - y0
    piece = Image.fromarray(arr[sy0:sy1, sx0:sx1])
    canvas.paste(piece, (dx, dy), piece)
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
    hub = (np.sqrt(((xx - cx) / (w * 0.045)) ** 2 + ((yy - cy) / (h * 0.045)) ** 2) < 1).astype(np.uint8) * 255
    a = np.maximum(np.array(aimg), hub)
    # tighten: drop scattered frost crumbs around the flake
    a = np.array(Image.fromarray(a).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(3)))
    a = np.array(Image.fromarray(a).filter(ImageFilter.GaussianBlur(radius=0.55)), np.float32) / 255.0
    a = np.where(r > 1.02, 0, a)
    # drop isolated frost crumbs (low-alpha specks away from the arms)
    solidish = a > 0.35
    near = np.array(Image.fromarray((solidish.astype(np.uint8)*255)).filter(ImageFilter.MaxFilter(7)), np.float32)/255.0
    a = np.where((a < 0.4) & (near < 0.5), 0, a)
    # slight contrast lift so the embossed edges stay crisp
    rgb = tile.copy()
    rgb = 255 - (255 - rgb) * 0.92
    rgb = rgb * 0.96 + np.array([200, 230, 245], np.float32) * 0.04
    return place_decal(_rgba(rgb, a), margin=0.10)


def lock_decal(src: np.ndarray, gold=False) -> Image.Image:
    x0, y0, x1, y1 = BODIES["bound"]
    tile = src[y0:y1, x0:x1].astype(np.float32)
    h, w, _ = tile.shape
    r, g, bch = tile[:, :, 0], tile[:, :, 1], tile[:, :, 2]
    luma = r * 0.3 + g * 0.59 + bch * 0.11
    yy, xx = np.ogrid[:h, :w]
    cx, cy = w * 0.50, h * 0.50
    fx, fy = cx, h * 0.54
    dx = np.maximum(0, np.abs(xx - fx) - w * 0.135)
    dy = np.maximum(0, np.abs(yy - fy) - h * 0.135)
    face_r = np.sqrt(dx * dx + dy * dy) / (w * 0.055)
    face_m = face_r < 1.0
    blue = (bch > r + 12) & (bch > 60)
    goldm = (r > g + 6) & (r > bch + 16) & (r > 80)
    keyhole = (luma < 55) & (np.abs(xx - fx) < w * 0.075) & (np.abs(yy - fy) < h * 0.11)
    face_keep = face_m & (blue | goldm | keyhole | ((luma > 40) & (face_r < 0.85)))

    # Shackle: two legs + a full circular arch, hole punched out.
    leg_x = w * 0.145
    leg_w = w * 0.058
    leg_top, leg_bot = h * 0.24, h * 0.52
    legs = (
        ((np.abs(xx - (cx - leg_x)) < leg_w) | (np.abs(xx - (cx + leg_x)) < leg_w))
        & (yy > leg_top)
        & (yy < leg_bot)
    )
    arch_cx, arch_cy = cx, h * 0.295
    ro, ri = w * 0.205, w * 0.118
    da = np.sqrt((xx - arch_cx) ** 2 + (yy - arch_cy) ** 2)
    arch = (da < ro) & (da > ri) & (yy < arch_cy + h * 0.05)
    # accept silver or slightly darker metal so the arch doesn't break
    metal = (np.abs(r - g) < 40) & (np.abs(g - bch) < 44) & (luma > 70) & (~blue) & (~goldm)
    shackle = (legs | arch) & (metal | (luma > 70))
    hole = (da < ri * 1.02) & (yy < arch_cy + h * 0.02)
    shackle = shackle & (~hole)

    mask = face_keep | shackle
    # close small gaps in the arch
    aimg = Image.fromarray((mask.astype(np.uint8) * 255))
    aimg = aimg.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    alpha = np.array(aimg.filter(ImageFilter.GaussianBlur(radius=0.45)), np.float32) / 255.0
    alpha = np.where(hole, 0, alpha)
    # keep only the intended shackle ring, the legs, and the face — no outer halo
    shackle_ok = ((da <= ro * 1.03) & (da >= ri * 0.96) & (yy < arch_cy + h * 0.06)) | legs | face_m
    alpha = np.where(shackle_ok, alpha, 0)
    dist = np.sqrt(((xx - cx) / (w * 0.26)) ** 2 + ((yy - (cy - h * 0.04)) / (h * 0.34)) ** 2)
    alpha = np.where(dist > 1.08, 0, alpha)

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
    return place_decal(_rgba(rgb, alpha), margin=0.10)


def bomb_decal(src: np.ndarray) -> Image.Image:
    """Bomb + fuse + full spark, centred on the sphere so the spark is not cropped."""
    x0, y0, x1, y1 = BODIES["bomb"]
    tile = src[y0:y1, x0:x1].astype(np.float32)
    h, w, _ = tile.shape
    r, g, bch = tile[:, :, 0], tile[:, :, 1], tile[:, :, 2]
    luma = r * 0.3 + g * 0.59 + bch * 0.11
    yy, xx = np.ogrid[:h, :w]
    cx, cy, rad = w * 0.495, h * 0.575, w * 0.255
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    sphere = d < rad * 1.04
    # Fuse / cap on the upper-right of the sphere (brown).
    fuse = (
        (yy < cy - rad * 0.20)
        & (yy > cy - rad * 1.05)
        & (xx > cx - rad * 0.05)
        & (xx < cx + rad * 1.20)
        & (d > rad * 0.55)
        & (d < rad * 1.60)
        & (r > 40)
        & (g > 22)
        & (r + g > bch + 10)
        & (~((luma < 40) & (r < 60)))
    )
    # Spark: warm / very bright, upper-right. Keep isolated rays, drop the black rim hook.
    warm = (r > g + 6) & (r > 70)
    bright = luma > 140
    spark_zone = (xx > w * 0.48) & (yy < h * 0.55) & (d > rad * 0.85)
    spark = (warm | bright) & spark_zone
    spark_a = np.array(
        Image.fromarray((spark.astype(np.uint8) * 255))
        .filter(ImageFilter.MaxFilter(5))
        .filter(ImageFilter.GaussianBlur(radius=0.8))
    ).astype(np.float32) / 255.0
    # only keep warm/bright spark, never the dark glossy hook
    spark_keep = np.clip((np.maximum(luma, (r - bch * 0.4)) - 40.0) / 40.0, 0, 1)
    spark_a = spark_a * spark_keep
    # soft warm glow around the spark (not the black tile)
    glow = (
        np.array(
            Image.fromarray(((spark_a > 0.2).astype(np.uint8) * 255)).filter(ImageFilter.GaussianBlur(radius=7))
        ).astype(np.float32)
        / 255.0
    )
    glow = glow * np.clip((r * 1.2 + g * 0.4 - bch * 0.3 - 20) / 80.0, 0, 1)

    sphere_a = np.array(
        Image.fromarray((sphere.astype(np.uint8) * 255)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(radius=0.55))
    ).astype(np.float32) / 255.0
    fuse_a = np.array(
        Image.fromarray((fuse.astype(np.uint8) * 255)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(radius=0.55))
    ).astype(np.float32) / 255.0

    alpha = np.clip(np.maximum.reduce([sphere_a, fuse_a, spark_a, glow * 0.65]), 0, 1)
    # hard reject dark non-warm pixels outside the sphere (kills the cropped black hook)
    outside = d > rad * 1.02
    dark = (luma < 70) & (r < 90) & (r < g + 25)
    alpha = np.where(outside & dark, 0, alpha)
    # also drop any leftover dark rim near the top-right canvas edge
    hook = (xx > w * 0.70) & (yy < h * 0.42) & (luma < 100) & (r < 120) & (~warm) & (spark_a < 0.55)
    alpha = np.where(hook, 0, alpha)
    # any dark sliver beyond the spark disc
    hook2 = (xx > cx + rad * 1.35) & (yy < cy - rad * 0.45) & (luma < 90) & (r < 110)
    alpha = np.where(hook2, 0, alpha)

    # drop grey/black rim fragments; keep warm orange spark rays and brown fuse
    warmish = (r > g + 8) & (r > 55)
    brown = (r > 40) & (g > 22) & (r + g > bch + 10) & (r > bch)
    keep = (~outside) | warmish | brown | (glow > 0.35)
    alpha = np.where(keep, alpha, 0)

    rgba = _rgba(tile, alpha)
    # Centre on the SPHERE, extra margin so the spark is fully inside.
    half = rad * 1.88
    img = place_decal_at(rgba, cx, cy, half)
    # Final hook wipe on the canvas: grey slivers at the far right only.
    arr = np.array(img)
    H, W = arr.shape[:2]
    rr, gg, bb, aa = arr[:,:,0].astype(np.float32), arr[:,:,1].astype(np.float32), arr[:,:,2].astype(np.float32), arr[:,:,3]
    warm2 = (rr > gg + 8) & (rr > 55)
    far = (np.arange(W)[None, :] > int(W * 0.90)) & (np.arange(H)[:, None] < int(H * 0.42))
    arr[:,:,3] = np.where(far & (~warm2), 0, aa)
    return Image.fromarray(arr)


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
        if img.mode == "RGBA":
            bg = Image.new("RGBA", img.size, (7, 16, 36, 255))
            bg.alpha_composite(img)
            bg.convert("RGB").resize((512, 512), Image.Resampling.LANCZOS).save(PREVIEW / f"{name}.png")
        else:
            img.resize((512, min(512, img.size[1])), Image.Resampling.LANCZOS).save(PREVIEW / f"{name}.png")
        print(name, dest, dest.stat().st_size, img.size, img.mode)


if __name__ == "__main__":
    main()
