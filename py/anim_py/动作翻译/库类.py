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

ARRAY_LIST_CLASS = "java/util/ArrayList"
IMMUTABLE_LIST_CLASS = "com/google/common/collect/ImmutableList"
HASH_MAP_CLASS = "java/util/HashMap"
LINKED_HASH_MAP_CLASS = "java/util/LinkedHashMap"
view_class = "java/util/$视图"  # entrySet()、keySet()、values() 取的那一刻的快照（遍历中途改表在 Java 里本来就抛 ConcurrentModificationException）
entry_class = "java/util/$条目"
iterator_class = "java/util/$迭代器"
OPTIONAL_CLASS = "java/util/Optional"
lib_object_classes = {ARRAY_LIST_CLASS, IMMUTABLE_LIST_CLASS, HASH_MAP_CLASS, LINKED_HASH_MAP_CLASS, view_class, entry_class, iterator_class, OPTIONAL_CLASS}
_table_classes = {HASH_MAP_CLASS, LINKED_HASH_MAP_CLASS}
_seq_classes = {ARRAY_LIST_CLASS, IMMUTABLE_LIST_CLASS, view_class}


def java_hash(s: str) -> int:
    h = 0
    b = s.encode("utf-16-be")
    for i in range(0, len(b), 2):
        h = (31 * h + (b[i] << 8 | b[i + 1])) & 0xFFFFFFFF
    return h


def hash_table_order(keys: list[Any]) -> list[int] | None:
    """HashMap 遍历时各键的插入序号；键不全是字符串（身份哈希，Java 里本来就不定）返回 None"""
    if not all(isinstance(k, str) for k in keys):
        return None
    cap = 16
    while len(keys) > cap * 3 // 4:
        cap *= 2

    def bucket(k: str) -> int:
        h = java_hash(k)
        return (h ^ (h >> 16)) & (cap - 1)

    return sorted(range(len(keys)), key=lambda i: (bucket(keys[i]), i))


def key_equal(a: Any, b: Any) -> bool:
    if isinstance(a, str) or isinstance(b, str):
        return a == b
    return a is b


class LibrarySim:
    """混进 翻译器：self 是 翻译器（标成 Any：pyright 不许把 self 标成子类）"""

    def new_library_object(self: Any, state: Any, type_name: str, value: Any) -> Any:
        from .执行 import JavaObject

        o = JavaObject(type_name, self.new_object_id())
        self.write_field(state, o, "$值", value, "L")
        return o

    def lib_values(self: Any, state: Any, o: Any) -> Any:
        from .执行 import Unsupported

        v = self.read_field(state, o, "$值", "L")
        if v is None:
            raise Unsupported(f"{o.类} 的内容丢了（在符号分支里新建的集合？）")
        if not isinstance(v, tuple):
            raise Unsupported(f"{o.类} 在符号分支两边改得不一样")
        return v

    def is_library_object(self: Any, o: Any) -> bool:
        from .执行 import JavaObject

        return isinstance(o, JavaObject) and o.类 in lib_object_classes

    def _elements(self: Any, state: Any, x: Any) -> list:
        """Collection / Iterable / 数组 的元素"""
        from .执行 import Unsupported, Array

        if isinstance(x, Array):
            return list(x.array_items)
        if self.is_library_object(x) and x.类 in _seq_classes:
            return list(self.lib_values(state, x))
        if self.is_library_object(x) and x.类 in _table_classes:
            raise Unsupported("把 Map 当 Collection 用")
        raise Unsupported(f"不是集合：{x!r}")

    def _iter_order(self: Any, state: Any, table: Any) -> list[tuple]:
        pairs = list(self.lib_values(state, table))
        if table.类 == LINKED_HASH_MAP_CLASS:
            return pairs
        index_order = hash_table_order([k for k, _ in pairs])
        if index_order is None:
            w = "HashMap 的键不全是字符串，遍历顺序按插入先后（Java 里按身份哈希，本来就不定）"
            if w not in self.warnings:
                self.warnings.append(w)
            return pairs
        return [pairs[i] for i in index_order]

    # ---------- 静态方法、构造 ----------
    def lib_static(self: Any, state: Any, type_name: str, method_name: str, descriptor: str, args: list) -> tuple[bool, Any, Any]:
        from .执行 import Unsupported, Opaque, split_descriptor, Array, CondRef

        ps, _ = split_descriptor(descriptor)
        if type_name in (IMMUTABLE_LIST_CLASS, "java/util/List") and method_name == "of":
            elements = list(args)
            if ps and ps[-1] == "[Ljava/lang/Object;":  # of(e1, …, e11, E... 其余)、List.of(E...)
                tail = elements.pop()
                elements.extend(self._elements(state, tail))
            return True, self.new_library_object(state, IMMUTABLE_LIST_CLASS, tuple(elements)), state
        if type_name == IMMUTABLE_LIST_CLASS and method_name == "copyOf":
            return True, self.new_library_object(state, IMMUTABLE_LIST_CLASS, tuple(self._elements(state, args[0]))), state
        if type_name in ("com/google/common/collect/Lists", "org/apache/commons/compress/utils/Lists") and method_name == "newArrayList":  # 1.20.1 的 AnimationDefinition.Builder 用的是后者
            elements = self._elements(state, args[0]) if args else []
            return True, self.new_library_object(state, ARRAY_LIST_CLASS, tuple(elements)), state
        if type_name == "java/util/Arrays" and method_name == "asList":
            return True, self.new_library_object(state, ARRAY_LIST_CLASS, tuple(self._elements(state, args[0]))), state
        if type_name == "com/google/common/collect/Maps" and method_name in ("newHashMap", "newLinkedHashMap") and not args:
            return True, self.new_library_object(state, HASH_MAP_CLASS if method_name == "newHashMap" else LINKED_HASH_MAP_CLASS, ()), state
        if type_name == "java/util/Arrays" and method_name == "setAll" and descriptor == "([Ljava/lang/Object;Ljava/util/function/IntFunction;)V":
            arr, fn = args
            if not isinstance(arr, Array):
                raise Unsupported(f"Arrays.setAll 的数组是 {arr!r}")
            for k in range(len(arr.array_items)):
                v, state = self.call_closure(state, fn, [self.const_node("i", k)])
                arr.array_items[k] = v
            return True, None, state
        if type_name == OPTIONAL_CLASS and method_name in ("of", "ofNullable", "empty"):
            v = args[0] if args else None
            if method_name == "ofNullable" and isinstance(v, (Opaque, CondRef)):
                raise Unsupported("Optional.ofNullable 的值说不定是不是 null")
            return True, self.new_library_object(state, OPTIONAL_CLASS, (v is not None, v)), state
        return False, None, state

    def library_construct(self: Any, state: Any, type_name: str, descriptor: str, recv: Any, args: list) -> bool:
        if type_name in (ARRAY_LIST_CLASS, HASH_MAP_CLASS, LINKED_HASH_MAP_CLASS) and descriptor in ("()V", "(I)V"):
            self.write_field(state, recv, "$值", (), "L")
            return True
        if type_name == ARRAY_LIST_CLASS and descriptor == "(Ljava/util/Collection;)V":
            self.write_field(state, recv, "$值", tuple(self._elements(state, args[0])), "L")
            return True
        return False

    # ---------- 实例方法 ----------
    def lib_method(self: Any, state: Any, method_name: str, descriptor: str, o: Any, args: list) -> tuple[Any, Any]:
        from .执行 import Unsupported

        g = self.g
        type_name = o.类
        if type_name in _seq_classes:
            v = self.lib_values(state, o)
            if method_name == "size":
                return self.const_node("i", len(v)), state
            if method_name == "isEmpty":
                return self.const_node("i", int(not v)), state
            if method_name == "get" and descriptor == "(I)Ljava/lang/Object;":
                i = self.to_number(args[0])
                if not g.is_constant(i.id):
                    raise Unsupported("List.get 的下标是符号")
                return v[g.constant_of(i.id)], state
            if method_name == "add" and descriptor == "(Ljava/lang/Object;)Z":
                if type_name != ARRAY_LIST_CLASS:
                    raise Unsupported(f"往不可变的 {type_name} 里加")
                self.write_field(state, o, "$值", v + (args[0],), "L")
                return self.const_node("i", 1), state
            if method_name == "iterator":
                it = self.new_library_object(state, iterator_class, v)
                self.write_field(state, it, "$位", 0, "L")
                return it, state
            if method_name == "forEach":
                for x in v:
                    _, state = self.call_closure(state, args[0], [x])
                return None, state
            if method_name == "contains":
                return self.const_node("i", int(any(key_equal(x, args[0]) for x in v))), state
        if type_name in _table_classes:
            v = self.lib_values(state, o)
            if method_name == "size":
                return self.const_node("i", len(v)), state
            if method_name in ("get", "containsKey"):
                for k, x in v:
                    if key_equal(k, args[0]):
                        return (x if method_name == "get" else self.const_node("i", 1)), state
                return (None if method_name == "get" else self.const_node("i", 0)), state
            if method_name == "put":
                prev = None
                new_items = []
                for k, x in v:
                    if key_equal(k, args[0]):
                        prev = x
                        new_items.append((k, args[1]))
                    else:
                        new_items.append((k, x))
                if prev is None and not any(key_equal(k, args[0]) for k, _ in v):
                    new_items.append((args[0], args[1]))
                self.write_field(state, o, "$值", tuple(new_items), "L")
                return prev, state
            if method_name == "computeIfAbsent":
                for k, x in v:
                    if key_equal(k, args[0]) and x is not None:
                        return x, state
                x, state = self.call_closure(state, args[1], [args[0]])
                if x is not None:
                    self.write_field(state, o, "$值", tuple((k, y) for k, y in v if not key_equal(k, args[0])) + ((args[0], x),), "L")
                return x, state
            if method_name == "entrySet":
                return self.new_library_object(state, view_class, tuple(self.new_library_object(state, entry_class, (k, x)) for k, x in self._iter_order(state, o))), state
            if method_name == "keySet":
                return self.new_library_object(state, view_class, tuple(k for k, _ in self._iter_order(state, o))), state
            if method_name == "values":
                return self.new_library_object(state, view_class, tuple(x for _, x in self._iter_order(state, o))), state
            if method_name == "forEach":
                for k, x in self._iter_order(state, o):
                    _, state = self.call_closure(state, args[0], [k, x])
                return None, state
        if type_name == entry_class:
            k, x = self.lib_values(state, o)
            if method_name == "getKey":
                return k, state
            if method_name == "getValue":
                return x, state
        if type_name == iterator_class:
            v = self.lib_values(state, o)
            pos = self.read_field(state, o, "$位", "L")
            if method_name == "hasNext":
                return self.const_node("i", int(pos < len(v))), state
            if method_name == "next":
                if pos >= len(v):
                    raise Unsupported("迭代器越界（NoSuchElementException）")
                self.write_field(state, o, "$位", pos + 1, "L")
                return v[pos], state
        if type_name == OPTIONAL_CLASS:
            present, x = self.lib_values(state, o)
            if method_name == "isPresent":
                return self.const_node("i", int(present)), state
            if method_name == "isEmpty":
                return self.const_node("i", int(not present)), state
            if method_name == "get" or method_name == "orElseThrow" and not args:
                if not present:
                    raise Unsupported("Optional.get 取空的")
                return x, state
            if method_name == "orElse":
                return (x if present else args[0]), state
            if method_name == "ifPresent":
                if present:
                    _, state = self.call_closure(state, args[0], [x])
                return None, state
            if method_name == "map":
                if not present:
                    return o, state
                y, state = self.call_closure(state, args[0], [x])
                return self.new_library_object(state, OPTIONAL_CLASS, (y is not None, y)), state
        raise Unsupported(f"库类 {type_name} 上的 {method_name}{descriptor} 没实现")
