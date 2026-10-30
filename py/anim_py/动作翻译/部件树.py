"""不给 --模型 时，从模型类自己的层定义（createBodyLayer 这类 `static LayerDefinition xxx()`）具体跑出部件树。
关键帧动画按名字找部件（HierarchicalModel.getAnyDescendantWithName）要知道有哪些部件；造模型时只 getChild 了几个，剩下的只在层定义里。
跑法：另开一个翻译器（不碰正在翻的那个的图和对象号），MeshDefinition / PartDefinition / CubeListBuilder 照字节码具体跑，
集合走 库类.py；跑完沿 LayerDefinition.mesh.root.children 读出树。子部件的顺序照 HashMap 的遍历序（bake 时就是这么拷进 ModelPart 的）。
只认无参的：带参数的（HumanoidModel.createMesh(CubeDeformation, float)）参数是什么得调用方说，用 --层 <方法名> 指定也只限无参。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from .类文件 import ACC_STATIC

if TYPE_CHECKING:
    from .执行 import 翻译器

层定义类 = "net/minecraft/client/model/geom/builders/LayerDefinition"


def 层定义方法(t: 翻译器, 方法名: str | None = None) -> list[str]:
    c = t.类(t.模型类)
    if c is None:
        return []
    return [m.名 for m in c.方法们 if m.访问 & ACC_STATIC and m.描述 == f"()L{层定义类};" and (方法名 is None or m.名 == 方法名)]


def 从层定义取树(t: 翻译器, 方法名: str | None = None) -> dict[str, list[str]]:
    """{部件名: [子部件名…]}，根叫 root；找不到唯一的无参层定义方法、或者跑不了时抛 不支持"""
    from .执行 import 不支持, 堆态, 翻译器

    名们 = 层定义方法(t, 方法名)
    if len(名们) != 1:
        raise 不支持(f"{t.模型类} 里无参、返回 LayerDefinition 的静态方法有 {len(名们)} 个（{'、'.join(名们) or '没有'}），认不出部件树：给 --模型，或 --层 <方法名>")
    跑者 = 翻译器(t.路径, t.模型类)
    c = 跑者.类(跑者.模型类)
    assert c is not None
    m = c.找方法(名们[0], f"()L{层定义类};")
    assert m is not None
    try:
        层, 态 = 跑者.跑(c, m, [], 堆态())
    except 不支持 as e:
        raise 不支持(f"从 {名们[0]}() 取部件树：{e}") from e

    def 读(o: Any, 字段: str) -> Any:
        return 跑者.读字段(态, o, 字段, "L")

    树: dict[str, list[str]] = {}

    def 走(pd: Any, 名: str) -> None:
        if 名 in 树:
            raise 不支持(f"层定义里部件名 {名} 出现了两次（按名字找部件时取哪个看遍历序，没做）")
        子们 = 跑者._遍历序(态, 读(pd, "children"))
        树[名] = [k for k, _ in 子们]
        for k, x in 子们:
            走(x, k)

    走(读(读(层, "mesh"), "root"), "root")
    return 树
