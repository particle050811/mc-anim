# -*- coding: utf-8 -*-
"""把 build_li_ying.render_showcase_parts() 输出的透明 PNG 拼成分享用的图。

用法：uv run --with pillow python make_showcase.py <素材目录> <输出目录> [文件名后缀]
输出：李樱_展示卡.png（2400×1350）、李樱_3D展示.png（站姿 3/4，1800×1800）、李樱_动作_透明底.png
（给了后缀如 "_自然光" 时，文件名变成 李樱_展示卡_自然光.png 等）
所有素材只缩小不放大（放大会糊）。
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT = "/System/Library/Fonts/Hiragino Sans GB.ttc"   # index 0 = W3，1 = W6
BRASS = (226, 178, 82)


def font(size, bold=False):
    return ImageFont.truetype(FONT, size, index=1 if bold else 0)


def gradient_bg(W, H, glow_box=None):
    """深灰到暖橙的竖向渐变（同参考立绘的背景），加很淡的像素网格和人物背后的暖光。"""
    stops = [(0.0, (30, 33, 40)), (0.5, (58, 52, 54)), (1.0, (196, 102, 46))]
    col = Image.new("RGB", (1, H))
    px = col.load()
    for y in range(H):
        t = y / (H - 1)
        for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
            if t0 <= t <= t1:
                k = (t - t0) / (t1 - t0)
                px[0, y] = tuple(int(c0[i] + (c1[i] - c0[i]) * k) for i in range(3))
                break
    bg = col.resize((W, H)).convert("RGBA")
    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(grid)
    for x in range(0, W, 40):
        d.line([(x, 0), (x, H)], fill=(255, 255, 255, 8))
    for y in range(0, H, 40):
        d.line([(0, y), (W, y)], fill=(255, 255, 255, 8))
    bg = Image.alpha_composite(bg, grid)
    if glow_box:
        glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(glow).ellipse(glow_box, fill=(255, 150, 70, 64))
        bg = Image.alpha_composite(bg, glow.filter(ImageFilter.GaussianBlur(150)))
    return bg


def trim(im, pad=0):
    x0, y0, x1, y1 = im.getchannel("A").getbbox()
    return im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))


def fit(im, max_w, max_h):
    """等比缩放到框内；只缩小，不放大。"""
    s = min(max_w / im.width, max_h / im.height, 1.0)
    if s >= 0.999:
        return im
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)


def card(canvas, box, label):
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle(box, radius=22, fill=(10, 12, 18, 128), outline=(226, 178, 82, 96), width=2)
    canvas.alpha_composite(layer)
    ImageDraw.Draw(canvas).text((box[0] + 24, box[1] + 16), label, font=font(28, True), fill=BRASS)


def paste_center(canvas, im, box, top_pad=60, bottom_pad=22, side_pad=22):
    x0, y0, x1, y1 = box
    im = fit(im, x1 - x0 - 2 * side_pad, y1 - y0 - top_pad - bottom_pad)
    x = x0 + (x1 - x0 - im.width) // 2
    y = y0 + top_pad + (y1 - y0 - top_pad - bottom_pad - im.height) // 2
    canvas.alpha_composite(im, (x, y))


def showcase(src, out, sfx=""):
    J = lambda n: Image.open(os.path.join(src, n)).convert("RGBA")
    W, H = 2400, 1350
    cv = gradient_bg(W, H, (170, 170, 1110, 1310))

    hero = fit(trim(J("hero.png")), 1150, 1250)
    cv.alpha_composite(hero, (645 - hero.width // 2, 1305 - hero.height))

    d = ImageDraw.Draw(cv)
    X = 1250
    d.text((X, 52), "李樱", font=font(132, True), fill=(255, 244, 228))
    tw = d.textlength("李樱", font=font(132, True))
    d.text((X + tw + 28, 122), "LI  YING", font=font(40, True), fill=BRASS)
    d.text((X, 226), "《机械动力·应力转动》主角", font=font(42, True), fill=(244, 222, 196))
    d.text((X, 286), "蒸汽朋克机械师  ·  方块人 3D 模型", font=font(32), fill=(208, 198, 188))
    d.rectangle([X, 344, 2330, 348], fill=BRASS)

    views_box = (X, 372, 2330, 846)
    card(cv, views_box, "三视图")
    views = [fit(trim(J("view_%s.png" % n)), 10000, 356) for n in ("front", "side", "back")]
    gap = (views_box[2] - views_box[0] - sum(v.width for v in views)) // 4
    x = views_box[0] + gap
    for v, lab in zip(views, ("正面", "侧面", "背面")):
        cv.alpha_composite(v, (x, views_box[3] - 52 - v.height))
        lw = d.textlength(lab, font=font(24))
        d.text((x + (v.width - lw) / 2, views_box[3] - 44), lab, font=font(24), fill=(200, 190, 178))
        x += v.width + gap

    row = (870, 1296)
    boxes = ((X, row[0], X + 390, row[1]), (X + 410, row[0], X + 630, row[1]), (X + 650, row[0], 2330, row[1]))
    card(cv, boxes[0], "面部细节")
    paste_center(cv, trim(J("face.png"), 6), boxes[0])
    card(cv, boxes[1], "扳手")
    paste_center(cv, trim(J("item_wrench.png")), boxes[1])
    card(cv, boxes[2], "枯石太刀")
    paste_center(cv, trim(J("item_katana.png")), boxes[2])

    d.text((X, 1308), "Blender 5.2  ·  体素建模  ·  关节可动  ·  可拔刀", font=font(24), fill=(236, 214, 190))
    cv.convert("RGB").save(os.path.join(out, "李樱_展示卡%s.png" % sfx), optimize=True)


def poster(src, out, sfx=""):
    """站姿 3/4 大图：同款渐变背景。"""
    im = trim(Image.open(os.path.join(src, "stand34.png")).convert("RGBA"), 0)
    S = 1800
    cv = gradient_bg(S, S, (250, 300, 1550, 1750))
    im = fit(im, int(S * 0.8), int(S * 0.9))
    cv.alpha_composite(im, ((S - im.width) // 2, S - 90 - im.height))
    cv.convert("RGB").save(os.path.join(out, "李樱_3D展示%s.png" % sfx), optimize=True)


def hero_png(src, out, sfx=""):
    im = trim(Image.open(os.path.join(src, "hero.png")).convert("RGBA"), 40)
    im.save(os.path.join(out, "李樱_动作_透明底%s.png" % sfx), optimize=True)


if __name__ == "__main__":
    s, o = sys.argv[1], sys.argv[2]
    sfx = sys.argv[3] if len(sys.argv) > 3 else ""
    showcase(s, o, sfx)
    poster(s, o, sfx)
    hero_png(s, o, sfx)
