#!/usr/bin/env python3
"""乔雷夫（7-4-4 边城新城主）的占位皮肤：没有设定图，只拍背影和手（脚本规划 7-4-4），先用原版默认皮肤史蒂夫换一身深色衣服。

做法：拿 卫兵.贴图/皮肤8-steve.png（npm run 取材 -- 边城贴图 从 1.20.1 客户端 jar 原样拷出的默认皮肤，64×64），
身子、两臂、两腿（里外两层）上不是皮肤色的像素（衬衫的青、裤子的蓝紫、鞋的灰）按亮度换成深色：上衣深蓝灰、裤子近黑、鞋深棕；
脸、头发、手（皮肤色）不动。皮肤色的判定：红 > 蓝 + 25 且 红 ≥ 绿（史蒂夫的肤色和头发都是暖棕色，衣服都是冷色）。
用法：anim extract 乔雷夫皮肤（在暂存目录里跑，目录布局照旧项目的 参考模型库/；前置 边城贴图 先在同一个暂存目录里跑）
输出：src/模型/角色/乔雷夫.png
"""
from pathlib import Path

from PIL import Image

ROOT = Path.cwd()
src = Image.open(ROOT / 'src/模型/角色/卫兵.贴图/皮肤8-steve.png').convert('RGBA')
im = src.copy()
px = im.load()

# 64×64 皮肤的各部分（x0, y0, x1, y1）和换成什么颜色
JACKET_COLOR = (44, 48, 62)
PANTS_COLOR = (30, 30, 36)
SHOE_COLOR = (52, 38, 30)
RECOLOR_REGIONS = [
    ((16, 16, 40, 32), JACKET_COLOR), ((16, 32, 40, 48), JACKET_COLOR),  # 身子、外套层
    ((40, 16, 56, 32), JACKET_COLOR), ((40, 32, 56, 48), JACKET_COLOR),  # 右臂、袖子层
    ((32, 48, 48, 64), JACKET_COLOR), ((48, 48, 64, 64), JACKET_COLOR),  # 左臂、袖子层
    ((0, 16, 16, 32), PANTS_COLOR), ((0, 32, 16, 48), PANTS_COLOR),  # 右腿、裤子层
    ((16, 48, 32, 64), PANTS_COLOR), ((0, 48, 16, 64), PANTS_COLOR),  # 左腿、裤子层
]


def is_skin_tone(r, g, b):
    return r > b + 25 and r >= g


for (x0, y0, x1, y1), color in RECOLOR_REGIONS:
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b, a = px[x, y]
            if a == 0 or is_skin_tone(r, g, b):
                continue
            lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255
            c = color
            # 腿的最下面 3 行是鞋（史蒂夫的鞋是灰色）
            if color is PANTS_COLOR and (y - y0) % 16 >= 13 and (y - y0) % 16 < 16 and y0 in (16, 48) and (y - y0) >= 4:
                c = SHOE_COLOR
            k = 0.75 + 0.6 * (lum - 0.4)  # 保留一点原来的明暗纹理
            px[x, y] = tuple(max(0, min(255, int(v * k))) for v in c) + (a,)

# 长袖：史蒂夫的小臂是光着的，城主穿长袖外套。两臂里层四个侧面（每臂的 y0+4 起 12 行）前 10 行都换成上衣色，
# 最后 2 行和底面（手）留皮肤色，露出一截手
for x0, y0 in ((40, 16), (32, 48)):
    for y in range(y0 + 4, y0 + 14):
        for x in range(x0, x0 + 16):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255
            k = 0.85 + 0.3 * (lum - 0.4)
            px[x, y] = tuple(max(0, min(255, int(v * k))) for v in JACKET_COLOR) + (a,)

out = ROOT / 'src/模型/角色/乔雷夫.png'
im.save(out)
print('已写', out)
