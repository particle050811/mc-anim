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

from anim_py.动作翻译.图 import f32, 内建, 图, 求值, 转换
from anim_py.动作翻译.执行 import 不支持, 翻译器
from anim_py.动作翻译.映射 import 恒等映射
from anim_py.动作翻译.类文件 import 类路径

样例 = Path(__file__).parent / "动作翻译样例"
仓库 = Path(__file__).resolve().parents[2]
字段 = ("x", "y", "z", "xRot", "yRot", "zRot", "xScale", "yScale", "zScale")
模型树 = {"root": ["head", "body", "left_arm", "right_arm", "leg0", "leg1", "leg2", "leg3"], "body": ["tail"]}


def _jdk() -> Path | None:
    """找 17 以上的 JDK（样例用了 switch 箭头写法，和 1.20.1 一样按 --release 17 编）"""
    候选 = [os.environ.get("JAVA_HOME", ""), "/opt/homebrew/opt/openjdk@17", "/opt/homebrew/opt/openjdk", "/usr/lib/jvm/java-17-openjdk"]
    if shutil.which("javac"):
        候选.append(str(Path(shutil.which("javac") or "").resolve().parent.parent))
    for d in 候选:
        javac = Path(d) / "bin" / "javac"
        if not d or not javac.exists():
            continue
        r = subprocess.run([str(javac), "-version"], capture_output=True, text=True)
        ver = (r.stdout + r.stderr).split()
        if r.returncode == 0 and len(ver) >= 2 and ver[1].split(".")[0].isdigit() and int(ver[1].split(".")[0]) >= 17:
            return javac.parent
    return None


def 位(x: float) -> str:
    return format(struct.unpack(">I", struct.pack(">f", x))[0], "x")


def 浮(h: str) -> float:
    return struct.unpack(">f", struct.pack(">I", int(h, 16)))[0]


@pytest.fixture(scope="module")
def 编译好(tmp_path_factory: pytest.TempPathFactory) -> tuple[Path, Path]:
    jdk = _jdk()
    if jdk is None:
        pytest.skip("没有 JDK（javac）")
    out = tmp_path_factory.mktemp("样例")
    srcs = [str(p) for p in 样例.rglob("*.java")]
    subprocess.run([str(jdk / "javac"), "--release", "17", "-d", str(out / "classes"), *srcs], check=True)
    jar = out / "样例.jar"
    with zipfile.ZipFile(jar, "w") as z:
        for p in (out / "classes").rglob("*.class"):
            z.write(p, p.relative_to(out / "classes").as_posix())
    return jar, jdk


def 随机输入(n: int) -> list[dict]:
    r = random.Random(7)
    特殊 = [0.0, -0.0, math.nan, math.inf, -math.inf, 1e10, -1e10, 3.4e38]
    out = []
    for i in range(n):

        def fl(lo: float, hi: float) -> float:
            # 每 10 组掺一个特殊值（NaN、±0、无穷、超出 int 的大数），验 fcmpl/fcmpg、饱和强转
            return f32(r.choice(特殊) if i % 10 == 9 and r.random() < 0.3 else r.uniform(lo, hi))

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


浮点输入 = ("limbSwing", "limbSwingAmount", "ageInTicks", "netHeadYaw", "headPitch", "partialTick", "entity.getHealth()", "model.attackTime")
整数输入 = ("entity.isAggressive()", "entity.getMode()", "entity.tick", "model.riding", "model.young")


def JVM跑(jar: Path, jdk: Path, 输入们: list[dict]) -> tuple[dict, list[dict]]:
    行 = [" ".join([位(x[k]) for k in 浮点输入] + [str(x[k]) for k in 整数输入]) for x in 输入们]
    r = subprocess.run([str(jdk / "java"), "-cp", str(jar), "sample.Run"], input="\n".join(行) + "\n", capture_output=True, text=True, check=True)
    lines = r.stdout.strip().split("\n")
    head = lines[0].split()
    初始: dict[str, dict[str, float]] = {}
    部件们 = []
    for i in range(0, len(head), 7):
        名 = head[i]
        部件们.append(名)
        初始[名] = {f: 浮(h) for f, h in zip(字段[:6], head[i + 1 : i + 7])}
    结果 = []
    for line in lines[1:]:
        v = line.split()
        d = {}
        for j, 名 in enumerate(部件们):
            seg = v[j * 10 : j * 10 + 10]
            d[名] = {**{f: seg[k] for k, f in enumerate(字段)}, "visible": int(seg[9])}
        结果.append(d)
    return 初始, 结果


def 翻译样例(jar: Path) -> dict:
    return 翻译器(类路径([str(jar)], 恒等映射()), "sample.SampleModel", 模型树=模型树).翻译()


def 程序求值(prog: dict, 初始: dict, x: dict) -> dict:
    v = 求值(prog["节点"], x, 初始)
    out: dict[str, dict] = {}
    for 名, 初 in 初始.items():
        d: dict = {f: 位(初[f]) for f in 字段[:6]}
        d.update({f: 位(1.0) for f in 字段[6:]})
        d["visible"] = 1
        for f, i in prog["输出"].get(名, {}).items():
            d[f] = int(bool(v[i])) if f == "visible" else 位(v[i])
        out[名] = d
    return out


def test_样例模型翻译出的程序和JVM逐位相同(编译好: tuple[Path, Path]) -> None:
    jar, jdk = 编译好
    prog = 翻译样例(jar)
    assert prog["格式"] == "姿态程序/1"
    assert prog["方法"] == ["sample/BaseModel.prepareMobModel", "sample/SampleModel.setupAnim"]
    # 字段名和部件名对不上的映射、子部件、数组里的四条腿都认出来了
    assert {"left_arm", "right_arm", "tail", "leg0", "leg3", "head", "body"} <= set(prog["输出"])
    assert prog["输入"]["entity.getMode()"]["枚举"] == ["WALK", "RUN", "SIT", "FLY"]
    assert prog["输入"]["model.young"]["默认"] == 1
    # 只在部分分支里写的字段（游戏里沿用上一帧）照实报出来
    assert sorted(w.split(" ")[1] for w in prog["警告"]) == ["body.y", "left_arm.yRot", "left_arm.zRot"]
    输入们 = 随机输入(600)
    初始, 真值 = JVM跑(jar, jdk, 输入们)
    for x, 真 in zip(输入们, 真值):
        算 = 程序求值(prog, 初始, x)
        for 名 in 真:
            assert 算[名] == 真[名], f"{名}：翻译 {算[名]} ≠ JVM {真[名]}，输入 {x}"
    if os.environ.get("ANIM_UPDATE_POSE_SAMPLE"):
        写TS样例(prog, 初始, 输入们[:80], 真值[:80])


def 写TS样例(prog: dict, 初始: dict, 输入们: list[dict], 真值: list[dict]) -> None:
    """engine/anim/姿态程序.test.ts 用：程序、部件树（EntityPart 形状）、输入（浮点给 float 位）和 JVM 真值"""

    def 部件(名: str) -> dict:
        p = 初始[名]
        return {
            "name": 名,
            "pose": {"offset": [p["x"], p["y"], p["z"]], "rot": [p["xRot"], p["yRot"], p["zRot"]]},
            "cubes": [],
            "children": [部件(c) for c in 模型树.get(名, [])],
        }

    root = {"name": "root", "pose": {"offset": [0, 0, 0], "rot": [0, 0, 0]}, "cubes": [], "children": [部件(c) for c in 模型树["root"]]}
    # 真值：部件 → 「x y z xRot yRot zRot xScale yScale zScale 的 float 位 + visible」一个串，省篇幅
    样 = [
        {
            "输入": {k: (位(v) if k in 浮点输入 else v) for k, v in x.items()},
            "真值": {名: " ".join([*(d[f] for f in 字段), str(d["visible"])]) for 名, d in t.items()},
        }
        for x, t in zip(输入们, 真值)
    ]
    data = {
        "说明": "py/tests/test_动作翻译.py 生成（ANIM_UPDATE_POSE_SAMPLE=1）：动作翻译样例/ 的 SampleModel 的姿态程序和 JVM 跑出的真值（float 位）",
        "程序": prog,
        "根": root,
        "样例": 样,
    }
    p = 仓库 / "engine/anim/姿态程序.样例.json"
    p.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def test_TS样例和当前翻译一致(编译好: tuple[Path, Path]) -> None:
    """TS 测试用的样例程序要和翻译器现在的输出一样（改了翻译器就 ANIM_UPDATE_POSE_SAMPLE=1 重跑）"""
    p = 仓库 / "engine/anim/姿态程序.样例.json"
    if not p.exists():
        pytest.skip("还没生成样例")
    jar, _ = 编译好
    assert json.loads(p.read_text(encoding="utf-8"))["程序"] == json.loads(json.dumps(翻译样例(jar), ensure_ascii=False))


def test_符号条件的循环翻译不了(编译好: tuple[Path, Path]) -> None:
    """循环次数取决于输入时报 不支持，消息带类和位置（不会死循环，也不静默出错）"""
    jar, _ = 编译好
    with pytest.raises(不支持, match="条件是符号的循环.*LoopModel"):
        翻译器(类路径([str(jar)], 恒等映射()), "sample.LoopModel", 模型树=模型树).翻译()


def test_图的常量折叠按JVM语义() -> None:
    g = 图()
    # float 每步舍入
    a = g.算("*", "f", g.常("f", f32(0.1)), g.常("f", f32(3.0)))
    assert g.常量值(a) == f32(f32(0.1) * f32(3.0))
    # int 溢出回绕、除法向零取整
    assert g.常量值(g.算("+", "i", g.常("i", 2**31 - 1), g.常("i", 1))) == -(2**31)
    assert g.常量值(g.算("/", "i", g.常("i", -7), g.常("i", 2))) == -3
    assert g.常量值(g.算("%", "i", g.常("i", -7), g.常("i", 2))) == -1
    # (int) 强转饱和、NaN → 0
    assert 转换(1e20, "f", "i") == 2**31 - 1
    assert 转换(math.nan, "f", "i") == 0
    assert 转换(-1e30, "d", "j") == -(2**63)
    # 和输入相同的子式只存一份
    x = g.输入("f", "x")
    assert g.算("+", "f", x, g.常("f", 1.0)) == g.算("+", "f", x, g.常("f", 1.0))
    # sel 两边相同直接取
    assert g.选(g.比("<", x, g.常("f", 0.0)), x, x) == x


# ---------- 内建函数：每个都对着 JVM 逐位比（Mth 走照 1.20.1 字节码写的桩，java/lang/Math 走 JDK） ----------
# JDK 的 Math.sin 这类超越函数规范只保证 1 ulp，各平台、各 JVM 可以差一位；这几个按 1 ulp 比，其余逐位
超越函数 = {"java/lang/Math.sin(D)D", "java/lang/Math.cos(D)D", "java/lang/Math.pow(DD)D", "java/lang/Math.atan2(DD)D", "java/lang/Math.exp(D)D"}


def _参数类型(函数: str) -> tuple[str, str]:
    d = 函数[函数.index("(") :]
    return d[1 : d.index(")")], d[d.index(")") + 1 :]


def _写值(t: str, x) -> str:
    if t == "F":
        return 位(x) if not math.isnan(x) else "7fc00000"
    if t == "D":
        return format(struct.unpack(">Q", struct.pack(">d", x))[0], "x") if not math.isnan(x) else "7ff8000000000000"
    return str(x)


def _读值(t: str, s: str):
    if t == "F":
        return 浮(s)
    if t == "D":
        return struct.unpack(">d", struct.pack(">Q", int(s, 16)))[0]
    return int(s)


def 内建样例(每个: int = 400) -> list[tuple[str, list[str]]]:
    r = random.Random(11)
    特殊 = [0.0, -0.0, math.nan, math.inf, -math.inf, 1e10, -1e10, 3.4e38, -3.4e38, 1e-45, 0.5, -0.5, 1.0, -1.0, 2.0, 180.0, -180.0, 360.0, -2147483648.0, -2147483904.0, 2147483648.0]
    特殊整 = [0, 1, -1, 2, 2**31 - 1, -(2**31), 65535, -65536]

    def 取(t: str):
        if t == "I":
            return r.choice(特殊整) if r.random() < 0.25 else r.randint(-5000, 5000)
        x = r.choice(特殊) if r.random() < 0.25 else r.uniform(-1, 1) * 10 ** r.uniform(-3, 5)
        return f32(x) if t == "F" else x

    out = []
    for 函数 in 内建:
        ps, _ = _参数类型(函数)
        for _ in range(每个):
            out.append((函数, [_写值(t, 取(t)) for t in ps]))
    return out


def test_内建函数和JVM逐位相同(编译好: tuple[Path, Path]) -> None:
    jar, jdk = 编译好
    样 = 内建样例()
    r = subprocess.run(
        [str(jdk / "java"), "-cp", str(jar), "sample.Builtins"], input="\n".join(f"{f} {' '.join(a)}" for f, a in 样) + "\n", capture_output=True, text=True, check=True
    )
    真 = r.stdout.split()
    assert len(真) == len(样)
    for (函数, 参数), 真值 in zip(样, 真):
        ps, rt = _参数类型(函数)
        算 = _写值(rt, 内建[函数][1](*[_读值(t, a) for t, a in zip(ps, 参数)]))
        if 算 != 真值 and 函数 in 超越函数:
            a, b = _读值("D", 算), _读值("D", 真值)
            assert math.isfinite(a) and math.isfinite(b) and abs(a - b) <= math.ulp(b), f"{函数}{参数}：Python {算} ≠ JVM {真值}"
            continue
        assert 算 == 真值, f"{函数}{参数}：Python {算} ≠ JVM {真值}"
    if os.environ.get("ANIM_UPDATE_POSE_SAMPLE"):
        # TS 求值器的 内建函数 拿这份比（engine/anim/姿态程序.test.ts）；每个函数取 60 组，省篇幅
        计数: dict[str, int] = {}
        留 = []
        for (函数, 参数), 真值 in zip(样, 真):
            计数[函数] = 计数.get(函数, 0) + 1
            if 计数[函数] <= 60:
                留.append([函数, 参数, 真值])
        data = {"说明": "py/tests/test_动作翻译.py 生成（ANIM_UPDATE_POSE_SAMPLE=1）：内建函数的参数和 JVM 结果（F、D 是十六进制位，I 是十进制）", "超越函数": sorted(超越函数), "样例": 留}
        p = 仓库 / "engine/anim/姿态程序.内建样例.json"
        p.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
