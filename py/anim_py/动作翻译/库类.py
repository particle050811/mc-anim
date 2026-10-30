"""翻译器碰到的 Java 库类照语义具体执行（它们不在游戏 jar 里，没字节码可跑）：java.util 的 ArrayList、HashMap、迭代器、Optional，
Guava 的 ImmutableList、Lists、Maps，java.util.Arrays 的 asList、setAll。
用途：构造函数里把部件存进 ImmutableList（监守者）、Arrays.setAll 填部件数组（烈焰人）；关键帧动画定义的静态初始化
（AnimationDefinition.Builder 往 HashMap 里塞 ArrayList）和 KeyframeAnimations.animate 遍历它们。
- 内容存在堆里（字段 "$值"，元组），改动就换一个新元组：符号分支两边各改各的，汇合时两边一样才合得起来，不一样报不支持
- 下标、键都要是常量；元素可以是任何值（部件、对象、符号数）
- HashMap 的遍历顺序照 OpenJDK 8 起的实现：String.hashCode、高 16 位扰动、按桶、桶内按插入先后（没做树化：一个桶 8 个以上才树化，原版动画没有）
"""

from __future__ import annotations

from typing import Any

列表 = "java/util/ArrayList"
不变列表 = "com/google/common/collect/ImmutableList"
哈希表 = "java/util/HashMap"
有序表 = "java/util/LinkedHashMap"
视图 = "java/util/$视图"  # entrySet()、keySet()、values() 取的那一刻的快照（遍历中途改表在 Java 里本来就抛 ConcurrentModificationException）
条目 = "java/util/$条目"
迭代器 = "java/util/$迭代器"
可选 = "java/util/Optional"
库对象类 = {列表, 不变列表, 哈希表, 有序表, 视图, 条目, 迭代器, 可选}
_表类 = {哈希表, 有序表}
_序列类 = {列表, 不变列表, 视图}


def java_hash(s: str) -> int:
    h = 0
    b = s.encode("utf-16-be")
    for i in range(0, len(b), 2):
        h = (31 * h + (b[i] << 8 | b[i + 1])) & 0xFFFFFFFF
    return h


def 哈希表顺序(键们: list[Any]) -> list[int] | None:
    """HashMap 遍历时各键的插入序号；键不全是字符串（身份哈希，Java 里本来就不定）返回 None"""
    if not all(isinstance(k, str) for k in 键们):
        return None
    cap = 16
    while len(键们) > cap * 3 // 4:
        cap *= 2

    def 桶(k: str) -> int:
        h = java_hash(k)
        return (h ^ (h >> 16)) & (cap - 1)

    return sorted(range(len(键们)), key=lambda i: (桶(键们[i]), i))


def 键等(a: Any, b: Any) -> bool:
    if isinstance(a, str) or isinstance(b, str):
        return a == b
    return a is b


class 库模拟:
    """混进 翻译器：self 是 翻译器（标成 Any：pyright 不许把 self 标成子类）"""

    def 新库对象(self: Any, 态: Any, 类: str, 值: Any) -> Any:
        from .执行 import 对象

        o = 对象(类, self.新对象号())
        self.写字段(态, o, "$值", 值, "L")
        return o

    def 库值(self: Any, 态: Any, o: Any) -> Any:
        from .执行 import 不支持

        v = self.读字段(态, o, "$值", "L")
        if v is None:
            raise 不支持(f"{o.类} 的内容丢了（在符号分支里新建的集合？）")
        if not isinstance(v, tuple):
            raise 不支持(f"{o.类} 在符号分支两边改得不一样")
        return v

    def 是库对象(self: Any, o: Any) -> bool:
        from .执行 import 对象

        return isinstance(o, 对象) and o.类 in 库对象类

    def _元素们(self: Any, 态: Any, x: Any) -> list:
        """Collection / Iterable / 数组 的元素"""
        from .执行 import 不支持, 数组

        if isinstance(x, 数组):
            return list(x.元素)
        if self.是库对象(x) and x.类 in _序列类:
            return list(self.库值(态, x))
        if self.是库对象(x) and x.类 in _表类:
            raise 不支持("把 Map 当 Collection 用")
        raise 不支持(f"不是集合：{x!r}")

    def _遍历序(self: Any, 态: Any, 表: Any) -> list[tuple]:
        对们 = list(self.库值(态, 表))
        if 表.类 == 有序表:
            return 对们
        序 = 哈希表顺序([k for k, _ in 对们])
        if 序 is None:
            w = "HashMap 的键不全是字符串，遍历顺序按插入先后（Java 里按身份哈希，本来就不定）"
            if w not in self.警告:
                self.警告.append(w)
            return 对们
        return [对们[i] for i in 序]

    # ---------- 静态方法、构造 ----------
    def 库静态(self: Any, 态: Any, 类: str, 名: str, 描述: str, args: list) -> tuple[bool, Any, Any]:
        from .执行 import 不支持, 不透明, 拆描述, 数组, 条件引用

        ps, _ = 拆描述(描述)
        if 类 in (不变列表, "java/util/List") and 名 == "of":
            元素 = list(args)
            if ps and ps[-1] == "[Ljava/lang/Object;":  # of(e1, …, e11, E... 其余)、List.of(E...)
                尾 = 元素.pop()
                元素.extend(self._元素们(态, 尾))
            return True, self.新库对象(态, 不变列表, tuple(元素)), 态
        if 类 == 不变列表 and 名 == "copyOf":
            return True, self.新库对象(态, 不变列表, tuple(self._元素们(态, args[0]))), 态
        if 类 in ("com/google/common/collect/Lists", "org/apache/commons/compress/utils/Lists") and 名 == "newArrayList":  # 1.20.1 的 AnimationDefinition.Builder 用的是后者
            元素 = self._元素们(态, args[0]) if args else []
            return True, self.新库对象(态, 列表, tuple(元素)), 态
        if 类 == "java/util/Arrays" and 名 == "asList":
            return True, self.新库对象(态, 列表, tuple(self._元素们(态, args[0]))), 态
        if 类 == "com/google/common/collect/Maps" and 名 in ("newHashMap", "newLinkedHashMap") and not args:
            return True, self.新库对象(态, 哈希表 if 名 == "newHashMap" else 有序表, ()), 态
        if 类 == "java/util/Arrays" and 名 == "setAll" and 描述 == "([Ljava/lang/Object;Ljava/util/function/IntFunction;)V":
            arr, fn = args
            if not isinstance(arr, 数组):
                raise 不支持(f"Arrays.setAll 的数组是 {arr!r}")
            for k in range(len(arr.元素)):
                v, 态 = self.调闭包(态, fn, [self.常("i", k)])
                arr.元素[k] = v
            return True, None, 态
        if 类 == 可选 and 名 in ("of", "ofNullable", "empty"):
            v = args[0] if args else None
            if 名 == "ofNullable" and isinstance(v, (不透明, 条件引用)):
                raise 不支持("Optional.ofNullable 的值说不定是不是 null")
            return True, self.新库对象(态, 可选, (v is not None, v)), 态
        return False, None, 态

    def 库构造(self: Any, 态: Any, 类: str, 描述: str, recv: Any, args: list) -> bool:
        if 类 in (列表, 哈希表, 有序表) and 描述 in ("()V", "(I)V"):
            self.写字段(态, recv, "$值", (), "L")
            return True
        if 类 == 列表 and 描述 == "(Ljava/util/Collection;)V":
            self.写字段(态, recv, "$值", tuple(self._元素们(态, args[0])), "L")
            return True
        return False

    # ---------- 实例方法 ----------
    def 库方法(self: Any, 态: Any, 名: str, 描述: str, o: Any, args: list) -> tuple[Any, Any]:
        from .执行 import 不支持

        g = self.g
        类 = o.类
        if 类 in _序列类:
            v = self.库值(态, o)
            if 名 == "size":
                return self.常("i", len(v)), 态
            if 名 == "isEmpty":
                return self.常("i", int(not v)), 态
            if 名 == "get" and 描述 == "(I)Ljava/lang/Object;":
                i = self.数(args[0])
                if not g.是常量(i.id):
                    raise 不支持("List.get 的下标是符号")
                return v[g.常量值(i.id)], 态
            if 名 == "add" and 描述 == "(Ljava/lang/Object;)Z":
                if 类 != 列表:
                    raise 不支持(f"往不可变的 {类} 里加")
                self.写字段(态, o, "$值", v + (args[0],), "L")
                return self.常("i", 1), 态
            if 名 == "iterator":
                it = self.新库对象(态, 迭代器, v)
                self.写字段(态, it, "$位", 0, "L")
                return it, 态
            if 名 == "forEach":
                for x in v:
                    _, 态 = self.调闭包(态, args[0], [x])
                return None, 态
            if 名 == "contains":
                return self.常("i", int(any(键等(x, args[0]) for x in v))), 态
        if 类 in _表类:
            v = self.库值(态, o)
            if 名 == "size":
                return self.常("i", len(v)), 态
            if 名 in ("get", "containsKey"):
                for k, x in v:
                    if 键等(k, args[0]):
                        return (x if 名 == "get" else self.常("i", 1)), 态
                return (None if 名 == "get" else self.常("i", 0)), 态
            if 名 == "put":
                旧 = None
                新 = []
                for k, x in v:
                    if 键等(k, args[0]):
                        旧 = x
                        新.append((k, args[1]))
                    else:
                        新.append((k, x))
                if 旧 is None and not any(键等(k, args[0]) for k, _ in v):
                    新.append((args[0], args[1]))
                self.写字段(态, o, "$值", tuple(新), "L")
                return 旧, 态
            if 名 == "computeIfAbsent":
                for k, x in v:
                    if 键等(k, args[0]) and x is not None:
                        return x, 态
                x, 态 = self.调闭包(态, args[1], [args[0]])
                if x is not None:
                    self.写字段(态, o, "$值", tuple((k, y) for k, y in v if not 键等(k, args[0])) + ((args[0], x),), "L")
                return x, 态
            if 名 == "entrySet":
                return self.新库对象(态, 视图, tuple(self.新库对象(态, 条目, (k, x)) for k, x in self._遍历序(态, o))), 态
            if 名 == "keySet":
                return self.新库对象(态, 视图, tuple(k for k, _ in self._遍历序(态, o))), 态
            if 名 == "values":
                return self.新库对象(态, 视图, tuple(x for _, x in self._遍历序(态, o))), 态
            if 名 == "forEach":
                for k, x in self._遍历序(态, o):
                    _, 态 = self.调闭包(态, args[0], [k, x])
                return None, 态
        if 类 == 条目:
            k, x = self.库值(态, o)
            if 名 == "getKey":
                return k, 态
            if 名 == "getValue":
                return x, 态
        if 类 == 迭代器:
            v = self.库值(态, o)
            位 = self.读字段(态, o, "$位", "L")
            if 名 == "hasNext":
                return self.常("i", int(位 < len(v))), 态
            if 名 == "next":
                if 位 >= len(v):
                    raise 不支持("迭代器越界（NoSuchElementException）")
                self.写字段(态, o, "$位", 位 + 1, "L")
                return v[位], 态
        if 类 == 可选:
            有, x = self.库值(态, o)
            if 名 == "isPresent":
                return self.常("i", int(有)), 态
            if 名 == "isEmpty":
                return self.常("i", int(not 有)), 态
            if 名 == "get" or 名 == "orElseThrow" and not args:
                if not 有:
                    raise 不支持("Optional.get 取空的")
                return x, 态
            if 名 == "orElse":
                return (x if 有 else args[0]), 态
            if 名 == "ifPresent":
                if 有:
                    _, 态 = self.调闭包(态, args[0], [x])
                return None, 态
            if 名 == "map":
                if not 有:
                    return o, 态
                y, 态 = self.调闭包(态, args[0], [x])
                return self.新库对象(态, 可选, (y is not None, y)), 态
        raise 不支持(f"库类 {类} 上的 {名}{描述} 没实现")
