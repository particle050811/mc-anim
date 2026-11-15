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

from .图 import _json_value, builtin_funcs, ExprGraph
from .库类 import LibrarySim
from .类文件 import ACC_ABSTRACT, ACC_BRIDGE, ACC_ENUM, ACC_STATIC, InvokeDynamic, Ref, Method, MethodHandle, ClassFile, ClassPath

part_class = "net/minecraft/client/model/geom/ModelPart"
entity_class = "net/minecraft/world/entity/Entity"
render_state_class = "net/minecraft/client/renderer/entity/state/EntityRenderState"
pose_fields = ("x", "y", "z", "xRot", "yRot", "zRot", "xScale", "yScale", "zScale", "visible", "skipDraw")
setup_anim_params = ("limbSwing", "limbSwingAmount", "ageInTicks", "netHeadYaw", "headPitch")
prepare_params = ("limbSwing", "limbSwingAmount", "partialTick")
vector_classes = ("org/joml/Vector3f", "org/joml/Vector3fc")
# 从实体上取到的这些类的对象，方法照字节码跑：字段读成输入（默认值取无参构造跑完的值），写进去的本次求值里记着。
# AnimationState：HierarchicalModel.animate 先 updateTime 再 ifStarted，累计时间写了马上又读
DEFAULT_NATIVE_CLASSES = ("net/minecraft/world/entity/AnimationState",)
# 静态字段是这些类型的，具体跑所属类的 <clinit>（关键帧动画定义、插值方式、通道目标）；注册表对象（Items.BOW）这类照旧当不透明
DEFAULT_CONCRETE_INIT_TYPES = (
    "net/minecraft/client/animation/AnimationDefinition",
    "net/minecraft/client/animation/AnimationChannel$Interpolation",
    "net/minecraft/client/animation/AnimationChannel$Target",
    "org/joml/Vector3f",
)


class Unsupported(Exception):
    pass


# ---------- 值 ----------
@dataclass(frozen=True)
class N:
    """表达式节点（int / long / float / double；boolean、byte、char、short、枚举序号都按 int）"""

    id: int
    t: str


@dataclass(frozen=True)
class Part:
    名: str


@dataclass(frozen=True)
class ModelInstance:
    pass


@dataclass(frozen=True)
class Opaque:
    路径: str
    类: str | None = None


@dataclass(eq=False)
class JavaObject:
    类: str
    serial: int


@dataclass(eq=False)
class Array:
    array_items: list
    element_descriptor: str


@dataclass(frozen=True)
class InitialPose:
    part_name: str


@dataclass(frozen=True)
class PartStream:
    root_key: str


@dataclass(frozen=True)
class Closure:
    handle: MethodHandle
    captured: tuple


@dataclass(frozen=True)
class CompareValue:
    """lcmp / fcmpl / fcmpg / dcmpl / dcmpg 的结果，留到紧跟的 ifXX 再化成条件（NaN 的规矩不同）"""

    nan: int  # NaN 时的结果：-1（fcmpl）或 1（fcmpg）；lcmp 是 0（不会 NaN）
    a: N
    b: N


@dataclass(frozen=True)
class CondRef:
    """几个引用里按条件取一个（互斥且穷尽），如 HumanoidModel.getArm(arm) 的结果"""

    branches: tuple


@dataclass(frozen=True)
class ClassConstant:
    名: str


second_slot = object()  # 二槽值的第二槽


def is_two_slot(v: Any) -> bool:
    return isinstance(v, N) and v.t in "jd"


# ---------- 描述符 ----------
def split_descriptor(d: str) -> tuple[list[str], str]:
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


def primitive_type(d: str) -> str | None:
    return {"F": "f", "D": "d", "J": "j", "I": "i", "Z": "i", "B": "i", "S": "i", "C": "i"}.get(d)


# ---------- 状态 ----------
@dataclass
class HeapState:
    heap: dict = field(default_factory=dict)
    facts: dict = field(default_factory=dict)
    reset: bool = False
    dead: bool = False

    def clone(self) -> HeapState:
        return HeapState(dict(self.heap), dict(self.facts), self.reset, self.dead)


@dataclass
class Frame:
    local_vars: list
    operand_stack: list
    heap_state: HeapState
    return_value: Any = None
    has_returned: bool = False

    def clone(self) -> Frame:
        return Frame(list(self.local_vars), list(self.operand_stack), self.heap_state.clone(), self.return_value, self.has_returned)


@dataclass
class MethodCode:
    类: ClassFile
    method_ref: Method
    instructions: dict
    _join_points: dict | None = None

    @property
    def join_points(self) -> dict:
        # 用到符号分支才算：后必经是 n² 位运算，关键帧动画定义的 <clinit> 上万条指令、全是常量分支，算它要几分钟
        if self._join_points is None:
            self._join_points = post_dominators(self.instructions)
        return self._join_points


# ---------- 解码 ----------
_op_lengths = {
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
    _op_lengths[_o] = 1
for _o in range(54, 59):
    _op_lengths[_o] = 1


def decode_code(code: bytes) -> dict:
    """pc → (操作码, 操作数, 下一条 pc, 跳转目标们)"""
    out, pc = {}, 0
    while pc < len(code):
        op = code[pc]
        if op == 170:  # tableswitch
            p = (pc + 4) & ~3
            dflt, lo, hi = struct.unpack_from(">iii", code, p)
            offs = struct.unpack_from(f">{hi - lo + 1}i", code, p + 12)
            table = {lo + i: pc + o for i, o in enumerate(offs)}
            nxt = p + 12 + 4 * (hi - lo + 1)
            out[pc] = (op, (pc + dflt, table), nxt, [pc + dflt, *table.values()])
        elif op == 171:  # lookupswitch
            p = (pc + 4) & ~3
            dflt, n = struct.unpack_from(">ii", code, p)
            table = {}
            for i in range(n):
                k, o = struct.unpack_from(">ii", code, p + 8 + 8 * i)
                table[k] = pc + o
            nxt = p + 8 + 8 * n
            out[pc] = (op, (pc + dflt, table), nxt, [pc + dflt, *table.values()])
        elif op == 196:  # wide
            op2 = code[pc + 1]
            if op2 == 132:
                idx, c = struct.unpack_from(">Hh", code, pc + 2)
                out[pc] = (132, (idx, c), pc + 6, [])
            else:
                out[pc] = (op2, (struct.unpack_from(">H", code, pc + 2)[0],), pc + 4, [])
        else:
            n = _op_lengths.get(op, 0)
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


EXIT_PC = -1


def post_dominators(instructions: dict) -> dict:
    """每条指令的直接后必经点（汇合处）；出口记 -1"""
    pcs = sorted(instructions)
    idx = {pc: i for i, pc in enumerate(pcs)}
    n = len(pcs)
    EXIT = n
    succ: list[list[int]] = []
    for pc in pcs:
        op, arg, nxt, tg = instructions[pc]
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
    full_mask = (1 << (n + 1)) - 1
    pd = [full_mask] * n + [1 << EXIT]
    changed = True
    while changed:
        changed = False
        for i in range(n - 1, -1, -1):
            m = full_mask
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
        out[pc] = EXIT_PC if best is None or best == EXIT else pcs[best]
    return out


class Translator(LibrarySim):
    def __init__(
        self,
        classpath: ClassPath,
        model_class: str,
        fixed: dict[str, Any] | None = None,
        model_tree: dict[str, list[str]] | None = None,
        step_limit: int = 3_000_000,
        passthrough_classes: tuple[str, ...] = DEFAULT_NATIVE_CLASSES,
        concrete_init_types: tuple[str, ...] = DEFAULT_CONCRETE_INIT_TYPES,
        层: str | None = None,
    ):
        self.g = ExprGraph()
        self.路径 = classpath
        self.model_class = model_class.replace(".", "/")
        self.固定 = dict(fixed or {})
        self.model_tree = model_tree
        self.input_table: dict[str, dict] = {}
        self.warnings: list[str] = []
        self.static_fields: dict[tuple[str, str], Any] = {}
        self._initialized_classes: set[str] = set()
        self._objects_by_class: dict[str, list[JavaObject]] = {}
        self._method_codes: dict[tuple[str, str, str], MethodCode] = {}
        self._object_counter = 0
        self.模型 = ModelInstance()
        self.struct_fields: dict[str, Any] = {}
        self.field_defaults: dict[str, Any] = {}
        self.root_part = "root"
        self.step_count = 0
        self.step_limit = step_limit
        self._forking_keys: set[tuple[str, int]] = set()
        self._depth = 0
        self._chain: list[str] = []
        self.used_classes: set[str] = set()
        self._static_heap = HeapState()
        self.passthrough_classes = set(passthrough_classes)
        self.concrete_init_types = set(concrete_init_types)
        self._native_defaults: dict[str, dict[str, Any]] = {}
        # 没给 模型树 又要按名字找部件时，从这个无参层定义方法跑出树（None = 模型类里唯一的那个）
        self.层 = 层

    # ---------- 类和方法 ----------
    def 类(self, class_name: str) -> ClassFile | None:
        c = self.路径.find_class(class_name)
        if c is not None:
            self.used_classes.add(class_name)
        return c

    def is_enum(self, class_name: str) -> bool:
        c = self.类(class_name)
        return c is not None and bool(c.access_flags & ACC_ENUM) and c.parent_class == "java/lang/Enum"

    def enum_constants(self, class_name: str) -> list[str]:
        c = self.类(class_name)
        assert c is not None
        return [f.名 for f in c.fields if f.access_flags & ACC_ENUM]

    def find_method(self, class_name: str, method_name: str, descriptor: str, virtual: bool = True) -> tuple[ClassFile, Method] | None:
        """从 类名 往父类找（虚调用、invokespecial 的父类调用都这样找）；接口的默认方法最后找"""
        c = self.类(class_name)
        interfaces: list[str] = []
        while c is not None:
            m = c.find_method(method_name, descriptor)
            if m is not None and not (m.access_flags & ACC_ABSTRACT):
                return c, m
            interfaces.extend(c.is_interface)
            c = self.类(c.parent_class) if c.parent_class else None
        while interfaces:
            i = self.类(interfaces.pop(0))
            if i is None:
                continue
            m = i.find_method(method_name, descriptor)
            if m is not None and m.bytecode is not None:
                return i, m
            interfaces.extend(i.is_interface)
        return None

    def is_subclass(self, class_name: str | None, ancestor: str) -> bool:
        while class_name:
            if class_name == ancestor:
                return True
            c = self.类(class_name)
            if c is None:
                return False
            if ancestor in c.is_interface:
                return True
            class_name = c.parent_class
        return False

    def get_method_code(self, c: ClassFile, m: Method) -> MethodCode:
        k = (c.名, m.名, m.descriptor)
        if k not in self._method_codes:
            if m.bytecode is None:
                raise Unsupported(f"{c.名}.{m.名}{m.descriptor} 没有字节码（抽象或 native）")
            ins = decode_code(m.bytecode)
            self._method_codes[k] = MethodCode(c, m, ins)
        return self._method_codes[k]

    # ---------- 值的工具 ----------
    def const_node(self, t: str, v: Any) -> N:
        return N(self.g.const_node(t, v), t)

    def input_node(self, input_name: str, t: str, source: str, enum_class: str | None = None, fallback_value: Any = None) -> N:
        if input_name in self.固定:
            v = self.固定[input_name]
            if enum_class and isinstance(v, str):
                v = self.enum_constants(enum_class).index(v)
            return self.const_node(t, v)
        meta = self.input_table.setdefault(input_name, {"类型": t, "来源": source})
        if enum_class:
            meta["枚举"] = self.enum_constants(enum_class)
            meta["枚举类"] = enum_class
        if fallback_value is not None:
            meta["默认"] = fallback_value
        return N(self.g.input_node(t, input_name), t)

    def input_by_desc(self, input_name: str, descriptor: str, source: str, fallback_value: Any = None) -> Any:
        t = primitive_type(descriptor)
        if t:
            return self.input_node(input_name, t, source, fallback_value=fallback_value)
        if descriptor.startswith("L"):
            cls = descriptor[1:-1]
            if self.is_enum(cls):
                return self.input_node(input_name, "i", source, enum_class=cls, fallback_value=fallback_value)
            return Opaque(input_name, cls)
        return Opaque(input_name, None)

    def new_object_id(self) -> int:
        self._object_counter += 1
        return self._object_counter

    # ---------- 堆 ----------
    def heap_key(self, obj: Any) -> tuple:
        if isinstance(obj, Part):
            return ("部件", obj.名)
        if isinstance(obj, ModelInstance):
            return ("模型",)
        if isinstance(obj, JavaObject):
            return ("对象", obj.serial)
        if isinstance(obj, Opaque) and self.is_native(obj):
            return ("不透明", obj.路径, obj.类)
        raise Unsupported(f"不能当对象读写字段：{obj!r}")

    def is_native(self, obj: Any) -> bool:
        return isinstance(obj, Opaque) and any(self.is_subclass(obj.类, c) for c in self.passthrough_classes)

    def native_defaults(self, class_name: str) -> dict[str, Any]:
        """照跑类的字段默认值：对一个新对象具体跑无参构造，常量字段记下来（AnimationState.lastTime = Long.MAX_VALUE，即没开始）"""
        if class_name not in self._native_defaults:
            out: dict[str, Any] = {}
            self._native_defaults[class_name] = out
            found = self.find_method(class_name, "<init>", "()V")
            if found is not None:
                o = JavaObject(class_name, self.new_object_id())
                try:
                    _, state = self.run_method(found[0], found[1], [o], HeapState())
                    for (k, field), v in state.heap.items():
                        if k == ("对象", o.serial) and isinstance(v, N) and self.g.is_constant(v.id):
                            out[field] = self.g.constant_of(v.id)
                except Unsupported as e:
                    self.warnings.append(f"{class_name} 的无参构造跑不了（{e}），字段默认按 0")
        return self._native_defaults[class_name]

    def field_descriptor(self, class_name: str | None, field: str) -> str | None:
        c = self.类(class_name) if class_name else None
        while c is not None:
            f = c.find_field(field)
            if f is not None:
                return f.descriptor
            c = self.类(c.parent_class) if c.parent_class else None
        return None

    def initial_value(self, k: tuple, field: str, descriptor: str) -> Any:
        if k[0] == "部件":
            if field in ("x", "y", "z", "xRot", "yRot", "zRot"):
                return N(self.g.initial(k[1], field), "f")
            if field in ("xScale", "yScale", "zScale"):
                return self.const_node("f", 1.0)
            if field == "visible":
                return self.const_node("i", 1)
            if field == "skipDraw":
                return self.const_node("i", 0)
            if field == "initialPose":
                return InitialPose(k[1])
            return Opaque(f"{k[1]}.{field}", descriptor[1:-1] if descriptor.startswith("L") else None)
        if k[0] == "模型":
            if field in self.struct_fields:
                return self.struct_fields[field]
            return self.input_by_desc(f"model.{field}", descriptor, "模型字段", fallback_value=self.field_defaults.get(field))
        if k[0] == "不透明":
            return self.input_by_desc(f"{k[1]}.{field}", descriptor, "实体", fallback_value=self.native_defaults(k[2]).get(field))
        t = primitive_type(descriptor)
        return self.const_node(t, 0) if t else None

    def read_field(self, state: HeapState, obj: Any, field: str, descriptor: str) -> Any:
        if isinstance(obj, CondRef):
            vals = [(c, self.read_field(state, o, field, descriptor)) for c, o in obj.branches]
            r = vals[-1][1]
            for c, v in reversed(vals[:-1]):
                r = self.merge_value(c, v, r)
            return r
        if isinstance(obj, InitialPose):
            if field in ("x", "y", "z", "xRot", "yRot", "zRot"):
                return N(self.g.initial(obj.part_name, field), "f")
            if field in ("xScale", "yScale", "zScale"):
                return self.const_node("f", 1.0)
            raise Unsupported(f"PartPose.{field}")
        if isinstance(obj, Opaque) and not self.is_native(obj):
            return self.input_by_desc(f"{obj.路径}.{field}", descriptor, "实体")
        return self._heap_read(state, self.heap_key(obj), field, descriptor)

    def _heap_read(self, state: HeapState, k: tuple, field: str, descriptor: str) -> Any:
        if (k, field) in state.heap:
            return state.heap[(k, field)]
        if k[0] == "对象" and (k, field) in self._static_heap.heap:
            return self._static_heap.heap[(k, field)]
        return self.initial_value(k, field, descriptor)

    def write_field(self, state: HeapState, obj: Any, field: str, value: Any, descriptor: str) -> None:
        if isinstance(obj, CondRef):
            for c, o in obj.branches:
                old = self.read_field(state, o, field, descriptor)
                self.write_field(state, o, field, self.merge_value(c, value, old), descriptor)
            return
        if isinstance(obj, Opaque) and not self.is_native(obj):
            self.warnings.append(f"写了实体字段 {obj.路径}.{field}，忽略")
            return
        state.heap[(self.heap_key(obj), field)] = value

    # ---------- 合并 ----------
    def merge_value(self, c: int, a: Any, b: Any) -> Any:
        if a is b:
            return a
        if isinstance(a, N) and isinstance(b, N):
            if a.t != b.t:
                return None
            if a.id == b.id:
                return a
            return N(self.g.select(c, a.id, b.id), a.t)
        if a is None or b is None or a is second_slot or b is second_slot:
            return None
        if a == b and not isinstance(a, (JavaObject, Array)):
            return a
        if isinstance(a, (N, CompareValue)) or isinstance(b, (N, CompareValue)):
            if isinstance(a, CompareValue) or isinstance(b, CompareValue):
                a, b = self.resolve_compare(a), self.resolve_compare(b)
                return self.merge_value(c, a, b)
            return None
        opts: list[tuple[int, Any]] = []
        for cond, v in ((c, a), (self.g.logical_not(c), b)):
            if isinstance(v, CondRef):
                opts.extend((self.g.logical_and(cond, ci), vi) for ci, vi in v.branches)
            else:
                opts.append((cond, v))
        merged: list[tuple[int, Any]] = []
        for cond, v in opts:
            for i, (c2, v2) in enumerate(merged):
                if v2 == v if not isinstance(v, (JavaObject, Array)) else v2 is v:
                    merged[i] = (self.g.logical_or(c2, cond), v2)
                    break
            else:
                merged.append((cond, v))
        if len(merged) == 1:
            return merged[0][1]
        return CondRef(tuple(merged))

    def resolve_compare(self, v: Any) -> Any:
        if not isinstance(v, CompareValue):
            return v
        g = self.g
        lt = g.compare("<", v.a.id, v.b.id)
        gt = g.compare(">", v.a.id, v.b.id)
        eq = g.compare("==", v.a.id, v.b.id)
        nan = g.const_node("i", v.nan)
        return N(g.select(lt, g.const_node("i", -1), g.select(gt, g.const_node("i", 1), g.select(eq, g.const_node("i", 0), nan))), "i")

    def merge_frames(self, c: int, f1: Frame, f2: Frame, start_object_id: int | None = None) -> Frame:
        """起号：分叉前的对象号。分叉后才建的对象只有建它的那边有，它的字段照那边取（另一边引用不到它）"""
        if f1.heap_state.dead:
            return f2
        if f2.heap_state.dead:
            return f1
        if f1.has_returned != f2.has_returned:
            raise Unsupported("一边返回了、一边没返回的分支")
        n = max(len(f1.local_vars), len(f2.local_vars))
        local_vars = [self.merge_value(c, f1.local_vars[i] if i < len(f1.local_vars) else None, f2.local_vars[i] if i < len(f2.local_vars) else None) for i in range(n)]
        if len(f1.operand_stack) != len(f2.operand_stack):
            raise Unsupported("汇合处两边栈深不同")
        stack = []
        for a, b in zip(f1.operand_stack, f2.operand_stack):
            v = self.merge_value(c, a, b)
            if v is None:
                raise Unsupported(f"汇合处栈上的值合不起来：{a!r} / {b!r}")
            stack.append(v)
        state = HeapState()
        for k in sorted(set(f1.heap_state.heap) | set(f2.heap_state.heap), key=repr):
            obj, field = k
            desc = "F" if field not in ("visible", "skipDraw") else "Z"
            if obj[0] == "模型" and field not in self.struct_fields:
                desc = self._model_field_descriptor(field)
            if obj[0] == "不透明":
                desc = self.field_descriptor(obj[2], field) or desc
            if obj[0] == "对象" and start_object_id is not None and obj[1] > start_object_id and (k not in f1.heap_state.heap or k not in f2.heap_state.heap):
                state.heap[k] = f1.heap_state.heap[k] if k in f1.heap_state.heap else f2.heap_state.heap[k]
                continue
            a = f1.heap_state.heap[k] if k in f1.heap_state.heap else self._heap_read(f1.heap_state, obj, field, desc)
            b = f2.heap_state.heap[k] if k in f2.heap_state.heap else self._heap_read(f2.heap_state, obj, field, desc)
            if obj[0] == "部件" and (k not in f1.heap_state.heap and not f1.heap_state.reset or k not in f2.heap_state.heap and not f2.heap_state.reset):
                w = f"部件 {obj[1]}.{field} 只在部分分支里写：没写的那支游戏里沿用上一帧的值，这里按初始姿态算"
                if w not in self.warnings:
                    self.warnings.append(w)
            v = self.merge_value(c, a, b)
            if v is None:
                raise Unsupported(f"汇合处字段 {obj}.{field} 合不起来")
            state.heap[k] = v
        state.facts = {k: v for k, v in f1.heap_state.facts.items() if f2.heap_state.facts.get(k) == v}
        state.reset = f1.heap_state.reset and f2.heap_state.reset
        out = Frame(local_vars, stack, state, None, f1.has_returned)
        if f1.has_returned:
            out.return_value = self.merge_value(c, f1.return_value, f2.return_value) if (f1.return_value is not None or f2.return_value is not None) else None
        return out

    def _model_field_descriptor(self, field: str) -> str:
        c = self.类(self.model_class)
        while c is not None:
            f = c.find_field(field)
            if f is not None:
                return f.descriptor
            c = self.类(c.parent_class) if c.parent_class else None
        return "F"

    # ---------- 条件 ----------
    def known_value(self, state: HeapState, c: int) -> bool | None:
        g = self.g
        if g.is_constant(c):
            return bool(g.constant_of(c))
        if c in state.facts:
            return state.facts[c]
        e = g.graph_nodes[c]
        if e[0] == "not" and e[2] in state.facts:
            return not state.facts[e[2]]
        return None

    def record_fact(self, state: HeapState, c: int, v: bool) -> None:
        e = self.g.graph_nodes[c]
        if e[0] == "not":
            state.facts[e[2]] = not v
        else:
            state.facts[c] = v

    # ---------- 跑方法 ----------
    def run_method(self, c: ClassFile, m: Method, actual_args: list, state: HeapState) -> tuple[Any, HeapState]:
        self._depth += 1
        self._chain.append(f"{c.名.split('/')[-1]}.{m.名}")
        if self._depth > 60:
            raise Unsupported("调用太深（递归？）")
        try:
            mc = self.get_method_code(c, m)
            local_vars: list = [None] * max(m.max_locals, 1)
            i = 0
            for v in actual_args:
                local_vars[i] = v
                i += 2 if is_two_slot(v) else 1
            fr = self.run_range(mc, Frame(local_vars, [], state), 0, EXIT_PC)
            if not fr.has_returned and not fr.heap_state.dead:
                raise Unsupported(f"{c.名}.{m.名} 没走到 return")
            return fr.return_value, fr.heap_state
        finally:
            self._depth -= 1
            self._chain.pop()

    def run_range(self, mc: MethodCode, fr: Frame, pc: int, end: int) -> Frame:
        g = self.g
        while True:
            if pc == end:
                return fr
            self.step_count += 1
            if self.step_count > self.step_limit:
                raise Unsupported("步数超过上限（死循环？）")
            op, arg, nxt, tg = mc.instructions[pc]
            try:
                r: Any = self.exec_insn(mc, fr, pc, op, arg, nxt)
            except Unsupported as e:
                if "@" not in str(e):
                    raise Unsupported(f"{e} @ {mc.类.名}.{mc.method_ref.名}{mc.method_ref.descriptor} pc={pc} op={op}；调用链 {' → '.join(self._chain)}") from None
                raise
            if r is None:
                pc = nxt
                continue
            kind = r[0]
            if kind == "跳":
                pc = r[1]
            elif kind == "返回":
                fr.has_returned = True
                fr.return_value = r[1]
                return fr
            elif kind == "死":
                fr.heap_state.dead = True
                fr.has_returned = end == EXIT_PC
                return fr
            elif kind == "分":
                # r[1]：[(条件或 None=其余, 目标 pc)]，条件互斥；全是符号的
                j = mc.join_points[pc]
                key = (mc.类.名 + "." + mc.method_ref.名 + mc.method_ref.descriptor, pc)
                if key in self._forking_keys:
                    raise Unsupported(f"条件是符号的循环（{mc.类.名}.{mc.method_ref.名} pc={pc}）")
                self._forking_keys.add(key)
                start_object_id = self._object_counter
                try:
                    results: list[tuple[int, Frame]] = []
                    default_cond = g.const_true()
                    for cond, target in r[1]:
                        f2 = fr.clone()
                        c2 = default_cond if cond is None else cond
                        if cond is not None:
                            default_cond = g.logical_and(default_cond, g.logical_not(cond))
                        if g.is_constant(c2) and not g.constant_of(c2):
                            continue
                        if not g.is_constant(c2):
                            self.record_fact(f2.heap_state, c2, True)
                        results.append((c2, self.run_range(mc, f2, target, j)))
                finally:
                    self._forking_keys.discard(key)
                merged = results[-1][1]
                for c2, f2 in reversed(results[:-1]):
                    merged = self.merge_frames(c2, f2, merged, start_object_id)
                fr = merged
                if j == EXIT_PC or fr.has_returned:
                    if j != EXIT_PC:
                        raise Unsupported("汇合点不是出口却已返回")
                    return fr
                if fr.heap_state.dead:
                    return fr
                pc = j
            else:
                raise AssertionError(kind)

    # 条件跳转：可定就走一边，不可定交给 区间 分叉
    def conditional_jump(self, fr: Frame, c: int, target: int, nxt: int):
        v = self.known_value(fr.heap_state, c)
        if v is not None:
            return ("跳", target if v else nxt)
        return ("分", [(c, target), (None, nxt)])

    def condition(self, op: str, a: Any, b: Any = None) -> int:
        """ifXX 的条件：a 是 比较值（fcmpl 等）或 int；b 给了是 if_icmpXX"""
        g = self.g
        if isinstance(a, CompareValue):
            x, y = a.a.id, a.b.id
            if a.nan == -1:  # fcmpl/dcmpl：NaN → -1
                m = {"==": ("==", False), "!=": ("==", True), "<": (">=", True), ">=": (">=", False), ">": (">", False), "<=": (">", True)}
            elif a.nan == 1:  # fcmpg/dcmpg：NaN → 1
                m = {"==": ("==", False), "!=": ("==", True), "<": ("<", False), ">=": ("<", True), ">": ("<=", True), "<=": ("<=", False)}
            else:
                m = {k: (k, False) for k in ("==", "!=", "<", ">=", ">", "<=")}
            o, neg = m[op]
            c = g.compare(o, x, y)
            return g.logical_not(c) if neg else c
        if b is None:
            b = self.const_node("i", 0)
        a, b = self.resolve_compare(a), self.resolve_compare(b)
        if not (isinstance(a, N) and isinstance(b, N)):
            raise Unsupported(f"比较的不是数：{a!r} {b!r}")
        return g.compare(op, a.id, b.id)

    def ref_equal(self, a: Any, b: Any) -> int:
        g = self.g
        if isinstance(a, N) and isinstance(b, N):
            return g.compare("==", a.id, b.id)
        if isinstance(a, CondRef) or isinstance(b, CondRef):
            cond_ref, other = (a, b) if isinstance(a, CondRef) else (b, a)
            assert isinstance(cond_ref, CondRef)
            r = g.false_node()
            for ci, vi in cond_ref.branches:
                r = g.logical_or(r, g.logical_and(ci, self.ref_equal(vi, other)))
            return r
        if a is b or (a == b and not isinstance(a, (JavaObject, Array))):
            return g.const_true()
        if a is None or b is None:
            return g.false_node()
        if isinstance(a, Opaque) or isinstance(b, Opaque):
            raise Unsupported(f"比较不透明对象的引用：{a!r} / {b!r}")
        return g.false_node()

    # ---------- 一条指令 ----------
    def exec_insn(self, mc: MethodCode, fr: Frame, pc: int, op: int, arg: tuple, nxt: int):
        g, st, loc = self.g, fr.operand_stack, fr.local_vars
        cp = mc.类.const_pool
        if op == 0:
            return None
        if op == 1:
            st.append(None)
        elif 2 <= op <= 8:
            st.append(self.const_node("i", op - 3))
        elif op in (9, 10):
            st.append(self.const_node("j", op - 9))
        elif 11 <= op <= 13:
            st.append(self.const_node("f", float(op - 11)))
        elif op in (14, 15):
            st.append(self.const_node("d", float(op - 14)))
        elif op in (16, 17):
            st.append(self.const_node("i", arg[0]))
        elif op in (18, 19, 20):
            v = cp[arg[0]]
            if isinstance(v, tuple):
                kind = v[0]
                if kind in ("int", "float", "long", "double"):
                    st.append(self.const_node({"int": "i", "float": "f", "long": "j", "double": "d"}[kind], v[1]))
                elif kind == "string":
                    st.append(v[1])
                elif kind == "class":
                    st.append(ClassConstant(v[1]))
                else:
                    raise Unsupported(f"ldc {kind}")
            else:
                raise Unsupported(f"ldc {v!r}")
        elif 21 <= op <= 25:
            st.append(loc[arg[0]])
        elif 26 <= op <= 45:
            st.append(loc[(op - 26) % 4])
        elif 46 <= op <= 53:
            i, a = st.pop(), st.pop()
            st.append(self.array_read(a, i))
        elif 54 <= op <= 58:
            self.store_local(loc, arg[0], st.pop())
        elif 59 <= op <= 78:
            self.store_local(loc, (op - 59) % 4, st.pop())
        elif 79 <= op <= 86:
            v, i, a = st.pop(), st.pop(), st.pop()
            if not isinstance(a, Array):
                raise Unsupported(f"往非数组里存：{a!r}")
            if not (isinstance(i, N) and g.is_constant(i.id)):
                raise Unsupported("数组下标是符号")
            a.array_items[g.constant_of(i.id)] = v
        elif op == 87:
            self.pop_slots(st, 1)
        elif op == 88:
            self.pop_slots(st, 2)
        elif 89 <= op <= 95:
            if op == 89:
                s = self.pop_slots(st, 1)
                self.push_slots(st, s + s)
            elif op == 90:
                a, b = self.pop_slots(st, 1), self.pop_slots(st, 1)
                self.push_slots(st, a + b + a)
            elif op == 91:
                a, bc = self.pop_slots(st, 1), self.pop_slots(st, 2)
                self.push_slots(st, a + bc + a)
            elif op == 92:
                s = self.pop_slots(st, 2)
                self.push_slots(st, s + s)
            elif op == 93:
                ab, c = self.pop_slots(st, 2), self.pop_slots(st, 1)
                self.push_slots(st, ab + c + ab)
            elif op == 94:
                ab, cd = self.pop_slots(st, 2), self.pop_slots(st, 2)
                self.push_slots(st, ab + cd + ab)
            else:
                a, b = self.pop_slots(st, 1), self.pop_slots(st, 1)
                self.push_slots(st, a + b)
        elif 96 <= op <= 131:
            t = "ijfd"[(op - 96) % 4] if op < 120 else "ij"[(op - 120) % 2]
            if op < 116:
                name = ["+", "-", "*", "/", "%"][(op - 96) // 4]
                b, a = st.pop(), st.pop()
                st.append(self.calc(name, t, a, b))
            elif op < 120:
                a = st.pop()
                st.append(N(g.calc("neg", t, self.to_number(a).id), t))
            else:
                name = ["shl", "shr", "ushr", "and", "or", "xor"][(op - 120) // 2]
                b, a = st.pop(), st.pop()
                if name in ("shl", "shr", "ushr"):
                    b = N(g.convert_node(t, self.to_number(b).id), t) if t == "j" else b
                st.append(self.calc(name, t, a, b))
        elif op == 132:
            idx, c = arg
            loc[idx] = self.calc("+", "i", loc[idx], self.const_node("i", c))
        elif 133 <= op <= 147:
            a = self.to_number(st.pop())
            result_types = {133: "j", 134: "f", 135: "d", 136: "i", 137: "f", 138: "d", 139: "i", 140: "j", 141: "d", 142: "i", 143: "j", 144: "f"}.get(op)
            if result_types:
                st.append(N(g.convert_node(result_types, a.id), result_types))
            else:  # i2b i2c i2s
                bits, signed = {145: (8, True), 146: (16, False), 147: (16, True)}[op]
                if g.is_constant(a.id):
                    v = g.constant_of(a.id) & ((1 << bits) - 1)
                    if signed and v >= 1 << (bits - 1):
                        v -= 1 << bits
                    st.append(self.const_node("i", v))
                else:
                    raise Unsupported("i2b/i2c/i2s 作用在符号上")
        elif op == 148:
            b, a = st.pop(), st.pop()
            st.append(CompareValue(0, self.to_number(a), self.to_number(b)))
        elif op in (149, 150, 151, 152):
            b, a = st.pop(), st.pop()
            st.append(CompareValue(-1 if op in (149, 151) else 1, self.to_number(a), self.to_number(b)))
        elif 153 <= op <= 158:
            a = st.pop()
            o = ["==", "!=", "<", ">=", ">", "<="][op - 153]
            return self.conditional_jump(fr, self.condition(o, a), arg[0], nxt)
        elif 159 <= op <= 164:
            b, a = st.pop(), st.pop()
            o = ["==", "!=", "<", ">=", ">", "<="][op - 159]
            return self.conditional_jump(fr, self.condition(o, a, b), arg[0], nxt)
        elif op in (165, 166):
            b, a = st.pop(), st.pop()
            c = self.ref_equal(a, b)
            return self.conditional_jump(fr, c if op == 165 else g.logical_not(c), arg[0], nxt)
        elif op in (167, 200):
            return ("跳", arg[0])
        elif op in (168, 169, 201):
            raise Unsupported("jsr/ret")
        elif op in (170, 171):
            dflt, table = arg
            k = self.to_number(self.resolve_compare(st.pop()))
            if g.is_constant(k.id):
                return ("跳", table.get(g.constant_of(k.id), dflt))
            by_target: dict[int, int] = {}
            for val, t in table.items():
                by_target[t] = g.logical_or(by_target.get(t, g.false_node()), g.compare("==", k.id, g.const_node("i", val)))
            branches = [(c, t) for t, c in by_target.items() if t != dflt]
            others = by_target.get(dflt)
            if others is not None:
                branches.append((others, dflt))
            # 定得了的分支直接选
            for c, t in branches:
                if self.known_value(fr.heap_state, c) is True:
                    return ("跳", t)
            branches = [(c, t) for c, t in branches if self.known_value(fr.heap_state, c) is not False]
            # 同一目标的合到一条，条件按「前面的都不成立」由 区间 处理
            return ("分", [*branches, (None, dflt)])
        elif 172 <= op <= 176:
            return ("返回", st.pop())
        elif op == 177:
            return ("返回", None)
        elif op in (178, 179):
            ref: Ref = cp[arg[0]]
            if op == 178:
                st.append(self.read_static(ref))
            else:
                self.static_fields[(ref.类, ref.名)] = st.pop()
        elif op == 180:
            ref = cp[arg[0]]
            obj = st.pop()
            st.append(self.get_field(fr.heap_state, obj, ref))
        elif op == 181:
            ref = cp[arg[0]]
            v, obj = st.pop(), st.pop()
            if isinstance(obj, N) and self.is_enum(ref.类):
                raise Unsupported("给枚举字段赋值")
            self.write_field(fr.heap_state, obj, ref.名, v, ref.descriptor)
        elif 182 <= op <= 185:
            ref = cp[arg[0]]
            return self.invoke(mc, fr, {182: "virtual", 183: "special", 184: "static", 185: "interface"}[op], ref)
        elif op == 186:
            return self.dynamic_call(fr, cp[arg[0]])
        elif op == 187:
            cls = cp[arg[0]][1]
            st.append(JavaObject(cls, self.new_object_id()))
        elif op == 188:
            n = self.to_number(st.pop())
            if not g.is_constant(n.id):
                raise Unsupported("数组长度是符号")
            t = {4: "i", 5: "i", 6: "f", 7: "d", 8: "i", 9: "i", 10: "i", 11: "j"}[arg[0]]
            st.append(Array([self.const_node(t, 0) for _ in range(g.constant_of(n.id))], t))
        elif op == 189:
            n = self.to_number(st.pop())
            if not g.is_constant(n.id):
                raise Unsupported("数组长度是符号")
            st.append(Array([None] * g.constant_of(n.id), "L"))
        elif op == 190:
            a = st.pop()
            if not isinstance(a, Array):
                raise Unsupported(f"arraylength 作用在 {a!r}")
            st.append(self.const_node("i", len(a.array_items)))
        elif op == 191:
            return ("死",)
        elif op == 192:
            pass
        elif op == 193:
            cls = cp[arg[0]][1]
            v = st.pop()
            st.append(self.is_instance(v, cls))
        elif op in (194, 195):
            st.pop()
        elif op == 197:
            raise Unsupported("multianewarray")
        elif op in (198, 199):
            v = st.pop()
            if isinstance(v, Opaque) and v.路径.startswith("entity"):
                # 从实体取的东西可能是 null（getVehicle()、getTarget()）：是不是 null 当输入，不给按非 null 算
                c = g.compare("!=", self.input_node(f"{v.路径} == null", "i", "实体").id, g.const_node("i", 0))
                return self.conditional_jump(fr, c if op == 198 else g.logical_not(c), arg[0], nxt)
            if isinstance(v, Opaque):
                isnull = False  # 注册表对象（Items.BOW）、构造参数这些不会是 null
            elif isinstance(v, CondRef):
                isnull = None
                c = g.false_node()
                for ci, vi in v.branches:
                    if vi is None:
                        c = g.logical_or(c, ci)
                return self.conditional_jump(fr, c if op == 198 else g.logical_not(c), arg[0], nxt)
            else:
                isnull = v is None
            return ("跳", arg[0] if (isnull if op == 198 else not isnull) else nxt)
        else:
            raise Unsupported(f"操作码 {op}")
        return None

    def to_number(self, v: Any) -> N:
        v = self.resolve_compare(v)
        if not isinstance(v, N):
            raise Unsupported(f"要数却是 {v!r}")
        return v

    def calc(self, name: str, t: str, a: Any, b: Any) -> N:
        a, b = self.to_number(a), self.to_number(b)
        return N(self.g.calc(name, t, a.id, b.id), t)

    def store_local(self, loc: list, i: int, v: Any) -> None:
        while len(loc) <= i + 1:
            loc.append(None)
        loc[i] = v
        if is_two_slot(v):
            loc[i + 1] = second_slot

    def pop_slots(self, st: list, n: int) -> list:
        out: list = []
        while len(out) < n:
            v = st.pop()
            out[:0] = [v, second_slot] if is_two_slot(v) else [v]
        if len(out) != n:
            raise Unsupported("栈操作拆开了 long/double")
        return out

    def push_slots(self, st: list, s: list) -> None:
        for v in s:
            if v is not second_slot:
                st.append(v)

    def array_read(self, a: Any, i: Any) -> Any:
        g = self.g
        if isinstance(a, Opaque):
            return self.input_by_desc(f"{a.路径}[…]", "F", "实体")
        if not isinstance(a, Array):
            raise Unsupported(f"从非数组读：{a!r}")
        i = self.to_number(i)
        if g.is_constant(i.id):
            return a.array_items[g.constant_of(i.id)]
        if a.array_items and all(isinstance(e, N) and g.is_constant(e.id) for e in a.array_items):
            t = a.array_items[0].t
            return N(g.table_lookup(t, [g.constant_of(e.id) for e in a.array_items], i.id), t)
        if not a.array_items:
            raise Unsupported("符号下标读空数组")
        # 符号下标：数合成 sel 链，引用合成条件引用（关键帧数组 kfs[i]，同一个对象的几格并成一支）。越界在 JVM 是异常，这里按最后一格算
        if all(isinstance(e, N) for e in a.array_items) and len({e.t for e in a.array_items}) == 1:
            r = a.array_items[-1]
            for k in range(len(a.array_items) - 2, -1, -1):
                r = N(g.select(g.compare("==", i.id, g.const_node("i", k)), a.array_items[k].id, r.id), r.t)
            return r
        if any(isinstance(e, (N, CondRef)) for e in a.array_items):
            raise Unsupported("符号下标读到数和引用混着的数组")
        groups: list[list] = []
        for k, e in enumerate(a.array_items):
            c = g.compare("==", i.id, g.const_node("i", k))
            for x in groups:
                if x[1] is e or (not isinstance(e, (JavaObject, Array)) and x[1] == e):
                    x[0] = g.logical_or(x[0], c)
                    break
            else:
                groups.append([c, e])
        if len(groups) == 1:
            return groups[0][1]
        return CondRef(tuple((c, e) for c, e in groups))

    def is_instance(self, v: Any, cls: str) -> Any:
        if v is None:
            return self.const_node("i", 0)
        if isinstance(v, Opaque):
            if v.类 and self.is_subclass(v.类, cls):
                return self.const_node("i", 1)
            return self.input_node(f"{v.路径} instanceof {cls.split('/')[-1]}", "i", "实体")
        if isinstance(v, Part):
            return self.const_node("i", int(self.is_subclass(part_class, cls)))
        if isinstance(v, ModelInstance):
            return self.const_node("i", int(self.is_subclass(self.model_class, cls)))
        if isinstance(v, JavaObject):
            return self.const_node("i", int(self.is_subclass(v.类, cls)))
        raise Unsupported(f"instanceof {v!r}")

    # ---------- 字段 ----------
    def get_field(self, state: HeapState, obj: Any, ref: Ref) -> Any:
        g = self.g
        if isinstance(obj, N):
            # 枚举常量（按序号）的字段：每个常量的值查表
            if not self.is_enum(ref.类):
                raise Unsupported(f"在数上读字段 {ref.类}.{ref.名}")
            objs = self.enumerate_objects(ref.类)
            vals = [self.read_field(state, o, ref.名, ref.descriptor) for o in objs]
            if g.is_constant(obj.id):
                return vals[g.constant_of(obj.id)]
            if all(isinstance(v, N) and g.is_constant(v.id) for v in vals):
                t = vals[0].t
                return N(g.table_lookup(t, [g.constant_of(v.id) for v in vals], obj.id), t)
            raise Unsupported(f"符号枚举的引用字段 {ref.类}.{ref.名}")
        return self.read_field(state, obj, ref.名, ref.descriptor)

    def read_static(self, ref: Ref) -> Any:
        k = (ref.类, ref.名)
        c = self.类(ref.类)
        if c is not None:
            f = c.find_field(ref.名)
            if f is not None and f.access_flags & ACC_ENUM:
                return self.const_node("i", self.enum_constants(ref.类).index(ref.名))
            if f is not None and f.constant_value is not None and f.access_flags & ACC_STATIC:
                t = primitive_type(f.descriptor)
                return self.const_node(t, f.constant_value) if t else f.constant_value
        if k in self.static_fields:
            return self.static_fields[k]
        if c is not None and ref.类 not in self._initialized_classes and self._run_static_init(c, ref):
            self.init_class(ref.类)
            if k in self.static_fields:
                return self.static_fields[k]
        return Opaque(f"{ref.类.split('/')[-1]}.{ref.名}", ref.descriptor[1:-1] if ref.descriptor.startswith("L") else None)

    def _run_static_init(self, c: ClassFile, ref: Ref) -> bool:
        """只为枚举、数值和数组（SwitchMap 这类表）、模型自己类层级的静态字段跑 <clinit>；
        Items.BOW、Blocks.X 这类注册表对象当不透明，不然要具体跑整个注册表（SkeletonModel 卡几分钟）"""
        if self.is_enum(c.名) or primitive_type(ref.descriptor) or ref.descriptor.startswith("["):
            return True
        if ref.descriptor.startswith("L") and ref.descriptor[1:-1] in self.concrete_init_types:
            return True
        return self.is_subclass(self.model_class, c.名)

    def init_class(self, class_name: str) -> None:
        self._initialized_classes.add(class_name)
        c = self.类(class_name)
        if c is None:
            return
        m = c.find_method("<clinit>", "()V")
        if m is None:
            return
        step_count, saved_step_limit = self.step_count, self.step_limit
        self.step_limit = self.step_count + 200_000
        try:
            _, state = self.run_method(c, m, [], HeapState())
            self._static_heap.heap.update(state.heap)
        except Unsupported as e:
            self.warnings.append(f"{class_name} 的静态初始化跑不了（{e}），它的静态字段当不透明")
        finally:
            self.step_limit = saved_step_limit
            self.step_count = step_count

    def enumerate_objects(self, class_name: str) -> list:
        if class_name in self._objects_by_class:
            return self._objects_by_class[class_name]
        # 跑 <clinit>，按 putstatic 记下每个常量对应的对象
        c = self.类(class_name)
        assert c is not None
        m = c.find_method("<clinit>", "()V")
        if m is None:
            raise Unsupported(f"{class_name} 没有静态初始化")
        before = dict(self.static_fields)
        _, state = self.run_method(c, m, [], HeapState())
        objs = []
        for name in self.enum_constants(class_name):
            o = self.static_fields.get((class_name, name))
            if not isinstance(o, JavaObject):
                raise Unsupported(f"枚举 {class_name}.{name} 没建出对象")
            objs.append(o)
        self._static_heap.heap.update(state.heap)
        # 枚举常量在别处按序号读，这里不留对象
        for k in list(self.static_fields):
            if k not in before and k[0] == class_name and k[1] in self.enum_constants(class_name):
                del self.static_fields[k]
        self._objects_by_class[class_name] = objs
        return objs

    # ---------- 调用 ----------
    def pop_args(self, st: list, descriptor: str) -> list:
        ps, _ = split_descriptor(descriptor)
        args = [st.pop() for _ in ps][::-1]
        return args

    def invoke(self, mc: MethodCode, fr: Frame, kind: str, ref: Ref):
        st = fr.operand_stack
        args = self.pop_args(st, ref.descriptor)
        recv = None if kind == "static" else st.pop()
        rv, state = self.dispatch_call(fr.heap_state, kind, ref, recv, args)
        fr.heap_state = state
        if state.dead:
            return ("死",)
        _, ret = split_descriptor(ref.descriptor)
        if ret != "V":
            if rv is None and primitive_type(ret):
                raise Unsupported(f"{ref.类}.{ref.名} 没给返回值")
            st.append(rv)
        return None

    def dispatch_call(self, state: HeapState, kind: str, ref: Ref, recv: Any, args: list) -> tuple[Any, HeapState]:
        g = self.g
        sig = f"{ref.类}.{ref.名}{ref.descriptor}"
        _, ret = split_descriptor(ref.descriptor)
        if kind == "static":
            if sig in builtin_funcs:
                ids = [self.to_number(a).id for a in args]
                t = builtin_funcs[sig][0]
                return N(g.call_node(sig, ids), t), state
            ok, rv, state = self.lib_static(state, ref.类, ref.名, ref.descriptor, args)
            if ok:
                return rv, state
            if sig == "net/minecraft/util/Mth.binarySearch(IILjava/util/function/IntPredicate;)I":
                return self.binary_search(state, args), state
            if ref.名 == "values" and self.is_enum(ref.类) and ref.descriptor == f"()[L{ref.类};":
                return Array([self.const_node("i", i) for i in range(len(self.enum_constants(ref.类)))], "i"), state
            if ret != "V" and any(isinstance(a, Opaque) for a in args) and not any(isinstance(a, (Part, CondRef, ModelInstance)) for a in args):
                # 拿实体（或从实体取的东西）算个值的静态方法（CrossbowItem.getChargeDuration(entity.getUseItem()) 这类）：结果当输入
                return self.input_by_desc(f"{ref.类.split('/')[-1]}.{ref.名}({', '.join(self.arg_name(a) for a in args)})", ret, "实体"), state
            found = self.find_method(ref.类, ref.名, ref.descriptor)
            if found is None:
                raise Unsupported(f"不认识的静态方法 {sig}")
            return self.run_method(found[0], found[1], args, state)
        if ref.类 in vector_classes and self._is_vector(recv):
            return self.vector_method(state, ref, recv, args)
        if isinstance(recv, CondRef):
            results = []
            start_object_id = self._object_counter
            for ci, vi in recv.branches:
                s2 = state.clone()
                if not g.is_constant(ci):
                    self.record_fact(s2, ci, True)
                r, s2 = self.dispatch_call(s2, kind, ref, vi, args)
                results.append((ci, Frame([], [], s2, r, True)))
            merged = results[-1][1]
            for ci, f2 in reversed(results[:-1]):
                merged = self.merge_frames(ci, f2, merged, start_object_id)
            return merged.return_value, merged.heap_state
        # 构造函数
        if ref.名 == "<init>":
            if ref.类 in ("java/lang/Object", "java/lang/Enum", "java/lang/Record"):
                return None, state
            if self.library_construct(state, ref.类, ref.descriptor, recv, args):
                return None, state
            found = self.find_method(ref.类, "<init>", ref.descriptor)
            if found is None:
                if isinstance(recv, ModelInstance):
                    return None, state  # 父类构造在 jar 外（不影响部件字段）
                raise Unsupported(f"不认识的构造 {sig}")
            return self.run_method(found[0], found[1], [recv, *args], state)
        if isinstance(recv, Closure):
            found = self.find_method(ref.类, ref.名, ref.descriptor)  # 函数式接口的默认方法（andThen 这类）照字节码跑
            if found is not None:
                return self.run_method(found[0], found[1], [recv, *args], state)
            return self.call_closure(state, recv, args)
        if self.is_library_object(recv):
            return self.lib_method(state, ref.名, ref.descriptor, recv, args)
        if isinstance(recv, str):
            if ref.名 == "equals" and ref.descriptor == "(Ljava/lang/Object;)Z":
                return self.const_node("i", int(isinstance(args[0], str) and args[0] == recv)), state
            if ref.名 == "hashCode" and ref.descriptor == "()I":
                from .库类 import java_hash

                h = java_hash(recv)
                return self.const_node("i", h - (1 << 32) if h & 0x80000000 else h), state
            raise Unsupported(f"字符串方法 {sig}")
        # 枚举（按序号）上的方法：对每个常量具体跑，查表
        if isinstance(recv, N):
            if ref.名 == "ordinal" and ref.descriptor == "()I":
                return recv, state
            if ref.名 == "hashCode" and ref.descriptor == "()I":
                return recv, state
            if not self.is_enum(ref.类) and not self.is_enum(self._enum_owner(ref.类)):
                raise Unsupported(f"在数上调用 {sig}")
            enum_cls = ref.类 if self.is_enum(ref.类) else self._enum_owner(ref.类)
            n = len(self.enum_constants(enum_cls))
            if g.is_constant(recv.id):
                k = g.constant_of(recv.id)
                found = self.find_method(enum_cls, ref.名, ref.descriptor)
                if found is None:
                    raise Unsupported(f"枚举方法 {sig} 找不到")
                return self.run_method(found[0], found[1], [self.const_node("i", k), *args], state)
            vals = []
            for k in range(n):
                r, s2 = self.dispatch_call(state.clone(), kind, ref, self.const_node("i", k), args)
                if s2.heap != state.heap:
                    raise Unsupported(f"枚举方法 {sig} 改了状态")
                vals.append(r)
            if all(isinstance(v, N) and g.is_constant(v.id) for v in vals):
                t = vals[0].t
                return N(g.table_lookup(t, [g.constant_of(v.id) for v in vals], recv.id), t), state
            if all(isinstance(v, N) for v in vals):
                r = vals[-1]
                for k in range(n - 2, -1, -1):
                    r = N(g.select(g.compare("==", recv.id, g.const_node("i", k)), vals[k].id, r.id), r.t)
                return r, state
            raise Unsupported(f"符号枚举上 {sig} 返回引用")
        if self.is_native(recv):
            found = self.find_method(ref.类 if kind == "special" else recv.类 or ref.类, ref.名, ref.descriptor)
            if found is None:
                raise Unsupported(f"照跑类上找不到方法 {sig}")
            return self.run_method(found[0], found[1], [recv, *args], state)
        if isinstance(recv, Opaque):
            if ref.名 in ("equals",) and ret == "Z":
                return self.const_node("i", int(len(args) == 1 and args[0] == recv)), state
            call_name = f"{recv.路径}.{ref.名}({', '.join(self.arg_name(a) for a in args)})"
            if ret == "V":
                self.warnings.append(f"忽略了实体上的调用 {call_name}")
                return None, state
            return self.input_by_desc(call_name, ret, "实体"), state
        if isinstance(recv, Part):
            return self.part_method(state, recv, kind, ref, args)
        if isinstance(recv, PartStream):
            if ref.名 == "forEach" and args and isinstance(args[0], Closure):
                h = args[0].handle.handle_target
                if h.类 == part_class and h.名 == "resetPose":
                    return None, self.reset_all(state, recv.root_key)
            raise Unsupported(f"部件流上的 {sig}")
        if isinstance(recv, ModelInstance) and ref.名 == "resetPose" and ref.descriptor == "()V":
            # 1.21.2 起 EntityModel.setupAnim 先 Model.resetPose()：对造模型时 root.getAllParts() 存下的表逐个 resetPose，等于整棵复位
            found = self.find_method(self.model_class, ref.名, ref.descriptor)
            if found is not None and found[0].名 == "net/minecraft/client/model/Model":
                return None, self.reset_all(state, self.root_part)
        if isinstance(recv, ModelInstance) and ref.名 == "getAnyDescendantWithName" and ref.descriptor == "(Ljava/lang/String;)Ljava/util/Optional;":
            found = self.find_method(self.model_class, ref.名, ref.descriptor)
            if found is not None and found[0].名 == "net/minecraft/client/model/HierarchicalModel":
                return self.find_part_by_name(state, args[0])
        if isinstance(recv, (ModelInstance, JavaObject)):
            cls = self.model_class if isinstance(recv, ModelInstance) else recv.类
            start = ref.类 if kind == "special" else cls
            found = self.find_method(start, ref.名, ref.descriptor)
            if found is None:
                raise Unsupported(f"找不到方法 {sig}（{cls}）")
            return self.run_method(found[0], found[1], [recv, *args], state)
        raise Unsupported(f"在 {recv!r} 上调用 {sig}")

    def call_closure(self, state: HeapState, f: Any, args: list) -> tuple[Any, HeapState]:
        """调用 lambda、方法引用（invokedynamic 造的 闭包）：捕获的值在前，调用的实参在后，按句柄种类派发"""
        if not isinstance(f, Closure):
            raise Unsupported(f"当函数调用的不是 lambda：{f!r}")
        h, full_args = f.handle, [*f.captured, *args]
        t = h.handle_target
        if h.ref_kind == 6:  # REF_invokeStatic
            return self.dispatch_call(state, "static", t, None, full_args)
        if h.ref_kind in (5, 7, 9):  # REF_invokeVirtual、invokeSpecial、invokeInterface
            return self.dispatch_call(state, {5: "virtual", 7: "special", 9: "interface"}[h.ref_kind], t, full_args[0], full_args[1:])
        if h.ref_kind == 8:  # REF_newInvokeSpecial：构造器引用
            o = JavaObject(t.类, self.new_object_id())
            _, state = self.dispatch_call(state, "special", t, o, full_args)
            return o, state
        raise Unsupported(f"方法句柄种类 {h.ref_kind}")

    def binary_search(self, state: HeapState, args: list) -> N:
        """Mth.binarySearch(lo, hi, 谓词)：循环次数看谓词，谓词是符号的就把整棵判定树展开（每个 mid 判一次，共 hi - lo 个节点），
        和 JVM 一样不假定谓词单调。关键帧动画拿它找当前时刻落在哪两帧之间"""
        g = self.g
        lo, hi, p = self.to_number(args[0]), self.to_number(args[1]), args[2]
        if not (g.is_constant(lo.id) and g.is_constant(hi.id)):
            raise Unsupported("binarySearch 的范围是符号")

        def search(lo: int, n: int) -> N:
            if n <= 0:
                return self.const_node("i", lo)
            half = n // 2
            mid = lo + half
            r, state_after_call = self.call_closure(state, p, [self.const_node("i", mid)])
            if state_after_call.heap != state.heap:
                raise Unsupported("binarySearch 的谓词改了状态")
            c = self.condition("!=", r)
            a, b = search(lo, half), search(mid + 1, n - half - 1)
            return N(g.select(c, a.id, b.id), "i")

        return search(g.constant_of(lo.id), g.constant_of(hi.id) - g.constant_of(lo.id))

    def find_part_by_name(self, state: HeapState, part_name: Any) -> tuple[Any, HeapState]:
        """HierarchicalModel.getAnyDescendantWithName：根叫 root；其余在部件树里找（模型里没有的名字给空 Optional，游戏里同样跳过）"""
        from .库类 import OPTIONAL_CLASS

        if not isinstance(part_name, str):
            raise Unsupported("按名字找部件，名字不是常量")
        if part_name == "root":
            found = self.find_method(self.model_class, "root", f"()L{part_class};")
            if found is None:
                raise Unsupported("模型没有 root()")
            p, state = self.run_method(found[0], found[1], [self.模型], state)
            return self.new_library_object(state, OPTIONAL_CLASS, (True, p)), state
        if self.model_tree is None:
            from .部件树 import tree_from_layer_def

            try:
                self.model_tree = tree_from_layer_def(self, self.层)
            except Unsupported as e:
                raise Unsupported(f"按名字找部件 {part_name}（HierarchicalModel.getAnyDescendantWithName，关键帧动画用）要知道部件树：{e}") from e
        present = any(part_name in cs for cs in self.model_tree.values())
        return self.new_library_object(state, OPTIONAL_CLASS, (present, Part(part_name) if present else None)), state

    def _is_vector(self, v: Any) -> bool:
        if isinstance(v, CondRef):
            return all(self._is_vector(o) for _, o in v.branches)
        return isinstance(v, JavaObject) and v.类 == vector_classes[0]

    def vector_method(self, state: HeapState, ref: Ref, v: Any, args: list) -> tuple[Any, HeapState]:
        """org.joml.Vector3f 照 JOML 1.10.5（1.20.1 带的）的语义算，不跑它的字节码（不在游戏 jar 里）。
        lerp 里的 Math.fma 在没开 joml.useMathFma（默认）时是 a * b + c，两次舍入"""
        name, d = ref.名, ref.descriptor
        read_field = lambda o, f: self.to_number(self.read_field(state, o, f, "F"))  # noqa: E731
        write_field = lambda o, f, x: self.write_field(state, o, f, x, "F")  # noqa: E731
        if name == "<init>":
            if d == "(FFF)V":
                for f, a in zip("xyz", args):
                    write_field(v, f, a)
                return None, state
            if d in ("()V", "(F)V"):
                for f in "xyz":
                    write_field(v, f, args[0] if args else self.const_node("f", 0.0))
                return None, state
            if d == "(Lorg/joml/Vector3fc;)V":
                for f in "xyz":
                    write_field(v, f, read_field(args[0], f))
                return None, state
        if name in ("x", "y", "z") and d == "()F":
            return read_field(v, name), state
        if name == "set" and d == "(FFF)Lorg/joml/Vector3f;":
            for f, a in zip("xyz", args):
                write_field(v, f, a)
            return v, state
        if name == "set" and d == "(Lorg/joml/Vector3fc;)Lorg/joml/Vector3f;":
            for f in "xyz":
                write_field(v, f, read_field(args[0], f))
            return v, state
        if name == "lerp" and d in ("(Lorg/joml/Vector3fc;FLorg/joml/Vector3f;)Lorg/joml/Vector3f;", "(Lorg/joml/Vector3fc;F)Lorg/joml/Vector3f;"):
            other, t = args[0], args[1]
            dest = args[2] if len(args) > 2 else v
            for f in "xyz":
                a = read_field(v, f)
                write_field(dest, f, self.calc("+", "f", self.calc("*", "f", self.calc("-", "f", read_field(other, f), a), t), a))
            return dest, state
        if name == "mul" and d == "(F)Lorg/joml/Vector3f;":
            for f in "xyz":
                write_field(v, f, self.calc("*", "f", read_field(v, f), args[0]))
            return v, state
        if name in ("mul", "add") and d == "(FFF)Lorg/joml/Vector3f;":
            for f, a in zip("xyz", args):
                write_field(v, f, self.calc("*" if name == "mul" else "+", "f", read_field(v, f), a))
            return v, state
        raise Unsupported(f"Vector3f.{name}{d}")

    def arg_name(self, a: Any) -> str:
        if isinstance(a, Opaque):
            return a.路径
        if isinstance(a, N) and self.g.is_constant(a.id):
            return str(self.g.constant_of(a.id))
        if isinstance(a, str):
            return repr(a)
        return "…"

    def _enum_owner(self, class_name: str) -> str:
        # 枚举常量带类体时是匿名子类（HumanoidModel$ArmPose$1），方法引用写的是父类
        c = self.类(class_name)
        return c.parent_class if c is not None and c.parent_class else class_name

    def part_method(self, state: HeapState, p: Part, kind: str, ref: Ref, args: list) -> tuple[Any, HeapState]:
        if ref.名 == "getChild" and ref.descriptor == "(Ljava/lang/String;)L" + part_class + ";":
            name = args[0]
            if not isinstance(name, str):
                raise Unsupported("getChild 的名字不是常量")
            if name == "root" and p.名 == "root":
                # 构造参数是网格根，模型的 root 是它底下同名的那个（部件树.py 把外面一层去掉了，两层都叫 root）
                return Part(name), state
            if self.model_tree is not None and name not in self.model_tree.get(p.名, []):
                raise Unsupported(f"模型里 {p.名} 下没有 {name}")
            return Part(name), state
        if ref.名 == "hasChild":
            if self.model_tree is None:
                raise Unsupported("hasChild 要给 --模型")
            return self.const_node("i", int(args[0] in self.model_tree.get(p.名, []))), state
        if ref.名 == "getAllParts":
            return PartStream(p.名), state
        if ref.名 in ("render", "visit", "translateAndRotate", "compile", "getRandomCube"):
            raise Unsupported(f"setupAnim 里调用 ModelPart.{ref.名}")
        found = self.find_method(part_class, ref.名, ref.descriptor)
        if found is None:
            raise Unsupported(f"ModelPart.{ref.名}{ref.descriptor} 找不到")
        return self.run_method(found[0], found[1], [p, *args], state)

    def reset_all(self, state: HeapState, root: str) -> HeapState:
        """root().getAllParts().forEach(ModelPart::resetPose)：有模型树就对子树每个部件照字节码跑 resetPose，没有就只认根部件（清掉所有部件的位置、转角）"""
        if self.model_tree is not None:
            pending = [root]
            ref = Ref(part_class, "resetPose", "()V")
            while pending:
                n = pending.pop()
                _, state = self.part_method(state, Part(n), "virtual", ref, [])
                pending.extend(self.model_tree.get(n, []))
            state.reset = root == self.root_part
            return state
        if root != self.root_part:
            raise Unsupported("子树复位要给 --模型")
        state = state.clone()
        for k in [k for k in state.heap if k[0][0] == "部件" and k[1] in ("x", "y", "z", "xRot", "yRot", "zRot")]:
            del state.heap[k]
        state.reset = True
        return state

    def dynamic_call(self, fr: Frame, d: InvokeDynamic):
        st = fr.operand_stack
        args = self.pop_args(st, d.descriptor)
        boot = d.bootstrap.handle_target
        if boot.类 == "java/lang/invoke/StringConcatFactory" and boot.名 == "makeConcatWithConstants":
            recipe = d.bootstrap_args[0][1]
            it = iter(args)
            out = ""
            for ch in recipe:
                if ch == "\x01":
                    v = next(it)
                    if isinstance(v, str):
                        out += v
                    elif isinstance(v, N) and self.g.is_constant(v.id):
                        x = self.g.constant_of(v.id)
                        out += str(x)
                    else:
                        raise Unsupported("拼接符号字符串")
                else:
                    out += ch
            st.append(out)
            return None
        if boot.类 == "java/lang/invoke/LambdaMetafactory":
            impl = d.bootstrap_args[1]
            st.append(Closure(impl, tuple(args)))
            return None
        raise Unsupported(f"invokedynamic {boot.类}.{boot.名}")

    # ---------- 入口 ----------
    def construct(self, descriptor: str | None = None) -> None:
        c = self.类(self.model_class)
        if c is None:
            raise Unsupported(f"jar 里没有 {self.model_class}")
        ctor = None
        for m in c.method_list:
            if m.名 == "<init>" and (descriptor is None and m.descriptor.startswith(f"(L{part_class};") or m.descriptor == descriptor):
                ctor = m
                break
        if ctor is None:
            raise Unsupported(f"{self.model_class} 没有以 ModelPart 开头的构造函数")
        ps, _ = split_descriptor(ctor.descriptor)
        args: list[Any] = [self.模型, Part(self.root_part)]
        for p in ps[1:]:
            t = primitive_type(p)
            args.append(self.const_node(t, 0) if t else Opaque(f"构造参数 {p}"))
        _, state = self.run_method(c, ctor, args, HeapState())
        for (k, field_name), v in state.heap.items():
            if k != ("模型",):
                continue
            if isinstance(v, (Part, Array, Opaque, Closure, JavaObject)) or v is None:
                self.struct_fields[field_name] = v
            elif isinstance(v, N) and self.g.is_constant(v.id):
                desc = self._model_field_descriptor(field_name)
                val = self.g.constant_of(v.id)
                if desc.startswith("L") and self.is_enum(desc[1:-1]):
                    val = self.enum_constants(desc[1:-1])[val]
                self.field_defaults[field_name] = val
        self.heap_after_ctor = {k: v for k, v in state.heap.items() if k[0] != ("模型",)}

    def translate(self, with_prepare: bool = True) -> dict:
        # 映射和 jar 对不上时 ModelPart.xRot 这些字段名认不出来，写进去的姿态会被当成别的字段丢掉，静默翻出空程序
        mp = self.类(part_class)
        if mp is None or mp.find_field("xRot") is None:
            raise Unsupported(f"类路径里认不出 {part_class}.xRot：映射和 jar 对不上（混淆的客户端配 proguard:，SRG 名的 jar 配 srg:），或者没带客户端 jar")
        self.construct()
        ent = Opaque("entity", entity_class)
        state = HeapState()
        # 构造函数里改过的部件字段（少见）、建的对象（存部件的 ArrayList、Vector3f 这些，内容在堆里）带进来
        for k, v in getattr(self, "heap_after_ctor", {}).items():
            if k[0][0] in ("部件", "对象"):
                state.heap[k] = v
        methods = []
        if with_prepare:
            found = self.find_method(self.model_class, "prepareMobModel", f"(L{entity_class};FFF)V")
            if found is not None and found[0].名 != "net/minecraft/client/model/EntityModel":
                args = [self.模型, ent] + [self.input_node(n, "f", "参数") for n in prepare_params]
                _, state = self.run_method(found[0], found[1], args, state)
                methods.append(f"{found[0].名}.prepareMobModel")
        found = self.find_method(self.model_class, "setupAnim", f"(L{entity_class};FFFFF)V")
        if found is not None:
            args = [self.模型, ent] + [self.input_node(n, "f", "参数") for n in setup_anim_params]
        else:
            # 1.21.2 起 setupAnim(渲染状态)：状态是不透明对象，读它的字段、调它的方法都成输入（state.walkAnimationPos 这样）
            found = self.find_render_entry()
            if found is None:
                raise Unsupported(f"{self.model_class} 找不到 setupAnim（老签名 实体 + 5 个 float，或 1.21.2 起收 EntityRenderState 子类的）")
            state_class = split_descriptor(found[1].descriptor)[0][0][1:-1]
            args = [self.模型, Opaque("state", state_class)]
        _, state = self.run_method(found[0], found[1], args, state)
        methods.append(f"{found[0].名}.setupAnim")
        return self.export_graph(state, methods)

    def find_render_entry(self) -> tuple[ClassFile, Method] | None:
        """模型类（沿父类）里 setupAnim(X)V、X 是 EntityRenderState 子类的那个。桥方法不算：除了 setupAnim(Object)，
        子类收窄状态类型时（1.21.11 的 SkeletonModel 收 SkeletonRenderState、父类 HumanoidModel 收 HumanoidRenderState）桥方法的参数也是渲染状态"""
        class_name = self.model_class
        while class_name:
            c = self.类(class_name)
            if c is None:
                return None
            for m in c.method_list:
                if m.名 != "setupAnim" or m.access_flags & (ACC_ABSTRACT | ACC_BRIDGE):
                    continue
                ps, r = split_descriptor(m.descriptor)
                if r == "V" and len(ps) == 1 and ps[0].startswith("L") and self.is_subclass(ps[0][1:-1], render_state_class):
                    return c, m
            class_name = c.parent_class or ""
        return None

    def export_graph(self, state: HeapState, methods: list[str]) -> dict:
        outs: dict[str, dict[str, int]] = {}
        roots: list[int] = []
        for (k, field_name), v in sorted(state.heap.items(), key=lambda kv: (str(kv[0][0]), kv[0][1])):
            if k[0] != "部件" or field_name not in pose_fields:
                continue
            if not isinstance(v, N):
                raise Unsupported(f"部件 {k[1]}.{field_name} 的值不是数：{v!r}")
            outs.setdefault(k[1], {})[field_name] = v.id
            roots.append(v.id)
        nodes, new_ids = self.g.export_graph(roots)
        outputs = {p: {f: new_ids[i] for f, i in fs.items()} for p, fs in outs.items()}
        used_inputs = {e[2] for e in nodes if e[0] == "in"}
        # 默认值过一遍 JSON 规矩：AnimationState.lastTime 的 Long.MAX_VALUE 这类超出 2^53 的写成串
        inputs = {k: ({**v, "默认": _json_value(v["默认"])} if "默认" in v else v) for k, v in self.input_table.items() if k in used_inputs}
        return {
            "格式": "姿态程序/1",
            "模型类": self.model_class.replace("/", "."),
            "方法": methods,
            "复位": state.reset,
            "输入": inputs,
            "固定": self.固定,
            "节点": nodes,
            "输出": outputs,
            "警告": self.warnings,
        }
