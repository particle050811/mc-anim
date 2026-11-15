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

FIXED_LENGTHS = {1: 1, 2: 2, 3: 4, 4: 8, 5: 4, 6: 8}


def read_nbt(b: bytes):
    p = [0]

    def u(f: str, n: int):
        v = struct.unpack_from(f, b, p[0])
        p[0] += n
        return v[0]

    def read_bytes(n: int) -> bytes:
        v = b[p[0]:p[0] + n]
        p[0] += n
        return v

    def read_string() -> bytes:
        return read_bytes(u('>H', 2))

    def tag_value(t: int):
        if t in FIXED_LENGTHS:
            return (t, read_bytes(FIXED_LENGTHS[t]))
        if t == 7:
            return (t, read_bytes(u('>i', 4)))
        if t == 8:
            return (t, read_string())
        if t == 9:
            tt = u('>b', 1)
            n = u('>i', 4)
            return (t, tt, [tag_value(tt) for _ in range(n)])
        if t == 10:
            d = []
            while True:
                tt = u('>b', 1)
                if tt == 0:
                    return (t, d)
                k = read_string()
                d.append((k, tag_value(tt)))
        if t in (11, 12):
            n = u('>i', 4)
            return (t, n, read_bytes((4 if t == 11 else 8) * n))
        raise ValueError(f'不认识的 NBT 标签 {t}')

    t = u('>b', 1)
    tag_name = read_string()
    return t, tag_name, tag_value(t)


def encode_tag(t: int, name: bytes, v) -> bytes:
    o = bytearray()

    def write_string(x: bytes):
        o.extend(struct.pack('>H', len(x)))
        o.extend(x)

    def tag_value(v):
        t = v[0]
        if t in FIXED_LENGTHS:
            o.extend(v[1])
        elif t == 7:
            o.extend(struct.pack('>i', len(v[1])))
            o.extend(v[1])
        elif t == 8:
            write_string(v[1])
        elif t == 9:
            o.extend(struct.pack('>bi', v[1], len(v[2])))
            for x in v[2]:
                tag_value(x)
        elif t == 10:
            for k, x in v[1]:
                o.extend(struct.pack('>b', x[0]))
                write_string(k)
                tag_value(x)
            o.append(0)
        else:
            o.extend(struct.pack('>i', v[1]))
            o.extend(v[2])

    o.extend(struct.pack('>b', t))
    write_string(name)
    tag_value(v)
    return bytes(o)


def cut_structure(raw_bytes: bytes, cut: int) -> bytes:
    t, tag_name, root = read_nbt(raw_bytes)
    if encode_tag(t, tag_name, root) != raw_bytes:
        raise SystemExit('读写往返不一致，不裁')
    to_int = lambda x: struct.unpack('>i', x[1])[0]
    make_int = lambda n: (3, struct.pack('>i', n))
    out_items = []
    for k, v in root[1]:
        if k == b'blocks':
            kept = []
            for block_entry in v[2]:
                pos = next(x for kk, x in block_entry[1] if kk == b'pos')
                y = to_int(pos[2][1])
                if y < cut:
                    continue
                kept.append((10, [(kk, (9, 3, [x[2][0], make_int(y - cut), x[2][2]]) if kk == b'pos' else x) for kk, x in block_entry[1]]))
            print(f'方块 {len(v[2])} → {len(kept)}')
            v = (9, 10, kept)
        elif k == b'entities':
            print(f'实体 {len(v[2])} → 0')
            v = (9, 10 if v[2] else v[1], [])
        elif k == b'size':
            dims = [to_int(x) for x in v[2]]
            v = (9, 3, [make_int(dims[0]), make_int(dims[1] - cut), make_int(dims[2])])
            print(f'size {dims} → {[dims[0], dims[1] - cut, dims[2]]}')
        out_items.append((k, v))
    return encode_tag(t, tag_name, (10, out_items))


def main(argv: list[str]) -> int:
    if len(argv) != 5:
        print(__doc__, file=sys.stderr)
        return 2
    pack_path, inner_jar, entry_name, cut, out_path = argv
    with zipfile.ZipFile(pack_path) as z:
        with zipfile.ZipFile(io.BytesIO(z.read(inner_jar))) as j:
            entry_bytes = j.read(entry_name)
    print(f'{entry_name}：sha256 {hashlib.sha256(entry_bytes).hexdigest()}')
    data = cut_structure(gzip.decompress(entry_bytes), int(cut))
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, 'wb') as f:
        with gzip.GzipFile(fileobj=f, mode='wb', mtime=0, filename='') as g:
            g.write(data)
    print(f'写出 {out}：sha256 {hashlib.sha256(out.read_bytes()).hexdigest()}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
