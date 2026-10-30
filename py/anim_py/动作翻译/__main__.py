"""命令行：把一个生物模型类的 setupAnim（连同 prepareMobModel）翻成姿态程序 JSON。

  python -m anim_py.动作翻译 <输出.json> <模型类全名> --jar <jar>[,<jar>...] [--映射 proguard:<client.txt> | srg:<tsrg>,<client.txt>]
      [--模型 <模型.json>:<名字>] [--固定 <输入名>=<值>]... [--不带prepare]

  --模型   导出实体模型.py 的输出，给了就按它的部件树核对 getChild、做子树复位
  --固定   翻译时就定死的输入（部分求值），如 --固定 model.riding=0 --固定 model.rightArmPose=EMPTY；值是数或枚举常量名
例（原版苦力怕，混淆客户端 + 官方映射）：
  python -m anim_py.动作翻译 苦力怕.动作.json net.minecraft.client.model.CreeperModel --jar client-1.20.1.jar --映射 proguard:client-1.20.1.txt
"""

from __future__ import annotations

import argparse
import json
import os
import sys

from .执行 import 不支持, 翻译器
from .映射 import 读映射
from .类文件 import 类路径


def 读模型树(说明: str) -> dict[str, list[str]]:
    文件, _, 名字 = 说明.rpartition(":")
    data = json.load(open(文件, encoding="utf-8"))
    root = data["models"][名字]["root"]
    树: dict[str, list[str]] = {}

    def walk(p: dict) -> None:
        树[p["name"]] = [c["name"] for c in p["children"]]
        for c in p["children"]:
            walk(c)

    walk(root)
    return 树


def 解析固定(项们: list[str]) -> dict[str, object]:
    out: dict[str, object] = {}
    for x in 项们:
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
    ap.add_argument("--固定", action="append", default=[])
    ap.add_argument("--不带prepare", action="store_true")
    a = ap.parse_args(argv)
    映射 = 读映射(a.映射)
    路径 = 类路径(a.jar.split(","), 映射)
    t = 翻译器(路径, a.类, 解析固定(a.固定), 读模型树(a.模型) if a.模型 else None)
    try:
        prog = t.翻译(带prepare=not a.不带prepare)
    except 不支持 as e:
        print(f"翻译不了 {a.类}：{e}", file=sys.stderr)
        return 2
    prog["来源"] = {"jar": [os.path.basename(j) for j in a.jar.split(",")], "映射": 映射.名称}
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
