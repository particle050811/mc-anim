#!/usr/bin/env python3
"""从整合包（.mrpack，zip）里层的模组 jar 取一个结构模板（.nbt），只留 y >= 切 的方块、整体下移 切 格，实体全丢。

给《亚波伦不放水》的粉色婚礼教堂用：整合包《诡厄：使徒》的 graemod:0721，y 0～5 是地下室（不入镜，用户 11-09 定只要地上），
19 个实体也全在地下室。带类型的 NBT 读写：没碰的标签字节原样写回，先核对原文件读写往返逐字节一样再裁。
输出 gzip 的 mtime 写 0，同一输入字节可复现。

用法（anim extract 按 sourcing/extract.toml 在暂存目录里调）：
  python3 裁结构.py <整合包.mrpack> <包里的 jar 路径> <jar 里的 .nbt 路径> <切 y> <输出 .nbt>
"""
import gzip
import hashlib
import io
import struct
import sys
import zipfile
from pathlib import Path

定长 = {1: 1, 2: 2, 3: 4, 4: 8, 5: 4, 6: 8}


def 读(b: bytes):
    p = [0]

    def u(f: str, n: int):
        v = struct.unpack_from(f, b, p[0])
        p[0] += n
        return v[0]

    def 取(n: int) -> bytes:
        v = b[p[0]:p[0] + n]
        p[0] += n
        return v

    def 串() -> bytes:
        return 取(u('>H', 2))

    def 值(t: int):
        if t in 定长:
            return (t, 取(定长[t]))
        if t == 7:
            return (t, 取(u('>i', 4)))
        if t == 8:
            return (t, 串())
        if t == 9:
            tt = u('>b', 1)
            n = u('>i', 4)
            return (t, tt, [值(tt) for _ in range(n)])
        if t == 10:
            d = []
            while True:
                tt = u('>b', 1)
                if tt == 0:
                    return (t, d)
                k = 串()
                d.append((k, 值(tt)))
        if t in (11, 12):
            n = u('>i', 4)
            return (t, n, 取((4 if t == 11 else 8) * n))
        raise ValueError(f'不认识的 NBT 标签 {t}')

    t = u('>b', 1)
    名 = 串()
    return t, 名, 值(t)


def 写(t: int, 名: bytes, v) -> bytes:
    o = bytearray()

    def 串(x: bytes):
        o.extend(struct.pack('>H', len(x)))
        o.extend(x)

    def 值(v):
        t = v[0]
        if t in 定长:
            o.extend(v[1])
        elif t == 7:
            o.extend(struct.pack('>i', len(v[1])))
            o.extend(v[1])
        elif t == 8:
            串(v[1])
        elif t == 9:
            o.extend(struct.pack('>bi', v[1], len(v[2])))
            for x in v[2]:
                值(x)
        elif t == 10:
            for k, x in v[1]:
                o.extend(struct.pack('>b', x[0]))
                串(k)
                值(x)
            o.append(0)
        else:
            o.extend(struct.pack('>i', v[1]))
            o.extend(v[2])

    o.extend(struct.pack('>b', t))
    串(名)
    值(v)
    return bytes(o)


def 裁(原: bytes, 切: int) -> bytes:
    t, 名, 根 = 读(原)
    if 写(t, 名, 根) != 原:
        raise SystemExit('读写往返不一致，不裁')
    整 = lambda x: struct.unpack('>i', x[1])[0]
    造 = lambda n: (3, struct.pack('>i', n))
    出 = []
    for k, v in 根[1]:
        if k == b'blocks':
            留 = []
            for 块 in v[2]:
                位 = next(x for kk, x in 块[1] if kk == b'pos')
                y = 整(位[2][1])
                if y < 切:
                    continue
                留.append((10, [(kk, (9, 3, [x[2][0], 造(y - 切), x[2][2]]) if kk == b'pos' else x) for kk, x in 块[1]]))
            print(f'方块 {len(v[2])} → {len(留)}')
            v = (9, 10, 留)
        elif k == b'entities':
            print(f'实体 {len(v[2])} → 0')
            v = (9, 10 if v[2] else v[1], [])
        elif k == b'size':
            尺 = [整(x) for x in v[2]]
            v = (9, 3, [造(尺[0]), 造(尺[1] - 切), 造(尺[2])])
            print(f'size {尺} → {[尺[0], 尺[1] - 切, 尺[2]]}')
        出.append((k, v))
    return 写(t, 名, (10, 出))


def main(argv: list[str]) -> int:
    if len(argv) != 5:
        print(__doc__, file=sys.stderr)
        return 2
    包, 里层jar, 条目, 切, 输出 = argv
    with zipfile.ZipFile(包) as z:
        with zipfile.ZipFile(io.BytesIO(z.read(里层jar))) as j:
            原 = j.read(条目)
    print(f'{条目}：sha256 {hashlib.sha256(原).hexdigest()}')
    数据 = 裁(gzip.decompress(原), int(切))
    out = Path(输出)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, 'wb') as f:
        with gzip.GzipFile(fileobj=f, mode='wb', mtime=0, filename='') as g:
            g.write(数据)
    print(f'写出 {out}：sha256 {hashlib.sha256(out.read_bytes()).hexdigest()}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
