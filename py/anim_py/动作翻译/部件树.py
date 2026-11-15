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
    from .执行 import Translator

layer_def_class = "net/minecraft/client/model/geom/builders/LayerDefinition"


def methods_from_layer_def(t: Translator, method_name: str | None = None) -> list[str]:
    c = t.类(t.model_class)
    if c is None:
        return []
    return [m.名 for m in c.method_list if m.access_flags & ACC_STATIC and m.descriptor == f"()L{layer_def_class};" and (method_name is None or m.名 == method_name)]


def tree_from_layer_def(t: Translator, method_name: str | None = None) -> dict[str, list[str]]:
    """{部件名: [子部件名…]}，根叫 root；找不到唯一的无参层定义方法、或者跑不了时抛 不支持"""
    from .执行 import Unsupported, HeapState, Translator

    names = methods_from_layer_def(t, method_name)
    if len(names) != 1:
        raise Unsupported(f"{t.model_class} 里无参、返回 LayerDefinition 的静态方法有 {len(names)} 个（{'、'.join(names) or '没有'}），认不出部件树：给 --模型，或 --层 <方法名>")
    runner = Translator(t.路径, t.model_class)
    c = runner.类(runner.model_class)
    assert c is not None
    m = c.find_method(names[0], f"()L{layer_def_class};")
    assert m is not None
    try:
        layer, state = runner.run_method(c, m, [], HeapState())
    except Unsupported as e:
        raise Unsupported(f"从 {names[0]}() 取部件树：{e}") from e

    def read_field(o: Any, field: str) -> Any:
        return runner.read_field(state, o, field, "L")

    tree: dict[str, list[str]] = {}

    def walk(pd: Any, name: str) -> None:
        if name in tree:
            raise Unsupported(f"层定义里部件名 {name} 出现了两次（按名字找部件时取哪个看遍历序，没做）")
        children = runner._iter_order(state, read_field(pd, "children"))
        tree[name] = [k for k, _ in children]
        for k, x in children:
            walk(x, k)

    root = read_field(read_field(layer, "mesh"), "root")
    # 青蛙、嗅探兽：网格根底下只挂一个同样叫 root 的部件，模型的 root() 取的是里面这个（构造里 getChild("root")）。
    # 外面一层谁也不摆姿态、也不会被按名字找到（getAnyDescendantWithName("root") 直接给 root()），树从里面这个起算
    only_child = runner._iter_order(state, read_field(root, "children"))
    if len(only_child) == 1 and only_child[0][0] == "root":
        root = only_child[0][1]
    walk(root, "root")
    return tree
