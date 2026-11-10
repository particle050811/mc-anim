// 炼狱结界的线段表（纯数据，不引 three）：照启示录 2.3.6 主 jar 的 `z1gned.goetyrevelation.util.RendererUtils.renderRegularIcosahedron`
// （CFR 反编译第 101～135 行，下面写「工具 N」）和它调的 renderRegularPolygon5（61～79）、renderRegularPolygon5div1（81～99）逐步重放。
// 函数名叫正二十面体，画出来的是**正十二面体**的线框：12 个正五边形（外接圆半径 1，离中心 1.309017 = 正十二面体的内切球半径），
// 20 个顶点、30 条棱。上下两个整五边形各 5 条边，10 个侧面各跳过一条边画 4 条，一共 50 段，其中 20 条棱画了两遍
// （侧面的倾角写的是 1.1074114，准确值 1.1071487，所以两遍差约 0.0004 个单位，叠不严）。
// 坐标：MC 的轴（x 东、y 上、z 南），单位是「半径系数 1」，已经含工具 112 行的绕 X 转 −90°；不含半径缩放和结界随时间的三轴旋转。
// 「法线」不是线的方向：原版给每个顶点写的是 (x2−x, 1, y2−y)（工具 75、76、95、96），原版的线着色器拿它当线的方向去算线宽往哪边撑，
// 所以每条线撑出来的宽度随朝向变，转起来忽粗忽细。照抄。

export type 向量 = [number, number, number];
export type 结界线段 = { 起: 向量; 止: 向量; 法线: 向量 };

const f32 = Math.fround;

// Mth.sin / Mth.cos：65536 格的查表（net.minecraft.util.Mth）
const SIN = Float32Array.from({ length: 65536 }, (_, i) => Math.sin((i * Math.PI * 2) / 65536));
const mthSin = (x: number) => SIN[Math.trunc(f32(f32(x) * f32(10430.378))) & 65535]!;
const mthCos = (x: number) => SIN[Math.trunc(f32(f32(f32(x) * f32(10430.378)) + 16384)) & 65535]!;

// 3×3 旋转矩阵，行优先。PoseStack.mulPose 是右乘
type 矩阵 = number[];
const 乘 = (a: 矩阵, b: 矩阵): 矩阵 => {
  const r = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j]! += a[i * 3 + k]! * b[k * 3 + j]!;
  return r;
};
const 转X = (a: number): 矩阵 => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
const 转Y = (a: number): 矩阵 => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
const 转Z = (a: number): 矩阵 => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
const 变 = (m: 矩阵, [x, y, z]: 向量): 向量 => [m[0]! * x + m[1]! * y + m[2]! * z, m[3]! * x + m[4]! * y + m[5]! * z, m[6]! * x + m[7]! * y + m[8]! * z];

/** 五边形外接圆半径（工具 110 行 l）、五边形离中心（工具 109 行 ri） */
export const 结界五边形 = { 外接圆半径: 1, 离中心: f32(1.309017) } as const;
/** 半径系数 1 时顶点离中心多远（正十二面体外接球半径）：√(1 + 1.309017²) ≈ 1.6472 */
export const 结界外接球半径 = Math.hypot(结界五边形.外接圆半径, 结界五边形.离中心);

/**
 * 50 条线段。边比例：每条边画到几成（工具的 percent）。结界实体传 1；亚波伦死亡演出（ClientDeathPerformance 第 75 行）传 0～1 的进度，
 * 这时整五边形的边沿外接圆的弧取终点（工具 67～69），侧面的边沿弦取（工具 88、89），照抄。
 */
export const 结界线段表 = (边比例 = 1): 结界线段[] => {
  const 出: 结界线段[] = [];
  const { 外接圆半径: l, 离中心: ri } = 结界五边形;
  const 加 = (m: 矩阵, x: number, y: number, x2: number, y2: number) => {
    // matrix4f.translate(0,0,depth) 后顶点写 (x, y, 0)：等于 m·(x, y, depth)；法线只过旋转
    出.push({ 起: 变(m, [x, y, ri]), 止: 变(m, [x2, y2, ri]), 法线: 变(m, [x2 - x, 1, y2 - y]) });
  };
  // renderRegularPolygon5：PI 写的是 3.1415925f，循环变量是 float 累加，照 float 算圈数
  const 整五边形 = (m: 矩阵) => {
    const PI = f32(3.1415925);
    const 步 = f32(PI * f32(0.4));
    for (let a = 0; a < f32(2 * PI); a = f32(a + 步)) {
      const d = f32(步 * f32(边比例));
      加(m, f32(l * mthCos(a)), f32(l * mthSin(a)), f32(l * mthCos(f32(a + d))), f32(l * mthSin(f32(a + d))));
    }
  };
  // renderRegularPolygon5div1：跳过 alpha == 步×2 的那条边
  const 缺一边五边形 = (m: 矩阵) => {
    const PI = f32(Math.PI);
    const 步 = f32(PI * f32(0.4));
    for (let a = 0; a < f32(2 * PI); a = f32(a + 步)) {
      if (a === f32(步 * 2)) continue;
      const c = mthCos(a);
      const s = mthSin(a);
      const c2 = c + 边比例 * (mthCos(f32(a + 步)) - c);
      const s2 = s + 边比例 * (mthSin(f32(a + 步)) - s);
      加(m, f32(l * c), f32(l * s), f32(l * c2), f32(l * s2));
    }
  };
  const PI = f32(Math.PI);
  const 倾角 = f32(1.1074114); // 工具 107 行 alpha
  const 侧面 = (m: 矩阵) => 缺一边五边形(乘(乘(m, 转Z(PI)), 转Y(倾角)));
  let m = 转X(-PI / 2); // 工具 112
  整五边形(m); // 114
  for (let i = 0; i < 5; i++) {
    m = 乘(m, 转Z(f32(PI * f32(0.4)))); // 116
    侧面(m); // 117～121
  }
  m = 乘(m, 转Y(PI)); // 123
  整五边形(m); // 124
  for (let i = 0; i < 5; i++) {
    m = 乘(m, 转Z(f32((72 * Math.PI) / 180))); // 126
    侧面(m); // 127～131
  }
  return 出;
};

/** 原版数值。出处：RevelationFix 4.9 的 RevelationCageEntityRenderer（渲 N）、RevelationCageEntity（实 N）、ClientDeathPerformance（死 N），CFR 反编译行号 */
export const 炼狱结界原版 = {
  /** 渲 45：scale 5.8905764。顶点离中心 5.8905764 × 1.6472 ≈ 9.70 格 */
  半径系数: 5.8905764,
  /** 死 67：死亡演出是 11.781153 × 进度 */
  死亡演出半径系数: 11.781153,
  /** 渲 54、死 75：颜色 (0.5411765, 0, 0.105882354) = #8A001B */
  颜色: [0.5411765, 0, 0.105882354] as 向量,
  /** 渲 50～53、死 71～74：Blaze3D.getTime()（开游戏以来的秒，真实时间不是游戏刻）× 50 度，依次绕 X、Y、Z 转同一个角度；7.2 秒一圈 */
  每秒转度: 50,
  /** 实 162～168：淡入、淡出各 30 刻，线性 */
  淡入刻: 30,
  淡出刻: 30,
  /** 实 114：伤害、钉住的范围是结界所在方块向外扩 8.5 格的方盒子 */
  作用半格: 8.5,
} as const;

/** 透明度，照 RevelationCageEntity.alpha（实 162～168）。活了几刻（可带小数）；停手刻：施法者停手那一刻的 aliveTicks（原版 MaxAge），没停不给 */
export const 炼狱结界透明度 = (活了几刻: number, 停手刻?: number): number => {
  if (停手刻 !== undefined && 停手刻 > 0) return Math.max(0, 1 - Math.min((活了几刻 - 停手刻) / 炼狱结界原版.淡出刻, 1));
  return Math.min(活了几刻 / 炼狱结界原版.淡入刻, 1);
};

/**
 * 去掉重复后的 30 条棱、20 个顶点（坐标同 结界线段表(1)）。给不照原版画法的用：加色发光的线要是照 50 段画，画了两遍的 20 条棱会比另外 10 条亮一倍。
 * 重复的两遍差约 0.0004 个单位，各取先画的那一遍。
 */
export const 结界棱表 = (): { 顶点: 向量[]; 棱: [number, number][] } => {
  const 顶点: 向量[] = [];
  const 号 = (p: 向量) => {
    const i = 顶点.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 0.01);
    return i >= 0 ? i : 顶点.push(p) - 1;
  };
  const 有 = new Set<string>();
  const 棱: [number, number][] = [];
  for (const s of 结界线段表(1)) {
    const [a, b] = [号(s.起), 号(s.止)];
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!有.has(k)) {
      有.add(k);
      棱.push([a, b]);
    }
  }
  return { 顶点, 棱 };
};
