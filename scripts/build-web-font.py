#!/usr/bin/env python3
"""
Build the web copy of Google Sans Flex from the full variable font the native app ships.

The full font has six variation axes and is 1.4 MB as woff2. The web app uses three of them:
`wght`, `ROND` (named in font-variation-settings) and `opsz` (named there too, and applied
automatically by the browser from font size). The other three are never engaged:

  wdth  nothing sets font-stretch, and the @font-face declares no width range
  slnt  the @font-face is `font-style: normal`, so italics are synthesised, not slanted
  GRAD  no CSS names it

Pinning those three at their defaults removes their variation data and renders identically —
checked Sept 2026 across 40 axis settings x 349 glyphs: advances equal, outlines within 0.42
of 2000 units per em. The file drops to ~175 KB. It is preloaded at top priority on every
cold load, so this was the largest single download in the app.

If CSS ever starts using one of the pinned axes (font-stretch, a real oblique, "GRAD"), move it
to KEEP and rebuild — a pinned axis is silently ignored, not an error.

Usage: python3 scripts/build-web-font.py   (needs fonttools + brotli)
"""
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "native/Harvous/Resources/Fonts/GoogleSansFlex-Variable.ttf"
OUT = ROOT / "public/fonts/google-sans-flex/GoogleSansFlex-opsz-wght-ROND.woff2"

KEEP = {"opsz", "wght", "ROND"}

font = TTFont(SOURCE)
pins = {a.axisTag: a.defaultValue for a in font["fvar"].axes if a.axisTag not in KEEP}
instanced = instancer.instantiateVariableFont(font, pins, updateFontNames=False)
instanced.flavor = "woff2"
instanced.save(OUT)
print(f"pinned {pins}; wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")
