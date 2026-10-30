// 基岩 / GeckoLib 动画关键帧之间的插值。纯函数，不 import react、three。
// linear、catmullrom 照车万女仆（TLM）1.5.3 自带的 GeckoLib 3 分支（MathUtil.lerpValues、MathUtil.catmullRom 反汇编）；
// 游戏里结果转 float（joml Vector3f），这里全程 double：和库里的手抄版逐位一致，和游戏差在 1e-6 量级。
// step、bezier、缓动名是「通用」口径（Blockbench、GeckoLib 4 的写法），没有对着 jar 核过，见各自的注释。

export type 插值方式 = 'linear' | 'step' | 'catmullrom' | 'bezier';

export const 线性 = (a: number, b: number, u: number): number => a + u * (b - a);

/**
 * TLM 的 catmullrom：u 是段内按时间均匀的进度 0～1，p1→p2 是这一段，p0、p3 是两边相邻关键帧的值。
 * 坑：控制点不按关键帧间距加权，两边间距差得多时曲线会冲过头（魔法酒狐眨眼的眼皮会翻到 −0.125）
 */
export const catmullRom = (u: number, p0: number, p1: number, p2: number, p3: number): number => {
  const v0 = (p2 - p0) * 0.5;
  const v1 = (p3 - p1) * 0.5;
  return (2 * p1 - 2 * p2 + v0 + v1) * u ** 3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * u ** 2 + v0 * u + p1;
};

/** step：不给步数时整段停在起点值（Blockbench 的 step），给步数 n 时按 floor(u·n)/n 分级（GeckoLib 4 的 easingArgs 写法，推断） */
export const 阶跃 = (u: number, 步数?: number): number => (步数 && 步数 > 0 ? Math.floor(u * 步数) / 步数 : u >= 1 ? 1 : 0);

/**
 * 三次贝塞尔（Blockbench 关键帧的 bezier 手柄）：P0 = 起点 (t0, v0)，P1 = 起点 + 右手柄，P2 = 终点 + 左手柄，P3 = 终点 (t1, v1)；
 * 手柄是相对关键帧的 [时间, 值]。先在时间轴上解出曲线参数，再取值。手柄时间夹在本段内，保证时间单调。
 * 出处：Blockbench 关键帧面板的 bezier_left/right_time/value 字段语义；自己按定义实现，没对过 Blockbench 的输出
 */
export const 贝塞尔 = (
  t: number,
  起: { t: number; v: number; 右手柄: [number, number] },
  终: { t: number; v: number; 左手柄: [number, number] },
): number => {
  const 夹 = (x: number) => Math.min(终.t, Math.max(起.t, x));
  const x = [起.t, 夹(起.t + 起.右手柄[0]), 夹(终.t + 终.左手柄[0]), 终.t];
  const y = [起.v, 起.v + 起.右手柄[1], 终.v + 终.左手柄[1], 终.v];
  const 取 = (p: number[], s: number) => {
    const r = 1 - s;
    return r * r * r * p[0]! + 3 * r * r * s * p[1]! + 3 * r * s * s * p[2]! + s * s * s * p[3]!;
  };
  if (t <= 起.t) return 起.v;
  if (t >= 终.t) return 终.v;
  let 低 = 0;
  let 高 = 1;
  for (let i = 0; i < 60; i++) {
    const 中 = (低 + 高) / 2;
    if (取(x, 中) < t) 低 = 中;
    else 高 = 中;
  }
  return 取(y, (低 + 高) / 2);
};

// 缓动：GeckoLib 4 关键帧 "easing" 的名字（easeInSine…easeInOutBounce），公式是通用的 Penner 缓动（easings.net 的定义）。
// 参数（easingArgs）只有 Back（回弹量，默认 1.70158）、Elastic（周期系数，默认 1）、step（步数）用到
const 出 = (f: (u: number, a?: number) => number) => (u: number, a?: number) => 1 - f(1 - u, a);
const 进出 = (f: (u: number, a?: number) => number) => (u: number, a?: number) => (u < 0.5 ? f(2 * u, a) / 2 : 1 - f(2 - 2 * u, a) / 2);
const 弹跳出 = (u: number) => {
  const n = 7.5625;
  const d = 2.75;
  if (u < 1 / d) return n * u * u;
  if (u < 2 / d) return n * (u -= 1.5 / d) * u + 0.75;
  if (u < 2.5 / d) return n * (u -= 2.25 / d) * u + 0.9375;
  return n * (u -= 2.625 / d) * u + 0.984375;
};
const 进: Record<string, (u: number, a?: number) => number> = {
  Sine: (u) => 1 - Math.cos((u * Math.PI) / 2),
  Quad: (u) => u ** 2,
  Cubic: (u) => u ** 3,
  Quart: (u) => u ** 4,
  Quint: (u) => u ** 5,
  Expo: (u) => (u === 0 ? 0 : 2 ** (10 * u - 10)),
  Circ: (u) => 1 - Math.sqrt(1 - u * u),
  Back: (u, a = 1.70158) => (a + 1) * u ** 3 - a * u ** 2,
  Elastic: (u, a = 1) => (u === 0 || u === 1 ? u : -(2 ** (10 * u - 10)) * Math.sin(((u * 10 - 10.75) * (2 * Math.PI)) / (3 * a))),
  Bounce: (u) => 1 - 弹跳出(1 - u),
};

/** 缓动名 → 0～1 的进度映射；不认识的名字按线性（TLM 也是：不是 catmullrom 的一律当 linear） */
export const 缓动 = (名: string | undefined, u: number, 参数?: readonly number[]): number => {
  if (!名 || 名 === 'linear' || 名 === 'catmullrom') return u;
  if (名 === 'step') return 阶跃(u, 参数?.[0]);
  const m = /^ease(In|Out|InOut)([A-Z][a-z]+)$/.exec(名);
  const f = m && 进[m[2]!];
  if (!f) return u;
  const g = m[1] === 'In' ? f : m[1] === 'Out' ? 出(f) : 进出(f);
  return g(u, 参数?.[0]);
};

/** 认识的缓动名（文档和检查用） */
export const 缓动名们: readonly string[] = [
  'linear', 'step', 'catmullrom',
  ...Object.keys(进).flatMap((k) => [`easeIn${k}`, `easeOut${k}`, `easeInOut${k}`]),
];
