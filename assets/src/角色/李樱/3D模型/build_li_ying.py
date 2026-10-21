# -*- coding: utf-8 -*-
"""李樱（机械动力·应力转动）方块人模型生成脚本 v3。

在 Blender 5.x 中运行（文本编辑器 Run Script，或 exec 本文件）。
- 1 像素 = 1/16 米（MC 标准：人物 32 像素高 = 2 米）。
- 身体 / 头发 / 武器用 0.25 像素体素，护目镜 1/8 像素；五官是贴在脸上的 1/16 像素贴面，
  眉毛是斜切的独立小方块。每个面单独上色（顶点色），纹理只有干净的 1 像素色块，没有噪点。
- 两种渲染风格（set_style 切换，材质按部位分槽，重建节点树即可切换）：
  "toon"    自发光卡通材质，按面相对相机的朝向给固定明暗 + Freestyle 黑色描边（EEVEE）；
  "natural" 无描边，Cycles 路径追踪：柔和主光/补光/轮廓光 + 天空环境光，材质带倒角高光和
            缝隙暗角（环境光遮蔽），接近参考图的自然光影；灯光组跟着相机方位转，三视图每面都是正面受光。
- 每个部件原点都在关节处，旋转 LY_Arm.L / LY_Arm.R / LY_Leg.* / LY_Head 即可摆姿势，
  扳手挂在右手、枯石太刀挂在左手，跟随手臂运动；拔刀：沿 LY_Katana_Sword 本地 -X 平移。

重复运行会先删掉上一次生成的 LiYing / LiYing_Studio 集合再重建。
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

U = 1.0 / 16.0            # 米 / 像素
HULL = True               # 视口里的反向外壳描边（渲染时关闭，改用 Freestyle）
HULL_PX = 0.12
LINE_MC = 0.075           # Freestyle 线宽（模型像素），渲染时按画面比例换算成屏幕像素
TARGET = (0, 0, 1.1)
STYLE = "natural"         # 当前渲染风格（set_style 修改）：natural = 无描边自然光，toon = 卡通描边

# 姿势预设（度）：X 负值=手/脚向前，Y 控制外展，Z 为转身。
# wrench / katana：(手臂本地握点像素, 物体主轴的世界方向, 辅助轴的世界方向[, 握点沿刀身滑动像素])
POSES = {
    "stand": dict(
        rot={"LY_Body": (0, 0, 0), "LY_Head": (0, 0, 0), "LY_Arm.R": (-14, 9, 0), "LY_Arm.L": (-10, -9, 0),
             "LY_Leg.R": (0, 2.5, 0), "LY_Leg.L": (0, -2.5, 0)},
        wrench=((0, -2.5, -9.25), (-0.22, -0.42, 1.0), (1, 0, 0)),
        katana=((0, 0, -9.0), (0.2, 0.925, -0.326), (0, 0, 1)),
    ),
    "action": dict(
        rot={"LY_Body": (0, 0, -6), "LY_Head": (4, 0, 12), "LY_Arm.R": (-74, 22, 0), "LY_Arm.L": (-24, -14, 0),
             "LY_Leg.R": (-14, 4, 0), "LY_Leg.L": (12, -4, 0)},
        wrench=((0, -1.0, -9.5), (-0.5, 0.2, 1.0), (1, 0, 0.3)),
        katana=((0, 0, -9.0), (0.95, 0.15, -0.2), (0, 0, 1), 2.0),
    ),
}


# ---------------------------------------------------------------- 调色板（sRGB，按参考图里正对镜头的面实测）
def H(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


P = dict(
    # 皮肤 / 五官
    skin=H("CFA07F"), skin_e=H("C49377"), skin_cheek=H("BF8B72"), skin_side=H("B08068"),
    hand=H("B08272"), hand_d=H("926A5B"),
    mouth=H("855847"),
    eye_w=H("E0D3CD"), eye_w2=H("CCBEB8"), eye_w3=H("9A8C8C"), eye_line=H("7A5A4C"),
    eye_r=H("7C0907"), eye_r2=H("650605"), eye_r3=H("3A0403"),
    brow=H("1C0F07"), brow_l=H("2E1C10"),
    # 头发 / 护目镜带
    hair=H("30231A"), hair_l=H("3A2A1F"), hair_h=H("45321F"), hair_d=H("271C14"), hair_dd=H("1C140E"),
    hair_s=H("5A3D34"),
    strap_u=H("6A4430"), strap_d=H("4E2C22"),
    # 黄铜 / 镜片
    brass=H("C89D54"), brass_l=H("D6B363"), brass_ll=H("E3C774"), brass_m=H("B88A4D"), brass_d=H("9B703D"),
    brass_dd=H("7A5530"), hub=H("4A3526"),
    lens=H("3E6569"), lens_l=H("648380"), lens_d=H("31565B"),
    # 夹克 / 皮带
    jacket=H("373E41"), jacket_l=H("3F474A"), jacket_d=H("31383B"), jacket_dd=H("282E31"),
    neck=H("5B4141"), neck_l=H("7B6055"),
    leather=H("412D21"), leather_l=H("4E3628"), leather_d=H("33231A"),
    bracer=H("3B281D"), bracer_l=H("4C3426"), bracer_d=H("2D1E16"),
    bmu=H("8F7A4C"), bmu_l=H("A99158"), bmu_d=H("6E5C38"),
    # 裤子 / 靴子
    pants=H("373D3F"), pants_l=H("3F4648"), pants_d=H("313638"),
    apron=H("564538"), apron_l=H("604F3C"), apron_d=H("474034"),
    cuff=H("30353A"), cuff_d=H("292D33"),
    boot=H("382A22"), boot_l=H("463429"), boot_d=H("2C211A"), sole=H("1F1712"),
    lstrap=H("4D3429"), lstrap_d=H("3E2A20"),
    # 左臂铜管 / 钢件
    steel=H("6E7771"), steel_l=H("8C958F"), steel_d=H("4F5654"),
    copper=H("9A5530"), copper_l=H("B86C3E"), copper_d=H("6E3A20"),
    # 枯石太刀
    saya=H("35204F"), saya_l=H("4D3474"), saya_d=H("24163D"),
    wrap=H("3B2459"), wrap_l=H("7B4CB9"), cord=H("6C45AA"), cord_l=H("8C63C6"), cord_d=H("4A2B7E"),
    tsuba=H("3A3050"), tsuba_l=H("54486F"), tsuba_d=H("241E34"),
    kashira=H("7092B8"), kashira_l=H("96B6D6"), kashira_d=H("4E6D93"),
    knob=H("1C1A22"),
    blade=H("262A45"), blade_m=H("3B4366"), blade_e=H("717DA8"),
    # 扳手
    wood=H("3B281B"), wood_l=H("4D3625"), wood_d=H("2A1C13"),
    grip=H("6E1F1F"), grip_d=H("4D1515"), grip_l=H("872929"),
)


# ---------------------------------------------------------------- 颜色工具
def hsh(*a):
    n = 0x9E3779B1
    for v in a:
        n = ((n ^ (int(v) & 0xFFFFFFFF)) * 0x01000193) & 0xFFFFFFFF
        n ^= n >> 15
    n = (n * 0x2C1B3C6D) & 0xFFFFFFFF
    n ^= n >> 12
    return (n & 0xFFFF) / 65535.0


def fl(v, s=1.0):
    return math.floor(v / s + 1e-6)


def jit(c, amt, *key):
    f = 1.0 + (hsh(*key) - 0.5) * 2.0 * amt
    return (min(1.0, c[0] * f), min(1.0, c[1] * f), min(1.0, c[2] * f))


def mix(a, b, t):
    return tuple(a[i] * (1 - t) + b[i] * t for i in range(3))


def shade(c, f):
    return tuple(min(1.0, v * f) for v in c)


def s2l(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def blocks(base, light, dark, seed, pl=0.14, pd=0.2, amt=0.012, s=1.0):
    """干净的 1 像素色块纹理：每个 s 像素方块整块同色（base / light / dark 三选一，再加极轻微明暗）。"""
    def f(x, y, z):
        a = hsh(fl(x, s), fl(y, s), fl(z, s), seed)
        c = light if a > 1.0 - pl else (dark if a < pd else base)
        return jit(c, amt, fl(x, s), fl(y, s), fl(z, s), seed + 3)
    return f


def solid(key, amt=0.0, seed=0):
    c = P[key]
    if not amt:
        return c
    return lambda x, y, z: jit(c, amt, fl(x), fl(y), fl(z), seed)


def step_lookup(tbl, v):
    r = tbl[0][1]
    for s, val in tbl:
        if v >= s - 1e-6:
            r = val
    return r


# ---------------------------------------------------------------- 体素容器
class Vox:
    """稀疏体素：(i,j,k) -> (sRGB 颜色, 材质标签)。坐标单位为像素，体素边长 res 像素。
    颜色也可以是 dict：{面朝向 (dx,dy,dz): 颜色, None: 其余面}，用于同一格子不同面不同色。
    solid：可选 (i,j,k)->bool，把某些空格子当成"实心"（不朝它出面），用来做只有正面的贴片。"""

    def __init__(self, res=0.25, solid=None):
        self.r = res
        self.c = {}
        self.solid = solid

    def _rng(self, a, b):
        return range(int(round(a / self.r)), int(round(b / self.r)))

    def keys(self, box):
        x0, x1, y0, y1, z0, z1 = box
        for i in self._rng(x0, x1):
            for j in self._rng(y0, y1):
                for k in self._rng(z0, z1):
                    yield (i, j, k)

    def center(self, key):
        r = self.r
        return ((key[0] + .5) * r, (key[1] + .5) * r, (key[2] + .5) * r)

    def _col(self, col, key):
        return col(*self.center(key)) if callable(col) else col

    def fill(self, box, col, mat, empty_only=False):
        for key in self.keys(box):
            if empty_only and key in self.c:
                continue
            self.c[key] = (self._col(col, key), mat)

    def paint(self, box, col, mat=None):
        for key in self.keys(box):
            v = self.c.get(key)
            if v is not None:
                self.c[key] = (self._col(col, key), mat or v[1])

    def remove(self, box):
        for key in self.keys(box):
            self.c.pop(key, None)


def band(v, x0, x1, y0, y1, z0, z1, t, col, mat, sides):
    """在盒子侧面加一圈厚度 t 的凸起（sides: x=-X, X=+X, y=-Y, Y=+Y），并把原表面同色。"""
    ex0 = x0 - (t if "x" in sides else 0)
    ex1 = x1 + (t if "X" in sides else 0)
    ey0 = y0 - (t if "y" in sides else 0)
    ey1 = y1 + (t if "Y" in sides else 0)
    v.fill((ex0, ex1, ey0, ey1, z0, z1), col, mat, empty_only=True)
    v.paint((x0, x1, y0, y1, z0, z1), col, mat)


def gear(v, center, axis, sign, dia, thick, teeth=8, hole="round", seed=0, tooth=0.5, hub=None):
    """在 center（安装面上的点）处沿 axis*sign 方向长出一个齿轮：圆形齿盘 + 沿轴向/对角对齐的方齿（宽 tooth 像素），
    中间方孔或圆孔。起伏靠几何而不是颜色：齿、外圈（齿根往里 0.5 像素）、孔边一圈都是 thick + 1 层，
    中间的辐板只有 thick，比外圈凹 1 层；孔整个凹到安装面。
    可以直接画进身体的体素里：齿轮占到的格子覆盖原来的东西，孔里原来的东西挖掉，
    hub 给了颜色就在孔底铺一层暗色轴心，None 则露出安装面。"""
    r = v.r
    R = dia / 2.0
    Rb = R - 0.5
    tw = tooth / 2 + 1e-6                          # 齿宽的一半
    Rh = max(r * 1.5, R * 0.3)
    n = int(math.ceil(R / r))
    o = [d for d in (0, 1, 2) if d != axis]
    nt = max(1, int(round(thick / r)))
    base = int(round(center[axis] / r))
    cu = int(round(center[o[0]] / r))
    cw = int(round(center[o[1]] / r))
    dirs = [(math.cos(2 * math.pi * k / teeth), math.sin(2 * math.pi * k / teeth)) for k in range(teeth)]

    def key_at(a, b, t):
        key = [0, 0, 0]
        key[axis] = base + t if sign > 0 else base - 1 - t
        key[o[0]] = cu + a
        key[o[1]] = cw + b
        return tuple(key)

    for a in range(-n, n):
        for b in range(-n, n):
            du, dw = (a + .5) * r, (b + .5) * r
            rr = math.hypot(du, dw)
            hd = max(abs(du), abs(dw)) if hole == "square" else rr
            if hd < Rh:
                for t in range(nt + 1):
                    v.c.pop(key_at(a, b, t), None)
                if hub is not None:
                    v.c[key_at(a, b, 0)] = (P[hub], "metal")
                continue
            body = rr <= Rb + 1e-6
            is_tooth = False
            if not body and rr <= R + 1e-6:
                for cx_, sx_ in dirs:
                    p_ = du * cx_ + dw * sx_
                    q_ = -du * sx_ + dw * cx_
                    if p_ > 0 and abs(q_) <= tw:
                        is_tooth = True
                        break
            if not (body or is_tooth):
                continue
            ring = hd < Rh + (0.25 if hole == "square" else 0.5)
            rim = rr > Rb - 0.5
            if is_tooth:
                c = P["brass_l"]
            elif ring:
                c = P["brass_m"]
            elif rim:
                c = P["brass"]
            else:
                c = mix(P["brass"], P["brass_m"], 0.5)
            depth = nt + (1 if (is_tooth or ring or rim) else 0)
            for t in range(depth):
                v.c[key_at(a, b, t)] = (c, "metal")


# ---------------------------------------------------------------- 头部：头骨、脸（五官贴面）、眉毛、头发、护目镜
# 刘海各缕（从右脸到左脸，世界 x 负 = 角色右侧）：x0, x1, 下沿 z, 前表面 y（越负越靠前）——按参考图逐列实测
LOCKS = [
    (-4.5, -3.5, 26.25, -4.75),
    (-3.5, -2.25, 28.25, -4.5),
    (-2.25, -1.0, 29.25, -4.5),       # 右额头露肤处
    (-1.0, 0.0, 28.25, -4.5),
    (0.0, 1.0, 27.25, -4.75),         # 中间垂下的一缕
    (1.0, 2.25, 29.25, -4.5),         # 左额头露肤处
    (2.25, 3.5, 28.25, -4.5),
    (3.5, 4.5, 26.25, -4.75),
]
EYES = ((-2.875, -2.0, -1.0), (2.875, 2.0, 1.0))     # (眼白外沿, 眼白/红瞳分界, 红瞳内沿)
EYE_Z = (26.25, 27.75)
MOUTH = (-0.625, 0.625, 24.875, 25.125)  # 闭着的嘴：宽 1.25、高 0.25（用户 10-15 嫌原来 2 × 0.375 太大）


def lock_at(x):
    for lk in LOCKS:
        if lk[0] <= x < lk[1]:
            return lk
    return None


def build_skull():
    v = Vox(0.25)

    def f(x, y, z):
        c = P["skin_side"] if abs(x) > 3.75 else P["skin_e"]
        return jit(c, 0.01, fl(x), fl(y), fl(z), 40)

    v.fill((-4, 4, -4, 4, 24, 32), f, "skin")
    return v


def face_color(x, z):
    c = P["skin"]
    if abs(x) >= 3.0:
        c = P["skin_e"] if z >= 25.5 else P["skin_cheek"]
    c = jit(c, 0.008, fl(x), 0, fl(z), 41)
    lk = lock_at(x)
    if lk:
        d = lk[2] - z
        if lk[2] >= 29.0:                       # 额头露肤处：被刘海压着，上暗下亮
            if d < 0.25:
                c = shade(P["skin"], 0.52)
            elif d < 0.5:
                c = shade(P["skin"], 0.7)
            elif d < 0.75:
                c = shade(P["skin"], 0.84)
            elif d < 1.2:
                c = shade(c, 0.93)
        elif d < 0.125:                         # 刘海下沿一道淡淡的暗边
            c = shade(c, 0.7)
        elif d < 0.25:
            c = shade(c, 0.86)
    for xo, xm, xi in EYES:
        lo, hi = min(xo, xi), max(xo, xi)
        if lo <= x < hi and EYE_Z[0] <= z < EYE_Z[1]:
            white = (x < xm) if xo < xm else (x >= xm)
            if white:
                c = P["eye_w"] if z < 26.875 else (P["eye_w2"] if z < 27.375 else P["eye_w3"])
                if abs(x - xo) < 0.125:
                    c = P["eye_line"]
            else:
                c = (P["eye_r2"] if z < 26.4375 else P["eye_r"] if z < 27.0
                     else P["eye_r2"] if z < 27.375 else P["eye_r3"])
    if MOUTH[0] <= x < MOUTH[1] and MOUTH[2] <= z < MOUTH[3]:
        c = P["mouth"]
    return c


def build_face():
    """脸部贴面：1/16 像素一格，只出正面（贴在头骨正面前 1/16 像素处），被刘海挡住的地方不用画。"""
    r = 1.0 / 16.0
    jf = int(round(-4.0 / r))
    v = Vox(r, solid=lambda i, j, k: j >= jf)
    for key in v.keys((-4, 4, -4.0 - r, -4.0, 24, 29.5)):
        x, _, z = v.center(key)
        lk = lock_at(x)
        if lk and z > lk[2] + 0.25:
            continue
        v.c[key] = (face_color(x, z), "skin")
    return v


def brow_mesh(s):
    """斜眉（怒眉）：内端低、外端高的斜切方块。返回 (顶点, 四边形, 颜色)，单位像素。"""
    xi, xo = 0.95 * s, 3.125 * s

    def zb(x):
        return 27.38 + 0.19 * (abs(x) - 0.95)

    def zt(x):
        return 28.10 + 0.13 * (abs(x) - 0.95)

    def zm(x):
        return zb(x) + 0.5 * (zt(x) - zb(x))

    prof = [(xi, zb(xi)), (xo, zb(xo)), (xo, zm(xo)), (xo, zt(xo)), (xi, zt(xi)), (xi, zm(xi))]
    yf, yb = -4.25, -3.9
    verts = [(x, yf, z) for x, z in prof] + [(x, yb, z) for x, z in prof]
    quads, cols = [], []
    quads += [(0, 1, 2, 5), (5, 2, 3, 4)]
    cols += [P["brow_l"], P["brow"]]
    quads += [(11, 8, 7, 6), (10, 9, 8, 11)]
    cols += [P["brow"], P["brow"]]
    for a in range(6):
        b = (a + 1) % 6
        quads.append((a, a + 6, b + 6, b))
        cols.append(P["brow"])
    return verts, quads, cols


# 头顶翘起的几撮发块：x0, x1, y0, y1, 顶面高度。参考图三个视角的头顶轮廓都有 0.5 像素左右的方块凸起；
# 都摆在周围只有 33.5 高的地方，顶面不超过原来的最高点 34，头高不变
TUFTS = [
    (-1.0, 0.5, -2.0, -0.75, 34.0),
    (2.25, 3.5, -1.75, -0.25, 34.0),
    (-3.5, -2.25, 2.5, 3.5, 34.0),
    (0.5, 2.0, 2.5, 3.5, 34.0),
]


def top_lim(x, y):
    """头顶：前视/侧视轮廓各取一张阶梯表，高度取两者较小值（保证两个方向的剪影都对），再叠上几撮翘起的发块。"""
    if abs(x) >= 4.5 or not (-4.5 <= y < 4.5):
        return 32.0
    FX = [(-4.5, 33.5), (-3.5, 33.75), (-2.25, 34.0), (0.0, 33.75), (1.75, 34.0), (3.0, 33.5)]
    FY = [(-4.5, 33.75), (-3.5, 34.0), (-2.0, 33.5), (-0.75, 33.75), (2.5, 33.5), (3.5, 33.75)]
    h = min(step_lookup(FX, x), step_lookup(FY, y))
    if abs(x) < 3.25 and -3.25 < y < 3.25 and hsh(fl(x), fl(y), 61) < 0.3:
        h -= 0.25
    for x0, x1, y0, y1, top in TUFTS:
        if x0 <= x < x1 and y0 <= y < y1:
            h = max(h, top)
    return h


def side_lim(y, z):
    """两侧头发外沿 |x|（0 = 露出皮肤）。侧脸：前面露脸颊、鬓角垂下一缕、耳朵位置露一块皮肤（按侧视参考图）。"""
    if y >= -4 and ((z < 25.0 and y < 0.5) or (z < 26.0 and y < -2.0) or (z < 27.0 and y < -3.25)
                    or (z < 27.0 and -1.0 <= y < 0.5)):
        return 0.0
    if z >= 30.5:
        return 4.5
    if 28.75 <= z and (y < -2.0 or y >= 1.5):
        return 5.25 if z < 29.5 else 5.0             # 皮带下面前后两块外翘的发片（正视/背视剪影最宽处）：下沿 0.75 像素再往外翘 0.25
    if 25.75 <= z < 27.0 and y >= 2.5:
        return 5.0
    if 26.0 <= z < 27.25 and y < -2.5:
        return 5.0
    return 4.75 if z >= 25.0 else 4.5


def back_lim(x, z):
    """后脑头发外沿 y：皮带以下三层发片，像瓦片一样上薄下厚（每层下沿 0.75 像素往外翘 0.5），
    层与层的下沿按列错开成城垛状——按背视参考图（第一层下沿约 z 28，第二层约 z 25.5～26.25）。
    翘得最远的发梢在 y 5.25，和侧视参考图后脑轮廓的最远处（约 5.2）一致。"""
    if z >= 31.75:
        return 4.5
    if z >= 30.5:
        return 4.75                                   # 皮带下面
    e1 = step_lookup([(-9, 27.75), (-2.5, 28.5), (-1.0, 27.75), (0.5, 28.5), (2.0, 27.75)], x)
    e2 = step_lookup([(-9, 25.5), (-3.0, 26.25), (-1.5, 25.5), (1.0, 26.25), (2.75, 25.5)], x)
    if z >= e1:
        return 5.25 if z < e1 + 0.75 else 4.75
    if z >= e2:
        return 5.25 if z < e2 + 0.75 else 4.75
    return 4.75 if z < 24.5 else 4.5


def front_lim(x, z):
    """脸前头发的前表面 y（-4 = 没有头发）。"""
    lk = lock_at(x)
    if z >= 29.25 and abs(x) < 4.5:
        if lk and lk[3] < -4.5 and z < 30.5:
            return lk[3]
        return -4.5
    if lk and z >= lk[2]:
        return lk[3] - 0.25 if z < lk[2] + 0.75 else lk[3]    # 每缕刘海的发梢往前翘 0.25
    return -4.0


def hair_col(x, y, z):
    a = hsh(fl(x, 2.0), fl(y, 2.0), fl(z, 2.0), 51)
    c = P["hair"]
    if a < 0.2:
        c = P["hair_d"]
    elif a > 0.86:
        c = P["hair_l"]
    b = hsh(fl(x), fl(y), fl(z), 53)
    if b > 0.95:
        c = P["hair_l"]
    elif b < 0.04:
        c = P["hair_dd"]
    streak = hsh(fl(x), fl(y), fl(z, 2.0), 52) > 0.9            # 竖向浅色发丝条（1 像素宽 × 2 像素高）
    if streak and z > 27.0 and (y > -4 or z > 32.0) and abs(x) < 4.75:
        c = P["hair_h"]
    if abs(x) > 4 and -2.0 <= y < -1.0 and z < 28.0:             # 侧面垂下来的一缕鬓角（偏红的浅棕，只在侧面）
        sd = (1, 0, 0) if x > 0 else (-1, 0, 0)
        return {sd: jit(P["hair_s"], 0.02, 0, fl(y), fl(z), 54), None: mix(c, P["hair_dd"], 0.5)}
    elif y < -4 and z < 29.25:
        lk = lock_at(x)
        if lk and lk[0] == 0.0:
            c = mix(c, P["hair_l"], 0.4)
        elif lk and abs(lk[0] + lk[1]) > 6:
            c = mix(c, P["hair_d"], 0.5)
    elif abs(x) > 4.75 and z < 28.75:
        c = mix(c, P["hair_dd"], 0.5)
    if z < 25.75:
        c = mix(c, P["hair_dd"], 0.45)
    if y > 4 and z < 30.5 and hsh(fl(x), 57) > 0.55:              # 后脑发片的竖向浅色高光
        c = mix(c, P["hair_l"], 0.6)
    if abs(x) > 4 and -4 <= y < 2.0 and z < 30.5:                   # 侧发的正面在阴影里（参考图正视时两侧很暗）
        return {(0, -1, 0): mix(c, P["hair_dd"], 0.3), None: c}
    return c


def build_hair():
    v = Vox(0.25)
    for key in v.keys((-5.25, 5.25, -5.0, 5.5, 24, 34.25)):
        x, y, z = v.center(key)
        if -4 < x < 4 and -4 < y < 4 and 24 < z < 32:
            continue
        if abs(x) > 4 and not abs(x) < side_lim(y, z):
            continue
        if y < -4 and not y >= front_lim(x, z):
            continue
        if y > 4 and not y < back_lim(x, z):
            continue
        if z > 32 and not z < top_lim(x, y):
            continue
        v.c[key] = (hair_col(x, y, z), "hair")

    # 护目镜皮带：正面（镜框之间 + 两外侧）1.75 像素高，和镜片等高；侧面和后脑一圈 1.25 像素高；上浅下深两色。
    # 比周围的头发高出 0.25～0.75：正面 -4.75（头发 -4.5）、侧面 5.25（头发 4.5）、后脑 5.25（头发 4.75）
    for key in v.keys((-5.25, 5.25, -4.75, 5.25, 30.25, 32.25)):
        x, y, z = v.center(key)
        ax = abs(x)
        if ax < 4 and -4 < y < 4:
            continue
        z0, z1 = (30.5, 32.25) if y < -4 else (30.5, 31.75)
        if not (z0 <= z < z1):
            continue
        if y < -4:
            hit = ax < 1.0 or 4.0 <= ax < 5.25
        elif y > 4:
            hit = y < 5.25 and ax < 5.25
        else:
            hit = ax < 5.25
        if hit:
            c = P["strap_u"] if z >= (z0 + z1) / 2 else P["strap_d"]
            v.c[key] = (jit(c, 0.02, fl(x), fl(y), 0, 55), "leather")
    return v


def build_goggles():
    """十字形黄铜镜框（四角完全切掉）+ 内凹的青色镜片。
    镜框四条边厚 1.25 像素，前表面 y -5.5；外沿一圈 1/8 像素往后收，做出圆边；镜片缩在框里，比框前表面凹 0.5。"""
    v = Vox(0.125)
    for s in (-1, 1):
        cx, cz = 2.5 * s, 31.375
        L0, L1, Z0, Z1 = cx - 0.875, cx + 0.875, 30.5, 32.25
        Y0, Y1 = -5.5, -4.25
        e = 0.125
        for box in ((L0, L1, Y0, Y1, Z1, Z1 + 0.875), (L0, L1, Y0, Y1, Z0 - 0.875, Z0),
                    (L0 - 0.875, L0, Y0, Y1, Z0, Z1), (L1, L1 + 0.875, Y0, Y1, Z0, Z1)):
            v.fill(box, P["brass_l"], "metal")
            bx0, bx1, _, _, bz0, bz1 = box
            # 外沿收边：四条边各自朝外的那一圈，前面削掉 1/8 像素，颜色压暗一档
            for kx0, kx1, kz0, kz1 in ((bx0, bx0 + e, bz0, bz1), (bx1 - e, bx1, bz0, bz1),
                                       (bx0, bx1, bz0, bz0 + e), (bx0, bx1, bz1 - e, bz1)):
                inner = (L0 <= kx0 and kx1 <= L1 and Z0 <= kz0 and kz1 <= Z1)
                on_lens_edge = (kx1 <= L1 + 1e-6 and kx0 >= L0 - 1e-6 and (abs(kz0 - Z1) < 1e-6 or abs(kz1 - Z0) < 1e-6)) or \
                               (kz1 <= Z1 + 1e-6 and kz0 >= Z0 - 1e-6 and (abs(kx0 - L1) < 1e-6 or abs(kx1 - L0) < 1e-6))
                if inner or on_lens_edge:
                    continue
                v.remove((kx0, kx1, Y0, Y0 + e, kz0, kz1))
                v.paint((kx0, kx1, Y0 + e, Y0 + 2 * e, kz0, kz1), P["brass_m"], "metal")

        def lens(x, y, z, cx=cx, cz=cz):
            if x < cx and z >= cz:
                return P["lens_l"]
            if x >= cx and z < cz:
                return P["lens_d"]
            return P["lens"]

        v.fill((L0, L1, -5.0, Y1, Z0, Z1), lens, "glass")
    return v


# ---------------------------------------------------------------- 身体各部件（世界像素坐标，站立静止姿态）
def jacket_fn(seed):
    big = blocks(P["jacket"], P["jacket_l"], P["jacket_d"], seed, pl=0.16, pd=0.16, amt=0.0, s=2.0)

    def f(x, y, z):
        c = big(x, y, z)
        a = hsh(fl(x), fl(y), fl(z), seed + 1)
        if a > 0.93:
            c = mix(c, P["jacket_l"], 0.7)
        elif a < 0.06:
            c = mix(c, P["jacket_dd"], 0.6)
        return jit(c, 0.01, fl(x), fl(y), fl(z), seed + 2)
    return f


def leather_fn(seed, base="leather"):
    return blocks(P[base], P["leather_l"], P["leather_d"], 80 + seed, pl=0.12, pd=0.12, amt=0.015)


def build_body():
    v = Vox(0.25)
    v.fill((-4, 4, -2, 2, 12, 24), jacket_fn(100), "cloth")
    F = (-2, -1.75)
    # 领口：T 字形脖子（上宽下窄），凹进夹克 0.25，两侧就是夹克本色
    v.remove((-2, 2, *F, 23, 24))
    v.remove((-1, 1, *F, 22, 23))
    v.paint((-2, 2, -1.75, -1.5, 23, 24), solid("neck"), "skin")
    v.paint((-1, 1, -1.75, -1.5, 22, 23), solid("neck_l"), "skin")
    # 腹部正中一块磨旧的棕黄色补丁（2 像素宽，从胸带下方到腰带上方），缝在夹克外面，凸出 0.25
    v.fill((-1, 1, -2.25, -2.0, 14.5, 18),
           blocks(P["apron"], P["apron_l"], P["apron_d"], 101, pl=0.3, pd=0.25, amt=0.0), "cloth")
    # 皮带都凸出夹克 0.5：背带前后贯通；胸带、腰带绕一圈（两侧也凸出 0.25，被手臂挡住的部分看不见）；
    # 胸带压在背带上面，交叉处再高 0.25
    lf = leather_fn(10)
    for xs in ((-3.25, -2.0), (2.0, 3.25)):
        v.fill((xs[0], xs[1], -2.5, 2.5, 13.75, 24), lf, "leather", empty_only=True)
        v.paint((xs[0], xs[1], -2.5, 2.5, 13.75, 24), lf, "leather")
    for z0, z1, col in ((19, 20, leather_fn(11)), (12.75, 13.75, leather_fn(12, "leather_d"))):
        v.fill((-4.25, 4.25, -2.5, 2.5, z0, z1), col, "leather", empty_only=True)
        v.paint((-4.25, 4.25, -2.5, 2.5, z0, z1), col, "leather")
    for xs in ((-3.25, -2.0), (2.0, 3.25)):
        for ys in ((-2.75, -2.5), (2.5, 2.75)):
            v.fill((xs[0], xs[1], *ys, 19, 20), leather_fn(11), "leather")
    # 胸前方形扣（右胸背带上）：框凸出夹克 1.0，中间开口露出后面的皮带
    v.fill((-3.5, -2.0, -3.0, -2.5, 18.5, 20.75), solid("bmu"), "metal")
    v.paint((-3.5, -2.0, -3.0, -2.5, 20.5, 20.75), solid("bmu_l"), "metal")
    v.remove((-3.0, -2.5, -3.0, -2.5, 19.0, 20.25))
    # 腰带：中间大扣（框凸出腰带 0.5，框里的扣板低一层）+ 背带接头处两个小扣（凸出腰带 0.25）
    v.fill((-1.0, 1.0, -3.0, -2.5, 12.5, 14.0), solid("bmu"), "metal")
    v.paint((-1.0, 1.0, -3.0, -2.5, 13.75, 14.0), solid("bmu_l"), "metal")
    v.remove((-0.5, 0.5, -3.0, -2.75, 12.875, 13.625))
    v.paint((-0.5, 0.5, -2.75, -2.5, 12.875, 13.625), solid("bmu_d"), "metal")
    for xs in ((-3.0, -2.0), (2.0, 3.0)):
        v.fill((xs[0], xs[1], -2.75, -2.5, 12.5, 14.0), solid("bmu"), "metal")
        v.paint((xs[0], xs[1], -2.75, -2.5, 13.75, 14.0), solid("bmu_l"), "metal")
    return v


def build_arm(side):
    v = Vox(0.25)
    x0, x1 = (-8, -4) if side < 0 else (4, 8)
    outer = "x" if side < 0 else "X"
    v.fill((x0, x1, -2, 2, 12, 24), jacket_fn(120 + side), "cloth")

    def hand(x, y, z):
        return P["hand_d"] if z < 12.5 else jit(P["hand"], 0.02, fl(x), fl(y), fl(z), 130)

    # 手露 2 像素。护腕是套在前臂外面的皮套（凸出 0.25），上沿翻边凸出 0.5，翻边最上面一圈收回 0.25 做出卷边的圆角。
    # 贴着身体的内侧不加厚：站直时和躯干侧面挨着
    v.paint((x0, x1, -2, 2, 12, 14), hand, "skin")
    band(v, x0, x1, -2, 2, 14, 16.0, 0.25,
         blocks(P["bracer"], P["bracer_l"], P["bracer_d"], 131 + side, pl=0.15, pd=0.15), "leather", outer + "yY")
    band(v, x0, x1, -2, 2, 16.0, 17.0, 0.5, solid("bracer_l"), "leather", outer + "yY")
    band(v, x0, x1, -2, 2, 17.0, 17.25, 0.25, solid("bracer"), "leather", outer + "yY")
    if side > 0:
        # 左上臂的臂带（凸出 0.5），压在肩齿轮下沿
        band(v, x0, x1, -2, 2, 19.75, 20.75, 0.5, leather_fn(26), "leather", outer + "yY")
    return v


def pants_fn(seed):
    return blocks(P["pants"], P["pants_l"], P["pants_d"], seed, pl=0.14, pd=0.18, amt=0.01)


def build_leg(side):
    v = Vox(0.25)
    x0, x1 = (-4, 0) if side < 0 else (0, 4)
    sides = ("x" if side < 0 else "X") + "yY"
    v.fill((x0, x1, -2, 2, 0, 12), pants_fn(140 + side), "cloth")
    v.paint((x0, x1, -2, 2, 8.0, 8.25), lambda x, y, z: shade(P["pants"], 0.84), "cloth")
    # 腿带凸出 0.5（贴着另一条腿的内侧不加厚）
    band(v, x0, x1, -2, 2, 8.25, 9.25, 0.5,
         lambda x, y, z: P["lstrap_d"] if z < 8.5 else jit(P["lstrap"], 0.02, fl(x), fl(y), 0, 150),
         "leather", sides)
    # 卷起的裤脚 2 像素高：中段凸出 0.5，上下各 0.25 像素只凸出 0.25，截面是圆的
    cuff = lambda x, y, z: P["cuff_d"] if z < 3.25 else jit(P["cuff"], 0.015, fl(x), fl(y), fl(z), 152)
    band(v, x0, x1, -2, 2, 3.0, 4.5, 0.5, cuff, "cloth", sides)
    band(v, x0, x1, -2, 2, 2.75, 3.0, 0.25, cuff, "cloth", sides)
    band(v, x0, x1, -2, 2, 4.5, 4.75, 0.25, cuff, "cloth", sides)

    def boot(x, y, z):
        if z >= 2.25:
            return P["boot_d"]
        return jit(P["boot"], 0.02, fl(x), fl(y), fl(z), 151)

    # 靴子：靴筒凸出 0.25；鞋底 0.5 高、比靴筒再宽 0.25，前面的鞋尖再往前 0.25，形成两级台阶
    band(v, x0, x1, -2, 2, 0.5, 2.75, 0.25, boot, "leather", sides)
    band(v, x0, x1, -2, 2, 0, 0.5, 0.5, lambda x, y, z: P["sole"] if z < 0.25 else P["boot_d"], "leather", sides)
    v.fill((x0 if side < 0 else x0, x1 + (0.25 if side > 0 else 0), -2.5, -2.25, 0.5, 1.25),
           solid("boot_l"), "leather", empty_only=True)                                  # 鞋尖包头
    v.fill((x0 - (0.25 if side < 0 else 0), x1 + (0.25 if side > 0 else 0), -2.75, -2.5, 0, 0.5),
           lambda x, y, z: P["sole"] if z < 0.25 else P["boot_d"], "leather")
    hx = (-3.0, -1.25) if side < 0 else (1.25, 3.0)
    v.paint((hx[0], hx[1], -2.25, -2.0, 1.25, 2.0), solid("boot_l"), "leather")      # 靴面亮块
    return v


# 三个黄铜齿轮：设计上是规整的机械齿轮（圆环轮体 + 8 个等宽梯形齿 + 中心圆孔），不照抄设定图边缘的锯齿。
# center 是安装面上的点，齿轮沿 axis*sign 方向长出来；thick 是齿盘厚度，孔边一圈轴套再高 0.2。
# 参考模型库把这张表导出去，用平滑几何（挤出的齿形）来建；Blender 这边仍用 gear() 体素化近似。
GEARS = (
    dict(name="ChestGear", part="torso", center=(2.25, -2.5, 20.25), axis=1, sign=-1, dia=3.5, thick=0.5, hub="hub"),  # 左胸：压在左背带和胸带交叉处
    dict(name="ShoulderGear", part="armL", center=(8, 0, 21.75), axis=0, sign=1, dia=4.0, thick=0.75, hub="hub"),   # 左肩外侧，下沿压着臂带
    dict(name="ThighGear", part="legL", center=(4, -0.25, 8.75), axis=0, sign=1, dia=4.0, thick=0.75, hub="hub"),   # 左腿外侧，中心压在腿带上
)
GEAR_TEETH = 8
GEAR_TOOTH = (0.9, 0.6)        # 梯形齿的齿根宽、齿顶宽（像素），齿高 0.5
GEAR_HOLE = 0.35               # 孔半径 / 齿轮半径

# 左臂铜管：按设定图侧视的走向——从肩齿轮下沿出来先往后鼓，再弯回前面接到护腕翻边上的黄铜块。
# 管轴是 (y, z) 平面里的二次贝塞尔曲线，离臂面 x 方向 0.4；管半径 0.4；t 在 ring 区间内是一道粗一圈的钢箍。
PIPE = dict(p=((0.75, 19.9), (2.1, 18.5), (0.45, 17.1)), x=8.4, r=0.4, ring=(0.5, 0.6), ring_r=0.525)


def pipe_points(n=24):
    """铜管轴线上的点 [(t, x, y, z)]，脚本坐标（像素）。"""
    (y0, z0), (y1, z1), (y2, z2) = PIPE["p"]
    out = []
    for i in range(n + 1):
        t = i / n
        out.append((t, PIPE["x"], (1 - t) ** 2 * y0 + 2 * (1 - t) * t * y1 + t * t * y2,
                    (1 - t) ** 2 * z0 + 2 * (1 - t) * t * z1 + t * t * z2))
    return out


def gear_vox(g):
    """GEARS 里一个齿轮的体素近似（Blender 用）。"""
    v = Vox(0.25)
    gear(v, g["center"], g["axis"], g["sign"], g["dia"], g["thick"], teeth=GEAR_TEETH, tooth=0.75, hub=g["hub"])
    return v


def build_pipe_vox():
    """铜管的体素近似（Blender 用，1/8 像素）。"""
    v = Vox(0.125)
    lo, hi = PIPE["ring"]
    pts = pipe_points(60)
    for key in v.keys((PIPE["x"] - 0.625, PIPE["x"] + 0.625, -0.5, 3.0, 16.75, 20.25)):
        x, y, z = v.center(key)
        t, px, py, pz = min(pts, key=lambda p: (p[2] - y) ** 2 + (p[3] - z) ** 2)
        ringed = lo < t < hi
        if math.sqrt((x - px) ** 2 + (py - y) ** 2 + (pz - z) ** 2) > (PIPE["ring_r"] if ringed else PIPE["r"]):
            continue
        v.c[key] = ((P["steel_l"] if ringed else P["copper"]), "metal")
    return v


def build_arm_details():
    """左臂护腕翻边上的黄铜接头（铜管的下端接在这里）：卡在翻边（臂面外 0.5）上，再凸出 0.75，顶面一圈亮边。"""
    v = Vox(0.125)
    v.fill((8.0, 9.25, -0.25, 1.5, 16.0, 17.25), P["brass"], "metal")
    v.paint((8.0, 9.25, -0.25, 1.5, 17.125, 17.25), P["brass_l"], "metal")
    v.paint((9.125, 9.25, -0.25, 1.5, 16.0, 17.125), P["brass_m"], "metal")
    return v


# ---------------------------------------------------------------- 武器（物体本地像素坐标）
def build_katana():
    """本地坐标：X 沿刀身（刀镡 x=0，刀鞘朝 +X），Z 向上，Y 为厚度方向。"""
    saya = Vox(0.25)
    sword = Vox(0.25)
    # 柄头（钢蓝 + 黄铜 C 形饰件）
    sword.fill((-7.25, -6.25, -0.75, 0.75, -0.75, 0.75),
               lambda x, y, z: P["kashira_l"] if z > 0.5 else (P["kashira_d"] if z < -0.5 else P["kashira"]),
               "metal")
    for s in (-1, 1):
        yy = (0.5, 0.75) if s > 0 else (-0.75, -0.5)
        sword.paint((-6.75, -6.25, *yy, 0.25, 0.75), P["brass"], "metal")
        sword.paint((-6.75, -6.25, *yy, -0.75, -0.25), P["brass"], "metal")
        sword.paint((-6.75, -6.5, *yy, -0.25, 0.25), P["brass_d"], "metal")

    # 柄：紫色菱形缠绳
    def tsuka(x, y, z):
        t = ((x + 6.25) % 1.25) - 0.625
        w = z if abs(y) >= abs(z) else y
        if abs(t) / 0.625 + abs(w) / 0.5 <= 1.0:
            return P["wrap_l"]
        return P["wrap"]

    sword.fill((-6.25, -1.0, -0.5, 0.5, -0.5, 0.5), tsuka, "cloth")
    sword.fill((-1.0, -0.5, -0.75, 0.75, -0.75, 0.75),
               lambda x, y, z: P["brass_l"] if z > 0.5 else P["brass"], "metal")        # 柄口
    # 刀镡：深紫、阶梯缺角
    for key in sword.keys((-0.5, 0.0, -1.25, 1.25, -1.75, 1.75)):
        x, y, z = sword.center(key)
        ay, az = abs(y), abs(z)
        if (ay > 0.75 and az > 1.25) or (ay > 1.0 and az > 1.0):
            continue
        if (ay > 1.0 and az < 0.25) or (az > 1.5 and ay < 0.25):
            continue
        edge = ay > 1.0 or az > 1.5 or (ay > 0.75 and az > 1.0)
        c = P["tsuba_l"] if edge else P["tsuba"]
        if not edge and 0.5 < ay < 0.75 and 0.75 < az < 1.25:
            c = P["tsuba_d"]
        sword.c[key] = (c, "lacquer")
    # 鎺（黄铜）
    sword.fill((0.0, 1.0, -0.5, 0.5, -0.75, 0.75), lambda x, y, z: P["brass_l"] if z > 0.5 else P["brass"], "metal")
    sword.paint((0.25, 0.75, -0.5, 0.5, -0.25, 0.5), P["brass_d"], "metal")

    # 刀身（收在鞘内，拔刀时可见）
    def blade(x, y, z):
        if z > 0.25:
            return P["blade_e"]
        if z > 0.0:
            return P["blade_m"]
        return P["blade"]

    for key in sword.keys((1.0, 18.0, -0.25, 0.25, -0.5, 0.5)):
        x, y, z = sword.center(key)
        if x > 16.25 and z > 0.5 - (x - 16.25) * 0.6:
            continue
        sword.c[key] = (blade(x, y, z), "metal")

    # 刀鞘
    def saya_fn(x, y, z):
        return P["saya_l"] if z > 0.5 else (P["saya_d"] if z < -0.5 else P["saya"])

    saya.fill((1.0, 18.75, -0.5, 0.5, -0.75, 0.75), saya_fn, "lacquer")
    # 下绪缠绕（两段）+ 栗形（黑色钮）
    cordc = lambda x, y, z: P["cord_l"] if fl(x, .25) % 2 == 0 else P["cord"]
    for xa, xb in ((1.75, 2.75), (3.25, 4.25)):
        saya.fill((xa, xb, -0.75, 0.75, -1.0, 1.0), cordc, "cloth", empty_only=True)
        saya.paint((xa, xb, -0.5, 0.5, -0.75, 0.75), cordc, "cloth")
    saya.fill((2.75, 3.25, -0.75, 0.75, -0.5, 0.5), P["knob"], "lacquer")
    # 垂穗：左右各两股，每股 3 节 0.5 像素方块，逐节往外斜
    for x0, dx in ((1.75, -0.5), (2.25, -0.25), (3.25, 0.25), (3.75, 0.5)):
        for step in range(3):
            xs = x0 + dx * step
            z = -1.0 - 0.5 * step
            saya.fill((xs, xs + 0.5, -0.25, 0.25, z - 0.5, z), P["cord_d"] if step == 2 else P["cord"], "cloth")
    # 黄铜环
    saya.fill((4.5, 5.0, -0.75, 0.75, -1.0, 1.0), P["brass"], "metal")
    saya.paint((4.5, 5.0, -0.75, 0.75, 0.75, 1.0), P["brass_l"], "metal")
    # 鞘尾（黄铜 + 回纹）
    saya.fill((17.25, 18.75, -0.75, 0.75, -1.0, 1.0),
              lambda x, y, z: P["brass_l"] if z > 0.75 else P["brass"], "metal")
    MEANDER = ["BBBBBB",
               "BddddB",
               "BBBBdB",
               "BddBdB",
               "BdBBdB",
               "BdddBB",
               "BBBBBB",
               "BBBBBB"]
    for row, line in enumerate(MEANDER):
        for col_i, ch in enumerate(line):
            if ch != "d":
                continue
            x = 17.25 + col_i * 0.25
            z = 1.0 - (row + 1) * 0.25
            for yy in ((0.5, 0.75), (-0.75, -0.5)):
                saya.paint((x, x + 0.25, *yy, z, z + 0.25), P["saya_d"], "lacquer")
    return saya, sword


def katana_bend(x, y, z):
    xc, hw, s = 5.75, 13.0, 0.6
    t = (x - xc) / hw
    return (x, y, z + s * max(0.0, 1 - t * t))


def build_wrench():
    """本地坐标：握点在原点，轴线 +Z，钳口朝 -Y。"""
    v = Vox(0.25)
    v.fill((-1, 1, -1, 1, -5.5, -5.0), P["wood_d"], "leather")
    v.fill((-0.75, 0.75, -0.75, 0.75, -5.0, 0.5),
           lambda x, y, z: P["grip_d"] if fl(z, .25) % 4 == 0 else (P["grip_l"] if x < -0.5 else P["grip"]),
           "leather")
    v.fill((-1, 1, -1, 1, 0.5, 1.5), lambda x, y, z: P["steel_l"] if x < -0.75 else P["steel"], "metal")
    v.fill((-1.25, 1.25, -1.25, 2.25, 1.5, 4.0), lambda x, y, z: P["wood_l"] if x < -1.0 else P["wood"], "leather")
    v.fill((-1.5, 1.5, -3.0, 2.5, 3.0, 4.25), P["brass"], "metal")
    v.paint((-1.5, 1.5, -3.0, 2.5, 4.0, 4.25), P["brass_l"], "metal")
    v.fill((-1, 1, 0.25, 2.25, 4.25, 11.75), lambda x, y, z: P["wood_l"] if x < -0.75 else P["wood"], "leather")
    v.fill((-0.75, 0.75, -1.5, 0.25, 4.25, 8.75),
           lambda x, y, z: P["steel_d"] if fl(z, .25) % 2 == 0 else P["steel"], "metal")
    v.fill((-1.25, 1.25, -4.25, 0.25, 8.75, 10.25), P["brass"], "metal")
    v.paint((-1.25, 1.25, -4.25, 0.25, 10.0, 10.25), P["brass_l"], "metal")
    v.fill((-1.25, 1.25, -4.25, 2.5, 11.75, 13.25), P["brass"], "metal")
    v.paint((-1.25, 1.25, -4.25, 2.5, 11.75, 12.0), P["brass_d"], "metal")
    v.remove((-0.75, 0.75, -3.5, 1.75, 13.0, 13.25))
    v.paint((-0.75, 0.75, -3.5, 1.75, 12.75, 13.0), P["wood_d"], "leather")
    return v


# ---------------------------------------------------------------- Blender 端：材质 / 网格
MAT_ORDER = ["cloth", "skin", "hair", "leather", "metal", "glass", "lacquer", "emit"]
SHADE = dict(       # 卡通风格：面朝向（相机空间）→ 颜色系数（sRGB）。正对镜头 = 调色板原色
    front=(1.0, 1.0, 1.0), back=(0.52, 0.53, 0.6),
    up=(1.16, 1.16, 1.14), down=(0.56, 0.56, 0.62),
    left=(0.8, 0.81, 0.87), right=(0.6, 0.62, 0.74),
)
PBR = dict(         # 自然光风格：各部位的 Principled 参数
    cloth=dict(rough=0.9, spec=0.2),
    skin=dict(rough=0.6, spec=0.3),
    hair=dict(rough=0.82, spec=0.12),
    leather=dict(rough=0.6, spec=0.3),
    metal=dict(rough=0.38, metal=0.35, spec=0.6),
    glass=dict(rough=0.06, spec=1.0, emit=0.35),
    lacquer=dict(rough=0.5, spec=0.3),
    emit=dict(rough=0.5, emit=3.0),
)
BEVEL_M = 0.0045          # 自然光风格：方块边缘倒角半径（米，约 0.07 像素）
CAVITY_M = 0.04           # 自然光风格：缝隙暗角范围（米）
MATS = {}


def _lin3(c):
    return tuple(max(0.0, v) ** 2.2 for v in c)


def _new_mat(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    for n in list(m.node_tree.nodes):
        m.node_tree.nodes.remove(n)
    return m


def _toon_tree(m, glow=False):
    """卡通：顶点色 × 按相机空间法线插值的明暗系数 → 自发光（EEVEE 相机空间：+X 右、+Y 上、-Z 朝向镜头）。"""
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    N = nt.nodes.new
    out = N("ShaderNodeOutputMaterial")
    em = N("ShaderNodeEmission")
    vc = N("ShaderNodeVertexColor")
    vc.layer_name = "Col"
    if glow:
        nt.links.new(vc.outputs["Color"], em.inputs["Color"])
        em.inputs["Strength"].default_value = 1.35
        nt.links.new(em.outputs[0], out.inputs["Surface"])
        return
    geo = N("ShaderNodeNewGeometry")
    vt = N("ShaderNodeVectorTransform")
    vt.vector_type = "NORMAL"
    vt.convert_from = "WORLD"
    vt.convert_to = "CAMERA"
    sep = N("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Normal"], vt.inputs["Vector"])
    nt.links.new(vt.outputs["Vector"], sep.inputs[0])
    acc = None
    for axis, (neg, pos) in zip("XYZ", (("left", "right"), ("down", "up"), ("front", "back"))):
        comp = sep.outputs[axis]
        sq = N("ShaderNodeMath")
        sq.operation = "MULTIPLY"
        nt.links.new(comp, sq.inputs[0])
        nt.links.new(comp, sq.inputs[1])
        gt = N("ShaderNodeMath")
        gt.operation = "GREATER_THAN"
        nt.links.new(comp, gt.inputs[0])
        gt.inputs[1].default_value = 0.0
        a, b = _lin3(SHADE[neg]), _lin3(SHADE[pos])
        ma = N("ShaderNodeVectorMath")
        ma.operation = "MULTIPLY_ADD"
        ma.inputs[0].default_value = tuple(b[i] - a[i] for i in range(3))
        nt.links.new(gt.outputs[0], ma.inputs[1])
        ma.inputs[2].default_value = a
        sc = N("ShaderNodeVectorMath")
        sc.operation = "SCALE"
        nt.links.new(ma.outputs[0], sc.inputs[0])
        nt.links.new(sq.outputs[0], sc.inputs[3])
        if acc is None:
            acc = sc
        else:
            ad = N("ShaderNodeVectorMath")
            ad.operation = "ADD"
            nt.links.new(acc.outputs[0], ad.inputs[0])
            nt.links.new(sc.outputs[0], ad.inputs[1])
            acc = ad
    mul = N("ShaderNodeVectorMath")
    mul.operation = "MULTIPLY"
    nt.links.new(vc.outputs["Color"], mul.inputs[0])
    nt.links.new(acc.outputs[0], mul.inputs[1])
    nt.links.new(mul.outputs[0], em.inputs["Color"])
    em.inputs["Strength"].default_value = 1.0
    nt.links.new(em.outputs[0], out.inputs["Surface"])


def _set_input(node, names, value):
    for nm in names:
        if nm in node.inputs:
            node.inputs[nm].default_value = value
            return


def _natural_tree(m, tag):
    """自然光：Principled BSDF，底色 = 顶点色 × 缝隙暗角（局部 AO），法线走 Bevel 让方块边缘有圆角高光。"""
    prm = PBR[tag]
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    N = nt.nodes.new
    out = N("ShaderNodeOutputMaterial")
    bsdf = N("ShaderNodeBsdfPrincipled")
    vc = N("ShaderNodeVertexColor")
    vc.layer_name = "Col"
    ao = N("ShaderNodeAmbientOcclusion")
    ao.only_local = True
    ao.samples = 12
    ao.inputs["Distance"].default_value = CAVITY_M
    fac = N("ShaderNodeMapRange")
    fac.inputs["To Min"].default_value = 0.5
    fac.inputs["To Max"].default_value = 1.0
    nt.links.new(ao.outputs["AO"], fac.inputs["Value"])
    base = N("ShaderNodeVectorMath")
    base.operation = "SCALE"
    nt.links.new(vc.outputs["Color"], base.inputs[0])
    nt.links.new(fac.outputs["Result"], base.inputs[3])
    nt.links.new(base.outputs[0], bsdf.inputs["Base Color"])
    bev = N("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = BEVEL_M
    nt.links.new(bev.outputs["Normal"], bsdf.inputs["Normal"])
    nt.links.new(bev.outputs["Normal"], ao.inputs["Normal"])
    _set_input(bsdf, ["Roughness"], prm.get("rough", 0.5))
    _set_input(bsdf, ["Metallic"], prm.get("metal", 0.0))
    _set_input(bsdf, ["Specular IOR Level"], prm.get("spec", 0.5))
    if prm.get("emit"):
        nt.links.new(vc.outputs["Color"], bsdf.inputs["Emission Color"])
        _set_input(bsdf, ["Emission Strength"], prm["emit"])
    nt.links.new(bsdf.outputs[0], out.inputs["Surface"])


def build_mat_trees(style):
    for tag in MAT_ORDER:
        m = MATS[tag]
        if style == "natural":
            _natural_tree(m, tag)
        else:
            _toon_tree(m, glow=(tag == "emit"))


def make_materials():
    for tag in MAT_ORDER:
        MATS[tag] = _new_mat("LY_" + tag)
    build_mat_trees(STYLE)

    m = _new_mat("LY_outline")
    nt = m.node_tree
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    mixn = nt.nodes.new("ShaderNodeMixShader")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    em = nt.nodes.new("ShaderNodeEmission")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    em.inputs["Color"].default_value = (0.006, 0.004, 0.003, 1)
    nt.links.new(geo.outputs["Backfacing"], mixn.inputs[0])
    nt.links.new(em.outputs[0], mixn.inputs[1])
    nt.links.new(tr.outputs[0], mixn.inputs[2])
    nt.links.new(mixn.outputs[0], out.inputs["Surface"])
    m.use_backface_culling = True
    m.diffuse_color = (0, 0, 0, 1)
    MATS["outline"] = m


def mat_of(tag):
    return tag


FACES = (
    ((1, 0, 0), ((1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1))),
    ((-1, 0, 0), ((0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0))),
    ((0, 1, 0), ((0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0))),
    ((0, -1, 0), ((0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1))),
    ((0, 0, 1), ((0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1))),
    ((0, 0, -1), ((0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0))),
)


def _finish_mesh(name, verts, faces, fcol, fmat, used, coll, hull):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    ca = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    flat = []
    for f, c in zip(faces, fcol):
        flat.extend((s2l(c[0]), s2l(c[1]), s2l(c[2]), 1.0) * len(f))
    ca.data.foreach_set("color", flat)
    me.polygons.foreach_set("material_index", fmat)
    try:
        me.color_attributes.active_color_name = "Col"
        me.color_attributes.default_color_name = "Col"
    except Exception:
        pass
    me.update()
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    for m in used:
        me.materials.append(MATS[m])
    if hull:
        for _ in used:
            me.materials.append(MATS["outline"])
        mod = ob.modifiers.new("Outline", "SOLIDIFY")
        mod.thickness = HULL_PX * U
        mod.offset = 1.0
        mod.use_flip_normals = True
        mod.use_even_offset = False
        mod.use_rim = False
        mod.material_offset = len(used)
        mod.show_render = False
        mod.show_viewport = HULL
    return ob


def _parent(ob, parent, pivot, parent_pivot):
    if parent is not None:
        ob.parent = parent
        ob.location = ((pivot[0] - parent_pivot[0]) * U, (pivot[1] - parent_pivot[1]) * U,
                       (pivot[2] - parent_pivot[2]) * U)


def make_obj(name, vox, pivot, coll, parent=None, parent_pivot=(0, 0, 0), deform=None, only=None, hull=True):
    r = vox.r
    C = vox.c
    sol = vox.solid
    used = sorted({mat_of(m) for _, m in C.values()}, key=MAT_ORDER.index)
    mi = {m: i for i, m in enumerate(used)}
    vid, verts, faces, fcol, fmat = {}, [], [], [], []
    for (i, j, k), (col, mat) in C.items():
        for d, quad in FACES:
            if only is not None and d != only:
                continue
            nb = (i + d[0], j + d[1], k + d[2])
            if nb in C or (sol is not None and sol(*nb)):
                continue
            f = []
            for a, b, c in quad:
                vk = (i + a, j + b, k + c)
                n = vid.get(vk)
                if n is None:
                    n = len(verts)
                    vid[vk] = n
                    x, y, z = vk[0] * r, vk[1] * r, vk[2] * r
                    if deform:
                        x, y, z = deform(x, y, z)
                    verts.append(((x - pivot[0]) * U, (y - pivot[1]) * U, (z - pivot[2]) * U))
                f.append(n)
            faces.append(f)
            fcol.append(col.get(d, col[None]) if isinstance(col, dict) else col)
            fmat.append(mi[mat_of(mat)])
    ob = _finish_mesh(name, verts, faces, fcol, fmat, used, coll, hull)
    _parent(ob, parent, pivot, parent_pivot)
    return ob


def make_poly_obj(name, verts_px, quads, cols, pivot, coll, parent=None, parent_pivot=(0, 0, 0)):
    """任意四边形网格（像素坐标），自动把法线翻到朝外。"""
    verts = [((x - pivot[0]) * U, (y - pivot[1]) * U, (z - pivot[2]) * U) for x, y, z in verts_px]
    ob = _finish_mesh(name, verts, [list(q) for q in quads], cols, [0] * len(quads), ["hair"], coll, False)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    _parent(ob, parent, pivot, parent_pivot)
    return ob


def basis(primary, pdir, secondary, sdir):
    ax = {}
    p = Vector(pdir).normalized()
    s = Vector(sdir)
    s = (s - p * s.dot(p)).normalized()
    ax[primary], ax[secondary] = p, s
    third = ({"x", "y", "z"} - {primary, secondary}).pop()
    if third == "x":
        ax["x"] = ax["y"].cross(ax["z"])
    elif third == "y":
        ax["y"] = ax["z"].cross(ax["x"])
    else:
        ax["z"] = ax["x"].cross(ax["y"])
    return Matrix((ax["x"], ax["y"], ax["z"])).transposed()


def place(ob, parent, hand_local_px, rot3):
    """把物体原点放到父物体（手臂）本地的 hand_local_px 处，朝向用世界方向 rot3 指定。"""
    bpy.context.view_layer.update()
    grip = parent.matrix_world @ (Vector(hand_local_px) * U)
    mw = Matrix.Translation(grip) @ rot3.to_4x4()
    ob.parent = parent
    ob.matrix_parent_inverse = Matrix.Identity(4)
    ob.matrix_basis = parent.matrix_world.inverted() @ mw


def clear_old():
    for cname in ("LiYing", "LiYing_Studio"):
        c = bpy.data.collections.get(cname)
        if c:
            for ob in list(c.all_objects):
                bpy.data.objects.remove(ob, do_unlink=True)
            bpy.data.collections.remove(c)
    for sc in list(bpy.data.scenes):
        if sc.name.startswith("LY_TEST"):
            for ob in list(sc.collection.objects):
                bpy.data.objects.remove(ob, do_unlink=True)
            bpy.data.scenes.remove(sc)
    for ob in list(bpy.data.objects):
        if ob.name.startswith(("MCP_Test_", "t_")) or ob.name in ("Camera", "Light", "Cube"):
            bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.lights, bpy.data.cameras):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)
    for m in list(bpy.data.materials):
        if m.users == 0 and (m.name.startswith(("T_", "t_")) or m.name in ("LY_GroundMat", "LY_toon", "LY_glow")):
            bpy.data.materials.remove(m)


def new_coll(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


def build():
    clear_old()
    make_materials()
    coll = new_coll("LiYing")

    root = bpy.data.objects.new("LY_Root", None)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.3
    coll.objects.link(root)

    body = make_obj("LY_Body", build_body(), (0, 0, 12), coll, root, (0, 0, 0))
    head = make_obj("LY_Head", build_skull(), (0, 0, 24), coll, body, (0, 0, 12))
    make_obj("LY_Face", build_face(), (0, 0, 24), coll, head, (0, 0, 24), only=(0, -1, 0), hull=False,
             deform=lambda x, y, z: (x, -4.02, z))
    for s, nm in ((-1, "LY_Brow.R"), (1, "LY_Brow.L")):
        vs, qs, cs = brow_mesh(s)
        make_poly_obj(nm, vs, qs, cs, (0, 0, 24), coll, head, (0, 0, 24))
    make_obj("LY_Hair", build_hair(), (0, 0, 24), coll, head, (0, 0, 24))
    make_obj("LY_Goggles", build_goggles(), (0, 0, 24), coll, head, (0, 0, 24))
    arm_r = make_obj("LY_Arm.R", build_arm(-1), (-6, 0, 22), coll, body, (0, 0, 12))
    arm_l = make_obj("LY_Arm.L", build_arm(1), (6, 0, 22), coll, body, (0, 0, 12))
    make_obj("LY_Arm.L_Brass", build_arm_details(), (6, 0, 22), coll, arm_l, (6, 0, 22))
    make_obj("LY_Arm.L_Pipe", build_pipe_vox(), (6, 0, 22), coll, arm_l, (6, 0, 22))
    leg_r = make_obj("LY_Leg.R", build_leg(-1), (-2, 0, 12), coll, root, (0, 0, 0))
    leg_l = make_obj("LY_Leg.L", build_leg(1), (2, 0, 12), coll, root, (0, 0, 0))
    mount = {"torso": (body, (0, 0, 12)), "armL": (arm_l, (6, 0, 22)), "legL": (leg_l, (2, 0, 12))}
    for g in GEARS:
        par, piv = mount[g["part"]]
        make_obj("LY_" + g["name"], gear_vox(g), piv, coll, par, piv)


    make_obj("LY_Wrench", build_wrench(), (0, 0, 0), coll)
    saya_v, sword_v = build_katana()
    grip_x = 6.5
    saya = make_obj("LY_Katana_Saya", saya_v, (grip_x, 0, 0), coll, deform=katana_bend)
    make_obj("LY_Katana_Sword", sword_v, (0, 0, 0), coll, saya, (grip_x, 0, 0), deform=katana_bend)

    apply_pose("stand")
    return coll


def apply_pose(name):
    """切换姿势预设，并按该姿势重新把扳手 / 太刀放到手里。"""
    pz = POSES[name]
    for obn, rot in pz["rot"].items():
        bpy.data.objects[obn].rotation_euler = tuple(math.radians(a) for a in rot)
    ob = bpy.data.objects
    hand, pdir, sdir = pz["wrench"]
    place(ob["LY_Wrench"], ob["LY_Arm.R"], hand, basis("z", pdir, "x", sdir))
    hand, pdir, sdir = pz["katana"][:3]
    saya = ob["LY_Katana_Saya"]
    place(saya, ob["LY_Arm.L"], hand, basis("x", pdir, "z", sdir))
    if len(pz["katana"]) > 3:
        saya.matrix_basis = saya.matrix_basis @ Matrix.Translation((pz["katana"][3] * U, 0, 0))
    bpy.context.view_layer.update()


# ---------------------------------------------------------------- 场景 / 相机 / 渲染
def setup_freestyle():
    scn = bpy.context.scene
    scn.render.use_freestyle = True
    scn.render.line_thickness_mode = "ABSOLUTE"
    vl = scn.view_layers[0]
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    fs.mode = "EDITOR"
    fs.crease_angle = math.radians(134.0)
    fs.use_culling = False
    fs.use_smoothness = False
    for ls in list(fs.linesets):
        fs.linesets.remove(ls)
    ls = fs.linesets.new("LY_Lines")
    ls.select_by_visibility = True
    ls.visibility = "VISIBLE"
    ls.select_by_edge_types = True
    ls.select_silhouette = True
    ls.select_border = False
    ls.select_crease = True
    ls.select_external_contour = True
    ls.select_contour = False
    ls.select_material_boundary = False
    ls.select_edge_mark = False
    st = ls.linestyle
    st.color = (0.005, 0.0035, 0.0025)
    st.alpha = 1.0
    st.thickness = 3.0
    st.thickness_position = "CENTER"
    st.caps = "SQUARE"


def set_line(px):
    ls = bpy.context.scene.view_layers[0].freestyle_settings.linesets.get("LY_Lines")
    if ls and ls.linestyle:
        ls.linestyle.thickness = max(1.0, min(8.0, px))


NAT_EXPOSURE = -0.7       # 自然光风格的曝光（按参考图皮肤正面颜色校准）
RIG = (  # 自然光灯光组（相对目标点，方位 0 = 相机在正前方 -Y）：名字, 位置, 尺寸, 功率, 颜色, 高光系数
    ("LY_Key", (-2.8, -3.6, 3.2), 2.6, 520.0, (1.0, 0.95, 0.88), 0.7),
    ("LY_Fill", (3.6, -2.8, 0.7), 4.0, 170.0, (0.9, 0.95, 1.0), 0.3),
    ("LY_Rim", (2.6, 3.8, 2.8), 2.2, 420.0, (1.0, 0.93, 0.84), 1.0),
    ("LY_Kick", (-3.2, 3.0, 1.2), 2.5, 160.0, (0.85, 0.9, 1.0), 0.6),
)


def _world(scn):
    w = scn.world or bpy.data.worlds.new("World")
    scn.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    nt = w.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    mr = nt.nodes.new("ShaderNodeMapRange")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
    mr.inputs["From Min"].default_value = -1.0
    mr.inputs["From Max"].default_value = 1.0
    nt.links.new(mr.outputs["Result"], ramp.inputs["Fac"])
    ramp.color_ramp.elements[0].color = (0.16, 0.15, 0.15, 1)
    ramp.color_ramp.elements[1].color = (0.56, 0.59, 0.64, 1)
    e = ramp.color_ramp.elements.new(0.5)
    e.color = (0.4, 0.38, 0.36, 1)
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.75
    nt.links.new(bg.outputs[0], out.inputs["Surface"])


def studio():
    scn = bpy.context.scene
    coll = new_coll("LiYing_Studio")
    _world(scn)

    rig = bpy.data.objects.new("LY_LightRig", None)
    rig.empty_display_type = "SPHERE"
    rig.empty_display_size = 0.2
    coll.objects.link(rig)
    rig.location = TARGET
    for name, loc, size, power, color, spec in RIG:
        ld = bpy.data.lights.new(name, "AREA")
        ld.energy = power
        ld.size = size
        ld.color = color
        ld.specular_factor = spec
        ld.use_shadow = True                                    # 大面积光源 → 很软的自投影，没有硬阴影
        ob = bpy.data.objects.new(name, ld)
        coll.objects.link(ob)
        ob.parent = rig
        ob.location = loc
        ob.rotation_euler = (-Vector(loc)).to_track_quat("-Z", "Y").to_euler()

    cd = bpy.data.cameras.new("LY_Cam")
    cam = bpy.data.objects.new("LY_Cam", cd)
    coll.objects.link(cam)
    scn.camera = cam
    aim_camera(cam, 30, 6, 5.8)

    try:
        scn.eevee.taa_render_samples = 32
        scn.eevee.use_raytracing = False
        scn.eevee.use_shadows = False
    except Exception:
        pass
    try:
        scn.view_settings.view_transform = "Standard"         # 不能用 AgX / Filmic：会把调色板压灰
    except TypeError:
        pass
    try:
        scn.view_settings.look = "None"
    except TypeError:
        pass
    scn.view_settings.gamma = 1.0
    scn.render.filter_size = 1.0
    scn.render.film_transparent = True
    scn.render.image_settings.file_format = "PNG"
    scn.render.image_settings.color_mode = "RGBA"
    scn.render.resolution_percentage = 100
    scn.render.resolution_x = scn.render.resolution_y = 1600
    setup_freestyle()
    set_style(STYLE)


def set_style(name):
    """切换渲染风格：toon = EEVEE 自发光卡通 + Freestyle 描边；natural = Cycles 自然光、无描边。"""
    global STYLE
    STYLE = name
    scn = bpy.context.scene
    nat = name == "natural"
    build_mat_trees(name)
    if nat:
        scn.render.engine = "CYCLES"
        c = scn.cycles
        try:
            c.device = "GPU"
        except TypeError:
            pass
        c.samples = 128
        c.use_adaptive_sampling = True
        c.adaptive_threshold = 0.012
        c.use_denoising = True
        try:
            c.denoiser = "OPENIMAGEDENOISE"
        except TypeError:
            pass
        c.max_bounces = 6
        c.sample_clamp_indirect = 4.0
        c.filter_width = 1.0
        scn.view_settings.exposure = NAT_EXPOSURE
    else:
        try:
            scn.render.engine = "BLENDER_EEVEE"
        except TypeError:
            try:
                scn.render.engine = "BLENDER_EEVEE_NEXT"
            except TypeError:
                pass
        scn.view_settings.exposure = 0.0
    scn.render.use_freestyle = not nat
    for ob in bpy.data.objects:                                   # 视口描边外壳只在卡通风格显示
        mod = ob.modifiers.get("Outline") if ob.type == "MESH" else None
        if mod:
            mod.show_viewport = HULL and not nat
    rig = bpy.data.objects.get("LY_LightRig")
    if rig:
        for ob in rig.children:
            ob.hide_render = not nat


def orient_rig(azim, target=TARGET):
    rig = bpy.data.objects.get("LY_LightRig")
    if rig:
        rig.location = target
        rig.rotation_euler = (0, 0, math.radians(azim))


def aim_camera(cam, azim, elev, dist, target=TARGET, lens=85.0, ortho=0.0):
    """azim：0=正前方（-Y），90=人物左侧（+X）；elev：仰角度数。"""
    a, e = math.radians(azim), math.radians(elev)
    t = Vector(target)
    loc = t + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    cam.location = loc
    cam.rotation_euler = (t - loc).to_track_quat("-Z", "Y").to_euler()
    cam.data.sensor_fit = "AUTO"
    cam.data.sensor_width = 36.0
    cam.data.clip_start = 0.05
    cam.data.clip_end = 100.0
    if ortho:
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = ortho
    else:
        cam.data.type = "PERSP"
        cam.data.lens = lens


def render_to(path, azim, elev, dist, res, ortho=0.0, target=TARGET, lens=85.0, line=None):
    """渲染到 PNG；线宽默认按"每模型像素多少屏幕像素"自动换算。"""
    scn = bpy.context.scene
    cam = scn.camera
    aim_camera(cam, azim, elev, dist, target=target, lens=lens, ortho=ortho)
    orient_rig(azim, target)
    scn.render.resolution_x, scn.render.resolution_y = res
    ppm = max(res) / ortho if ortho else max(res) / (2.0 * dist * 18.0 / lens)
    set_line(line if line else LINE_MC * ppm / 16.0)
    scn.render.filepath = path
    bpy.ops.render.render(write_still=True)


def _load_rgba(path):
    import numpy as np
    im = bpy.data.images.load(path)
    w, h = im.size
    a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
    bpy.data.images.remove(im)
    return a


def _save_rgb(path, rgb):
    import numpy as np
    H_, W_ = rgb.shape[:2]
    img = bpy.data.images.new("LY_tmp_save", W_, H_, alpha=False)
    rgba = np.concatenate([rgb, np.ones((H_, W_, 1), np.float32)], axis=2)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


VIEWS = (("front", 0, 1080, (0, 0, 1.08)), ("side", 90, 1500, (0, 0.25, 1.08)), ("back", 180, 1080, (0, 0, 1.08)))


def render_sheet(path, h=1600):
    """白底三视图：正面 / 左侧 / 背面（正交），横向拼成一张 PNG。"""
    import numpy as np
    k = h / 1400.0
    tiles = []
    for i, (name, az, w, tgt) in enumerate(VIEWS):
        w = int(w * k)
        tmp = "%s.tmp%d.png" % (path, i)
        render_to(tmp, az, 0, 30, (w, h), ortho=2.35 * max(w, h) / h, target=tgt)
        a = _load_rgba(tmp)
        os.remove(tmp)
        tiles.append(a[..., :3] * a[..., 3:4] + (1.0 - a[..., 3:4]))
    _save_rgb(path, np.concatenate(tiles, axis=1))


def _isolate(names):
    """只渲染 names 里的网格，返回恢复函数。"""
    saved = {ob.name: ob.hide_render for ob in bpy.data.objects}
    for ob in bpy.data.objects:
        if ob.type == "MESH":
            ob.hide_render = ob.name not in names

    def restore():
        for n, hflag in saved.items():
            if n in bpy.data.objects:
                bpy.data.objects[n].hide_render = hflag
    return restore


def _world_points(names):
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for n in names:
        ob = bpy.data.objects[n]
        ev = ob.evaluated_get(dg)
        mw = ob.matrix_world
        pts.extend(mw @ v.co for v in ev.data.vertices)
    return pts


def render_item(path, names, forward, up, ppm=1000, pad=1.12, line=None):
    """正交渲染若干物体（透明背景），forward/up 为相机朝向与画面上方的世界方向。"""
    scn = bpy.context.scene
    cam = scn.camera
    f = Vector(forward).normalized()
    u = Vector(up)
    u = (u - f * u.dot(f)).normalized()
    r = u.cross(-f)
    pts = _world_points(names)
    xs = [p.dot(r) for p in pts]
    ys = [p.dot(u) for p in pts]
    zs = [p.dot(f) for p in pts]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    w, h = (max(xs) - min(xs)) * pad, (max(ys) - min(ys)) * pad
    center = r * cx + u * cy + f * min(zs)
    cam.matrix_world = Matrix.Translation(center - f * 10.0) @ Matrix((r, u, -f)).transposed().to_4x4()
    orient_rig(math.degrees(math.atan2(-f.x, f.y)), center)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = max(w, h)
    scn.render.resolution_x, scn.render.resolution_y = max(8, int(w * ppm)), max(8, int(h * ppm))
    set_line(line if line else LINE_MC * ppm / 16.0)
    scn.render.filepath = path
    restore = _isolate(names)
    try:
        bpy.ops.render.render(write_still=True)
    finally:
        restore()


HEAD_PARTS = ["LY_Head", "LY_Face", "LY_Brow.R", "LY_Brow.L", "LY_Hair", "LY_Goggles"]


def render_head(path, azim=0, res=1200, scale=0.82):
    """头部正交特写（用来和参考图逐像素比对五官）。"""
    render_to(path, azim, 0, 20, (res, res), ortho=scale, target=(0, 0, 29.0 * U))


def render_showcase_parts(out_dir, hero_res=2400, which=("hero", "stand34", "views", "face", "items")):
    """展示图素材（透明 PNG）：动作大图、站姿 3/4 图、三视图各一张、扳手、太刀、面部特写。
    which 可只渲其中几项（自然光风格用 Cycles，分批渲染更稳）。"""
    os.makedirs(out_dir, exist_ok=True)
    J = lambda n: os.path.join(out_dir, n)
    try:
        if "hero" in which:
            apply_pose("action")
            render_to(J("hero.png"), 30, 6, 5.9, (hero_res, hero_res), target=(0, 0, 1.12))
        apply_pose("stand")
        if "stand34" in which:
            render_to(J("stand34.png"), 32, 7, 5.9, (hero_res, hero_res), target=(0, 0, 1.1))
        for name, az, w, tgt in (VIEWS if "views" in which else ()):
            w2, h2 = int(w * 760 / 1400), 760
            render_to(J("view_%s.png" % name), az, 0, 30, (w2, h2), ortho=2.35 * max(w2, h2) / h2, target=tgt,
                      line=2.6)
        if "face" in which:
            restore = _isolate(HEAD_PARTS)
            try:
                render_head(J("face.png"), 0, 1000)
            finally:
                restore()
        if "items" not in which:
            return
        ob = bpy.data.objects
        wr = ob["LY_Wrench"].matrix_world.to_3x3()
        render_item(J("item_wrench.png"), ["LY_Wrench"], -(wr @ Vector((1, 0, 0))), wr @ Vector((0, 0, 1.0)),
                    ppm=900, line=2.6)
        sword = ob["LY_Katana_Sword"]
        loc0 = sword.location.copy()
        sword.location.z += 3.5 * U                     # 拔出的刀放在刀鞘正上方（同参考图的排法）
        ks = ob["LY_Katana_Saya"].matrix_world.to_3x3()
        render_item(J("item_katana.png"), ["LY_Katana_Saya", "LY_Katana_Sword"], ks @ Vector((0, 1, 0)),
                    ks @ Vector((0, 0, 1)), ppm=900, line=2.6)
        sword.location = loc0
    finally:
        apply_pose("stand")
        aim_camera(bpy.context.scene.camera, 30, 6, 5.8)
        bpy.context.scene.render.resolution_x = bpy.context.scene.render.resolution_y = 1600


def setup_viewport():
    """所有 3D 视口切到材质预览，并对准人物 3/4 视角。"""
    from mathutils import Euler
    for win in bpy.context.window_manager.windows:
        for area in win.screen.areas:
            if area.type != "VIEW_3D":
                continue
            sp = area.spaces.active
            sp.shading.type = "MATERIAL"
            r3d = sp.region_3d
            r3d.view_perspective = "PERSP"
            r3d.view_location = (0, 0, 1.1)
            r3d.view_rotation = Euler((math.radians(84), 0, math.radians(30))).to_quaternion()
            r3d.view_distance = 5.0


if __name__ == "__main__":
    build()
    studio()
    setup_viewport()
