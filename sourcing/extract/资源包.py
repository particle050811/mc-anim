#!/usr/bin/env python3
"""读游戏资源包（客户端 jar + 模组 jar）里的 Java 版方块/物品模型：blockstates → models → textures。
导出场景.py（存档里的一片区域）和 导出模型.py（单个模型）共用这一份。

坐标：模型文件是游戏坐标（Y 朝上、南 = +Z，一格 = 16），导出的面片是参考模型库坐标（Z 朝上、南 = -Y，一格 = 1）：
  参考模型 (X, Y, Z) = (x, -z, y)。这样换算保持右手系；直接写成 (x, z, y) 会左右镜像。
"""
import json, zipfile, io, fnmatch, math
from PIL import Image

# 模型坐标（游戏坐标系）下六个面的法线，以及贴图的 u（图像向右）、v（图像向下）方向
VEC = {"up": (0, 1, 0), "down": (0, -1, 0), "north": (0, 0, -1), "south": (0, 0, 1), "west": (-1, 0, 0), "east": (1, 0, 0)}
UAX = {"up": (1, 0, 0), "down": (1, 0, 0), "north": (-1, 0, 0), "south": (1, 0, 0), "west": (0, 0, 1), "east": (0, 0, -1)}
VAX = {"up": (0, 0, 1), "down": (0, 0, -1), "north": (0, -1, 0), "south": (0, -1, 0), "west": (0, -1, 0), "east": (0, -1, 0)}


def rot(v, rx, ry):
    """blockstates 里的整 90° 旋转：rx、ry 是转几个 90°。"""
    x, y, z = v
    for _ in range(rx): x, y, z = x, z, -y     # 绕 x 转 90°：北面转到下面
    for _ in range(ry): x, y, z = -z, y, x     # 绕 y 转 90°：北面转到东面
    return (x, y, z)


white = lambda v: (v[0], -v[2], v[1])          # 游戏方向 → 参考模型方向


def rid(s, default_ns="minecraft"):
    return s if ":" in s else default_ns + ":" + s


def when_value(v):
    """multipart 的 when 里一个属性能取的值。有的模组（夸克的管道）把 true/false 写成 JSON 布尔，str() 会变成 True/False，对不上方块状态里的 true/false"""
    return ["true" if v else "false"] if isinstance(v, bool) else str(v).split("|")


def when_ok(when, props):
    if "OR" in when: return any(when_ok(w, props) for w in when["OR"])
    if "AND" in when: return all(when_ok(w, props) for w in when["AND"])
    return all(str(props.get(k)) in when_value(v) for k, v in when.items())


def turn(p, r, vector=False):
    """模型元素自带的旋转（任意角度，绕过 origin 的某根轴）。p 是 16 分之一格单位的点；vector=True 时只转方向。"""
    if not r: return list(p)
    a = math.radians(r["angle"])
    o = [0, 0, 0] if vector else r.get("origin", [8, 8, 8])
    i = "xyz".index(r["axis"])
    j, k = (i + 1) % 3, (i + 2) % 3
    dj, dk = p[j] - o[j], p[k] - o[k]
    s = 1 / math.cos(a) if r.get("rescale") and not vector else 1
    out = list(p)
    out[j] = o[j] + (dj * math.cos(a) - dk * math.sin(a)) * s
    out[k] = o[k] + (dj * math.sin(a) + dk * math.cos(a)) * s
    return out


def save_atlas(textures, png_path, width=256):
    """textures 每项有 size（边长）和 _px（RGBA 像素）。从左到右、从上到下排进一张宽 width 的图里。"""
    x = y = row = 0
    for t in textures:
        s = t["size"]
        if x + s > width: x, y, row = 0, y + row, 0
        t["x"], t["y"] = x, y
        x += s; row = max(row, s)
    im = Image.new("RGBA", (width, y + row), (0, 0, 0, 0))
    for t in textures:
        im.paste(Image.frombytes("RGBA", (t["size"], t["size"]), t["_px"]), (t["x"], t["y"]))
    im.save(png_path)
    return [{k: v for k, v in t.items() if k != "_px"} for t in textures]


class ResourcePack:
    def __init__(self, jar_paths, tints=None):
        self.jars = [zipfile.ZipFile(j) for j in jar_paths]
        self.names = [set(j.namelist()) for j in self.jars]
        self.tints = tints or {}
        self.model_cache = {}
        self.textures, self.tex_idx = [], {}

    def read(self, path):
        for j, ns in zip(self.jars, self.names):
            if path in ns: return j.read(path)
        return None

    def model(self, mid):
        """返回合并了父模型之后的 {textures, elements, parents}。"""
        mid = rid(mid)
        if mid in self.model_cache: return self.model_cache[mid]
        ns, path = mid.split(":")
        raw = self.read(f"assets/{ns}/models/{path}.json")
        out = {"textures": {}, "elements": None, "parents": []}
        if raw:
            j = json.loads(raw)
            if "parent" in j:
                p = self.model(j["parent"])
                out = {"textures": dict(p["textures"]), "elements": p["elements"], "parents": [rid(j["parent"])] + p["parents"]}
            out["textures"].update(j.get("textures", {}))
            if "elements" in j: out["elements"] = j["elements"]
        self.model_cache[mid] = out
        return out

    def variant(self, name, props):
        """查 blockstates，返回 (模型 ID, x 旋转, y 旋转)。"""
        ns, n = name.split(":")
        raw = self.read(f"assets/{ns}/blockstates/{n}.json")
        if not raw: return None
        j = json.loads(raw)
        pick = None
        if "variants" in j:
            for key, v in j["variants"].items():
                conds = [c.split("=") for c in key.split(",") if c]
                if all(props.get(k) == val for k, val in conds):
                    pick = v; break
        elif "multipart" in j:
            for part in j["multipart"]:
                if "when" not in part or when_ok(part["when"], props):
                    pick = part["apply"]; break
            pick = pick or j["multipart"][0]["apply"]
        if pick is None: return None
        if isinstance(pick, list): pick = pick[0]
        return rid(pick["model"]), pick.get("x", 0) // 90 % 4, pick.get("y", 0) // 90 % 4

    @staticmethod
    def resolve(tex, textures):
        for _ in range(10):
            if not tex or not tex.startswith("#"): break
            tex = textures.get(tex[1:])
        return rid(tex) if tex and not tex.startswith("#") else None

    def texture(self, key, opaque=False):
        """贴图下标；像素、平均色、是否镂空都存在 self.textures 里，导出时用 save_atlas 拼成一张 PNG。"""
        k = (key, opaque)
        if k in self.tex_idx: return self.tex_idx[k]
        ns, path = key.split(":")
        raw = self.read(f"assets/{ns}/textures/{path}.png")
        if raw is None: return None
        im = Image.open(io.BytesIO(raw)).convert("RGBA")
        w = im.width
        im = im.crop((0, 0, w, w))                 # 动画贴图只取第一帧
        px = bytearray(im.tobytes())
        tint = next((c for pat, c in self.tints.items() if fnmatch.fnmatch(key, pat)), None)
        if tint:
            t = [int(tint[i:i + 2], 16) / 255 for i in (1, 3, 5)]
            for i in range(0, len(px), 4):
                for c in range(3): px[i + c] = int(px[i + c] * t[c])
        r = g = b = a = 0
        for i in range(0, len(px), 4):
            pa = px[i + 3]
            r += px[i] * pa; g += px[i + 1] * pa; b += px[i + 2] * pa; a += pa
        a = a or 1
        avg = (r / a, g / a, b / a)
        cutout = any(px[i + 3] < 128 for i in range(0, len(px), 4))
        if opaque and cutout:
            # 树叶合并成大块后里面是空的，镂空会看穿；把透明像素填成暗色，等于游戏里"流畅"画质的树叶
            for i in range(0, len(px), 4):
                if px[i + 3] < 128: px[i:i + 3] = bytes(int(v * 0.45) for v in avg)
                px[i + 3] = 255
            avg = tuple(v * 0.8 for v in avg)
            cutout = False
        self.tex_idx[k] = len(self.textures)
        self.textures.append({"key": key, "size": w, "cutout": cutout, "avg": "#%02x%02x%02x" % tuple(round(v) for v in avg), "_px": bytes(px)})
        return self.tex_idx[k]

    def save_atlas(self, png_path):
        """把用到的贴图拼成一张图集存成 PNG，返回写进 JSON 的贴图表（每项带它在图集里的位置 x、y）。"""
        return save_atlas(self.textures, png_path)

    def quads(self, md, rx=0, ry=0):
        """把一个模型的每个小方盒、每个面原样变成面片。md 是 self.model() 的返回值，rx/ry 是 blockstates 的旋转。
        每个面片：[贴图下标, 四个角各 xyz（相对方块最小角，参考模型坐标）, 四个角各 uv, 法线 xyz, 是否不受光]，
        四个角的顺序是从外面看的左上、右上、右下、左下。方块占 X 0..1、Y -1..0、Z 0..1。"""
        out = []
        for el in md["elements"]:
            F, T, er = el["from"], el["to"], el.get("rotation")
            for d, f in el.get("faces", {}).items():
                t = self.resolve(f["texture"], md["textures"])
                ti = self.texture(t) if t else None
                if ti is None: continue
                n, ua, va = VEC[d], UAX[d], VAX[d]
                def corner(su, sv):
                    pt = [0, 0, 0]
                    for ax in range(3):
                        if n[ax]: pt[ax] = T[ax] if n[ax] > 0 else F[ax]
                        for a, sf in ((ua, su), (va, sv)):
                            if a[ax]: pt[ax] = F[ax] + sf * (T[ax] - F[ax]) if a[ax] > 0 else T[ax] - sf * (T[ax] - F[ax])
                    return pt
                cs = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)]
                if "uv" in f:
                    u1, v1, u2, v2 = f["uv"]
                    uv = [(u1, v1), (u2, v1), (u2, v2), (u1, v2)]
                else:
                    # 没写 uv 的面按元素边界自动取（同原版 `BlockElement.uvsByDefault`，不取模：% 16 会让整格方块六个面里四个面的 uv 塌成一条线）。
                    def auto(pt, a): return sum(pt[i] * a[i] for i in range(3)) if sum(a) > 0 else 16 + sum(pt[i] * a[i] for i in range(3))
                    uv = [(auto(c, ua), auto(c, va)) for c in cs]
                k = f.get("rotation", 0) // 90
                uv = uv[-k:] + uv[:-k] if k else uv
                q = [ti]
                for c in cs:
                    c = turn(c, er)
                    c = rot([c[0] / 16 - 0.5, c[1] / 16 - 0.5, c[2] / 16 - 0.5], rx, ry)
                    q += [round(c[0] + 0.5, 4), round(-(c[2] + 0.5), 4), round(c[1] + 0.5, 4)]
                for a, b in uv: q += [round(a / 16, 4), round(b / 16, 4)]
                nn = white(rot(turn(n, er, vector=True), rx, ry))
                q += list(nn) if not er else [round(v, 4) for v in nn]
                q.append(0 if el.get("shade", True) else 1)   # 1 = 模型里写了 shade:false：游戏里这个面不参与明暗，按贴图原色显示
                out.append(q)
        return out

    def particle_color(self, md):
        pt = self.resolve("#particle", md["textures"])
        pi = self.texture(pt) if pt else None
        return self.textures[pi]["avg"] if pi is not None else "#808080"
