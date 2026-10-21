"""读 Minecraft 1.18+ 存档的区域文件（.mca），取出一个长方体范围内的方块。不依赖第三方库。

blocks(region_dir, x0, z0, x1, z1) -> {(x, y, z): (方块ID, 属性dict)}，不含空气；坐标是游戏坐标，范围两端都包含。
chunks(region_dir, cx0, cz0, cx1, cz1, skip_arrays) -> 逐个区块 (cx, cz, 区块 NBT)；skip_arrays 跳过数据数组，只看调色板时用（关键帧方块.py 扫存档里有哪些方块状态）。
"""
import os, struct, zlib, io

def _nbt(buf, skip_arrays=False):
    def rd(fmt):
        n = struct.calcsize(fmt)
        return struct.unpack(fmt, buf.read(n))
    def s():
        (n,) = rd(">H")
        return buf.read(n).decode("utf-8", "replace")
    def payload(t):
        if t == 1: return rd(">b")[0]
        if t == 2: return rd(">h")[0]
        if t == 3: return rd(">i")[0]
        if t == 4: return rd(">q")[0]
        if t == 5: return rd(">f")[0]
        if t == 6: return rd(">d")[0]
        if t == 7:
            (n,) = rd(">i")
            if skip_arrays: buf.seek(n, 1); return None
            return buf.read(n)
        if t == 8: return s()
        if t == 9:
            (et,) = rd(">b"); (n,) = rd(">i")
            return [payload(et) for _ in range(n)]
        if t == 10:
            d = {}
            while True:
                (tt,) = rd(">b")
                if tt == 0: return d
                k = s(); d[k] = payload(tt)
        if t == 11:
            (n,) = rd(">i")
            if skip_arrays: buf.seek(4 * n, 1); return None
            return list(rd(">%di" % n))
        if t == 12:
            (n,) = rd(">i")
            if skip_arrays: buf.seek(8 * n, 1); return None
            return list(rd(">%dQ" % n))
        raise ValueError(t)
    (t,) = rd(">b"); s()
    return payload(t)

def chunks(region_dir, cx0, cz0, cx1, cz1, skip_arrays=False):
    for rx in range(cx0 >> 5, (cx1 >> 5) + 1):
        for rz in range(cz0 >> 5, (cz1 >> 5) + 1):
            path = os.path.join(region_dir, "r.%d.%d.mca" % (rx, rz))
            if not os.path.exists(path): continue
            with open(path, "rb") as f:
                data = f.read()
            if len(data) < 8192: continue  # 游戏刚建出来还没写入的空区域文件
            for cz in range(max(cz0, rz * 32), min(cz1, rz * 32 + 31) + 1):
                for cx in range(max(cx0, rx * 32), min(cx1, rx * 32 + 31) + 1):
                    i = 4 * ((cx & 31) + (cz & 31) * 32)
                    loc = struct.unpack(">I", data[i:i + 4])[0]
                    if loc == 0: continue
                    off = (loc >> 8) * 4096
                    n, comp = struct.unpack(">IB", data[off:off + 5])
                    raw = data[off + 5:off + 4 + n]
                    raw = zlib.decompress(raw) if comp == 2 else __import__("gzip").decompress(raw)
                    yield cx, cz, _nbt(io.BytesIO(raw), skip_arrays)

def blocks(region_dir, x0, z0, x1, z1, y0=-64, y1=319):
    out = {}
    for cx, cz, c in chunks(region_dir, x0 >> 4, z0 >> 4, x1 >> 4, z1 >> 4):
        for sec in c.get("sections", []):
            sy = sec["Y"]
            bs = sec.get("block_states")
            if not bs or sy * 16 > y1 or sy * 16 + 15 < y0: continue
            pal = bs["palette"]
            if len(pal) == 1 and pal[0]["Name"] == "minecraft:air": continue
            data = bs.get("data")
            bits = max(4, (len(pal) - 1).bit_length())
            per = 64 // bits
            mask = (1 << bits) - 1
            for i in range(4096):
                p = pal[(data[i // per] >> ((i % per) * bits)) & mask] if data else pal[0]
                name = p["Name"]
                if name in ("minecraft:air", "minecraft:cave_air"): continue
                x = cx * 16 + (i & 15); z = cz * 16 + ((i >> 4) & 15); y = sy * 16 + (i >> 8)
                if x0 <= x <= x1 and z0 <= z <= z1 and y0 <= y <= y1:
                    out[(x, y, z)] = (name, p.get("Properties", {}))
    return out
