from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art-source" / "collection-v2"
OUTPUT = ROOT / "assets" / "art" / "collection" / "collection-items-atlas.png"
CELL = 96
COLS = 9
ROWS = 5

SHEETS = [
    (SOURCE / "case-1.png", 4, 2, 8),
    (SOURCE / "case-2.png", 4, 2, 8),
    (SOURCE / "case-3.png", 4, 2, 8),
    (SOURCE / "case-4.png", 4, 2, 8),
    (SOURCE / "case-5.png", 4, 2, 8),
    (SOURCE / "hidden.png", 3, 2, 5),
]


def color_distance(a, b):
    return sum((int(a[i]) - int(b[i])) ** 2 for i in range(3)) ** 0.5


def remove_connected_background(source):
    image = source.convert("RGBA")
    width, height = image.size
    pixels = image.load()
    samples = [pixels[2, 2], pixels[width - 3, 2], pixels[2, height - 3], pixels[width - 3, height - 3]]
    background = tuple(sum(sample[channel] for sample in samples) / len(samples) for channel in range(3))
    seen = bytearray(width * height)
    queue = deque()

    def eligible(x, y):
        red, green, blue, _ = pixels[x, y]
        spread = max(red, green, blue) - min(red, green, blue)
        return color_distance((red, green, blue), background) < 62 and spread < 48 and min(red, green, blue) > 190

    def add(x, y):
        index = y * width + x
        if seen[index] or not eligible(x, y):
            return
        seen[index] = 1
        queue.append((x, y))

    for x in range(width):
        add(x, 0)
        add(x, height - 1)
    for y in range(height):
        add(0, y)
        add(width - 1, y)

    while queue:
        x, y = queue.popleft()
        pixels[x, y] = (255, 255, 255, 0)
        if x > 0:
            add(x - 1, y)
        if x + 1 < width:
            add(x + 1, y)
        if y > 0:
            add(x, y - 1)
        if y + 1 < height:
            add(x, y + 1)
    return image


def cells_from_sheet(path, columns, rows, count):
    sheet = Image.open(path).convert("RGB")
    width, height = sheet.size
    cells = []
    for index in range(count):
        column = index % columns
        row = index // columns
        x0 = round(column * width / columns)
        x1 = round((column + 1) * width / columns)
        y0 = round(row * height / rows)
        y1 = round((row + 1) * height / rows)
        crop = sheet.crop((x0, y0, x1, y1))
        crop = remove_connected_background(crop)
        crop.thumbnail((CELL - 4, CELL - 4), Image.Resampling.LANCZOS)
        cell = Image.new("RGBA", (CELL, CELL), (255, 255, 255, 0))
        cell.alpha_composite(crop, ((CELL - crop.width) // 2, (CELL - crop.height) // 2))
        cells.append(cell)
    return cells


def main():
    cells = []
    for path, columns, rows, count in SHEETS:
        cells.extend(cells_from_sheet(path, columns, rows, count))
    if len(cells) != 45:
        raise RuntimeError(f"expected 45 collection icons, got {len(cells)}")
    atlas = Image.new("RGBA", (COLS * CELL, ROWS * CELL), (255, 255, 255, 0))
    for index, cell in enumerate(cells):
        atlas.alpha_composite(cell, ((index % COLS) * CELL, (index // COLS) * CELL))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    # 小尺寸图标使用有限色板即可保持粗线与纯色，同时避免把总包推过4MiB。
    optimized = atlas.quantize(colors=96, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    optimized.save(OUTPUT, optimize=True, compress_level=9)
    print(f"collection atlas v2 built: {OUTPUT} ({atlas.width}x{atlas.height}, {OUTPUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
