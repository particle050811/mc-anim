"""姿态程序的表达式图：节点去重（同式同号）、常量折叠、JSON 序列化，和一个照 JVM 语义求值的参考实现（测试用；渲染端的在 engine/anim/姿态程序.ts）。

节点 = (op, 类型, 参数...)，类型：i int32、j long、f float32、d double、z 条件（真假）。参数里的整数是前面节点的编号。
  c   常量             ["c", t, 值]
  in  输入             ["in", t, 名]
  rest 部件初始姿态    ["rest", "f", 部件, 字段]       字段 x y z xRot yRot zRot，值取模型 JSON 里部件的 pose
  + - * / % neg        ["+", t, a, b]                  f/d 按 IEEE（f 每步舍入到 float32），i 按 32 位补码，/ % 向零
  shl shr ushr and or xor                              i/j
  conv                 ["conv", 目标t, a]              Java 的 i2f、f2i（NaN→0、饱和）等
  < <= > >= == !=      ["<", "z", a, b]                NaN 时都为假（!= 为真）；fcmpl/fcmpg 的差别在翻译时用 not 表达
  not and or           ["not", "z", a]
  sel                  ["sel", t, 条件, 真, 假]
  call                 ["call", t, 函数, a...]         函数见 内建；名字带 JVM 描述符，版本间语义变了不会认错
  tab                  ["tab", t, [值...], 下标]       下标越界取 0
"""

from __future__ import annotations

import math
import struct
from typing import Any

类型们 = ("i", "j", "f", "d", "z")


def f32(x: float) -> float:
    try:
        return struct.unpack(">f", struct.pack(">f", x))[0]
    except OverflowError:
        return math.copysign(math.inf, x)


def i32(x: int) -> int:
    x &= 0xFFFFFFFF
    return x - (1 << 32) if x & 0x80000000 else x


def i64(x: int) -> int:
    x &= 0xFFFFFFFFFFFFFFFF
    return x - (1 << 64) if x & (1 << 63) else x


def _转整(x: float, lo: int, hi: int) -> int:
    if math.isnan(x):
        return 0
    if x >= hi:
        return hi
    if x <= lo:
        return lo
    return int(x)  # 向零


def 转换(v: Any, 从: str, 到: str) -> Any:
    if 从 == 到:
        return v
    if 到 == "f":
        return f32(float(v))
    if 到 == "d":
        return float(v)
    if 到 == "i":
        return _转整(v, -(2**31), 2**31 - 1) if 从 in "fd" else i32(int(v))
    if 到 == "j":
        return _转整(v, -(2**63), 2**63 - 1) if 从 in "fd" else i64(int(v))
    raise ValueError(f"不支持的转换 {从}→{到}")


def _窄(v: Any, t: str) -> Any:
    return f32(v) if t == "f" else i32(v) if t == "i" else i64(v) if t == "j" else v


def _整除(a: int, b: int) -> int:
    if b == 0:
        raise ZeroDivisionError("整数除以 0（JVM 会抛 ArithmeticException）")
    q = abs(a) // abs(b)
    return q if (a >= 0) == (b >= 0) else -q


def _浮余(a: float, b: float) -> float:
    if math.isnan(a) or math.isnan(b) or math.isinf(a) or b == 0:
        return math.nan
    if math.isinf(b):
        return a
    return math.fmod(a, b)


def 算术(op: str, t: str, a: Any, b: Any = None) -> Any:
    if op == "neg":
        return _窄(-a, t)
    if t in "fd":
        if op == "+":
            r = a + b
        elif op == "-":
            r = a - b
        elif op == "*":
            r = a * b
        elif op == "/":
            if b == 0:
                r = math.nan if (a == 0 or math.isnan(a)) else math.copysign(math.inf, a) * math.copysign(1, b)
            else:
                r = a / b
        elif op == "%":
            r = _浮余(a, b)
        else:
            raise ValueError(op)
        return _窄(r, t)
    位 = 32 if t == "i" else 64
    if op == "+":
        r = a + b
    elif op == "-":
        r = a - b
    elif op == "*":
        r = a * b
    elif op == "/":
        r = _整除(a, b)
    elif op == "%":
        r = a - _整除(a, b) * b
    elif op == "shl":
        r = a << (b & (位 - 1))
    elif op == "shr":
        r = a >> (b & (位 - 1))
    elif op == "ushr":
        r = (a & ((1 << 位) - 1)) >> (b & (位 - 1))
    elif op == "and":
        r = a & b
    elif op == "or":
        r = a | b
    elif op == "xor":
        r = a ^ b
    else:
        raise ValueError(op)
    return _窄(r, t)


def 比较(op: str, a: Any, b: Any) -> bool:
    if op == "<":
        return a < b
    if op == "<=":
        return a <= b
    if op == ">":
        return a > b
    if op == ">=":
        return a >= b
    if op == "==":
        return a == b
    if op == "!=":
        return not (a == b)
    raise ValueError(op)


# ---------- 内建函数：名字 = 类.方法(描述符)，实现照该版本的字节码 ----------
_SIN = [f32(math.sin(i * math.pi * 2.0 / 65536.0)) for i in range(65536)]


def _mth_sin(x: float) -> float:
    return _SIN[_转整(f32(x * f32(10430.378)), -(2**31), 2**31 - 1) & 65535]


def _mth_cos(x: float) -> float:
    return _SIN[_转整(f32(f32(x * f32(10430.378)) + 16384.0), -(2**31), 2**31 - 1) & 65535]


def _jmin(a: float, b: float) -> float:
    if math.isnan(a) or math.isnan(b):
        return math.nan
    if a == b == 0:
        return a if math.copysign(1, a) < 0 else b
    return min(a, b)


def _jmax(a: float, b: float) -> float:
    if math.isnan(a) or math.isnan(b):
        return math.nan
    if a == b == 0:
        return a if math.copysign(1, a) > 0 else b
    return max(a, b)


def _clampf(v: float, lo: float, hi: float) -> float:
    # 1.20.1 Mth.clamp(FFF)F、clamp(DDD)D：v < lo ? lo : Math.min(v, hi)
    return lo if v < lo else _jmin(v, hi)


def _mth_floor_f(x: float) -> int:
    # 1.20.1 Mth.floor(F)I：i = (int) x；x < (float) i ? i - 1 : i。比 -2^31 还小时 i - 1 溢出成 2^31 - 1，照抄
    i = _转整(x, -(2**31), 2**31 - 1)
    return i32(i - 1) if x < f32(float(i)) else i


def _wrap_deg_f(x: float) -> float:
    # Mth.wrapDegrees(F)F：f = x % 360；f >= 180 → f - 360；f < -180 → f + 360
    f = f32(_浮余(x, 360.0))
    if f >= 180.0:
        f = f32(f - 360.0)
    if f < -180.0:
        f = f32(f + 360.0)
    return f


_PI_F = f32(math.pi)
_TAU_F = f32(math.pi * 2)


def _rotlerp_rad(a: float, b: float, t: float) -> float:
    """ModelUtils.rotlerpRad(FFF)F（1.20.1）：d = b - a；while (d < -π) d += 2π；while (d >= π) d -= 2π；return a + t * d。
    循环次数取决于输入，翻译器跑不了，所以做成内建。差太大（|d| 过 2^25 左右，加减 2π 不动了）或是无穷、NaN 时 JVM 永远不返回，这里给 NaN"""
    d = f32(b - a)
    n = 0
    while d < -_PI_F:
        e = f32(d + _TAU_F)
        if e == d or n >= 1 << 24:
            return math.nan
        d, n = e, n + 1
    while d >= _PI_F:
        e = f32(d - _TAU_F)
        if e == d or n >= 1 << 24:
            return math.nan
        d, n = e, n + 1
    return f32(a + f32(t * d))


def _jvm(f: Any) -> Any:
    """Python 的 math 遇到定义域外、溢出抛异常，JVM 给 NaN、无穷"""

    def g(*a: float) -> float:
        try:
            return f(*a)
        except ValueError:
            return math.nan
        except OverflowError:
            return math.inf

    return g


def _pow(a: float, b: float) -> float:
    try:
        return math.pow(a, b)
    except ValueError:
        if a == 0 and b < 0:  # Math.pow(±0, 负)：±无穷（负零配奇数次方才是负的）
            return -math.inf if math.copysign(1, a) < 0 and b.is_integer() and b % 2 == 1 else math.inf
        return math.nan
    except OverflowError:
        return math.inf if a > 0 or b.is_integer() and b % 2 == 0 else -math.inf


内建: dict[str, tuple[str, Any]] = {
    # 类型, 实现（参数已是对应 JVM 类型的值）
    "net/minecraft/util/Mth.sin(F)F": ("f", _mth_sin),
    "net/minecraft/util/Mth.cos(F)F": ("f", _mth_cos),
    "net/minecraft/util/Mth.sqrt(F)F": ("f", lambda x: f32(math.sqrt(x)) if x >= 0 else math.nan),
    "net/minecraft/util/Mth.abs(F)F": ("f", lambda x: abs(x)),
    "net/minecraft/util/Mth.abs(I)I": ("i", lambda x: i32(abs(x))),
    "net/minecraft/util/Mth.clamp(FFF)F": ("f", _clampf),
    # 1.20.1 是 Math.min(Math.max(v, lo), hi)：lo > hi 时取 hi
    "net/minecraft/util/Mth.clamp(III)I": ("i", lambda v, lo, hi: min(max(v, lo), hi)),
    "net/minecraft/util/Mth.clamp(DDD)D": ("d", _clampf),
    "net/minecraft/util/Mth.lerp(FFF)F": ("f", lambda t, a, b: f32(a + f32(t * f32(b - a)))),
    "net/minecraft/util/Mth.lerp(DDD)D": ("d", lambda t, a, b: a + t * (b - a)),
    "net/minecraft/util/Mth.wrapDegrees(F)F": ("f", _wrap_deg_f),
    "net/minecraft/util/Mth.square(F)F": ("f", lambda x: f32(x * x)),
    "net/minecraft/util/Mth.floor(F)I": ("i", _mth_floor_f),
    "net/minecraft/client/model/ModelUtils.rotlerpRad(FFF)F": ("f", _rotlerp_rad),
    "java/lang/Math.sin(D)D": ("d", _jvm(math.sin)),
    "java/lang/Math.cos(D)D": ("d", _jvm(math.cos)),
    "java/lang/Math.sqrt(D)D": ("d", lambda x: math.sqrt(x) if x >= 0 else math.nan),
    "java/lang/Math.abs(F)F": ("f", lambda x: abs(x)),
    "java/lang/Math.abs(D)D": ("d", lambda x: abs(x)),
    "java/lang/Math.abs(I)I": ("i", lambda x: i32(abs(x))),
    "java/lang/Math.min(FF)F": ("f", _jmin),
    "java/lang/Math.max(FF)F": ("f", _jmax),
    "java/lang/Math.min(DD)D": ("d", _jmin),
    "java/lang/Math.max(DD)D": ("d", _jmax),
    "java/lang/Math.min(II)I": ("i", min),
    "java/lang/Math.max(II)I": ("i", max),
    "java/lang/Math.pow(DD)D": ("d", _pow),
    "java/lang/Math.atan2(DD)D": ("d", _jvm(math.atan2)),
    "java/lang/Math.exp(D)D": ("d", _jvm(math.exp)),
    "java/lang/Math.signum(F)F": ("f", lambda x: x if x == 0 or math.isnan(x) else math.copysign(1.0, x)),
}


class 图:
    def __init__(self) -> None:
        self.节点: list[tuple] = []
        self._号: dict[tuple, int] = {}

    def 类型(self, n: int) -> str:
        return self.节点[n][1]

    def 常量值(self, n: int) -> Any:
        e = self.节点[n]
        return e[2] if e[0] == "c" else None

    def 是常量(self, n: int) -> bool:
        return self.节点[n][0] == "c"

    def _加(self, e: tuple) -> int:
        k = tuple(tuple(x) if isinstance(x, list) else x for x in e)
        if e[0] == "c":
            # 0.0 和 -0.0、NaN 按位区分
            v = e[2]
            k = ("c", e[1], struct.pack(">d", v) if isinstance(v, float) else v)
        got = self._号.get(k)
        if got is not None:
            return got
        self.节点.append(e)
        self._号[k] = len(self.节点) - 1
        return len(self.节点) - 1

    def 常(self, t: str, v: Any) -> int:
        if t == "z":
            v = bool(v)
        else:
            v = _窄(v if t in "fd" else int(v), t) if t != "d" else float(v)
        return self._加(("c", t, v))

    def 真(self) -> int:
        return self.常("z", True)

    def 假(self) -> int:
        return self.常("z", False)

    def 输入(self, t: str, 名: str) -> int:
        return self._加(("in", t, 名))

    def 初始(self, 部件: str, 字段: str) -> int:
        return self._加(("rest", "f", 部件, 字段))

    def 算(self, op: str, t: str, a: int, b: int | None = None) -> int:
        if op == "neg":
            if self.是常量(a):
                return self.常(t, 算术("neg", t, self.常量值(a)))
            return self._加(("neg", t, a))
        assert b is not None
        if self.是常量(a) and self.是常量(b):
            return self.常(t, 算术(op, t, self.常量值(a), self.常量值(b)))
        if op == "*" and t in "fd":
            # x*1 和 1*x 对所有浮点数（含 NaN、-0）都等于 x
            if self.常量值(b) == 1.0 and self.是常量(b):
                return a
            if self.常量值(a) == 1.0 and self.是常量(a):
                return b
        return self._加((op, t, a, b))

    def 转(self, 到: str, a: int) -> int:
        从 = self.类型(a)
        if 从 == 到:
            return a
        if self.是常量(a):
            return self.常(到, 转换(self.常量值(a), 从, 到))
        return self._加(("conv", 到, a))

    def 比(self, op: str, a: int, b: int) -> int:
        if self.是常量(a) and self.是常量(b):
            return self.常("z", 比较(op, self.常量值(a), self.常量值(b)))
        # sel(c, k1, k2) 和常量比：boolean 局部变量（iconst_1/iconst_0 在汇合处合成 sel）再 ifeq 时化回 c
        for x, y, flip in ((a, b, False), (b, a, True)):
            ex = self.节点[x]
            if ex[0] == "sel" and self.是常量(y) and self.是常量(ex[3]) and self.是常量(ex[4]):
                yo = self.常量值(y)
                o = {"<": ">", ">": "<", "<=": ">=", ">=": "<="}.get(op, op) if flip else op
                r1, r2 = 比较(o, self.常量值(ex[3]), yo), 比较(o, self.常量值(ex[4]), yo)
                if r1 and not r2:
                    return ex[2]
                if r2 and not r1:
                    return self.非(ex[2])
                return self.常("z", r1)
        return self._加((op, "z", a, b))

    def 非(self, a: int) -> int:
        e = self.节点[a]
        if e[0] == "c":
            return self.常("z", not e[2])
        if e[0] == "not":
            return e[2]
        return self._加(("not", "z", a))

    def 且(self, a: int, b: int) -> int:
        for x, y in ((a, b), (b, a)):
            if self.是常量(x):
                return y if self.常量值(x) else self.假()
        if a == b:
            return a
        return self._加(("and", "z", a, b))

    def 或(self, a: int, b: int) -> int:
        for x, y in ((a, b), (b, a)):
            if self.是常量(x):
                return self.真() if self.常量值(x) else y
        if a == b:
            return a
        return self._加(("or", "z", a, b))

    def 选(self, c: int, a: int, b: int) -> int:
        if a == b:
            return a
        if self.是常量(c):
            return a if self.常量值(c) else b
        t = self.类型(a)
        if t != self.类型(b):
            raise ValueError(f"sel 两边类型不同：{t} / {self.类型(b)}")
        if self.节点[c][0] == "not":
            return self.选(self.节点[c][2], b, a)
        if t == "z":
            return self.或(self.且(c, a), self.且(self.非(c), b))
        return self._加(("sel", t, c, a, b))

    def 调(self, 函数: str, 参数: list[int]) -> int:
        t, impl = 内建[函数]
        if all(self.是常量(p) for p in 参数):
            return self.常(t, impl(*[self.常量值(p) for p in 参数]))
        return self._加(("call", t, 函数, *参数))

    def 查表(self, t: str, 值们: list[Any], 下标: int) -> int:
        if self.是常量(下标):
            k = self.常量值(下标)
            return self.常(t, 值们[k] if 0 <= k < len(值们) else 0)
        if all(v == 值们[0] for v in 值们):
            return self.常(t, 值们[0])
        return self._加(("tab", t, list(值们), 下标))

    # ---------- 输出 ----------
    def 导出(self, 根们: list[int]) -> tuple[list[list[Any]], dict[int, int]]:
        """只留根们用到的节点，按拓扑序（参数在前）重新编号"""
        用: set[int] = set()
        待 = list(根们)
        while 待:
            n = 待.pop()
            if n in 用:
                continue
            用.add(n)
            待.extend(self.子(n))
        新号: dict[int, int] = {}
        out: list[list[Any]] = []
        for n in sorted(用):
            e = self.节点[n]
            子们 = set(self.子(n))
            row: list[Any] = [e[0], e[1]]
            for i, x in enumerate(e[2:]):
                pos = i + 2
                if self._是引用位(e, pos) and x in 子们:
                    row.append(新号[x])
                else:
                    row.append(_json值(x))
            新号[n] = len(out)
            out.append(row)
        return out, 新号

    @staticmethod
    def _是引用位(e: tuple, pos: int) -> bool:
        op = e[0]
        if op in ("c", "in", "rest"):
            return False
        if op == "call":
            return pos >= 3
        if op == "tab":
            return pos == 3
        return True

    def 子(self, n: int) -> list[int]:
        e = self.节点[n]
        return [x for i, x in enumerate(e[2:]) if self._是引用位(e, i + 2)]


def _json值(x: Any) -> Any:
    if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
        return "NaN" if math.isnan(x) else ("Infinity" if x > 0 else "-Infinity")
    if isinstance(x, int) and not isinstance(x, bool) and abs(x) > 2**53:
        return str(x)  # long 常量：JS 的 JSON.parse 读成 double 会丢位，写成串
    if isinstance(x, list):
        return [_json值(v) for v in x]
    return x


def _读值(x: Any) -> Any:
    if x == "NaN":
        return math.nan
    if x == "Infinity":
        return math.inf
    if x == "-Infinity":
        return -math.inf
    if isinstance(x, str):
        return int(x)
    return x


def 求值(节点们: list[list[Any]], 输入: dict[str, Any], 初始: dict[str, dict[str, float]]) -> list[Any]:
    """参考实现：按 JVM 语义算导出后的节点表，返回每个节点的值"""
    v: list[Any] = []
    for e in 节点们:
        op, t = e[0], e[1]
        if op == "c":
            r = _读值(e[2])
        elif op == "in":
            r = 输入[e[2]]
            if t == "f":
                r = f32(float(r))
        elif op == "rest":
            r = f32(初始[e[2]][e[3]])
        elif op == "conv":
            r = 转换(v[e[2]], 节点们[e[2]][1], t)
        elif op in ("<", "<=", ">", ">=", "==", "!="):
            r = 比较(op, v[e[2]], v[e[3]])
        elif op == "not":
            r = not v[e[2]]
        elif op == "and" and t == "z":  # 逻辑与；int / long 的 and 是按位与，走 算术
            r = v[e[2]] and v[e[3]]
        elif op == "or" and t == "z":
            r = v[e[2]] or v[e[3]]
        elif op == "sel":
            r = v[e[3]] if v[e[2]] else v[e[4]]
        elif op == "call":
            r = 内建[e[2]][1](*[v[a] for a in e[3:]])
        elif op == "tab":
            k = v[e[3]]
            r = _读值(e[2][k]) if 0 <= k < len(e[2]) else 0
        elif op == "neg":
            r = 算术("neg", t, v[e[2]])
        else:
            r = 算术(op, t, v[e[2]], v[e[3]])
        v.append(r)
    return v
