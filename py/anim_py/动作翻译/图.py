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


def _to_int(x: float, lo: int, hi: int) -> int:
    if math.isnan(x):
        return 0
    if x >= hi:
        return hi
    if x <= lo:
        return lo
    return int(x)  # 向零


def convert(v: Any, src_type: str, to_type: str) -> Any:
    if src_type == to_type:
        return v
    if to_type == "f":
        return f32(float(v))
    if to_type == "d":
        return float(v)
    if to_type == "i":
        return _to_int(v, -(2**31), 2**31 - 1) if src_type in "fd" else i32(int(v))
    if to_type == "j":
        return _to_int(v, -(2**63), 2**63 - 1) if src_type in "fd" else i64(int(v))
    raise ValueError(f"不支持的转换 {src_type}→{to_type}")


def _narrow(v: Any, t: str) -> Any:
    return f32(v) if t == "f" else i32(v) if t == "i" else i64(v) if t == "j" else v


def _floor_div(a: int, b: int) -> int:
    if b == 0:
        raise ZeroDivisionError("整数除以 0（JVM 会抛 ArithmeticException）")
    q = abs(a) // abs(b)
    return q if (a >= 0) == (b >= 0) else -q


def _float_mod(a: float, b: float) -> float:
    if math.isnan(a) or math.isnan(b) or math.isinf(a) or b == 0:
        return math.nan
    if math.isinf(b):
        return a
    return math.fmod(a, b)


def arithmetic(op: str, t: str, a: Any, b: Any = None) -> Any:
    if op == "neg":
        return _narrow(-a, t)
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
            r = _float_mod(a, b)
        else:
            raise ValueError(op)
        return _narrow(r, t)
    bit_width = 32 if t == "i" else 64
    if op == "+":
        r = a + b
    elif op == "-":
        r = a - b
    elif op == "*":
        r = a * b
    elif op == "/":
        r = _floor_div(a, b)
    elif op == "%":
        r = a - _floor_div(a, b) * b
    elif op == "shl":
        r = a << (b & (bit_width - 1))
    elif op == "shr":
        r = a >> (b & (bit_width - 1))
    elif op == "ushr":
        r = (a & ((1 << bit_width) - 1)) >> (b & (bit_width - 1))
    elif op == "and":
        r = a & b
    elif op == "or":
        r = a | b
    elif op == "xor":
        r = a ^ b
    else:
        raise ValueError(op)
    return _narrow(r, t)


def compare(op: str, a: Any, b: Any) -> bool:
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
    return _SIN[_to_int(f32(x * f32(10430.378)), -(2**31), 2**31 - 1) & 65535]


def _mth_cos(x: float) -> float:
    return _SIN[_to_int(f32(f32(x * f32(10430.378)) + 16384.0), -(2**31), 2**31 - 1) & 65535]


def _mth_sin_d(x: float) -> float:
    """1.21.x 的 Mth.sin(D)F：乘的是 double 常量、(long) 强转再 & 65535（1.20.1 是 float 乘、(int)）"""
    return _SIN[_to_int(x * 10430.378350470453, -(2**63), 2**63 - 1) & 65535]


def _mth_cos_d(x: float) -> float:
    return _SIN[_to_int(x * 10430.378350470453 + 16384.0, -(2**63), 2**63 - 1) & 65535]


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
    i = _to_int(x, -(2**31), 2**31 - 1)
    return i32(i - 1) if x < f32(float(i)) else i


def _wrap_deg_f(x: float) -> float:
    # Mth.wrapDegrees(F)F：f = x % 360；f >= 180 → f - 360；f < -180 → f + 360
    f = f32(_float_mod(x, 360.0))
    if f >= 180.0:
        f = f32(f - 360.0)
    if f < -180.0:
        f = f32(f + 360.0)
    return f


_PI_F = f32(math.pi)
_TAU_F = f32(math.pi * 2)


def _rotlerp_rad(a: float, b: float, t: float) -> float:
    """ModelUtils.rotlerpRad(FFF)F（1.20.1）：d = b - a；while (d < -π) d += 2π；while (d >= π) d -= 2π；return a + t * d。
    循环次数取决于输入，翻译器跑不了，所以做成内建。差太大（|d| 过 2^27，加减 2π 不动了）或是无穷时 JVM 永远不返回，这里给 NaN；
    差是 NaN 时两个比较都不成立，照 JVM 直接返回 NaN。不设次数上限：还在动就单调逼近、一定会停（2^27 以内最多约 1810 万圈，照样算）"""
    d = f32(b - a)
    while d < -_PI_F:
        e = f32(d + _TAU_F)
        if e == d:
            return math.nan
        d = e
    while d >= _PI_F:
        e = f32(d - _TAU_F)
        if e == d:
            return math.nan
        d = e
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
    # Java 的 Math.pow(±1, ±无穷 或 NaN) 是 NaN，C 的 pow 给 1
    if abs(a) == 1 and not math.isfinite(b):
        return math.nan
    try:
        return math.pow(a, b)
    except ValueError:
        if a == 0 and b < 0:  # Math.pow(±0, 负)：±无穷（负零配奇数次方才是负的）
            return -math.inf if math.copysign(1, a) < 0 and b.is_integer() and b % 2 == 1 else math.inf
        return math.nan
    except OverflowError:
        return math.inf if a > 0 or b.is_integer() and b % 2 == 0 else -math.inf


builtin_funcs: dict[str, tuple[str, Any]] = {
    # 类型, 实现（参数已是对应 JVM 类型的值）
    "net/minecraft/util/Mth.sin(F)F": ("f", _mth_sin),
    "net/minecraft/util/Mth.cos(F)F": ("f", _mth_cos),
    "net/minecraft/util/Mth.sin(D)F": ("f", _mth_sin_d),
    "net/minecraft/util/Mth.cos(D)F": ("f", _mth_cos_d),
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
    # 1.21.x 挪进 Mth、参数次序改成 (t, 从, 到)，算法一样
    "net/minecraft/util/Mth.rotLerpRad(FFF)F": ("f", lambda t, a, b: _rotlerp_rad(a, b, t)),
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


class ExprGraph:
    def __init__(self) -> None:
        self.graph_nodes: list[tuple] = []
        self._ids: dict[tuple, int] = {}

    def node_type(self, n: int) -> str:
        return self.graph_nodes[n][1]

    def constant_of(self, n: int) -> Any:
        e = self.graph_nodes[n]
        return e[2] if e[0] == "c" else None

    def is_constant(self, n: int) -> bool:
        return self.graph_nodes[n][0] == "c"

    def _add(self, e: tuple) -> int:
        k = tuple(tuple(x) if isinstance(x, list) else x for x in e)
        if e[0] == "c":
            # 0.0 和 -0.0、NaN 按位区分
            v = e[2]
            k = ("c", e[1], struct.pack(">d", v) if isinstance(v, float) else v)
        got = self._ids.get(k)
        if got is not None:
            return got
        self.graph_nodes.append(e)
        self._ids[k] = len(self.graph_nodes) - 1
        return len(self.graph_nodes) - 1

    def const_node(self, t: str, v: Any) -> int:
        if t == "z":
            v = bool(v)
        else:
            v = _narrow(v if t in "fd" else int(v), t) if t != "d" else float(v)
        return self._add(("c", t, v))

    def const_true(self) -> int:
        return self.const_node("z", True)

    def false_node(self) -> int:
        return self.const_node("z", False)

    def input_node(self, t: str, input_name: str) -> int:
        return self._add(("in", t, input_name))

    def initial(self, part: str, field: str) -> int:
        return self._add(("rest", "f", part, field))

    def calc(self, op: str, t: str, a: int, b: int | None = None) -> int:
        if op == "neg":
            if self.is_constant(a):
                return self.const_node(t, arithmetic("neg", t, self.constant_of(a)))
            return self._add(("neg", t, a))
        assert b is not None
        if self.is_constant(a) and self.is_constant(b):
            return self.const_node(t, arithmetic(op, t, self.constant_of(a), self.constant_of(b)))
        if op == "*" and t in "fd":
            # x*1 和 1*x 对所有浮点数（含 NaN、-0）都等于 x
            if self.constant_of(b) == 1.0 and self.is_constant(b):
                return a
            if self.constant_of(a) == 1.0 and self.is_constant(a):
                return b
        return self._add((op, t, a, b))

    def convert_node(self, to_type: str, a: int) -> int:
        src_type = self.node_type(a)
        if src_type == to_type:
            return a
        if self.is_constant(a):
            return self.const_node(to_type, convert(self.constant_of(a), src_type, to_type))
        return self._add(("conv", to_type, a))

    def compare(self, op: str, a: int, b: int) -> int:
        if self.is_constant(a) and self.is_constant(b):
            return self.const_node("z", compare(op, self.constant_of(a), self.constant_of(b)))
        # sel(c, k1, k2) 和常量比：boolean 局部变量（iconst_1/iconst_0 在汇合处合成 sel）再 ifeq 时化回 c
        for x, y, flip in ((a, b, False), (b, a, True)):
            ex = self.graph_nodes[x]
            if ex[0] == "sel" and self.is_constant(y) and self.is_constant(ex[3]) and self.is_constant(ex[4]):
                yo = self.constant_of(y)
                o = {"<": ">", ">": "<", "<=": ">=", ">=": "<="}.get(op, op) if flip else op
                r1, r2 = compare(o, self.constant_of(ex[3]), yo), compare(o, self.constant_of(ex[4]), yo)
                if r1 and not r2:
                    return ex[2]
                if r2 and not r1:
                    return self.logical_not(ex[2])
                return self.const_node("z", r1)
        return self._add((op, "z", a, b))

    def logical_not(self, a: int) -> int:
        e = self.graph_nodes[a]
        if e[0] == "c":
            return self.const_node("z", not e[2])
        if e[0] == "not":
            return e[2]
        return self._add(("not", "z", a))

    def logical_and(self, a: int, b: int) -> int:
        for x, y in ((a, b), (b, a)):
            if self.is_constant(x):
                return y if self.constant_of(x) else self.false_node()
        if a == b:
            return a
        return self._add(("and", "z", a, b))

    def logical_or(self, a: int, b: int) -> int:
        for x, y in ((a, b), (b, a)):
            if self.is_constant(x):
                return self.const_true() if self.constant_of(x) else y
        if a == b:
            return a
        return self._add(("or", "z", a, b))

    def select(self, c: int, a: int, b: int) -> int:
        if a == b:
            return a
        if self.is_constant(c):
            return a if self.constant_of(c) else b
        t = self.node_type(a)
        if t != self.node_type(b):
            raise ValueError(f"sel 两边类型不同：{t} / {self.node_type(b)}")
        if self.graph_nodes[c][0] == "not":
            return self.select(self.graph_nodes[c][2], b, a)
        if t == "z":
            return self.logical_or(self.logical_and(c, a), self.logical_and(self.logical_not(c), b))
        return self._add(("sel", t, c, a, b))

    def call_node(self, func_sig: str, params: list[int]) -> int:
        t, impl = builtin_funcs[func_sig]
        if all(self.is_constant(p) for p in params):
            return self.const_node(t, impl(*[self.constant_of(p) for p in params]))
        return self._add(("call", t, func_sig, *params))

    def table_lookup(self, t: str, values: list[Any], index_node: int) -> int:
        if self.is_constant(index_node):
            k = self.constant_of(index_node)
            return self.const_node(t, values[k] if 0 <= k < len(values) else 0)
        if all(v == values[0] for v in values):
            return self.const_node(t, values[0])
        return self._add(("tab", t, list(values), index_node))

    # ---------- 输出 ----------
    def export_graph(self, roots: list[int]) -> tuple[list[list[Any]], dict[int, int]]:
        """只留根们用到的节点，按拓扑序（参数在前）重新编号"""
        used: set[int] = set()
        pending = list(roots)
        while pending:
            n = pending.pop()
            if n in used:
                continue
            used.add(n)
            pending.extend(self.child_ids(n))
        new_ids: dict[int, int] = {}
        out: list[list[Any]] = []
        for n in sorted(used):
            e = self.graph_nodes[n]
            children = set(self.child_ids(n))
            row: list[Any] = [e[0], e[1]]
            for i, x in enumerate(e[2:]):
                pos = i + 2
                if self._is_ref_slot(e, pos) and x in children:
                    row.append(new_ids[x])
                else:
                    row.append(_json_value(x))
            new_ids[n] = len(out)
            out.append(row)
        return out, new_ids

    @staticmethod
    def _is_ref_slot(e: tuple, pos: int) -> bool:
        op = e[0]
        if op in ("c", "in", "rest"):
            return False
        if op == "call":
            return pos >= 3
        if op == "tab":
            return pos == 3
        return True

    def child_ids(self, n: int) -> list[int]:
        e = self.graph_nodes[n]
        return [x for i, x in enumerate(e[2:]) if self._is_ref_slot(e, i + 2)]


def _json_value(x: Any) -> Any:
    if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
        return "NaN" if math.isnan(x) else ("Infinity" if x > 0 else "-Infinity")
    if isinstance(x, int) and not isinstance(x, bool) and abs(x) > 2**53:
        return str(x)  # long 常量：JS 的 JSON.parse 读成 double 会丢位，写成串
    if isinstance(x, list):
        return [_json_value(v) for v in x]
    return x


def _read_value(x: Any) -> Any:
    if x == "NaN":
        return math.nan
    if x == "Infinity":
        return math.inf
    if x == "-Infinity":
        return -math.inf
    if isinstance(x, str):
        return int(x)
    return x


def evaluate(nodes: list[list[Any]], inputs: dict[str, Any], initial: dict[str, dict[str, float]]) -> list[Any]:
    """参考实现：按 JVM 语义算导出后的节点表，返回每个节点的值"""
    v: list[Any] = []
    for e in nodes:
        op, t = e[0], e[1]
        if op == "c":
            r = _read_value(e[2])
        elif op == "in":
            r = inputs[e[2]]
            if t == "f":
                r = f32(float(r))
        elif op == "rest":
            r = f32(initial[e[2]][e[3]])
        elif op == "conv":
            r = convert(v[e[2]], nodes[e[2]][1], t)
        elif op in ("<", "<=", ">", ">=", "==", "!="):
            r = compare(op, v[e[2]], v[e[3]])
        elif op == "not":
            r = not v[e[2]]
        elif op == "and" and t == "z":  # 逻辑与；int / long 的 and 是按位与，走 算术
            r = v[e[2]] and v[e[3]]
        elif op == "or" and t == "z":
            r = v[e[2]] or v[e[3]]
        elif op == "sel":
            r = v[e[3]] if v[e[2]] else v[e[4]]
        elif op == "call":
            r = builtin_funcs[e[2]][1](*[v[a] for a in e[3:]])
        elif op == "tab":
            k = v[e[3]]
            r = _read_value(e[2][k]) if 0 <= k < len(e[2]) else 0
        elif op == "neg":
            r = arithmetic("neg", t, v[e[2]])
        else:
            r = arithmetic(op, t, v[e[2]], v[e[3]])
        v.append(r)
    return v
