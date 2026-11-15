"""动作翻译对着 JVM 验：把 动作翻译样例/ 的 Java（桩 + 样例模型）编译、翻译，随机输入下 Python 参考求值和 JVM 真跑逐位相同。
没有 JDK（javac / java）时跳过。样例和桩都是自己写的，不含 Mojang 代码；包名照 1.20.1 官方名，所以走恒等映射（26.1 起、NeoForge 的情形）。
设 ANIM_UPDATE_POSE_SAMPLE=1 跑时，顺带重写 engine/anim/姿态程序.样例.json、姿态程序.内建样例.json（TS 求值器的测试拿它们和 JVM 真值比）。
"""

from __future__ import annotations

import json
import math
import os
import random
import shutil
import struct
import subprocess
import zipfile
from pathlib import Path

import pytest

from anim_py.动作翻译.图 import f32, builtin_funcs, ExprGraph, evaluate, convert
from anim_py.动作翻译.执行 import Unsupported, Translator
from anim_py.动作翻译.映射 import IdentityMapping, read_mapping
from anim_py.动作翻译.类文件 import ClassPath

SAMPLE_DIR = Path(__file__).parent / "动作翻译样例"
repo_root = Path(__file__).resolve().parents[2]
transform_fields = ("x", "y", "z", "xRot", "yRot", "zRot", "xScale", "yScale", "zScale")
model_tree = {"root": ["head", "body", "left_arm", "right_arm", "leg0", "leg1", "leg2", "leg3"], "body": ["tail"]}


def _jdk() -> Path | None:
    """找 17 以上的 JDK（样例用了 switch 箭头写法，和 1.20.1 一样按 --release 17 编）"""
    candidates = [os.environ.get("JAVA_HOME", ""), "/opt/homebrew/opt/openjdk@17", "/opt/homebrew/opt/openjdk", "/usr/lib/jvm/java-17-openjdk"]
    if shutil.which("javac"):
        candidates.append(str(Path(shutil.which("javac") or "").resolve().parent.parent))
    for d in candidates:
        javac = Path(d) / "bin" / "javac"
        if not d or not javac.exists():
            continue
        r = subprocess.run([str(javac), "-version"], capture_output=True, text=True)
        ver = (r.stdout + r.stderr).split()
        if r.returncode == 0 and len(ver) >= 2 and ver[1].split(".")[0].isdigit() and int(ver[1].split(".")[0]) >= 17:
            return javac.parent
    return None


def float_bits_hex(x: float) -> str:
    return format(struct.unpack(">I", struct.pack(">f", x))[0], "x")


def hex_to_float(h: str) -> float:
    return struct.unpack(">f", struct.pack(">I", int(h, 16)))[0]


@pytest.fixture(scope="module")
def compiled(tmp_path_factory: pytest.TempPathFactory) -> tuple[Path, Path]:
    jdk = _jdk()
    if jdk is None:
        pytest.skip("没有 JDK（javac）")
    out = tmp_path_factory.mktemp("样例")
    srcs = [str(p) for p in SAMPLE_DIR.rglob("*.java")]
    subprocess.run([str(jdk / "javac"), "--release", "17", "-d", str(out / "classes"), *srcs], check=True)
    jar = out / "样例.jar"
    with zipfile.ZipFile(jar, "w") as z:
        for p in (out / "classes").rglob("*.class"):
            z.write(p, p.relative_to(out / "classes").as_posix())
    return jar, jdk


def random_inputs(n: int) -> list[dict]:
    r = random.Random(7)
    special_values = [0.0, -0.0, math.nan, math.inf, -math.inf, 1e10, -1e10, 3.4e38]
    out = []
    for i in range(n):

        def fl(lo: float, hi: float) -> float:
            # 每 10 组掺一个特殊值（NaN、±0、无穷、超出 int 的大数），验 fcmpl/fcmpg、饱和强转
            return f32(r.choice(special_values) if i % 10 == 9 and r.random() < 0.3 else r.uniform(lo, hi))

        out.append(
            {
                "limbSwing": fl(0, 2000),
                "limbSwingAmount": fl(0, 1),
                "ageInTicks": fl(-50, 24000),
                "netHeadYaw": fl(-180, 180),
                "headPitch": fl(-90, 90),
                "partialTick": fl(0, 1),
                "entity.getHealth()": fl(0, 20),
                "model.attackTime": fl(0, 1) if r.random() < 0.5 else 0.0,
                "entity.isAggressive()": int(r.random() < 0.4),
                "entity.getMode()": r.randrange(4),
                "entity.tick": r.randrange(-1000, 1000),
                "model.riding": int(r.random() < 0.3),
                "model.young": int(r.random() < 0.5),
            }
        )
    return out


FLOAT_INPUTS = ("limbSwing", "limbSwingAmount", "ageInTicks", "netHeadYaw", "headPitch", "partialTick", "entity.getHealth()", "model.attackTime")
INT_INPUTS = ("entity.isAggressive()", "entity.getMode()", "entity.tick", "model.riding", "model.young")


def run_jvm(jar: Path, jdk: Path, inputs: list[dict]) -> tuple[dict, list[dict]]:
    input_lines = [" ".join([float_bits_hex(x[k]) for k in FLOAT_INPUTS] + [str(x[k]) for k in INT_INPUTS]) for x in inputs]
    r = subprocess.run([str(jdk / "java"), "-cp", str(jar), "sample.Run"], input="\n".join(input_lines) + "\n", capture_output=True, text=True, check=True)
    lines = r.stdout.strip().split("\n")
    head = lines[0].split()
    initial: dict[str, dict[str, float]] = {}
    part_names = []
    for i in range(0, len(head), 7):
        part_name = head[i]
        part_names.append(part_name)
        initial[part_name] = {f: hex_to_float(h) for f, h in zip(transform_fields[:6], head[i + 1 : i + 7])}
    results = []
    for line in lines[1:]:
        v = line.split()
        d = {}
        for j, part_name in enumerate(part_names):
            seg = v[j * 10 : j * 10 + 10]
            d[part_name] = {**{f: seg[k] for k, f in enumerate(transform_fields)}, "visible": int(seg[9])}
        results.append(d)
    return initial, results


def translate_jar(jar: Path) -> dict:
    return Translator(ClassPath([str(jar)], IdentityMapping()), "sample.SampleModel", model_tree=model_tree).translate()


def eval_program(prog: dict, initial: dict, x: dict) -> dict:
    v = evaluate(prog["节点"], x, initial)
    out: dict[str, dict] = {}
    for part_name, rest_pose in initial.items():
        d: dict = {f: float_bits_hex(rest_pose[f]) for f in transform_fields[:6]}
        d.update({f: float_bits_hex(1.0) for f in transform_fields[6:]})
        d["visible"] = 1
        for f, i in prog["输出"].get(part_name, {}).items():
            d[f] = int(bool(v[i])) if f == "visible" else float_bits_hex(v[i])
        out[part_name] = d
    return out


def test_sample_model_program_bitwise_equal_jvm(compiled: tuple[Path, Path]) -> None:
    jar, jdk = compiled
    prog = translate_jar(jar)
    assert prog["格式"] == "姿态程序/1"
    assert prog["方法"] == ["sample/BaseModel.prepareMobModel", "sample/SampleModel.setupAnim"]
    # 字段名和部件名对不上的映射、子部件、数组里的四条腿都认出来了
    assert {"left_arm", "right_arm", "tail", "leg0", "leg3", "head", "body"} <= set(prog["输出"])
    assert prog["输入"]["entity.getMode()"]["枚举"] == ["WALK", "RUN", "SIT", "FLY"]
    assert prog["输入"]["model.young"]["默认"] == 1
    # 只在部分分支里写的字段（游戏里沿用上一帧）照实报出来
    assert sorted(w.split(" ")[1] for w in prog["警告"]) == ["body.y", "left_arm.yRot", "left_arm.zRot"]
    inputs = random_inputs(600)
    initial, jvm_poses = run_jvm(jar, jdk, inputs)
    for x, jvm_pose in zip(inputs, jvm_poses):
        computed = eval_program(prog, initial, x)
        for part_name in jvm_pose:
            assert computed[part_name] == jvm_pose[part_name], f"{part_name}：翻译 {computed[part_name]} ≠ JVM {jvm_pose[part_name]}，输入 {x}"
    if os.environ.get("ANIM_UPDATE_POSE_SAMPLE"):
        write_ts_samples(prog, initial, inputs[:80], jvm_poses[:80])


def write_ts_samples(prog: dict, initial: dict, inputs: list[dict], jvm_poses: list[dict]) -> None:
    """engine/anim/姿态程序.test.ts 用：程序、部件树（EntityPart 形状）、输入（浮点给 float 位）和 JVM 真值"""

    def make_part(part_name: str) -> dict:
        p = initial[part_name]
        return {
            "name": part_name,
            "pose": {"offset": [p["x"], p["y"], p["z"]], "rot": [p["xRot"], p["yRot"], p["zRot"]]},
            "cubes": [],
            "children": [make_part(c) for c in model_tree.get(part_name, [])],
        }

    root = {"name": "root", "pose": {"offset": [0, 0, 0], "rot": [0, 0, 0]}, "cubes": [], "children": [make_part(c) for c in model_tree["root"]]}
    # 真值：部件 → 「x y z xRot yRot zRot xScale yScale zScale 的 float 位 + visible」一个串，省篇幅
    samples = [
        {
            "输入": {k: (float_bits_hex(v) if k in FLOAT_INPUTS else v) for k, v in x.items()},
            "真值": {part_name: " ".join([*(d[f] for f in transform_fields), str(d["visible"])]) for part_name, d in t.items()},
        }
        for x, t in zip(inputs, jvm_poses)
    ]
    data = {
        "说明": "py/tests/test_动作翻译.py 生成（ANIM_UPDATE_POSE_SAMPLE=1）：动作翻译样例/ 的 SampleModel 的姿态程序和 JVM 跑出的真值（float 位）",
        "程序": prog,
        "根": root,
        "样例": samples,
    }
    p = repo_root / "engine/anim/姿态程序.样例.json"
    p.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def test_ts_samples_match_current_translation(compiled: tuple[Path, Path]) -> None:
    """TS 测试用的样例程序要和翻译器现在的输出一样（改了翻译器就 ANIM_UPDATE_POSE_SAMPLE=1 重跑）"""
    p = repo_root / "engine/anim/姿态程序.样例.json"
    if not p.exists():
        pytest.skip("还没生成样例")
    jar, _ = compiled
    assert json.loads(p.read_text(encoding="utf-8"))["程序"] == json.loads(json.dumps(translate_jar(jar), ensure_ascii=False))


def test_symbolic_condition_loop_untranslatable(compiled: tuple[Path, Path]) -> None:
    """循环次数取决于输入时报 不支持，消息带类和位置（不会死循环，也不静默出错）"""
    jar, _ = compiled
    with pytest.raises(Unsupported, match="条件是符号的循环.*LoopModel"):
        Translator(ClassPath([str(jar)], IdentityMapping()), "sample.LoopModel", model_tree=model_tree).translate()


def test_mapping_mismatch_still_translates_empty_setup_anim(compiled: tuple[Path, Path], tmp_path: Path) -> None:
    """映射和 jar 对不上时 ModelPart.xRot 认不出来，以前会静默翻出空程序；setupAnim 本来就空的（原版史莱姆）照常出空程序"""
    jar, _ = compiled
    client = tmp_path / "client.txt"
    client.write_text("net.minecraft.client.model.geom.ModelPart -> zzz:\n    float xRot -> a\n", encoding="utf-8")
    with pytest.raises(Unsupported, match="认不出.*ModelPart.xRot"):
        Translator(ClassPath([str(jar)], read_mapping(f"proguard:{client}")), "sample.SampleModel", model_tree=model_tree).translate()
    assert Translator(ClassPath([str(jar)], IdentityMapping()), "sample.EmptyModel", model_tree=model_tree).translate()["输出"] == {}


def test_entity_getter_null_check_as_input(compiled: tuple[Path, Path]) -> None:
    jar, _ = compiled
    prog = Translator(ClassPath([str(jar)], IdentityMapping()), "sample.NullModel", model_tree=model_tree).translate()
    assert prog["输入"]["entity.getRider() == null"] == {"类型": "i", "来源": "实体"}
    i = prog["输出"]["head"]["xRot"]
    initial: dict[str, dict[str, float]] = {"head": {f: 0.0 for f in transform_fields[:6]}}
    has_rider_value = evaluate(prog["节点"], {"entity.getRider() == null": 0, "entity.getRider().getHealth()": 10.0}, initial)[i]
    no_rider_value = evaluate(prog["节点"], {"entity.getRider() == null": 1, "entity.getRider().getHealth()": 10.0}, initial)[i]
    assert (has_rider_value, no_rider_value) == (f32(f32(10.0) * f32(0.1)), -1.0)


def test_graph_constant_fold_follows_jvm() -> None:
    g = ExprGraph()
    # float 每步舍入
    a = g.calc("*", "f", g.const_node("f", f32(0.1)), g.const_node("f", f32(3.0)))
    assert g.constant_of(a) == f32(f32(0.1) * f32(3.0))
    # int 溢出回绕、除法向零取整
    assert g.constant_of(g.calc("+", "i", g.const_node("i", 2**31 - 1), g.const_node("i", 1))) == -(2**31)
    assert g.constant_of(g.calc("/", "i", g.const_node("i", -7), g.const_node("i", 2))) == -3
    assert g.constant_of(g.calc("%", "i", g.const_node("i", -7), g.const_node("i", 2))) == -1
    # (int) 强转饱和、NaN → 0
    assert convert(1e20, "f", "i") == 2**31 - 1
    assert convert(math.nan, "f", "i") == 0
    assert convert(-1e30, "d", "j") == -(2**63)
    # 和输入相同的子式只存一份
    x = g.input_node("f", "x")
    assert g.calc("+", "f", x, g.const_node("f", 1.0)) == g.calc("+", "f", x, g.const_node("f", 1.0))
    # sel 两边相同直接取
    assert g.select(g.compare("<", x, g.const_node("f", 0.0)), x, x) == x


# ---------- 内建函数：每个都对着 JVM 逐位比（Mth 走照 1.20.1 字节码写的桩，java/lang/Math 走 JDK） ----------
# JDK 的 Math.sin 这类超越函数规范只保证 1 ulp，各平台、各 JVM 可以差一位；这几个按 1 ulp 比，其余逐位
transcendental_funcs = {"java/lang/Math.sin(D)D", "java/lang/Math.cos(D)D", "java/lang/Math.pow(DD)D", "java/lang/Math.atan2(DD)D", "java/lang/Math.exp(D)D"}


def _param_types(func_sig: str) -> tuple[str, str]:
    d = func_sig[func_sig.index("(") :]
    return d[1 : d.index(")")], d[d.index(")") + 1 :]


def _write_value(t: str, x) -> str:
    if t == "F":
        return float_bits_hex(x) if not math.isnan(x) else "7fc00000"
    if t == "D":
        return format(struct.unpack(">Q", struct.pack(">d", x))[0], "x") if not math.isnan(x) else "7ff8000000000000"
    return str(x)


def _read_value(t: str, s: str):
    if t == "F":
        return hex_to_float(s)
    if t == "D":
        return struct.unpack(">d", struct.pack(">Q", int(s, 16)))[0]
    return int(s)


def builtin_samples(samples_per_op: int = 400) -> list[tuple[str, list[str]]]:
    r = random.Random(11)
    special_values = [0.0, -0.0, math.nan, math.inf, -math.inf, 1e10, -1e10, 3.4e38, -3.4e38, 1e-45, 0.5, -0.5, 1.0, -1.0, 2.0, 180.0, -180.0, 360.0, -2147483648.0, -2147483904.0, 2147483648.0]
    special_ints = [0, 1, -1, 2, 2**31 - 1, -(2**31), 65535, -65536]

    def sample_value(t: str):
        if t == "I":
            return r.choice(special_ints) if r.random() < 0.25 else r.randint(-5000, 5000)
        x = r.choice(special_values) if r.random() < 0.25 else r.uniform(-1, 1) * 10 ** r.uniform(-3, 5)
        return f32(x) if t == "F" else x

    def get_angle(t: str):
        # rotlerpRad 差太大、是无穷时 JVM 永远不返回，样例只取能返回的：几圈之内的角，外加正好落在 ±π 边上的
        return f32(r.choice([0.0, -0.0, math.pi, -math.pi, 2 * math.pi]) if r.random() < 0.2 else r.uniform(-60, 60))

    out = []
    for func_sig in builtin_funcs:
        ps, _ = _param_types(func_sig)
        for _ in range(samples_per_op):
            out.append((func_sig, [_write_value(t, get_angle(t) if "rotlerprad" in func_sig.lower() else sample_value(t)) for t in ps]))
    return out


def test_builtins_bitwise_equal_jvm(compiled: tuple[Path, Path]) -> None:
    jar, jdk = compiled
    samples = builtin_samples()
    r = subprocess.run(
        [str(jdk / "java"), "-cp", str(jar), "sample.Builtins"], input="\n".join(f"{f} {' '.join(a)}" for f, a in samples) + "\n", capture_output=True, text=True, check=True
    )
    jvm_outputs = r.stdout.split()
    assert len(jvm_outputs) == len(samples)
    for (func_sig, params), jvm_output in zip(samples, jvm_outputs):
        ps, rt = _param_types(func_sig)
        computed = _write_value(rt, builtin_funcs[func_sig][1](*[_read_value(t, a) for t, a in zip(ps, params)]))
        if computed != jvm_output and func_sig in transcendental_funcs:
            a, b = _read_value("D", computed), _read_value("D", jvm_output)
            assert math.isfinite(a) and math.isfinite(b) and abs(a - b) <= math.ulp(b), f"{func_sig}{params}：Python {computed} ≠ JVM {jvm_output}"
            continue
        assert computed == jvm_output, f"{func_sig}{params}：Python {computed} ≠ JVM {jvm_output}"
    if os.environ.get("ANIM_UPDATE_POSE_SAMPLE"):
        # TS 求值器的 内建函数 拿这份比（engine/anim/姿态程序.test.ts）；每个函数取 60 组，省篇幅
        counts: dict[str, int] = {}
        cases = []
        for (func_sig, params), jvm_output in zip(samples, jvm_outputs):
            counts[func_sig] = counts.get(func_sig, 0) + 1
            if counts[func_sig] <= 60:
                cases.append([func_sig, params, jvm_output])
        data = {"说明": "py/tests/test_动作翻译.py 生成（ANIM_UPDATE_POSE_SAMPLE=1）：内建函数的参数和 JVM 结果（F、D 是十六进制位，I 是十进制）", "超越函数": sorted(transcendental_funcs), "样例": cases}
        p = repo_root / "engine/anim/姿态程序.内建样例.json"
        p.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def test_rotlerp_rad_big_diff_gives_nan() -> None:
    # JVM 里差大到加减 2π 不动（或是无穷）时两个 while 永远不出来；内建给 NaN，不卡住。差是 NaN 时 JVM 两个比较都不成立，直接返回 NaN
    f = builtin_funcs["net/minecraft/client/model/ModelUtils.rotlerpRad(FFF)F"][1]
    assert math.isnan(f(0.0, 1e10, 0.5)) and math.isnan(f(0.0, math.inf, 0.5)) and math.isnan(f(math.nan, 0.0, 0.5))
    assert f(0.0, f32(7.0), 1.0) == f32(f32(7.0) - f32(math.pi * 2))
    # 2^27 以内的大差 JVM 转一千多万圈后照样出来，不能当 NaN（真值是 JDK 17 跑的）；之上减 2π 舍回原值才卡住
    assert float_bits_hex(f(0.0, f32(1.2e8), 1.0)) == "c023e0fc"
    assert math.isnan(f(0.0, f32(2.0**27 + 16), 1.0))


def test_render_entry_skips_bridge_method_with_ctor_set(compiled: tuple[Path, Path]) -> None:
    """1.21.2 起 setupAnim(渲染状态) 的入口（StateModel）：子类收窄状态类型时 javac 生成的桥方法 setupAnim(HumanState) 参数也是渲染状态，
    要跳过它；构造里 ArrayList(Arrays.asList(…))、add、Arrays.setAll + lambda 存部件（库类.py）。真 jar 的对照缺 jar 就跳过，这里不靠游戏 jar"""
    from anim_py.动作翻译.类文件 import ACC_BRIDGE

    jar, jdk = compiled
    t = Translator(ClassPath([str(jar)], IdentityMapping()), "sample.StateModel", model_tree=model_tree)
    prog = t.translate()
    render_entry = t.find_render_entry()
    assert render_entry is not None and render_entry[1].map_descriptor == "(Lsample/SubState;)V" and not render_entry[1].access_flags & ACC_BRIDGE
    c = t.类("sample/StateModel")
    assert c is not None and any(m.名 == "setupAnim" and m.map_descriptor == "(Lsample/HumanState;)V" and m.access_flags & ACC_BRIDGE for m in c.method_list)
    assert prog["方法"] == ["sample/StateModel.setupAnim"]
    assert set(prog["输入"]) == {"state.walk", "state.headPitch", "state.ageInTicks", "state.flag"}
    assert {"head", "leg0", "leg1", "leg2", "left_arm", "right_arm"} == set(prog["输出"])
    r = random.Random(5)
    inputs = [
        {
            "state.walk": f32(r.uniform(0, 500)),
            "state.headPitch": f32(r.uniform(-90, 90)),
            "state.ageInTicks": f32(r.uniform(0, 24000)),
            "state.flag": int(r.random() < 0.5),
        }
        for _ in range(200)
    ]
    input_lines = [" ".join([float_bits_hex(x["state.walk"]), float_bits_hex(x["state.headPitch"]), float_bits_hex(x["state.ageInTicks"]), str(x["state.flag"])]) for x in inputs]
    r2 = subprocess.run([str(jdk / "java"), "-cp", str(jar), "sample.StateRun"], input="\n".join(input_lines) + "\n", capture_output=True, text=True, check=True)
    # 初始姿态和部件顺序同 Run（共用 Run.PARTS、Run.REST），借 Run 的第一行取
    initial, _ = run_jvm(jar, jdk, random_inputs(1))
    part_names = list(initial)
    for x, line in zip(inputs, r2.stdout.strip().split("\n"), strict=True):
        v = line.split()
        jvm_pose = {part_name: {**{f: v[j * 10 + k] for k, f in enumerate(transform_fields)}, "visible": int(v[j * 10 + 9])} for j, part_name in enumerate(part_names)}
        computed = eval_program(prog, initial, x)
        for part_name in jvm_pose:
            assert computed[part_name] == jvm_pose[part_name], f"{part_name}：翻译 {computed[part_name]} ≠ JVM {jvm_pose[part_name]}，输入 {x}"
