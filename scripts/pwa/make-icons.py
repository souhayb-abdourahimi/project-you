"""Generates the web/PWA icons (public/icons/*, assets/images/favicon.png) from one drawing.

Web only: the native icons (app.json ios/android) are not touched.
Run: python3 scripts/pwa/make-icons.py  (needs Pillow)
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "icons"
SS = 4  # supersampling factor for smooth edges

# Brand blue (theme primary #1A5CF5) to a deeper shade.
TOP = (46, 112, 255)
BOTTOM = (18, 66, 196)


def gradient(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (0.7 * y + 0.3 * x) / size
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM))
    return img


def mark(draw: ImageDraw.ImageDraw, size: int, scale: float) -> None:
    """A rising progress line ending on a dot, centred, `scale` = share of the canvas it spans."""
    pts = [(0.0, 0.82), (0.33, 0.48), (0.56, 0.68), (1.0, 0.16)]
    span = size * scale
    off = (size - span) / 2
    xy = [(off + x * span, off + y * span) for x, y in pts]
    width = round(span * 0.13)
    draw.line(xy, fill="white", width=width, joint="curve")
    r = width / 2
    for x, y in xy[:-1]:
        draw.ellipse((x - r, y - r, x + r, y + r), fill="white")
    ex, ey = xy[-1]
    dot = width * 0.95
    draw.ellipse((ex - dot, ey - dot, ex + dot, ey + dot), fill="white")


def icon(size: int, scale: float, rounded: bool) -> Image.Image:
    big = size * SS
    img = gradient(big).convert("RGBA")
    mark(ImageDraw.Draw(img), big, scale)
    if rounded:
        mask = Image.new("L", (big, big), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, big - 1, big - 1), radius=big * 0.22, fill=255)
        img.putalpha(mask)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    # "any" icons: full bleed square, the platform applies its own shape.
    icon(192, 0.56, False).save(OUT / "icon-192.png", optimize=True)
    icon(512, 0.56, False).save(OUT / "icon-512.png", optimize=True)
    # Maskable: the mark stays well inside the 80 % safe zone.
    icon(512, 0.46, False).save(OUT / "icon-maskable-512.png", optimize=True)
    # iOS home screen: opaque, square, iOS rounds the corners itself.
    icon(180, 0.56, False).convert("RGB").save(OUT / "apple-touch-icon.png", optimize=True)
    # Browser tab.
    icon(48, 0.62, True).save(ROOT / "assets" / "images" / "favicon.png", optimize=True)


if __name__ == "__main__":
    main()
