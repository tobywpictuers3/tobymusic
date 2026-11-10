#!/usr/bin/env python3
"""Package the original TOBY Music logo as a square Android launcher icon."""
import sys
from pathlib import Path
from PIL import Image, ImageOps

source, destination = map(Path, sys.argv[1:3])
logo = Image.open(source).convert("RGBA")
print(f"Official TOBY Music logo: {logo.width}x{logo.height}")

# Use the logo's own corner background if opaque; otherwise use brand night color.
corners = [logo.getpixel(p) for p in
           ((0, 0), (logo.width - 1, 0), (0, logo.height - 1),
            (logo.width - 1, logo.height - 1))]
if all(p[3] == 255 for p in corners):
    background = tuple(round(sum(p[i] for p in corners) / 4) for i in range(3))
else:
    background = (15, 15, 18)

canvas = Image.new("RGBA", (512, 512), background + (255,))
# Keep the entire official logo, with safe margin against launcher icon masks.
contained = ImageOps.contain(logo, (410, 410), method=Image.Resampling.LANCZOS)
canvas.alpha_composite(contained, ((512 - contained.width) // 2,
                                   (512 - contained.height) // 2))
destination.parent.mkdir(parents=True, exist_ok=True)
canvas.convert("RGB").save(destination, format="PNG", optimize=True)
print(f"Android launcher icon: {destination} (512x512)")
