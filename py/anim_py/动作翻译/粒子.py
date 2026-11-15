"""粒子翻译：拿动作翻译的符号执行器跑粒子 Provider.createParticle（连带构造函数），再在造出来的粒子上跑 tick、getQuadSize，
把 engine 那边 粒子类（作品/亚波伦不放水/法术/演出/零件/粒子.tsx）要的常量和式子导出来。
- 随机（RandomSource 的 nextFloat 这些、Math.random）每调一次给一个新输入「随机<n>:<方法>」，次序就是 Java 里调的次序
- createParticle 的参数（x、y、z、xd0、yd0、zd0）是输入；level、粒子类型是不透明的
- SpriteSet 的调用记下来定选帧：get(RandomSource) = pickSprite = 随机；get(int, int) = setSpriteFromAge = 按年龄
- 每刻、大小在构造完的粒子上跑：构造后是常量的字段（摩擦、重力、ember 开关）照常量折掉，不是常量的（随机出的寿命、大小）和
  每刻都变的状态（age、位置、速度、onGround）读成输入「粒子.<字段>」
用法：python -m anim_py.动作翻译.粒子 <输出.json> <Provider 类> --jar <jar>[,<jar>…] [--映射 …]（映射写法同动作翻译）
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

from .执行 import N, Unsupported, Opaque, JavaObject, HeapState, split_descriptor, CondRef, Translator
from .映射 import read_mapping
from .类文件 import ClassPath

particle_base_class = "net/minecraft/client/particle/Particle"
quad_class = "net/minecraft/client/particle/SingleQuadParticle"
random_class = "net/minecraft/util/RandomSource"
texture_group_class = "net/minecraft/client/particle/SpriteSet"
render_type_desc = "()Lnet/minecraft/client/particle/ParticleRenderType;"
create_particle_params = ("type", "level", "x", "y", "z", "xd0", "yd0", "zd0")
# 每刻都变、跨刻带着走的状态：跑 tick 时读成输入，不拿构造时的值
state_fields = ("age", "x", "y", "z", "xo", "yo", "zo", "xd", "yd", "zd", "onGround", "removed", "stoppedByCollision", "roll", "oRoll", "bb")
# 导出的构造字段（Particle、SingleQuadParticle 的官方名）
construct_fields = ("lifetime", "gravity", "friction", "quadSize", "hasPhysics", "rCol", "gCol", "bCol", "alpha", "xd", "yd", "zd", "roll", "speedUpWhenYMotionIsBlocked", "bbWidth", "bbHeight")


class ParticleTranslator(Translator):
    def __init__(self, classpath: ClassPath, provider_class: str, **k: Any):
        super().__init__(classpath, provider_class, **k)
        self.random_counter = 0
        self.frame_records: list[tuple[str, str]] = []  # (阶段, 描述)
        self.phase = "构造"

    def new_random(self, random_label: str, t: str) -> N:
        self.random_counter += 1
        return self.input_node(f"随机{self.random_counter}:{random_label}", t, "随机")

    def dispatch_call(self, state: HeapState, kind: str, ref: Any, recv: Any, args: list) -> tuple[Any, HeapState]:
        _, ret = split_descriptor(ref.descriptor)
        if kind == "static" and ref.类 == "java/lang/Math" and ref.名 == "random":
            return self.new_random("Math.random", "d"), state
        if kind == "static" and ref.类 == random_class and ref.名 == "create":
            return Opaque("random", random_class), state
        if isinstance(recv, Opaque) and recv.类 and self.is_subclass(recv.类, random_class) and ret in "FDIZJ":
            return self.new_random(f"{ref.名}{ref.descriptor}", ret.lower()), state
        if isinstance(recv, (Opaque, CondRef)) and ref.类 == texture_group_class:
            self.frame_records.append((self.phase, ref.descriptor))
        return super().dispatch_call(state, kind, ref, recv, args)

    # ---------- 入口 ----------
    def translate_particles(self) -> dict:
        prov = self.类(self.model_class)
        if prov is None:
            raise Unsupported(f"jar 里没有 {self.model_class}")
        m = next((m for m in prov.method_list if m.名 == "createParticle" and not m.access_flags & 0x40), None)  # 跳过桥方法
        if m is None:
            raise Unsupported(f"{self.model_class} 没有 createParticle")
        particle_object = JavaObject(self.model_class, self.new_object_id())
        state = HeapState()
        for f in prov.fields:
            if f.descriptor == f"L{texture_group_class};":
                state.heap[(("对象", particle_object.serial), f.名)] = Opaque("sprites", texture_group_class)
        ps, _ = split_descriptor(m.descriptor)
        args: list[Any] = [particle_object]
        for i, p in enumerate(ps):
            param_name = create_particle_params[i] if i < len(create_particle_params) else f"参{i}"
            args.append(self.input_node(param_name, p.lower(), "参数") if p in ("D", "F", "I", "Z") else Opaque(param_name, p[1:-1] if p.startswith("L") else None))
        particle, state = self.run_method(prov, m, args, state)
        if not isinstance(particle, JavaObject) or not self.is_subclass(particle.类, particle_base_class):
            raise Unsupported(f"createParticle 返回的不是一个 Particle 子类的新对象：{particle!r}")
        if not self.is_subclass(particle.类, quad_class):
            # 直接继承 Particle、自己写 render 的（冲击波环、拖尾这类）不是一张朝镜头的贴图，粒子类那套接不上
            raise Unsupported(f"{particle.类} 不是 SingleQuadParticle（自己写 render），粒子类接不上")
        k = ("对象", particle.serial)
        constructor: dict[str, int] = {}
        # 固定的几个（没写过也导，是 Java 默认值 0）加上构造写过的别的数字段（FireParticle 的 reversed、ember、grow 这类子类自己的）
        other_fields = sorted(f for (kk, f), v in state.heap.items() if kk == k and isinstance(v, N) and f not in construct_fields and f not in state_fields)
        for field in (*construct_fields, *other_fields):
            d = self.field_descriptor(particle.类, field)
            v = self._heap_read(state, k, field, d) if d else None  # 没写过的是 Java 的默认值 0
            if isinstance(v, N):
                constructor[field] = v.id
        # 构造完的粒子：常量字段留着，其余换成输入
        fresh_state = HeapState()
        for (kk, field), v in state.heap.items():
            if kk != k:
                continue
            if field in state_fields:
                continue
            fresh_state.heap[(k, field)] = v if not isinstance(v, N) or self.g.is_constant(v.id) else self.input_by_desc(f"粒子.{field}", self.field_descriptor(particle.类, field) or v.t.upper(), "粒子")
        for field in state_fields:
            d = self.field_descriptor(particle.类, field)
            if d:
                fresh_state.heap[(k, field)] = self.input_by_desc(f"粒子.{field}", d, "粒子")
        self.phase = "每刻"
        found = self._must_find(particle.类, "tick", "()V")
        _, state_after_run = self.run_method(found[0], found[1], [particle], fresh_state.clone())
        per_tick: dict[str, int] = {}
        for (kk, field), v in state_after_run.heap.items():
            if kk == k and isinstance(v, N) and fresh_state.heap.get((k, field)) != v:
                per_tick[field] = v.id
        self.phase = "大小"
        pt = self.input_node("partialTick", "f", "参数")
        found = self._must_find(particle.类, "getQuadSize", "(F)F")
        size, _ = self.run_method(found[0], found[1], [particle, pt], fresh_state.clone())
        found = self.find_method(particle.类, "getRenderType", render_type_desc)
        blend = None
        if found is not None:
            r, _ = self.run_method(found[0], found[1], [particle], fresh_state.clone())
            blend = r.路径 if isinstance(r, Opaque) else None
        move_class = self._must_find(particle.类, "move", "(DDD)V")[0].名
        return self._export_particle(particle.类, constructor, per_tick, size, blend, move_class)

    def _must_find(self, class_name: str, member_name: str, descriptor: str) -> tuple[Any, Any]:
        found = self.find_method(class_name, member_name, descriptor)
        if found is None:
            raise Unsupported(f"{class_name} 沿父类找不到 {member_name}{descriptor}（类路径里少了原版客户端？）")
        return found

    def _export_particle(self, particle_class: str, constructor: dict[str, int], per_tick: dict[str, int], size: Any, blend: str | None, move_class: str) -> dict:
        if not isinstance(size, N):
            raise Unsupported(f"getQuadSize 返回的不是数：{size!r}")
        roots = [*constructor.values(), *per_tick.values(), size.id]
        nodes, new_ids = self.g.export_graph(roots)
        used_inputs = {e[2] for e in nodes if e[0] == "in"}
        frame_select = None
        for phase, d in self.frame_records:
            if d == f"(L{random_class};)Lnet/minecraft/client/renderer/texture/TextureAtlasSprite;" and phase == "构造":
                frame_select = frame_select or "随机"
            elif d == "(II)Lnet/minecraft/client/renderer/texture/TextureAtlasSprite;" and phase == "每刻":
                frame_select = "按年龄"
        const_of = lambda i: self.g.constant_of(i) if self.g.is_constant(i) else None  # noqa: E731
        return {
            "格式": "粒子程序/1",
            "Provider": self.model_class.replace("/", "."),
            "粒子类": particle_class.replace("/", "."),
            "输入": {k: v for k, v in self.input_table.items() if k in used_inputs},
            "节点": nodes,
            "构造": {f: new_ids[i] for f, i in constructor.items()},
            "每刻": {f: new_ids[i] for f, i in per_tick.items()},
            "大小": new_ids[size.id],
            # 读起来方便的一份（和节点表同义）：构造后是常量的字段、选帧、混合、move 是谁的（Particle 的才碰撞）
            "摘要": {
                "选帧": frame_select,
                "混合": blend,
                "碰撞": bool(const_of(constructor["hasPhysics"])) and move_class == particle_base_class if "hasPhysics" in constructor else None,
                "move": move_class.replace("/", "."),
                **{f: const_of(i) for f, i in constructor.items() if const_of(i) is not None},
            },
            "式": {**{f"构造.{f}": expr_of(self.g, i) for f, i in constructor.items()}, **{f"每刻.{f}": expr_of(self.g, i) for f, i in per_tick.items()}, "大小": expr_of(self.g, size.id)},
            "警告": self.warnings,
        }


def expr_of(g: Any, n: int, depth: int = 0) -> str:
    """节点读成中缀式（给人看；深的地方截成 …）"""
    e = g.graph_nodes[n]
    if e[0] == "c":
        return repr(e[2])
    if e[0] == "in":
        return e[2]
    if depth > 10:
        return "…"
    child_expr = lambda i: expr_of(g, e[i], depth + 1)  # noqa: E731
    if e[0] == "conv":
        return f"({e[1]}){child_expr(2)}"
    if e[0] in ("neg", "not"):
        return f"{'-' if e[0] == 'neg' else '!'}{child_expr(2)}"
    if e[0] == "sel":
        return f"({child_expr(2)} ? {child_expr(3)} : {child_expr(4)})"
    if e[0] == "call":
        return f"{e[2].split('/')[-1].split('(')[0]}({', '.join(expr_of(g, a, depth + 1) for a in e[3:])})"
    if e[0] == "tab":
        return f"{e[2]}[{child_expr(3)}]"
    return f"({child_expr(2)} {e[0]} {child_expr(3)})"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m anim_py.动作翻译.粒子", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("输出")
    ap.add_argument("类")
    ap.add_argument("--jar", required=True)
    ap.add_argument("--映射")
    ap.add_argument("--来源", help="写产物来源 JSON {输出文件: [跑到的类所在的 jar]}（anim extract 的 {产物来源}，文件已有就并进去）")
    a = ap.parse_args(argv)
    mapping = read_mapping(a.映射)
    t = ParticleTranslator(ClassPath(a.jar.split(","), mapping), a.类.replace(".", "/"))
    try:
        prog = t.translate_particles()
    except Unsupported as e:
        print(f"翻译不了 {a.类}：{e}", file=sys.stderr)
        return 2
    prog["来源"] = {"jar": [os.path.basename(j) for j in a.jar.split(",")], "映射": mapping.mapping_name}
    os.makedirs(os.path.dirname(os.path.abspath(a.输出)), exist_ok=True)
    with open(a.输出, "w", encoding="utf-8") as f:
        json.dump(prog, f, ensure_ascii=False, indent=1)
        f.write("\n")
    if a.来源:
        # 按件记来源：只记跑到的类在哪些 jar 里（SRG 表只管换名，翻出来的东西里没有它的内容，不记）
        jars = a.jar.split(",")
        used_jars = [j for j, z in zip(jars, t.路径.zips) if any(t.路径.renamer.reverse_lookup_class(c) + ".class" in z.NameToInfo for c in t.used_classes)]
        existing = json.load(open(a.来源, encoding="utf-8")) if os.path.exists(a.来源) else {}
        os.makedirs(os.path.dirname(os.path.abspath(a.来源)), exist_ok=True)
        with open(a.来源, "w", encoding="utf-8") as f:
            json.dump({**existing, os.path.normpath(a.输出): used_jars}, f, ensure_ascii=False)
    print(f"{a.类} → {prog['粒子类']}：{json.dumps(prog['摘要'], ensure_ascii=False)} → {a.输出}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
