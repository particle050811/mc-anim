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

type_name = "com/mega/revelationfix/client/model/armor/ApocalyptiumArmorGeometry"
JAVAP = os.path.join(os.environ["ANIM_JAVA_HOME"], "bin", "javap") if os.environ.get("ANIM_JAVA_HOME") else "javap"
BONES = ["head", "body", "right_arm", "left_arm", "right_leg", "left_leg"]


def disassemble(jar: str) -> str:
    with zipfile.ZipFile(jar) as z:
        file_bytes = z.read(type_name + ".class")
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "C.class")
        Path(p).write_bytes(file_bytes)
        return subprocess.run([JAVAP, "-c", "-p", "-constants", p], capture_output=True, text=True, check=True, encoding="utf-8").stdout


def split_methods(text: str) -> dict[str, list[str]]:
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


def run_commands(instructions: list[str], meshes: dict[str, dict], field_values: dict[str, object]):
    stack: list[object] = []
    for ins in instructions:
        op, _, rest = ins.partition(" ")
        rest = rest.strip()
        if m := re.fullmatch(r"iconst_(\d)", op):
            stack.append(int(m.group(1)))
        elif op in ("bipush", "sipush"):
            stack.append(int(rest))
        elif m := re.fullmatch(r"fconst_(\d)", op):
            stack.append(float(m.group(1)))
        elif op == "ldc" or op == "ldc_w":
            m = re.search(r"// float (\S+?)f$", rest)
            if not m:
                raise SystemExit(f"不认识的常量：{ins}")
            stack.append(float(m.group(1)))
        elif op == "newarray":
            if rest != "float":
                raise SystemExit(f"不认识的数组：{ins}")
            stack.append([0.0] * stack.pop())
        elif op == "anewarray":
            stack.append([None] * stack.pop())
        elif op == "dup":
            stack.append(stack[-1])
        elif op in ("fastore", "aastore"):
            value, array_index, array_ref = stack.pop(), stack.pop(), stack.pop()
            array_ref[array_index] = value
        elif op == "new":
            stack.append("新")
        elif op == "invokespecial" and 'ArmorMesh."<init>":(I[F)V' in rest:
            vertices, bone = stack.pop(), stack.pop()
            stack.pop()
            stack.pop()
            stack.append({"骨": bone, "顶点": vertices})
        elif op == "invokestatic":
            method_name = re.search(r"Method (\w+):\(\)", rest).group(1)
            stack.append(meshes[method_name])
        elif op == "putstatic":
            field_values[re.search(r"Field (\w+):", rest).group(1)] = stack.pop()
        elif op == "areturn":
            return stack.pop()
        elif op == "return":
            return None
        else:
            raise SystemExit(f"不认识的指令：{ins}")
    return None


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    jar, out_path = argv
    text = disassemble(jar)
    methods = split_methods(text)
    meshes = {method_name: run_commands(instructions, {}, {}) for method_name, instructions in methods.items() if method_name.endswith(tuple("0123456789")) and "Mesh" in method_name}
    field_values: dict[str, object] = {}
    run_commands(methods["static"], meshes, field_values)
    for mesh_name, mesh in meshes.items():
        if len(mesh["顶点"]) % 32 or not 0 <= mesh["骨"] < len(BONES):
            raise SystemExit(f"{mesh_name}：顶点数 {len(mesh['顶点'])} 不是 32 的倍数，或 bone {mesh['骨']} 越界")
    constants = dict(re.findall(r"static final (?:int|java\.lang\.String) (\w+) = \"?([^\";]+)\"?;", text))
    cols, rows = int(constants["CAPE_COLUMNS"]), int(constants["CAPE_ROWS"])
    if len(field_values["CAPE_REST"]) != cols * rows * 3 or len(field_values["CAPE_COLLISION"]) % 9:
        raise SystemExit("披风网格或碰撞三角形的长度不对")
    result = {
        "来源": {"类": type_name.replace("/", "."), "SOURCE_SHA256": constants["SOURCE_SHA256"]},
        "贴图": [128, 64],
        "骨": BONES,
        "槽": {slot: field_values[slot.upper()] for slot in ("head", "chest", "legs", "feet")},
        "披风": {
            "列": cols,
            "行": rows,
            "接缝行": int(constants["CAPE_SEAM_ROW"]),
            "静止": field_values["CAPE_REST"],
            "正面UV": field_values["CAPE_FRONT_UV"],
            "背面UV": field_values["CAPE_BACK_UV"],
            "碰撞": field_values["CAPE_COLLISION"],
        },
    }
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    face_counts = {slot: sum(len(m["顶点"]) // 32 for m in ms) for slot, ms in result["槽"].items()}
    print(f"{type_name} → {out}：{face_counts}（面数），披风 {cols}×{rows}，碰撞三角形 {len(field_values['CAPE_COLLISION']) // 9} 个")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
