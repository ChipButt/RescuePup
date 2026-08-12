from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_DIR = ROOT / "assets" / "art-templates"

RUNTIME_TILE_WIDTH = 28
RUNTIME_TILE_HEIGHT = 20
ART_SCALE = 4
CHROMA_KEY = (0, 255, 0)

FOOTPRINT_SIZES = [
    (1, 1),
    (2, 1),
    (2, 2),
    (3, 2),
    (3, 3),
    (4, 3),
]


def footprint_key(width: int, height: int) -> str:
    return f"{width}x{height}"


def projected_footprint_polygon(width: int, height: int, scale: int = 1) -> list[list[int]]:
    tile_half_width = (RUNTIME_TILE_WIDTH // 2) * scale
    tile_half_height = (RUNTIME_TILE_HEIGHT // 2) * scale
    return [
        [tile_half_width * height, 0],
        [tile_half_width * (width + height), tile_half_height * width],
        [tile_half_width * width, tile_half_height * (width + height)],
        [0, tile_half_height * height],
    ]


def template_for(width: int, height: int) -> dict[str, object]:
    bounds_width = (width + height) * (RUNTIME_TILE_WIDTH // 2) * ART_SCALE
    bounds_height = (width + height) * (RUNTIME_TILE_HEIGHT // 2) * ART_SCALE
    canvas_width = max(320, bounds_width + 96)
    canvas_height = bounds_height + 200
    offset_x = (canvas_width - bounds_width) // 2
    offset_y = canvas_height - bounds_height - 20
    polygon = [[x + offset_x, y + offset_y] for x, y in projected_footprint_polygon(width, height, ART_SCALE)]
    return {
        "id": footprint_key(width, height),
        "footprintWidth": width,
        "footprintHeight": height,
        "runtimeTileWidth": RUNTIME_TILE_WIDTH,
        "runtimeTileHeight": RUNTIME_TILE_HEIGHT,
        "runtimeWorldXVector": [RUNTIME_TILE_WIDTH // 2, RUNTIME_TILE_HEIGHT // 2],
        "runtimeWorldYVector": [-(RUNTIME_TILE_WIDTH // 2), RUNTIME_TILE_HEIGHT // 2],
        "artScale": ART_SCALE,
        "artWorldXVector": [(RUNTIME_TILE_WIDTH // 2) * ART_SCALE, (RUNTIME_TILE_HEIGHT // 2) * ART_SCALE],
        "artWorldYVector": [-(RUNTIME_TILE_WIDTH // 2) * ART_SCALE, (RUNTIME_TILE_HEIGHT // 2) * ART_SCALE],
        "sourceCanvasWidth": canvas_width,
        "sourceCanvasHeight": canvas_height,
        "footprintBoundsSource": [bounds_width, bounds_height],
        "footprintOriginSource": [offset_x, offset_y],
        "footprintPolygonSource": polygon,
        "footprintAnchorSource": polygon[2],
        "guide": f"assets/art-templates/footprint-{footprint_key(width, height)}-guide.png",
    }


def draw_template_guide(template: dict[str, object]) -> None:
    width = int(template["sourceCanvasWidth"])
    height = int(template["sourceCanvasHeight"])
    polygon = [tuple(point) for point in template["footprintPolygonSource"]]
    anchor = tuple(template["footprintAnchorSource"])
    origin_x, origin_y = template["footprintOriginSource"]
    foot_w, foot_h = template["footprintBoundsSource"]

    image = Image.new("RGB", (width, height), CHROMA_KEY)
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")

    draw.polygon(polygon, fill=(236, 207, 122, 128), outline=(255, 255, 255, 255))
    draw.line(polygon + [polygon[0]], fill=(255, 255, 255, 255), width=3)

    top, right, bottom, left = polygon
    draw.line([left, right], fill=(88, 185, 255, 150), width=2)
    draw.line([top, bottom], fill=(255, 107, 97, 150), width=2)

    for point in polygon:
        x, y = point
        draw.ellipse((x - 5, y - 5, x + 5, y + 5), fill=(255, 255, 255, 255))

    ax, ay = anchor
    draw.ellipse((ax - 7, ay - 7, ax + 7, ay + 7), fill=(12, 14, 18, 255), outline=(255, 245, 143, 255), width=2)
    draw.rectangle(
        (origin_x, origin_y, origin_x + foot_w, origin_y + foot_h),
        outline=(18, 20, 22, 120),
        width=1,
    )

    image = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
    out = ROOT / template["guide"]
    out.parent.mkdir(parents=True, exist_ok=True)
    image.save(out)


def main() -> None:
    TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
    templates = {footprint_key(width, height): template_for(width, height) for width, height in FOOTPRINT_SIZES}
    for template in templates.values():
        draw_template_guide(template)

    metadata = {
        "runtimeTileWidth": RUNTIME_TILE_WIDTH,
        "runtimeTileHeight": RUNTIME_TILE_HEIGHT,
        "runtimeWorldXVector": [RUNTIME_TILE_WIDTH // 2, RUNTIME_TILE_HEIGHT // 2],
        "runtimeWorldYVector": [-(RUNTIME_TILE_WIDTH // 2), RUNTIME_TILE_HEIGHT // 2],
        "artScale": ART_SCALE,
        "templates": templates,
    }
    (TEMPLATE_DIR / "footprint-templates.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
