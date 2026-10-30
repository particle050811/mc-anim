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
class 引用:
    """Fieldref / Methodref / InterfaceMethodref：所属类（内部名，斜杠分隔）、名字、描述符"""

    类: str
    名: str
    描述: str
    接口: bool = False


@dataclass
class 方法句柄:
    种类: int
    目标: 引用


@dataclass
class 动态调用:
    """InvokeDynamic：引导方法（句柄 + 静态参数）、调用点名字和描述符"""

    引导: 方法句柄
    引导参数: list[Any]
    名: str
    描述: str


@dataclass
class 方法:
    名: str
    描述: str
    访问: int
    代码: bytes | None = None
    最大局部: int = 0
    异常表: list[tuple[int, int, int, int]] = field(default_factory=list)

    @property
    def 静态(self) -> bool:
        return bool(self.访问 & ACC_STATIC)


@dataclass
class 字段:
    名: str
    描述: str
    访问: int
    常量: Any = None


@dataclass
class 类文件:
    名: str
    父类: str | None
    接口: list[str]
    访问: int
    常量池: list[Any]
    字段们: list[字段]
    方法们: list[方法]

    def 找方法(self, 名: str, 描述: str) -> 方法 | None:
        for m in self.方法们:
            if m.名 == 名 and m.描述 == 描述:
                return m
        return None

    def 找字段(self, 名: str) -> 字段 | None:
        for f in self.字段们:
            if f.名 == 名:
                return f
        return None

    def 常量(self, i: int) -> Any:
        return self.常量池[i]


class 读者:
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

    def 取(self, n: int) -> bytes:
        v = self.b[self.i : self.i + n]
        self.i += n
        return v


def _utf8(b: bytes) -> str:
    # JVM 的「改良 UTF-8」：\0 写成 C0 80，补充平面字符拆成两个代理
    return b.replace(b"\xc0\x80", b"\x00").decode("utf-8", errors="surrogatepass")


def 解析(数据: bytes, 改名: Any = None) -> 类文件:
    """改名：映射.py 的 映射 对象；给了就把类名、成员名、描述符都换成 Mojang 官方名（成员名要按类层级找，交给 映射 做）"""
    r = 读者(数据)
    if r.u4() != 0xCAFEBABE:
        raise ValueError("不是 class 文件")
    r.u2()
    r.u2()
    n = r.u2()
    原: list[Any] = [None] * n
    i = 1
    while i < n:
        tag = r.u1()
        if tag == 1:
            原[i] = ("utf8", _utf8(r.取(r.u2())))
        elif tag == 3:
            原[i] = ("int", struct.unpack(">i", r.取(4))[0])
        elif tag == 4:
            原[i] = ("float", struct.unpack(">f", r.取(4))[0])
        elif tag == 5:
            原[i] = ("long", struct.unpack(">q", r.取(8))[0])
            i += 1
        elif tag == 6:
            原[i] = ("double", struct.unpack(">d", r.取(8))[0])
            i += 1
        elif tag in (7, 8, 16, 19, 20):
            原[i] = ({7: "class", 8: "string", 16: "methodtype", 19: "module", 20: "package"}[tag], r.u2())
        elif tag in (9, 10, 11, 12, 17, 18):
            原[i] = ({9: "field", 10: "method", 11: "imethod", 12: "nat", 17: "dynamic", 18: "indy"}[tag], r.u2(), r.u2())
        elif tag == 15:
            原[i] = ("handle", r.u1(), r.u2())
        else:
            raise ValueError(f"不认识的常量池标签 {tag}")
        i += 1

    def utf(k: int) -> str:
        return 原[k][1]

    def 类名(k: int) -> str:
        n = utf(原[k][1])
        return 改名.类(n) if 改名 else n

    def 描述(d: str) -> str:
        return 改名.描述(d) if 改名 else d

    def 成员(k: int) -> 引用:
        kind, ci, nti = 原[k]
        _, ni, di = 原[nti]
        owner_raw = utf(原[ci][1])
        name, desc = utf(ni), utf(di)
        if 改名:
            if kind == "field":
                name = 改名.字段(owner_raw, name, desc)
            else:
                name = 改名.方法(owner_raw, name, desc)
        return 引用(类名(ci), name, 描述(desc), kind == "imethod")

    池: list[Any] = [None] * n
    bootstrap_raw: list[tuple[int, list[int]]] = []

    def 常量值(k: int) -> Any:
        e = 原[k]
        t = e[0]
        if t in ("int", "float", "long", "double"):
            return (t, e[1])
        if t == "string":
            return ("string", utf(e[1]))
        if t == "class":
            return ("class", 类名(k))
        if t in ("field", "method", "imethod"):
            return 成员(k)
        if t == "handle":
            return 方法句柄(e[1], 成员(e[2]))
        if t == "methodtype":
            return ("methodtype", 描述(utf(e[1])))
        if t == "utf8":
            return ("utf8", e[1])
        return e

    访问 = r.u2()
    this_i, super_i = r.u2(), r.u2()
    接口 = [类名(r.u2()) for _ in range(r.u2())]
    原名 = utf(原[this_i][1])

    字段们: list[字段] = []
    for _ in range(r.u2()):
        acc, ni, di = r.u2(), r.u2(), r.u2()
        name, desc = utf(ni), utf(di)
        常: Any = None
        for _ in range(r.u2()):
            an, alen = utf(r.u2()), r.u4()
            body = r.取(alen)
            if an == "ConstantValue":
                常 = 原[struct.unpack(">H", body)[0]][1]
        if 改名:
            name = 改名.字段(原名, name, desc)
        字段们.append(字段(name, 描述(desc), acc, 常))

    方法们: list[方法] = []
    for _ in range(r.u2()):
        acc, ni, di = r.u2(), r.u2(), r.u2()
        name, desc = utf(ni), utf(di)
        m = 方法(改名.方法(原名, name, desc) if 改名 else name, 描述(desc), acc)
        for _ in range(r.u2()):
            an, alen = utf(r.u2()), r.u4()
            body = r.取(alen)
            if an == "Code":
                cr = 读者(body)
                cr.u2()
                m.最大局部 = cr.u2()
                m.代码 = cr.取(cr.u4())
                m.异常表 = [(cr.u2(), cr.u2(), cr.u2(), cr.u2()) for _ in range(cr.u2())]
        方法们.append(m)

    for _ in range(r.u2()):
        an, alen = utf(r.u2()), r.u4()
        body = r.取(alen)
        if an == "BootstrapMethods":
            br = 读者(body)
            for _ in range(br.u2()):
                h = br.u2()
                bootstrap_raw.append((h, [br.u2() for _ in range(br.u2())]))

    for k in range(1, n):
        if 原[k] is not None:
            池[k] = 常量值(k)
    for k in range(1, n):
        if 原[k] is not None and 原[k][0] == "indy":
            bi, nti = 原[k][1], 原[k][2]
            h, args = bootstrap_raw[bi]
            _, ni, di = 原[nti]
            池[k] = 动态调用(池[h], [池[a] for a in args], utf(ni), 描述(utf(di)))
    return 类文件(类名(this_i), 类名(super_i) if super_i else None, 接口, 访问, 池, 字段们, 方法们)


class 类路径:
    """几个 jar 按顺序找类（先找到的算）。改名给了时，按 Mojang 官方名找：先反查成 jar 里的名字"""

    def __init__(self, jars: list[str], 改名: Any = None):
        self.zips = [zipfile.ZipFile(j) for j in jars]
        self.改名 = 改名
        self._缓存: dict[str, 类文件 | None] = {}
        if 改名 is not None:
            改名.绑定(self)

    def 原始字节(self, jar内名: str) -> bytes | None:
        for z in self.zips:
            try:
                return z.read(jar内名 + ".class")
            except KeyError:
                continue
        return None

    def 原始类(self, jar内名: str) -> 类文件 | None:
        """不改名的解析（映射.py 沿类层级找成员时用）"""
        b = self.原始字节(jar内名)
        return 解析(b) if b is not None else None

    def 找(self, 名: str) -> 类文件 | None:
        if 名 in self._缓存:
            return self._缓存[名]
        jar名 = self.改名.反查类(名) if self.改名 else 名
        b = self.原始字节(jar名)
        c = 解析(b, self.改名) if b is not None else None
        self._缓存[名] = c
        return c
