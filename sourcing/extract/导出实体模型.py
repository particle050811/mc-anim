#!/usr/bin/env python3
"""从模组 jar 里导出 Java 版实体模型（生物）：用 javap -c 反汇编模型类的 create()，按栈机执行，得到部件树和方盒，原样照抄不改数值。
只认下面列的几种调用，遇到不认识的直接报错，不猜。

用法（在参考模型库目录下）：
  uv run --with pillow 工具/游戏取材/导出实体模型.py <jar> <输出.json> <名字=类全名[:方法名]>... --贴图 <名字=jar内贴图.png>...
  例：... twilightforest.jar src/模型/角色/巫妖.模型.json 巫妖=twilightforest.client.model.entity.LichModel \\
          --贴图 巫妖=assets/twilightforest/textures/model/twilightlich64.png
  方法名默认 create。只有 createMesh 的（原版玩家模型、盔甲层）写成 名字=类全名:方法名(参数,...)@贴图宽x高，参数按方法签名转换
  （CubeDeformation 写一个数，boolean 写 true/false），例：玩家=net.minecraft.client.model.PlayerModel:m_170825_(0,false)@64x64
  贴图存在输出 JSON 旁边：巫妖.模型.json → 巫妖.模型.png（只有一张）或 巫妖.模型.<名字>.png。
  jar 可写几个、逗号隔开，类和贴图按顺序找：原版 SRG 客户端 jar 只有类没有资源，贴图要从普通客户端 jar 取
  （../game/缓存/client-1.20.1-srg.jar,../game/缓存/client-1.20.1.jar）。

关键帧动画（1.19 起原版新生物用的 AnimationDefinition，如监守者、嗅探兽、骆驼）：再加一段
  --动画 <名字=类全名.静态字段>...   例：钻出=net.minecraft.client.animation.definitions.WardenAnimation.f_232343_
  只写类全名不写字段 = 导出这个类里所有 AnimationDefinition 静态字段。做法同模型：执行该类的 static {}，
  认 AnimationDefinition.Builder、AnimationChannel、Keyframe、KeyframeAnimations.degreeVec/posVec/scaleVec、Targets / Interpolations。
  关键帧数值存 Keyframe 里换算过的 Vector3f：degreeVec = (x,y,z) × 0.017453292（弧度）；posVec = (x, -y, z)（像素）；scaleVec = (x-1, y-1, z-1)。
  播放时各通道的值是**加**到部件当前 offset / rot / scale 上。

输出：{"models": {名字: {"texSize": [宽, 高], "root": 部件}}[, "animations": {名字: 动画}]}
  部件 = {"name", "pose": {"offset": [x,y,z], "rot": [x,y,z]}, "cubes": [...], "children": [...]}
  方盒 = {"uv": [u,v], "from": [x,y,z], "size": [w,h,d], "grow": [gx,gy,gz], "mirror": bool}
  坐标是模型空间原始数值：像素，y 朝下，正面朝 -z，旋转弧度、顺序 ZYX。换算在 src/lib/实体模型.tsx 里做。
  动画 = {"length": 秒, "looping": bool, "bones": {部件名: [{"target": "position"|"rotation"|"scale", "keyframes": [{"t": 秒, "v": [x,y,z], "interp": "linear"|"catmullrom"}]}]}}

认得的调用：CubeListBuilder（create/texOffs/mirror/addBox）、PartPose（offset/offsetAndRotation/rotation/ZERO）、
PartDefinition.addOrReplaceChild/getChild、MeshDefinition、CubeDeformation、HumanoidModel.createMesh、LayerDefinition.create，
同类静态辅助方法（递归执行）、tableswitch / lookupswitch；动画那几个类见上。
"""
import json, os, re, struct, subprocess, sys, tempfile, zipfile

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # 工具/：取 公共/环境
from 公共 import 环境  # noqa: E402

JAVAP = 环境.jdk程序("javap")


# ---------- 模型对象 ----------
class Builder:
    def __init__(self):
        self.cubes, self.uv, self.mirror = [], [0, 0], False


class Part:
    def __init__(self, name, cubes=None, pose=None):
        self.name, self.cubes = name, cubes or []
        self.pose = pose or {"offset": [0, 0, 0], "rot": [0, 0, 0]}
        self.children = {}

    def add(self, name, builder, pose):
        child = Part(name, list(builder.cubes), pose)
        old = self.children.get(name)
        if old is not None:  # 游戏里 addOrReplaceChild 替换时保留原来的子部件
            child.children.update(old.children)
        self.children[name] = child
        return child

    def json(self):
        return {"name": self.name, "pose": self.pose, "cubes": self.cubes, "children": [c.json() for c in self.children.values()]}


class Mesh:
    def __init__(self):
        self.root = Part("root")


def pose(offset=(0, 0, 0), rot=(0, 0, 0)):
    return {"offset": [float(v) for v in offset], "rot": [float(v) for v in rot]}


def add_box(b, x, y, z, w, h, d, grow=(0, 0, 0), mirror=None):
    b.cubes.append({"uv": list(b.uv), "from": [x, y, z], "size": [w, h, d], "grow": list(grow), "mirror": b.mirror if mirror is None else mirror})
    return b


def humanoid_mesh(g, y):
    """HumanoidModel.createMesh(CubeDeformation, yOffset)：原版人形的七个部件（1.20.1）。"""
    m = Mesh()
    r = m.root
    G = (g, g, g)
    G5 = (g + 0.5, g + 0.5, g + 0.5)
    def cb(u, v, mirror=False):
        b = Builder(); b.uv = [u, v]; b.mirror = mirror; return b
    r.add("head", add_box(cb(0, 0), -4, -8, -4, 8, 8, 8, G), pose((0, y, 0)))
    r.add("hat", add_box(cb(32, 0), -4, -8, -4, 8, 8, 8, G5), pose((0, y, 0)))
    r.add("body", add_box(cb(16, 16), -4, 0, -2, 8, 12, 4, G), pose((0, y, 0)))
    r.add("right_arm", add_box(cb(40, 16), -3, -2, -2, 4, 12, 4, G), pose((-5, 2 + y, 0)))
    r.add("left_arm", add_box(cb(40, 16, True), -1, -2, -2, 4, 12, 4, G), pose((5, 2 + y, 0)))
    r.add("right_leg", add_box(cb(0, 16), -2, 0, -2, 4, 12, 4, G), pose((-1.9, 12 + y, 0)))
    r.add("left_leg", add_box(cb(0, 16, True), -2, 0, -2, 4, 12, 4, G), pose((1.9, 12 + y, 0)))
    return m


# ---------- 关键帧动画对象 ----------
def f32(x):
    """按 Java float 取整（游戏里这些数都是 float）"""
    return struct.unpack("f", struct.pack("f", x))[0]


class AnimBuilder:
    """AnimationDefinition.Builder：长度、是否循环、{部件名: [通道]}（addAnimation 往同名部件的列表里追加）"""
    def __init__(self, length):
        self.length, self.looping, self.bones = length, False, {}


# AnimationChannel.Targets：POSITION → ModelPart.offsetPos，ROTATION → offsetRotation，SCALE → offsetScale（都是加上去）
TARGETS = {"f_232250_": "position", "f_232251_": "rotation", "f_232252_": "scale"}
# AnimationChannel.Interpolations：LINEAR（Vector3f.lerp）、CATMULLROM（Mth.catmullrom）
INTERPS = {"f_232229_": "linear", "f_232230_": "catmullrom"}
DEG = f32(0.017453292)  # KeyframeAnimations.degreeVec 里的常数


# ---------- 反汇编 ----------
def jar_read(jar, path):
    """从 jar 里读一个文件；jar 可以是逗号隔开的几个，按顺序找"""
    for j in jar.split(","):
        with zipfile.ZipFile(j) as z:
            if path in z.namelist():
                return z.read(path)
    raise KeyError(f"{jar} 里没有 {path}")


def javap(jar, cls):
    data = jar_read(jar, cls.replace(".", "/") + ".class")
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "C.class")
        open(p, "wb").write(data)
        return subprocess.run([JAVAP, "-v", "-p", p], capture_output=True, text=True, check=True, encoding="utf-8").stdout


def concat_recipes(text):
    """BootstrapMethods 里字符串拼接的模板：{序号: 'crown_side_\\u0001'}（\\u0001 处填参数）"""
    out, cur = {}, None
    body = text.split("BootstrapMethods:", 1)
    if len(body) < 2:
        return out
    for line in body[1].splitlines():
        m = re.match(r"^\s+(\d+): #\d+ REF_invokeStatic .*makeConcatWithConstants", line)
        if m:
            cur = int(m.group(1))
            continue
        m = re.match(r"^\s+#\d+ (.*)$", line)
        if m and cur is not None and cur not in out:
            out[cur] = m.group(1)
    return out


INS = re.compile(r"^\s*(\d+): (\w+)\s*([^/]*?)\s*(?://\s*(.*))?$")


def methods(text):
    """{方法名: [(偏移, 操作码, 操作数, 注释)]}；同名重载只取第一个"""
    out, cur, sw = {}, None, None
    PARAMS.clear()
    for line in text.splitlines():
        # tableswitch / lookupswitch 后面跟着一张跳转表（"  0: 72"、"default: 194"，到 "}" 结束），收进这条指令的操作数
        if sw is not None:
            s = line.strip()
            if s == "}":
                sw = None
            elif ":" in s:
                k, _, v = s.partition(":")
                sw[k.strip()] = int(v)
            continue
        # 方法头：两格缩进、分号结尾（构造方法、static {} 也算，名字取括号前最后一个标识符）；
        # 字段声明也是两格缩进、分号结尾但没有括号，要跳过（否则会被当成 <clinit> 占掉真正的 static {}）
        if re.match(r"^  \S", line) and line.rstrip().endswith(";"):
            m = re.search(r"([\w$<>]+)\(", line)
            if not m and line.strip() != "static {};":
                cur = None
                continue
            nm = m.group(1) if m else "<clinit>"
            cur = [] if nm not in out else None
            if cur is not None:
                out[nm] = cur
                m = re.search(r"\(([^)]*)\)", line)
                PARAMS[nm] = [t.strip() for t in m.group(1).split(",") if t.strip()] if m else []
            continue
        if cur is None:
            continue
        mi = INS.match(line)
        if mi:
            if mi.group(2) in ("tableswitch", "lookupswitch"):
                sw = {}
                cur.append((int(mi.group(1)), mi.group(2), sw, ""))
                continue
            cur.append((int(mi.group(1)), mi.group(2), mi.group(3), mi.group(4) or ""))
    return out


def nargs(desc):
    """方法描述符里的参数个数"""
    inner = desc[desc.index("(") + 1: desc.index(")")]
    n, i = 0, 0
    while i < len(inner):
        c = inner[i]
        if c == "L":
            i = inner.index(";", i)
        elif c == "[":
            i += 1
            continue
        n += 1
        i += 1
    return n


def const(comment):
    kind, _, val = comment.partition(" ")
    if kind in ("float", "double"):
        return float(val.rstrip("fFdD"))
    if kind in ("int", "long"):
        return int(val.rstrip("lL"))
    if kind == "String":
        return val
    raise ValueError(f"不认识的常量：{comment}")


# ---------- 解释执行 ----------
def run(meths, name, args):
    code = meths[name]
    at = {off: i for i, (off, *_) in enumerate(code)}
    loc = {i: a for i, a in enumerate(args)}
    st = []
    pc = 0
    while True:
        off, op, operand, cm = code[pc]
        pc += 1
        if op in ("fconst_0", "fconst_1", "fconst_2"):
            st.append(float(op[-1]))
        elif op.startswith("iconst_"):
            st.append(-1 if op.endswith("m1") else int(op[-1]))
        elif op in ("bipush", "sipush"):
            st.append(int(operand))
        elif op in ("ldc", "ldc_w", "ldc2_w"):
            st.append(const(cm))
        elif re.match(r"^[afid]load(_\d)?$", op):
            st.append(loc[int(op[-1]) if "_" in op else int(operand)])
        elif re.match(r"^[afid]store(_\d)?$", op):
            loc[int(op[-1]) if "_" in op else int(operand)] = st.pop()
        elif op in ("fadd", "dadd", "iadd"):
            b, a = st.pop(), st.pop(); st.append(a + b)
        elif op in ("fsub", "dsub", "isub"):
            b, a = st.pop(), st.pop(); st.append(a - b)
        elif op in ("fmul", "dmul", "imul"):
            b, a = st.pop(), st.pop(); st.append(a * b)
        elif op in ("fdiv", "ddiv"):
            b, a = st.pop(), st.pop(); st.append(a / b)
        elif op in ("fneg", "dneg", "ineg"):
            st.append(-st.pop())
        elif op in ("i2f", "i2d", "f2d", "d2f"):
            st.append(float(st[-1]) if False else float(st.pop()))
        elif op in ("f2i", "d2i"):
            st.append(int(st.pop()))
        elif op == "iinc":
            i, d = operand.split(",")
            loc[int(i)] += int(d)
        elif op == "goto":
            pc = at[int(operand)]
        elif op.startswith("if_icmp"):
            b, a = st.pop(), st.pop()
            ok = {"eq": a == b, "ne": a != b, "lt": a < b, "ge": a >= b, "gt": a > b, "le": a <= b}[op[7:]]
            if ok:
                pc = at[int(operand)]
        elif op in ("ifeq", "ifne", "iflt", "ifge", "ifgt", "ifle"):
            a = st.pop()
            if {"eq": a == 0, "ne": a != 0, "lt": a < 0, "ge": a >= 0, "gt": a > 0, "le": a <= 0}[op[2:]]:
                pc = at[int(operand)]
        elif op in ("tableswitch", "lookupswitch"):
            # 暮初恶魂的触手按编号 switch 摆位置（UrGhastModel.makeTentacle）
            k = st.pop()
            pc = at[operand.get(str(k), operand["default"])]
        elif op == "pop":
            st.pop()
        elif op == "dup":
            st.append(st[-1])
        elif op in ("areturn", "freturn", "ireturn"):
            return st.pop()
        elif op == "return":
            return None
        elif op == "new":
            st.append(("new", cm.split()[-1]))
        elif op == "anewarray":
            # 关键帧数组：new Keyframe[n]，后面一串 dup / 下标 / 值 / aastore 填进去
            st.append([None] * st.pop())
        elif op == "aastore":
            v, i, arr = st.pop(), st.pop(), st.pop()
            arr[i] = v
        elif op == "putstatic":
            # 动画类的 static {} 把建好的 AnimationDefinition 存进静态字段
            STATICS[cm.split()[-1].split(":")[0].rpartition(".")[2]] = st.pop()
        elif op == "getstatic":
            f = cm.split()[-1]
            fld = f.split(":")[0].rpartition(".")[2]
            if "CubeDeformation.f_171458_" in f:
                st.append((0.0, 0.0, 0.0))
            elif "PartPose.f_171404_" in f:
                st.append(pose())
            elif "AnimationChannel$Targets." in f and fld in TARGETS:
                st.append(TARGETS[fld])
            elif "AnimationChannel$Interpolations." in f and fld in INTERPS:
                st.append(INTERPS[fld])
            else:
                raise ValueError(f"{name}@{off} 不认识的静态字段：{cm}")
        elif op == "invokedynamic" and "makeConcatWithConstants" in cm:
            # 部件名用字符串拼接生成（"crown_side_" + i）：模板在 BootstrapMethods 里，\\u0001 处依次填参数
            n = nargs(cm.split(":", 2)[2])
            vals = [st.pop() for _ in range(n)][::-1]
            idx = int(re.search(r"InvokeDynamic #(\d+):", cm).group(1))
            parts = RECIPES[idx].split("\\u0001")
            fmt = lambda v: str(int(v)) if isinstance(v, float) and v.is_integer() else str(v)
            st.append(parts[0] + "".join(fmt(v) + parts[k + 1] for k, v in enumerate(vals)))
        elif op.startswith("invoke"):
            call(meths, name, off, op, cm, st)
        else:
            raise ValueError(f"{name}@{off} 不认识的指令：{op} {operand} {cm}")


def call(meths, name, off, op, cm, st):
    sig = cm.split()[-1]  # owner.name:desc 或 name:desc
    target, desc = sig.split(":", 1)
    n = nargs(desc)
    args = [st.pop() for _ in range(n)][::-1]
    this = st.pop() if op in ("invokevirtual", "invokespecial", "invokeinterface") else None
    owner, _, mname = target.rpartition(".")
    mname = mname.strip('"')
    if not owner:
        # 同一个类里的静态辅助方法
        r = run(meths, mname, args)
        if not desc.endswith("V"):
            st.append(r)
        return
    cls = owner.split("/")[-1]
    if cls == "CubeListBuilder":
        if mname == "m_171558_":
            st.append(Builder()); return
        b = this
        if mname == "m_171514_":
            b.uv = [args[0], args[1]]
        elif mname == "m_171480_":
            b.mirror = True
        elif mname == "m_171555_":
            b.mirror = bool(args[0])
        elif mname == "m_171481_":
            add_box(b, *args)
        elif mname == "m_171488_":
            add_box(b, *args[:6], grow=args[6])
        elif mname == "m_171506_":
            add_box(b, *args[:6], mirror=bool(args[6]))
        elif mname == "m_171496_":
            # addBox(…, CubeDeformation, 贴图 u 缩放, v 缩放)：原版玩家的披风（10×16 的面按 64×32 的比例取贴图）。
            # 缩放不是 1 时记在方盒的 texScale 里（实体模型.tsx 不认，披风游戏里只有 CapeLayer 画，巨人不画）
            add_box(b, *args[:6], grow=args[6])
            if (args[7], args[8]) != (1.0, 1.0):
                b.cubes[-1]["texScale"] = [args[7], args[8]]
        else:
            raise ValueError(f"{name}@{off} 不认识的 CubeListBuilder 方法：{sig}")
        st.append(b)
    elif cls == "PartPose":
        if mname == "m_171419_":
            st.append(pose(args))
        elif mname == "m_171423_":
            st.append(pose(args[:3], args[3:]))
        elif mname == "m_171430_":
            st.append(pose(rot=args))
        else:
            raise ValueError(f"{name}@{off} 不认识的 PartPose 方法：{sig}")
    elif cls == "PartDefinition":
        if mname == "m_171599_":
            st.append(this.add(args[0], args[1], args[2]))
        elif mname == "m_171597_":
            st.append(this.children[args[0]])
        else:
            raise ValueError(f"{name}@{off} 不认识的 PartDefinition 方法：{sig}")
    elif cls == "MeshDefinition":
        if mname == "<init>":
            # new + dup + <init>：把栈上那个占位换成真对象
            m = Mesh()
            for i, v in enumerate(st):
                if v is this:
                    st[i] = m
        elif mname == "m_171576_":
            st.append(this.root)
        else:
            raise ValueError(f"{name}@{off} 不认识的 MeshDefinition 方法：{sig}")
    elif cls == "CubeDeformation":
        if mname == "<init>":
            g = (args[0],) * 3 if len(args) == 1 else tuple(args)
            for i, v in enumerate(st):
                if v is this:
                    st[i] = g
        elif mname == "m_171469_":
            st.append(tuple(v + args[0] for v in this))
        elif mname == "m_171471_":  # extend(x, y, z)（原版 HorseModel 的鬃毛、尾巴用）
            st.append(tuple(v + a for v, a in zip(this, args)))
        else:
            raise ValueError(f"{name}@{off} 不认识的 CubeDeformation 方法：{sig}")
    elif cls == "HumanoidModel" and mname == "m_170681_":
        st.append(humanoid_mesh(args[0][0], args[1]))
    elif cls == "LayerDefinition" and mname == "m_171565_":
        st.append({"mesh": args[0], "texSize": [args[1], args[2]]})
    # ---- 关键帧动画（1.20.1 SRG 名，javap 核对过）----
    elif cls == "AnimationDefinition$Builder":
        if mname == "m_232275_":  # withLength(秒)
            st.append(AnimBuilder(args[0])); return
        if mname == "m_232274_":  # looping()
            this.looping = True
            st.append(this)
        elif mname == "m_232279_":  # addAnimation(部件名, 通道)：computeIfAbsent(名, 新列表).add(通道)
            this.bones.setdefault(args[0], []).append(args[1])
            st.append(this)
        elif mname == "m_232282_":  # build()
            st.append({"length": this.length, "looping": this.looping, "bones": this.bones})
        else:
            raise ValueError(f"{name}@{off} 不认识的 AnimationDefinition.Builder 方法：{sig}")
    elif cls == "AnimationChannel" and mname == "<init>":  # new AnimationChannel(Target, Keyframe...)
        ch = {"target": args[0], "keyframes": list(args[1])}
        for i, v in enumerate(st):
            if v is this:
                st[i] = ch
    elif cls == "Keyframe" and mname == "<init>":  # new Keyframe(时间, Vector3f, Interpolation)
        kf = {"t": args[0], "v": list(args[1]), "interp": args[2]}
        for i, v in enumerate(st):
            if v is this:
                st[i] = kf
    elif cls == "KeyframeAnimations":
        if mname == "m_253186_":  # degreeVec：各分量 × 0.017453292f
            st.append(tuple(f32(f32(a) * DEG) for a in args))
        elif mname == "m_253126_":  # posVec：(x, -y, z)
            st.append((f32(args[0]), f32(-args[1]), f32(args[2])))
        elif mname == "m_253004_":  # scaleVec(double...)：(x-1, y-1, z-1)
            st.append(tuple(f32(a - 1.0) for a in args))
        else:
            raise ValueError(f"{name}@{off} 不认识的 KeyframeAnimations 方法：{sig}")
    else:
        raise ValueError(f"{name}@{off} 不认识的调用：{sig}")


RECIPES = {}
PARAMS = {}  # {方法名: [参数类型（javap 写法）]}
STATICS = {}  # 执行 static {} 时 putstatic 存下的值 {字段名: 值}


def parse_spec(spec):
    """类全名[:方法名[(参数,...)]][@宽x高] → (类, 方法, 参数文字列表, 贴图尺寸)"""
    tex = None
    if "@" in spec:
        spec, _, ts = spec.rpartition("@")
        w, _, h = ts.partition("x")
        tex = [int(w), int(h)]
    cls, _, meth = spec.partition(":")
    args = []
    if "(" in meth:
        meth, _, a = meth.partition("(")
        args = [x.strip() for x in a.rstrip(")").split(",") if x.strip()]
    return cls, meth or "create", args, tex


def convert(args, types):
    """命令行写的参数按方法签名转成解释器里的值"""
    if len(args) != len(types):
        raise ValueError(f"参数个数不对：写了 {args}，方法要 {types}")
    out = []
    for a, t in zip(args, types):
        if t.endswith("CubeDeformation"):
            out.append((float(a),) * 3)
        elif t == "boolean":
            out.append({"true": 1, "false": 0}[a])
        elif t in ("float", "double"):
            out.append(float(a))
        elif t in ("int", "short", "byte"):
            out.append(int(a))
        else:
            raise ValueError(f"不会转换这种参数：{t}")
    return out


def export(jar, cls, method="create", args=(), tex=None):
    text = javap(jar, cls)
    RECIPES.clear()
    RECIPES.update(concat_recipes(text))
    meths = methods(text)
    if method not in meths:
        raise ValueError(f"{cls} 里没有方法 {method}，现有：{', '.join(meths)}")
    layer = run(meths, method, convert(list(args), PARAMS[method]))
    if isinstance(layer, Mesh):  # createMesh 只给 MeshDefinition，贴图尺寸由调用方写（原版在 LayerDefinitions 里配）
        if not tex:
            raise ValueError(f"{cls}.{method} 返回的是 MeshDefinition，要在后面写 @贴图宽x高")
        return {"texSize": tex, "root": layer.root.json()}
    return {"texSize": layer["texSize"], "root": layer["mesh"].root.json()}


_CLINIT = {}  # 类全名 → {静态字段: 值}（一个类的 static {} 只执行一次）


def export_animations(jar, spec):
    """类全名.字段 → {字段: 动画}（一个）；只写类全名 → 这个类里所有 AnimationDefinition 静态字段"""
    cls, fld = spec, None
    try:  # 整个是类名？不是的话最后一段是字段名
        jar_read(jar, spec.replace(".", "/") + ".class")
    except KeyError:
        cls, _, fld = spec.rpartition(".")
    if cls not in _CLINIT:
        text = javap(jar, cls)
        RECIPES.clear()
        RECIPES.update(concat_recipes(text))
        meths = methods(text)
        STATICS.clear()
        run(meths, "<clinit>", [])
        _CLINIT[cls] = {k: v for k, v in STATICS.items() if isinstance(v, dict) and "bones" in v}
    found = _CLINIT[cls]
    if fld is None:
        return dict(found)
    if fld not in found:
        raise ValueError(f"{cls} 里没有动画字段 {fld}，现有：{', '.join(found)}")
    return {fld: found[fld]}


def main():
    argv = sys.argv[1:]
    if len(argv) < 3 or "--贴图" not in argv:
        sys.exit(__doc__)
    # 按 --贴图 / --动画 分段（两段的先后不限；--贴图 后面可以一个都不写）
    sec, cur = {"": [], "--贴图": [], "--动画": []}, ""
    for a in argv:
        if a in ("--贴图", "--动画"):
            cur = a
        else:
            sec[cur].append(a)
    head, texs, anims = sec[""], sec["--贴图"], sec["--动画"]
    jar, out, srcs = head[0], head[1], head[2:]
    models = {}
    for s in srcs:
        nm, _, spec = s.partition("=")
        cls, meth, args, tex = parse_spec(spec)
        models[nm] = export(jar, cls, meth, args, tex)
    data = {"models": models}
    if anims:
        data["animations"] = {}
        for a in anims:
            nm, _, spec = a.partition("=")
            got = export_animations(jar, spec)
            if len(got) == 1:
                data["animations"][nm] = next(iter(got.values()))
            else:
                data["animations"].update(got)
    json.dump(data, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    from PIL import Image
    import io
    for t in texs:
        nm, _, path = t.partition("=")
        im = Image.open(io.BytesIO(jar_read(jar, path))).convert("RGBA")
        dst = out[:-5] + ".png" if len(texs) == 1 else out[:-5] + f".{nm}.png"
        im.save(dst)
        print(f"贴图 {nm}：{im.width}×{im.height} → {dst}")
    for nm, a in data.get("animations", {}).items():
        nch = sum(len(v) for v in a["bones"].values())
        nkf = sum(len(c["keyframes"]) for v in a["bones"].values() for c in v)
        print(f"动画 {nm}：{a['length']} 秒{'（循环）' if a['looping'] else ''}，部件 {', '.join(a['bones'])}，{nch} 条通道、{nkf} 个关键帧")
    for nm, m in models.items():
        cnt = [0, 0]
        def walk(p):
            cnt[0] += 1; cnt[1] += len(p["cubes"])
            for c in p["children"]:
                walk(c)
        walk(m["root"])
        print(f"模型 {nm}：{cnt[0] - 1} 个部件、{cnt[1]} 个方盒，贴图尺寸 {m['texSize']}")
    print(f"已写 {out}")


if __name__ == "__main__":
    main()
