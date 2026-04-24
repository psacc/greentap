#!/usr/bin/env python3
"""
Regenerate test/fixtures/e2e/sample.png.

Not invoked at test time. Committed for reproducibility only: any maintainer
can re-run this to recreate the fixture byte-stably (given the same system
font).

Usage:
    uv run --with pillow python3 test/fixtures/e2e/regenerate.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).parent / "sample.png"
WIDTH, HEIGHT = 600, 200
FONT_PATH = "/System/Library/Fonts/Helvetica.ttc"  # macOS default


def main() -> None:
    img = Image.new("RGB", (WIDTH, HEIGHT), "white")
    draw = ImageDraw.Draw(img)
    try:
        font_big = ImageFont.truetype(FONT_PATH, 48)
        font_small = ImageFont.truetype(FONT_PATH, 22)
    except OSError:
        # Fallback on non-macOS hosts: the test is most useful on the
        # maintainer's Mac, so a less-pretty bitmap default is acceptable.
        font_big = ImageFont.load_default()
        font_small = ImageFont.load_default()

    draw.text((30, 40), "GREENTAP-E2E", fill="black", font=font_big)
    draw.text((30, 110), "roundtrip fixture", fill="gray", font=font_small)
    draw.text((30, 145), "do not edit", fill="gray", font=font_small)

    img.save(OUT)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
