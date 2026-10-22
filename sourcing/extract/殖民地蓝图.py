#!/usr/bin/env python3
"""殖民地（MineColonies）的建筑蓝图 → 边城的房子（src/模型/场景/边城/蓝图.json + 蓝图贴图.png）。
用户 10-05 要边城的房子好看一点、参考殖民地 mod：直接用它自带的建筑蓝图（玩家在游戏里一键放下的那些房子），不自己拼方盒子。

用法：anim extract 边城蓝图（anim extract 按 sourcing/extract.toml 在暂存目录里调，目录布局照旧项目的 参考模型库/）

来源和许可：
- 殖民地 minecolonies-1.20.1-1.1.1301.jar、蓝图引擎 Structurize 1.0.818、装饰方块 Domum Ornamentum 1.0.296 放在游戏环境（ANIM_GAME）的 缓存/mods/，不装进服务端和客户端（CurseForge CDN 下的）。
- 代码是 GPL-3.0（殖民地、Structurize）和 LGPL-3.0（Domum Ornamentum）；殖民地 jar 里 assets/minecolonies/LICENSE 是 All Rights Reserved（蓝图、贴图），没有禁止用于 AI 的条款。
  和史诗地形一样照用，只在本项目里当参考，不往外发。注意：边城的参考视频（6-2-6、6-3）会交给第三方 AI 视频模型（Seedance）当输入，比「项目里自己当参考」更进一步，许可里没写这种用法，用户拍板前先照用。
- 风格包作者：中世纪橡木 / 云杉 / 深色橡木是 Carlansor，要塞（fortress）是 Aravan，路灯、喷泉取自 Minecolonies Original。以后开源或公开发布要署名，或把蓝图.json、蓝图贴图.png 排除在外。

做法：
1. 蓝图是 Structurize 的 .blueprint：gzip 压缩的 NBT。palette 是方块状态表，blocks 是 short[y][z][x] 展平后每两个 short 拼成一个 int（高 16 位在前，见 Structurize `BlueprintUtil.convertBlocksToSaveData`），
   tile_entities 里有 Domum Ornamentum 方块的材质（textureData）。地面层 = 锚点 y + 小屋方块实体里 groundlevel 标签的 y（Structurize `BlueprintTagUtils` 的算法）；
   地面层以下（地基、地下室）不导；地面层放在城的 z = 0 那一层（和街面石半砖、原来房子的墙脚同一层）。
2. 每种方块状态从 jar 里的 blockstates → models 原样取（资源包.py），按每个小方盒的每个面、游戏的贴图坐标投影到方块的六个面上，各画成一张 16×16 贴图（从六个方向看这一格的样子）。
   Domum Ornamentum 的方块按方块实体里记的材质换贴图：模型默认贴图在 textureData 里有映射的，换成映射到的方块对应朝向那一面的贴图（同它的 `MateriallyTexturedBakedModel`）。
3. 形状：大体积的方块（整块、台阶、楼梯、屋顶瓦）按半格八分体近似成几块长方体；细的（栅栏、玻璃板、门、活板门、灯笼、地毯）用模型里原样的小方盒。斜着放的小方盒（花草交叉面、屋顶瓦上斜铺的木条）不画。
4. 换掉的方块：殖民地的小屋方块（blockhut*）、箱子换成原版箱子（贴图取 entity/chest/normal.png）；Structurize 占位方块 blocksubstitution 不画、blocksolidsubstitution 画成草方块、blockfluidsubstitution 画成水。
   床、旗帜、告示牌、头颅这些方块实体渲染的东西不画（基本都在屋里）。
5. 看不见的格子不导：从蓝图外面往里灌空气（门、窗、玻璃当成墙），灌不到的屋里家具、楼板、墙心去掉，只留外面看得见的一层壳；一格六个邻格里有一格是灌到的空气就看得见（门廊顶、挑出的二楼楼板底只从下面看得见）。
   窗玻璃、门、活板门的镂空处填屋里的暗色（同 边城贴图.py 的窗）；别的镂空（栏杆、梯子、花盆）留透明，渲染时丢掉。

输出：蓝图.json
  种类：每种「方块状态 + 材质」一项：盒（1/16 格为单位，城的坐标：X 东、Y 北、Z 上）、面（东 西 北 南 上 下 六张贴图的序号）、合（哪几个方向能和相同的邻格合并成大长方体：1 = X、2 = Y、4 = Z，所有小方盒在那个方向上都占满整格才能合）、挡（整块不透光，灌空气时当墙）、名（调试用）
  蓝图：名 → 尺寸 [x, y, z]、格（每格种类序号 + 1，0 = 空气；Uint16 小端、游程编码 [值, 个数] 成对，base64）、门（正门朝哪边：南/北/东/西，判法见 `front_door_side()`）、来源
"""
import base64, gzip, io, json, math, os, struct, sys, zipfile
from collections import Counter, deque
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from 读区块 import _nbt
from 资源包 import ResourcePack, VEC, UAX, VAX, rot, turn, rid

ROOT = os.getcwd()
GAME = os.path.join(os.environ["ANIM_GAME"], "缓存")
MC_JAR = os.path.join(GAME, "mods", "minecolonies-1.20.1-1.1.1301.jar")
JARS = [
    os.path.join(GAME, "client-1.20.1.jar"),
    MC_JAR,
    os.path.join(GAME, "mods", "domum_ornamentum-1.20.1-1.0.296-universal.jar"),
    os.path.join(GAME, "mods", "structurize-1.20.1-1.0.818.jar"),
]
OUT = os.path.join(ROOT, "src", "模型", "场景", "边城")

# 用到的蓝图：名字 → 殖民地 jar 里 blueprints/minecolonies/ 下的路径。挑和边城相称的中世纪风格（石砖城墙、木板和砖的房子）：
# 民居、商铺、仓库、兵营、塔楼取「中世纪橡木 / 云杉 / 深色橡木」三套（同一个城里三套木色错开）；兵营、箭塔、门楼取「要塞」（fortress，石砌）。同一种房子挑 2～5 级里不同的几级，大小高低错落。
BLUEPRINTS = {
    # 民居
    "橡木民居3": "medievaloak/fundamentals/residence3",
    "橡木民居5": "medievaloak/fundamentals/residence5",
    "橡木别居4": "medievaloak/fundamentals/altresidence4",
    "云杉民居3": "medievalspruce/fundamentals/residence3",
    "云杉民居5": "medievalspruce/fundamentals/residence5",
    "云杉别居4": "medievalspruce/fundamentals/altresidence4",
    "深橡民居4": "medievaldarkoak/fundamentals/residence4",
    "深橡别居5": "medievaldarkoak/fundamentals/altresidence5",
    "运河楼橡木": "medievaloak/fundamentals/grachtenpand5",
    "运河楼橡木4": "medievaloak/fundamentals/grachtenpand4",
    "酒馆云杉": "medievalspruce/fundamentals/tavern3",
    # 商铺、作坊
    "面包房橡木": "medievaloak/craftsmanship/luxury/baker5",
    "铁匠铺云杉": "medievalspruce/craftsmanship/metallurgy/blacksmith5",
    "铁匠铺深橡": "medievaldarkoak/craftsmanship/metallurgy/blacksmith4",
    "厨房橡木": "medievaloak/craftsmanship/luxury/cookery5",
    "染坊云杉": "medievalspruce/craftsmanship/luxury/dyer5",
    "石匠铺深橡": "medievaldarkoak/craftsmanship/masonry/stonemason4",
    "花店橡木": "medievaloak/agriculture/horticulture/florist4",
    "建筑工坊云杉": "medievalspruce/fundamentals/builder5",
    "送货站橡木": "medievaloak/craftsmanship/storage/deliveryman5",
    # 仓库
    "仓库橡木": "medievaloak/craftsmanship/storage/warehouse5",
    "仓库深橡": "medievaldarkoak/craftsmanship/storage/warehouse4",
    # 公共建筑（广场边）
    "市政厅橡木": "medievaloak/fundamentals/townhall5",
    "医院云杉": "medievalspruce/fundamentals/hospital5",
    "学校深橡": "medievaldarkoak/education/school5",
    # 兵营、塔楼（城墙边）
    "兵营要塞": "fortress/military/barracks5",
    "箭塔要塞": "fortress/military/guardtower5",
    "箭塔要塞别式": "fortress/military/altguardtower5",
    "兵营云杉": "medievalspruce/military/barracks4",
    "箭塔深橡": "medievaldarkoak/military/guardtower5",
    # 小品（院子、街角）
    "水井": "medievaloak/decorations/misc/bigwell3",
    "小水井": "medievaloak/decorations/misc/smallwell3",
    "木料车": "medievaloak/decorations/misc/big_log_cart",
    "带篷马车": "medievaloak/decorations/misc/roofed_carriage",
    "小马厩": "medievaloak/decorations/misc/small_stable",
    # 街上的东西：路灯（云杉栅栏柱挑出一盏 Domum Ornamentum 的灯）、小喷泉、城门里的岗亭
    "路灯": "original/infrastructure/roads/lampposts/nice",
    "喷泉": "original/decorations/misc/simplefountain",
    "岗亭": "medievaloak/decorations/misc/noble_guard_post",
}

GRASS, FOLIAGE, WATER = "#91BD59", "#77AB2F", "#3F76E4"
TINT_LEAVES = {"spruce_leaves": "#619961", "birch_leaves": "#80A755"}
INTERIOR = (42, 36, 32)  # 屋里的暗色（同 边城贴图.py 的 INTERIOR）
HOLE = "洞"  # 投影贴图里「面盖到了但贴图镂空」的像素
DIRS = ["east", "west", "north", "south", "up", "down"]  # 输出六张贴图的顺序：东 西 北 南 上 下
# 方块的六个面（MC 方向）在城的坐标里（X 东、Y 北、Z 上）的法线；每个面上贴图的 u（从外面看往右）、v（往下）方向
N_OURS = {"east": (1, 0, 0), "west": (-1, 0, 0), "north": (0, 1, 0), "south": (0, -1, 0), "up": (0, 0, 1), "down": (0, 0, -1)}
U_OURS = {"east": (0, 1, 0), "west": (0, -1, 0), "north": (-1, 0, 0), "south": (1, 0, 0), "up": (1, 0, 0), "down": (1, 0, 0)}
V_OURS = {"east": (0, 0, -1), "west": (0, 0, -1), "north": (0, 0, -1), "south": (0, 0, -1), "up": (0, -1, 0), "down": (0, 1, 0)}

WINDOWISH = ("glass", "door", "trapdoor", "iron_bars", "pane", "shutter")  # 镂空处填屋里的暗色、灌空气时当墙
SKIP = {"minecraft:air", "minecraft:cave_air", "minecraft:void_air", "structurize:blocksubstitution", "minecraft:barrier", "minecraft:light",
        "minecraft:structure_void", "minecraft:lava", "minecraft:fire", "minecraft:soul_fire", "minecolonies:blockconstructiontape"}


def load_bp(z, path):
    return _nbt(io.BytesIO(gzip.decompress(z.read(f"blueprints/minecolonies/{path}.blueprint"))))


def unpack(d):
    n = d["size_x"] * d["size_y"] * d["size_z"]
    s = []
    for v in d["blocks"]:
        v &= 0xFFFFFFFF
        s.append(v >> 16)
        s.append(v & 0xFFFF)
    return s[:n]


def ground_layer(d):
    off = d.get("optional_data", {}).get("structurize", {}).get("primary_offset", {"x": 0, "y": 0, "z": 0})
    for te in d["tile_entities"]:
        bdp = te.get("blueprintDataProvider")
        if not bdp: continue
        for t in bdp.get("posTagMap", []):
            if any(n.get("tagName") == "groundlevel" for n in t.get("tagNameList", [])):
                return off["y"] + t["tagPos"]["y"]
    # 没有标签（装饰类蓝图）：锚点下面那一层当地面；锚点就在最底层的（路灯、马车、岗亭，最底层是填地形的占位方块）最底层就是地面层
    return max(0, off["y"] - 1)


# ---------------- 方块状态 → 模型的面 ----------------
class BlockLibrary:
    def __init__(self):
        self.rp = ResourcePack(JARS)
        self.img_cache = {}
        self.tiles = []  # 每张 16×16 RGBA bytes
        self.tile_idx = {}
        self.kinds = []
        self.kind_idx = {}
        self.missing = Counter()

    def img(self, key):
        if key in self.img_cache: return self.img_cache[key]
        ns, path = key.split(":")
        raw = self.rp.read(f"assets/{ns}/textures/{path}.png")
        im = None
        if raw is not None:
            im = Image.open(io.BytesIO(raw)).convert("RGBA")
            im = im.crop((0, 0, im.width, im.width))
            if im.width != 16: im = im.resize((16, 16), Image.NEAREST)
        self.img_cache[key] = im
        return im

    def parts(self, name, props):
        """blockstates → [(模型, x 转, y 转)]；multipart 的全部符合条件的部分都要（栅栏、墙、玻璃板是柱子 + 各个方向的边）。"""
        from 资源包 import when_ok
        ns, n = name.split(":")
        raw = self.rp.read(f"assets/{ns}/blockstates/{n}.json")
        if not raw: return []
        j = json.loads(raw)
        out = []
        if "variants" in j:
            pick = None
            for key, v in j["variants"].items():
                conds = [c.split("=") for c in key.split(",") if c]
                if all(props.get(k) == val for k, val in conds):
                    pick = v; break
            if pick is None:
                # 没给属性（Domum Ornamentum 的材质方块）：取默认状态——原木竖放（axis=y）、没有属性的那一项，都没有就取第一项
                vs = j["variants"]
                pick = vs.get("") or next((v for k, v in vs.items() if "axis=y" in k), None) or next(iter(vs.values()))
            out.append(pick[0] if isinstance(pick, list) else pick)
        else:
            for part in j["multipart"]:
                if "when" not in part or when_ok(part["when"], props):
                    a = part["apply"]
                    out.append(a[0] if isinstance(a, list) else a)
        return [(rid(p["model"]), p.get("x", 0) // 90 % 4, p.get("y", 0) // 90 % 4) for p in out]

    def face_tex_of_block(self, block, d):
        """一个整块方块（Domum Ornamentum 的材质）朝 d 那一面的贴图。"""
        ps = self.parts(rid(block), {})
        if not ps:
            # 没有 blockstates（比如 _wood 之类没取到）：按同名模型猜
            return f"{block.split(':')[0]}:block/{block.split(':')[1]}"
        mid, rx, ry = ps[0]
        md = self.rp.model(mid)
        best = None
        for el in md["elements"] or []:
            for fd, f in el.get("faces", {}).items():
                wd = white_dir(rot(VEC[fd], rx, ry))
                if wd == d:
                    t = self.rp.resolve(f["texture"], md["textures"])
                    if t: return t
                if best is None:
                    best = self.rp.resolve(f["texture"], md["textures"])
        return best or self.rp.resolve("#particle", md["textures"])

    def quads(self, name, props, retex):
        """这一格的全部面：[(贴图 key, 四角（城的坐标，0..1）, 四角 uv（0..16）, 法线, 是否染色)]，以及小方盒 [(from, to)]（城的坐标，0..16）和有没有斜放的。"""
        out, boxes, tilted = [], [], False
        for mid, rx, ry in self.parts(name, props):
            md = self.rp.model(mid)
            for el in md["elements"] or []:
                F, T, er = el["from"], el["to"], el.get("rotation")
                if er and er.get("angle", 0) != 0:
                    tilted = True
                    continue
                c0 = rot([F[0] / 16 - 0.5, F[1] / 16 - 0.5, F[2] / 16 - 0.5], rx, ry)
                c1 = rot([T[0] / 16 - 0.5, T[1] / 16 - 0.5, T[2] / 16 - 0.5], rx, ry)
                lo = [min(a, b) + 0.5 for a, b in zip(c0, c1)]
                hi = [max(a, b) + 0.5 for a, b in zip(c0, c1)]
                # 游戏坐标 (x, y, z) → 城 (x, 1-z, y)
                boxes.append(([lo[0] * 16, (1 - hi[2]) * 16, lo[1] * 16], [hi[0] * 16, (1 - lo[2]) * 16, hi[1] * 16]))
                for fd, f in el.get("faces", {}).items():
                    t = self.rp.resolve(f["texture"], md["textures"])
                    if not t: continue
                    d = white_dir(rot(VEC[fd], rx, ry))
                    if retex and t in retex:
                        t = self.face_tex_of_block(retex[t], d)
                        if not t: continue
                    n, ua, va = VEC[fd], UAX[fd], VAX[fd]

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
                        def auto(pt, a): return sum(pt[i] * a[i] for i in range(3)) if sum(a) > 0 else 16 + sum(pt[i] * a[i] for i in range(3))
                        uv = [(auto(c, ua), auto(c, va)) for c in cs]
                    k = f.get("rotation", 0) // 90
                    uv = uv[-k:] + uv[:-k] if k else uv
                    pts = []
                    for c in cs:
                        c = rot([c[0] / 16 - 0.5, c[1] / 16 - 0.5, c[2] / 16 - 0.5], rx, ry)
                        pts.append((c[0] + 0.5, 0.5 - c[2], c[1] + 0.5))
                    out.append((t, pts, uv, d, "tintindex" in f))
        return out, boxes, tilted

    def tint_for(self, name):
        b = name.split(":")[1]
        if b in TINT_LEAVES: return TINT_LEAVES[b]
        if b.endswith("leaves") or b in ("vine",): return FOLIAGE
        if "water" in b: return WATER
        return GRASS

    def raster(self, quads, d, tint):
        """把朝 d 的面按深度从里到外画到这一面的 16×16 贴图上。"""
        n, U, V = N_OURS[d], U_OURS[d], V_OURS[d]
        dot = lambda a, b: a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
        # 面上的点 p（0..1 立方体里）→ 这一面贴图上的 (u, v)（0..1）：u 沿 U，v 沿 V，原点在 U、V 都最小的那个角
        def uv_of(p):
            u = dot(p, U) - min(0, U[0] + U[1] + U[2])
            v = dot(p, V) - min(0, V[0] + V[1] + V[2])
            return u, v
        fs = [(dot(q[1][0], n), q) for q in quads if q[3] == d]
        fs.sort(key=lambda x: x[0])
        canvas = [None] * 256
        for _, (t, pts, uvs, _, tinted) in fs:
            im = self.img(t)
            if im is None:
                self.missing[t] += 1
                continue
            px = im.load()
            P = [uv_of(p) for p in pts]
            us = [p[0] for p in P]; vs = [p[1] for p in P]
            u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
            if u1 - u0 < 1e-6 or v1 - v0 < 1e-6: continue
            # 面都是轴对齐的矩形：四角 0、1、2、3 = 左上、右上、右下、左下（模型里的顺序），投到这一面上是一个矩形，按双线性插 uv
            for j in range(16):
                for i in range(16):
                    cu, cv = (i + 0.5) / 16, (j + 0.5) / 16
                    if not (u0 <= cu <= u1 and v0 <= cv <= v1): continue
                    # 在矩形里的参数（s 沿 0→1 的方向，t 沿 0→3）
                    e1 = (P[1][0] - P[0][0], P[1][1] - P[0][1]); e2 = (P[3][0] - P[0][0], P[3][1] - P[0][1])
                    det = e1[0] * e2[1] - e1[1] * e2[0]
                    if abs(det) < 1e-9: continue
                    rx_, ry_ = cu - P[0][0], cv - P[0][1]
                    s = (rx_ * e2[1] - ry_ * e2[0]) / det
                    tt = (e1[0] * ry_ - e1[1] * rx_) / det
                    tu = uvs[0][0] + s * (uvs[1][0] - uvs[0][0]) + tt * (uvs[3][0] - uvs[0][0])
                    tv = uvs[0][1] + s * (uvs[1][1] - uvs[0][1]) + tt * (uvs[3][1] - uvs[0][1])
                    xi = min(15, max(0, int(math.floor(tu))))
                    yi = min(15, max(0, int(math.floor(tv))))
                    c = px[xi, yi]
                    if c[3] < 128:
                        # 面盖到了、但贴图在这里是镂空的（栏杆、玻璃、梯子的空隙）：记成「洞」，和根本没被面盖到的地方区分开
                        if canvas[j * 16 + i] is None: canvas[j * 16 + i] = HOLE
                        continue
                    if tinted and tint:
                        r, g, b = int(tint[1:3], 16), int(tint[3:5], 16), int(tint[5:7], 16)
                        c = (c[0] * r // 255, c[1] * g // 255, c[2] * b // 255, 255)
                    canvas[j * 16 + i] = c[:3] + (255,)
        return canvas

    def tile(self, canvas, fill):
        """贴图去重登记。canvas 每个像素：颜色 / HOLE（面盖到了但贴图镂空）/ None（这一面没有面片盖到）。
        没盖到的像素取最近的已画像素补上（长方体只取自己那一块，但远处取多级纹理时会混进旁边的像素，留透明的话台阶、半砖的侧面远看会被丢掉）；
        镂空的按 fill：'暗'（窗、门、铁栏杆：屋里的暗色）、'空'（留透明，渲染时丢掉不画）。"""
        have = [k for k in range(256) if canvas[k] not in (None, HOLE)]
        if not have and HOLE not in canvas: return -1
        px = list(canvas)
        for k in range(256):
            if px[k] is not None: continue
            if not have:
                px[k] = HOLE
                continue
            i, j = k % 16, k // 16
            best = min(have, key=lambda h: (h % 16 - i) ** 2 + (h // 16 - j) ** 2)
            px[k] = px[best]
        hole = INTERIOR + (255,) if fill == "暗" else (0, 0, 0, 0)
        px = [hole if p is HOLE else p for p in px]
        raw = bytes(c for p in px for c in p)
        if raw not in self.tile_idx:
            self.tile_idx[raw] = len(self.tiles)
            self.tiles.append(raw)
        return self.tile_idx[raw]

    def special_tile(self, im):
        raw = im.convert("RGBA").tobytes()
        if raw not in self.tile_idx:
            self.tile_idx[raw] = len(self.tiles)
            self.tiles.append(raw)
        return self.tile_idx[raw]

    # ---------- 一种方块状态 → 种类 ----------
    def kind(self, name, props, retex):
        key = (name, tuple(sorted(props.items())), tuple(sorted((retex or {}).items())))
        if key in self.kind_idx: return self.kind_idx[key]
        k = self._make(name, props, retex)
        if k is not None:
            k["名"] = name + ("[" + ",".join(f"{a}={b}" for a, b in sorted(props.items())) + "]" if props else "")
            self.kinds.append(k)
            idx = len(self.kinds) - 1
        else:
            idx = -1
        self.kind_idx[key] = idx
        return idx

    def _make(self, name, props, retex):
        b = name.split(":")[1]
        if name in SKIP: return None
        if name == "structurize:blocksolidsubstitution": return self._make("minecraft:grass_block", {"snowy": "false"}, None)
        if name == "structurize:blockfluidsubstitution" or name == "minecraft:water": return self.water()
        if name.startswith("minecolonies:blockhut") or b in ("chest", "trapped_chest") or name in ("minecolonies:blockminecoloniesrack",):
            return self.chest()
        # Domum Ornamentum 的屋顶瓦（shingle）是斜坡：模型里铺的是斜放的木条，这里照同样朝向的楼梯取形状，贴图仍用它自己的（换过材质的）
        shape_from = None
        if name == "domum_ornamentum:shingle":
            shape_from = ("minecraft:oak_stairs", {"facing": props.get("facing", "north"), "half": props.get("half", "bottom"), "shape": props.get("shape", "straight")})
        qs, boxes, tilted = self.quads(name, props, retex)
        if shape_from:
            _, boxes, _ = self.quads(*shape_from, None)
        if not boxes: return None
        tint = self.tint_for(name)
        occ = occupancy(boxes)
        vol = sum(occ) / 4096
        windowish = any(w in b for w in WINDOWISH)
        leaves = b.endswith("leaves")
        # 形状：占满七成以上算整块（Domum Ornamentum 的木架是 14/16 见方的墙心外面贴一圈 1 像素的木框，算整块）；
        # 按八分体近似误差小的用八分体（台阶、楼梯、屋顶瓦）；剩下的（细的）用原样的小方盒
        if vol >= 0.7 or (leaves and vol > 0.5):
            out_boxes = [[0, 0, 0, 16, 16, 16]]
        else:
            mask, err = octants(occ)
            if mask and err <= 0.14 and not windowish:
                out_boxes = octant_boxes(mask)
            else:
                out_boxes = exact_boxes(boxes)
        if not out_boxes: return None
        fill = "暗" if windowish else "空"
        if not qs and shape_from is None: return None
        faces = []
        for d in DIRS:
            cv = self.raster(qs, d, tint)
            if leaves:
                # 树叶的镂空像素补成压暗的树叶色（同 边城贴图.py 的 leaves()：远看是一团实心的树冠）
                have = [p for p in cv if p not in (None, HOLE)]
                if have:
                    avg = tuple(sum(p[c] for p in have) // len(have) for c in range(3))
                    cv = [p if p not in (None, HOLE) else (avg[0] * 45 // 100, avg[1] * 45 // 100, avg[2] * 45 // 100, 255) for p in cv]
            t = self.tile(cv, fill)
            if t < 0:
                # 这一面没有任何面片（比如屋顶瓦取楼梯形状后的侧面）：用这种方块最常见的那张贴图
                common = Counter(q[0] for q in qs).most_common(1)
                im = self.img(common[0][0]) if common else None
                t = self.special_tile(im) if im is not None else 0
            faces.append(t)
        merge = 0
        for ax in range(3):
            if all(bx[ax] == 0 and bx[ax + 3] == 16 for bx in out_boxes): merge |= 1 << ax
        full = out_boxes == [[0, 0, 0, 16, 16, 16]]
        opaque = full and all(self.tiles[t][3::4] == b"\xff" * 256 for t in faces)
        return {"盒": out_boxes, "面": faces, "合": merge, "挡": bool(opaque or (windowish and vol > 0.05))}

    def water(self):
        im = self.img("minecraft:block/water_still")
        r, g, bb = int(WATER[1:3], 16), int(WATER[3:5], 16), int(WATER[5:7], 16)
        t = Image.new("RGBA", (16, 16))
        p = im.load()
        for y in range(16):
            for x in range(16):
                c = p[x, y]
                t.putpixel((x, y), (c[0] * r // 255, c[1] * g // 255, c[2] * bb // 255, 255))
        ti = self.special_tile(t)
        return {"盒": [[0, 0, 0, 16, 16, 14]], "面": [ti] * 6, "合": 3, "挡": False}

    def chest(self):
        # 原版箱子（方块实体渲染，没有方块模型）：14×14×14 的盒子，贴图从 entity/chest/normal.png 按 ChestRenderer 的展开图拼：
        # 盖子顶面 (14,0) 14×14；正面：盖子 (14,14) 14×5 叠在箱身 (14,33) 14×10 上（中间一像素重叠），锁扣不画
        raw = self.rp.read("assets/minecraft/textures/entity/chest/normal.png")
        ch = Image.open(io.BytesIO(raw)).convert("RGBA")
        top = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        top.paste(ch.crop((14, 0, 28, 14)), (1, 1))
        side = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        side.paste(ch.crop((14, 33, 28, 43)), (1, 6))
        side.paste(ch.crop((14, 14, 28, 19)), (1, 2))
        bottom = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        bottom.paste(ch.crop((28, 19, 42, 33)), (1, 1))
        ts, tt, tb = self.special_tile(side), self.special_tile(top), self.special_tile(bottom)
        return {"盒": [[1, 1, 0, 15, 15, 14]], "面": [ts, ts, ts, ts, tt, tb], "合": 0, "挡": False}


def white_dir(v):
    """游戏方向向量 → 方向名（城的坐标里的东西南北上下）。游戏 +z = 南。"""
    x, y, z = v
    if x > 0.5: return "east"
    if x < -0.5: return "west"
    if z > 0.5: return "south"
    if z < -0.5: return "north"
    return "up" if y > 0 else "down"


def occupancy(boxes):
    occ = [0] * 4096
    for (lo, hi) in boxes:
        x0, y0, z0 = [max(0, min(16, round(v))) for v in lo]
        x1, y1, z1 = [max(0, min(16, round(v))) for v in hi]
        for z in range(z0, z1):
            for y in range(y0, y1):
                for x in range(x0, x1):
                    occ[(z * 16 + y) * 16 + x] = 1
    return occ


def octants(occ):
    mask, err = 0, 0.0
    for o in range(8):
        ox, oy, oz = (o & 1) * 8, ((o >> 1) & 1) * 8, ((o >> 2) & 1) * 8
        s = sum(occ[((oz + z) * 16 + oy + y) * 16 + ox + x] for z in range(8) for y in range(8) for x in range(8)) / 512
        on = s >= 0.5
        if on: mask |= 1 << o
        err += abs(s - (1 if on else 0))
    return mask, err / 8


def octant_boxes(mask):
    """八分体 → 尽量少的长方体（先沿 X 并，再沿 Y、Z 并）。"""
    cells = {((o & 1), (o >> 1) & 1, (o >> 2) & 1) for o in range(8) if mask >> o & 1}
    out = []
    while cells:
        x, y, z = min(cells, key=lambda c: (c[2], c[1], c[0]))
        w = 2 if x == 0 and (1, y, z) in cells else 1
        xs = range(x, x + w)
        d = 2 if y == 0 and all((xx, 1, z) in cells for xx in xs) else 1
        ys = range(y, y + d)
        h = 2 if z == 0 and all((xx, yy, 1) in cells for xx in xs for yy in ys) else 1
        for xx in xs:
            for yy in ys:
                for zz in range(z, z + h):
                    cells.discard((xx, yy, zz))
        out.append([x * 8, y * 8, z * 8, (x + w) * 8, (y + d) * 8, (z + h) * 8])
    return out


def exact_boxes(boxes, limit=4):
    """细的方块用原样的小方盒；小于最大那块一成的装饰（屋顶瓦边上的小木条、按钮上的凸起）不要，最多留 4 块（一个盒子画成一个实例，城里几十万格，盒子数就是渲染量）。"""
    seen, out = set(), []
    for lo, hi in boxes:
        b = tuple(round(v * 4) / 4 for v in (*lo, *hi))
        if b in seen: continue
        seen.add(b)
        if b[3] - b[0] <= 0 or b[4] - b[1] <= 0 or b[5] - b[2] <= 0: continue
        out.append(list(b))
    vol = lambda b: (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2])
    out.sort(key=lambda b: -vol(b))
    if out: out = [b for b in out if vol(b) >= 0.1 * vol(out[0])]
    return out[:limit]


# ---------------- 正门朝哪边 ----------------
# 布局.ts 按这个把正门转向街。判法：地面上 4 层以内的每扇门（下半扇），沿门的开合方向往两边各看到蓝图边上，
# 一路上挡光的格子（墙、门窗）少的那边是屋外、多的那边是屋里；两边一样多的（屋里的隔门、院墙上的门）不算。
# 屋外的门按开向分组，相邻的两扇（双开门）算一处；正门取离那一面外墙最近的一处，一样近的取双开门，再一样取低的。
# 自动判不准的写进 `FRONT_DOOR_OVERRIDES`，每一项都对着四个立面看过（立面图在 预览/边城建筑/蓝图核对/立面/；转过向的样子看 Composition「蓝图正门核对」）。
# 民居（橡木 / 云杉民居 3、5）按规则取山墙那头：山墙朝街是中世纪街道的样子，也省临街的宽度。
FACING = {"north": (0, 1), "south": (0, -1), "east": (1, 0), "west": (-1, 0)}  # 门的 facing → 城的坐标（游戏北 = 城 +Y）
SIDE = {(1, 0): "东", (-1, 0): "西", (0, 1): "北", (0, -1): "南"}
FRONT_DOOR_OVERRIDES = {
    # 酒馆：自动判出的是地面层一扇屋里的门（朝北，北面是大烟囱）；南面是带栏杆的露台和二楼阳台门，是门面
    "medievalspruce/fundamentals/tavern3": "南",
    # 市政厅：西墙那扇小门离墙最近，但东面是正中的塔楼、塔脚开门、两翼对称，是正立面；西面正中是烟囱
    "medievaloak/fundamentals/townhall5": "东",
    # 要塞别式箭塔：L 形，两扇门都开在东北角的内院里，两边各数到一道墙、自动判不出；取东面（内院、干草、南瓜那一面）
    "fortress/military/altguardtower5": "东",
}


def front_door_side(doors, kind, blk, at, sx, sz, H, x0, x1, y0, y1, path):
    if path in FRONT_DOOR_OVERRIDES: return FRONT_DOOR_OVERRIDES[path]
    outs = {}
    for X, Y, Z, f in doors:
        dx, dy = FACING.get(f, (0, 1))
        hits = []
        for sgn in (1, -1):
            a, b, n = X + sgn * dx, Y + sgn * dy, 0
            while 0 <= a < sx and 0 <= b < sz:
                if blk(kind[at(a, b, Z)]) or (Z + 1 < H and blk(kind[at(a, b, Z + 1)])): n += 1
                a += sgn * dx; b += sgn * dy
            hits.append(n)
        if hits[0] == hits[1]: continue
        sgn = 1 if hits[0] < hits[1] else -1
        outs[(X, Y, Z)] = (sgn * dx, sgn * dy)
    if not outs: return "南"
    # 分组：同一层、同一开向、横着相邻的门是一处
    groups, done = [], set()
    for c in sorted(outs):
        if c in done: continue
        g, stack = [], [c]
        done.add(c)
        while stack:
            p = stack.pop(); g.append(p)
            for q in ((p[0] + 1, p[1], p[2]), (p[0] - 1, p[1], p[2]), (p[0], p[1] + 1, p[2]), (p[0], p[1] - 1, p[2])):
                if q in outs and q not in done and outs[q] == outs[c]:
                    done.add(q); stack.append(q)
        groups.append(g)

    def edge_dist(g):
        d = outs[g[0]]
        X, Y = g[0][0], g[0][1]
        return {(1, 0): x1 - 1 - X, (-1, 0): X - x0, (0, 1): y1 - 1 - Y, (0, -1): Y - y0}[d]
    best = min(groups, key=lambda g: (edge_dist(g), -len(g), g[0][2]))
    return SIDE[outs[best[0]]]


# ---------------- 一张蓝图 ----------------
def convert(lib, z, path):
    d = load_bp(z, path)
    sx, sy, sz = d["size_x"], d["size_y"], d["size_z"]
    pal = d["palette"]
    cells = unpack(d)
    g = ground_layer(d)
    retex_at = {}
    for te in d["tile_entities"]:
        if "textureData" in te:
            retex_at[(te["x"], te["y"], te["z"])] = {rid(k): rid(v) for k, v in te["textureData"].items()}
    # 每格的种类（地面层往上）；城的坐标：X = x，Y = sz-1-z（游戏 +z 是南），Z = y - g
    H = sy - g
    kind = [-1] * (sx * sz * H)
    at = lambda X, Y, Z: (Z * sz + Y) * sx + X
    doors = []  # 地面上几层的门（下半扇）：(X, Y, Z, facing)
    for y in range(g, sy):
        for zz in range(sz):
            for x in range(sx):
                p = pal[cells[(y * sz + zz) * sx + x]]
                name = p["Name"]
                if name in SKIP: continue
                k = lib.kind(name, {a: str(b) for a, b in p.get("Properties", {}).items()}, retex_at.get((x, y, zz)))
                kind[at(x, sz - 1 - zz, y - g)] = k
                if y - g <= 4 and name.endswith("_door") and p.get("Properties", {}).get("half") == "lower":
                    doors.append((x, sz - 1 - zz, y - g, p.get("Properties", {}).get("facing", "north")))
    # 灌空气：从外面（四周和顶上，不从地下）往里灌，挡光的整块和门窗挡住
    blk = lambda k: k >= 0 and lib.kinds[k]["挡"]
    seen = bytearray(sx * sz * H)
    q = deque()
    for Z in range(H):
        for Y in range(sz):
            for X in range(sx):
                if (X in (0, sx - 1) or Y in (0, sz - 1) or Z == H - 1) and not blk(kind[at(X, Y, Z)]):
                    seen[at(X, Y, Z)] = 1; q.append((X, Y, Z))
    while q:
        X, Y, Z = q.popleft()
        for dx, dy, dz in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)):
            a, b, c = X + dx, Y + dy, Z + dz
            if not (0 <= a < sx and 0 <= b < sz and 0 <= c < H): continue
            i = at(a, b, c)
            if seen[i] or blk(kind[i]): continue
            seen[i] = 1; q.append((a, b, c))
    keep = [0] * len(kind)
    kept = 0
    for Z in range(H):
        for Y in range(sz):
            for X in range(sx):
                i = at(X, Y, Z)
                k = kind[i]
                if k < 0: continue
                vis = seen[i] or X in (0, sx - 1) or Y in (0, sz - 1) or Z == H - 1
                if not vis:
                    # 下面那格也要看：门廊顶、挑出去的二楼楼板底、拱廊顶、檐下的倒楼梯只从下面看得见（Z = 0 下面是地，不算）
                    for dx, dy, dz in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)):
                        a, b, c = X + dx, Y + dy, Z + dz
                        if c < 0: continue
                        if not (0 <= a < sx and 0 <= b < sz and c < H) or seen[at(a, b, c)]:
                            vis = True; break
                if vis:
                    keep[i] = k + 1; kept += 1
    # 裁掉四周和顶上的空气
    xs = [i % sx for i in range(len(keep)) if keep[i]]
    ys = [(i // sx) % sz for i in range(len(keep)) if keep[i]]
    zs = [i // (sx * sz) for i in range(len(keep)) if keep[i]]
    x0, x1, y0, y1, z1 = min(xs), max(xs) + 1, min(ys), max(ys) + 1, max(zs) + 1
    W, D = x1 - x0, y1 - y0
    arr = []
    for Z in range(z1):
        for Y in range(y0, y1):
            for X in range(x0, x1):
                arr.append(keep[at(X, Y, Z)])
    # 游程编码
    rle = []
    i = 0
    while i < len(arr):
        j = i
        while j < len(arr) and arr[j] == arr[i] and j - i < 65535: j += 1
        rle += [arr[i], j - i]
        i = j
    front = front_door_side(doors, kind, blk, at, sx, sz, H, x0, x1, y0, y1, path)
    raw = struct.pack(f"<{len(rle)}H", *rle)
    return {"尺寸": [W, D, z1], "格": base64.b64encode(raw).decode(), "门": front, "来源": path, "原尺寸": [sx, sy, sz], "地面层": g, "可见格": kept}


def main():
    z = zipfile.ZipFile(MC_JAR)
    lib = BlockLibrary()
    bps = {}
    for name, path in BLUEPRINTS.items():
        bps[name] = convert(lib, z, path)
        b = bps[name]
        print(f"{name:8s} {path:55s} 尺寸 {b['尺寸']}  可见 {b['可见格']} 格  门朝{b['门']}", file=sys.stderr)
    cols = 32
    rows = (len(lib.tiles) + cols - 1) // cols
    rows = max(1, rows)
    atlas = Image.new("RGBA", (cols * 16, rows * 16), (0, 0, 0, 0))
    for i, raw in enumerate(lib.tiles):
        atlas.paste(Image.frombytes("RGBA", (16, 16), raw), ((i % cols) * 16, (i // cols) * 16))
    atlas.save(os.path.join(OUT, "蓝图贴图.png"))
    json.dump({"列": cols, "行": rows, "种类": lib.kinds, "蓝图": bps}, open(os.path.join(OUT, "蓝图.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"种类 {len(lib.kinds)}，贴图 {len(lib.tiles)} 张（{cols}×{rows}）", file=sys.stderr)
    if lib.missing: print("缺贴图：", lib.missing.most_common(20), file=sys.stderr)


if __name__ == "__main__":
    main()
