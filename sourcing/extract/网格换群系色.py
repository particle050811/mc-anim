#!/usr/bin/env python3
"""把 mcai mesh 导出的方块网格（.网格.bin）里按群系染的颜色换成另一个群系的：草方块顶、草、花簇的茎、藤蔓这些。

顶点色是 游戏里乘在贴图上的系数 = 群系染色 × 环境光遮蔽（sRGB 数值上相乘，导出时朝向明暗恒为 1，见 engine/voxel/方块网格.tsx）。
所以一个染过的顶点 c = 原色 × k（每个通道同一个 k），换成 新色 × k 就是另一个群系里同一处的颜色。
原色给几种（导出那块地方的草色、树叶色可能不一样，花簇的茎和草方块也可能取到不同的混合结果），每个染过的顶点按 r/g、b/g 归到最近的那种，k = c.g / 原色.g。
不是染过的：灰的（r = g = b）不动，蓝比绿多的（水）不动。

用法：网格换群系色.py <输入 .bin> <输出 .bin> <新色 #rrggbb> <原色 #rrggbb> [<原色>…]
.bin 是 gzip 压过的顶点（28 字节一个：位置 3×f32、uv 2×f32、颜色 4×u8、贴图号 u32），输出照样 gzip（mtime 0，字节可复现）。
"""
import gzip
import sys


def color_from_hex(hex_: str) -> tuple[int, int, int]:
    h = hex_.lstrip('#')
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def main() -> None:
    if len(sys.argv) < 5:
        sys.exit(__doc__)
    in_path, out_path, new_hex, *orig_args = sys.argv[1:]
    new_color = color_from_hex(new_hex)
    orig_colors = [color_from_hex(x) for x in orig_args]
    raw = open(in_path, 'rb').read()
    if raw[:2] == b'\x1f\x8b':
        raw = gzip.decompress(raw)
    buf = bytearray(raw)
    stride = 28
    if len(buf) % stride:
        sys.exit(f'{in_path}：长度 {len(buf)} 不是 28 的倍数')
    changed_count = 0
    for at in range(20, len(buf), stride):
        r, g, b = buf[at], buf[at + 1], buf[at + 2]
        if r == g == b or g == 0 or b > g:
            continue
        nearest_color = min(orig_colors, key=lambda o: (r / g - o[0] / o[1]) ** 2 + (b / g - o[2] / o[1]) ** 2)
        k = g / nearest_color[1]
        buf[at:at + 3] = bytes(min(255, round(c * k)) for c in new_color)
        changed_count += 1
    with open(out_path, 'wb') as f:
        f.write(gzip.compress(bytes(buf), compresslevel=9, mtime=0))
    print(f'改了 {changed_count} 个顶点的颜色 → {out_path}')


if __name__ == '__main__':
    main()
