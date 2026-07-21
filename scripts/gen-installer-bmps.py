#!/usr/bin/env python3
"""Generate Booki NSIS/WiX installer bitmaps (24-bit BMP, no Pillow).

NSIS: header 150x57, sidebar 164x314
WiX:  banner 493x58, dialog 493x312
Palette: warm charcoal + soft sand accent (matches Booki brand, not purple AI).
"""
from __future__ import annotations

import struct
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "src-tauri" / "installer"

# Booki-ish warm dark + sand
BG = (28, 28, 30)
ACCENT = (223, 170, 117)  # #dfaa75
ACCENT_DIM = (120, 92, 64)
INK = (242, 242, 242)
MUTED = (168, 168, 168)


def clamp(v: int) -> int:
    return 0 if v < 0 else 255 if v > 255 else v


def mix(a, b, t: float):
    return tuple(clamp(int(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def write_bmp(path: Path, w: int, h: int, pixels: list[tuple[int, int, int]]) -> None:
    """pixels: row-major top→bottom RGB; BMP stores bottom→top BGR with row pad."""
    row_stride = (w * 3 + 3) & ~3
    pixel_bytes = row_stride * h
    header = 14 + 40
    data = bytearray()
    data += b"BM"
    data += struct.pack("<IHHI", header + pixel_bytes, 0, 0, header)
    data += struct.pack("<IIIHHIIIIII", 40, w, h, 1, 24, 0, pixel_bytes, 2835, 2835, 0, 0)
    pad = b"\x00" * (row_stride - w * 3)
    for y in range(h - 1, -1, -1):
        row = pixels[y * w : (y + 1) * w]
        for r, g, b in row:
            data += bytes((b, g, r))
        data += pad
    path.write_bytes(data)


def fill(w: int, h: int, color) -> list[tuple[int, int, int]]:
    return [color] * (w * h)


def setp(px, w, h, x, y, c):
    if 0 <= x < w and 0 <= y < h:
        px[y * w + x] = c


def h_of(px, w):
    return len(px) // w


def rect(px, w, x0, y0, x1, y1, c):
    h = h_of(px, w)
    for y in range(max(0, y0), min(h, y1)):
        for x in range(max(0, x0), min(w, x1)):
            px[y * w + x] = c


def soft_vignette(px, w, h, strength=0.22):
    cx, cy = w / 2, h / 2
    m = (cx * cx + cy * cy) ** 0.5 or 1
    for y in range(h):
        for x in range(w):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 / m
            t = min(1.0, d * strength)
            px[y * w + x] = mix(px[y * w + x], (0, 0, 0), t)


def soft_blob(px, w, h, cx, cy, rx, ry, color, strength=0.35):
    for y in range(h):
        for x in range(w):
            nx = (x - cx) / max(1, rx)
            ny = (y - cy) / max(1, ry)
            d = (nx * nx + ny * ny) ** 0.5
            if d >= 1:
                continue
            t = (1 - d) ** 2 * strength
            px[y * w + x] = mix(px[y * w + x], color, t)


def draw_dock_bar(px, w, h, y, x0, x1, bar_h, radius_hint=True):
    """Simple frosted dock silhouette with a few tile dots."""
    mid = (y + bar_h // 2)
    rect(px, w, x0, y, x1, y + bar_h, mix(BG, ACCENT, 0.18))
    # top sheen line
    rect(px, w, x0 + 2, y + 1, x1 - 2, y + 2, mix(INK, ACCENT, 0.15))
    # tiles
    n = 5
    gap = 4
    tw = 8
    total = n * tw + (n - 1) * gap
    sx = (x0 + x1 - total) // 2
    for i in range(n):
        tx = sx + i * (tw + gap)
        ty = mid - tw // 2
        c = mix(ACCENT, INK, 0.08 + i * 0.04)
        rect(px, w, tx, ty, tx + tw, ty + tw, c)


def make_header():
    w, h = 150, 57
    px = fill(w, h, BG)
    soft_blob(px, w, h, 30, 28, 60, 40, ACCENT_DIM, 0.28)
    soft_blob(px, w, h, 120, 10, 50, 30, ACCENT, 0.12)
    # wordmark bar
    rect(px, w, 18, 22, 78, 36, mix(BG, ACCENT, 0.22))
    rect(px, w, 22, 26, 74, 32, mix(ACCENT, INK, 0.1))
    soft_vignette(px, w, h, 0.18)
    write_bmp(OUT / "header.bmp", w, h, px)


def make_sidebar():
    w, h = 164, 314
    px = fill(w, h, BG)
    soft_blob(px, w, h, 40, 80, 90, 110, ACCENT_DIM, 0.32)
    soft_blob(px, w, h, 130, 220, 80, 90, ACCENT, 0.14)
    # dock preview near bottom-center
    draw_dock_bar(px, w, h, 230, 28, 136, 22)
    # notch pill above
    rect(px, w, 58, 208, 106, 216, mix(BG, ACCENT, 0.35))
    soft_vignette(px, w, h, 0.2)
    write_bmp(OUT / "sidebar.bmp", w, h, px)


def make_wix_banner():
    w, h = 493, 58
    px = fill(w, h, BG)
    soft_blob(px, w, h, 80, 30, 140, 50, ACCENT_DIM, 0.3)
    soft_blob(px, w, h, 400, 20, 120, 40, ACCENT, 0.1)
    rect(px, w, 24, 20, 120, 38, mix(BG, ACCENT, 0.25))
    rect(px, w, 30, 25, 114, 33, mix(ACCENT, INK, 0.12))
    soft_vignette(px, w, h, 0.15)
    write_bmp(OUT / "wix-banner.bmp", w, h, px)


def make_wix_dialog():
    w, h = 493, 312
    px = fill(w, h, BG)
    soft_blob(px, w, h, 120, 100, 180, 140, ACCENT_DIM, 0.28)
    soft_blob(px, w, h, 380, 220, 160, 120, ACCENT, 0.12)
    draw_dock_bar(px, w, h, 200, 150, 343, 26)
    rect(px, w, 210, 176, 283, 186, mix(BG, ACCENT, 0.35))
    soft_vignette(px, w, h, 0.18)
    write_bmp(OUT / "wix-dialog.bmp", w, h, px)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    make_header()
    make_sidebar()
    make_wix_banner()
    make_wix_dialog()
    print("Wrote installer BMPs to", OUT)


if __name__ == "__main__":
    main()
