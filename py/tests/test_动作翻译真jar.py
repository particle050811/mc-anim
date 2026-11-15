"""动作翻译拿真 jar 对照：游戏客户端里的模型类在 JVM 上真跑 setupAnim（动作翻译真跑/RealPose.java，反射调，名字由这里按映射换成 jar 里的），
和翻译出的姿态程序逐位比。样例桩（test_动作翻译.py）验的是翻译规则，这里验的是原版、模组的真代码（关键帧动画、集合、照跑的 AnimationState）。
要的东西缺一样就跳过：JDK 17、客户端 jar、映射、Prism 下载的 1.20.1 库（Bootstrap 要 guava、fastutil 这些）；模组那组另要模组 jar、SRG 名客户端、obf_to_srg.tsrg。
设 ANIM_REAL_POSE_DUMP=<目录> 时把程序和真值写出去，engine/anim/姿态程序.真jar.test.ts 拿 TS 求值器再比一遍。
路径照 anim env 的取法：环境变量 > anim.local.toml > 默认（数据根在主检出旁边，游戏目录在数据根 game/，Prism 数据在 ~/Library/Application Support/PrismLauncher）。
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

from anim_py.动作翻译.图 import f32, evaluate
from anim_py.动作翻译.执行 import split_descriptor, Translator
from anim_py.动作翻译.映射 import remap_descriptor, read_mapping
from anim_py.动作翻译.类文件 import ClassPath

sys.path.insert(0, str(Path(__file__).parent))
from test_动作翻译 import _jdk, float_bits_hex, hex_to_float  # noqa: E402  # pyright: ignore[reportMissingImports]

repo_root = Path(__file__).resolve().parents[2]
real_run_source = Path(__file__).parent / "动作翻译真跑" / "RealPose.java"
transform_fields = ("x", "y", "z", "xRot", "yRot", "zRot", "xScale", "yScale", "zScale")
LONG_MAX = 2**63 - 1


# ---------- 环境 ----------
def _config_value(config_key: str, env_var: str) -> str | None:
    if os.environ.get(env_var):
        return os.environ[env_var]
    p = repo_root / "anim.local.toml"
    if p.exists():
        v = tomllib.loads(p.read_text(encoding="utf-8")).get(config_key)
        if v:
            return str(v)
    return None


def _main_checkout() -> Path:
    r = subprocess.run(["git", "-C", str(repo_root), "rev-parse", "--path-format=absolute", "--git-common-dir"], capture_output=True, text=True)
    return Path(r.stdout.strip()).parent if r.returncode == 0 else repo_root


def get_env() -> dict[str, Path]:
    main_root = _main_checkout()
    data_dir = Path(_config_value("data", "ANIM_DATA") or main_root.parent / "mc-anim-data")
    game_dir = Path(_config_value("game", "ANIM_GAME") or data_dir / "game")
    prism = Path(_config_value("prism_data", "ANIM_PRISM_DATA") or Path.home() / "Library/Application Support/PrismLauncher")
    return {"数据": data_dir, "游戏": game_dir, "prism": prism}


def find_mapping(env: dict[str, Path]) -> Path | None:
    # 官方映射不进仓库、不进资产库：anim extract --download 放数据根 cache/映射/；早先临时下的 cache/动作翻译映射/、游戏目录 缓存/ 也认
    for p in (
        env["数据"] / "cache/映射/client-1.20.1-mappings.txt",
        env["数据"] / "cache/动作翻译映射/client-1.20.1-mappings.txt",
        env["游戏"] / "缓存/client-1.20.1-mappings.txt",
    ):
        if p.exists():
            return p
    return None


def lib_class_paths(env: dict[str, Path], version: str) -> list[str] | None:
    meta = env["prism"] / "meta/net.minecraft" / f"{version}.json"
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
class ReverseLookup:
    def __init__(self, classpath: ClassPath):
        self.路径 = classpath
        self.映射 = classpath.renamer

    def 类(self, official: str) -> str:
        return self.映射.reverse_lookup_class(official.replace(".", "/"))

    def map_descriptor(self, official_descriptor: str) -> str:
        return remap_descriptor(official_descriptor, self.类)

    def field(self, official_class: str, field_name: str) -> tuple[str, str, str]:
        """(所属 jar 类, jar 字段名, jar 描述符)，沿父类找"""
        c = self.类(official_class)
        while c:
            raw = self.路径.raw_class(c)
            if raw is None:
                break
            for f in raw.fields:
                if self.映射.field(c, f.名, f.descriptor) == field_name:
                    return c, f.名, f.descriptor
            c = raw.parent_class
        raise KeyError(f"{official_class}.{field_name}")

    def method_owner(self, official_class: str, method_name: str, official_descriptor: str) -> tuple[str, str, str]:
        """(声明它的 jar 类, jar 方法名, jar 描述符)，沿父类找；混淆后不同类的方法可能同名同描述符，得带上类才指得准"""
        d = self.map_descriptor(official_descriptor)
        c = self.类(official_class)
        while c:
            raw = self.路径.raw_class(c)
            if raw is None:
                break
            for m in raw.method_list:
                if m.descriptor == d and self.映射.method_ref(c, m.名, m.descriptor) == method_name:
                    return c, m.名, d
            c = raw.parent_class
        raise KeyError(f"{official_class}.{method_name}{official_descriptor}")

    def method_ref(self, official_class: str, method_name: str, official_descriptor: str) -> tuple[str, str]:
        d = self.map_descriptor(official_descriptor)
        c = self.类(official_class)
        while c:
            raw = self.路径.raw_class(c)
            if raw is None:
                break
            for m in raw.method_list:
                if m.descriptor == d and self.映射.method_ref(c, m.名, m.descriptor) == method_name:
                    return m.名, d
            c = raw.parent_class
        raise KeyError(f"{official_class}.{method_name}{official_descriptor}")

    def official_class(self, jar_descriptor: str) -> str:
        return self.映射.类(jar_descriptor[1:-1]) if jar_descriptor.startswith("L") else jar_descriptor


def _value_str(t: str, v: object) -> str:
    """给 TS 的输入：f 写 float 位，d 写 repr（十进制来回不丢位），i、j 写十进制"""
    if t == "f":
        return float_bits_hex(f32(float(v)))  # type: ignore[arg-type]
    if t == "d":
        return repr(float(v))  # type: ignore[arg-type]
    return str(int(v))  # type: ignore[call-overload]


def dotted(c: str) -> str:
    return c.replace("/", ".")


# ---------- 一只生物怎么在 JVM 上摆 ----------
@dataclass
class Creature:
    model_class: str
    entity_class: str
    # 造好实体后跑一次的命令（SynchedEntityData 这类）
    prepare: Callable[[ReverseLookup], list[str]] = lambda lookup: []
    # 每组：随机给实体设状态，返回 (命令们, 程序输入里实体那部分, 要 query 的 (输入名, 命令))
    per_group: Callable[[random.Random, ReverseLookup, dict], tuple[list[str], dict, list[tuple[str, str]]]] = lambda r, lookup, x: ([], {}, [])
    固定: dict = field(default_factory=dict)
    # setupAnim / prepareMobModel 擦除后的实体参数类型（BlazeModel<T extends Entity> 是 Entity），默认同 实体类
    entity_param_class: str | None = None
    with_prepare: bool = False
    layer_method: str = "createBodyLayer"
    # 层定义方法的参数：<类>:<静态字段>（1.21 苦力怕的 createBodyLayer(CubeDeformation.NONE)）
    layer_class: str | None = None
    # 1.21.2 起 setupAnim(渲染状态)：输入全是状态的字段，样例照程序的输入表随机给
    render_state: bool = False


def set_field_path(lookup: ReverseLookup, start_class: str, field_path: list[str], value: object) -> str:
    """entity.a.b 这种字段路径 → setf 命令（值：long/int 十进制、float 位）"""
    segs, c, d = [], start_class, ""
    for field_name in field_path:
        owner, jn, d = lookup.field(c, field_name)
        segs.append(f"{dotted(owner)}:{jn}")
        c = lookup.official_class(d)
    v = float_bits_hex(value) if d == "F" else str(int(value))  # type: ignore[arg-type]
    return f"setf {'/'.join(segs)} {d} {v}"


def animation_states(r: random.Random, lookup: ReverseLookup, entity_class: str, names: list[str], age: float) -> tuple[list[str], dict]:
    """AnimationState：一半没开始（lastTime = Long.MAX_VALUE），一半在 age 之前若干毫秒开始、带一段已累计时间"""
    cmds, inputs = [], {}
    for n in names:
        if r.random() < 0.5:
            last, acc = LONG_MAX, r.randrange(0, 5000)
        else:
            last, acc = int(age * 50) - r.randrange(0, 12000), r.randrange(0, 3000)
        cmds.append(set_field_path(lookup, entity_class, [n, "lastTime"], last))
        cmds.append(set_field_path(lookup, entity_class, [n, "accumulatedTime"], acc))
        inputs[f"entity.{n}.lastTime"] = last
        inputs[f"entity.{n}.accumulatedTime"] = acc
    return cmds, inputs


def _warden_per_group(r: random.Random, lookup: ReverseLookup, x: dict) -> tuple[list[str], dict, list[tuple[str, str]]]:
    E = "net/minecraft/world/entity/monster/warden/Warden"
    tick = r.randrange(0, 30000)
    cmds = [set_field_path(lookup, E, ["tickCount"], tick), set_field_path(lookup, E, ["tendrilAnimation"], r.randrange(0, 11)), set_field_path(lookup, E, ["tendrilAnimationO"], r.randrange(0, 11))]
    c2, inputs = animation_states(r, lookup, E, ["attackAnimationState", "sonicBoomAnimationState", "diggingAnimationState", "emergeAnimationState", "roarAnimationState", "sniffAnimationState"], x["ageInTicks"])
    # getTendrilAnimation(ageInTicks - tickCount)：实体上的调用是程序输入，值拿 JVM 真算
    method_name, d = lookup.method_ref(E, "getTendrilAnimation", "(F)F")
    arg = f32(x["ageInTicks"] - f32(float(tick)))
    return cmds + c2, inputs, [("entity.getTendrilAnimation(…)", f"query {method_name} {d} {float_bits_hex(arg)}")]


def _camel_prepare(lookup: ReverseLookup) -> list[str]:
    E = "net/minecraft/world/entity/animal/camel/Camel"
    owner, jn, _ = lookup.field(E, "entityData")
    method_name, d = lookup.method_ref(E, "defineSynchedData", "()V")
    return [f"newe {dotted(owner)}:{jn}", f"call {method_name} {d}"]


def _camel_per_group(r: random.Random, lookup: ReverseLookup, x: dict) -> tuple[list[str], dict, list[tuple[str, str]]]:
    E = "net/minecraft/world/entity/animal/camel/Camel"
    tick, cd = r.randrange(0, 30000), r.choice([0, 0, r.randrange(1, 56)])
    saddle, riding = r.random() < 0.5, r.random() < 0.5
    flag, fd = lookup.method_ref(E, "setFlag", "(IZ)V")
    owner, jn, _ = lookup.field(E, "passengers")
    cmds = [set_field_path(lookup, E, ["tickCount"], tick), set_field_path(lookup, E, ["dashCooldown"], cd), f"call {flag} {fd} 4 {int(saddle)}", f"setlist {dotted(owner)}:{jn} {int(riding)}"]
    c2, inputs = animation_states(r, lookup, E, ["sitAnimationState", "sitPoseAnimationState", "sitUpAnimationState", "idleAnimationState", "dashAnimationState"], x["ageInTicks"])
    inputs.update({"entity.tickCount": tick, "entity.getJumpCooldown()": cd, "entity.isSaddled()": int(saddle), "entity.isVehicle()": int(riding)})
    return cmds + c2, inputs, []


def _blaze_per_group(r: random.Random, lookup: ReverseLookup, x: dict) -> tuple[list[str], dict, list[tuple[str, str]]]:
    return [], {}, []


def _bee_prepare(lookup: ReverseLookup) -> list[str]:
    E = "net/minecraft/world/entity/animal/Bee"
    owner, jn, _ = lookup.field(E, "entityData")
    method_name, d = lookup.method_ref(E, "defineSynchedData", "()V")
    return [f"newe {dotted(owner)}:{jn}", f"call {method_name} {d}"]


def _bee_per_group(r: random.Random, lookup: ReverseLookup, x: dict) -> tuple[list[str], dict, list[tuple[str, str]]]:
    E = "net/minecraft/world/entity/animal/Bee"
    ding_flag, on_ground, angry = r.random() < 0.3, r.random() < 0.5, r.random() < 0.4
    v = [r.choice([0.0, r.uniform(-0.3, 0.3)]) for _ in range(3)]
    st, std = lookup.method_ref(E, "setHasStung", "(Z)V")
    an, and_ = lookup.method_ref(E, "setRemainingPersistentAngerTime", "(I)V")
    dm, dmd = lookup.method_ref("net/minecraft/world/entity/Entity", "setDeltaMovement", "(DDD)V")
    double_hex = lambda d: format(struct.unpack(">Q", struct.pack(">d", d))[0], "x")  # noqa: E731
    cmds = [
        set_field_path(lookup, E, ["rollAmount"], f32(r.uniform(0, 1))),
        set_field_path(lookup, E, ["rollAmountO"], f32(r.uniform(0, 1))),
        f"call {st} {std} {int(ding_flag)}",
        f"call {an} {and_} {r.randrange(1, 400) if angry else 0}",
        set_field_path(lookup, "net/minecraft/world/entity/Entity", ["onGround"], int(on_ground)),
        f"call {dm} {dmd} {' '.join(double_hex(c) for c in v)}",
    ]
    inputs = {"entity.hasStung()": int(ding_flag), "entity.onGround()": int(on_ground), "entity.isAngry()": int(angry), "entity.getDeltaMovement().lengthSqr()": v[0] * v[0] + v[1] * v[1] + v[2] * v[2]}
    method_name, d = lookup.method_ref(E, "getRollAmount", "(F)F")
    return cmds, inputs, [("entity.getRollAmount(…)", f"query {method_name} {d} {float_bits_hex(x['partialTick'])}")]


def _frog_per_group(r: random.Random, lookup: ReverseLookup, x: dict) -> tuple[list[str], dict, list[tuple[str, str]]]:
    E = "net/minecraft/world/entity/animal/frog/Frog"
    in_water = r.random() < 0.5
    cmds, inputs = animation_states(r, lookup, E, ["jumpAnimationState", "croakAnimationState", "tongueAnimationState", "swimIdleAnimationState"], x["ageInTicks"])
    cmds.append(set_field_path(lookup, "net/minecraft/world/entity/Entity", ["wasTouchingWater"], int(in_water)))
    inputs["entity.isInWaterOrBubble()"] = int(in_water)
    return cmds, inputs, []


def _frog_prepare(lookup: ReverseLookup) -> list[str]:
    # 不在水里时 Entity.isInBubbleColumn 要读脚下方块，没有世界：换一个只有维度高度的空壳（见 RealPose 的 fakelevel），原版代码照样真跑出 false
    Ent = "net/minecraft/world/entity/Entity"
    Lv = "net/minecraft/world/level/Level"
    Dim = "net/minecraft/world/level/dimension/DimensionType"
    el, eln, _ = lookup.field(Ent, "level")
    lo, lreg, _ = lookup.field(Lv, "dimensionTypeRegistration")
    eo, ebp, _ = lookup.field(Ent, "blockPosition")
    hold, hdir = dotted(lookup.类("net/minecraft/core/Holder")), lookup.method_ref("net/minecraft/core/Holder", "direct", "(Ljava/lang/Object;)Lnet/minecraft/core/Holder;")[0]
    return [
        f"fakelevel {dotted(el)}:{eln} {dotted(lookup.类('net/minecraft/client/multiplayer/ClientLevel'))} {dotted(lo)}:{lreg} {hold} {hdir} {dotted(lookup.类(Dim))} {dotted(eo)}:{ebp} {dotted(lookup.类('net/minecraft/core/BlockPos'))}"
    ]


def _sniffer_status(lookup: ReverseLookup, searching: bool) -> list[str]:
    # 状态数据项是构造函数里 define 的（Unsafe 造的实体不跑构造），数据表每组重造、直接 define 成要的状态：
    # 走 setState 会触发 onSyncedDataUpdated → setPose，而姿势这些 Entity 构造里 define 的项我们没有
    E, St = "net/minecraft/world/entity/animal/sniffer/Sniffer", "net/minecraft/world/entity/animal/sniffer/Sniffer$State"
    owner, jn, _ = lookup.field(E, "entityData")
    so, sj, _ = lookup.field(E, "DATA_STATE")
    method_name, d = lookup.method_ref("net/minecraft/network/syncher/SynchedEntityData", "define", "(Lnet/minecraft/network/syncher/EntityDataAccessor;Ljava/lang/Object;)V")
    dc, dn, dd = lookup.method_owner(E, "defineSynchedData", "()V")
    return [f"newe {dotted(owner)}:{jn}", f"callin {dotted(dc)} {dn} {dd}", f"defenum {dotted(owner)}:{jn} {method_name} {d} {dotted(so)}:{sj} {dotted(lookup.类(St))} {'SEARCHING' if searching else 'IDLING'}"]


def _sniffer_per_group(r: random.Random, lookup: ReverseLookup, x: dict) -> tuple[list[str], dict, list[tuple[str, str]]]:
    E = "net/minecraft/world/entity/animal/sniffer/Sniffer"
    searching = r.random() < 0.4
    cmds, inputs = animation_states(r, lookup, E, ["diggingAnimationState", "sniffingAnimationState", "risingAnimationState", "feelingHappyAnimationState", "scentingAnimationState"], x["ageInTicks"])
    cmds += _sniffer_status(lookup, searching)
    # model.young：EntityModel 的字段，构造完就是 true，JVM 里没人改；isSearching() 是原版代码按 SynchedEntityData 里的状态算的，值就是我们设的
    inputs.update({"model.young": 1, "entity.isSearching()": int(searching)})
    return cmds, inputs, []


creatures = {
    # 网格根底下只有一个同样叫 root 的部件（模型的 root() 取里面这个），部件树.py 去掉外面一层
    "青蛙": Creature("net/minecraft/client/model/FrogModel", "net/minecraft/world/entity/animal/frog/Frog", prepare=_frog_prepare, per_group=_frog_per_group),
    "嗅探兽": Creature("net/minecraft/client/model/SnifferModel", "net/minecraft/world/entity/animal/sniffer/Sniffer", per_group=_sniffer_per_group),
    "监守者": Creature("net/minecraft/client/model/WardenModel", "net/minecraft/world/entity/monster/warden/Warden", per_group=_warden_per_group),
    "骆驼": Creature("net/minecraft/client/model/CamelModel", "net/minecraft/world/entity/animal/camel/Camel", prepare=_camel_prepare, per_group=_camel_per_group),
    # 构造里 Arrays.setAll 填 12 根棒子
    "烈焰人": Creature("net/minecraft/client/model/BlazeModel", "net/minecraft/world/entity/monster/Blaze", per_group=_blaze_per_group, entity_param_class="net/minecraft/world/entity/Entity"),
    # rotlerpRad（内建）、prepareMobModel 取翻滚量
    "蜜蜂": Creature("net/minecraft/client/model/BeeModel", "net/minecraft/world/entity/animal/Bee", prepare=_bee_prepare, per_group=_bee_per_group, with_prepare=True),
}


def random_params(r: random.Random) -> dict:
    return {
        "limbSwing": f32(r.uniform(0, 300)),
        "limbSwingAmount": f32(r.choice([0.0, r.uniform(0, 1), r.uniform(0, 1.5)])),
        "ageInTicks": f32(r.uniform(0, 30000)),
        "netHeadYaw": f32(r.uniform(-90, 90)),
        "headPitch": f32(r.uniform(-60, 60)),
        "partialTick": f32(r.random()),
    }


def _kobold_per_group(r: random.Random, lookup: ReverseLookup, x: dict) -> tuple[list[str], dict, list[tuple[str, str]]]:
    dm, dmd = lookup.method_ref("net/minecraft/world/entity/Entity", "setDeltaMovement", "(DDD)V")
    vy = r.choice([0.0, r.uniform(-0.6, 0.6)])
    double_hex = lambda d: format(struct.unpack(">Q", struct.pack(">d", d))[0], "x")  # noqa: E731
    return [f"call {dm} {dmd} {double_hex(0.0)} {double_hex(vy)} {double_hex(0.0)}"], {"entity.getDeltaMovement().y()": vy}, []


# Forge 1.20.1 的模组（运行时 SRG 名）：模组 jar + SRG 名客户端 + mcp_config 的 obf_to_srg.tsrg 配 client.txt
mod_creatures = {
    "暮色松鼠": Creature("twilightforest/client/model/entity/SquirrelModel", "twilightforest/entity/passive/Squirrel", layer_method="create"),
    # HumanoidModel 的子类，父类从 SRG 客户端里找；prepareMobModel 读实体的竖直速度
    "暮色狗头人": Creature("twilightforest/client/model/entity/KoboldModel", "twilightforest/entity/monster/Kobold", per_group=_kobold_per_group, with_prepare=True, layer_method="create"),
}


# 1.21.11（最后一个混淆的版本）：setupAnim 收渲染状态；JDK 21
new_version_creatures = {
    "苦力怕-1.21.11": Creature("net/minecraft/client/model/monster/creeper/CreeperModel", "", layer_class="net/minecraft/client/model/geom/builders/CubeDeformation:NONE", render_state=True),
    "烈焰人-1.21.11": Creature("net/minecraft/client/model/monster/blaze/BlazeModel", "", render_state=True),
}


@dataclass
class RealRunEnv:
    jdk: Path
    class_dir: Path
    jar_files: list[str]
    lib_paths: list[str]
    映射: str
    # 只给 JVM 的：SRG 名客户端只有类，Bootstrap 要的语言文件这些从原版客户端 jar 里拿（放最后，同名类以前面的为准）
    resources: list[str] = field(default_factory=list)


@pytest.fixture(scope="module")
def vanilla(tmp_path_factory: pytest.TempPathFactory) -> RealRunEnv:
    jdk = _jdk()
    if jdk is None:
        pytest.skip("没有 JDK 17")
    env = get_env()
    client = env["游戏"] / "缓存/client-1.20.1.jar"
    mapping_path = find_mapping(env)
    libs = lib_class_paths(env, "1.20.1")
    if not client.exists() or mapping_path is None or libs is None:
        pytest.skip(f"缺 client-1.20.1.jar / 官方映射 / Prism 的 1.20.1 库（{client}、{mapping_path}）")
    out = tmp_path_factory.mktemp("真跑")
    subprocess.run([str(jdk / "javac"), "-nowarn", "-cp", os.pathsep.join(libs), "-d", str(out), str(real_run_source)], check=True, capture_output=True)
    return RealRunEnv(jdk, out, [str(client)], libs, f"proguard:{mapping_path}")


@pytest.fixture(scope="module")
def twilight(vanilla: RealRunEnv) -> RealRunEnv:
    env = get_env()
    tf = env["游戏"] / "取材服务端/mods/twilightforest-1.20.1-4.3.2508-universal.jar"
    srg_client = env["游戏"] / "缓存/client-1.20.1-srg.jar"
    tsrg = Path(os.environ.get("ANIM_MCP_TSRG") or Path.home() / ".gradle/caches/forge_gradle/mcp_repo/de/oceanlabs/mcp/mcp_config/1.20.1/mcp_config-1.20.1-obf_to_srg.tsrg")
    if not (tf.exists() and srg_client.exists() and tsrg.exists()):
        pytest.skip(f"缺暮色森林 jar / SRG 名客户端 / obf_to_srg.tsrg（{tf}、{srg_client}、{tsrg}；tsrg 在 ForgeGradle 缓存里，可用 ANIM_MCP_TSRG 指定）")
    return RealRunEnv(vanilla.jdk, vanilla.class_dir, [str(tf), str(srg_client)], vanilla.lib_paths, f"srg:{tsrg},{vanilla.映射.partition(':')[2]}", resources=vanilla.jar_files)


@pytest.fixture(scope="module")
def new_version(vanilla: RealRunEnv) -> RealRunEnv:
    env = get_env()
    jdk = next((Path(d) / "bin" for d in (os.environ.get("JAVA21_HOME", ""), "/opt/homebrew/opt/openjdk@21", "/usr/lib/jvm/java-21-openjdk") if d and (Path(d) / "bin/java").exists()), None)
    client = env["游戏"] / "缓存/client-1.21.11.jar"
    # 1.21.11 的映射登记在 jars.toml（client-1.21.11-mappings），anim extract --download 下到 cache/映射/
    mapping_path = env["数据"] / "cache/映射/client-1.21.11-mappings.txt"
    libs = lib_class_paths(env, "1.21.11")
    if jdk is None or not client.exists() or not mapping_path.exists() or libs is None:
        pytest.skip(f"缺 JDK 21 / client-1.21.11.jar / 1.21.11 官方映射 / Prism 的 1.21.11 库（{client}、{mapping_path}）")
    return RealRunEnv(jdk, vanilla.class_dir, [str(client)], libs, f"proguard:{mapping_path}")


def run_jvm(env: RealRunEnv, command_lines: list[str]) -> list[str]:
    cp = os.pathsep.join([str(env.class_dir), *env.jar_files, *env.lib_paths, *env.resources])
    r = subprocess.run([str(env.jdk / "java"), "-cp", cp, "mcanim.RealPose"], input="\n".join(command_lines) + "\n", capture_output=True, text=True, timeout=600, cwd=env.class_dir)  # 游戏的 Bootstrap 会在当前目录建 logs/
    if r.returncode != 0 or "ERR " in r.stdout:
        raise AssertionError(f"JVM 跑挂了：{r.stdout[-3000:]}{r.stderr[-2000:]}")
    return r.stdout.splitlines()


def command_prefix(lookup: ReverseLookup, creature: Creature) -> list[str]:
    sc, bs = lookup.类("net/minecraft/SharedConstants"), lookup.类("net/minecraft/server/Bootstrap")
    tv, _ = lookup.method_ref("net/minecraft/SharedConstants", "tryDetectVersion", "()V")
    bb, _ = lookup.method_ref("net/minecraft/server/Bootstrap", "bootStrap", "()V")
    LD, MP = "net/minecraft/client/model/geom/builders/LayerDefinition", "net/minecraft/client/model/geom/ModelPart"
    param_class, _, param_field = (creature.layer_class or "").partition(":")
    cl, cld = lookup.method_ref(creature.model_class, creature.layer_method, f"({f'L{param_class};' if param_class else ''})L{LD};")
    layer_params = [f"{dotted(o)}:{jn}" for o, jn, _ in [lookup.field(param_class, param_field)]] if param_class else []
    br, brd = lookup.method_ref(LD, "bakeRoot", f"()L{MP};")
    part_fields = [lookup.field(MP, f)[1] for f in (*transform_fields, "visible")]
    ch = lookup.field(MP, "children")[1]
    rp, _ = lookup.method_ref(MP, "resetPose", "()V")
    return [
        f"boot {dotted(sc)} {tv} {dotted(bs)} {bb}",
        " ".join(["model", dotted(lookup.类(creature.model_class)), cl, cld, br, brd, *layer_params]),
        f"part {ch} {rp} {' '.join(part_fields)}",
        *([f"entity {dotted(lookup.类(creature.entity_class))}"] if creature.entity_class else []),
        *creature.prepare(lookup),
        "tree",
        "reset",
        "dump",
    ]


def read_pose(lines: list[str], i: int) -> tuple[dict, int]:
    out = {}
    while lines[i] != "END":
        v = lines[i].split()
        assert v[0] == "P", lines[i]
        out[v[1]] = {**{f: v[2 + k] for k, f in enumerate(transform_fields)}, "visible": int(v[11])}
        i += 1
    return out, i + 1


@pytest.mark.parametrize("creature_name", list(creatures))
def test_vanilla_creature_bitwise_equal_jvm(vanilla: RealRunEnv, creature_name: str) -> None:
    compare_to_real(vanilla, creature_name, creatures[creature_name])


@pytest.mark.parametrize("creature_name", list(mod_creatures))
def test_mod_creature_bitwise_equal_jvm(twilight: RealRunEnv, creature_name: str) -> None:
    compare_to_real(twilight, creature_name, mod_creatures[creature_name])


@pytest.mark.parametrize("creature_name", list(new_version_creatures))
def test_new_version_render_entry_bitwise_equal_jvm(new_version: RealRunEnv, creature_name: str) -> None:
    compare_to_real(new_version, creature_name, new_version_creatures[creature_name])


def compare_to_real(env: RealRunEnv, creature_name: str, creature: Creature) -> None:
    classpath = ClassPath(env.jar_files, read_mapping(env.映射))
    lookup = ReverseLookup(classpath)
    r = random.Random(creature_name)
    groups: list[tuple[dict, dict, list[str]]] = []
    command = command_prefix(lookup, creature)
    # 先翻：渲染状态入口的样例照程序的输入表给；部件树要不要取也看翻译时用没用到
    t = Translator(classpath, creature.model_class, creature.固定)
    prog = t.translate()
    if creature.render_state:
        render_entry = t.find_render_entry()
        assert render_entry is not None
        state_class = split_descriptor(render_entry[1].descriptor)[0][0][1:-1]
        sname, sd = lookup.method_ref(creature.model_class, "setupAnim", f"(L{state_class};)V")
        command.append(f"state {dotted(lookup.类(state_class))}")
        for _ in range(150):
            x: dict = {}
            cmds = []
            for k, meta in prog["输入"].items():
                assert k.startswith("state.") and k.count(".") == 1 and "(" not in k, f"样例只会设状态的字段：{k}"
                owner, jn, d = lookup.field(state_class, k[6:])
                x[k] = f32(r.choice([0.0, r.uniform(-1.5, 1.5), r.uniform(-300, 300)])) if meta["类型"] == "f" else r.randrange(2)
                cmds.append(f"sets {dotted(owner)}:{jn} {float_bits_hex(x[k]) if d == 'F' else x[k]}")
            groups.append((x, {}, []))
            command += cmds + ["reset", f"setups {sname} {sd}", "dump"]
    else:
        entity_class = creature.entity_param_class or creature.entity_class
        sname, sd = lookup.method_ref(creature.model_class, "setupAnim", f"(L{entity_class};FFFFF)V")
        pname, pd = lookup.method_ref(creature.model_class, "prepareMobModel", f"(L{entity_class};FFF)V") if creature.with_prepare else ("", "")
        for _ in range(150):
            x = random_params(r)
            cmds, inputs, queries = creature.per_group(r, lookup, x)
            groups.append((x, inputs, [n for n, _ in queries]))
            prepare_cmds = [f"prepare {pname} {pd} {' '.join(float_bits_hex(x[k]) for k in ('limbSwing', 'limbSwingAmount', 'partialTick'))}"] if creature.with_prepare else []
            command += cmds + [q for _, q in queries] + ["reset", *prepare_cmds, f"setup {sname} {sd} {' '.join(float_bits_hex(x[k]) for k in ('limbSwing', 'limbSwingAmount', 'ageInTicks', 'netHeadYaw', 'headPitch'))}", "dump"]
    lines = run_jvm(env, command)
    # 部件树（翻译器按名字找部件要它）、初始姿态
    tree: dict[str, list[str]] = {}
    i = 0
    if lines[0] == "T root -" and lines[1] == "T root root":  # 青蛙、嗅探兽：网格根外面多一层同名的 root，模型的 root() 是里面这个
        i = 1
        lines[1] = "T root -"
    while lines[i] != "END":
        _, n, p = lines[i].split()
        tree.setdefault(n, [])
        if p != "-":
            tree.setdefault(p, []).append(n)
        i += 1
    initial_pose, i = read_pose(lines, i + 1)
    initial = {n: {f: hex_to_float(d[f]) for f in transform_fields[:6]} for n, d in initial_pose.items()}
    # 不给部件树：翻译器从 createBodyLayer 具体跑出来（部件树.py），和 JVM 烤出来的树应该一样
    if t.model_tree is not None:  # 只有按名字找部件（关键帧动画）时才去取
        assert {k: sorted(v) for k, v in t.model_tree.items()} == {k: sorted(v) for k, v in tree.items()}
    # 关键帧动画的（HierarchicalModel）先整棵复位；蜜蜂那种「只在部分分支里写」的警告在这里不碍事：JVM 每组前也复位了，上一帧就是初始姿态
    # 1.21.2 起 EntityModel.setupAnim 一开头就 resetPose，整棵复位
    assert prog["复位"] == (creature.render_state or any(k.endswith(".lastTime") for k in prog["输入"])), prog["复位"]
    assert all("只在部分分支里写" in w for w in prog["警告"]), prog["警告"]
    anim_applied_count = 0
    cases: list[dict] = []
    for x, inputs, queries in groups:
        for n in queries:
            assert lines[i].startswith("Q "), lines[i]
            inputs[n] = hex_to_float(lines[i][2:])
            i += 1
        expected, i = read_pose(lines, i)
        given = {**x, **inputs}
        for k, meta in prog["输入"].items():
            if k not in given:
                raise AssertionError(f"程序要输入 {k}，样例没给：{meta}")
        v = evaluate(prog["节点"], given, initial)
        cases.append({"输入": {k: [prog["输入"][k]["类型"], _value_str(prog["输入"][k]["类型"], given[k])] for k in prog["输入"]}, "真值": {n: " ".join([*(d[f] for f in transform_fields), str(d["visible"])]) for n, d in expected.items()}})
        for part_name, d in expected.items():
            computed = {**{f: initial_pose[part_name][f] for f in transform_fields[:6]}, **{f: float_bits_hex(1.0) for f in transform_fields[6:]}, "visible": 1}
            for f, j in prog["输出"].get(part_name, {}).items():
                computed[f] = int(bool(v[j])) if f == "visible" else float_bits_hex(v[j])
            assert computed == d, f"{creature_name} {part_name}：翻译 {computed} ≠ JVM {d}，输入 {given}"
        # 样例真用上了关键帧动画：把动画状态全改成没开始，结果就该不一样
        frozen = {k: (LONG_MAX if k.endswith(".lastTime") else v) for k, v in given.items()}
        frozen_values = evaluate(prog["节点"], frozen, initial)
        anim_applied_count += any(float_bits_hex(frozen_values[j]) != float_bits_hex(v[j]) for part in prog["输出"].values() for f, j in part.items() if f != "visible")
    if any(k.endswith(".lastTime") for k in prog["输入"]):
        assert anim_applied_count > len(groups) // 4, anim_applied_count
    # TS 求值器拿同一份程序和真值再比一遍（engine/anim/姿态程序.真jar.test.ts）：程序几百 KB、真值来自 Mojang 的 jar，不进仓库，只写到给定目录
    if os.environ.get("ANIM_REAL_POSE_DUMP"):

        def make_part(n: str) -> dict:
            p = initial[n]
            return {"name": n, "pose": {"offset": [p["x"], p["y"], p["z"]], "rot": [p["xRot"], p["yRot"], p["zRot"]]}, "cubes": [], "children": [make_part(c) for c in tree.get(n, [])]}

        out = Path(os.environ["ANIM_REAL_POSE_DUMP"]) / f"{creature_name}.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({"程序": prog, "根": make_part("root"), "样例": cases}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
