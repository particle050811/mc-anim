#!/usr/bin/env python3
"""按物品注册名导出背包图标：读 models/item/<注册名>.json，照它 layer0 实际指向的贴图存成 <输出目录>/<注册名>.png。

图标文件名和注册名常常对不上（Goety 的 fireball_focus 指向 minor_fireball_spell.png，textures/item/focus/ 下还有
没有物品用的模板和激活态贴图），所以不按贴图目录通配，一律从物品模型查。

用法（anim extract 按 sourcing/extract.toml 在暂存目录里调）：
  uv run --with pillow 导出物品图标.py <输出目录> --jar <jar> [--jar <jar>…] --命名空间 <ns> [--谓词 <名>] [--来源 <json>] <注册名>…
  --jar     可写多次，照资源包叠放的先后：后面的盖前面的（启示录盖 Goety 的 7 个聚晶模型）
  --谓词    不取模型自己的 layer0，改取 overrides 里 predicate 带这个名字的那一条指向的模型
            （启示录给戴光环的人换的图标：owner_halo_state、owner_halo_odamane）；物品没有这条就报错
  --来源    写一个 JSON {输出文件: [字节取自的 jar 路径]}（文件已有就并进去），anim extract --登记 照它按件记来源（配方步骤里传 {产物来源}）
只认 item/generated、builtin 之外没有父模型链的单层图标；带 .mcmeta 的动画贴图不处理，碰到就报错。
贴图照 导出模型.py 的规矩存成 8 位 RGBA，像素和 jar 里一样。
"""
import io
import json
import os
import sys
import zipfile
from pathlib import Path

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from 导出模型 import save_png  # noqa: E402


def 拆位置(s: str, 默认命名空间: str) -> tuple[str, str]:
    ns, _, p = s.rpartition(":")
    return (ns or 默认命名空间), p


def main(argv: list[str]) -> int:
    jar路径们: list[str] = []
    名们: list[str] = []
    命名空间 = 谓词 = 来源文件 = None
    it = iter(argv)
    输出 = next(it, None)
    for a in it:
        if a == "--jar":
            jar路径们.append(next(it))
        elif a == "--命名空间":
            命名空间 = next(it)
        elif a == "--谓词":
            谓词 = next(it)
        elif a == "--来源":
            来源文件 = next(it)
        else:
            名们.append(a)
    if not 输出 or not jar路径们 or not 命名空间 or not 名们:
        print(__doc__, file=sys.stderr)
        return 2

    jars = [(p, zipfile.ZipFile(p)) for p in jar路径们]
    名单 = [(p, set(z.namelist())) for p, z in jars]

    def 读(条目: str) -> tuple[str, bytes] | None:
        for (p, z), (_, 有) in zip(reversed(jars), reversed(名单)):
            if 条目 in 有:
                return p, z.read(条目)
        return None

    def 读模型(ns: str, 路径: str) -> dict:
        got = 读(f"assets/{ns}/models/{路径}.json")
        if got is None:
            raise SystemExit(f"jar 里没有物品模型 {ns}:{路径}")
        return json.loads(got[1])

    out = Path(输出)
    out.mkdir(parents=True, exist_ok=True)
    来源: dict[str, list[str]] = {}
    for 名 in 名们:
        模型 = 读模型(命名空间, f"item/{名}")
        if 谓词:
            条 = [o for o in 模型.get("overrides", []) if 谓词 in o.get("predicate", {})]
            if len(条) != 1:
                raise SystemExit(f"{命名空间}:{名} 的 overrides 里带 {谓词} 的有 {len(条)} 条，要正好 1 条")
            模型 = 读模型(*拆位置(条[0]["model"], "minecraft"))
        if 模型.get("parent", "").removeprefix("minecraft:") != "item/generated" or list(模型.get("textures", {})) != ["layer0"]:
            raise SystemExit(f"{命名空间}:{名} 不是单层 item/generated：{json.dumps(模型, ensure_ascii=False)[:200]}")
        tns, tp = 拆位置(模型["textures"]["layer0"], "minecraft")
        贴图 = f"assets/{tns}/textures/{tp}.png"
        got = 读(贴图)
        if got is None:
            raise SystemExit(f"{命名空间}:{名} 指向的贴图不在 jar 里：{贴图}")
        if 读(贴图 + ".mcmeta") is not None:
            raise SystemExit(f"{命名空间}:{名} 指向的是动画贴图（{贴图}.mcmeta），这个脚本不处理")
        文件 = out / f"{名}.png"
        尺寸 = save_png(Image.open(io.BytesIO(got[1])), str(文件))
        来源[文件.as_posix()] = [got[0]]
        print(f"{命名空间}:{名} ← {tns}:{tp}（{尺寸['w']}×{尺寸['h']}）")
    if 来源文件:
        # 一条配方里调几次（光环版分两个谓词）写同一个文件，接着上一次的写
        try:
            来源 = {**json.loads(Path(来源文件).read_text(encoding="utf-8")), **来源}
        except (OSError, ValueError):
            pass
        Path(来源文件).parent.mkdir(parents=True, exist_ok=True)
        Path(来源文件).write_text(json.dumps(来源, ensure_ascii=False), encoding="utf-8")
    print(f"共 {len(名们)} 个 → {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
