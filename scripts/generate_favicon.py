"""Render the raster favicon formats from the geometry in favicon.svg.

Browsers request /favicon.ico by name whether or not the page links one, so a
site without the file answers that request with a 404 on every cold load. The
SVG covers current browsers, the .ico answers the unsolicited request and is
what Windows uses for pinned shortcuts, and the PNG is what iOS copies when a
page is added to the home screen.

The mark is a pulse trace in the emerald of the live status dot in
ProductHeader.tsx, on the near-black the document body uses.

There is no SVG rasteriser in the project's environment, so the coordinates
below are a hand port of the path in dashboard/public/favicon.svg rather than a
render of it. The two have to be edited together, and
tests/test_favicon.py fails if they drift apart.

    python scripts/generate_favicon.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

# Written next to the SVG so Vite copies all of them to the site root.
PUBLIC_DIR = Path(__file__).resolve().parent.parent / "dashboard" / "public"

# The SVG's coordinate space. Every measurement below is in these units and is
# scaled to the target pixel size at render time.
VIEWBOX = 32.0
CORNER_RADIUS = 7.0
STROKE_WIDTH = 3.4
PULSE = [(5.5, 16.0), (11.0, 16.0), (14.0, 8.5), (18.5, 23.0), (21.0, 16.0), (26.5, 16.0)]

BACKGROUND = (5, 5, 5, 255)  # #050505
STROKE = (52, 211, 153, 255)  # #34d399, Tailwind emerald-400

# Drawn at this multiple of the target size and scaled down, because PIL has no
# anti-aliasing of its own: a 16px icon drawn directly comes out with stepped
# diagonals, and the pulse is nothing but diagonals.
SUPERSAMPLE = 8

# What a browser actually picks from a multi-size .ico: 16 for the tab, 32 for
# the address bar and taskbar, 48 for a large-icon file listing.
ICO_SIZES = (16, 32, 48)

# iOS renders the home-screen icon at 180x180 and applies its own rounded mask,
# so this one is drawn full-bleed and left square.
APPLE_TOUCH_SIZE = 180


def render(size: int, *, rounded: bool = True) -> Image.Image:
    """Draw the icon at `size` pixels square."""
    canvas = size * SUPERSAMPLE
    scale = canvas / VIEWBOX

    image = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    box = (0, 0, canvas - 1, canvas - 1)
    if rounded:
        draw.rounded_rectangle(box, radius=CORNER_RADIUS * scale, fill=BACKGROUND)
    else:
        draw.rectangle(box, fill=BACKGROUND)

    points = [(x * scale, y * scale) for x, y in PULSE]
    width = max(1, round(STROKE_WIDTH * scale))
    # joint="curve" rounds the interior corners the way stroke-linejoin does.
    draw.line(points, fill=STROKE, width=width, joint="curve")

    # PIL has no equivalent of stroke-linecap, so the two ends get a disc.
    radius = width / 2
    for x, y in (points[0], points[-1]):
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=STROKE)

    return image.resize((size, size), Image.LANCZOS)


def main() -> None:
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    # Each size is drawn at its own resolution rather than letting the ICO
    # writer downscale one image, so the 16px stroke is sized for 16px.
    #
    # The largest has to be the one save() is called on: Pillow silently drops
    # any requested size larger than the base image, so calling this on the
    # 16px layer produces a single-size .ico and no warning.
    layers = {size: render(size) for size in ICO_SIZES}
    largest, *rest = sorted(ICO_SIZES, reverse=True)
    ico_path = PUBLIC_DIR / "favicon.ico"
    layers[largest].save(
        ico_path,
        format="ICO",
        sizes=[(size, size) for size in ICO_SIZES],
        append_images=[layers[size] for size in rest],
    )

    apple_path = PUBLIC_DIR / "apple-touch-icon.png"
    render(APPLE_TOUCH_SIZE, rounded=False).save(apple_path, format="PNG")

    for path in (ico_path, apple_path):
        print(f"{path.relative_to(PUBLIC_DIR.parents[1])}  {path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
