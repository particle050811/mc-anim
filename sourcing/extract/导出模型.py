#!/usr/bin/env python3
"""从游戏和模组的 jar 里导出模型、贴图的唯一入口。按「来源」的写法自动判断是哪种东西，原样照抄，不改数值。

用法（在参考模型库目录下）：
  uv run --with pillow 工具/游戏取材/导出模型.py <jar[,jar...]> <输出.json> <来源> [<来源>...] [选项]

来源有四种写法，一次导出里只能用一种：

1. 方块 / 物品模型（Java 版模型 JSON，绝大多数方块、机器、物品都是这种）
     部件名=命名空间:模型路径        例：叶片=create:block/encased_fan/propeller
     部件名=命名空间:方块名[属性=值]  例：外壳=create:encased_fan[facing=north]   按方块状态取模型，连同这个状态下的朝向
   每个部件单独成组，渲染时可以各转各的（风扇叶片、门、拉杆）。父模型、贴图变量、元素自带的旋转都会算进去。
   模型引用了别的 jar 里的贴图或父模型时，把那些 jar 一起写在第一个参数里（原版的在 client jar 里）。
   输出：{"textures": [...], "parts": {部件名: {"color": 平均色, "quads": [...]}}}，给 src/lib/方块模型.tsx 用；
   用到的贴图拼成一张图集，textures 里记每张在图集里的位置。
   选项 --染色 贴图通配=#rrggbb,...   草、树叶这类按群系染色的灰度贴图。

2. 基岩版模型（geometry JSON：车万女仆、YSM 的角色模型）
     jar内模型.json jar内贴图.png     选项 --去掉 骨骼名,骨骼名   连同子骨骼一起删掉
   输出骨骼和 cube 的原始数值，坐标换算在 src/lib/基岩模型.tsx 里做。

3. OBJ 网格（拔刀剑这类）
     jar内模型.obj jar内贴图.png      选项 --组 组名,组名   只导出这些组
   输出：{"tex": {w, h}, "groups": {组名: {"pos": [...], "uv": [...]}}}，给 src/lib/OBJ网格.tsx 用。
   一个 obj 用了好几张贴图（mtl 里每个材质一张，如机械动力的动力压路机）时，贴图写成 材质名=jar内贴图.png：
     jar内模型.obj 材质名=jar内贴图.png 材质名=jar内贴图.png ...
   这时按 usemtl 分组（组名就是材质名），几张贴图横着拼成一张图集，uv 换算到图集里；输出格式不变。

4. 只要贴图（形状写死在 Java 代码里的生物和箱子，形状得照着代码手搭，贴图从这里取）
     名字=jar内贴图.png ...           路径里可以用 * 通配，名字取文件名
   这种写法的 <输出> 是一个目录（每张存成 目录/名字.png），只导一张时也可以直接写成 某某.png。

贴图一律存成 PNG 文件：前三种写在输出 JSON 旁边、同名换成 .png（九胡.模型.json → 九胡.模型.png）。
统一转成 8 位 RGBA，像素和 jar 里的一样；组件里用 src/lib/贴图.ts 的 png() 读。
别的脚本可以 import 本文件的 read_obj / save_png（拔刀剑要先调色再存）。
"""
import sys, json, zipfile, io, fnmatch, os, re
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def png_beside(json_path):
    return json_path[:-5] + ".png"


def save_png(im, path):
    """存成 8 位 RGBA 的 PNG，返回写进 JSON 的尺寸。"""
    im = im.convert("RGBA")
    im.save(path)
    return {"w": im.width, "h": im.height}


def dump(data, path):
    json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))


# ---------- 3. OBJ ----------
def read_obj(text, names=None, by_material=False):
    """返回 {组名: {"pos": [...], "uv": [...]}}；names 为空时导出全部组。
    坐标保持 obj 原始单位和轴向；面全部三角化、不共用顶点；uv 的 v 翻成「0 在贴图第一行」。
    by_material：按 usemtl 分组（组名 = 材质名），给一个模型用好几张贴图的 obj。"""
    vs, vts, groups, g = [], [], {}, "default"
    for line in text.splitlines():
        p = line.split()
        if not p:
            continue
        if p[0] == "v":
            vs.append([float(x) for x in p[1:4]])
        elif p[0] == "vt":
            vts.append([float(x) for x in p[1:3]])
        elif p[0] in ("g", "o") and not by_material:
            g = p[1] if len(p) > 1 else "default"
        elif p[0] == "usemtl" and by_material:
            g = p[1] if len(p) > 1 else "default"
        elif p[0] == "f":
            corners = []
            for c in p[1:]:
                a = c.split("/")
                vi = int(a[0])
                ti = int(a[1]) if len(a) > 1 and a[1] else 0
                corners.append((vs[vi - 1 if vi > 0 else vi], vts[ti - 1 if ti > 0 else ti] if ti else [0.0, 0.0]))
            out = groups.setdefault(g, {"pos": [], "uv": []})
            for i in range(1, len(corners) - 1):  # 多边形按扇形拆成三角形
                for v, t in (corners[0], corners[i], corners[i + 1]):
                    out["pos"] += [round(x, 3) for x in v]
                    out["uv"] += [round(t[0], 5), round(1 - t[1], 5)]
    if names:
        missing = [n for n in names if n not in groups]
        if missing:
            sys.exit(f"obj 里没有这些组：{missing}；现有：{list(groups)}")
        groups = {n: groups[n] for n in names}
    return groups


def export_obj(jar, out_path, obj_path, tex_path, names):
    groups = read_obj(jar.read(obj_path).decode("utf-8", "ignore"), names)
    tex = save_png(Image.open(io.BytesIO(jar.read(tex_path))), png_beside(out_path))
    json.dump({"tex": tex, "groups": groups}, open(out_path, "w", encoding="utf-8"), separators=(",", ":"))
    print("写入", out_path, {k: len(v["pos"]) // 9 for k, v in groups.items()}, "三角形；贴图", (tex["w"], tex["h"]))


def export_obj_multi(jars, out_path, obj_path, tex_sources):
    """一个 obj 用好几张贴图：按材质分组，贴图横着拼成图集（各张顶端对齐），uv 按图集换算（obj 的 uv 都在 0～1 里，不平铺）。
    贴图按顺序在各个 jar 里找（粉碎轮用了原版的云杉原木顶）。"""
    mats = dict(src.split("=", 1) for src in tex_sources)
    groups = read_obj(jars[0].read(obj_path).decode("utf-8", "ignore"), list(mats), by_material=True)
    read_any = lambda p: next(j.read(p) for j in jars if p in j.namelist())
    ims = {m: Image.open(io.BytesIO(read_any(p))).convert("RGBA") for m, p in mats.items()}
    W = sum(im.width for im in ims.values())
    H = max(im.height for im in ims.values())
    atlas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    x = 0
    for m, im in ims.items():
        atlas.paste(im, (x, 0))
        uv = groups[m]["uv"]
        for i in range(0, len(uv), 2):
            uv[i] = round((x + uv[i] * im.width) / W, 6)
            uv[i + 1] = round(uv[i + 1] * im.height / H, 6)
        x += im.width
    tex = save_png(atlas, png_beside(out_path))
    json.dump({"来源": {"模型": obj_path, "贴图": mats}, "tex": tex, "groups": groups}, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("写入", out_path, {k: len(v["pos"]) // 9 for k, v in groups.items()}, "三角形；图集", (tex["w"], tex["h"]))


# ---------- 2. 基岩版模型 ----------
def rnd(v):
    if isinstance(v, float):
        r = round(v, 5)
        return int(r) if r == int(r) else r
    if isinstance(v, list):
        return [rnd(x) for x in v]
    if isinstance(v, dict):
        return {k: rnd(x) for k, x in v.items()}
    return v


def export_bedrock(jar, jar_path, out_path, model_path, tex_path, drop):
    # 支持两种文件格式：1.12+ 的 "minecraft:geometry"，和 1.8/1.10 的 "geometry.xxx"（车万女仆的老模型）
    doc = json.loads(jar.read(model_path))
    if "minecraft:geometry" in doc:
        geo = doc["minecraft:geometry"][0]
        desc = geo["description"]
        tex_w, tex_h = desc["texture_width"], desc["texture_height"]
    else:
        geo = next(v for k, v in doc.items() if k.startswith("geometry."))
        tex_w, tex_h = geo["texturewidth"], geo["textureheight"]
    by_name = {b["name"]: b for b in geo["bones"]}

    def dropped(b):
        while b is not None:
            if b["name"] in drop:
                return True
            b = by_name.get(b.get("parent"))
        return False

    BONE_KEYS = ("name", "parent", "pivot", "rotation", "mirror")
    CUBE_KEYS = ("origin", "size", "uv", "inflate", "pivot", "rotation", "mirror")
    bones, n_cubes = [], 0
    for b in geo["bones"]:
        if dropped(b):
            continue
        ob = {k: rnd(b[k]) for k in BONE_KEYS if k in b}
        ob.setdefault("pivot", [0, 0, 0])
        cubes = [{k: rnd(c[k]) for k in CUBE_KEYS if k in c} for c in b.get("cubes", [])]
        if cubes:
            ob["cubes"] = cubes
            n_cubes += len(cubes)
        bones.append(ob)
    tex = save_png(Image.open(io.BytesIO(jar.read(tex_path))), png_beside(out_path))
    dump({
        "来源": {"jar": jar_path.split("/")[-1], "模型": model_path, "贴图": tex_path},
        "texW": tex_w,
        "texH": tex_h,
        "bones": bones,
        "texture": tex,
    }, out_path)
    print("写入", out_path, f"{len(bones)} 根骨骼, {n_cubes} 个 cube, 贴图 {tex['w']}x{tex['h']}（模型声明 {tex_w}x{tex_h}）")


# ---------- 4. 只要贴图 ----------
def natural(s):
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", s)]


def export_textures(jar, out_path, sources):
    found = []
    for src in sources:
        name, path = src.split("=") if "=" in src else (None, src)
        paths = sorted(fnmatch.filter(jar.namelist(), path), key=natural) if "*" in path else [path]
        if not paths:
            sys.exit(f"jar 里没有匹配 {path} 的文件")
        for p in paths:
            key = name if name and len(paths) == 1 else os.path.basename(p)[:-4]
            found.append((key, p))
    single = out_path.endswith(".png")
    if single and len(found) != 1:
        sys.exit("输出写成了单个 .png，但来源不止一张；多张时输出要写目录")
    if not single:
        os.makedirs(out_path, exist_ok=True)
    sizes = {}
    for key, p in found:
        dst = out_path if single else os.path.join(out_path, key + ".png")
        t = save_png(Image.open(io.BytesIO(jar.read(p))), dst)
        sizes[key] = (t["w"], t["h"])
    print("写入", out_path, sizes)


# ---------- 1. 方块 / 物品模型 ----------
def export_java(jar_paths, out_path, sources, tints):
    from 资源包 import ResourcePack
    pack = ResourcePack(jar_paths, tints)
    parts = {}
    for src in sources:
        name, mid = src.split("=", 1)
        rx = ry = 0
        if "[" in mid:   # 方块状态：查 blockstates 得到模型和它在这个状态下的旋转
            block, props = mid[:-1].split("[")
            v = pack.variant(block, dict(kv.split("=") for kv in props.split(",") if kv))
            if not v:
                sys.exit(f"blockstates 里查不到 {mid}")
            mid, rx, ry = v
        md = pack.model(mid)
        if not md["elements"]:
            sys.exit(f"{mid} 没有元素：文件不存在，或者它是内置模型（形状写在 Java 代码里）。父模型链：{md['parents']}")
        quads = pack.quads(md, rx, ry)
        parts[name] = {"模型": mid, "color": pack.particle_color(md), "quads": quads}
    dump({"来源": [os.path.basename(j) for j in jar_paths], "textures": pack.save_atlas(png_beside(out_path)), "parts": parts}, out_path)
    print("写入", out_path, {k: f"{len(v['quads'])} 个面" for k, v in parts.items()}, "贴图", [t["key"] for t in pack.textures])


if __name__ == "__main__":
    args = sys.argv[1:]

    def option(flag):
        if flag not in args:
            return None
        i = args.index(flag)
        v = args[i + 1]
        del args[i : i + 2]
        return v

    drop = set((option("--去掉") or "").split(",")) - {""}
    groups = (option("--组") or "").split(",")
    groups = [g for g in groups if g] or None
    tints = dict(kv.split("=") for kv in (option("--染色") or "").split(",") if kv)
    if len(args) < 3:
        sys.exit(__doc__)
    jar_paths, out_path, sources = args[0].split(","), args[1], args[2:]
    jar = zipfile.ZipFile(jar_paths[0])
    first = sources[0]
    if first.endswith(".obj") and any("=" in x for x in sources[1:]):
        export_obj_multi([zipfile.ZipFile(p) for p in jar_paths], out_path, sources[0], sources[1:])
    elif first.endswith(".obj"):
        export_obj(jar, out_path, sources[0], sources[1], groups)
    elif first.endswith(".json") and "=" not in first:
        export_bedrock(jar, jar_paths[0], out_path, sources[0], sources[1], drop)
    elif first.endswith(".png"):
        export_textures(jar, out_path, sources)
    elif "=" in first:
        export_java(jar_paths, out_path, sources, tints)
    else:
        sys.exit(f"看不出 {first} 是哪种来源。\n" + __doc__)
