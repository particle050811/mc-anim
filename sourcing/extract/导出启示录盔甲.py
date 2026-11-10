#!/usr/bin/env python3
"""从启示录内层 jar（RevelationFix）导出神灵金盔甲的网格：几何不是方盒模型，是写死在类里的顶点数组，原样照抄不改数值。

用法（anim extract 按 sourcing/extract.toml 在暂存目录里调）：python3 导出启示录盔甲.py <RevelationFix jar> <输出.json>

读的是 com.mega.revelationfix.client.model.armor.ApocalyptiumArmorGeometry：
  HEAD / CHEST / LEGS / FEET：ArmorMesh(bone, float[] vertices) 的数组，每个顶点 8 个数（x y z 像素、u v、法线 x y z），四个顶点一个面；
  CAPE_REST（5 列 × 15 行的披风静止网格）、CAPE_FRONT_UV / CAPE_BACK_UV（上下两幅各四角的 uv）、CAPE_COLLISION（胸甲的碰撞三角形）。
做法：javap -c 反汇编，按栈机把每个方法和 <clinit> 里的数组初始化跑一遍（只认填数组用到的那几条指令，遇到不认识的就报错）。
bone 的序号照 ApocalyptiumArmorModel 构造函数里的 parts：head、body、rightArm、leftArm、rightLeg、leftLeg。
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

类 = "com/mega/revelationfix/client/model/armor/ApocalyptiumArmorGeometry"
JAVAP = os.path.join(os.environ["ANIM_JAVA_HOME"], "bin", "javap") if os.environ.get("ANIM_JAVA_HOME") else "javap"
骨 = ["head", "body", "right_arm", "left_arm", "right_leg", "left_leg"]


def 反汇编(jar: str) -> str:
    with zipfile.ZipFile(jar) as z:
        字节 = z.read(类 + ".class")
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "C.class")
        Path(p).write_bytes(字节)
        return subprocess.run([JAVAP, "-c", "-p", "-constants", p], capture_output=True, text=True, check=True, encoding="utf-8").stdout


def 拆方法(text: str) -> dict[str, list[str]]:
    """{方法名: [指令行]}；<clinit> 记成 static"""
    out, cur = {}, None
    for line in text.splitlines():
        m = re.match(r"^  (?:private |public )?static (?:\S+ )?(\w+)\(\);$", line) or (re.match(r"^  (static) \{\};$", line))
        if m:
            cur = out.setdefault(m.group(1), [])
            continue
        if cur is not None and re.match(r"^\s+\d+: ", line):
            cur.append(line.split(":", 1)[1].strip())
        elif line.strip() == "" or line.startswith("}"):
            cur = None
    return out


def 跑(指令: list[str], 网格们: dict[str, dict], 字段: dict[str, object]):
    栈: list[object] = []
    for ins in 指令:
        op, _, rest = ins.partition(" ")
        rest = rest.strip()
        if m := re.fullmatch(r"iconst_(\d)", op):
            栈.append(int(m.group(1)))
        elif op in ("bipush", "sipush"):
            栈.append(int(rest))
        elif m := re.fullmatch(r"fconst_(\d)", op):
            栈.append(float(m.group(1)))
        elif op == "ldc" or op == "ldc_w":
            m = re.search(r"// float (\S+?)f$", rest)
            if not m:
                raise SystemExit(f"不认识的常量：{ins}")
            栈.append(float(m.group(1)))
        elif op == "newarray":
            if rest != "float":
                raise SystemExit(f"不认识的数组：{ins}")
            栈.append([0.0] * 栈.pop())
        elif op == "anewarray":
            栈.append([None] * 栈.pop())
        elif op == "dup":
            栈.append(栈[-1])
        elif op in ("fastore", "aastore"):
            值, 位, 数组 = 栈.pop(), 栈.pop(), 栈.pop()
            数组[位] = 值
        elif op == "new":
            栈.append("新")
        elif op == "invokespecial" and 'ArmorMesh."<init>":(I[F)V' in rest:
            顶点, bone = 栈.pop(), 栈.pop()
            栈.pop()
            栈.pop()
            栈.append({"骨": bone, "顶点": 顶点})
        elif op == "invokestatic":
            名 = re.search(r"Method (\w+):\(\)", rest).group(1)
            栈.append(网格们[名])
        elif op == "putstatic":
            字段[re.search(r"Field (\w+):", rest).group(1)] = 栈.pop()
        elif op == "areturn":
            return 栈.pop()
        elif op == "return":
            return None
        else:
            raise SystemExit(f"不认识的指令：{ins}")
    return None


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    jar, 输出 = argv
    text = 反汇编(jar)
    方法 = 拆方法(text)
    网格们 = {名: 跑(指令, {}, {}) for 名, 指令 in 方法.items() if 名.endswith(tuple("0123456789")) and "Mesh" in 名}
    字段: dict[str, object] = {}
    跑(方法["static"], 网格们, 字段)
    for 名, 网格 in 网格们.items():
        if len(网格["顶点"]) % 32 or not 0 <= 网格["骨"] < len(骨):
            raise SystemExit(f"{名}：顶点数 {len(网格['顶点'])} 不是 32 的倍数，或 bone {网格['骨']} 越界")
    常量 = dict(re.findall(r"static final (?:int|java\.lang\.String) (\w+) = \"?([^\";]+)\"?;", text))
    列, 行 = int(常量["CAPE_COLUMNS"]), int(常量["CAPE_ROWS"])
    if len(字段["CAPE_REST"]) != 列 * 行 * 3 or len(字段["CAPE_COLLISION"]) % 9:
        raise SystemExit("披风网格或碰撞三角形的长度不对")
    结果 = {
        "来源": {"类": 类.replace("/", "."), "SOURCE_SHA256": 常量["SOURCE_SHA256"]},
        "贴图": [128, 64],
        "骨": 骨,
        "槽": {槽: 字段[槽.upper()] for 槽 in ("head", "chest", "legs", "feet")},
        "披风": {
            "列": 列,
            "行": 行,
            "接缝行": int(常量["CAPE_SEAM_ROW"]),
            "静止": 字段["CAPE_REST"],
            "正面UV": 字段["CAPE_FRONT_UV"],
            "背面UV": 字段["CAPE_BACK_UV"],
            "碰撞": 字段["CAPE_COLLISION"],
        },
    }
    out = Path(输出)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(结果, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    面 = {槽: sum(len(m["顶点"]) // 32 for m in ms) for 槽, ms in 结果["槽"].items()}
    print(f"{类} → {out}：{面}（面数），披风 {列}×{行}，碰撞三角形 {len(字段['CAPE_COLLISION']) // 9} 个")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
