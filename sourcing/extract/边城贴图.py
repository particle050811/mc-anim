#!/usr/bin/env python3
"""边城（模型/场景/边城/）的方块贴图图集，和边城卫兵（模型/角色/卫兵.贴图/）的盔甲、披风、皮肤。全部取自 1.20.1 客户端 jar。

用法：sr extract 边城贴图（sr extract 按 sourcing/extract.toml 在暂存目录里调，目录布局照旧项目的 参考模型库/）

1. 方块贴图：src/模型/场景/边城/方块贴图.png（16×16 一张，8 列）+ 方块贴图.json（名字 → 序号、来源、平均色）。
   大部分是 jar 里的原图原样拷贝；几张是按游戏的画法合成的：
   - 草方块：顶面灰度贴图 × 平原群系的草色 #91BD59；侧面 = grass_block_side 上叠 grass_block_side_overlay × 草色（游戏里侧面就是这样两层）。
   - 橡树叶：灰度贴图 × 平原的树叶色 #77AB2F；镂空的像素按原版「流畅」画质的不透明画法补成同色压暗（远看是一团实心的树冠）。
   - 窗、门、铁闸：玻璃 / 门 / 铁栏杆的贴图叠在屋里的暗色上（参考模型里房子是实心的，看不到屋里，窗洞里画成屋里的暗色，透过玻璃的白色反光条看得出是窗）。
   - 暗：纯暗色，城墙和塔楼上的箭孔、门洞深处用。
2. 卫兵：见 src/模型/角色/卫兵.tsx 的说明。
   - 钻石甲1 / 钻石甲2：diamond_layer_1 / 2 原样，再叠「哨兵」盔甲纹饰（trims/models/armor/sentry、sentry_leggings），
     纹饰的灰度按 trim_palette → 金（gold）调色板换色，和游戏里 paletted_permutations 的做法一样（按 8 个灰度键逐像素替换）。
     两层的先后和 HumanoidArmorLayer 画的先后一样（盔甲 → 纹饰 → 附魔光泽）。
     用户 2026-10-12 在剪映里看 6-3-4 时留注释「城墙上士兵穿的铠甲不对吧？改成附魔的钻石甲吧」，原来的蓝染皮甲（皮甲1 / 皮甲2）换成了钻石甲。
   - 附魔光泽：misc/enchanted_glint_entity 原样（盔甲的附魔光效用的就是这张，RenderType.armorEntityGlint），怎么滚、怎么叠见 lib/实体模型.tsx 的 附魔 一节。
   - 披风：64×32 的披风贴图（PlayerModel 的 cloak 方盒 10×16×1，贴图坐标 (0,0)）。外面那一面画成一面旗帜：
     banner_base + 蓝底（base）+ 黄色圆形（circle）+ 黄色边框（border），这几个都是原版旗帜图案，旗面 20×40 取最近像素缩到 10×16（边框描一圈）；
     里面那一面和四个边是纯蓝底。
   - 皮肤-*：原版的默认皮肤（宽手臂），给不同的卫兵换脸。
"""
import io, json, os, sys, zipfile
from PIL import Image

ROOT = os.getcwd()
JAR = os.path.join(os.environ["SR_GAME"], "缓存", "client-1.20.1.jar")
TOWN_DIR = os.path.join(ROOT, "src", "模型", "场景", "边城")
GUARD_DIR = os.path.join(ROOT, "src", "模型", "角色", "卫兵.贴图")

z = zipfile.ZipFile(JAR)


def tex(path):
    im = Image.open(io.BytesIO(z.read(f"assets/minecraft/textures/{path}.png"))).convert("RGBA")
    # 动画贴图（竖着排了好几帧）只取第一帧
    if im.height > im.width and im.width == 16:
        im = im.crop((0, 0, 16, 16))
    return im


def hexrgb(h):
    h = int(h.lstrip("#"), 16) if isinstance(h, str) else h
    return ((h >> 16) & 255, (h >> 8) & 255, h & 255)


def tint(im, color):
    """游戏的染色：sRGB 数值直接相乘（顶点色 × 贴图），alpha 不变。"""
    r, g, b = hexrgb(color)
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            p = px[x, y]
            px[x, y] = (p[0] * r // 255, p[1] * g // 255, p[2] * b // 255, p[3])
    return out


def solid(color, size=(16, 16)):
    return Image.new("RGBA", size, hexrgb(color) + (255,))


def over(bottom, top):
    out = bottom.copy()
    out.alpha_composite(top)
    return out


GRASS = "#91BD59"  # 平原（temperature 0.8、downfall 0.4）在 grass.png 色图上的颜色
FOLIAGE = "#77AB2F"  # 平原在 foliage.png 色图上的颜色
INTERIOR = "#2a2420"  # 屋里的暗色

# ---------- 1. 方块贴图 ----------
def leaves():
    t = tint(tex("block/oak_leaves"), FOLIAGE)
    # 镂空的像素补成压暗的树叶色（不透明的树冠）
    r, g, b = hexrgb(FOLIAGE)
    base = solid((r * 45 // 100 << 16) | (g * 45 // 100 << 8) | (b * 45 // 100))
    return over(base, t)


TILES = {
    "石砖": "block/stone_bricks",
    "裂纹石砖": "block/cracked_stone_bricks",
    "苔石砖": "block/mossy_stone_bricks",
    "錾制石砖": "block/chiseled_stone_bricks",
    "平滑石头": "block/smooth_stone",
    "平滑石台阶侧": "block/smooth_stone_slab_side",
    "石头": "block/stone",
    "圆石": "block/cobblestone",
    "苔石": "block/mossy_cobblestone",
    "磨制安山岩": "block/polished_andesite",
    "安山岩": "block/andesite",
    "橡木木板": "block/oak_planks",
    "云杉木板": "block/spruce_planks",
    "深色橡木木板": "block/dark_oak_planks",
    "白桦木板": "block/birch_planks",
    "橡木原木": "block/oak_log",
    "橡木原木顶": "block/oak_log_top",
    "云杉原木": "block/spruce_log",
    "云杉原木顶": "block/spruce_log_top",
    "深色橡木原木": "block/dark_oak_log",
    "深色橡木原木顶": "block/dark_oak_log_top",
    "去皮云杉原木": "block/stripped_spruce_log",
    "去皮云杉原木顶": "block/stripped_spruce_log_top",
    "去皮橡木原木": "block/stripped_oak_log",
    "去皮橡木原木顶": "block/stripped_oak_log_top",
    "砖块": "block/bricks",
    "深板岩瓦": "block/deepslate_tiles",
    "深板岩砖": "block/deepslate_bricks",
    "黑色混凝土": "block/black_concrete",
    "磨制黑石": "block/polished_blackstone",
    "泥土": "block/dirt",
    "砂砾": "block/gravel",
    "土径顶": "block/dirt_path_top",
    "干草块侧": "block/hay_block_side",
    "干草块顶": "block/hay_block_top",
    "木桶侧": "block/barrel_side",
    "木桶顶": "block/barrel_top",
    "白色羊毛": "block/white_wool",
    "红色羊毛": "block/red_wool",
    "蓝色羊毛": "block/blue_wool",
    "黄色羊毛": "block/yellow_wool",
    "绿色羊毛": "block/green_wool",
    "橙色羊毛": "block/orange_wool",
    "白色陶瓦": "block/white_terracotta",
    "方解石": "block/calcite",
    "云杉活板门": "block/spruce_trapdoor",
    "水": "block/water_still",
}
MADE = {
    "草方块顶": lambda: tint(tex("block/grass_block_top"), GRASS),
    "草方块侧": lambda: over(tex("block/grass_block_side"), tint(tex("block/grass_block_side_overlay"), GRASS)),
    "橡树叶": leaves,
    "窗": lambda: over(solid(INTERIOR), tex("block/glass")),
    "铁闸": lambda: over(solid(INTERIOR), tex("block/iron_bars")),  # 城门的铁闸门：铁栏杆叠在门洞深处的暗色上
    "橡木门上": lambda: over(solid(INTERIOR), tex("block/oak_door_top")),
    "橡木门下": lambda: over(solid(INTERIOR), tex("block/oak_door_bottom")),
    "云杉门上": lambda: over(solid(INTERIOR), tex("block/spruce_door_top")),
    "云杉门下": lambda: over(solid(INTERIOR), tex("block/spruce_door_bottom")),
    "深色橡木门上": lambda: over(solid(INTERIOR), tex("block/dark_oak_door_top")),
    "深色橡木门下": lambda: over(solid(INTERIOR), tex("block/dark_oak_door_bottom")),
    "暗": lambda: solid("#161412"),
}


def build_atlas():
    names = list(TILES) + list(MADE)
    cols = 8
    rows = (len(names) + cols - 1) // cols
    atlas = Image.new("RGBA", (cols * 16, rows * 16), (0, 0, 0, 0))
    info = {"列": cols, "行": rows, "贴图": {}}
    for i, n in enumerate(names):
        im = tex(TILES[n]) if n in TILES else MADE[n]()
        if n == "水":
            im = tint(im, "#3F76E4")  # 平原的水色
        im = im.convert("RGBA")
        atlas.paste(im, ((i % cols) * 16, (i // cols) * 16))
        # 平均色（不透明像素的 sRGB 平均，给远景、调试用）
        px = [im.getpixel((x, y)) for y in range(16) for x in range(16)]
        px = [p for p in px if p[3] >= 128]
        avg = [round(sum(p[k] for p in px) / max(1, len(px))) for k in range(3)]
        info["贴图"][n] = {"序号": i, "来源": TILES.get(n, "合成"), "平均色": avg}
    os.makedirs(TOWN_DIR, exist_ok=True)
    atlas.save(os.path.join(TOWN_DIR, "方块贴图.png"))
    json.dump(info, open(os.path.join(TOWN_DIR, "方块贴图.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"方块贴图：{len(names)} 张 → {TOWN_DIR}/方块贴图.png")


# ---------- 2. 卫兵 ----------
DYE = {"蓝": 0x3C44AA, "黄": 0xFED83D, "白": 0xF9FFFE, "红": 0xB02E26}
UNIFORM = "蓝"  # 披风底色（10-12 以前也是皮甲的染色）
ARMOR = "diamond"  # 盔甲材质：钻石（用户 10-12 定）
TRIM = ("sentry", "gold")  # 盔甲纹饰：哨兵，金


def palette_swap(im, key, mat):
    keys = [key.getpixel((i, 0))[:3] for i in range(key.width)]
    vals = [mat.getpixel((i, 0))[:3] for i in range(mat.width)]
    table = dict(zip(keys, vals))
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            p = px[x, y]
            if p[3] and p[:3] in table:
                px[x, y] = table[p[:3]] + (p[3],)
    return out


def armor(layer):
    # 钻石甲不染色、没有 overlay 层，直接用原图；纹饰材料（金）和盔甲材料不同，用普通的 gold 调色板（同材料才换 _darker）
    base = tex(f"models/armor/{ARMOR}_layer_{layer}")
    pat, mat = TRIM
    trim = tex(f"trims/models/armor/{pat}" + ("_leggings" if layer == 2 else ""))
    trim = palette_swap(trim, tex("trims/color_palettes/trim_palette"), tex(f"trims/color_palettes/{mat}"))
    return over(base, trim)


def pattern(name, dye):
    """旗帜图案（LA 灰度 + alpha）× 染料色。"""
    im = Image.open(io.BytesIO(z.read(f"assets/minecraft/textures/entity/banner/{name}.png"))).convert("LA")
    r, g, b = hexrgb(DYE[dye])
    out = Image.new("RGBA", im.size)
    src = im.load()
    dst = out.load()
    for y in range(im.height):
        for x in range(im.width):
            l, a = src[x, y]
            dst[x, y] = (l * r // 255, l * g // 255, l * b // 255, a)
    return out


def cape():
    # 旗面：BannerRenderer 先画 banner_base，再按顺序画各层图案（第一层是底色 base）；旗面在贴图的 (1,1) 起 20×40
    flag = over(tex("entity/banner_base"), pattern("base", UNIFORM))
    plain = flag.crop((1, 1, 21, 41)).resize((1, 1), Image.BOX).getpixel((0, 0))  # 底色（里面、四个边用）
    flag = over(flag, pattern("circle", "黄"))
    # 缩到 10×16 取最近的像素（按面积平均会把黄边框和蓝底混成灰色）；边框只有 1 像素宽，最近取样会漏掉，单独描一圈
    face = flag.crop((1, 1, 21, 41)).resize((10, 16), Image.NEAREST)
    edge = over(Image.new("RGBA", (64, 64), (0, 0, 0, 0)), pattern("border", "黄")).getpixel((1, 1))
    for x in range(10):
        for y in range(16):
            if x in (0, 9) or y in (0, 15):
                face.putpixel((x, y), edge)
    out = Image.new("RGBA", (64, 32), (0, 0, 0, 0))
    # cloak 方盒（10×16×1，texOffs 0,0）：顶 (1,0) 10×1、底 (11,0) 10×1、西 (0,1) 1×16、北 (1,1) 10×16、东 (11,1) 1×16、南 (12,1) 10×16。
    # CapeLayer 把它绕 Y 转了 180°，所以北面（1,1）朝后、是从背后看到的外面，南面（12,1）贴着背
    for box in [(1, 0, 11, 1), (11, 0, 21, 1), (0, 1, 1, 17), (11, 1, 12, 17), (12, 1, 22, 17)]:
        out.paste(Image.new("RGBA", (box[2] - box[0], box[3] - box[1]), plain), box[:2])
    out.paste(face, (1, 1))
    return out


SKINS = ["kai", "noor", "efe", "makena", "sunny", "ari", "zuri", "alex", "steve"]


def build_guard():
    os.makedirs(GUARD_DIR, exist_ok=True)
    armor(1).save(os.path.join(GUARD_DIR, "钻石甲1.png"))
    armor(2).save(os.path.join(GUARD_DIR, "钻石甲2.png"))
    tex("misc/enchanted_glint_entity").save(os.path.join(GUARD_DIR, "附魔光泽.png"))
    cape().save(os.path.join(GUARD_DIR, "披风.png"))
    for i, s in enumerate(SKINS):
        tex(f"entity/player/wide/{s}").save(os.path.join(GUARD_DIR, f"皮肤{i}-{s}.png"))
    print(f"卫兵：钻石甲1、钻石甲2、附魔光泽、披风、{len(SKINS)} 张皮肤 → {GUARD_DIR}")


if __name__ == "__main__":
    what = sys.argv[1:] or ["城", "卫兵"]
    if "城" in what:
        build_atlas()
    if "卫兵" in what:
        build_guard()
