"""动作翻译拿真 jar 对照：游戏客户端里的模型类在 JVM 上真跑 setupAnim（动作翻译真跑/RealPose.java，反射调，名字由这里按映射换成 jar 里的），
和翻译出的姿态程序逐位比。样例桩（test_动作翻译.py）验的是翻译规则，这里验的是原版、模组的真代码（关键帧动画、集合、照跑的 AnimationState）。
要的东西缺一样就跳过：JDK 17、客户端 jar、映射、Prism 下载的 1.20.1 库（Bootstrap 要 guava、fastutil 这些）；模组那组另要模组 jar、SRG 名客户端、obf_to_srg.tsrg。
设 ANIM_REAL_POSE_DUMP=<目录> 时把程序和真值写出去，engine/anim/姿态程序.真jar.test.ts 拿 TS 求值器再比一遍。
路径照 anim env 的取法：环境变量 > anim.local.toml > 默认（数据根在主检出旁边，游戏目录在旧项目 game/，Prism 数据在 ~/Library/Application Support/PrismLauncher）。
"""

from __future__ import annotations

import json
import os
import random
import struct
import subprocess
import sys
import tomllib
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

import pytest

from anim_py.动作翻译.图 import f32, 求值
from anim_py.动作翻译.执行 import 拆描述, 翻译器
from anim_py.动作翻译.映射 import 换描述符, 读映射
from anim_py.动作翻译.类文件 import 类路径

sys.path.insert(0, str(Path(__file__).parent))
from test_动作翻译 import _jdk, 位, 浮  # noqa: E402  # pyright: ignore[reportMissingImports]

仓库 = Path(__file__).resolve().parents[2]
真跑源 = Path(__file__).parent / "动作翻译真跑" / "RealPose.java"
字段 = ("x", "y", "z", "xRot", "yRot", "zRot", "xScale", "yScale", "zScale")
LONG_MAX = 2**63 - 1


# ---------- 环境 ----------
def _配置(键: str, 环境变量: str) -> str | None:
    if os.environ.get(环境变量):
        return os.environ[环境变量]
    p = 仓库 / "anim.local.toml"
    if p.exists():
        v = tomllib.loads(p.read_text(encoding="utf-8")).get(键)
        if v:
            return str(v)
    return None


def _主检出() -> Path:
    r = subprocess.run(["git", "-C", str(仓库), "rev-parse", "--path-format=absolute", "--git-common-dir"], capture_output=True, text=True)
    return Path(r.stdout.strip()).parent if r.returncode == 0 else 仓库


def 环境() -> dict[str, Path]:
    主 = _主检出()
    数据 = Path(_配置("data", "ANIM_DATA") or 主.parent / "mc-anim-data")
    旧 = Path(_配置("legacy", "ANIM_LEGACY") or 主.parent / "机械动力应力转动-AI漫画")
    游戏 = Path(_配置("game", "ANIM_GAME") or 旧 / "game")
    prism = Path(_配置("prism_data", "ANIM_PRISM_DATA") or Path.home() / "Library/Application Support/PrismLauncher")
    return {"数据": 数据, "游戏": 游戏, "prism": prism}


def 找映射(env: dict[str, Path]) -> Path | None:
    # 官方映射不进仓库、不进资产库：anim extract --下载 放数据根 cache/映射/；早先临时下的 cache/动作翻译映射/、游戏目录 缓存/ 也认
    for p in (
        env["数据"] / "cache/映射/client-1.20.1-mappings.txt",
        env["数据"] / "cache/动作翻译映射/client-1.20.1-mappings.txt",
        env["游戏"] / "缓存/client-1.20.1-mappings.txt",
    ):
        if p.exists():
            return p
    return None


def 库类路径(env: dict[str, Path], 版本: str) -> list[str] | None:
    meta = env["prism"] / "meta/net.minecraft" / f"{版本}.json"
    if not meta.exists():
        return None
    out = []
    for lib in json.loads(meta.read_text(encoding="utf-8"))["libraries"]:
        if "rules" in lib or "natives" in lib:
            continue
        g, a, v = lib["name"].split(":")[:3]
        p = env["prism"] / "libraries" / g.replace(".", "/") / a / v / f"{a}-{v}.jar"
        if not p.exists():
            return None
        out.append(str(p))
    return out


# ---------- 名字反查：官方名 → jar 里的名字 ----------
class 反查:
    def __init__(self, 路径: 类路径):
        self.路径 = 路径
        self.映射 = 路径.改名

    def 类(self, 官: str) -> str:
        return self.映射.反查类(官.replace(".", "/"))

    def 描述(self, 官描述: str) -> str:
        return 换描述符(官描述, self.类)

    def 字段(self, 官类: str, 名: str) -> tuple[str, str, str]:
        """(所属 jar 类, jar 字段名, jar 描述符)，沿父类找"""
        c = self.类(官类)
        while c:
            raw = self.路径.原始类(c)
            if raw is None:
                break
            for f in raw.字段们:
                if self.映射.字段(c, f.名, f.描述) == 名:
                    return c, f.名, f.描述
            c = raw.父类
        raise KeyError(f"{官类}.{名}")

    def 方法(self, 官类: str, 名: str, 官描述: str) -> tuple[str, str]:
        d = self.描述(官描述)
        c = self.类(官类)
        while c:
            raw = self.路径.原始类(c)
            if raw is None:
                break
            for m in raw.方法们:
                if m.描述 == d and self.映射.方法(c, m.名, m.描述) == 名:
                    return m.名, d
            c = raw.父类
        raise KeyError(f"{官类}.{名}{官描述}")

    def 官类(self, jar描述: str) -> str:
        return self.映射.类(jar描述[1:-1]) if jar描述.startswith("L") else jar描述


def _值串(t: str, v: object) -> str:
    """给 TS 的输入：f 写 float 位，d 写 repr（十进制来回不丢位），i、j 写十进制"""
    if t == "f":
        return 位(f32(float(v)))  # type: ignore[arg-type]
    if t == "d":
        return repr(float(v))  # type: ignore[arg-type]
    return str(int(v))  # type: ignore[call-overload]


def 点(c: str) -> str:
    return c.replace("/", ".")


# ---------- 一只生物怎么在 JVM 上摆 ----------
@dataclass
class 生物:
    模型类: str
    实体类: str
    # 造好实体后跑一次的命令（SynchedEntityData 这类）
    准备: Callable[[反查], list[str]] = lambda 查: []
    # 每组：随机给实体设状态，返回 (命令们, 程序输入里实体那部分, 要 query 的 (输入名, 命令))
    每组: Callable[[random.Random, 反查, dict], tuple[list[str], dict, list[tuple[str, str]]]] = lambda r, 查, x: ([], {}, [])
    固定: dict = field(default_factory=dict)
    # setupAnim / prepareMobModel 擦除后的实体参数类型（BlazeModel<T extends Entity> 是 Entity），默认同 实体类
    实体参数: str | None = None
    带prepare: bool = False
    层方法: str = "createBodyLayer"
    # 层定义方法的参数：<类>:<静态字段>（1.21 苦力怕的 createBodyLayer(CubeDeformation.NONE)）
    层参数: str | None = None
    # 1.21.2 起 setupAnim(渲染状态)：输入全是状态的字段，样例照程序的输入表随机给
    渲染状态: bool = False


def 设字段路径(查: 反查, 起类: str, 路径: list[str], 值: object) -> str:
    """entity.a.b 这种字段路径 → setf 命令（值：long/int 十进制、float 位）"""
    segs, c, d = [], 起类, ""
    for 名 in 路径:
        owner, jn, d = 查.字段(c, 名)
        segs.append(f"{点(owner)}:{jn}")
        c = 查.官类(d)
    v = 位(值) if d == "F" else str(int(值))  # type: ignore[arg-type]
    return f"setf {'/'.join(segs)} {d} {v}"


def 动画状态们(r: random.Random, 查: 反查, 实体类: str, 名们: list[str], age: float) -> tuple[list[str], dict]:
    """AnimationState：一半没开始（lastTime = Long.MAX_VALUE），一半在 age 之前若干毫秒开始、带一段已累计时间"""
    cmds, 入 = [], {}
    for n in 名们:
        if r.random() < 0.5:
            last, acc = LONG_MAX, r.randrange(0, 5000)
        else:
            last, acc = int(age * 50) - r.randrange(0, 12000), r.randrange(0, 3000)
        cmds.append(设字段路径(查, 实体类, [n, "lastTime"], last))
        cmds.append(设字段路径(查, 实体类, [n, "accumulatedTime"], acc))
        入[f"entity.{n}.lastTime"] = last
        入[f"entity.{n}.accumulatedTime"] = acc
    return cmds, 入


def _监守者每组(r: random.Random, 查: 反查, x: dict) -> tuple[list[str], dict, list[tuple[str, str]]]:
    E = "net/minecraft/world/entity/monster/warden/Warden"
    tick = r.randrange(0, 30000)
    cmds = [设字段路径(查, E, ["tickCount"], tick), 设字段路径(查, E, ["tendrilAnimation"], r.randrange(0, 11)), 设字段路径(查, E, ["tendrilAnimationO"], r.randrange(0, 11))]
    c2, 入 = 动画状态们(r, 查, E, ["attackAnimationState", "sonicBoomAnimationState", "diggingAnimationState", "emergeAnimationState", "roarAnimationState", "sniffAnimationState"], x["ageInTicks"])
    # getTendrilAnimation(ageInTicks - tickCount)：实体上的调用是程序输入，值拿 JVM 真算
    名, d = 查.方法(E, "getTendrilAnimation", "(F)F")
    arg = f32(x["ageInTicks"] - f32(float(tick)))
    return cmds + c2, 入, [("entity.getTendrilAnimation(…)", f"query {名} {d} {位(arg)}")]


def _骆驼准备(查: 反查) -> list[str]:
    E = "net/minecraft/world/entity/animal/camel/Camel"
    owner, jn, _ = 查.字段(E, "entityData")
    名, d = 查.方法(E, "defineSynchedData", "()V")
    return [f"newe {点(owner)}:{jn}", f"call {名} {d}"]


def _骆驼每组(r: random.Random, 查: 反查, x: dict) -> tuple[list[str], dict, list[tuple[str, str]]]:
    E = "net/minecraft/world/entity/animal/camel/Camel"
    tick, cd = r.randrange(0, 30000), r.choice([0, 0, r.randrange(1, 56)])
    鞍, 骑 = r.random() < 0.5, r.random() < 0.5
    flag, fd = 查.方法(E, "setFlag", "(IZ)V")
    owner, jn, _ = 查.字段(E, "passengers")
    cmds = [设字段路径(查, E, ["tickCount"], tick), 设字段路径(查, E, ["dashCooldown"], cd), f"call {flag} {fd} 4 {int(鞍)}", f"setlist {点(owner)}:{jn} {int(骑)}"]
    c2, 入 = 动画状态们(r, 查, E, ["sitAnimationState", "sitPoseAnimationState", "sitUpAnimationState", "idleAnimationState", "dashAnimationState"], x["ageInTicks"])
    入.update({"entity.tickCount": tick, "entity.getJumpCooldown()": cd, "entity.isSaddled()": int(鞍), "entity.isVehicle()": int(骑)})
    return cmds + c2, 入, []


def _烈焰人每组(r: random.Random, 查: 反查, x: dict) -> tuple[list[str], dict, list[tuple[str, str]]]:
    return [], {}, []


def _蜜蜂准备(查: 反查) -> list[str]:
    E = "net/minecraft/world/entity/animal/Bee"
    owner, jn, _ = 查.字段(E, "entityData")
    名, d = 查.方法(E, "defineSynchedData", "()V")
    return [f"newe {点(owner)}:{jn}", f"call {名} {d}"]


def _蜜蜂每组(r: random.Random, 查: 反查, x: dict) -> tuple[list[str], dict, list[tuple[str, str]]]:
    E = "net/minecraft/world/entity/animal/Bee"
    叮过, 地上, 怒 = r.random() < 0.3, r.random() < 0.5, r.random() < 0.4
    v = [r.choice([0.0, r.uniform(-0.3, 0.3)]) for _ in range(3)]
    st, std = 查.方法(E, "setHasStung", "(Z)V")
    an, and_ = 查.方法(E, "setRemainingPersistentAngerTime", "(I)V")
    dm, dmd = 查.方法("net/minecraft/world/entity/Entity", "setDeltaMovement", "(DDD)V")
    双 = lambda d: format(struct.unpack(">Q", struct.pack(">d", d))[0], "x")  # noqa: E731
    cmds = [
        设字段路径(查, E, ["rollAmount"], f32(r.uniform(0, 1))),
        设字段路径(查, E, ["rollAmountO"], f32(r.uniform(0, 1))),
        f"call {st} {std} {int(叮过)}",
        f"call {an} {and_} {r.randrange(1, 400) if 怒 else 0}",
        设字段路径(查, "net/minecraft/world/entity/Entity", ["onGround"], int(地上)),
        f"call {dm} {dmd} {' '.join(双(c) for c in v)}",
    ]
    入 = {"entity.hasStung()": int(叮过), "entity.onGround()": int(地上), "entity.isAngry()": int(怒), "entity.getDeltaMovement().lengthSqr()": v[0] * v[0] + v[1] * v[1] + v[2] * v[2]}
    名, d = 查.方法(E, "getRollAmount", "(F)F")
    return cmds, 入, [("entity.getRollAmount(…)", f"query {名} {d} {位(x['partialTick'])}")]


生物们 = {
    "监守者": 生物("net/minecraft/client/model/WardenModel", "net/minecraft/world/entity/monster/warden/Warden", 每组=_监守者每组),
    "骆驼": 生物("net/minecraft/client/model/CamelModel", "net/minecraft/world/entity/animal/camel/Camel", 准备=_骆驼准备, 每组=_骆驼每组),
    # 构造里 Arrays.setAll 填 12 根棒子
    "烈焰人": 生物("net/minecraft/client/model/BlazeModel", "net/minecraft/world/entity/monster/Blaze", 每组=_烈焰人每组, 实体参数="net/minecraft/world/entity/Entity"),
    # rotlerpRad（内建）、prepareMobModel 取翻滚量
    "蜜蜂": 生物("net/minecraft/client/model/BeeModel", "net/minecraft/world/entity/animal/Bee", 准备=_蜜蜂准备, 每组=_蜜蜂每组, 带prepare=True),
}


def 随机参数(r: random.Random) -> dict:
    return {
        "limbSwing": f32(r.uniform(0, 300)),
        "limbSwingAmount": f32(r.choice([0.0, r.uniform(0, 1), r.uniform(0, 1.5)])),
        "ageInTicks": f32(r.uniform(0, 30000)),
        "netHeadYaw": f32(r.uniform(-90, 90)),
        "headPitch": f32(r.uniform(-60, 60)),
        "partialTick": f32(r.random()),
    }


def _狗头人每组(r: random.Random, 查: 反查, x: dict) -> tuple[list[str], dict, list[tuple[str, str]]]:
    dm, dmd = 查.方法("net/minecraft/world/entity/Entity", "setDeltaMovement", "(DDD)V")
    vy = r.choice([0.0, r.uniform(-0.6, 0.6)])
    双 = lambda d: format(struct.unpack(">Q", struct.pack(">d", d))[0], "x")  # noqa: E731
    return [f"call {dm} {dmd} {双(0.0)} {双(vy)} {双(0.0)}"], {"entity.getDeltaMovement().y()": vy}, []


# Forge 1.20.1 的模组（运行时 SRG 名）：模组 jar + SRG 名客户端 + mcp_config 的 obf_to_srg.tsrg 配 client.txt
模组生物们 = {
    "暮色松鼠": 生物("twilightforest/client/model/entity/SquirrelModel", "twilightforest/entity/passive/Squirrel", 层方法="create"),
    # HumanoidModel 的子类，父类从 SRG 客户端里找；prepareMobModel 读实体的竖直速度
    "暮色狗头人": 生物("twilightforest/client/model/entity/KoboldModel", "twilightforest/entity/monster/Kobold", 每组=_狗头人每组, 带prepare=True, 层方法="create"),
}


# 1.21.11（最后一个混淆的版本）：setupAnim 收渲染状态；JDK 21
新版生物们 = {
    "苦力怕-1.21.11": 生物("net/minecraft/client/model/monster/creeper/CreeperModel", "", 层参数="net/minecraft/client/model/geom/builders/CubeDeformation:NONE", 渲染状态=True),
    "烈焰人-1.21.11": 生物("net/minecraft/client/model/monster/blaze/BlazeModel", "", 渲染状态=True),
}


@dataclass
class 真跑环境:
    jdk: Path
    类目录: Path
    jar们: list[str]
    库们: list[str]
    映射: str
    # 只给 JVM 的：SRG 名客户端只有类，Bootstrap 要的语言文件这些从原版客户端 jar 里拿（放最后，同名类以前面的为准）
    资源们: list[str] = field(default_factory=list)


@pytest.fixture(scope="module")
def 原版(tmp_path_factory: pytest.TempPathFactory) -> 真跑环境:
    jdk = _jdk()
    if jdk is None:
        pytest.skip("没有 JDK 17")
    env = 环境()
    client = env["游戏"] / "缓存/client-1.20.1.jar"
    映射 = 找映射(env)
    libs = 库类路径(env, "1.20.1")
    if not client.exists() or 映射 is None or libs is None:
        pytest.skip(f"缺 client-1.20.1.jar / 官方映射 / Prism 的 1.20.1 库（{client}、{映射}）")
    out = tmp_path_factory.mktemp("真跑")
    subprocess.run([str(jdk / "javac"), "-nowarn", "-cp", os.pathsep.join(libs), "-d", str(out), str(真跑源)], check=True, capture_output=True)
    return 真跑环境(jdk, out, [str(client)], libs, f"proguard:{映射}")


@pytest.fixture(scope="module")
def 暮色(原版: 真跑环境) -> 真跑环境:
    env = 环境()
    tf = env["游戏"] / "取材服务端/mods/twilightforest-1.20.1-4.3.2508-universal.jar"
    srg客户端 = env["游戏"] / "缓存/client-1.20.1-srg.jar"
    tsrg = Path(os.environ.get("ANIM_MCP_TSRG") or Path.home() / ".gradle/caches/forge_gradle/mcp_repo/de/oceanlabs/mcp/mcp_config/1.20.1/mcp_config-1.20.1-obf_to_srg.tsrg")
    if not (tf.exists() and srg客户端.exists() and tsrg.exists()):
        pytest.skip(f"缺暮色森林 jar / SRG 名客户端 / obf_to_srg.tsrg（{tf}、{srg客户端}、{tsrg}；tsrg 在 ForgeGradle 缓存里，可用 ANIM_MCP_TSRG 指定）")
    return 真跑环境(原版.jdk, 原版.类目录, [str(tf), str(srg客户端)], 原版.库们, f"srg:{tsrg},{原版.映射.partition(':')[2]}", 资源们=原版.jar们)


@pytest.fixture(scope="module")
def 新版(原版: 真跑环境) -> 真跑环境:
    env = 环境()
    jdk = next((Path(d) / "bin" for d in (os.environ.get("JAVA21_HOME", ""), "/opt/homebrew/opt/openjdk@21", "/usr/lib/jvm/java-21-openjdk") if d and (Path(d) / "bin/java").exists()), None)
    client = env["游戏"] / "缓存/client-1.21.11.jar"
    # 1.21.11 的映射没在 jars.toml 登记，临时放 cache/动作翻译映射/；以后登记进 cache/映射/ 也认
    映射 = next(
        (p for p in (env["数据"] / f"cache/{d}/client-1.21.11-mappings.txt" for d in ("映射", "动作翻译映射")) if p.exists()),
        env["数据"] / "cache/动作翻译映射/client-1.21.11-mappings.txt",
    )
    libs = 库类路径(env, "1.21.11")
    if jdk is None or not client.exists() or not 映射.exists() or libs is None:
        pytest.skip(f"缺 JDK 21 / client-1.21.11.jar / 1.21.11 官方映射 / Prism 的 1.21.11 库（{client}、{映射}）")
    return 真跑环境(jdk, 原版.类目录, [str(client)], libs, f"proguard:{映射}")


def JVM跑(环: 真跑环境, 命令们: list[str]) -> list[str]:
    cp = os.pathsep.join([str(环.类目录), *环.jar们, *环.库们, *环.资源们])
    r = subprocess.run([str(环.jdk / "java"), "-cp", cp, "mcanim.RealPose"], input="\n".join(命令们) + "\n", capture_output=True, text=True, timeout=600, cwd=环.类目录)  # 游戏的 Bootstrap 会在当前目录建 logs/
    if r.returncode != 0 or "ERR " in r.stdout:
        raise AssertionError(f"JVM 跑挂了：{r.stdout[-3000:]}{r.stderr[-2000:]}")
    return r.stdout.splitlines()


def 头命令(查: 反查, 物: 生物) -> list[str]:
    sc, bs = 查.类("net/minecraft/SharedConstants"), 查.类("net/minecraft/server/Bootstrap")
    tv, _ = 查.方法("net/minecraft/SharedConstants", "tryDetectVersion", "()V")
    bb, _ = 查.方法("net/minecraft/server/Bootstrap", "bootStrap", "()V")
    LD, MP = "net/minecraft/client/model/geom/builders/LayerDefinition", "net/minecraft/client/model/geom/ModelPart"
    参类, _, 参字段 = (物.层参数 or "").partition(":")
    cl, cld = 查.方法(物.模型类, 物.层方法, f"({f'L{参类};' if 参类 else ''})L{LD};")
    层参 = [f"{点(o)}:{jn}" for o, jn, _ in [查.字段(参类, 参字段)]] if 参类 else []
    br, brd = 查.方法(LD, "bakeRoot", f"()L{MP};")
    部件字段 = [查.字段(MP, f)[1] for f in (*字段, "visible")]
    ch = 查.字段(MP, "children")[1]
    rp, _ = 查.方法(MP, "resetPose", "()V")
    return [
        f"boot {点(sc)} {tv} {点(bs)} {bb}",
        " ".join(["model", 点(查.类(物.模型类)), cl, cld, br, brd, *层参]),
        f"part {ch} {rp} {' '.join(部件字段)}",
        *([f"entity {点(查.类(物.实体类))}"] if 物.实体类 else []),
        *物.准备(查),
        "tree",
        "reset",
        "dump",
    ]


def 读姿态(行们: list[str], i: int) -> tuple[dict, int]:
    out = {}
    while 行们[i] != "END":
        v = 行们[i].split()
        assert v[0] == "P", 行们[i]
        out[v[1]] = {**{f: v[2 + k] for k, f in enumerate(字段)}, "visible": int(v[11])}
        i += 1
    return out, i + 1


@pytest.mark.parametrize("名", list(生物们))
def test_原版生物和JVM逐位相同(原版: 真跑环境, 名: str) -> None:
    对照(原版, 名, 生物们[名])


@pytest.mark.parametrize("名", list(模组生物们))
def test_模组生物和JVM逐位相同(暮色: 真跑环境, 名: str) -> None:
    对照(暮色, 名, 模组生物们[名])


@pytest.mark.parametrize("名", list(新版生物们))
def test_新版渲染状态入口和JVM逐位相同(新版: 真跑环境, 名: str) -> None:
    对照(新版, 名, 新版生物们[名])


def 对照(环: 真跑环境, 名: str, 物: 生物) -> None:
    路径 = 类路径(环.jar们, 读映射(环.映射))
    查 = 反查(路径)
    r = random.Random(名)
    组们: list[tuple[dict, dict, list[str]]] = []
    命令 = 头命令(查, 物)
    # 先翻：渲染状态入口的样例照程序的输入表给；部件树要不要取也看翻译时用没用到
    t = 翻译器(路径, 物.模型类, 物.固定)
    prog = t.翻译()
    if 物.渲染状态:
        入口 = t.找渲染状态入口()
        assert 入口 is not None
        状态类 = 拆描述(入口[1].描述)[0][0][1:-1]
        sname, sd = 查.方法(物.模型类, "setupAnim", f"(L{状态类};)V")
        命令.append(f"state {点(查.类(状态类))}")
        for _ in range(150):
            x: dict = {}
            cmds = []
            for k, meta in prog["输入"].items():
                assert k.startswith("state.") and k.count(".") == 1 and "(" not in k, f"样例只会设状态的字段：{k}"
                owner, jn, d = 查.字段(状态类, k[6:])
                x[k] = f32(r.choice([0.0, r.uniform(-1.5, 1.5), r.uniform(-300, 300)])) if meta["类型"] == "f" else r.randrange(2)
                cmds.append(f"sets {点(owner)}:{jn} {位(x[k]) if d == 'F' else x[k]}")
            组们.append((x, {}, []))
            命令 += cmds + ["reset", f"setups {sname} {sd}", "dump"]
    else:
        参 = 物.实体参数 or 物.实体类
        sname, sd = 查.方法(物.模型类, "setupAnim", f"(L{参};FFFFF)V")
        pname, pd = 查.方法(物.模型类, "prepareMobModel", f"(L{参};FFF)V") if 物.带prepare else ("", "")
        for _ in range(150):
            x = 随机参数(r)
            cmds, 入, 询 = 物.每组(r, 查, x)
            组们.append((x, 入, [n for n, _ in 询]))
            预备 = [f"prepare {pname} {pd} {' '.join(位(x[k]) for k in ('limbSwing', 'limbSwingAmount', 'partialTick'))}"] if 物.带prepare else []
            命令 += cmds + [q for _, q in 询] + ["reset", *预备, f"setup {sname} {sd} {' '.join(位(x[k]) for k in ('limbSwing', 'limbSwingAmount', 'ageInTicks', 'netHeadYaw', 'headPitch'))}", "dump"]
    行们 = JVM跑(环, 命令)
    # 部件树（翻译器按名字找部件要它）、初始姿态
    树: dict[str, list[str]] = {}
    i = 0
    while 行们[i] != "END":
        _, n, p = 行们[i].split()
        树.setdefault(n, [])
        if p != "-":
            树.setdefault(p, []).append(n)
        i += 1
    初始位, i = 读姿态(行们, i + 1)
    初始 = {n: {f: 浮(d[f]) for f in 字段[:6]} for n, d in 初始位.items()}
    # 不给部件树：翻译器从 createBodyLayer 具体跑出来（部件树.py），和 JVM 烤出来的树应该一样
    if t.模型树 is not None:  # 只有按名字找部件（关键帧动画）时才去取
        assert {k: sorted(v) for k, v in t.模型树.items()} == {k: sorted(v) for k, v in 树.items()}
    # 关键帧动画的（HierarchicalModel）先整棵复位；蜜蜂那种「只在部分分支里写」的警告在这里不碍事：JVM 每组前也复位了，上一帧就是初始姿态
    # 1.21.2 起 EntityModel.setupAnim 一开头就 resetPose，整棵复位
    assert prog["复位"] == (物.渲染状态 or any(k.endswith(".lastTime") for k in prog["输入"])), prog["复位"]
    assert all("只在部分分支里写" in w for w in prog["警告"]), prog["警告"]
    动画起作用 = 0
    留: list[dict] = []
    for x, 入, 询 in 组们:
        for n in 询:
            assert 行们[i].startswith("Q "), 行们[i]
            入[n] = 浮(行们[i][2:])
            i += 1
        真, i = 读姿态(行们, i)
        给 = {**x, **入}
        for k, meta in prog["输入"].items():
            if k not in 给:
                raise AssertionError(f"程序要输入 {k}，样例没给：{meta}")
        v = 求值(prog["节点"], 给, 初始)
        留.append({"输入": {k: [prog["输入"][k]["类型"], _值串(prog["输入"][k]["类型"], 给[k])] for k in prog["输入"]}, "真值": {n: " ".join([*(d[f] for f in 字段), str(d["visible"])]) for n, d in 真.items()}})
        for 部件名, d in 真.items():
            算 = {**{f: 初始位[部件名][f] for f in 字段[:6]}, **{f: 位(1.0) for f in 字段[6:]}, "visible": 1}
            for f, j in prog["输出"].get(部件名, {}).items():
                算[f] = int(bool(v[j])) if f == "visible" else 位(v[j])
            assert 算 == d, f"{名} {部件名}：翻译 {算} ≠ JVM {d}，输入 {给}"
        # 样例真用上了关键帧动画：把动画状态全改成没开始，结果就该不一样
        停 = {k: (LONG_MAX if k.endswith(".lastTime") else v) for k, v in 给.items()}
        v停 = 求值(prog["节点"], 停, 初始)
        动画起作用 += any(位(v停[j]) != 位(v[j]) for 部 in prog["输出"].values() for f, j in 部.items() if f != "visible")
    if any(k.endswith(".lastTime") for k in prog["输入"]):
        assert 动画起作用 > len(组们) // 4, 动画起作用
    # TS 求值器拿同一份程序和真值再比一遍（engine/anim/姿态程序.真jar.test.ts）：程序几百 KB、真值来自 Mojang 的 jar，不进仓库，只写到给定目录
    if os.environ.get("ANIM_REAL_POSE_DUMP"):

        def 部件(n: str) -> dict:
            p = 初始[n]
            return {"name": n, "pose": {"offset": [p["x"], p["y"], p["z"]], "rot": [p["xRot"], p["yRot"], p["zRot"]]}, "cubes": [], "children": [部件(c) for c in 树.get(n, [])]}

        out = Path(os.environ["ANIM_REAL_POSE_DUMP"]) / f"{名}.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({"程序": prog, "根": 部件("root"), "样例": 留}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
