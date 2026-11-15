"""粒子翻译（anim_py/动作翻译/粒子.py）拿真 jar 翻 丁粒子.ts 手抄过的三种，逐项和手抄版对照。
手抄版的数在这里照抄一份（作品/亚波伦不放水/法术/演出/零件/丁粒子.ts，和出生处 霜冻新星.tsx、炎爆.tsx、丁云.ts），两边改了要一起改。
缺 Goety jar、SRG 名客户端、SRG 表、官方映射时跳过。
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import pytest

from anim_py.动作翻译.图 import f32, evaluate
from anim_py.动作翻译.映射 import read_mapping
from anim_py.动作翻译.类文件 import ClassPath
from anim_py.动作翻译.粒子 import ParticleTranslator

sys.path.insert(0, str(Path(__file__).parent))
from test_动作翻译真jar import find_mapping, get_env  # noqa: E402  # pyright: ignore[reportMissingImports]

srg_mapping_path = "取材服务端/libraries/de/oceanlabs/mcp/mcp_config/1.20.1-20230612.114412/mcp_config-1.20.1-20230612.114412-mappings-merged.txt"


@pytest.fixture(scope="module")
def translate():
    env = get_env()
    goety = env["游戏"] / "缓存/mods/goety-2.5.60.6.jar"
    srg_client = env["游戏"] / "缓存/client-1.20.1-srg.jar"
    mapping_table = next((p for p in (env["游戏"] / "缓存/mcp_config-1.20.1-mappings-merged.txt", env["游戏"] / srg_mapping_path) if p.exists()), None)
    official_mapping = find_mapping(env)
    if not (goety.exists() and srg_client.exists() and mapping_table and official_mapping):
        pytest.skip("缺 Goety jar / SRG 名客户端 / SRG 表 / 官方映射")
    mapping_spec = f"srg:{mapping_table},{official_mapping}"

    def go(provider: str) -> dict:
        return ParticleTranslator(ClassPath([str(goety), str(srg_client)], read_mapping(mapping_spec)), provider).translate_particles()

    return go


def eval_node(prog: dict, root_node: int, **given: float) -> float:
    inputs = {}
    for k, m in prog["输入"].items():
        v = given.get(k, 0.5)
        inputs[k] = int(v) if m["类型"] in "iz" else v
    return evaluate(prog["节点"], inputs, {})[root_node]


def test_frost_nova_is_vanilla_flame_particle(translate):
    p = translate("net/minecraft/client/particle/FlameParticle$Provider")
    s = p["摘要"]
    assert s["选帧"] == "随机"  # 手抄：选帧 随机
    assert s["friction"] == f32(0.96)  # 手抄：摩擦 0.96
    assert s["gravity"] == 0  # 手抄：没写重力（默认 0）
    assert s["碰撞"] is False  # 手抄：没给地面。hasPhysics 是 true，但 FlameParticle 覆写了 move、不碰撞
    assert (s["rCol"], s["gCol"], s["bCol"], s["alpha"]) == (1, 1, 1, 1)
    assert s["混合"] == "ParticleRenderType.PARTICLE_SHEET_OPAQUE"
    # 寿命：霜冻新星.tsx 出生处 Math.floor(8 / (rr() * 0.8 + 0.2)) + 4
    lifetime_node = p["构造"]["lifetime"]
    random_key = next(k for k in p["输入"] if k.endswith("Math.random") and p["式"]["构造.lifetime"].find(k) >= 0)
    for r in (0.0, 0.3, 0.99):
        assert eval_node(p, lifetime_node, **{random_key: r}) == math.floor(8 / (r * 0.8 + 0.2)) + 4
    # 半径：默认半径 = 0.1 × (r × 0.5 + 0.5) × 2
    nf = next(k for k in p["输入"] if "nextFloat" in k and k in p["式"]["构造.quadSize"])
    assert eval_node(p, p["构造"]["quadSize"], **{nf: 0.25}) == pytest.approx(0.1 * (0.25 * 0.5 + 0.5) * 2, rel=1e-6)
    # 大小：1 − (年龄 ÷ 寿命)² × 0.5，乘在半径上
    for age, fraction, lifetime in ((0, 0.0, 10), (3, 0.5, 10), (9, 0.9, 12)):
        got = eval_node(p, p["大小"], **{"粒子.quadSize": 1.0, "粒子.age": age, "partialTick": fraction, "粒子.lifetime": lifetime})
        assert got == pytest.approx(1 - ((age + fraction) / lifetime) ** 2 * 0.5, rel=1e-6)


@pytest.mark.parametrize("provider, 有色", [("FireParticle$ReversibleProvider", False), ("FireParticle$ColorProvider", True)])
def test_big_fire_cloud_is_fire_particle(translate, provider, colored):
    p = translate(f"com/Polarice3/Goety/client/particles/{provider}")
    s = p["摘要"]
    assert p["粒子类"] == "com.Polarice3.Goety.client.particles.FireParticle"
    assert s["选帧"] == "按年龄"  # 手抄：按年龄
    assert s["friction"] == f32(0.96)  # 手抄：摩擦 0.96
    assert s["gravity"] == 0 and s["ember"] == 0  # 手抄：没写重力；ember 才会每刻把重力改成 −0.1
    assert s["lifetime"] == 8  # 手抄：大火寿命 = 云片寿命 = 8
    assert s["碰撞"] is False and s["hasPhysics"] == 0  # 手抄：没给地面
    assert s["grow"] == 1.0  # getQuadSize 在 grow ≥ 1 时直接给 quadSize：手抄没写大小
    nf = next(k for k in p["输入"] if "nextFloat" in k and k in p["式"]["构造.quadSize"])
    assert eval_node(p, p["构造"]["quadSize"], **{nf: 0.25}) == pytest.approx(0.1 * (0.25 * 0.5 + 0.5) * 2 * 3, rel=1e-6)  # 默认半径 × 3
    assert eval_node(p, p["大小"], **{"粒子.quadSize": 0.7}) == pytest.approx(0.7)
    if colored:
        # ColorProvider 把 xd0、yd0、zd0 当颜色传进去：手抄 色 出生时给定
        assert [p["式"][f"构造.{c}"] for c in ("rCol", "gCol", "bCol")] == ["(f)xd0", "(f)yd0", "(f)zd0"]
        assert s["reversed"] == 0
    else:
        assert (s["rCol"], s["gCol"], s["bCol"]) == (1, 1, 1)
        # 已知差别：ReversibleProvider 出生时随机左右翻转贴图，手抄没做（丁粒子.ts 的注释写了）
        assert p["式"]["构造.reversed"].endswith("nextBoolean()Z")
