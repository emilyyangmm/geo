from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageSequence
import math
import random

OUT = Path(__file__).parent / "pdd商品图"
OUT.mkdir(exist_ok=True)
LOGO_DIR = Path(__file__).parent / "assets" / "ai-logos"

W = H = 900
FONT_BOLD = "C:/Windows/Fonts/msyhbd.ttc"
FONT_REG = "C:/Windows/Fonts/msyh.ttc"
FONT_HEI = "C:/Windows/Fonts/simhei.ttf"


def font(size, bold=True):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)


def draw_text_center(draw, xy, text, size, fill, bold=True, stroke=0, stroke_fill=(0, 0, 0)):
    draw.text(xy, text, font=font(size, bold), fill=fill, anchor="mm", stroke_width=stroke, stroke_fill=stroke_fill)


def fit_text(draw, xy, text, max_w, start_size, min_size, fill, bold=True, anchor="mm", stroke=0, stroke_fill=(0, 0, 0)):
    size = start_size
    while size >= min_size:
        f = font(size, bold)
        box = draw.textbbox((0, 0), text, font=f, stroke_width=stroke)
        if box[2] - box[0] <= max_w:
            draw.text(xy, text, font=f, fill=fill, anchor=anchor, stroke_width=stroke, stroke_fill=stroke_fill)
            return size
        size -= 2
    draw.text(xy, text, font=font(min_size, bold), fill=fill, anchor=anchor, stroke_width=stroke, stroke_fill=stroke_fill)
    return min_size


def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def add_glow(base, draw_fn, blur=18, color=(0, 255, 210, 120)):
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    draw_fn(d, color)
    glow = layer.filter(ImageFilter.GaussianBlur(blur))
    base.alpha_composite(glow)
    base.alpha_composite(layer)


def bg():
    img = Image.new("RGBA", (W, H), (3, 10, 22, 255))
    pix = img.load()
    for y in range(H):
        for x in range(W):
            nx = x / W
            ny = y / H
            radial = max(0, 1 - math.sqrt((nx - 0.55) ** 2 + (ny - 0.58) ** 2) * 1.6)
            blue = int(24 + 35 * radial + 20 * ny)
            green = int(18 + 75 * radial)
            pix[x, y] = (4, green, blue, 255)

    d = ImageDraw.Draw(img)
    random.seed(7)
    for _ in range(95):
        x = random.randint(-100, W + 60)
        y = random.randint(170, H - 40)
        length = random.randint(80, 210)
        angle = random.choice([0, 12, -12, 28, -28])
        x2 = x + int(math.cos(math.radians(angle)) * length)
        y2 = y + int(math.sin(math.radians(angle)) * length)
        col = random.choice([(0, 212, 255, 54), (57, 255, 136, 48), (80, 120, 255, 42)])
        d.line((x, y, x2, y2), fill=col, width=random.randint(1, 3))
        if random.random() > 0.65:
            d.ellipse((x2 - 4, y2 - 4, x2 + 4, y2 + 4), fill=(150, 255, 230, 100))

    for r, a in [(310, 42), (235, 55), (160, 66)]:
        d.ellipse((450 - r, 620 - r, 450 + r, 620 + r), outline=(0, 210, 255, a), width=3)
    return img


def gradient_text(base, text, xy, size, stroke_w=7):
    f = ImageFont.truetype(FONT_HEI, size)
    mask = Image.new("L", (W, H), 0)
    md = ImageDraw.Draw(mask)
    md.text(xy, text, font=f, fill=255, anchor="mm", stroke_width=stroke_w, stroke_fill=255)

    grad = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gp = grad.load()
    for y in range(H):
        for x in range(W):
            t = min(1, max(0, (x - 80) / 760 * 0.55 + (y - 210) / 420 * 0.45))
            c = (
                int(20 * (1 - t) + 210 * t),
                int(225 * (1 - t) + 255 * t),
                int(255 * (1 - t) + 255 * t),
                255,
            )
            gp[x, y] = c

    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.text((xy[0] + 10, xy[1] + 12), text, font=f, fill=(0, 0, 0, 165), anchor="mm", stroke_width=stroke_w, stroke_fill=(0, 0, 0, 165))
    shadow = shadow.filter(ImageFilter.GaussianBlur(3))
    base.alpha_composite(shadow)

    outline = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(outline)
    od.text(xy, text, font=f, fill=(255, 255, 255, 255), anchor="mm", stroke_width=stroke_w + 9, stroke_fill=(255, 255, 255, 255))
    base.alpha_composite(outline)
    base.alpha_composite(Image.composite(grad, Image.new("RGBA", (W, H), (0, 0, 0, 0)), mask))


def slanted_banner(draw, x, y, w, h, text, fill, fg=(5, 12, 26), size=34):
    slant = 24
    poly = [(x + slant, y), (x + w, y), (x + w - slant, y + h), (x, y + h)]
    draw.polygon(poly, fill=fill)
    fit_text(draw, (x + w / 2, y + h / 2 - 1), text, w - 40, size, 22, fg, True, "mm")


LOGOS = {
    "doubao": ("doubao.png", "豆包"),
    "deepseek": ("deepseek.ico", "DeepSeek"),
    "kimi": ("kimi.ico", "Kimi"),
    "qwen": ("qwen-icon.png", "通义千问"),
    "yuanbao": ("yuanbao.ico", "元宝"),
    "zhipu": ("zhipu.ico", "智谱"),
}


def load_logo(filename):
    path = LOGO_DIR / filename
    img = Image.open(path)
    frames = [frame.copy().convert("RGBA") for frame in ImageSequence.Iterator(img)]
    if not frames:
        return img.convert("RGBA")
    return max(frames, key=lambda frame: frame.width * frame.height)


def ai_logo_icon(base, draw, cx, cy, brand):
    filename, label = LOGOS[brand]
    draw.ellipse((cx - 49, cy - 49, cx + 49, cy + 49), fill=(255, 255, 255), outline=(232, 255, 255), width=5)

    logo = load_logo(filename)
    logo.thumbnail((74, 74), Image.LANCZOS)
    base.alpha_composite(logo, (int(cx - logo.width / 2), int(cy - logo.height / 2)))
    fit_text(draw, (cx, cy + 58), label, 108, 18, 12, (255, 255, 255), True, "mm")


def robot_core(base):
    d = ImageDraw.Draw(base)
    add_glow(base, lambda gd, c: gd.ellipse((324, 462, 576, 714), outline=c, width=7), blur=20)
    d.ellipse((350, 480, 550, 690), fill=(12, 30, 55, 220), outline=(93, 234, 255, 190), width=4)
    rounded(d, (384, 410, 516, 500), 34, (20, 45, 78, 235), (137, 255, 247, 180), 3)
    d.ellipse((412, 445, 436, 469), fill=(204, 255, 0))
    d.ellipse((464, 445, 488, 469), fill=(204, 255, 0))
    d.line((450, 400, 450, 350), fill=(100, 240, 255, 160), width=5)
    d.ellipse((440, 336, 460, 356), fill=(204, 255, 0))
    d.line((360, 555, 265, 605), fill=(102, 255, 218, 130), width=9)
    d.line((540, 555, 635, 605), fill=(102, 255, 218, 130), width=9)


def main():
    img = bg()
    d = ImageDraw.Draw(img)

    # Top headline
    fit_text(d, (450, 92), "AI搜索问答优化", 820, 86, 56, (212, 255, 56), True, "mm", stroke=2, stroke_fill=(0, 0, 0))

    # Main GEO word
    gradient_text(img, "GEO", (325, 325), 214, 8)

    # Right badge
    add_glow(img, lambda gd, c: gd.rounded_rectangle((650, 232, 842, 442), radius=36, fill=(130, 255, 40, 95)), blur=18)
    rounded(d, (648, 232, 842, 442), 38, (179, 255, 48), (220, 255, 170), 3)
    fit_text(d, (745, 305), "AI答案", 152, 51, 34, (2, 9, 20), True, "mm")
    fit_text(d, (745, 379), "曝光", 152, 59, 38, (2, 9, 20), True, "mm")

    # Robot/tech center
    robot_core(img)

    # Selling point banners
    slanted_banner(d, 48, 510, 264, 72, "精准获客", (211, 255, 66), (7, 19, 37), 37)
    slanted_banner(d, 314, 510, 274, 72, "企业品牌", (255, 0, 72), (255, 255, 255), 39)
    slanted_banner(d, 590, 510, 262, 72, "口碑建设", (122, 255, 89), (7, 19, 37), 37)

    # AI platform logo badges
    brands = ["doubao", "deepseek", "kimi", "qwen", "yuanbao", "zhipu"]
    for i, brand in enumerate(brands):
        ai_logo_icon(img, d, 112 + i * 136, 672, brand)

    # Bottom slogan pill
    add_glow(img, lambda gd, c: gd.rounded_rectangle((36, 770, 864, 846), radius=38, fill=(124, 255, 52, 110)), blur=16)
    rounded(d, (34, 768, 866, 848), 40, (183, 255, 48), (232, 255, 165), 3)
    fit_text(d, (450, 807), "让您的品牌、产品躺进AI答案里！", 770, 48, 30, (0, 8, 18), True, "mm")

    # Extra trust strip
    rounded(d, (118, 858, 782, 890), 16, (0, 0, 0, 145), (0, 230, 255, 120), 1)
    fit_text(d, (450, 874), "关键词诊断｜内容生成｜多平台发布｜数据复盘", 620, 24, 18, (205, 255, 255), True, "mm")

    out = OUT / "00_商品封面_爆款风_900x900.jpg"
    img.convert("RGB").save(out, quality=96)
    print(out)


if __name__ == "__main__":
    main()
