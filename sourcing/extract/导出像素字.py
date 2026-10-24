#!/usr/bin/env python3
"""原版 1.20.1 默认字体的点阵，只取文案里用到的字（照旧项目 工具/游戏取材/导出思索素材.py 的像素字部分另写一份）。

用法（anim extract 按 sourcing/extract.toml 在暂存目录里调）：
  uv run --with pillow 导出像素字.py <client-1.20.1.jar> <输出.json> <文案.txt>...
文案是 UTF-8 文本，一行一句，收这一行里的每个字；以 # 开头的行是注释，空行跳过（要收「#」就别放在行首）。

字体照 1.20.1 的 font/default.json：依次是 include/space（空格步进 4、U+200C 步进 0）、include/default 里的三张位图
（nonlatin_european.png、accented.png、ascii.png），最后 include/unifont（unihex，unifont.zip 不在 jar 里，在资源索引里，
目录读环境变量 ANIM_MC_ASSETS）。每个字取第一个有它的字体（FontSet），同一张位图里重复登记的取后登记的（CodepointMap.put）。
- 位图字（BitmapProvider）：缩放 = height / 格高，字宽 = 从右往左第一列有不透明像素的列 + 1（NativeImage.getLuminanceOrAlpha，RGBA 取 alpha），
  步进 = int(0.5 + 字宽 × 缩放) + 1，
  字顶相对行顶 7 − ascent，阴影偏移 1。
- unihex（UnihexProvider）：16 行，画成一半大，size_overrides 里的区段固定左右边界；其余按有点的最左、最右列，
  全空的字左 0、右 = 位宽（8 或 16）。步进 = 宽 // 2 + 1，阴影偏移 0.5，字顶 0。
  组合附加符号（U+0300 抑音、U+0301 锐音这些）在原版里不和前一个字叠在一起：Font 逐个码位排，每个都是独立的字，带自己的步进。
输出 {字: {w, h, scale, adv, shadow, top, rows}}：rows 每行一个整数，按位从左到右（最高位是最左一列），格式同 字体/像素字。
"""
import io
import json
import os
import sys
import zipfile
from pathlib import Path

from PIL import Image

if len(sys.argv) < 4:
    sys.exit(__doc__)
if not os.environ.get('ANIM_MC_ASSETS'):
    sys.exit('要设 ANIM_MC_ASSETS：原版资源目录（indexes/、objects/），用 anim extract 跑会按配置传')
CLIENT = Path(sys.argv[1])
OUT = Path(sys.argv[2])
COPY_FILES = [Path(p) for p in sys.argv[3:]]
ASSETS = Path(os.environ['ANIM_MC_ASSETS'])
INDEX_ID = '5'  # 1.20.1 的 assetIndex.id


def asset_object(name: str) -> Path:
    digest = json.loads((ASSETS / 'indexes' / f'{INDEX_ID}.json').read_text(encoding='utf-8'))['objects'][name]['hash']
    return ASSETS / 'objects' / digest[:2] / digest


chars: set[str] = set()
for copy_file in COPY_FILES:
    for line in copy_file.read_text(encoding='utf-8').splitlines():
        if not line.strip() or line.startswith('#'):
            continue
        chars.update(line)

glyphs: dict[str, dict] = {}

# include/space
SPACE_ADVANCES = {' ': 4, '‌': 0}
for ch, adv in SPACE_ADVANCES.items():
    if ch in chars:
        glyphs[ch] = {'w': 0, 'h': 8, 'scale': 1, 'adv': adv, 'shadow': 1, 'top': 0, 'rows': []}

# include/default：三张位图
with zipfile.ZipFile(CLIENT) as client_zip:
    default = json.loads(client_zip.read('assets/minecraft/font/include/default.json'))
    for provider in default['providers']:
        if provider['type'] != 'bitmap':
            continue
        img = Image.open(io.BytesIO(client_zip.read('assets/minecraft/textures/' + provider['file'].split(':')[1]))).convert('RGBA')
        rows = provider['chars']
        cell_w = img.width // len(rows[0])
        cell_h = img.height // len(rows)
        scale = provider.get('height', 8) / cell_h
        ascent = provider['ascent']
        px = img.load()
        found: dict[str, dict] = {}
        for row_index, line in enumerate(rows):
            for col_index, ch in enumerate(line):
                if ch == '\0' or ch not in chars or ch in glyphs:
                    continue
                x0, y0 = col_index * cell_w, row_index * cell_h
                w = 0
                for x in range(cell_w - 1, -1, -1):
                    if any(px[x0 + x, y0 + y][3] for y in range(cell_h)):
                        w = x + 1
                        break
                bits = [sum(1 << (w - 1 - x) for x in range(w) if px[x0 + x, y0 + y][3]) for y in range(cell_h)]
                found[ch] = {'w': w, 'h': cell_h, 'scale': scale, 'adv': int(0.5 + w * scale) + 1, 'shadow': 1, 'top': 7 - ascent, 'rows': bits}
        glyphs.update(found)

# include/unifont
need = {ord(ch) for ch in chars if ch not in glyphs}
if need:
    unifont = json.loads(asset_object('minecraft/font/include/unifont.json').read_text(encoding='utf-8'))['providers'][0]
    overrides = [(ord(o['from']), ord(o['to']), o['left'], o['right']) for o in unifont['size_overrides']]
    with zipfile.ZipFile(asset_object('minecraft/font/unifont.zip')) as unifont_zip:
        for member in unifont_zip.namelist():
            if not member.endswith('.hex'):
                continue
            for line in unifont_zip.read(member).decode().splitlines():
                code, data = line.split(':')
                cp = int(code, 16)
                if cp not in need:
                    continue
                bit_w = len(data) * 4 // 16
                rows = [int(data[i * bit_w // 4:(i + 1) * bit_w // 4], 16) for i in range(16)]
                override = next(((l, r) for a, b, l, r in overrides if a <= cp <= b), None)
                if override:
                    left, right = override
                else:
                    cols = [x for x in range(bit_w) if any(row >> (bit_w - 1 - x) & 1 for row in rows)]
                    left, right = (cols[0], cols[-1]) if cols else (0, bit_w)
                w = right - left + 1
                bits = [(row >> (bit_w - 1 - right)) & ((1 << w) - 1) if right < bit_w else (row << (right - bit_w + 1)) & ((1 << w) - 1) for row in rows]
                glyphs[chr(cp)] = {'w': w, 'h': 16, 'scale': 0.5, 'adv': w // 2 + 1, 'shadow': 0.5, 'top': 0, 'rows': bits}

missing = sorted(ch for ch in chars if ch not in glyphs)
if missing:
    sys.exit(f'这些字在原版字体里找不到（游戏里会画成缺字方框）：{[f"{c} U+{ord(c):04X}" for c in missing]}')
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(dict(sorted(glyphs.items())), ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'像素字 {len(glyphs)} 个 → {OUT}')
