"""The favicon exists, and its two definitions have not drifted apart.

There is no SVG rasteriser in this environment, so scripts/generate_favicon.py
carries a hand-written copy of the geometry in dashboard/public/favicon.svg
rather than rendering it. Nothing about editing one file forces the other to
change, which is what these tests are for.

The multi-size assertion is a regression guard with a specific cause: Pillow
drops any requested .ico size larger than the image save() was called on, and
does it without a warning, so a plausible-looking script can quietly emit a
single 16px layer.
"""

import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
PUBLIC_DIR = REPO_ROOT / "dashboard" / "public"
SVG_PATH = PUBLIC_DIR / "favicon.svg"
INDEX_HTML = REPO_ROOT / "dashboard" / "index.html"

SVG_NS = "{http://www.w3.org/2000/svg}"


def _load_generator():
    """Import scripts/generate_favicon.py, skipping if Pillow is absent."""
    pytest.importorskip("PIL", reason="Pillow is only needed to build the raster icons")
    sys.path.insert(0, str(REPO_ROOT / "scripts"))
    import generate_favicon

    return generate_favicon


def _hex_to_rgba(value):
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4)) + (255,)


@pytest.mark.parametrize("name", ["favicon.svg", "favicon.ico", "apple-touch-icon.png"])
def test_icon_file_is_present(name):
    path = PUBLIC_DIR / name
    assert path.is_file(), f"{name} is missing from dashboard/public"
    assert path.stat().st_size > 0


def test_index_html_links_every_icon():
    html = INDEX_HTML.read_text(encoding="utf-8")
    for href in ("/favicon.ico", "/favicon.svg", "/apple-touch-icon.png"):
        assert href in html, f"index.html does not reference {href}"


def test_svg_geometry_matches_the_generator():
    generator = _load_generator()
    root = ET.parse(SVG_PATH).getroot()

    tile = root.find(f"{SVG_NS}rect")
    assert tile is not None, "favicon.svg has no background tile"
    assert float(tile.get("rx")) == generator.CORNER_RADIUS
    assert _hex_to_rgba(tile.get("fill")) == generator.BACKGROUND

    width, height = root.get("viewBox").split()[2:]
    assert float(width) == float(height) == generator.VIEWBOX

    pulse = root.find(f"{SVG_NS}path")
    assert pulse is not None, "favicon.svg has no pulse path"
    assert float(pulse.get("stroke-width")) == generator.STROKE_WIDTH
    assert _hex_to_rgba(pulse.get("stroke")) == generator.STROKE

    numbers = [float(n) for n in re.findall(r"-?\d+(?:\.\d+)?", pulse.get("d"))]
    points = list(zip(numbers[::2], numbers[1::2]))
    assert points == generator.PULSE


def test_ico_carries_every_declared_size():
    generator = _load_generator()
    from PIL import Image

    with Image.open(PUBLIC_DIR / "favicon.ico") as image:
        sizes = sorted(image.ico.sizes())

    assert sizes == sorted((s, s) for s in generator.ICO_SIZES)


def test_apple_touch_icon_is_the_size_ios_asks_for():
    generator = _load_generator()
    from PIL import Image

    with Image.open(PUBLIC_DIR / "apple-touch-icon.png") as image:
        assert image.size == (generator.APPLE_TOUCH_SIZE, generator.APPLE_TOUCH_SIZE)
