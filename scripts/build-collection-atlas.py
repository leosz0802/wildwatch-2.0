from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/art/collection/collection-items-atlas.png"
SOURCE = ROOT / "art-source/collection/collection-items-atlas-v1-40.png"
SOURCE_CELL, CELL, COLS, ROWS = 40, 96, 9, 5


def prepare_source():
    """Keep the original 45-item ordering as a reproducible art source."""
    if SOURCE.exists():
        source = Image.open(SOURCE).convert("RGBA")
    else:
        source = Image.open(OUT).convert("RGBA")
        if source.size != (COLS * SOURCE_CELL, ROWS * SOURCE_CELL):
            raise RuntimeError("missing the original 360x200 collection atlas source")
        SOURCE.parent.mkdir(parents=True, exist_ok=True)
        source.save(SOURCE, optimize=True)
    if source.size != (COLS * SOURCE_CELL, ROWS * SOURCE_CELL):
        raise RuntimeError(f"unexpected source atlas dimensions: {source.size}")
    return source


source_atlas = prepare_source()
atlas = Image.new("RGBA", (COLS * CELL, ROWS * CELL), (0, 0, 0, 0))
for index in range(COLS * ROWS):
    sx = (index % COLS) * SOURCE_CELL
    sy = (index // COLS) * SOURCE_CELL
    tile = source_atlas.crop((sx, sy, sx + SOURCE_CELL, sy + SOURCE_CELL))
    # Runtime previously enlarged a 40px cell. Upscale once while building the
    # asset, then restore edge contrast so both thumbnails and detail art are
    # sampled from a dense, stable source.
    tile = tile.resize((CELL, CELL), Image.Resampling.LANCZOS)
    alpha = tile.getchannel("A")
    rgb = ImageEnhance.Contrast(tile.convert("RGB")).enhance(1.08)
    rgb = ImageEnhance.Color(rgb).enhance(1.04)
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=1.05, percent=155, threshold=2))
    enhanced = rgb.convert("RGBA")
    enhanced.putalpha(alpha.filter(ImageFilter.UnsharpMask(radius=1.0, percent=150, threshold=2)))
    atlas.alpha_composite(enhanced, ((index % COLS) * CELL, (index // COLS) * CELL))

OUT.parent.mkdir(parents=True, exist_ok=True)
atlas = atlas.quantize(colors=64, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
atlas.save(OUT, optimize=True)
print(f"{OUT}: {atlas.size[0]}x{atlas.size[1]}, {OUT.stat().st_size} bytes")
