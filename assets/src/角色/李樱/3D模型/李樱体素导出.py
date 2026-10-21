# -*- coding: utf-8 -*-
"""把李樱 Blender 体素模型（同目录的 build_li_ying.py）导出成 world/角色/李樱.tsx 用的网格数据（资产 体素/李樱）。

不需要 Blender：脚本里的体素生成（Vox、build_* 函数）是纯 Python，这里把 bpy / bmesh / mathutils 换成空壳后
直接调用，再按脚本 make_obj 的同一套规则出面（相邻体素之间不出面），把同平面、同颜色的相邻面合并成大矩形。

用法：python3 assets/src/角色/李樱/3D模型/李樱体素导出.py [输出路径]（默认当前目录的 李樱.体素.json），
再 sr assets add 体素/李樱 <输出路径> 入库。

坐标：Blender 脚本里脸朝 -Y、角色右手在 -X；world/角色/骨架.tsx 的骨架脸朝 +Y、右手在 +X，所以整体绕 Z 转 180°（x、y 取反）。
每个部件减去关节位置，落到 骨架.tsx 各插槽的坐标系里（单位：MC 像素）。
不导出扳手和枯石太刀：镜头里手上、腰上的东西由 handR / hipL 传入。
黄铜齿轮和左臂铜管不走体素：脚本里的 GEARS / PIPE 表原样导出成参数（位置、朝向已换到骨架插槽坐标），
李樱.tsx 按参数建平滑几何（挤出的齿形、圆管），不用 0.25 像素的方块去堆圆。
"""
import base64
import importlib.util
import json
import os
import struct
import sys
import types
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "build_li_ying.py")
OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "李樱.体素.json")

for name in ("bpy", "bmesh"):
    sys.modules[name] = mock.MagicMock()
mu = types.ModuleType("mathutils")
mu.Matrix = mock.MagicMock()
mu.Vector = mock.MagicMock()
sys.modules["mathutils"] = mu
spec = importlib.util.spec_from_file_location("build_li_ying", SRC)
L = importlib.util.module_from_spec(spec)
spec.loader.exec_module(L)

DIRS = [d for d, _ in L.FACES]


def vox_quads(vox, only=None, flat_y=None):
    """返回 [(材质, 方向序号, 四个角 (x,y,z) 像素, 颜色 sRGB)]，同平面同色的相邻面已合并。"""
    r, C, sol = vox.r, vox.c, vox.solid
    planes = {}
    for (i, j, k), (col, mat) in C.items():
        for di, d in enumerate(DIRS):
            if only is not None and d != only:
                continue
            nb = (i + d[0], j + d[1], k + d[2])
            if nb in C or (sol is not None and sol(*nb)):
                continue
            c = col.get(d, col[None]) if isinstance(col, dict) else col
            c = tuple(max(0, min(255, int(round(v * 255)))) for v in c)
            ax = [a for a in range(3) if d[a]][0]
            o = [a for a in range(3) if a != ax]
            key = (i, j, k)
            planes.setdefault((mat, di, key[ax]), {})[(key[o[0]], key[o[1]])] = c
    out = []
    for (mat, di, w), cells in planes.items():
        d = DIRS[di]
        ax = [a for a in range(3) if d[a]][0]
        o = [a for a in range(3) if a != ax]
        done = set()
        for (u, v) in sorted(cells):
            if (u, v) in done:
                continue
            c = cells[(u, v)]
            u1 = u
            while (u1 + 1, v) in cells and (u1 + 1, v) not in done and cells[(u1 + 1, v)] == c:
                u1 += 1
            v1 = v
            while all((uu, v1 + 1) in cells and (uu, v1 + 1) not in done and cells[(uu, v1 + 1)] == c
                      for uu in range(u, u1 + 1)):
                v1 += 1
            for uu in range(u, u1 + 1):
                for vv in range(v, v1 + 1):
                    done.add((uu, vv))
            lo = [0, 0, 0]
            hi = [0, 0, 0]
            lo[ax] = hi[ax] = w
            lo[o[0]], hi[o[0]] = u, u1 + 1
            lo[o[1]], hi[o[1]] = v, v1 + 1
            hi[ax] = w + 1
            quad = dict(L.FACES)[d]
            pts = []
            for a in quad:
                p = [(hi[t] if a[t] else lo[t]) * r for t in range(3)]
                if flat_y is not None:
                    p[1] = flat_y
                pts.append(tuple(p))
            out.append((mat, di, pts, c))
    return out


def brow_quads(s):
    verts, quads, cols = L.brow_mesh(s)
    cx = sum(v[0] for v in verts) / len(verts)
    cy = sum(v[1] for v in verts) / len(verts)
    cz = sum(v[2] for v in verts) / len(verts)
    out = []
    for q, c in zip(quads, cols):
        p = [verts[i] for i in q]
        e1 = [p[1][t] - p[0][t] for t in range(3)]
        e2 = [p[2][t] - p[0][t] for t in range(3)]
        n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
        m = [sum(v[t] for v in p) / 4 for t in range(3)]
        if n[0] * (m[0] - cx) + n[1] * (m[1] - cy) + n[2] * (m[2] - cz) < 0:
            p = p[::-1]
            n = [-v for v in n]
        ln = sum(v * v for v in n) ** 0.5
        n = tuple(v / ln for v in n)
        out.append(("hair", n, p, tuple(int(round(v * 255)) for v in c)))
    return out


def pack(quads, pivot):
    """按材质分块；位置转到骨架坐标（绕 Z 转 180° 再减关节）。"""
    by = {}
    for mat, d, pts, c in quads:
        n = DIRS[d] if isinstance(d, int) else d
        by.setdefault(mat, []).append((n, pts, c))
    chunks = []
    for mat in sorted(by, key=L.MAT_ORDER.index):
        pos, nor, col = [], [], []
        for n, pts, c in by[mat]:
            for x, y, z in pts:
                pos += [-(x - pivot[0]), -(y - pivot[1]), z - pivot[2]]
            nor += [-n[0], -n[1], n[2]]
            col += list(c)
        chunks.append(dict(
            mat=mat, n=len(by[mat]),
            pos=base64.b64encode(struct.pack("<%df" % len(pos), *pos)).decode(),
            nor=base64.b64encode(struct.pack("<%df" % len(nor), *nor)).decode(),
            col=base64.b64encode(bytes(col)).decode(),
        ))
    return chunks


def split(vox, z):
    """把体素按高度 z（像素）切成上下两半，用来把腿切成大腿/小腿、手臂切成上臂/前臂。切口两边各自封口。"""
    up, lo = L.Vox(vox.r, vox.solid), L.Vox(vox.r, vox.solid)
    for key, val in vox.c.items():
        (up if vox.center(key)[2] >= z else lo).c[key] = val
    return up, lo


KNEE_Z, ELBOW_Z = 6, 18   # 膝在腿正中（腿 z 0..12）；肘在 z=18（手臂 z 12..24，肩关节 22）


def hexc(key):
    return "#%02x%02x%02x" % tuple(int(round(c * 255)) for c in L.P[key])


def to_part(p, piv):
    """脚本坐标 → 骨架插槽坐标（绕 Z 转 180° 再减关节）。"""
    return [-(p[0] - piv[0]), -(p[1] - piv[1]), p[2] - piv[2]]


def extras(pivots):
    """齿轮、铜管的参数。铜管在肘（z = ELBOW_Z）处切成上下两段，分别挂在上臂和前臂上，弯肘时跟着各自那一段走。"""
    gears = []
    for g in L.GEARS:
        d = [0.0, 0.0, 0.0]
        d[g["axis"]] = float(g["sign"])
        gears.append(dict(part=g["part"], pos=to_part(g["center"], pivots[g["part"]]), dir=[-d[0], -d[1], d[2]],
                          dia=g["dia"], thick=g["thick"], hub=hexc(g["hub"]) if g["hub"] else None))
    pts = L.pipe_points()
    lo, hi = L.PIPE["ring"]
    upper, lower, ring = [], [], []
    for (t0, *a), (t1, *b) in zip(pts, pts[1:]):
        (upper if a[2] >= ELBOW_Z else lower).append(a)
        if (a[2] - ELBOW_Z) * (b[2] - ELBOW_Z) < 0:                  # 跨过肘：补一个正好在肘上的点，两段都用
            k = (ELBOW_Z - a[2]) / (b[2] - a[2])
            cut = [a[i] + (b[i] - a[i]) * k for i in range(3)]
            upper.append(cut)
            lower.append(cut)
        if lo <= t0 <= hi:
            ring.append(a)
    (upper if pts[-1][3] >= ELBOW_Z else lower).append(pts[-1][1:])
    up_piv, lo_piv = pivots["armL"], pivots["forearmL"]
    pipes = [dict(part="armL", pts=[to_part(p, up_piv) for p in upper], r=L.PIPE["r"]),
             dict(part="forearmL", pts=[to_part(p, lo_piv) for p in lower], r=L.PIPE["r"])]
    ring_part = "armL" if all(p[2] >= ELBOW_Z for p in ring) else "forearmL"
    pipes.append(dict(part=ring_part, pts=[to_part(p, pivots[ring_part]) for p in ring], r=L.PIPE["ring_r"], ring=True))
    return dict(gears=gears, pipes=pipes, teeth=L.GEAR_TEETH, tooth=list(L.GEAR_TOOTH), hole=L.GEAR_HOLE,
                colors=dict(brass=hexc("brass"), brassLight=hexc("brass_l"), brassMid=hexc("brass_m"),
                            copper=hexc("copper"), steel=hexc("steel_l")))


def main():
    q = vox_quads
    parts = {
        # 骨架插槽名: (关节位置, 面)
        "head": ((0, 0, 24), q(L.build_skull()) + q(L.build_face(), only=(0, -1, 0), flat_y=-4.02)
                 + brow_quads(-1) + brow_quads(1) + q(L.build_hair()) + q(L.build_goggles())),
        "torso": ((0, 0, 0), q(L.build_body())),
    }
    # 四肢各切成两段：上段挂在肩/髋关节，下段挂在肘/膝关节（关节位置就是各自的原点）
    limbs = {
        "armR": ([L.build_arm(-1)], (-6, 0, 22), ELBOW_Z, "forearmR"),    # 脚本的 -X 侧 = 角色右手
        "armL": ([L.build_arm(1), L.build_arm_details()], (6, 0, 22), ELBOW_Z, "forearmL"),
        "legR": ([L.build_leg(-1)], (-2, 0, 12), KNEE_Z, "shinR"),
        "legL": ([L.build_leg(1)], (2, 0, 12), KNEE_Z, "shinL"),
    }
    for name, (voxes, piv, z, lower) in limbs.items():
        ups, los = zip(*(split(v, z) for v in voxes))
        parts[name] = (piv, sum((q(v) for v in ups), []))
        parts[lower] = ((piv[0], piv[1], z), sum((q(v) for v in los), []))
    data = {k: pack(f, piv) for k, (piv, f) in parts.items()}
    data["extras"] = extras({k: piv for k, (piv, _) in parts.items()})
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
    for k, ch in data.items():
        if k != "extras":
            print(k, {c["mat"]: c["n"] for c in ch})
    print("extras", {k: len(v) for k, v in data["extras"].items() if isinstance(v, list)})
    print(OUT, os.path.getsize(OUT) // 1024, "KB")


if __name__ == "__main__":
    main()
