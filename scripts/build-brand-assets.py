from __future__ import annotations

import base64
import math
from collections import deque
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
BRAND_DIR = ROOT / "assets" / "branding"
SOURCE = BRAND_DIR / "mankuang-shop-icon-source.png"
FONT_PATH = Path("/System/Library/Fonts/STHeiti Medium.ttc")
BACKGROUND = (255, 211, 20, 255)


def replace_exterior_white(image: Image.Image) -> Image.Image:
    output = image.convert("RGBA")
    pixels = output.load()
    width, height = output.size
    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def is_exterior_white(x: int, y: int) -> bool:
        red, green, blue, _ = pixels[x, y]
        return (
            red >= 215
            and green >= 215
            and blue >= 215
            and max(red, green, blue) - min(red, green, blue) <= 26
        )

    def enqueue(x: int, y: int) -> None:
        index = y * width + x
        if not visited[index] and is_exterior_white(x, y):
            visited[index] = 1
            queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(height):
        enqueue(0, y)
        enqueue(width - 1, y)

    while queue:
        x, y = queue.popleft()
        pixels[x, y] = BACKGROUND
        if x > 0:
            enqueue(x - 1, y)
        if x + 1 < width:
            enqueue(x + 1, y)
        if y > 0:
            enqueue(x, y - 1)
        if y + 1 < height:
            enqueue(x, y + 1)

    return output


def make_shadow(layer: Image.Image, blur: int, offset_y: int) -> Image.Image:
    alpha = layer.getchannel("A").filter(ImageFilter.GaussianBlur(blur))
    shadow = Image.new("RGBA", layer.size, (74, 37, 24, 0))
    shadow.putalpha(alpha.point(lambda value: round(value * 0.22)))
    shifted = Image.new("RGBA", layer.size)
    shifted.alpha_composite(shadow, (0, offset_y))
    return shifted


def build_horizontal_logo(icon: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", (1800, 640))
    icon = icon.resize((540, 540), Image.Resampling.LANCZOS)
    icon_mask = Image.new("L", icon.size)
    ImageDraw.Draw(icon_mask).rounded_rectangle(
        (0, 0, icon.width - 1, icon.height - 1),
        radius=76,
        fill=255,
    )
    icon.putalpha(icon_mask)
    icon_layer = Image.new("RGBA", canvas.size)
    icon_layer.alpha_composite(icon, (50, 50))
    canvas.alpha_composite(make_shadow(icon_layer, blur=10, offset_y=14))
    canvas.alpha_composite(icon_layer)

    font = ImageFont.truetype(str(FONT_PATH), 225)
    text_layer = Image.new("RGBA", canvas.size)
    draw = ImageDraw.Draw(text_layer)
    first = "满筐"
    second = "小铺"
    text_y = 174
    first_x = 650
    first_bbox = draw.textbbox(
        (first_x, text_y),
        first,
        font=font,
        stroke_width=18,
    )
    second_x = first_bbox[2] + 28

    draw.text(
        (first_x, text_y),
        first,
        font=font,
        fill="#FF5B45",
        stroke_width=18,
        stroke_fill="#4A2518",
    )
    draw.text(
        (second_x, text_y),
        second,
        font=font,
        fill="#FFD314",
        stroke_width=18,
        stroke_fill="#4A2518",
    )
    canvas.alpha_composite(make_shadow(text_layer, blur=9, offset_y=12))
    canvas.alpha_composite(text_layer)

    accent = Image.new("RGBA", canvas.size)
    accent_draw = ImageDraw.Draw(accent)
    points = []
    for step in range(101):
        t = step / 100
        x = 690 + 915 * t
        y = 462 + 62 * math.sin(math.pi * t) - 24 * t
        points.append((round(x), round(y)))
    accent_draw.line(points, fill="#53B934", width=26, joint="curve")
    leaf = [(1584, 446), (1625, 410), (1681, 413), (1642, 448), (1615, 492)]
    accent_draw.polygon(leaf, fill="#76D344")
    accent_draw.line(leaf + [leaf[0]], fill="#4A2518", width=11, joint="curve")
    canvas.alpha_composite(accent)
    return canvas


def png_data_uri(image: Image.Image) -> str:
    buffer = BytesIO()
    image.save(buffer, "PNG", optimize=True)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def build_horizontal_svg(icon: Image.Image) -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="640" viewBox="0 0 1800 640">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="14" stdDeviation="10" flood-color="#4A2518" flood-opacity="0.2"/>
    </filter>
  </defs>
  <clipPath id="icon-clip">
    <rect x="50" y="50" width="540" height="540" rx="76"/>
  </clipPath>
  <image href="data:image/png;base64,{png_data_uri(icon)}" x="50" y="50" width="540" height="540" clip-path="url(#icon-clip)" filter="url(#shadow)"/>
  <g font-family="STHeiti, 'Hiragino Sans GB', sans-serif" font-weight="900" paint-order="stroke fill" stroke="#4A2518" stroke-linejoin="round" filter="url(#shadow)">
    <text x="650" y="395" font-size="225" letter-spacing="8" stroke-width="18" fill="#FF5B45">满筐</text>
    <text x="1128" y="395" font-size="225" letter-spacing="8" stroke-width="18" fill="#FFD314">小铺</text>
  </g>
  <path d="M690 462 C920 528 1300 514 1605 438" fill="none" stroke="#53B934" stroke-width="26" stroke-linecap="round"/>
  <path d="M1584 446 C1625 410 1650 405 1681 413 C1642 448 1627 468 1615 492 C1598 477 1590 462 1584 446 Z" fill="#76D344" stroke="#4A2518" stroke-width="11" stroke-linejoin="round"/>
</svg>
"""


def main() -> None:
    BRAND_DIR.mkdir(parents=True, exist_ok=True)
    cleaned = replace_exterior_white(Image.open(SOURCE))
    icon_1024 = cleaned.resize((1024, 1024), Image.Resampling.LANCZOS)
    icon_1024.save(BRAND_DIR / "mankuang-shop-icon-1024.png", optimize=True)

    icons = {1024: icon_1024}
    for size in (512, 256, 128):
        resized = icon_1024.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(BRAND_DIR / f"mankuang-shop-icon-{size}.png", optimize=True)
        icons[size] = resized

    horizontal = build_horizontal_logo(icon_1024)
    horizontal.save(
        BRAND_DIR / "mankuang-shop-logo-horizontal.png",
        optimize=True,
    )
    (BRAND_DIR / "mankuang-shop-logo-horizontal.svg").write_text(
        build_horizontal_svg(icons[512]),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
