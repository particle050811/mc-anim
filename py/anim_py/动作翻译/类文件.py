"""读 JVM class 文件（JVMS 第 4 章）：常量池、字段、方法、Code 属性、BootstrapMethods。不依赖 JDK 和 javap。
只取翻译动作要的部分；StackMapTable、注解、行号这些跳过。
"""

from __future__ import annotations

import struct
import zipfile
from dataclasses import dataclass, field
from typing import Any

ACC_STATIC = 0x0008
ACC_BRIDGE = 0x0040
ACC_ABSTRACT = 0x0400
ACC_ENUM = 0x4000


@dataclass
class Ref:
    """Fieldref / Methodref / InterfaceMethodref：所属类（内部名，斜杠分隔）、名字、描述符"""

    类: str
    名: str
    map_descriptor: str
    is_interface: bool = False


@dataclass
class MethodHandle:
    ref_kind: int
    handle_target: Ref


@dataclass
class InvokeDynamic:
    """InvokeDynamic：引导方法（句柄 + 静态参数）、调用点名字和描述符"""

    bootstrap: MethodHandle
    bootstrap_args: list[Any]
    名: str
    map_descriptor: str


@dataclass
class Method:
    名: str
    map_descriptor: str
    access_flags: int
    bytecode: bytes | None = None
    max_locals: int = 0
    exception_table: list[tuple[int, int, int, int]] = field(default_factory=list)

    @property
    def static_fields(self) -> bool:
        return bool(self.access_flags & ACC_STATIC)


@dataclass
class Field:
    名: str
    map_descriptor: str
    access_flags: int
    constant_value: Any = None


@dataclass
class ClassFile:
    名: str
    parent_class: str | None
    is_interface: list[str]
    access_flags: int
    const_pool: list[Any]
    fields: list[Field]
    method_list: list[Method]

    def find_method(self, method_name: str, descriptor: str) -> Method | None:
        for m in self.method_list:
            if m.名 == method_name and m.map_descriptor == descriptor:
                return m
        return None

    def find_field(self, field_name: str) -> Field | None:
        for f in self.fields:
            if f.名 == field_name:
                return f
        return None

    def constant_value(self, i: int) -> Any:
        return self.const_pool[i]


class Reader:
    def __init__(self, b: bytes):
        self.b, self.i = b, 0

    def u1(self) -> int:
        v = self.b[self.i]
        self.i += 1
        return v

    def u2(self) -> int:
        v = struct.unpack_from(">H", self.b, self.i)[0]
        self.i += 2
        return v

    def u4(self) -> int:
        v = struct.unpack_from(">I", self.b, self.i)[0]
        self.i += 4
        return v

    def take_bytes(self, n: int) -> bytes:
        v = self.b[self.i : self.i + n]
        self.i += n
        return v


def _utf8(b: bytes) -> str:
    # JVM 的「改良 UTF-8」：\0 写成 C0 80，补充平面字符拆成两个代理
    return b.replace(b"\xc0\x80", b"\x00").decode("utf-8", errors="surrogatepass")


def parse_class_file(data: bytes, renamer: Any = None) -> ClassFile:
    """改名：映射.py 的 映射 对象；给了就把类名、成员名、描述符都换成 Mojang 官方名（成员名要按类层级找，交给 映射 做）"""
    r = Reader(data)
    if r.u4() != 0xCAFEBABE:
        raise ValueError("不是 class 文件")
    r.u2()
    r.u2()
    n = r.u2()
    raw_pool: list[Any] = [None] * n
    i = 1
    while i < n:
        tag = r.u1()
        if tag == 1:
            raw_pool[i] = ("utf8", _utf8(r.take_bytes(r.u2())))
        elif tag == 3:
            raw_pool[i] = ("int", struct.unpack(">i", r.take_bytes(4))[0])
        elif tag == 4:
            raw_pool[i] = ("float", struct.unpack(">f", r.take_bytes(4))[0])
        elif tag == 5:
            raw_pool[i] = ("long", struct.unpack(">q", r.take_bytes(8))[0])
            i += 1
        elif tag == 6:
            raw_pool[i] = ("double", struct.unpack(">d", r.take_bytes(8))[0])
            i += 1
        elif tag in (7, 8, 16, 19, 20):
            raw_pool[i] = ({7: "class", 8: "string", 16: "methodtype", 19: "module", 20: "package"}[tag], r.u2())
        elif tag in (9, 10, 11, 12, 17, 18):
            raw_pool[i] = ({9: "field", 10: "method", 11: "imethod", 12: "nat", 17: "dynamic", 18: "indy"}[tag], r.u2(), r.u2())
        elif tag == 15:
            raw_pool[i] = ("handle", r.u1(), r.u2())
        else:
            raise ValueError(f"不认识的常量池标签 {tag}")
        i += 1

    def utf(k: int) -> str:
        return raw_pool[k][1]

    def class_name_at(k: int) -> str:
        n = utf(raw_pool[k][1])
        return renamer.类(n) if renamer else n

    def normalize_descriptor(d: str) -> str:
        return renamer.map_descriptor(d) if renamer else d

    def member_ref(k: int) -> Ref:
        kind, ci, nti = raw_pool[k]
        _, ni, di = raw_pool[nti]
        owner_raw = utf(raw_pool[ci][1])
        name, desc = utf(ni), utf(di)
        if renamer:
            if kind == "field":
                name = renamer.field(owner_raw, name, desc)
            else:
                name = renamer.method_ref(owner_raw, name, desc)
        return Ref(class_name_at(ci), name, normalize_descriptor(desc), kind == "imethod")

    pool: list[Any] = [None] * n
    bootstrap_raw: list[tuple[int, list[int]]] = []

    def pool_constant(k: int) -> Any:
        e = raw_pool[k]
        t = e[0]
        if t in ("int", "float", "long", "double"):
            return (t, e[1])
        if t == "string":
            return ("string", utf(e[1]))
        if t == "class":
            return ("class", class_name_at(k))
        if t in ("field", "method", "imethod"):
            return member_ref(k)
        if t == "handle":
            return MethodHandle(e[1], member_ref(e[2]))
        if t == "methodtype":
            return ("methodtype", normalize_descriptor(utf(e[1])))
        if t == "utf8":
            return ("utf8", e[1])
        return e

    access_flags = r.u2()
    this_i, super_i = r.u2(), r.u2()
    interfaces = [class_name_at(r.u2()) for _ in range(r.u2())]
    original_name = utf(raw_pool[this_i][1])

    fields: list[Field] = []
    for _ in range(r.u2()):
        acc, ni, di = r.u2(), r.u2(), r.u2()
        name, desc = utf(ni), utf(di)
        const_value: Any = None
        for _ in range(r.u2()):
            an, alen = utf(r.u2()), r.u4()
            body = r.take_bytes(alen)
            if an == "ConstantValue":
                const_value = raw_pool[struct.unpack(">H", body)[0]][1]
        if renamer:
            name = renamer.field(original_name, name, desc)
        fields.append(Field(name, normalize_descriptor(desc), acc, const_value))

    methods: list[Method] = []
    for _ in range(r.u2()):
        acc, ni, di = r.u2(), r.u2(), r.u2()
        name, desc = utf(ni), utf(di)
        m = Method(renamer.method_ref(original_name, name, desc) if renamer else name, normalize_descriptor(desc), acc)
        for _ in range(r.u2()):
            an, alen = utf(r.u2()), r.u4()
            body = r.take_bytes(alen)
            if an == "Code":
                cr = Reader(body)
                cr.u2()
                m.max_locals = cr.u2()
                m.bytecode = cr.take_bytes(cr.u4())
                m.exception_table = [(cr.u2(), cr.u2(), cr.u2(), cr.u2()) for _ in range(cr.u2())]
        methods.append(m)

    for _ in range(r.u2()):
        an, alen = utf(r.u2()), r.u4()
        body = r.take_bytes(alen)
        if an == "BootstrapMethods":
            br = Reader(body)
            for _ in range(br.u2()):
                h = br.u2()
                bootstrap_raw.append((h, [br.u2() for _ in range(br.u2())]))

    for k in range(1, n):
        if raw_pool[k] is not None:
            pool[k] = pool_constant(k)
    for k in range(1, n):
        if raw_pool[k] is not None and raw_pool[k][0] == "indy":
            bi, nti = raw_pool[k][1], raw_pool[k][2]
            h, args = bootstrap_raw[bi]
            _, ni, di = raw_pool[nti]
            pool[k] = InvokeDynamic(pool[h], [pool[a] for a in args], utf(ni), normalize_descriptor(utf(di)))
    return ClassFile(class_name_at(this_i), class_name_at(super_i) if super_i else None, interfaces, access_flags, pool, fields, methods)


class ClassPath:
    """几个 jar 按顺序找类（先找到的算）。改名给了时，按 Mojang 官方名找：先反查成 jar 里的名字"""

    def __init__(self, jars: list[str], renamer: Any = None):
        self.zips = [zipfile.ZipFile(j) for j in jars]
        self.renamer = renamer
        self._cache: dict[str, ClassFile | None] = {}
        if renamer is not None:
            renamer.bind_path(self)

    def raw_bytes(self, jar_internal_name: str) -> bytes | None:
        for z in self.zips:
            try:
                return z.read(jar_internal_name + ".class")
            except KeyError:
                continue
        return None

    def raw_class(self, jar_internal_name: str) -> ClassFile | None:
        """不改名的解析（映射.py 沿类层级找成员时用）"""
        b = self.raw_bytes(jar_internal_name)
        return parse_class_file(b) if b is not None else None

    def find_class(self, class_name: str) -> ClassFile | None:
        if class_name in self._cache:
            return self._cache[class_name]
        jar_name = self.renamer.reverse_lookup_class(class_name) if self.renamer else class_name
        b = self.raw_bytes(jar_name)
        c = parse_class_file(b, self.renamer) if b is not None else None
        self._cache[class_name] = c
        return c
