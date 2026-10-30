"""符号执行：把模型类的 构造函数 → prepareMobModel → setupAnim 字节码跑一遍，部件字段的终值写成 图.py 的表达式。
- 构造函数具体地跑：记下哪个字段是哪个部件（字段名和部件名不一定对得上，原版 CreeperModel 的 leftHindLeg 就是 right_hind_leg）
- 实体参数是不透明对象：在它上面的调用、字段读成输入（entity.isAggressive() 这样的名字）；模型自己的字段（attackTime、riding、手臂姿势）没写过就读成输入
- 条件分支：条件是常量就只走一边（循环靠这个展开）；否则两边各跑到直接后必经点（汇合处），局部变量、栈、堆按条件合成 sel
- 调用：Mth、Math 这些按 图.内建 记成函数节点；模型自己、父类、AnimationUtils 这类 jar 里有字节码的照跑（内联）；ModelPart 的方法也照它的字节码跑
- 枚举按序号（int）算；枚举的方法和字段对每个常量具体跑一遍，查表
不支持的写法抛 不支持，消息里带类、方法和字节码位置。
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field
from typing import Any

from .图 import 内建, 图
from .类文件 import ACC_ABSTRACT, ACC_ENUM, ACC_STATIC, 动态调用, 引用, 方法, 方法句柄, 类文件, 类路径

部件类 = "net/minecraft/client/model/geom/ModelPart"
实体类 = "net/minecraft/world/entity/Entity"
姿态字段 = ("x", "y", "z", "xRot", "yRot", "zRot", "xScale", "yScale", "zScale", "visible", "skipDraw")
setupAnim参数 = ("limbSwing", "limbSwingAmount", "ageInTicks", "netHeadYaw", "headPitch")
prepare参数 = ("limbSwing", "limbSwingAmount", "partialTick")


class 不支持(Exception):
    pass


# ---------- 值 ----------
@dataclass(frozen=True)
class N:
    """表达式节点（int / long / float / double；boolean、byte、char、short、枚举序号都按 int）"""

    id: int
    t: str


@dataclass(frozen=True)
class 部件:
    名: str


@dataclass(frozen=True)
class 模型实例:
    pass


@dataclass(frozen=True)
class 不透明:
    路径: str
    类: str | None = None


@dataclass(eq=False)
class 对象:
    类: str
    号: int


@dataclass(eq=False)
class 数组:
    元素: list
    元素描述: str


@dataclass(frozen=True)
class 初始姿态:
    部件: str


@dataclass(frozen=True)
class 部件流:
    根: str


@dataclass(frozen=True)
class 闭包:
    句柄: 方法句柄
    捕获: tuple


@dataclass(frozen=True)
class 比较值:
    """lcmp / fcmpl / fcmpg / dcmpl / dcmpg 的结果，留到紧跟的 ifXX 再化成条件（NaN 的规矩不同）"""

    nan: int  # NaN 时的结果：-1（fcmpl）或 1（fcmpg）；lcmp 是 0（不会 NaN）
    a: N
    b: N


@dataclass(frozen=True)
class 条件引用:
    """几个引用里按条件取一个（互斥且穷尽），如 HumanoidModel.getArm(arm) 的结果"""

    分支: tuple


@dataclass(frozen=True)
class 类常量:
    名: str


续 = object()  # 二槽值的第二槽


def 二槽(v: Any) -> bool:
    return isinstance(v, N) and v.t in "jd"


# ---------- 描述符 ----------
def 拆描述(d: str) -> tuple[list[str], str]:
    assert d[0] == "("
    i, ps = 1, []
    while d[i] != ")":
        j = i
        while d[j] == "[":
            j += 1
        if d[j] == "L":
            j = d.index(";", j)
        ps.append(d[i : j + 1])
        i = j + 1
    return ps, d[i + 1 :]


def 基本类型(d: str) -> str | None:
    return {"F": "f", "D": "d", "J": "j", "I": "i", "Z": "i", "B": "i", "S": "i", "C": "i"}.get(d)


# ---------- 状态 ----------
@dataclass
class 堆态:
    堆: dict = field(default_factory=dict)
    事实: dict = field(default_factory=dict)
    复位: bool = False
    死: bool = False

    def 复制(self) -> 堆态:
        return 堆态(dict(self.堆), dict(self.事实), self.复位, self.死)


@dataclass
class 帧:
    局部: list
    栈: list
    态: 堆态
    返回: Any = None
    已返回: bool = False

    def 复制(self) -> 帧:
        return 帧(list(self.局部), list(self.栈), self.态.复制(), self.返回, self.已返回)


@dataclass
class 方法码:
    类: 类文件
    方法: 方法
    指令: dict
    汇合: dict


# ---------- 解码 ----------
_长 = {
    16: 1,
    17: 2,
    18: 1,
    19: 2,
    20: 2,
    132: 2,
    153: 2,
    154: 2,
    155: 2,
    156: 2,
    157: 2,
    158: 2,
    159: 2,
    160: 2,
    161: 2,
    162: 2,
    163: 2,
    164: 2,
    165: 2,
    166: 2,
    167: 2,
    168: 2,
    169: 1,
    178: 2,
    179: 2,
    180: 2,
    181: 2,
    182: 2,
    183: 2,
    184: 2,
    185: 4,
    186: 4,
    187: 2,
    188: 1,
    189: 2,
    192: 2,
    193: 2,
    197: 3,
    198: 2,
    199: 2,
    200: 4,
    201: 4,
}
for _o in range(21, 26):
    _长[_o] = 1
for _o in range(54, 59):
    _长[_o] = 1


def 解码(code: bytes) -> dict:
    """pc → (操作码, 操作数, 下一条 pc, 跳转目标们)"""
    out, pc = {}, 0
    while pc < len(code):
        op = code[pc]
        if op == 170:  # tableswitch
            p = (pc + 4) & ~3
            dflt, lo, hi = struct.unpack_from(">iii", code, p)
            offs = struct.unpack_from(f">{hi - lo + 1}i", code, p + 12)
            表 = {lo + i: pc + o for i, o in enumerate(offs)}
            nxt = p + 12 + 4 * (hi - lo + 1)
            out[pc] = (op, (pc + dflt, 表), nxt, [pc + dflt, *表.values()])
        elif op == 171:  # lookupswitch
            p = (pc + 4) & ~3
            dflt, n = struct.unpack_from(">ii", code, p)
            表 = {}
            for i in range(n):
                k, o = struct.unpack_from(">ii", code, p + 8 + 8 * i)
                表[k] = pc + o
            nxt = p + 8 + 8 * n
            out[pc] = (op, (pc + dflt, 表), nxt, [pc + dflt, *表.values()])
        elif op == 196:  # wide
            op2 = code[pc + 1]
            if op2 == 132:
                idx, c = struct.unpack_from(">Hh", code, pc + 2)
                out[pc] = (132, (idx, c), pc + 6, [])
            else:
                out[pc] = (op2, (struct.unpack_from(">H", code, pc + 2)[0],), pc + 4, [])
        else:
            n = _长.get(op, 0)
            raw = code[pc + 1 : pc + 1 + n]
            if op in (16,):
                arg: tuple = (struct.unpack(">b", raw)[0],)
            elif op == 17:
                arg = (struct.unpack(">h", raw)[0],)
            elif op == 132:
                arg = (raw[0], struct.unpack(">b", raw[1:])[0])
            elif 153 <= op <= 168 or op in (198, 199):
                arg = (pc + struct.unpack(">h", raw)[0],)
            elif op in (200, 201):
                arg = (pc + struct.unpack(">i", raw)[0],)
            elif op in (19, 20, 178, 179, 180, 181, 182, 183, 184, 187, 189, 192, 193):
                arg = (struct.unpack(">H", raw[:2])[0],)
            elif op in (185, 186):
                arg = (struct.unpack(">H", raw[:2])[0],)
            elif op == 197:
                arg = (struct.unpack(">H", raw[:2])[0], raw[2])
            elif n == 1:
                arg = (raw[0],)
            else:
                arg = ()
            nxt = pc + 1 + n
            targets = [arg[0]] if (153 <= op <= 168 or op in (198, 199, 200, 201)) else []
            out[pc] = (op, arg, nxt, targets)
        pc = out[pc][2]
    return out


_出口 = -1


def 后必经(指令: dict) -> dict:
    """每条指令的直接后必经点（汇合处）；出口记 -1"""
    pcs = sorted(指令)
    idx = {pc: i for i, pc in enumerate(pcs)}
    n = len(pcs)
    EXIT = n
    succ: list[list[int]] = []
    for pc in pcs:
        op, arg, nxt, tg = 指令[pc]
        if 172 <= op <= 177 or op == 191:
            s = [EXIT]
        elif op in (167, 200):
            s = [idx[tg[0]]]
        elif op in (170, 171):
            s = sorted({idx[t] for t in tg})
        elif tg:
            s = [idx[tg[0]], idx[nxt]]
        else:
            s = [idx[nxt]] if nxt in idx else [EXIT]
        succ.append(s)
    全 = (1 << (n + 1)) - 1
    pd = [全] * n + [1 << EXIT]
    changed = True
    while changed:
        changed = False
        for i in range(n - 1, -1, -1):
            m = 全
            for s in succ[i]:
                m &= pd[s]
            v = m | (1 << i)
            if v != pd[i]:
                pd[i] = v
                changed = True
    out = {}
    for i, pc in enumerate(pcs):
        best, best_n = None, -1
        m = pd[i] & ~(1 << i)
        j = 0
        while m:
            if m & 1:
                c = bin(pd[j]).count("1")
                if c > best_n:
                    best, best_n = j, c
            m >>= 1
            j += 1
        out[pc] = _出口 if best is None or best == EXIT else pcs[best]
    return out


class 翻译器:
    def __init__(self, 路径: 类路径, 模型类: str, 固定: dict[str, Any] | None = None, 模型树: dict[str, list[str]] | None = None, 步数上限: int = 3_000_000):
        self.g = 图()
        self.路径 = 路径
        self.模型类 = 模型类.replace(".", "/")
        self.固定 = dict(固定 or {})
        self.模型树 = 模型树
        self.输入表: dict[str, dict] = {}
        self.警告: list[str] = []
        self.静态: dict[tuple[str, str], Any] = {}
        self._已初始化: set[str] = set()
        self._枚举对象: dict[str, list[对象]] = {}
        self._码: dict[tuple[str, str, str], 方法码] = {}
        self._对象号 = 0
        self.模型 = 模型实例()
        self.结构字段: dict[str, Any] = {}
        self.字段默认: dict[str, Any] = {}
        self.根部件 = "root"
        self.步 = 0
        self.步数上限 = 步数上限
        self._分叉中: set[tuple[str, int]] = set()
        self._深度 = 0
        self._链: list[str] = []
        self.用到的类: set[str] = set()
        self._静态堆 = 堆态()

    # ---------- 类和方法 ----------
    def 类(self, 名: str) -> 类文件 | None:
        c = self.路径.找(名)
        if c is not None:
            self.用到的类.add(名)
        return c

    def 是枚举(self, 名: str) -> bool:
        c = self.类(名)
        return c is not None and bool(c.访问 & ACC_ENUM) and c.父类 == "java/lang/Enum"

    def 枚举常量(self, 名: str) -> list[str]:
        c = self.类(名)
        assert c is not None
        return [f.名 for f in c.字段们 if f.访问 & ACC_ENUM]

    def 找方法(self, 类名: str, 名: str, 描述: str, 虚: bool = True) -> tuple[类文件, 方法] | None:
        """从 类名 往父类找（虚调用、invokespecial 的父类调用都这样找）；接口的默认方法最后找"""
        c = self.类(类名)
        接口们: list[str] = []
        while c is not None:
            m = c.找方法(名, 描述)
            if m is not None and not (m.访问 & ACC_ABSTRACT):
                return c, m
            接口们.extend(c.接口)
            c = self.类(c.父类) if c.父类 else None
        while 接口们:
            i = self.类(接口们.pop(0))
            if i is None:
                continue
            m = i.找方法(名, 描述)
            if m is not None and m.代码 is not None:
                return i, m
            接口们.extend(i.接口)
        return None

    def 是子类(self, 类名: str | None, 祖先: str) -> bool:
        while 类名:
            if 类名 == 祖先:
                return True
            c = self.类(类名)
            if c is None:
                return False
            if 祖先 in c.接口:
                return True
            类名 = c.父类
        return False

    def 码(self, c: 类文件, m: 方法) -> 方法码:
        k = (c.名, m.名, m.描述)
        if k not in self._码:
            if m.代码 is None:
                raise 不支持(f"{c.名}.{m.名}{m.描述} 没有字节码（抽象或 native）")
            ins = 解码(m.代码)
            self._码[k] = 方法码(c, m, ins, 后必经(ins))
        return self._码[k]

    # ---------- 值的工具 ----------
    def 常(self, t: str, v: Any) -> N:
        return N(self.g.常(t, v), t)

    def 输入(self, 名: str, t: str, 来源: str, 枚举: str | None = None, 默认: Any = None) -> N:
        if 名 in self.固定:
            v = self.固定[名]
            if 枚举 and isinstance(v, str):
                v = self.枚举常量(枚举).index(v)
            return self.常(t, v)
        meta = self.输入表.setdefault(名, {"类型": t, "来源": 来源})
        if 枚举:
            meta["枚举"] = self.枚举常量(枚举)
            meta["枚举类"] = 枚举
        if 默认 is not None:
            meta["默认"] = 默认
        return N(self.g.输入(t, 名), t)

    def 按描述输入(self, 名: str, 描述: str, 来源: str, 默认: Any = None) -> Any:
        t = 基本类型(描述)
        if t:
            return self.输入(名, t, 来源, 默认=默认)
        if 描述.startswith("L"):
            cls = 描述[1:-1]
            if self.是枚举(cls):
                return self.输入(名, "i", 来源, 枚举=cls, 默认=默认)
            return 不透明(名, cls)
        return 不透明(名, None)

    def 新对象号(self) -> int:
        self._对象号 += 1
        return self._对象号

    # ---------- 堆 ----------
    def 键(self, obj: Any) -> tuple:
        if isinstance(obj, 部件):
            return ("部件", obj.名)
        if isinstance(obj, 模型实例):
            return ("模型",)
        if isinstance(obj, 对象):
            return ("对象", obj.号)
        raise 不支持(f"不能当对象读写字段：{obj!r}")

    def 初值(self, k: tuple, 字段: str, 描述: str) -> Any:
        if k[0] == "部件":
            if 字段 in ("x", "y", "z", "xRot", "yRot", "zRot"):
                return N(self.g.初始(k[1], 字段), "f")
            if 字段 in ("xScale", "yScale", "zScale"):
                return self.常("f", 1.0)
            if 字段 == "visible":
                return self.常("i", 1)
            if 字段 == "skipDraw":
                return self.常("i", 0)
            if 字段 == "initialPose":
                return 初始姿态(k[1])
            return 不透明(f"{k[1]}.{字段}", 描述[1:-1] if 描述.startswith("L") else None)
        if k[0] == "模型":
            if 字段 in self.结构字段:
                return self.结构字段[字段]
            return self.按描述输入(f"model.{字段}", 描述, "模型字段", 默认=self.字段默认.get(字段))
        t = 基本类型(描述)
        return self.常(t, 0) if t else None

    def 读字段(self, 态: 堆态, obj: Any, 字段: str, 描述: str) -> Any:
        if isinstance(obj, 条件引用):
            vals = [(c, self.读字段(态, o, 字段, 描述)) for c, o in obj.分支]
            r = vals[-1][1]
            for c, v in reversed(vals[:-1]):
                r = self.合值(c, v, r)
            return r
        if isinstance(obj, 初始姿态):
            if 字段 in ("x", "y", "z", "xRot", "yRot", "zRot"):
                return N(self.g.初始(obj.部件, 字段), "f")
            if 字段 in ("xScale", "yScale", "zScale"):
                return self.常("f", 1.0)
            raise 不支持(f"PartPose.{字段}")
        if isinstance(obj, 不透明):
            return self.按描述输入(f"{obj.路径}.{字段}", 描述, "实体")
        k = self.键(obj)
        if (k, 字段) in 态.堆:
            return 态.堆[(k, 字段)]
        if k[0] == "对象" and (k, 字段) in self._静态堆.堆:
            return self._静态堆.堆[(k, 字段)]
        return self.初值(k, 字段, 描述)

    def 写字段(self, 态: 堆态, obj: Any, 字段: str, 值: Any, 描述: str) -> None:
        if isinstance(obj, 条件引用):
            for c, o in obj.分支:
                old = self.读字段(态, o, 字段, 描述)
                self.写字段(态, o, 字段, self.合值(c, 值, old), 描述)
            return
        if isinstance(obj, 不透明):
            self.警告.append(f"写了实体字段 {obj.路径}.{字段}，忽略")
            return
        态.堆[(self.键(obj), 字段)] = 值

    # ---------- 合并 ----------
    def 合值(self, c: int, a: Any, b: Any) -> Any:
        if a is b:
            return a
        if isinstance(a, N) and isinstance(b, N):
            if a.t != b.t:
                return None
            if a.id == b.id:
                return a
            return N(self.g.选(c, a.id, b.id), a.t)
        if a is None or b is None or a is 续 or b is 续:
            return None
        if a == b and not isinstance(a, (对象, 数组)):
            return a
        if isinstance(a, (N, 比较值)) or isinstance(b, (N, 比较值)):
            if isinstance(a, 比较值) or isinstance(b, 比较值):
                a, b = self.落比较(a), self.落比较(b)
                return self.合值(c, a, b)
            return None
        opts: list[tuple[int, Any]] = []
        for cond, v in ((c, a), (self.g.非(c), b)):
            if isinstance(v, 条件引用):
                opts.extend((self.g.且(cond, ci), vi) for ci, vi in v.分支)
            else:
                opts.append((cond, v))
        merged: list[tuple[int, Any]] = []
        for cond, v in opts:
            for i, (c2, v2) in enumerate(merged):
                if v2 == v if not isinstance(v, (对象, 数组)) else v2 is v:
                    merged[i] = (self.g.或(c2, cond), v2)
                    break
            else:
                merged.append((cond, v))
        if len(merged) == 1:
            return merged[0][1]
        return 条件引用(tuple(merged))

    def 落比较(self, v: Any) -> Any:
        if not isinstance(v, 比较值):
            return v
        g = self.g
        lt = g.比("<", v.a.id, v.b.id)
        gt = g.比(">", v.a.id, v.b.id)
        eq = g.比("==", v.a.id, v.b.id)
        nan = g.常("i", v.nan)
        return N(g.选(lt, g.常("i", -1), g.选(gt, g.常("i", 1), g.选(eq, g.常("i", 0), nan))), "i")

    def 合帧(self, c: int, f1: 帧, f2: 帧) -> 帧:
        if f1.态.死:
            return f2
        if f2.态.死:
            return f1
        if f1.已返回 != f2.已返回:
            raise 不支持("一边返回了、一边没返回的分支")
        n = max(len(f1.局部), len(f2.局部))
        局部 = [self.合值(c, f1.局部[i] if i < len(f1.局部) else None, f2.局部[i] if i < len(f2.局部) else None) for i in range(n)]
        if len(f1.栈) != len(f2.栈):
            raise 不支持("汇合处两边栈深不同")
        栈 = []
        for a, b in zip(f1.栈, f2.栈):
            v = self.合值(c, a, b)
            if v is None:
                raise 不支持(f"汇合处栈上的值合不起来：{a!r} / {b!r}")
            栈.append(v)
        态 = 堆态()
        for k in sorted(set(f1.态.堆) | set(f2.态.堆), key=repr):
            obj, 字段 = k
            desc = "F" if 字段 not in ("visible", "skipDraw") else "Z"
            if obj[0] == "模型" and 字段 not in self.结构字段:
                desc = self._模型字段描述(字段)
            a = f1.态.堆[k] if k in f1.态.堆 else self.初值(obj, 字段, desc)
            b = f2.态.堆[k] if k in f2.态.堆 else self.初值(obj, 字段, desc)
            if obj[0] == "部件" and (k not in f1.态.堆 and not f1.态.复位 or k not in f2.态.堆 and not f2.态.复位):
                w = f"部件 {obj[1]}.{字段} 只在部分分支里写：没写的那支游戏里沿用上一帧的值，这里按初始姿态算"
                if w not in self.警告:
                    self.警告.append(w)
            v = self.合值(c, a, b)
            if v is None:
                raise 不支持(f"汇合处字段 {obj}.{字段} 合不起来")
            态.堆[k] = v
        态.事实 = {k: v for k, v in f1.态.事实.items() if f2.态.事实.get(k) == v}
        态.复位 = f1.态.复位 and f2.态.复位
        out = 帧(局部, 栈, 态, None, f1.已返回)
        if f1.已返回:
            out.返回 = self.合值(c, f1.返回, f2.返回) if (f1.返回 is not None or f2.返回 is not None) else None
        return out

    def _模型字段描述(self, 字段: str) -> str:
        c = self.类(self.模型类)
        while c is not None:
            f = c.找字段(字段)
            if f is not None:
                return f.描述
            c = self.类(c.父类) if c.父类 else None
        return "F"

    # ---------- 条件 ----------
    def 定值(self, 态: 堆态, c: int) -> bool | None:
        g = self.g
        if g.是常量(c):
            return bool(g.常量值(c))
        if c in 态.事实:
            return 态.事实[c]
        e = g.节点[c]
        if e[0] == "not" and e[2] in 态.事实:
            return not 态.事实[e[2]]
        return None

    def 记事实(self, 态: 堆态, c: int, v: bool) -> None:
        e = self.g.节点[c]
        if e[0] == "not":
            态.事实[e[2]] = not v
        else:
            态.事实[c] = v

    # ---------- 跑方法 ----------
    def 跑(self, c: 类文件, m: 方法, 实参: list, 态: 堆态) -> tuple[Any, 堆态]:
        self._深度 += 1
        self._链.append(f"{c.名.split('/')[-1]}.{m.名}")
        if self._深度 > 60:
            raise 不支持("调用太深（递归？）")
        try:
            mc = self.码(c, m)
            局部: list = [None] * max(m.最大局部, 1)
            i = 0
            for v in 实参:
                局部[i] = v
                i += 2 if 二槽(v) else 1
            fr = self.区间(mc, 帧(局部, [], 态), 0, _出口)
            if not fr.已返回 and not fr.态.死:
                raise 不支持(f"{c.名}.{m.名} 没走到 return")
            return fr.返回, fr.态
        finally:
            self._深度 -= 1
            self._链.pop()

    def 区间(self, mc: 方法码, fr: 帧, pc: int, 终: int) -> 帧:
        g = self.g
        while True:
            if pc == 终:
                return fr
            self.步 += 1
            if self.步 > self.步数上限:
                raise 不支持("步数超过上限（死循环？）")
            op, arg, nxt, tg = mc.指令[pc]
            try:
                r: Any = self.一条(mc, fr, pc, op, arg, nxt)
            except 不支持 as e:
                if "@" not in str(e):
                    raise 不支持(f"{e} @ {mc.类.名}.{mc.方法.名}{mc.方法.描述} pc={pc} op={op}；调用链 {' → '.join(self._链)}") from None
                raise
            if r is None:
                pc = nxt
                continue
            kind = r[0]
            if kind == "跳":
                pc = r[1]
            elif kind == "返回":
                fr.已返回 = True
                fr.返回 = r[1]
                return fr
            elif kind == "死":
                fr.态.死 = True
                fr.已返回 = 终 == _出口
                return fr
            elif kind == "分":
                # r[1]：[(条件或 None=其余, 目标 pc)]，条件互斥；全是符号的
                j = mc.汇合[pc]
                key = (mc.类.名 + "." + mc.方法.名 + mc.方法.描述, pc)
                if key in self._分叉中:
                    raise 不支持(f"条件是符号的循环（{mc.类.名}.{mc.方法.名} pc={pc}）")
                self._分叉中.add(key)
                try:
                    结果: list[tuple[int, 帧]] = []
                    其余 = g.真()
                    for cond, target in r[1]:
                        f2 = fr.复制()
                        c2 = 其余 if cond is None else cond
                        if cond is not None:
                            其余 = g.且(其余, g.非(cond))
                        if g.是常量(c2) and not g.常量值(c2):
                            continue
                        if not g.是常量(c2):
                            self.记事实(f2.态, c2, True)
                        结果.append((c2, self.区间(mc, f2, target, j)))
                finally:
                    self._分叉中.discard(key)
                合 = 结果[-1][1]
                for c2, f2 in reversed(结果[:-1]):
                    合 = self.合帧(c2, f2, 合)
                fr = 合
                if j == _出口 or fr.已返回:
                    if j != _出口:
                        raise 不支持("汇合点不是出口却已返回")
                    return fr
                if fr.态.死:
                    return fr
                pc = j
            else:
                raise AssertionError(kind)

    # 条件跳转：可定就走一边，不可定交给 区间 分叉
    def 条件跳(self, fr: 帧, c: int, target: int, nxt: int):
        v = self.定值(fr.态, c)
        if v is not None:
            return ("跳", target if v else nxt)
        return ("分", [(c, target), (None, nxt)])

    def 条件(self, op: str, a: Any, b: Any = None) -> int:
        """ifXX 的条件：a 是 比较值（fcmpl 等）或 int；b 给了是 if_icmpXX"""
        g = self.g
        if isinstance(a, 比较值):
            x, y = a.a.id, a.b.id
            if a.nan == -1:  # fcmpl/dcmpl：NaN → -1
                m = {"==": ("==", False), "!=": ("==", True), "<": (">=", True), ">=": (">=", False), ">": (">", False), "<=": (">", True)}
            elif a.nan == 1:  # fcmpg/dcmpg：NaN → 1
                m = {"==": ("==", False), "!=": ("==", True), "<": ("<", False), ">=": ("<", True), ">": ("<=", True), "<=": ("<=", False)}
            else:
                m = {k: (k, False) for k in ("==", "!=", "<", ">=", ">", "<=")}
            o, neg = m[op]
            c = g.比(o, x, y)
            return g.非(c) if neg else c
        if b is None:
            b = self.常("i", 0)
        a, b = self.落比较(a), self.落比较(b)
        if not (isinstance(a, N) and isinstance(b, N)):
            raise 不支持(f"比较的不是数：{a!r} {b!r}")
        return g.比(op, a.id, b.id)

    def 引用相等(self, a: Any, b: Any) -> int:
        g = self.g
        if isinstance(a, N) and isinstance(b, N):
            return g.比("==", a.id, b.id)
        if isinstance(a, 条件引用) or isinstance(b, 条件引用):
            多, 另 = (a, b) if isinstance(a, 条件引用) else (b, a)
            assert isinstance(多, 条件引用)
            r = g.假()
            for ci, vi in 多.分支:
                r = g.或(r, g.且(ci, self.引用相等(vi, 另)))
            return r
        if a is b or (a == b and not isinstance(a, (对象, 数组))):
            return g.真()
        if a is None or b is None:
            return g.假()
        if isinstance(a, 不透明) or isinstance(b, 不透明):
            raise 不支持(f"比较不透明对象的引用：{a!r} / {b!r}")
        return g.假()

    # ---------- 一条指令 ----------
    def 一条(self, mc: 方法码, fr: 帧, pc: int, op: int, arg: tuple, nxt: int):
        g, st, loc = self.g, fr.栈, fr.局部
        cp = mc.类.常量池
        if op == 0:
            return None
        if op == 1:
            st.append(None)
        elif 2 <= op <= 8:
            st.append(self.常("i", op - 3))
        elif op in (9, 10):
            st.append(self.常("j", op - 9))
        elif 11 <= op <= 13:
            st.append(self.常("f", float(op - 11)))
        elif op in (14, 15):
            st.append(self.常("d", float(op - 14)))
        elif op in (16, 17):
            st.append(self.常("i", arg[0]))
        elif op in (18, 19, 20):
            v = cp[arg[0]]
            if isinstance(v, tuple):
                kind = v[0]
                if kind in ("int", "float", "long", "double"):
                    st.append(self.常({"int": "i", "float": "f", "long": "j", "double": "d"}[kind], v[1]))
                elif kind == "string":
                    st.append(v[1])
                elif kind == "class":
                    st.append(类常量(v[1]))
                else:
                    raise 不支持(f"ldc {kind}")
            else:
                raise 不支持(f"ldc {v!r}")
        elif 21 <= op <= 25:
            st.append(loc[arg[0]])
        elif 26 <= op <= 45:
            st.append(loc[(op - 26) % 4])
        elif 46 <= op <= 53:
            i, a = st.pop(), st.pop()
            st.append(self.数组读(a, i))
        elif 54 <= op <= 58:
            self.存局部(loc, arg[0], st.pop())
        elif 59 <= op <= 78:
            self.存局部(loc, (op - 59) % 4, st.pop())
        elif 79 <= op <= 86:
            v, i, a = st.pop(), st.pop(), st.pop()
            if not isinstance(a, 数组):
                raise 不支持(f"往非数组里存：{a!r}")
            if not (isinstance(i, N) and g.是常量(i.id)):
                raise 不支持("数组下标是符号")
            a.元素[g.常量值(i.id)] = v
        elif op == 87:
            self.弹槽(st, 1)
        elif op == 88:
            self.弹槽(st, 2)
        elif 89 <= op <= 95:
            if op == 89:
                s = self.弹槽(st, 1)
                self.压槽(st, s + s)
            elif op == 90:
                a, b = self.弹槽(st, 1), self.弹槽(st, 1)
                self.压槽(st, a + b + a)
            elif op == 91:
                a, bc = self.弹槽(st, 1), self.弹槽(st, 2)
                self.压槽(st, a + bc + a)
            elif op == 92:
                s = self.弹槽(st, 2)
                self.压槽(st, s + s)
            elif op == 93:
                ab, c = self.弹槽(st, 2), self.弹槽(st, 1)
                self.压槽(st, ab + c + ab)
            elif op == 94:
                ab, cd = self.弹槽(st, 2), self.弹槽(st, 2)
                self.压槽(st, ab + cd + ab)
            else:
                a, b = self.弹槽(st, 1), self.弹槽(st, 1)
                self.压槽(st, a + b)
        elif 96 <= op <= 131:
            t = "ijfd"[(op - 96) % 4] if op < 120 else "ij"[(op - 120) % 2]
            if op < 116:
                name = ["+", "-", "*", "/", "%"][(op - 96) // 4]
                b, a = st.pop(), st.pop()
                st.append(self.算(name, t, a, b))
            elif op < 120:
                a = st.pop()
                st.append(N(g.算("neg", t, self.数(a).id), t))
            else:
                name = ["shl", "shr", "ushr", "and", "or", "xor"][(op - 120) // 2]
                b, a = st.pop(), st.pop()
                if name in ("shl", "shr", "ushr"):
                    b = N(g.转(t, self.数(b).id), t) if t == "j" else b
                st.append(self.算(name, t, a, b))
        elif op == 132:
            idx, c = arg
            loc[idx] = self.算("+", "i", loc[idx], self.常("i", c))
        elif 133 <= op <= 147:
            a = self.数(st.pop())
            到 = {133: "j", 134: "f", 135: "d", 136: "i", 137: "f", 138: "d", 139: "i", 140: "j", 141: "d", 142: "i", 143: "j", 144: "f"}.get(op)
            if 到:
                st.append(N(g.转(到, a.id), 到))
            else:  # i2b i2c i2s
                bits, signed = {145: (8, True), 146: (16, False), 147: (16, True)}[op]
                if g.是常量(a.id):
                    v = g.常量值(a.id) & ((1 << bits) - 1)
                    if signed and v >= 1 << (bits - 1):
                        v -= 1 << bits
                    st.append(self.常("i", v))
                else:
                    raise 不支持("i2b/i2c/i2s 作用在符号上")
        elif op == 148:
            b, a = st.pop(), st.pop()
            st.append(比较值(0, self.数(a), self.数(b)))
        elif op in (149, 150, 151, 152):
            b, a = st.pop(), st.pop()
            st.append(比较值(-1 if op in (149, 151) else 1, self.数(a), self.数(b)))
        elif 153 <= op <= 158:
            a = st.pop()
            o = ["==", "!=", "<", ">=", ">", "<="][op - 153]
            return self.条件跳(fr, self.条件(o, a), arg[0], nxt)
        elif 159 <= op <= 164:
            b, a = st.pop(), st.pop()
            o = ["==", "!=", "<", ">=", ">", "<="][op - 159]
            return self.条件跳(fr, self.条件(o, a, b), arg[0], nxt)
        elif op in (165, 166):
            b, a = st.pop(), st.pop()
            c = self.引用相等(a, b)
            return self.条件跳(fr, c if op == 165 else g.非(c), arg[0], nxt)
        elif op in (167, 200):
            return ("跳", arg[0])
        elif op in (168, 169, 201):
            raise 不支持("jsr/ret")
        elif op in (170, 171):
            dflt, 表 = arg
            k = self.数(self.落比较(st.pop()))
            if g.是常量(k.id):
                return ("跳", 表.get(g.常量值(k.id), dflt))
            by_target: dict[int, int] = {}
            for val, t in 表.items():
                by_target[t] = g.或(by_target.get(t, g.假()), g.比("==", k.id, g.常("i", val)))
            分 = [(c, t) for t, c in by_target.items() if t != dflt]
            others = by_target.get(dflt)
            if others is not None:
                分.append((others, dflt))
            # 定得了的分支直接选
            for c, t in 分:
                if self.定值(fr.态, c) is True:
                    return ("跳", t)
            分 = [(c, t) for c, t in 分 if self.定值(fr.态, c) is not False]
            # 同一目标的合到一条，条件按「前面的都不成立」由 区间 处理
            return ("分", [*分, (None, dflt)])
        elif 172 <= op <= 176:
            return ("返回", st.pop())
        elif op == 177:
            return ("返回", None)
        elif op in (178, 179):
            ref: 引用 = cp[arg[0]]
            if op == 178:
                st.append(self.读静态(ref))
            else:
                self.静态[(ref.类, ref.名)] = st.pop()
        elif op == 180:
            ref = cp[arg[0]]
            obj = st.pop()
            st.append(self.取字段(fr.态, obj, ref))
        elif op == 181:
            ref = cp[arg[0]]
            v, obj = st.pop(), st.pop()
            if isinstance(obj, N) and self.是枚举(ref.类):
                raise 不支持("给枚举字段赋值")
            self.写字段(fr.态, obj, ref.名, v, ref.描述)
        elif 182 <= op <= 185:
            ref = cp[arg[0]]
            return self.调用(mc, fr, {182: "virtual", 183: "special", 184: "static", 185: "interface"}[op], ref)
        elif op == 186:
            return self.动态(fr, cp[arg[0]])
        elif op == 187:
            cls = cp[arg[0]][1]
            st.append(对象(cls, self.新对象号()))
        elif op == 188:
            n = self.数(st.pop())
            if not g.是常量(n.id):
                raise 不支持("数组长度是符号")
            t = {4: "i", 5: "i", 6: "f", 7: "d", 8: "i", 9: "i", 10: "i", 11: "j"}[arg[0]]
            st.append(数组([self.常(t, 0) for _ in range(g.常量值(n.id))], t))
        elif op == 189:
            n = self.数(st.pop())
            if not g.是常量(n.id):
                raise 不支持("数组长度是符号")
            st.append(数组([None] * g.常量值(n.id), "L"))
        elif op == 190:
            a = st.pop()
            if not isinstance(a, 数组):
                raise 不支持(f"arraylength 作用在 {a!r}")
            st.append(self.常("i", len(a.元素)))
        elif op == 191:
            return ("死",)
        elif op == 192:
            pass
        elif op == 193:
            cls = cp[arg[0]][1]
            v = st.pop()
            st.append(self.是实例(v, cls))
        elif op in (194, 195):
            st.pop()
        elif op == 197:
            raise 不支持("multianewarray")
        elif op in (198, 199):
            v = st.pop()
            if isinstance(v, 不透明):
                isnull = False
            elif isinstance(v, 条件引用):
                isnull = None
                c = g.假()
                for ci, vi in v.分支:
                    if vi is None:
                        c = g.或(c, ci)
                return self.条件跳(fr, c if op == 198 else g.非(c), arg[0], nxt)
            else:
                isnull = v is None
            return ("跳", arg[0] if (isnull if op == 198 else not isnull) else nxt)
        else:
            raise 不支持(f"操作码 {op}")
        return None

    def 数(self, v: Any) -> N:
        v = self.落比较(v)
        if not isinstance(v, N):
            raise 不支持(f"要数却是 {v!r}")
        return v

    def 算(self, name: str, t: str, a: Any, b: Any) -> N:
        a, b = self.数(a), self.数(b)
        return N(self.g.算(name, t, a.id, b.id), t)

    def 存局部(self, loc: list, i: int, v: Any) -> None:
        while len(loc) <= i + 1:
            loc.append(None)
        loc[i] = v
        if 二槽(v):
            loc[i + 1] = 续

    def 弹槽(self, st: list, n: int) -> list:
        out: list = []
        while len(out) < n:
            v = st.pop()
            out[:0] = [v, 续] if 二槽(v) else [v]
        if len(out) != n:
            raise 不支持("栈操作拆开了 long/double")
        return out

    def 压槽(self, st: list, s: list) -> None:
        for v in s:
            if v is not 续:
                st.append(v)

    def 数组读(self, a: Any, i: Any) -> Any:
        g = self.g
        if isinstance(a, 不透明):
            return self.按描述输入(f"{a.路径}[…]", "F", "实体")
        if not isinstance(a, 数组):
            raise 不支持(f"从非数组读：{a!r}")
        i = self.数(i)
        if g.是常量(i.id):
            return a.元素[g.常量值(i.id)]
        if a.元素 and all(isinstance(e, N) and g.是常量(e.id) for e in a.元素):
            t = a.元素[0].t
            return N(g.查表(t, [g.常量值(e.id) for e in a.元素], i.id), t)
        raise 不支持("符号下标读引用数组")

    def 是实例(self, v: Any, cls: str) -> Any:
        if v is None:
            return self.常("i", 0)
        if isinstance(v, 不透明):
            if v.类 and self.是子类(v.类, cls):
                return self.常("i", 1)
            return self.输入(f"{v.路径} instanceof {cls.split('/')[-1]}", "i", "实体")
        if isinstance(v, 部件):
            return self.常("i", int(self.是子类(部件类, cls)))
        if isinstance(v, 模型实例):
            return self.常("i", int(self.是子类(self.模型类, cls)))
        if isinstance(v, 对象):
            return self.常("i", int(self.是子类(v.类, cls)))
        raise 不支持(f"instanceof {v!r}")

    # ---------- 字段 ----------
    def 取字段(self, 态: 堆态, obj: Any, ref: 引用) -> Any:
        g = self.g
        if isinstance(obj, N):
            # 枚举常量（按序号）的字段：每个常量的值查表
            if not self.是枚举(ref.类):
                raise 不支持(f"在数上读字段 {ref.类}.{ref.名}")
            objs = self.枚举对象(ref.类)
            vals = [self.读字段(态, o, ref.名, ref.描述) for o in objs]
            if g.是常量(obj.id):
                return vals[g.常量值(obj.id)]
            if all(isinstance(v, N) and g.是常量(v.id) for v in vals):
                t = vals[0].t
                return N(g.查表(t, [g.常量值(v.id) for v in vals], obj.id), t)
            raise 不支持(f"符号枚举的引用字段 {ref.类}.{ref.名}")
        return self.读字段(态, obj, ref.名, ref.描述)

    def 读静态(self, ref: 引用) -> Any:
        k = (ref.类, ref.名)
        c = self.类(ref.类)
        if c is not None:
            f = c.找字段(ref.名)
            if f is not None and f.访问 & ACC_ENUM:
                return self.常("i", self.枚举常量(ref.类).index(ref.名))
            if f is not None and f.常量 is not None and f.访问 & ACC_STATIC:
                t = 基本类型(f.描述)
                return self.常(t, f.常量) if t else f.常量
        if k in self.静态:
            return self.静态[k]
        if c is not None and ref.类 not in self._已初始化 and self._跑静态初始化(c, ref):
            self.初始化类(ref.类)
            if k in self.静态:
                return self.静态[k]
        return 不透明(f"{ref.类.split('/')[-1]}.{ref.名}", ref.描述[1:-1] if ref.描述.startswith("L") else None)

    def _跑静态初始化(self, c: 类文件, ref: 引用) -> bool:
        """只为枚举、数值和数组（SwitchMap 这类表）、模型自己类层级的静态字段跑 <clinit>；
        Items.BOW、Blocks.X 这类注册表对象当不透明，不然要具体跑整个注册表（SkeletonModel 卡几分钟）"""
        if self.是枚举(c.名) or 基本类型(ref.描述) or ref.描述.startswith("["):
            return True
        return self.是子类(self.模型类, c.名)

    def 初始化类(self, 类名: str) -> None:
        self._已初始化.add(类名)
        c = self.类(类名)
        if c is None:
            return
        m = c.找方法("<clinit>", "()V")
        if m is None:
            return
        步, 上限 = self.步, self.步数上限
        self.步数上限 = self.步 + 200_000
        try:
            _, 态 = self.跑(c, m, [], 堆态())
            self._静态堆.堆.update(态.堆)
        except 不支持 as e:
            self.警告.append(f"{类名} 的静态初始化跑不了（{e}），它的静态字段当不透明")
        finally:
            self.步数上限 = 上限
            self.步 = 步

    def 枚举对象(self, 类名: str) -> list:
        if 类名 in self._枚举对象:
            return self._枚举对象[类名]
        # 跑 <clinit>，按 putstatic 记下每个常量对应的对象
        c = self.类(类名)
        assert c is not None
        m = c.找方法("<clinit>", "()V")
        if m is None:
            raise 不支持(f"{类名} 没有静态初始化")
        旧 = dict(self.静态)
        _, 态 = self.跑(c, m, [], 堆态())
        objs = []
        for name in self.枚举常量(类名):
            o = self.静态.get((类名, name))
            if not isinstance(o, 对象):
                raise 不支持(f"枚举 {类名}.{name} 没建出对象")
            objs.append(o)
        self._静态堆.堆.update(态.堆)
        # 枚举常量在别处按序号读，这里不留对象
        for k in list(self.静态):
            if k not in 旧 and k[0] == 类名 and k[1] in self.枚举常量(类名):
                del self.静态[k]
        self._枚举对象[类名] = objs
        return objs

    # ---------- 调用 ----------
    def 弹参数(self, st: list, 描述: str) -> list:
        ps, _ = 拆描述(描述)
        args = [st.pop() for _ in ps][::-1]
        return args

    def 调用(self, mc: 方法码, fr: 帧, kind: str, ref: 引用):
        st = fr.栈
        args = self.弹参数(st, ref.描述)
        recv = None if kind == "static" else st.pop()
        rv, 态 = self.派发(fr.态, kind, ref, recv, args)
        fr.态 = 态
        if 态.死:
            return ("死",)
        _, ret = 拆描述(ref.描述)
        if ret != "V":
            if rv is None and 基本类型(ret):
                raise 不支持(f"{ref.类}.{ref.名} 没给返回值")
            st.append(rv)
        return None

    def 派发(self, 态: 堆态, kind: str, ref: 引用, recv: Any, args: list) -> tuple[Any, 堆态]:
        g = self.g
        sig = f"{ref.类}.{ref.名}{ref.描述}"
        _, ret = 拆描述(ref.描述)
        if kind == "static":
            if sig in 内建:
                ids = [self.数(a).id for a in args]
                t = 内建[sig][0]
                return N(g.调(sig, ids), t), 态
            if ref.名 == "values" and self.是枚举(ref.类) and ref.描述 == f"()[L{ref.类};":
                return 数组([self.常("i", i) for i in range(len(self.枚举常量(ref.类)))], "i"), 态
            if ret != "V" and any(isinstance(a, 不透明) for a in args) and not any(isinstance(a, (部件, 条件引用, 模型实例)) for a in args):
                # 拿实体（或从实体取的东西）算个值的静态方法（CrossbowItem.getChargeDuration(entity.getUseItem()) 这类）：结果当输入
                return self.按描述输入(f"{ref.类.split('/')[-1]}.{ref.名}({', '.join(self.参数名(a) for a in args)})", ret, "实体"), 态
            found = self.找方法(ref.类, ref.名, ref.描述)
            if found is None:
                raise 不支持(f"不认识的静态方法 {sig}")
            return self.跑(found[0], found[1], args, 态)
        if isinstance(recv, 条件引用):
            结果 = []
            for ci, vi in recv.分支:
                s2 = 态.复制()
                if not g.是常量(ci):
                    self.记事实(s2, ci, True)
                r, s2 = self.派发(s2, kind, ref, vi, args)
                结果.append((ci, 帧([], [], s2, r, True)))
            合 = 结果[-1][1]
            for ci, f2 in reversed(结果[:-1]):
                合 = self.合帧(ci, f2, 合)
            return 合.返回, 合.态
        # 构造函数
        if ref.名 == "<init>":
            if ref.类 in ("java/lang/Object", "java/lang/Enum"):
                return None, 态
            if ref.类 == "org/joml/Vector3f" and isinstance(recv, 对象):
                if ref.描述 == "(FFF)V":
                    for f, a in zip("xyz", args):
                        self.写字段(态, recv, f, a, "F")
                    return None, 态
                if ref.描述 == "()V":
                    return None, 态
            found = self.找方法(ref.类, "<init>", ref.描述)
            if found is None:
                if isinstance(recv, 模型实例):
                    return None, 态  # 父类构造在 jar 外（不影响部件字段）
                raise 不支持(f"不认识的构造 {sig}")
            return self.跑(found[0], found[1], [recv, *args], 态)
        # 枚举（按序号）上的方法：对每个常量具体跑，查表
        if isinstance(recv, N):
            if ref.名 == "ordinal" and ref.描述 == "()I":
                return recv, 态
            if ref.名 == "hashCode" and ref.描述 == "()I":
                return recv, 态
            if not self.是枚举(ref.类) and not self.是枚举(self._枚举所属(ref.类)):
                raise 不支持(f"在数上调用 {sig}")
            enum_cls = ref.类 if self.是枚举(ref.类) else self._枚举所属(ref.类)
            n = len(self.枚举常量(enum_cls))
            if g.是常量(recv.id):
                k = g.常量值(recv.id)
                found = self.找方法(enum_cls, ref.名, ref.描述)
                if found is None:
                    raise 不支持(f"枚举方法 {sig} 找不到")
                return self.跑(found[0], found[1], [self.常("i", k), *args], 态)
            vals = []
            for k in range(n):
                r, s2 = self.派发(态.复制(), kind, ref, self.常("i", k), args)
                if s2.堆 != 态.堆:
                    raise 不支持(f"枚举方法 {sig} 改了状态")
                vals.append(r)
            if all(isinstance(v, N) and g.是常量(v.id) for v in vals):
                t = vals[0].t
                return N(g.查表(t, [g.常量值(v.id) for v in vals], recv.id), t), 态
            if all(isinstance(v, N) for v in vals):
                r = vals[-1]
                for k in range(n - 2, -1, -1):
                    r = N(g.选(g.比("==", recv.id, g.常("i", k)), vals[k].id, r.id), r.t)
                return r, 态
            raise 不支持(f"符号枚举上 {sig} 返回引用")
        if isinstance(recv, 不透明):
            if ref.名 in ("equals",) and ret == "Z":
                return self.常("i", int(len(args) == 1 and args[0] == recv)), 态
            名 = f"{recv.路径}.{ref.名}({', '.join(self.参数名(a) for a in args)})"
            if ret == "V":
                self.警告.append(f"忽略了实体上的调用 {名}")
                return None, 态
            return self.按描述输入(名, ret, "实体"), 态
        if isinstance(recv, 部件):
            return self.部件方法(态, recv, kind, ref, args)
        if isinstance(recv, 部件流):
            if ref.名 == "forEach" and args and isinstance(args[0], 闭包):
                h = args[0].句柄.目标
                if h.类 == 部件类 and h.名 == "resetPose":
                    return None, self.全部复位(态, recv.根)
            raise 不支持(f"部件流上的 {sig}")
        if isinstance(recv, 对象) and recv.类 == "org/joml/Vector3f":
            if ref.名 in ("x", "y", "z") and ref.描述 == "()F":
                return self.读字段(态, recv, ref.名, "F"), 态
            raise 不支持(f"Vector3f.{ref.名}{ref.描述}")
        if isinstance(recv, str):
            raise 不支持(f"字符串方法 {sig}")
        if isinstance(recv, (模型实例, 对象)):
            cls = self.模型类 if isinstance(recv, 模型实例) else recv.类
            start = ref.类 if kind == "special" else cls
            found = self.找方法(start, ref.名, ref.描述)
            if found is None:
                raise 不支持(f"找不到方法 {sig}（{cls}）")
            return self.跑(found[0], found[1], [recv, *args], 态)
        raise 不支持(f"在 {recv!r} 上调用 {sig}")

    def 参数名(self, a: Any) -> str:
        if isinstance(a, 不透明):
            return a.路径
        if isinstance(a, N) and self.g.是常量(a.id):
            return str(self.g.常量值(a.id))
        if isinstance(a, str):
            return repr(a)
        return "…"

    def _枚举所属(self, 类名: str) -> str:
        # 枚举常量带类体时是匿名子类（HumanoidModel$ArmPose$1），方法引用写的是父类
        c = self.类(类名)
        return c.父类 if c is not None and c.父类 else 类名

    def 部件方法(self, 态: 堆态, p: 部件, kind: str, ref: 引用, args: list) -> tuple[Any, 堆态]:
        if ref.名 == "getChild" and ref.描述 == "(Ljava/lang/String;)L" + 部件类 + ";":
            name = args[0]
            if not isinstance(name, str):
                raise 不支持("getChild 的名字不是常量")
            if self.模型树 is not None and name not in self.模型树.get(p.名, []):
                raise 不支持(f"模型里 {p.名} 下没有 {name}")
            return 部件(name), 态
        if ref.名 == "hasChild":
            if self.模型树 is None:
                raise 不支持("hasChild 要给 --模型")
            return self.常("i", int(args[0] in self.模型树.get(p.名, []))), 态
        if ref.名 == "getAllParts":
            return 部件流(p.名), 态
        if ref.名 in ("render", "visit", "translateAndRotate", "compile", "getRandomCube"):
            raise 不支持(f"setupAnim 里调用 ModelPart.{ref.名}")
        found = self.找方法(部件类, ref.名, ref.描述)
        if found is None:
            raise 不支持(f"ModelPart.{ref.名}{ref.描述} 找不到")
        return self.跑(found[0], found[1], [p, *args], 态)

    def 全部复位(self, 态: 堆态, 根: str) -> 堆态:
        """root().getAllParts().forEach(ModelPart::resetPose)：有模型树就对子树每个部件照字节码跑 resetPose，没有就只认根部件（清掉所有部件的位置、转角）"""
        if self.模型树 is not None:
            待 = [根]
            ref = 引用(部件类, "resetPose", "()V")
            while 待:
                n = 待.pop()
                _, 态 = self.部件方法(态, 部件(n), "virtual", ref, [])
                待.extend(self.模型树.get(n, []))
            态.复位 = 根 == self.根部件
            return 态
        if 根 != self.根部件:
            raise 不支持("子树复位要给 --模型")
        态 = 态.复制()
        for k in [k for k in 态.堆 if k[0][0] == "部件" and k[1] in ("x", "y", "z", "xRot", "yRot", "zRot")]:
            del 态.堆[k]
        态.复位 = True
        return 态

    def 动态(self, fr: 帧, d: 动态调用):
        st = fr.栈
        args = self.弹参数(st, d.描述)
        boot = d.引导.目标
        if boot.类 == "java/lang/invoke/StringConcatFactory" and boot.名 == "makeConcatWithConstants":
            recipe = d.引导参数[0][1]
            it = iter(args)
            out = ""
            for ch in recipe:
                if ch == "\x01":
                    v = next(it)
                    if isinstance(v, str):
                        out += v
                    elif isinstance(v, N) and self.g.是常量(v.id):
                        x = self.g.常量值(v.id)
                        out += str(x)
                    else:
                        raise 不支持("拼接符号字符串")
                else:
                    out += ch
            st.append(out)
            return None
        if boot.类 == "java/lang/invoke/LambdaMetafactory":
            impl = d.引导参数[1]
            st.append(闭包(impl, tuple(args)))
            return None
        raise 不支持(f"invokedynamic {boot.类}.{boot.名}")

    # ---------- 入口 ----------
    def 构造(self, 描述: str | None = None) -> None:
        c = self.类(self.模型类)
        if c is None:
            raise 不支持(f"jar 里没有 {self.模型类}")
        ctor = None
        for m in c.方法们:
            if m.名 == "<init>" and (描述 is None and m.描述.startswith(f"(L{部件类};") or m.描述 == 描述):
                ctor = m
                break
        if ctor is None:
            raise 不支持(f"{self.模型类} 没有以 ModelPart 开头的构造函数")
        ps, _ = 拆描述(ctor.描述)
        args: list[Any] = [self.模型, 部件(self.根部件)]
        for p in ps[1:]:
            t = 基本类型(p)
            args.append(self.常(t, 0) if t else 不透明(f"构造参数 {p}"))
        _, 态 = self.跑(c, ctor, args, 堆态())
        for (k, 字段), v in 态.堆.items():
            if k != ("模型",):
                continue
            if isinstance(v, (部件, 数组, 不透明, 闭包, 对象)) or v is None:
                self.结构字段[字段] = v
            elif isinstance(v, N) and self.g.是常量(v.id):
                desc = self._模型字段描述(字段)
                val = self.g.常量值(v.id)
                if desc.startswith("L") and self.是枚举(desc[1:-1]):
                    val = self.枚举常量(desc[1:-1])[val]
                self.字段默认[字段] = val
        self.构造后堆 = {k: v for k, v in 态.堆.items() if k[0] != ("模型",)}

    def 翻译(self, 带prepare: bool = True) -> dict:
        self.构造()
        ent = 不透明("entity", 实体类)
        态 = 堆态()
        # 构造函数里改过的部件字段（少见）带进来
        for k, v in getattr(self, "构造后堆", {}).items():
            if k[0][0] == "部件":
                态.堆[k] = v
        方法们 = []
        if 带prepare:
            found = self.找方法(self.模型类, "prepareMobModel", f"(L{实体类};FFF)V")
            if found is not None and found[0].名 != "net/minecraft/client/model/EntityModel":
                args = [self.模型, ent] + [self.输入(n, "f", "参数") for n in prepare参数]
                _, 态 = self.跑(found[0], found[1], args, 态)
                方法们.append(f"{found[0].名}.prepareMobModel")
        found = self.找方法(self.模型类, "setupAnim", f"(L{实体类};FFFFF)V")
        if found is None:
            raise 不支持(f"{self.模型类} 找不到 setupAnim")
        args = [self.模型, ent] + [self.输入(n, "f", "参数") for n in setupAnim参数]
        _, 态 = self.跑(found[0], found[1], args, 态)
        方法们.append(f"{found[0].名}.setupAnim")
        return self.导出(态, 方法们)

    def 导出(self, 态: 堆态, 方法们: list[str]) -> dict:
        outs: dict[str, dict[str, int]] = {}
        roots: list[int] = []
        for (k, 字段), v in sorted(态.堆.items(), key=lambda kv: (str(kv[0][0]), kv[0][1])):
            if k[0] != "部件" or 字段 not in 姿态字段:
                continue
            if not isinstance(v, N):
                raise 不支持(f"部件 {k[1]}.{字段} 的值不是数：{v!r}")
            outs.setdefault(k[1], {})[字段] = v.id
            roots.append(v.id)
        nodes, 新号 = self.g.导出(roots)
        输出 = {p: {f: 新号[i] for f, i in fs.items()} for p, fs in outs.items()}
        用到 = {e[2] for e in nodes if e[0] == "in"}
        输入 = {k: v for k, v in self.输入表.items() if k in 用到}
        return {
            "格式": "姿态程序/1",
            "模型类": self.模型类.replace("/", "."),
            "方法": 方法们,
            "复位": 态.复位,
            "输入": 输入,
            "固定": self.固定,
            "节点": nodes,
            "输出": 输出,
            "警告": self.警告,
        }
