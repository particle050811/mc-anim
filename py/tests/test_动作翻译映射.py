"""动作翻译的名字映射：client.txt（ProGuard）和三种 tsrg（SRG）都换回官方名。表是照真文件的格式手写的小样，不含 Mojang 的映射内容。
真 jar 上的核对（client-1.20.1-srg.jar 配这三种表翻出的苦力怕、僵尸和 ProGuard 版一样）记在 docs/决策/0007-字节码翻译动作.md。
"""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from anim_py.动作翻译.映射 import ProGuardMapping, SrgMapping, read_mapping, IdentityMapping

CLIENT_TXT = """\
# {"fileName":"client.txt","id":"sourceFile"}
net.minecraft.client.model.geom.ModelPart -> fee:
    float xRot -> d
    java.util.Map children -> m
    12:13:void resetPose() -> a
    20:20:net.minecraft.client.model.geom.ModelPart getChild(java.lang.String) -> a
net.minecraft.world.entity.Entity -> bfj:
    boolean onGround -> y
    1:1:boolean isOnFire() -> bN
net.minecraft.client.model.EntityModel -> ehv:
    float attackTime -> c
    30:30:void setupAnim(net.minecraft.world.entity.Entity,float,float,float,float,float) -> a
net.minecraft.client.model.CreeperModel -> egu:
    net.minecraft.client.model.geom.ModelPart head -> b
net.minecraft.client.main.Main -> net.minecraft.client.main.Main:
"""

# mcp_config 的 obf_to_srg.tsrg（tsrg：类行两列，字段两列，方法三列）
TSRG_V1 = """\
fee net/minecraft/src/C_1_
\td f_104203_
\tm f_104213_
\ta ()V m_233569_
\ta (Ljava/lang/String;)Lfee; m_171324_
bfj net/minecraft/src/C_2_
\ty f_19861_
\tbN ()Z m_6060_
ehv net/minecraft/src/C_3_
\tc f_102608_
\ta (Lbfj;FFFFF)V m_6973_
"""

# mcp_config 的 config/joined.tsrg（tsrg2「obf srg id」：字段行三列，方法行四列，参数行两个制表符）
TSRG2_OBF = """\
tsrg2 obf srg id
fee net/minecraft/src/C_1_ 1
\td f_104203_ 104203
\tm f_104213_ 104213
\ta ()V m_233569_ 233569
\ta (Ljava/lang/String;)Lfee; m_171324_ 171324
\t\t0 o p_171325_ 171325
bfj net/minecraft/src/C_2_ 2
\ty f_19861_ 19861
\tbN ()Z m_6060_ 6060
ehv net/minecraft/src/C_3_ 3
\tc f_102608_ 102608
\ta (Lbfj;FFFFF)V m_6973_ 6973
\t\tstatic
"""

# ForgeGradle 的 build/createMcpToSrg/output.tsrg（tsrg2「left right」：官方名 → SRG）
tsrg2_official = """\
tsrg2 left right
net/minecraft/client/main/Main net/minecraft/client/main/Main
\tmain ([Ljava/lang/String;)V main
net/minecraft/client/model/geom/ModelPart net/minecraft/client/model/geom/ModelPart
\txRot f_104203_
\tchildren f_104213_
\t<init> (Ljava/util/List;Ljava/util/Map;)V <init>
\tresetPose ()V m_233569_
\tgetChild (Ljava/lang/String;)Lnet/minecraft/client/model/geom/ModelPart; m_171324_
\t\t0 p_171325_ p_171325_
net/minecraft/world/entity/Entity net/minecraft/world/entity/Entity
\tonGround f_19861_
\tisOnFire ()Z m_6060_
net/minecraft/client/model/EntityModel net/minecraft/client/model/EntityModel
\tattackTime f_102608_
\tsetupAnim (Lnet/minecraft/world/entity/Entity;FFFFF)V m_6973_
"""

srg_expected = {
    ("字段", "f_104203_"): "xRot",
    ("字段", "f_104213_"): "children",
    ("字段", "f_19861_"): "onGround",
    ("字段", "f_102608_"): "attackTime",
    ("方法", "m_233569_"): "resetPose",
    ("方法", "m_171324_"): "getChild",
    ("方法", "m_6060_"): "isOnFire",
    ("方法", "m_6973_"): "setupAnim",
}


@pytest.fixture
def client(tmp_path: Path) -> Path:
    p = tmp_path / "client.txt"
    p.write_text(CLIENT_TXT, encoding="utf-8")
    return p


class FakePath:
    """映射沿类层级找成员时要的 原始类：egu（CreeperModel）的父类是 ehv（EntityModel）"""

    def raw_class(self, class_name: str):
        return {"egu": SimpleNamespace(parent_class="ehv", is_interface=[]), "ehv": SimpleNamespace(parent_class="java/lang/Object", is_interface=[])}.get(class_name)


def test_proguard_names_revert_and_search_parent(client: Path) -> None:
    m = ProGuardMapping(str(client))
    m.bind_path(FakePath())
    assert m.类("fee") == "net/minecraft/client/model/geom/ModelPart"
    assert m.reverse_lookup_class("net/minecraft/client/model/CreeperModel") == "egu"
    assert m.类("[Lfee;") == "[Lnet/minecraft/client/model/geom/ModelPart;"
    assert m.map_descriptor("(Lbfj;FFFFF)V") == "(Lnet/minecraft/world/entity/Entity;FFFFF)V"
    assert m.field("fee", "d", "F") == "xRot"
    assert m.field("fee", "m", "Ljava/util/Map;") == "children"
    # 同名不同描述符的方法分得开
    assert m.method_ref("fee", "a", "()V") == "resetPose"
    assert m.method_ref("fee", "a", "(Ljava/lang/String;)Lfee;") == "getChild"
    # 子类里引用父类的成员（字节码写的所属类是 egu）
    assert m.method_ref("egu", "a", "(Lbfj;FFFFF)V") == "setupAnim"
    assert m.field("egu", "c", "F") == "attackTime"
    # 没混淆的类、JDK 的成员原样
    assert m.类("net/minecraft/client/main/Main") == "net/minecraft/client/main/Main"
    assert m.method_ref("java/lang/Math", "sin", "(D)D") == "sin"


@pytest.mark.parametrize("table_name, content, with_client", [("tsrg", TSRG_V1, True), ("tsrg2-obf", TSRG2_OBF, True), ("tsrg2-官方", tsrg2_official, False), ("tsrg2-官方+client", tsrg2_official, True)])
def test_srg_three_tables_revert_to_official(tmp_path: Path, client: Path, table_name: str, content: str, with_client: bool) -> None:
    t = tmp_path / f"{table_name}.tsrg"
    t.write_text(content, encoding="utf-8")
    m = read_mapping(f"srg:{t},{client}" if with_client else f"srg:{t}")
    assert isinstance(m, SrgMapping)
    for (kind, srg), official in srg_expected.items():
        got = m.field("任意类", srg, "F") if kind == "字段" else m.method_ref("任意类", srg, "()V")
        assert got == official, f"{table_name}：{srg} → {got}，应为 {official}"
    # 不在表里的名字（JDK 方法、没改名的覆写）原样
    assert m.method_ref("java/lang/Math", "sin", "(D)D") == "sin"
    assert m.method_ref("x", "main", "([Ljava/lang/String;)V") == "main"
    # 运行时类名已是官方名
    assert m.类("net/minecraft/client/model/geom/ModelPart") == "net/minecraft/client/model/geom/ModelPart"


def test_read_mapping_form(client: Path) -> None:
    assert isinstance(read_mapping(None), IdentityMapping)
    assert isinstance(read_mapping("恒等"), IdentityMapping)
    assert isinstance(read_mapping(f"proguard:{client}"), ProGuardMapping)
    with pytest.raises(ValueError, match="不认识的映射"):
        read_mapping("yarn:x")
