"""命令行：把一个生物模型类的 setupAnim（连同 prepareMobModel）翻成姿态程序 JSON。

  python -m anim_py.动作翻译 <输出.json> <模型类全名> --jar <jar>[,<jar>...] [--映射 proguard:<client.txt> | srg:<tsrg>[,<client.txt>]]
      [--模型 <模型.json>:<名字> | --层 <方法名>] [--固定 <输入名>=<值>]... [--不带prepare]

  --模型   导出实体模型.py 的输出，给了就按它的部件树核对 getChild、做子树复位、按名字找部件（关键帧动画）
  --层     不给 --模型 时，部件树从模型类的哪个无参层定义方法跑出来（默认取唯一的 static LayerDefinition xxx()）
  --固定   翻译时就定死的输入（部分求值），如 --固定 model.riding=0 --固定 model.rightArmPose=EMPTY；值是数或枚举常量名
例（原版苦力怕，混淆客户端 + 官方映射）：
  python -m anim_py.动作翻译 苦力怕.动作.json net.minecraft.client.model.CreeperModel --jar client-1.20.1.jar --映射 proguard:client-1.20.1.txt
"""

from __future__ import annotations

import argparse
import json
import os
import sys

from .执行 import Unsupported, Translator
from .映射 import read_mapping
from .类文件 import ClassPath


def read_model_tree(spec: str) -> dict[str, list[str]]:
    file_path, _, model_name = spec.rpartition(":")
    data = json.load(open(file_path, encoding="utf-8"))
    root = data["models"][model_name]["root"]
    tree: dict[str, list[str]] = {}

    def walk(p: dict) -> None:
        tree[p["name"]] = [c["name"] for c in p["children"]]
        for c in p["children"]:
            walk(c)

    walk(root)
    return tree


def parse_fixed(items: list[str]) -> dict[str, object]:
    out: dict[str, object] = {}
    for x in items:
        k, _, v = x.partition("=")
        try:
            out[k] = int(v)
        except ValueError:
            try:
                out[k] = float(v)
            except ValueError:
                out[k] = v
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m anim_py.动作翻译", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("输出")
    ap.add_argument("类")
    ap.add_argument("--jar", required=True)
    ap.add_argument("--映射")
    ap.add_argument("--模型")
    ap.add_argument("--层")
    ap.add_argument("--固定", action="append", default=[])
    ap.add_argument("--不带prepare", action="store_true")
    a = ap.parse_args(argv)
    mapping = read_mapping(a.映射)
    classpath = ClassPath(a.jar.split(","), mapping)
    t = Translator(classpath, a.类, parse_fixed(a.固定), read_model_tree(a.模型) if a.模型 else None, 层=a.层)
    try:
        prog = t.translate(with_prepare=not a.不带prepare)
    except Unsupported as e:
        print(f"翻译不了 {a.类}：{e}", file=sys.stderr)
        return 2
    prog["来源"] = {"jar": [os.path.basename(j) for j in a.jar.split(",")], "映射": mapping.mapping_name}
    os.makedirs(os.path.dirname(os.path.abspath(a.输出)), exist_ok=True)
    with open(a.输出, "w", encoding="utf-8") as f:
        json.dump(prog, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    n = len(prog["节点"])
    print(f"{a.类}：{len(prog['输出'])} 个部件、{n} 个节点、{len(prog['输入'])} 个输入、{len(prog['警告'])} 条警告 → {a.输出}")
    for w in prog["警告"]:
        print(f"  警告：{w}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
