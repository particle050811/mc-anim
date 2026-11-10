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

from .执行 import N, 不支持, 不透明, 对象, 堆态, 拆描述, 条件引用, 翻译器
from .映射 import 读映射
from .类文件 import 类路径

粒子基类 = "net/minecraft/client/particle/Particle"
面片类 = "net/minecraft/client/particle/SingleQuadParticle"
随机类 = "net/minecraft/util/RandomSource"
贴图组类 = "net/minecraft/client/particle/SpriteSet"
渲染类型 = "()Lnet/minecraft/client/particle/ParticleRenderType;"
createParticle参数 = ("type", "level", "x", "y", "z", "xd0", "yd0", "zd0")
# 每刻都变、跨刻带着走的状态：跑 tick 时读成输入，不拿构造时的值
状态字段 = ("age", "x", "y", "z", "xo", "yo", "zo", "xd", "yd", "zd", "onGround", "removed", "stoppedByCollision", "roll", "oRoll", "bb")
# 导出的构造字段（Particle、SingleQuadParticle 的官方名）
构造字段 = ("lifetime", "gravity", "friction", "quadSize", "hasPhysics", "rCol", "gCol", "bCol", "alpha", "xd", "yd", "zd", "roll", "speedUpWhenYMotionIsBlocked", "bbWidth", "bbHeight")


class 粒子翻译器(翻译器):
    def __init__(self, 路径: 类路径, Provider类: str, **k: Any):
        super().__init__(路径, Provider类, **k)
        self.随机号 = 0
        self.选帧记: list[tuple[str, str]] = []  # (阶段, 描述)
        self.阶段 = "构造"

    def 新随机(self, 名: str, t: str) -> N:
        self.随机号 += 1
        return self.输入(f"随机{self.随机号}:{名}", t, "随机")

    def 派发(self, 态: 堆态, kind: str, ref: Any, recv: Any, args: list) -> tuple[Any, 堆态]:
        _, ret = 拆描述(ref.描述)
        if kind == "static" and ref.类 == "java/lang/Math" and ref.名 == "random":
            return self.新随机("Math.random", "d"), 态
        if kind == "static" and ref.类 == 随机类 and ref.名 == "create":
            return 不透明("random", 随机类), 态
        if isinstance(recv, 不透明) and recv.类 and self.是子类(recv.类, 随机类) and ret in "FDIZJ":
            return self.新随机(f"{ref.名}{ref.描述}", ret.lower()), 态
        if isinstance(recv, (不透明, 条件引用)) and ref.类 == 贴图组类:
            self.选帧记.append((self.阶段, ref.描述))
        return super().派发(态, kind, ref, recv, args)

    # ---------- 入口 ----------
    def 翻译粒子(self) -> dict:
        prov = self.类(self.模型类)
        if prov is None:
            raise 不支持(f"jar 里没有 {self.模型类}")
        m = next((m for m in prov.方法们 if m.名 == "createParticle" and not m.访问 & 0x40), None)  # 跳过桥方法
        if m is None:
            raise 不支持(f"{self.模型类} 没有 createParticle")
        p对象 = 对象(self.模型类, self.新对象号())
        态 = 堆态()
        for f in prov.字段们:
            if f.描述 == f"L{贴图组类};":
                态.堆[(("对象", p对象.号), f.名)] = 不透明("sprites", 贴图组类)
        ps, _ = 拆描述(m.描述)
        args: list[Any] = [p对象]
        for i, p in enumerate(ps):
            名 = createParticle参数[i] if i < len(createParticle参数) else f"参{i}"
            args.append(self.输入(名, p.lower(), "参数") if p in ("D", "F", "I", "Z") else 不透明(名, p[1:-1] if p.startswith("L") else None))
        粒子, 态 = self.跑(prov, m, args, 态)
        if not isinstance(粒子, 对象) or not self.是子类(粒子.类, 粒子基类):
            raise 不支持(f"createParticle 返回的不是一个 Particle 子类的新对象：{粒子!r}")
        if not self.是子类(粒子.类, 面片类):
            # 直接继承 Particle、自己写 render 的（冲击波环、拖尾这类）不是一张朝镜头的贴图，粒子类那套接不上
            raise 不支持(f"{粒子.类} 不是 SingleQuadParticle（自己写 render），粒子类接不上")
        k = ("对象", 粒子.号)
        构造: dict[str, int] = {}
        # 固定的几个（没写过也导，是 Java 默认值 0）加上构造写过的别的数字段（FireParticle 的 reversed、ember、grow 这类子类自己的）
        另写 = sorted(f for (kk, f), v in 态.堆.items() if kk == k and isinstance(v, N) and f not in 构造字段 and f not in 状态字段)
        for 字段 in (*构造字段, *另写):
            d = self.字段描述(粒子.类, 字段)
            v = self._堆读(态, k, 字段, d) if d else None  # 没写过的是 Java 的默认值 0
            if isinstance(v, N):
                构造[字段] = v.id
        # 构造完的粒子：常量字段留着，其余换成输入
        态2 = 堆态()
        for (kk, 字段), v in 态.堆.items():
            if kk != k:
                continue
            if 字段 in 状态字段:
                continue
            态2.堆[(k, 字段)] = v if not isinstance(v, N) or self.g.是常量(v.id) else self.按描述输入(f"粒子.{字段}", self.字段描述(粒子.类, 字段) or v.t.upper(), "粒子")
        for 字段 in 状态字段:
            d = self.字段描述(粒子.类, 字段)
            if d:
                态2.堆[(k, 字段)] = self.按描述输入(f"粒子.{字段}", d, "粒子")
        self.阶段 = "每刻"
        found = self._必有(粒子.类, "tick", "()V")
        _, 态3 = self.跑(found[0], found[1], [粒子], 态2.复制())
        每刻: dict[str, int] = {}
        for (kk, 字段), v in 态3.堆.items():
            if kk == k and isinstance(v, N) and 态2.堆.get((k, 字段)) != v:
                每刻[字段] = v.id
        self.阶段 = "大小"
        pt = self.输入("partialTick", "f", "参数")
        found = self._必有(粒子.类, "getQuadSize", "(F)F")
        大小, _ = self.跑(found[0], found[1], [粒子, pt], 态2.复制())
        found = self.找方法(粒子.类, "getRenderType", 渲染类型)
        混合 = None
        if found is not None:
            r, _ = self.跑(found[0], found[1], [粒子], 态2.复制())
            混合 = r.路径 if isinstance(r, 不透明) else None
        移动类 = self._必有(粒子.类, "move", "(DDD)V")[0].名
        return self._导出(粒子.类, 构造, 每刻, 大小, 混合, 移动类)

    def _必有(self, 类名: str, 名: str, 描述: str) -> tuple[Any, Any]:
        found = self.找方法(类名, 名, 描述)
        if found is None:
            raise 不支持(f"{类名} 沿父类找不到 {名}{描述}（类路径里少了原版客户端？）")
        return found

    def _导出(self, 粒子类: str, 构造: dict[str, int], 每刻: dict[str, int], 大小: Any, 混合: str | None, 移动类: str) -> dict:
        if not isinstance(大小, N):
            raise 不支持(f"getQuadSize 返回的不是数：{大小!r}")
        roots = [*构造.values(), *每刻.values(), 大小.id]
        nodes, 新号 = self.g.导出(roots)
        用到 = {e[2] for e in nodes if e[0] == "in"}
        选帧 = None
        for 阶段, d in self.选帧记:
            if d == f"(L{随机类};)Lnet/minecraft/client/renderer/texture/TextureAtlasSprite;" and 阶段 == "构造":
                选帧 = 选帧 or "随机"
            elif d == "(II)Lnet/minecraft/client/renderer/texture/TextureAtlasSprite;" and 阶段 == "每刻":
                选帧 = "按年龄"
        常 = lambda i: self.g.常量值(i) if self.g.是常量(i) else None  # noqa: E731
        return {
            "格式": "粒子程序/1",
            "Provider": self.模型类.replace("/", "."),
            "粒子类": 粒子类.replace("/", "."),
            "输入": {k: v for k, v in self.输入表.items() if k in 用到},
            "节点": nodes,
            "构造": {f: 新号[i] for f, i in 构造.items()},
            "每刻": {f: 新号[i] for f, i in 每刻.items()},
            "大小": 新号[大小.id],
            # 读起来方便的一份（和节点表同义）：构造后是常量的字段、选帧、混合、move 是谁的（Particle 的才碰撞）
            "摘要": {
                "选帧": 选帧,
                "混合": 混合,
                "碰撞": bool(常(构造["hasPhysics"])) and 移动类 == 粒子基类 if "hasPhysics" in 构造 else None,
                "move": 移动类.replace("/", "."),
                **{f: 常(i) for f, i in 构造.items() if 常(i) is not None},
            },
            "式": {**{f"构造.{f}": 式(self.g, i) for f, i in 构造.items()}, **{f"每刻.{f}": 式(self.g, i) for f, i in 每刻.items()}, "大小": 式(self.g, 大小.id)},
            "警告": self.警告,
        }


def 式(g: Any, n: int, 深: int = 0) -> str:
    """节点读成中缀式（给人看；深的地方截成 …）"""
    e = g.节点[n]
    if e[0] == "c":
        return repr(e[2])
    if e[0] == "in":
        return e[2]
    if 深 > 10:
        return "…"
    子 = lambda i: 式(g, e[i], 深 + 1)  # noqa: E731
    if e[0] == "conv":
        return f"({e[1]}){子(2)}"
    if e[0] in ("neg", "not"):
        return f"{'-' if e[0] == 'neg' else '!'}{子(2)}"
    if e[0] == "sel":
        return f"({子(2)} ? {子(3)} : {子(4)})"
    if e[0] == "call":
        return f"{e[2].split('/')[-1].split('(')[0]}({', '.join(式(g, a, 深 + 1) for a in e[3:])})"
    if e[0] == "tab":
        return f"{e[2]}[{子(3)}]"
    return f"({子(2)} {e[0]} {子(3)})"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m anim_py.动作翻译.粒子", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("输出")
    ap.add_argument("类")
    ap.add_argument("--jar", required=True)
    ap.add_argument("--映射")
    ap.add_argument("--来源", help="写产物来源 JSON {输出文件: [跑到的类所在的 jar]}（anim extract 的 {产物来源}，文件已有就并进去）")
    a = ap.parse_args(argv)
    映射 = 读映射(a.映射)
    t = 粒子翻译器(类路径(a.jar.split(","), 映射), a.类.replace(".", "/"))
    try:
        prog = t.翻译粒子()
    except 不支持 as e:
        print(f"翻译不了 {a.类}：{e}", file=sys.stderr)
        return 2
    prog["来源"] = {"jar": [os.path.basename(j) for j in a.jar.split(",")], "映射": 映射.名称}
    os.makedirs(os.path.dirname(os.path.abspath(a.输出)), exist_ok=True)
    with open(a.输出, "w", encoding="utf-8") as f:
        json.dump(prog, f, ensure_ascii=False, indent=1)
        f.write("\n")
    if a.来源:
        # 按件记来源：只记跑到的类在哪些 jar 里（SRG 表只管换名，翻出来的东西里没有它的内容，不记）
        jars = a.jar.split(",")
        用到 = [j for j, z in zip(jars, t.路径.zips) if any(t.路径.改名.反查类(c) + ".class" in z.NameToInfo for c in t.用到的类)]
        旧 = json.load(open(a.来源, encoding="utf-8")) if os.path.exists(a.来源) else {}
        os.makedirs(os.path.dirname(os.path.abspath(a.来源)), exist_ok=True)
        with open(a.来源, "w", encoding="utf-8") as f:
            json.dump({**旧, os.path.normpath(a.输出): 用到}, f, ensure_ascii=False)
    print(f"{a.类} → {prog['粒子类']}：{json.dumps(prog['摘要'], ensure_ascii=False)} → {a.输出}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
