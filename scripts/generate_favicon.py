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

# About this file
# - What it is: a helper you run by hand to (re)create two image files in dashboard/public:
#   favicon.ico (one file holding 16, 32 and 48 pixel versions) and apple-touch-icon.png
#   (180 pixels). The picture is a dark rounded square with a green zig-zag "pulse" line.
# - How it fits in: dashboard/public/favicon.svg is the master design and the numbers
#   below copy it by hand. tests/test_favicon.py imports this file and compares it with
#   the SVG.

from __future__ import annotations

from pathlib import Path

# Pillow (imported as PIL) is a Python image library: it creates images and draws shapes.
from PIL import Image, ImageDraw

# Written next to the SVG so Vite copies all of them to the site root.
PUBLIC_DIR = Path(__file__).resolve().parent.parent / "dashboard" / "public"

# The SVG's coordinate space. Every measurement below is in these units and is
# scaled to the target pixel size at render time.
VIEWBOX = 32.0
CORNER_RADIUS = 7.0
STROKE_WIDTH = 3.4
# The corner points of the pulse line as (x, y) in viewbox units. y grows downward, so a
# small y is high up: the line runs flat, jumps up to y=8.5, drops down to y=23, then
# returns to the flat middle line (y=16) and ends.
PULSE = [(5.5, 16.0), (11.0, 16.0), (14.0, 8.5), (18.5, 23.0), (21.0, 16.0), (26.5, 16.0)]

# Colours are (red, green, blue, alpha), each 0 to 255. Alpha 255 means fully solid.
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
    # Step 1: work on a canvas SUPERSAMPLE times bigger than the target. `scale` = how many
    # canvas pixels one viewbox unit takes up.
    canvas = size * SUPERSAMPLE
    scale = canvas / VIEWBOX

    # Start fully transparent (alpha 0), so the corners outside the rounded square stay clear.
    image = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    # Step 2: the dark background. The box covers the whole canvas (PIL counts the last pixel
    # as inside the box, hence the - 1). The Apple icon passes rounded=False to get a square.
    box = (0, 0, canvas - 1, canvas - 1)
    if rounded:
        draw.rounded_rectangle(box, radius=CORNER_RADIUS * scale, fill=BACKGROUND)
    else:
        draw.rectangle(box, fill=BACKGROUND)

    # Step 3: convert the pulse points from viewbox units to canvas pixels and draw the line.
    # The line is at least 1 pixel wide.
    points = [(x * scale, y * scale) for x, y in PULSE]
    width = max(1, round(STROKE_WIDTH * scale))
    # joint="curve" rounds the interior corners the way stroke-linejoin does.
    draw.line(points, fill=STROKE, width=width, joint="curve")

    # PIL has no equivalent of stroke-linecap, so the two ends get a disc.
    radius = width / 2
    for x, y in (points[0], points[-1]):
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=STROKE)

    # Step 4: shrink to the real size. LANCZOS is a smooth resizing method; blending many
    # canvas pixels into one is what gives the edges their smooth look.
    return image.resize((size, size), Image.LANCZOS)


# Writes favicon.ico and apple-touch-icon.png into dashboard/public, then prints each file's
# path (relative to the repo root) and its size in bytes.
def main() -> None:
    # Make sure the output folder exists.
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    # Each size is drawn at its own resolution rather than letting the ICO
    # writer downscale one image, so the 16px stroke is sized for 16px.
    #
    # The largest has to be the one save() is called on: Pillow silently drops
    # any requested size larger than the base image, so calling this on the
    # 16px layer produces a single-size .ico and no warning.
    layers = {size: render(size) for size in ICO_SIZES}
    # Sort big to small: `largest` is the biggest size and `rest` holds the others.
    largest, *rest = sorted(ICO_SIZES, reverse=True)
    ico_path = PUBLIC_DIR / "favicon.ico"
    # Save the biggest image, attach the smaller ones with append_images, and list every
    # size to store in `sizes`, so one .ico file ends up holding all of them.
    layers[largest].save(
        ico_path,
        format="ICO",
        sizes=[(size, size) for size in ICO_SIZES],
        append_images=[layers[size] for size in rest],
    )

    # The Apple icon is a separate PNG. It is left square because iOS applies its own mask.
    apple_path = PUBLIC_DIR / "apple-touch-icon.png"
    render(APPLE_TOUCH_SIZE, rounded=False).save(apple_path, format="PNG")

    # PUBLIC_DIR.parents[1] is the repo root (dashboard/public -> dashboard -> repo root).
    for path in (ico_path, apple_path):
        print(f"{path.relative_to(PUBLIC_DIR.parents[1])}  {path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
