from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
GENERATED = ASSETS / "generated"
WORLD = ASSETS / "world"
BUILDINGS = ASSETS / "buildings"
DOGS = ASSETS / "dogs"
ICONS = ASSETS / "icons"
UI = ASSETS / "ui"

SOURCE_WORLD = Path("/Users/jamesbutt/.codex/generated_images/019fc3a2-8e12-7561-9a3d-bfa0f4068dfe/call_BGrkn1OVdS7gdZohb5tLHvzW.png")
SOURCE_BUILDINGS = Path("/Users/jamesbutt/.codex/generated_images/019fc3a2-8e12-7561-9a3d-bfa0f4068dfe/call_LsVA7BEtkwT1DRDNEwS2L0l3.png")
SOURCE_DOGS = Path("/Users/jamesbutt/.codex/generated_images/019fc3a2-8e12-7561-9a3d-bfa0f4068dfe/call_VQKC5m1payyzxVoVvuwGmUMF.png")
SOURCE_ICONS = Path("/Users/jamesbutt/.codex/generated_images/019fc3a2-8e12-7561-9a3d-bfa0f4068dfe/call_HiUOD4ZUHF1BaJzxghzEN3oz.png")
SOURCE_FENCE = Path("/Users/jamesbutt/.codex/generated_images/019fc3a2-8e12-7561-9a3d-bfa0f4068dfe/call_la2WsIMSttKMyqn37SAdcfeF.png")
SOURCE_FENCE_KIT = Path("/Users/jamesbutt/.codex/generated_images/019fc3a2-8e12-7561-9a3d-bfa0f4068dfe/call_uH3JBwoIPLH0Td3yaiAaywQ3.png")
SOURCE_KENNEL_2X2 = Path("/Users/jamesbutt/.codex/generated_images/019fc3a2-8e12-7561-9a3d-bfa0f4068dfe/call_DwL6kzU3qGLa4XN0XKzwJBTu.png")

BUILDING_NAMES = [
    "hq",
    "kennel",
    "storage",
    "food",
    "vet",
    "groom",
    "training",
    "park",
    "adoption",
    "staff",
    "donation",
]

DOG_NAMES = [
    "beagle",
    "labrador",
    "terrier",
    "mixed",
    "puppy",
    "senior",
]

ICON_NAMES = [
    "food",
    "materials",
    "medicine",
    "coins",
    "reputation",
    "build",
    "dogs",
    "rescue",
    "staff",
    "adopt",
]

FENCE_NAMES = [
    "fence_axis_x",
    "fence_axis_y",
    "fence_corner_top",
    "fence_corner_right",
    "fence_corner_bottom",
    "fence_corner_left",
]

FENCE_KIT_SPECS = [
    ("fence_rail_x_tile", (128, 96)),
    ("fence_rail_y_tile", (128, 96)),
    ("fence_post_tile", (56, 76)),
]


def ensure_dirs() -> None:
    for folder in [GENERATED, WORLD, BUILDINGS, DOGS, ICONS, UI]:
        folder.mkdir(parents=True, exist_ok=True)


def copy_sources() -> dict[str, str]:
    sources = {
        "world": SOURCE_WORLD,
        "buildings": SOURCE_BUILDINGS,
        "dogs": SOURCE_DOGS,
        "icons": SOURCE_ICONS,
        "fence": SOURCE_FENCE,
        "fence_kit": SOURCE_FENCE_KIT,
        "kennel_2x2": SOURCE_KENNEL_2X2,
    }
    copied: dict[str, str] = {}
    for name, source in sources.items():
        if not source.exists():
            raise FileNotFoundError(source)
        destination = GENERATED / f"{name}-source.png"
        shutil.copyfile(source, destination)
        copied[name] = str(destination.relative_to(ROOT))
    return copied


def remove_green(cell: Image.Image) -> Image.Image:
    rgba = cell.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            green_score = g - max(r, b)
            if g > 145 and green_score > 38:
                alpha = max(0, min(255, int((255 - green_score * 4.2) * (1 if g < 245 else 0.35))))
                if alpha < 30:
                    pixels[x, y] = (0, 0, 0, 0)
                else:
                    pixels[x, y] = (r, min(g, max(r, b) + 18), b, min(a, alpha))
            elif g > 115 and green_score > 24:
                pixels[x, y] = (r, min(g, max(r, b) + 26), b, int(a * 0.58))

    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            if 0 < a < 250 and g > 175 and r < 105 and b < 105:
                if a < 120:
                    pixels[x, y] = (0, 0, 0, 0)
                else:
                    pixels[x, y] = (r, min(g, max(r, b) + 22), b, a)
    return rgba


def trim_alpha(image: Image.Image, padding: int = 18) -> Image.Image:
    alpha = image.getchannel("A")
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.35))
    bbox = alpha.point(lambda value: 255 if value > 4 else 0).getbbox()
    if not bbox:
        return image
    left = max(0, bbox[0] - padding)
    top = max(0, bbox[1] - padding)
    right = min(image.width, bbox[2] + padding)
    bottom = min(image.height, bbox[3] + padding)
    return image.crop((left, top, right, bottom))


def fit_canvas(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    scale = min(size[0] / image.width, size[1] / image.height)
    resized = image.resize((max(1, int(image.width * scale)), max(1, int(image.height * scale))), Image.Resampling.LANCZOS)
    x = (size[0] - resized.width) // 2
    y = size[1] - resized.height
    canvas.alpha_composite(resized, (x, y))
    return canvas


def suppress_chroma_edges(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            if 0 < a < 250 and g > 175 and r < 105 and b < 105:
                if a < 120:
                    pixels[x, y] = (0, 0, 0, 0)
                else:
                    pixels[x, y] = (r, min(g, max(r, b) + 22), b, a)
    return rgba


def component_boxes(image: Image.Image, min_area: int, alpha_threshold: int = 18) -> list[dict[str, object]]:
    alpha = image.getchannel("A")
    width, height = image.size
    pixels = alpha.load()
    visited = bytearray(width * height)
    boxes: list[dict[str, object]] = []

    for y in range(height):
        row_offset = y * width
        for x in range(width):
            index = row_offset + x
            if visited[index] or pixels[x, y] <= alpha_threshold:
                continue

            stack = [(x, y)]
            visited[index] = 1
            area = 0
            left = right = x
            top = bottom = y

            while stack:
                current_x, current_y = stack.pop()
                area += 1
                left = min(left, current_x)
                right = max(right, current_x)
                top = min(top, current_y)
                bottom = max(bottom, current_y)

                for next_x, next_y in (
                    (current_x + 1, current_y),
                    (current_x - 1, current_y),
                    (current_x, current_y + 1),
                    (current_x, current_y - 1),
                ):
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    next_index = next_y * width + next_x
                    if visited[next_index] or pixels[next_x, next_y] <= alpha_threshold:
                        continue
                    visited[next_index] = 1
                    stack.append((next_x, next_y))

            if area >= min_area:
                bbox = (left, top, right + 1, bottom + 1)
                boxes.append(
                    {
                        "area": area,
                        "bbox": bbox,
                        "center": ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2),
                    }
                )

    return boxes


def sort_component_boxes(boxes: list[dict[str, object]], row_gap: float) -> list[dict[str, object]]:
    rows: list[list[dict[str, object]]] = []
    for box in sorted(boxes, key=lambda item: item["center"][1]):  # type: ignore[index]
        center_y = box["center"][1]  # type: ignore[index]
        if not rows:
            rows.append([box])
            continue

        row_center = sum(item["center"][1] for item in rows[-1]) / len(rows[-1])  # type: ignore[index]
        if abs(center_y - row_center) > row_gap:
            rows.append([box])
        else:
            rows[-1].append(box)

    ordered: list[dict[str, object]] = []
    for row in rows:
        ordered.extend(sorted(row, key=lambda item: item["center"][0]))  # type: ignore[index]
    return ordered


def crop_components(
    source: Path,
    names: list[str],
    rows: int,
    target: Path,
    size: tuple[int, int],
    min_area: int,
    padding: int = 4,
) -> list[str]:
    image = Image.open(source).convert("RGBA")
    transparent = remove_green(image)
    boxes = component_boxes(transparent, min_area)
    if len(boxes) != len(names):
        raise ValueError(f"{source.name}: expected {len(names)} isolated assets, found {len(boxes)}")

    row_gap = image.height / (rows * 2.4)
    ordered = sort_component_boxes(boxes, row_gap)
    written: list[str] = []
    for name, box in zip(names, ordered):
        left, top, right, bottom = box["bbox"]  # type: ignore[misc]
        crop = transparent.crop(
            (
                max(0, left - padding),
                max(0, top - padding),
                min(image.width, right + padding),
                min(image.height, bottom + padding),
            )
        )
        output = suppress_chroma_edges(fit_canvas(trim_alpha(crop, padding=6), size))
        path = target / f"{name}.png"
        output.save(path)
        written.append(str(path.relative_to(ROOT)))
    return written


def crop_grid(source: Path, names: list[str], columns: int, rows: int, target: Path, size: tuple[int, int]) -> list[str]:
    image = Image.open(source).convert("RGBA")
    cell_w = image.width // columns
    cell_h = image.height // rows
    written: list[str] = []
    for index, name in enumerate(names):
        col = index % columns
        row = index // columns
        cell = image.crop((col * cell_w, row * cell_h, (col + 1) * cell_w, (row + 1) * cell_h))
        transparent = remove_green(cell)
        trimmed = trim_alpha(transparent)
        output = fit_canvas(trimmed, size)
        path = target / f"{name}.png"
        output.save(path)
        written.append(str(path.relative_to(ROOT)))
    return written


def create_projection_locked_rail(direction: str, size: tuple[int, int]) -> Image.Image:
    scale = 4
    width, height = size
    canvas = Image.new("RGBA", (width * scale, height * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas, "RGBA")

    start_y = 4 * scale
    board_height = 8 * scale
    board_gap = 2 * scale
    start_x = round(width * 0.2) * scale
    end_x = round(width * 0.8) * scale
    if direction == "y":
        start_x, end_x = end_x, start_x
    end_y = start_y + round(abs(end_x - start_x) * (10 / 14))

    board_colors = [
        (229, 137, 38, 255),
        (207, 111, 30, 255),
        (190, 95, 25, 255),
        (170, 80, 21, 255),
    ]
    outline = (98, 46, 15, 210)
    shadow = (73, 32, 13, 150)
    highlight = (255, 210, 112, 190)

    for index, color in enumerate(board_colors):
        offset = index * (board_height + board_gap)
        polygon = [
            (start_x, start_y + offset),
            (end_x, end_y + offset),
            (end_x, end_y + offset + board_height),
            (start_x, start_y + offset + board_height),
        ]
        draw.polygon([(x + scale, y + scale) for x, y in polygon], fill=shadow)
        draw.polygon(polygon, fill=color)
        draw.line([polygon[0], polygon[1]], fill=highlight, width=max(1, scale))
        draw.line([polygon[2], polygon[3]], fill=(78, 34, 13, 130), width=max(1, scale))
        draw.line(polygon + [polygon[0]], fill=outline, width=max(1, scale))

        for grain_index, inset in enumerate((0.32, 0.58, 0.77)):
            wobble = (grain_index - 1) * scale
            grain_start = (
                start_x + round((end_x - start_x) * 0.12),
                start_y + offset + round(board_height * inset) + wobble,
            )
            grain_end = (
                end_x - round((end_x - start_x) * 0.12),
                end_y + offset + round(board_height * inset) - wobble,
            )
            draw.line([grain_start, grain_end], fill=(113, 52, 15, 70), width=max(1, scale // 2))

        end_cap_width = 2 * scale
        draw.line([polygon[0], polygon[3]], fill=(255, 202, 91, 105), width=end_cap_width)
        draw.line([polygon[1], polygon[2]], fill=(81, 37, 15, 130), width=end_cap_width)

    return canvas.resize(size, Image.Resampling.LANCZOS)


def crop_fence_kit(source: Path) -> list[str]:
    image = Image.open(source).convert("RGBA")
    written: list[str] = []
    for index, (name, size) in enumerate(FENCE_KIT_SPECS[:2]):
        output = create_projection_locked_rail("x" if index == 0 else "y", size)
        path = WORLD / f"{name}.png"
        output.save(path)
        written.append(str(path.relative_to(ROOT)))

    post_name, post_size = FENCE_KIT_SPECS[2]
    transparent = remove_green(image)
    boxes = component_boxes(transparent, min_area=1000)
    if not boxes:
        raise ValueError(f"{source.name}: could not find fence post component")
    post_box = max(boxes, key=lambda item: item["center"][0])  # type: ignore[index]
    left, top, right, bottom = post_box["bbox"]  # type: ignore[misc]
    post_crop = transparent.crop((max(0, left - 10), max(0, top - 10), min(image.width, right + 10), min(image.height, bottom + 10)))
    post_output = suppress_chroma_edges(fit_canvas(trim_alpha(post_crop, padding=6), post_size))
    post_path = WORLD / f"{post_name}.png"
    post_output.save(post_path)
    written.append(str(post_path.relative_to(ROOT)))
    return written


def process_single_asset(source: Path, target: Path, size: tuple[int, int], padding: int = 18) -> str:
    image = Image.open(source).convert("RGBA")
    transparent = remove_green(image)
    trimmed = trim_alpha(transparent, padding=padding)
    output = suppress_chroma_edges(fit_canvas(trimmed, size))
    output.save(target)
    return str(target.relative_to(ROOT))


def prepare_world() -> dict[str, str]:
    world = Image.open(SOURCE_WORLD).convert("RGB")
    # Keep enough resolution for retina-like mobile previews while matching the existing portrait map ratio.
    board = ImageOpsContain(world, (1125, 1688))
    board_out = WORLD / "town-board.png"
    board.save(board_out, quality=96)

    grass_crop = world.crop((176, 620, 688, 1132))
    grass = grass_crop.resize((512, 512), Image.Resampling.LANCZOS)
    grass_out = WORLD / "grass-tile.png"
    grass.save(grass_out, quality=96)
    return {
        "board": str(board_out.relative_to(ROOT)),
        "grass": str(grass_out.relative_to(ROOT)),
    }


def ImageOpsContain(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    scale = max(size[0] / image.width, size[1] / image.height)
    resized = image.resize((int(image.width * scale), int(image.height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - size[0]) // 2
    top = (resized.height - size[1]) // 2
    return resized.crop((left, top, left + size[0], top + size[1]))


def assert_alpha(paths: list[str]) -> None:
    for rel in paths:
        image = Image.open(ROOT / rel).convert("RGBA")
        if image.getchannel("A").getextrema()[0] != 0:
            raise ValueError(f"{rel} has no fully transparent pixels")


def main() -> None:
    ensure_dirs()
    copied = copy_sources()
    world = prepare_world()
    buildings = crop_components(GENERATED / "buildings-source.png", BUILDING_NAMES, 3, BUILDINGS, (360, 280), min_area=1000)
    dogs = crop_components(GENERATED / "dogs-source.png", DOG_NAMES, 2, DOGS, (220, 160), min_area=500)
    icons = crop_components(GENERATED / "icons-source.png", ICON_NAMES, 2, ICONS, (128, 128), min_area=200)
    fences = crop_components(GENERATED / "fence-source.png", FENCE_NAMES, 2, WORLD, (320, 210), min_area=1000)
    fence_kit = crop_fence_kit(GENERATED / "fence_kit-source.png")
    kennel_2x2 = process_single_asset(GENERATED / "kennel_2x2-source.png", BUILDINGS / "kennel_2x2_grid.png", (360, 280))
    for name in ICON_NAMES[5:]:
        shutil.copyfile(ICONS / f"{name}.png", UI / f"{name}.png")
    assert_alpha(buildings + dogs + icons + fences + fence_kit + [kennel_2x2])
    manifest = {
        "sources": copied,
        "world": world,
        "buildings": buildings,
        "dogs": dogs,
        "icons": icons,
        "fence": fences,
        "fence_kit": fence_kit,
        "kennel_2x2": kennel_2x2,
        "ui": [str((UI / f"{name}.png").relative_to(ROOT)) for name in ICON_NAMES[5:]],
        "chroma_key": "#00ff00",
    }
    (GENERATED / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
