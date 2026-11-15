#!/usr/bin/env python3
"""按物品注册名导出背包图标：读 models/item/<注册名>.json，照它 layer0 实际指向的贴图存成 <输出目录>/<注册名>.png。

图标文件名和注册名常常对不上（Goety 的 fireball_focus 指向 minor_fireball_spell.png，textures/item/focus/ 下还有
没有物品用的模板和激活态贴图），所以不按贴图目录通配，一律从物品模型查。

用法（anim extract 按 sourcing/extract.toml 在暂存目录里调）：
  uv run --with pillow 导出物品图标.py <输出目录> --jar <jar> [--jar <jar>…] --命名空间 <ns> [--谓词 <名>] [--来源 <json>] <注册名>…
  --jar     可写多次，照资源包叠放的先后：后面的盖前面的（启示录盖 Goety 的 7 个聚晶模型）
  --谓词    不取模型自己的 layer0，改取 overrides 里 predicate 带这个名字的那一条指向的模型
            （启示录给戴光环的人换的图标：owner_halo_state、owner_halo_odamane）；物品没有这条就报错
  --来源    写一个 JSON {输出文件: [字节取自的 jar 路径]}（文件已有就并进去），anim extract --register 照它按件记来源（配方步骤里传 {产物来源}）
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


def split_position(s: str, default_namespace: str) -> tuple[str, str]:
    ns, _, p = s.rpartition(":")
    return (ns or default_namespace), p


def main(argv: list[str]) -> int:
    jar_paths: list[str] = []
    names: list[str] = []
    namespace = predicate = source_file = None
    it = iter(argv)
    out_dir = next(it, None)
    for a in it:
        if a == "--jar":
            jar_paths.append(next(it))
        elif a == "--命名空间":
            namespace = next(it)
        elif a == "--谓词":
            predicate = next(it)
        elif a == "--来源":
            source_file = next(it)
        else:
            names.append(a)
    if not out_dir or not jar_paths or not namespace or not names:
        print(__doc__, file=sys.stderr)
        return 2

    jars = [(p, zipfile.ZipFile(p)) for p in jar_paths]
    jar_entries = [(p, set(z.namelist())) for p, z in jars]

    def read_entry(entry_name: str) -> tuple[str, bytes] | None:
        for (p, z), (_, present_names) in zip(reversed(jars), reversed(jar_entries)):
            if entry_name in present_names:
                return p, z.read(entry_name)
        return None

    def read_model(ns: str, model_path: str) -> dict:
        got = read_entry(f"assets/{ns}/models/{model_path}.json")
        if got is None:
            raise SystemExit(f"jar 里没有物品模型 {ns}:{model_path}")
        return json.loads(got[1])

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    sources: dict[str, list[str]] = {}
    for item_name in names:
        model = read_model(namespace, f"item/{item_name}")
        if predicate:
            matched_overrides = [o for o in model.get("overrides", []) if predicate in o.get("predicate", {})]
            if len(matched_overrides) != 1:
                raise SystemExit(f"{namespace}:{item_name} 的 overrides 里带 {predicate} 的有 {len(matched_overrides)} 条，要正好 1 条")
            model = read_model(*split_position(matched_overrides[0]["model"], "minecraft"))
        if model.get("parent", "").removeprefix("minecraft:") != "item/generated" or list(model.get("textures", {})) != ["layer0"]:
            raise SystemExit(f"{namespace}:{item_name} 不是单层 item/generated：{json.dumps(model, ensure_ascii=False)[:200]}")
        tns, tp = split_position(model["textures"]["layer0"], "minecraft")
        texture_path = f"assets/{tns}/textures/{tp}.png"
        got = read_entry(texture_path)
        if got is None:
            raise SystemExit(f"{namespace}:{item_name} 指向的贴图不在 jar 里：{texture_path}")
        if read_entry(texture_path + ".mcmeta") is not None:
            raise SystemExit(f"{namespace}:{item_name} 指向的是动画贴图（{texture_path}.mcmeta），这个脚本不处理")
        file_path = out / f"{item_name}.png"
        dimensions = save_png(Image.open(io.BytesIO(got[1])), str(file_path))
        sources[file_path.as_posix()] = [got[0]]
        print(f"{namespace}:{item_name} ← {tns}:{tp}（{dimensions['w']}×{dimensions['h']}）")
    if source_file:
        # 一条配方里调几次（光环版分两个谓词）写同一个文件，接着上一次的写
        try:
            sources = {**json.loads(Path(source_file).read_text(encoding="utf-8")), **sources}
        except (OSError, ValueError):
            pass
        Path(source_file).parent.mkdir(parents=True, exist_ok=True)
        Path(source_file).write_text(json.dumps(sources, ensure_ascii=False), encoding="utf-8")
    print(f"共 {len(names)} 个 → {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
