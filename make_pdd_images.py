from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math
from pathlib import Path

OUT = Path("/Users/emily/Desktop/geo/pdd商品图")
OUT.mkdir(exist_ok=True)

W, H = 900, 1200
COVER = 900
FONT = "/System/Library/Fonts/STHeiti Light.ttc"
HEI = "/System/Library/Fonts/STHeiti Medium.ttc"


def font(size, bold=False):
    return ImageFont.truetype(HEI if bold else FONT, size)


def rounded(draw, box, r, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def shadowed_card(img, box, r=28, fill=(255, 255, 255), shadow=(15, 42, 96, 55)):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle(box, radius=r, fill=shadow)
    layer = layer.filter(ImageFilter.GaussianBlur(18))
    img.alpha_composite(layer)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(box, radius=r, fill=fill)


def gradient_bg(w, h, c1=(18, 84, 235), c2=(46, 221, 198), c3=(255, 255, 255)):
    img = Image.new("RGB", (w, h), c1)
    pix = img.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        for x in range(w):
            s = (x / max(w - 1, 1)) * 0.35 + t * 0.65
            if s < 0.62:
                k = s / 0.62
                c = tuple(int(c1[i] * (1 - k) + c2[i] * k) for i in range(3))
            else:
                k = (s - 0.62) / 0.38
                c = tuple(int(c2[i] * (1 - k) + c3[i] * k) for i in range(3))
            pix[x, y] = c
    return img.convert("RGBA")


def text(draw, xy, s, size=40, color=(15, 23, 42), bold=False, anchor=None, spacing=8):
    draw.multiline_text(xy, s, font=font(size, bold), fill=color, anchor=anchor, spacing=spacing)


def fit_text(draw, xy, s, max_w, start, min_size, color, bold=False, anchor=None):
    size = start
    while size >= min_size:
        f = font(size, bold)
        if draw.textbbox((0, 0), s, font=f)[2] <= max_w:
            draw.text(xy, s, font=f, fill=color, anchor=anchor)
            return size
        size -= 2
    draw.text(xy, s, font=font(min_size, bold), fill=color, anchor=anchor)
    return min_size


def wrap(draw, s, max_w, f):
    lines, cur = [], ""
    for ch in s:
        test = cur + ch
        if draw.textbbox((0, 0), test, font=f)[2] <= max_w:
            cur = test
        else:
            if cur:
                lines.append(cur)
            cur = ch
    if cur:
        lines.append(cur)
    return "\n".join(lines)


def pill(draw, x, y, w, h, label, fill, fg=(255, 255, 255), size=30, outline=None):
    rounded(draw, (x, y, x + w, y + h), h // 2, fill, outline=outline, width=2)
    fit_text(draw, (x + w / 2, y + h / 2 - 2), label, w - 34, size, 18, fg, True, "mm")


def logo(draw, x, y, scale=1.0, dark=False):
    brand_c = (255, 255, 255) if not dark else (23, 37, 84)
    mark_c = (37, 99, 235) if not dark else (23, 37, 84)
    rounded(draw, (x, y, x + int(48 * scale), y + int(48 * scale)), int(14 * scale), (255, 255, 255, 235) if not dark else (219, 234, 254))
    draw.text((x + int(24 * scale), y + int(23 * scale)), "G", font=font(int(30 * scale), True), fill=mark_c, anchor="mm")
    draw.text((x + int(62 * scale), y + int(23 * scale)), "GEO Studio", font=font(int(28 * scale), True), fill=brand_c, anchor="lm")


def draw_mock_ui(draw, x, y, w, h):
    rounded(draw, (x, y, x + w, y + h), 26, (15, 23, 42))
    rounded(draw, (x + 16, y + 16, x + w - 16, y + 58), 14, (30, 41, 59))
    for i, c in enumerate([(248, 113, 113), (251, 191, 36), (52, 211, 153)]):
        draw.ellipse((x + 32 + i * 24, y + 30, x + 44 + i * 24, y + 42), fill=c)
    text(draw, (x + 32, y + 78), "行业关键词诊断", 22, (226, 232, 240), True)
    rounded(draw, (x + 32, y + 120, x + w - 32, y + 174), 16, (49, 46, 129))
    text(draw, (x + 52, y + 132), "输入：电动车 / 湘菜馆 / 本地门店", 22, (255, 255, 255), False)
    cols = [(x + 32, "高意向词", "蓝海需求  86%"), (x + 236, "内容生成", "AI草稿  12篇"), (x + 440, "收录监控", "待发布  5个平台")]
    for cx, a, b in cols:
        rounded(draw, (cx, y + 210, cx + 170, y + 330), 18, (30, 41, 59), (71, 85, 105), 1)
        text(draw, (cx + 18, y + 230), a, 24, (125, 211, 252), True)
        text(draw, (cx + 18, y + 276), b, 20, (203, 213, 225))
    for i in range(5):
        yy = y + 370 + i * 42
        rounded(draw, (x + 32, yy, x + w - 32, yy + 26), 13, (30, 41, 59))
        rounded(draw, (x + 32, yy, x + 100 + i * 72, yy + 26), 13, (45, 212, 191))


def page_base(title, subtitle="", top_dark=True):
    img = gradient_bg(W, H, (20, 76, 210), (52, 211, 153), (245, 250, 255))
    d = ImageDraw.Draw(img)
    logo(d, 52, 46, 0.9)
    if subtitle:
        text(d, (54, 106), subtitle, 26, (219, 234, 254))
    fit_text(d, (54, 174), title, 790, 64, 40, (255, 255, 255), True)
    return img, d


def save(img, name):
    path = OUT / name
    img.convert("RGB").save(path, quality=96)
    print(path)


def cover():
    img = gradient_bg(COVER, COVER, (9, 61, 188), (20, 184, 166), (232, 247, 255))
    d = ImageDraw.Draw(img)
    logo(d, 58, 46, 1.05)
    text(d, (58, 145), "AI搜索时代", 52, (255, 244, 184), True)
    fit_text(d, (58, 218), "GEO优化推广系统", 810, 78, 42, (255, 255, 255), True)
    text(d, (62, 306), "让企业出现在 AI 的答案里", 36, (224, 255, 251), True)
    draw_mock_ui(d, 95, 395, 710, 300)
    pills = [("关键词诊断", 70), ("内容生成", 270), ("多平台发布", 470), ("数据报表", 670)]
    for label, x in pills:
        pill(d, x, 730, 160, 56, label, (255, 255, 255), (20, 83, 45), 25)
    rounded(d, (72, 820, 828, 875), 27, (255, 255, 255, 235), (255, 255, 255, 255), 2)
    text(d, (450, 847), "软件服务｜源码/贴牌/部署可咨询", 28, (30, 64, 175), True, "mm")
    save(img, "00_商品封面_900x900.jpg")


def page1():
    img, d = page_base("你的客户，已经开始问 AI", "从搜索链接，变成直接要答案")
    shadowed_card(img, (54, 282, 846, 1084), 34)
    d = ImageDraw.Draw(img)
    text(d, (94, 326), "以前：客户自己翻网页", 38, (30, 64, 175), True)
    text(d, (112, 395), "百度 / 抖音 / 小红书\n点链接、比价格、问客服", 30, (71, 85, 105))
    d.line((120, 535, 780, 535), fill=(203, 213, 225), width=3)
    text(d, (94, 590), "现在：客户直接问 AI", 42, (15, 118, 110), True)
    for i, t in enumerate(["“附近哪家电动车靠谱？”", "“哪家湘菜馆适合聚餐？”", "“这款产品哪个牌子好？”"]):
        pill(d, 126, 670 + i * 86, 648, 58, t, (37, 99, 235) if i != 1 else (20, 184, 166), size=31)
    f = font(30, True)
    d.multiline_text(
        (110, 940),
        wrap(d, "GEO 的核心：把你的产品、案例、服务信息，整理成 AI 更愿意引用的答案。", 680, f),
        font=f,
        fill=(15, 23, 42),
        spacing=10,
    )
    save(img, "01_AI搜索时代_900x1200.jpg")


def page2():
    img, d = page_base("软件能帮你做什么", "适合产品推广、本地生活、AI搜索排名布局")
    shadowed_card(img, (54, 276, 846, 1100), 34)
    d = ImageDraw.Draw(img)
    items = [
        ("01", "挖词", "生成用户真实会问的产品和门店问题"),
        ("02", "写文案", "AI一键生成推广文章、问答、产品介绍"),
        ("03", "铺平台", "适配公众号、知乎、搜狐、百家号等内容发布"),
        ("04", "看数据", "关键词、文章、平台状态集中查看"),
        ("05", "省人力", "减少反复写稿、复制、整理表格的时间"),
        ("06", "可复制", "一个行业跑通后，可继续做多个词组"),
    ]
    for i, (num, title, desc) in enumerate(items):
        x = 94 + (i % 2) * 380
        y = 326 + (i // 2) * 218
        rounded(d, (x, y, x + 324, y + 166), 24, (239, 246, 255), (191, 219, 254), 2)
        text(d, (x + 24, y + 22), num, 34, (37, 99, 235), True)
        text(d, (x + 92, y + 23), title, 34, (15, 23, 42), True)
        f = font(24)
        d.multiline_text((x + 24, y + 82), wrap(d, desc, 270, f), font=f, fill=(51, 65, 85), spacing=8)
    pill(d, 148, 1005, 604, 62, "把零散营销动作，变成一套可执行流程", (37, 99, 235), size=30)
    save(img, "02_核心功能_900x1200.jpg")


def page3():
    img, d = page_base("GEO Studio 工作台", "5步完成：选词、生成、发布、跟踪")
    draw_mock_ui(d, 94, 286, 712, 394)
    steps = [("1", "输入行业"), ("2", "AI扩展词库"), ("3", "生成内容"), ("4", "多平台发布"), ("5", "数据复盘")]
    for i, (n, label) in enumerate(steps):
        x = 90 + i * 160
        y = 770
        d.ellipse((x, y, x + 68, y + 68), fill=(255, 255, 255))
        text(d, (x + 34, y + 34), n, 34, (37, 99, 235), True, "mm")
        fit_text(d, (x + 34, y + 100), label, 140, 26, 18, (255, 255, 255), True, "mm")
        if i < 4:
            d.line((x + 76, y + 34, x + 148, y + 34), fill=(255, 255, 255, 160), width=5)
    shadowed_card(img, (78, 930, 822, 1102), 28, (255, 255, 255, 235))
    d = ImageDraw.Draw(img)
    text(d, (116, 965), "对编程新手友好", 38, (15, 23, 42), True)
    text(d, (116, 1026), "按按钮走流程，减少复杂配置；需要部署时可远程协助。", 29, (51, 65, 85))
    save(img, "03_软件工作台_900x1200.jpg")


def page4():
    img, d = page_base("GEO 对比传统 SEO", "AI答案入口正在成为新流量入口")
    shadowed_card(img, (54, 282, 846, 1080), 34)
    d = ImageDraw.Draw(img)
    rounded(d, (96, 330, 410, 400), 24, (226, 232, 240))
    rounded(d, (490, 330, 804, 400), 24, (37, 99, 235))
    text(d, (253, 365), "传统 SEO", 34, (71, 85, 105), True, "mm")
    text(d, (647, 365), "GEO 优化", 34, (255, 255, 255), True, "mm")
    rows = [
        ("搜索结果多为链接", "AI回答里直接曝光"),
        ("等用户主动点击", "答案主动推荐品牌"),
        ("关键词竞争激烈", "长尾问题更容易切入"),
        ("更新慢、链路长", "内容可持续训练迭代"),
        ("只看搜索平台", "覆盖主流AI平台"),
    ]
    for i, (a, b) in enumerate(rows):
        y = 456 + i * 106
        text(d, (115, y), "×", 34, (239, 68, 68), True)
        text(d, (158, y), a, 28, (71, 85, 105), True)
        text(d, (512, y), "√", 34, (16, 185, 129), True)
        text(d, (558, y), b, 28, (15, 23, 42), True)
        d.line((100, y + 58, 800, y + 58), fill=(226, 232, 240), width=2)
    pill(d, 156, 1000, 588, 62, "SEO是链接，GEO是进入AI答案", (20, 184, 166), size=32)
    save(img, "04_GEO对比SEO_900x1200.jpg")


def page5():
    img, d = page_base("适合哪些客户", "产品商家、本地生活门店都能做")
    shadowed_card(img, (54, 282, 846, 1082), 34)
    d = ImageDraw.Draw(img)
    data = [
        ("产品品牌", "电动车、家电、酒水、食品等产品推广"),
        ("本地门店", "湘菜馆、火锅店、理发店、维修店等"),
        ("生活服务", "装修、培训、家政、摄影、咨询获客"),
        ("厂家批发", "把产品优势、价格、案例沉淀成内容"),
        ("软件工具", "功能说明、教程问答、竞品对比内容"),
        ("个人IP", "把经验文章整理成AI可引用的资料"),
    ]
    for i, (a, b) in enumerate(data):
        x = 96 + (i % 2) * 374
        y = 330 + (i // 2) * 212
        rounded(d, (x, y, x + 318, y + 158), 24, (241, 245, 249), (203, 213, 225), 2)
        text(d, (x + 26, y + 25), a, 34, (30, 64, 175), True)
        f = font(24)
        d.multiline_text((x + 26, y + 84), wrap(d, b, 260, f), font=f, fill=(51, 65, 85), spacing=7)
    text(d, (115, 1010), "一句话：只要客户会在网上搜索、提问、比较，你就值得提前做 GEO。", 31, (15, 23, 42), True)
    save(img, "05_适合客户_900x1200.jpg")


def page_ai_result():
    img, d = page_base("优化后是什么效果", "用户问 AI，商家产品/门店排在前面")
    shadowed_card(img, (54, 278, 846, 1102), 34)
    d = ImageDraw.Draw(img)

    rounded(d, (94, 326, 804, 420), 28, (239, 246, 255), (191, 219, 254), 2)
    text(d, (124, 350), "用户提问", 26, (37, 99, 235), True)
    text(d, (124, 385), "附近买电动车，哪家售后靠谱？", 32, (15, 23, 42), True)

    rounded(d, (94, 456, 804, 800), 30, (248, 250, 252), (203, 213, 225), 2)
    text(d, (124, 486), "AI回答示例", 26, (15, 118, 110), True)
    rounded(d, (124, 536, 774, 650), 22, (220, 252, 231), (52, 211, 153), 2)
    text(d, (148, 558), "TOP 1  XX电动车", 38, (20, 83, 45), True)
    text(d, (148, 614), "门店近、售后响应快、车型介绍清楚", 25, (22, 101, 52))

    for i, (name, desc) in enumerate([
        ("TOP 2  A品牌门店", "价格信息较少，评价分散"),
        ("TOP 3  B电动车行", "车型覆盖一般，售后内容少"),
    ]):
        y = 674 + i * 64
        rounded(d, (124, y, 774, y + 48), 18, (255, 255, 255), (226, 232, 240), 1)
        text(d, (148, y + 11), name, 24, (71, 85, 105), True)
        text(d, (430, y + 11), desc, 22, (100, 116, 139))

    rounded(d, (94, 842, 804, 1012), 28, (239, 246, 255), (191, 219, 254), 2)
    text(d, (124, 874), "本地生活也能做", 31, (30, 64, 175), True)
    text(d, (124, 930), "例：用户问“附近湘菜馆哪家适合聚餐？”", 26, (51, 65, 85))
    pill(d, 124, 974, 650, 54, "目标：让 XX湘菜馆 出现在推荐答案前列", (37, 99, 235), size=26)

    text(d, (112, 1055), "说明：展示为效果示意，实际排名受平台算法、内容质量和持续优化影响。", 23, (100, 116, 139))
    save(img, "08_优化后AI提问效果_900x1200.jpg")


def page6():
    img, d = page_base("交付更省心", "软件服务商品，先沟通需求再下单")
    shadowed_card(img, (54, 278, 846, 1088), 34)
    d = ImageDraw.Draw(img)
    rows = [
        ("需求确认", "确认行业、关键词、平台账号、套餐范围"),
        ("远程演示", "可看软件流程，明白买到的是什么"),
        ("部署/授权", "按约定提供软件、源码、贴牌或部署服务"),
        ("使用指导", "提供基础教程，帮你完成首次操作"),
        ("持续优化", "后续可按词组、平台、周期继续合作"),
    ]
    for i, (a, b) in enumerate(rows):
        y = 342 + i * 132
        d.ellipse((96, y, 158, y + 62), fill=(37, 99, 235))
        text(d, (127, y + 31), str(i + 1), 31, (255, 255, 255), True, "mm")
        text(d, (184, y - 4), a, 34, (15, 23, 42), True)
        text(d, (184, y + 48), b, 26, (71, 85, 105))
        if i < len(rows) - 1:
            d.line((127, y + 72, 127, y + 120), fill=(147, 197, 253), width=4)
    rounded(d, (92, 1015, 808, 1070), 20, (254, 243, 199))
    text(d, (450, 1043), "排名和收录受平台算法影响，下单前请先确认方案", 25, (146, 64, 14), True, "mm")
    save(img, "06_交付售后_900x1200.jpg")


def page7():
    img, d = page_base("下单前必看", "避免误会，软件服务更适合长期布局")
    shadowed_card(img, (54, 278, 846, 1088), 34)
    d = ImageDraw.Draw(img)
    tips = [
        ("不是刷量", "GEO不是机器刷点击，而是持续制作可被AI理解的内容资料。"),
        ("不是包排名", "AI平台、搜索平台算法会变化，不承诺百分百第一名。"),
        ("先沟通产品", "不同产品和门店关键词不同，建议先发类目和需求给客服。"),
        ("越早越好", "AI搜索还在增长期，先沉淀内容的人更容易抢到机会。"),
    ]
    y = 332
    for title, desc in tips:
        rounded(d, (96, y, 804, y + 142), 24, (239, 246, 255), (191, 219, 254), 2)
        text(d, (126, y + 24), title, 34, (30, 64, 175), True)
        f = font(25)
        d.multiline_text((126, y + 78), wrap(d, desc, 620, f), font=f, fill=(51, 65, 85), spacing=7)
        y += 166
    pill(d, 126, 1020, 648, 62, "联系客服：确认套餐、演示、部署方式", (239, 68, 68), size=30)
    save(img, "07_下单前必看_900x1200.jpg")


for maker in [cover, page1, page_ai_result, page2, page3, page4, page5, page6, page7]:
    maker()
