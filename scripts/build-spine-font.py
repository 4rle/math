"""Regenerate the bundled spine font from Noto Serif CJK JP Regular 2.003.

Requires FontTools only for regeneration, never for the normal app build.
Usage: python3 scripts/build-spine-font.py /path/to/NotoSerifCJK-Regular.ttc
"""

import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

font = TTFont(sys.argv[1], fontNumber=0)
if font["name"].getDebugName(1) != "Noto Serif CJK JP":
    raise ValueError("Use the Japanese face from Noto Serif CJK Regular.")

options = subset.Options()
options.layout_features = ["*"]
options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14, 16, 17]
glyphs = subset.Subsetter(options=options)
glyphs.populate(text="Focus Gold数学Ⅰ+AⅡ+B+CⅢ+C")
glyphs.subset(font)

names = {
    1: "Focusgold Spine Serif",
    3: "FocusgoldSpineSerif-Regular-Subset",
    4: "Focusgold Spine Serif Regular",
    6: "FocusgoldSpineSerif-Regular",
    16: "Focusgold Spine Serif",
}
for record in font["name"].names:
    if record.nameID in names:
        record.string = names[record.nameID].encode(record.getEncoding())
top = font["CFF "].cff.topDictIndex[0]
top.FamilyName = "Focusgold Spine Serif"
top.FullName = "Focusgold Spine Serif Regular"
font["CFF "].cff.fontNames = ["FocusgoldSpineSerif-Regular"]
font.flavor = "woff"
target = Path(__file__).resolve().parents[1] / "src/assets/focusgold-spine-serif.woff"
target.parent.mkdir(parents=True, exist_ok=True)
font.save(target)
