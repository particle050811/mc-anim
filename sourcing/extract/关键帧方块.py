#!/usr/bin/env python3
"""体素世界（src/lib/体素/）的方块表和群系色：每种方块状态的面（贴图、染色、朝向）全从 jar 里查，不自己编（用户 10-03：用 MC 真实材质）。
blockstates → models → 每个面的贴图和 tintindex，解析照 资源包.py。jar：原版、暮色森林、冰火、匠魂（Mantle 里有父模型）、机械动力、夸克（含 Zeta）。

导哪些状态：variants 不超过 4 个的全导，多的只导第一个；multipart 的原版和暮色按 when 里的属性取全部组合（补 none 见 CONNECT_VALUES），
模组的 multipart 只导不带属性的；再补 `SAVES` 里存档出现过的状态（新世界要加进 SAVES 重跑）；双格高的下半格导了上半格也导。
最后核对存档里每个状态都查得到（查法同 lib/真实方块表.ts 的 `体素值`），查不到的打出来（箱子、告示牌、头颅这类方块实体画的不画）。
染色分几路（见 tint_route）：grass / foliage / water 按群系取色，canopy / mangrove 是暮色的树叶算法，"#rrggbb" 是定值；按位置变色的方块取近似。

输出在 src/模型/场景/关键帧/：
  方块表.png：每张贴图 16×16 竖排；方块表.json：贴图 [id]（序号 < 4096，lib/体素/网格.ts 把贴图号和染色、随机转并进 16 位数）、面组 [[面...]]（一个部件按一种旋转摆好的全部面，状态间共用）、
    方块 {状态: [标志, 染, 面组号...]}，标志 = 类(0 solid/1 cutout/2 translucent/3 liquid) + 4 满(整格不透明) + 8 遮(整格碰撞箱) + 16 光(环境光遮蔽) + 32 转(4 个差 y 旋转的变体，贴图随机转) + 64 偏(花草 ±0.25 格随机偏)；
    每个面 [朝向, 剔除方向, 贴图, 叠加贴图(-1 无), 染, 明暗, 四角 xyz, 四角 uv]：朝向 +x -x +y -y +z -z（场景坐标，北 = +y、上 = +z）或空串，坐标和 uv 以 1/16 格为单位。
  群系色.json：{群系: {草, 叶, 水, 草修饰?, 叶修饰?}}（#rrggbb），规则见 biome_colors()。

用法（在 参考模型库/ 下）：uv run --with pillow python 工具/游戏取材/关键帧方块.py
"""
import io, itertools, json, os, re, struct, sys, zipfile
from collections import defaultdict
from pathlib import Path
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from 资源包 import ResourcePack, rid, when_ok, when_value, turn, rot, VEC, UAX, VAX, white
import 读区块 as RD

ROOT = Path(__file__).resolve().parents[2]
OUTD = ROOT / "src/模型/场景/关键帧"
GAME = ROOT.parent / "game"
CLIENT = GAME / "缓存/client-1.20.1.jar"


def find_jar(prefix):
    """模组 jar：先找取材服务端装的，没装的（夸克、Zeta）找整合包缓存里的"""
    for d in (GAME / "取材服务端/mods", GAME / "缓存/mods"):
        hit = sorted(d.glob(prefix + "*.jar"))
        if hit: return hit[-1]
    sys.exit(f"找不到 {prefix}*.jar")


# 资源按这个顺序查，先找到的算（模组没有覆盖原版的资源）
JARS = [CLIENT] + [find_jar(p) for p in ("twilightforest-", "iceandfire-", "TConstruct-", "Mantle-", "create-", "Quark-", "Zeta-")]
# 要覆盖的存档（只读）：取材服务端主世界、两个客户端的片场、暮色放大 4 倍的新世界（种子 1752，npm run 导入:暮色放大1752 导入的就是它）。新生成的世界加在这里
SAVES = [GAME / "取材服务端/world", GAME / "实例/取材客户端/.minecraft/saves/片场", GAME / "实例/取材客户端-远景/.minecraft/saves/片场",
         GAME / "取材服务端/暮色放大-1752"]

TRANSLUCENT = {"minecraft:ice", "minecraft:water", "minecraft:lava"}
# 液体（方块模型里没有元素，游戏用 LiquidBlockRenderer 画）：气泡柱画成水；匠魂史莱姆液用它的流体贴图
LIQUID = {"minecraft:water": "minecraft:block/water_still", "minecraft:bubble_column": "minecraft:block/water_still", "minecraft:lava": "minecraft:block/lava_still"}
SLIME_FLUID_RE = re.compile(r"tconstruct:(earth|sky|ender)_slime_fluid$")
# OffsetType.XZ 的花草（BlockBehaviour.Properties.offsetType）
OFFSET_WORDS = ("grass", "fern", "tulip", "orchid", "allium", "bluet", "daisy", "poppy", "dandelion", "cornflower", "lily_of_the_valley", "mayapple", "fiddlehead")
DIRS = {(1, 0, 0): "+x", (-1, 0, 0): "-x", (0, 1, 0): "+y", (0, -1, 0): "-y", (0, 0, 1): "+z", (0, 0, -1): "-z"}

f32 = lambda v: struct.unpack("f", struct.pack("f", v))[0]   # Java 的 float


def hexc(v): return "#%06x" % (v & 0xFFFFFF)


def q(v):
    """面的坐标、uv（以 1/16 格为单位）：整数写成整数，其余留三位小数，JSON 短一半"""
    v = round(v, 3)
    return int(v) if v == int(v) else v


def colormap_color(png, t, d):
    """原版 GrassColor.get / FoliageColor.get(double 温度, double 湿度)：湿度乘温度，查 256×256 的色图（超出返回 0xFF00FF）"""
    d = d * t
    i, j = int((1.0 - t) * 255.0), int((1.0 - d) * 255.0)
    if (j << 8 | i) >= 65536: return 0xFF00FF
    r, g, b = png.getpixel((i, j))[:3]
    return r << 16 | g << 8 | b


# ---------- 染色 ----------
# 原版 BlockColors.createDefault
TINT = {
    **{f"minecraft:{n}": "grass" for n in ("grass_block", "grass", "tall_grass", "fern", "large_fern", "potted_fern", "sugar_cane", "pink_petals")},
    **{f"minecraft:{n}": "foliage" for n in ("oak_leaves", "jungle_leaves", "acacia_leaves", "dark_oak_leaves", "mangrove_leaves", "vine")},
    **{f"minecraft:{n}": "water" for n in ("water", "bubble_column", "water_cauldron")},
    "minecraft:spruce_leaves": "#619961", "minecraft:birch_leaves": "#80a755", "minecraft:lily_pad": "#208030",
    "minecraft:attached_melon_stem": "#e0c71c", "minecraft:attached_pumpkin_stem": "#e0c71c",
    # 红石线按电量变色，取没电的颜色
    "minecraft:redstone_wire": "#4c0000",
    # 暮色森林 ColorHandler.registerBlockColors：
    "twilightforest:fiddlehead": "grass", "twilightforest:potted_fiddlehead": "grass",
    **{f"twilightforest:{n}": "foliage" for n in ("twilight_oak_leaves", "dark_leaves", "hardened_dark_leaves", "giant_leaves", "fallen_leaves")},
    "twilightforest:canopy_leaves": "canopy", "twilightforest:mangrove_leaves": "mangrove",
    "twilightforest:thorn_leaves": "#619961", "twilightforest:beanstalk_leaves": "#619961",   # FoliageColor.getEvergreenColor()
    "twilightforest:huge_lily_pad": "#208030",
    "twilightforest:pink_castle_rune_brick": "#ff00ff", "twilightforest:pink_castle_door": "#ff00ff",
    "twilightforest:blue_castle_rune_brick": "#00ffff", "twilightforest:blue_castle_door": "#00ffff",
    "twilightforest:yellow_castle_rune_brick": "#ffff00", "twilightforest:yellow_castle_door": "#ffff00",
    "twilightforest:violet_castle_rune_brick": "#4b0082", "twilightforest:violet_castle_door": "#4b0082",
    "twilightforest:violet_force_field": "#5c1074", "twilightforest:pink_force_field": "#fa057e", "twilightforest:orange_force_field": "#ff5b02",
    "twilightforest:green_force_field": "#89e701", "twilightforest:blue_force_field": "#0ddeff",
    # 按位置变色的（彩虹橡树叶、时间/变化/采矿/分类树叶）按群系树叶色；极光砖、塔木（波纹噪声取 HSV）不染。只长在地标和魔法树上，体素里几乎见不到
    **{f"twilightforest:{n}": "foliage" for n in ("rainbow_oak_leaves", "time_leaves", "transformation_leaves", "mining_leaves", "sorting_leaves")},
    "twilightforest:smoker": "grass", "twilightforest:fire_jet": "grass",   # 照原版草的颜色
    **{f"twilightforest:{n}": None for n in ("aurora_block", "aurora_pillar", "aurora_slab", "auroralized_glass",
                                             "towerwood", "cracked_towerwood", "infested_towerwood", "mossy_towerwood")},
    # 夸克：迈雅岩按位置取彩虹色（末地才有），不染
    **{f"quark:{n}": "grass" for n in ("potted_grass", "potted_large_fern", "potted_tall_grass", "potted_sugar_cane")},
    "quark:potted_vine": "foliage", "quark:cut_vine": "foliage",
}
# 匠魂的史莱姆草、叶、蕨、藤：SlimeColorizer 按坐标查 512 格一循环的色图，取整个循环的平均色（见 `slime_colors()`）
SLIME_RE = re.compile(r"tconstruct:(?:potted_)?(earth|sky|ichor|ender|blood)_(?:\w+_slime_grass|slime_leaves|slime_fern|slime_tall_grass|slime_vine)$")
QUARK_LEAVES_RE = re.compile(r"quark:(\w+?)_(hedge|leaf_carpet)$")


def tint_route(name, props, colors):
    if name in ("minecraft:melon_stem", "minecraft:pumpkin_stem"):   # 按生长阶段
        j = int(props.get("age", 0))
        return hexc(j * 32 << 16 | (255 - j * 8) << 8 | j * 4)
    if name in TINT: return TINT[name]
    m = SLIME_RE.match(name)
    if m: return colors["史莱姆"][m.group(1)]
    m = QUARK_LEAVES_RE.match(name)   # 夸克的树篱、落叶毯：AlikeColorHandler，照同种树叶的颜色（樱花、杜鹃、夸克自己的树叶不染）
    if m: return TINT.get(f"minecraft:{m.group(1)}_leaves")
    if name.startswith("twilightforest:hollow_") and name.endswith("_horizontal"): return colors["默认草"]   # 空心原木的苔藓：GrassColor.getDefaultColor()
    if name.startswith("twilightforest:hollow_") and name.endswith("_climbable"): return "foliage"   # 爬藤的那种按群系树叶色
    return None   # 模型里有 tintindex、但没登记 BlockColor 的（樱花树叶、炼药锅里的岩浆……），游戏里不染


def parse(state):
    if "[" not in state: return state, {}
    n, p = state[:-1].split("[")
    return n, dict(kv.split("=") for kv in p.split(",")) if p else {}


def state_name(name, props): return f"{name}[{','.join(f'{k}={v}' for k, v in sorted(props.items()))}]" if props else name


class BlockTable:
    def __init__(self):
        self.rp = ResourcePack([str(j) for j in JARS])
        self.tex, self.tex_idx, self.tex_a = [], {}, []
        self.part_cache = {}
        g = Image.open(io.BytesIO(self.rp.read("assets/minecraft/textures/colormap/grass.png"))).convert("RGBA")
        self.colors = {"默认草": hexc(colormap_color(g, 0.5, 1.0)), "史莱姆": slime_colors(self.rp)}

    def texture(self, key):
        if key in self.tex_idx: return self.tex_idx[key]
        ns, path = key.split(":")
        raw = self.rp.read(f"assets/{ns}/textures/{path}.png")
        if raw is None: return None
        im = Image.open(io.BytesIO(raw)).convert("RGBA")
        im = im.crop((0, 0, im.width, im.width))            # 动画贴图只取第一帧
        if im.width != 16: im = im.resize((16, 16), Image.BOX)
        self.tex_idx[key] = len(self.tex)
        self.tex.append((key, im))
        self.tex_a.append(im.getchannel("A").getextrema()[0])
        return self.tex_idx[key]

    def blockstate(self, name):
        ns, n = name.split(":")
        raw = self.rp.read(f"assets/{ns}/blockstates/{n}.json")
        return json.loads(raw) if raw else None

    def variants(self, name, props):
        """[(模型 id, rx, ry), ...]：多部件的方块返回全部满足条件的部件；普通方块返回第一个变体，
        另外返回这个状态是不是"几个只差 y 旋转的同一模型"（草方块、泥土）"""
        j = self.blockstate(name)
        if not j: return [], False
        if "variants" in j:
            for key, v in j["variants"].items():
                conds = [c.split("=") for c in key.split(",") if c]
                if all(props.get(k) == val for k, val in conds):
                    vs = v if isinstance(v, list) else [v]
                    if "model" not in vs[0]: return [], False
                    spin = len(vs) == 4 and len({x["model"] for x in vs}) == 1 and len({x.get("y", 0) for x in vs}) == 4
                    p = vs[0]
                    return [(rid(p["model"]), p.get("x", 0) // 90 % 4, p.get("y", 0) // 90 % 4)], spin
            return [], False
        out = []
        for part in j.get("multipart", []):
            if "when" not in part or when_ok(part["when"], props):
                a = part["apply"]
                a = a[0] if isinstance(a, list) else a
                out.append((rid(a["model"]), a.get("x", 0) // 90 % 4, a.get("y", 0) // 90 % 4))
        return out, False

    def faces(self, md, rx, ry):
        """模型的每个元素的每个面 → [朝向, 剔除方向, 贴图, -1, 染, 明暗, 四个角 xyz, 四个角 uv]（照 资源包.quads 的算法，多记 tintindex 和 cullface）"""
        out = []
        for el in md["elements"] or []:
            F, T, er = el["from"], el["to"], el.get("rotation")
            for d, f in el.get("faces", {}).items():
                t = self.rp.resolve(f["texture"], md["textures"])
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
                    def auto(pt, a): return sum(pt[i] * a[i] for i in range(3)) if sum(a) > 0 else 16 + sum(pt[i] * a[i] for i in range(3))
                    uv = [(auto(c, ua), auto(c, va)) for c in cs]
                k = f.get("rotation", 0) // 90
                uv = uv[-k:] + uv[:-k] if k else uv
                pos = []
                for c in cs:
                    c = turn(c, er)
                    c = rot([c[0] / 16 - 0.5, c[1] / 16 - 0.5, c[2] / 16 - 0.5], rx, ry)
                    pos += [q(16 * (c[0] + 0.5)), q(16 * (0.5 - c[2])), q(16 * (c[1] + 0.5))]   # 场景坐标，方块占 0～16
                nn = white(rot(turn(n, er, vector=True), rx, ry))
                dirn = DIRS.get(tuple(round(v) for v in nn), "") if not er or abs(er["angle"]) < 1e-6 else ""
                cull = DIRS[white(rot(VEC[f["cullface"]], rx, ry))] if f.get("cullface") in VEC else ""   # 原版脚手架写了个 "bottom"，游戏当没写
                out.append([dirn, cull, ti, -1, 1 if "tintindex" in f else 0, 1 if el.get("shade", True) else 0] + pos +
                           [q(v) for a, b in uv for v in (a, b)])
        return out

    def part(self, mid, rx, ry):
        """一个部件（模型 + 旋转）→ (面, 有没有整格的元素, 环境光遮蔽设置或 None)；没有可画的面返回 None"""
        k = (mid, rx, ry)
        if k in self.part_cache: return self.part_cache[k]
        j = json.loads(self.rp.read("assets/%s/models/%s.json" % tuple(mid.split(":"))) or "{}")
        out, loader = None, j.get("loader")
        if loader == "twilightforest:patch":
            # 暮色森林的苔藓片、三叶草片用自己的模型加载器，没有元素：画成贴地 1 像素高的一层（顶面，按贴图透明度镂空）
            t = self.texture(rid(j["texture"]))
            if t is not None: out = ([["+z", "", t, -1, 0, 1, 0, 16, 1, 16, 16, 1, 16, 0, 1, 0, 0, 1, 0, 0, 16, 0, 16, 16, 0, 16]], False, None)
        else:
            if loader == "forge:composite":
                # 几个子模型叠在一起（暮色城堡符文砖 = 砖 + 发光符文层）：按顺序拼，同位置的染色层并成叠加层
                md = {"textures": {}, "elements": [], "parents": []}
                for c in j["children"].values():
                    sub = self.rp.model(c["parent"]) if "parent" in c else {"textures": {}, "elements": None, "parents": []}
                    tx = {**sub["textures"], **c.get("textures", {})}
                    for el in c.get("elements", sub["elements"]) or []:
                        md["elements"].append({**el, "faces": {d: {**f, "texture": self.rp.resolve(f["texture"], tx) or f["texture"]} for d, f in el["faces"].items()}})
            elif loader == "twilightforest:giant_block":
                # 暮色巨人城堡的巨型方块：游戏里一张贴图铺满 4×4×4 格，这里每格铺一整张
                md = self.rp.model("minecraft:block/cube_all" if "all" in j["textures"] else "minecraft:block/cube")
                md = {**md, "textures": {**md["textures"], **j["textures"]}}
            elif loader == "twilightforest:castle_door":
                # 暮色城堡门：底色贴图 + 按门颜色染的符文角（游戏里连着的门拼成大图案，这里每格只画角）
                cube = self.rp.model("minecraft:block/cube_all")
                over = [{**el, "faces": {d: {**f, "texture": "#overlay", "tintindex": 0} for d, f in el["faces"].items()}} for el in cube["elements"]]
                md = {**cube, "textures": {**cube["textures"], "all": j["textures"]["base"], "overlay": j["textures"]["overlay"]}, "elements": cube["elements"] + over}
            else:
                md = self.rp.model(mid)
            if md["elements"]:   # 没有元素的（箱子、告示牌这类方块实体画的）不画
                ao = None
                for m in [mid] + md["parents"]:
                    r = self.rp.read("assets/%s/models/%s.json" % tuple(m.split(":")))
                    if r and "ambientocclusion" in json.loads(r):
                        ao = json.loads(r)["ambientocclusion"]
                        break
                fs = self.faces(md, rx, ry)
                # 草方块：同一个位置上的第二个面（带 tintindex 的那层边）并成第一个面的叠加层
                merged = []
                for f in fs:
                    same = next((g for g in merged if g[6:18] == f[6:18] and g[3] < 0), None)
                    if same is not None and f[4] == 1 and same[4] == 0:
                        same[3] = f[2]
                        continue
                    merged.append(f)
                if merged: out = (merged, any(e["from"] == [0, 0, 0] and e["to"] == [16, 16, 16] for e in md["elements"]), ao)
        self.part_cache[k] = out
        return out

    def block(self, state):
        """方块状态 → {类, 满, 遮, 光, 转, 偏, 染, 面: [部件的面, ...]}；画不出来的返回 None"""
        name, props = parse(state)
        fluid = LIQUID.get(name) or (f"tconstruct:fluid/slime/{name[11:-12]}/still" if SLIME_FLUID_RE.match(name) else None)
        if fluid:
            t = self.texture(fluid)
            # 水面：水源方块上面是空气时，游戏画在 8/9 格高（LiquidBlockRenderer）；运行时只画朝上的水面
            h = q(16 * 8 / 9)
            face = ["+z", "+z", t, -1, 1 if TINT.get(name) else 0, 1, 0, 16, h, 16, 16, h, 16, 0, h, 0, 0, h, 0, 0, 16, 0, 16, 16, 0, 16]
            return {"类": "liquid", "满": False, "遮": False, "光": True, "转": False, "偏": False, "染": TINT.get(name), "面": [[face]]}
        vs, spin = self.variants(name, props)
        parts, full, ao = [], False, True
        for mid, rx, ry in vs:
            p = self.part(mid, rx, ry)
            if not p: continue
            parts.append(p[0])
            full |= p[1]
            if p[2] is not None: ao = p[2]
        if not parts: return None
        alpha = min(self.tex_a[f[2]] for fs in parts for f in fs)
        cls = "translucent" if name in TRANSLUCENT else "cutout" if alpha < 128 else "solid"
        return {
            "类": cls,
            "满": full and cls == "solid",
            "遮": full,
            "光": bool(ao),
            "转": spin,
            "偏": cls == "cutout" and not full and any(w in name for w in OFFSET_WORDS),
            "染": tint_route(name, props, self.colors),
            "面": parts,
        }


def when_props(j):
    """多部件 blockstates 的 when 里每个属性出现过的值：{属性: {值}}"""
    acc = defaultdict(set)

    def collect(when):
        if "OR" in when or "AND" in when:
            for w in when.get("OR", []) + when.get("AND", []): collect(w)
            return
        for k, v in when.items(): acc[k].update(when_value(v))
    for part in j["multipart"]:
        if "when" in part: collect(part["when"])
    return acc


# 多部件方块里表示"这一面不连"的属性值，when 里不写，要补一个 none（墙的 low/tall、红石线的 side/up、竹叶的 large/small、暮色铁栅栏的柱子和栏杆）；
# 其余属性（axis、facing、花瓣数……）when 里出现的就是全部的值
CONNECT_VALUES = {"low", "tall", "side", "up", "large", "small", "post", "capped", "full", "top", "middle", "bottom"}


def multipart_states(name, j, saved_values):
    """多部件方块的全部组合（属性只记 when 里出现的），见文件头。
    false、none 排在前面：只给方块 id 不带属性查（体素值 退回这个方块导出的第一个状态）时取到的是什么都不连的那个（栅栏只有柱子）"""
    acc = when_props(j)
    for k, vs in acc.items():
        if vs <= {"true", "false"}: vs |= {"true", "false"}
        elif vs <= CONNECT_VALUES: vs.add("none")
        vs |= saved_values.get((name, k), set())
    keys = sorted(acc)
    doms = [sorted(acc[k], key=lambda v: (v not in ("false", "none"), v)) for k in keys]
    return [state_name(name, dict(zip(keys, c))) for c in itertools.product(*doms)]


def region_palettes(path):
    """一个区域文件里各区段的调色板：({(名, 属性元组): 区段数}, {群系: 区段数})"""
    st, bi = defaultdict(int), defaultdict(int)
    rx, rz = (int(v) for v in path.name.split(".")[1:3])
    for _, _, c in RD.chunks(str(path.parent), rx * 32, rz * 32, rx * 32 + 31, rz * 32 + 31, skip_arrays=True):
        for sec in c.get("sections", []):
            for p in sec.get("block_states", {}).get("palette", []): st[(p["Name"], tuple(sorted(p.get("Properties", {}).items())))] += 1
            for b in sec.get("biomes", {}).get("palette", []): bi[b] += 1
    return st, bi


def saved_states():
    """`SAVES` 里出现过的全部方块状态（带全部属性）和群系：({(名, 属性元组): 区段数}, {群系: 区段数})。区域文件分给几个进程读"""
    from concurrent.futures import ProcessPoolExecutor
    files = [f for root in SAVES for reg in [root / "region"] + sorted(root.glob("dimensions/*/*/region")) if reg.is_dir() for f in sorted(reg.glob("r.*.mca"))]
    st, bi = defaultdict(int), defaultdict(int)
    with ProcessPoolExecutor(max(1, (os.cpu_count() or 4) - 2)) as ex:
        for s1, b1 in ex.map(region_palettes, files, chunksize=4):
            for k, v in s1.items(): st[k] += v
            for k, v in b1.items(): bi[k] += v
    return st, bi


def slime_colors(rp):
    """匠魂 SlimeColorizer.getColor(色图, x, z) 在一个 512×512 循环里的平均色：
    fx = |256 - |x| % 512| / 256，fz 同理，大的当行、小的当列查 256×256 的色图"""
    out = {}
    for t in ("earth", "sky", "ichor", "ender", "blood"):
        im = Image.open(io.BytesIO(rp.read(f"assets/tconstruct/textures/colormap/{t}_grass_color.png"))).convert("RGB")
        px = im.load()
        f = [abs(f32(f32(256 - f32(x % 512)) / 256)) for x in range(512)]
        s = [0, 0, 0]
        for a in f:
            for b in f:
                hi, lo = (a, b) if a >= b else (b, a)
                c = px[int(f32(lo * 255)), int(f32(hi * 255))]
                for i in range(3): s[i] += c[i]
        out[t] = "#%02x%02x%02x" % tuple(round(v / 512 / 512) for v in s)
    return out


def biome_colors(rp):
    """各 jar 的 data/*/worldgen/biome/*.json → {群系: {草, 叶, 水, 草修饰?, 叶修饰?}}，照 Biome.getGrassColor / getFoliageColor / getWaterColor：
      写了 grass_color / foliage_color 的用它，没写的按温度、湿度查原版色图（温度、湿度是 float，夹到 0～1 再转 double）；
      草：grass_color_modifier 和位置无关的直接算进去（原版 dark_forest，暮色 swamp、dark_forest）；
      叶：暮色森林用 coremod（META-INF/asm/foliage.js）在 BiomeColors 的树叶色里插了 FoliageColorHandler，按群系改树叶色，
        和位置无关的（暮色 swamp、dark_forest）直接算进去；
      随位置变的记在 草修饰 / 叶修饰（草：原版 swamp，暮色 enchanted_forest、dark_forest_center、spooky_forest；叶：暮色后三个），
      lib/体素/群系色.ts 按坐标算，这时 草 / 叶 是改之前的底色。都是照反汇编复刻的"""
    gp = Image.open(io.BytesIO(rp.read("assets/minecraft/textures/colormap/grass.png"))).convert("RGBA")
    fp = Image.open(io.BytesIO(rp.read("assets/minecraft/textures/colormap/foliage.png"))).convert("RGBA")
    POSITION_VARYING = ("twilightforest:enchanted_forest", "twilightforest:dark_forest_center", "twilightforest:spooky_forest")
    out = {}
    for jar in JARS:
        z = zipfile.ZipFile(jar)
        for f in sorted(z.namelist()):
            m = re.fullmatch(r"data/([^/]+)/worldgen/biome/(.+)\.json", f)
            if not m: continue
            name = f"{m.group(1)}:{m.group(2)}"
            b = json.loads(z.read(f))
            e = b["effects"]
            t, d = f32(min(1, max(0, f32(b["temperature"])))), f32(min(1, max(0, f32(b["downfall"]))))
            grass = e["grass_color"] if "grass_color" in e else colormap_color(gp, t, d)
            mod = rid(e.get("grass_color_modifier", "none"))
            if mod == "minecraft:dark_forest": grass = ((grass & 0xFEFEFE) + 0x28340A) >> 1
            elif mod == "twilightforest:swamp": grass = ((colormap_color(gp, f32(0.8), f32(0.9)) & 0xFEFEFE) + 0x4E0E4E) // 2
            elif mod == "twilightforest:dark_forest": grass = ((colormap_color(gp, f32(0.7), f32(0.8)) & 0xFEFEFE) + 0x1E0E4E) // 2
            elif mod not in ("minecraft:none", "minecraft:swamp") + POSITION_VARYING:
                sys.exit(f"{name} 的 grass_color_modifier {mod} 没有照着复刻")
            leaf = e["foliage_color"] if "foliage_color" in e else colormap_color(fp, t, d)
            if name == "twilightforest:swamp": leaf = ((colormap_color(fp, f32(0.8), f32(0.9)) & 0xFEFEFE) + 0x4E0E4E) // 2
            elif name == "twilightforest:dark_forest": leaf = ((colormap_color(fp, f32(0.7), f32(0.8)) & 0xFEFEFE) + 0x1E0E4E) // 2
            c = {"草": hexc(grass), "叶": hexc(leaf), "水": hexc(e["water_color"])}
            if mod in ("minecraft:swamp",) + POSITION_VARYING: c["草修饰"] = mod
            if name in POSITION_VARYING: c["叶修饰"] = name
            out[name] = c
    return out


def main():
    T = BlockTable()
    saved, saved_biomes = saved_states()
    saved_values = defaultdict(set)
    for (n, props), _ in saved.items():
        for k, v in props: saved_values[(n, k)].add(v)
    # 要导出的状态：jar 里每个 blockstates
    states, variants, multipart = [], {}, {}
    for jar in JARS:
        z = zipfile.ZipFile(jar)
        for f in sorted(z.namelist()):
            m = re.fullmatch(r"assets/([^/]+)/blockstates/(.+)\.json", f)
            if not m: continue
            name = f"{m.group(1)}:{m.group(2)}"
            j = T.blockstate(name)
            if j is None: continue
            if "variants" in j:
                keys = [k for k in j["variants"] if all("=" in c for c in k.split(",") if c)]   # 冰火有两个写坏的键（没有 =），游戏也认不出
                states += [f"{name}[{k}]" if k else name for k in (keys if len(keys) <= 4 else keys[:1])]
                variants[name] = keys
            elif "multipart" in j:
                multipart[name] = j
                # 模组的多部件方块世界生成里不出现：只导不带属性的，存档里有的下面补
                states += multipart_states(name, j, saved_values) if jar in JARS[:2] else [name]
    # 荆棘之地导进来后荆棘各种连接、荆棘玫瑰各个朝向都会有：荆棘（brown_thorns，多部件）3 × 64 种已全导，荆棘玫瑰 6 个朝向（变体多于 4 个只导了第一个）这里补全
    states += [f"twilightforest:thorn_rose[facing={f}]" for f in ("down", "up", "north", "south", "west", "east")]
    # 存档里有、上面没导到的状态补上：变体的补存档里那个状态对上的变体，多部件的只记 when 里的属性
    have = set(states)
    for (n, props), _ in sorted(saved.items()):
        pd = dict(props)
        if n in variants:
            k = next((k for k in variants[n] if all(pd.get(a) == b for a, b in (c.split("=") for c in k.split(",") if c))), None)
            if k is None: continue
            s = f"{n}[{k}]" if k else n
        elif n in multipart:
            acc = when_props(multipart[n])
            s = state_name(n, {k: v for k, v in props if k in acc})
        else:
            continue
        if s not in have:
            have.add(s)
            states.append(s)
    for s in list(states):   # 双格高的（门、高草、大花）下半格导了，上半格也导
        n, p = parse(s)
        if p.get("half") == "lower": states.append(state_name(n, {**p, "half": "upper"}))
    blocks, groups, gidx = {}, [], {}
    for s in dict.fromkeys(states):
        try:
            b = T.block(s)
        except Exception as e:  # 少数模组方块的模型写法 资源包.py 解析不了，跳过
            print(f"  {s} 解析失败（{type(e).__name__}: {e}），不画", file=sys.stderr)
            continue
        if not b: continue
        ids = []
        for fs in b["面"]:
            k = json.dumps(fs)
            if k not in gidx:
                gidx[k] = len(groups)
                groups.append(fs)
            ids.append(gidx[k])
        blocks[s] = [["solid", "cutout", "translucent", "liquid"].index(b["类"]) + 4 * b["满"] + 8 * b["遮"] + 16 * b["光"] + 32 * b["转"] + 64 * b["偏"], b["染"]] + ids
    if len(T.tex) >= 4096: sys.exit(f"贴图 {len(T.tex)} 张，超过 4095（lib/体素/网格.ts 的贴图号只有 12 位）")
    if len(blocks) >= 65535: sys.exit(f"方块状态 {len(blocks)} 种，体素值是 16 位的放不下")
    # 核对：存档里的每个状态都要查得到（同 lib/真实方块表.ts 的 体素值：表里同一个方块 id 的状态，属性都和存档里的一样）
    by_id = defaultdict(list)
    for s in blocks:
        n, p = parse(s)
        by_id[n].append(p)
    missing = defaultdict(int)
    for (n, props), cnt in saved.items():
        pd = dict(props)
        if n in ("minecraft:air", "minecraft:cave_air", "minecraft:void_air"): continue
        if not any(all(pd.get(k) == v for k, v in p.items()) for p in by_id.get(n, [])): missing[state_name(n, pd)] += cnt
    biomes = biome_colors(T.rp)
    missing_biomes = sorted(b for b in saved_biomes if b not in biomes)
    # 输出
    strip = Image.new("RGBA", (16, 16 * len(T.tex)))
    for i, (_, im) in enumerate(T.tex): strip.paste(im, (0, 16 * i))
    OUTD.mkdir(parents=True, exist_ok=True)
    strip.save(OUTD / "方块表.png")
    out = {"说明": "工具/游戏取材/关键帧方块.py 从原版、暮色森林、冰火、匠魂、机械动力、夸克的 jar 里查出来的方块模型和贴图，不要手改",
           "贴图": [k for k, _ in T.tex], "面组": groups, "方块": blocks}
    json.dump(out, open(OUTD / "方块表.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump({"说明": "工具/游戏取材/关键帧方块.py 从各 jar 的群系 JSON 算出来的草、树叶、水色，规则见 lib/体素/群系色.ts，不要手改", "群系": biomes},
              open(OUTD / "群系色.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(blocks)} 种方块状态，{len(groups)} 组面，{len(T.tex)} 张贴图 → {OUTD / '方块表.json'}；{len(biomes)} 个群系 → 群系色.json", file=sys.stderr)
    print(f"存档里 {len(saved)} 种方块状态、{len(saved_biomes)} 个群系；查不到的方块状态 {len(missing)} 种，群系 {len(missing_biomes)} 个 {missing_biomes}", file=sys.stderr)
    for s, cnt in sorted(missing.items()): print(f"  缺 {s}（{cnt} 个区段）", file=sys.stderr)


if __name__ == "__main__":
    main()
