// 基岩 / GeckoLib 动画关键帧之间的插值。纯函数，不 import react、three。
// linear、catmullrom 照车万女仆（TLM）1.5.3 自带的 GeckoLib 3 分支（MathUtil.lerpValues、MathUtil.catmullRom 反汇编）；
// 游戏里结果转 float（joml Vector3f），这里全程 double：和库里的手抄版逐位一致，和游戏差在 1e-6 量级。
// step、bezier 是基岩版 / Blockbench 的写法（没对过实现，见各自的注释）；缓动名照 GeckoLib 4 源码，见 缓动。

export type 插值方式 = 'linear' | 'step' | 'catmullrom' | 'bezier';

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

// 缓动：GeckoLib 4 关键帧 "easing" 的名字和公式，照 geckolib-forge-1.20.1-4.8.4 的 EasingType.java（MIT，源码包原文）。
// 和 easings.net 的 Penner 公式不一样的地方都照 GeckoLib 4：
//   easeInQuint 是 n⁴（它注册时写成 pow(4)，Out、InOut 才是 5 次）；Expo 是 2^(10(n−1))，0 处不是 0；
//   Elastic 是 1 − cos³(nπ/2)·cos(n·k·π)（k = 参数，默认 1）；Bounce 是四段抛物线取最小（参数 = 弹性，默认 0.5）；
//   Back 的参数是 1.70158 的倍数（默认 1 倍）；step 默认 2 级（只到 0.5），级数 < 2 报错。
// 名字不分大小写（GeckoLib 4 先转小写再查表），不认识的按 linear（同 GeckoLib 4 的 fromString）。
// 段末（进度到 1）GeckoLib 4 直接取终点值，不过缓动（EasingType.apply），所以 Expo 这类 1 处不等于 1 的也不跳
type 曲线 = (n: number) => number;
const 出 = (f: 曲线): 曲线 => (n) => 1 - f(1 - n);
const 进出 = (f: 曲线): 曲线 => (n) => (n < 0.5 ? f(n * 2) / 2 : 1 - f((1 - n) * 2) / 2);
const 幂 = (k: number): 曲线 => (n) => n ** k;
const f32 = Math.fround;
const 弹跳 = (a?: number): 曲线 => {
  const n2 = a ?? 0.5;
  // 6f/11f 这些是 Java 的 float 除法
  const [c1, c2, c3] = [f32(6 / 11), f32(9 / 11), f32(10.5 / 11)];
  return (x) =>
    Math.min(
      Math.min((121 / 16) * x * x, (121 / 4) * n2 * (x - c1) ** 2 + 1 - n2),
      Math.min(121 * n2 * n2 * (x - c2) ** 2 + 1 - n2 * n2, 484 * n2 * n2 * n2 * (x - c3) ** 2 + 1 - n2 * n2 * n2),
    );
};
const 回弹 = (a?: number): 曲线 => {
  const n2 = a === undefined ? 1.70158 : a * 1.70158;
  return (t) => t * t * ((n2 + 1) * t - n2);
};
const 弹性 = (a?: number): 曲线 => {
  const n2 = a ?? 1;
  return (t) => 1 - Math.cos((t * Math.PI) / 2) ** 3 * Math.cos(t * n2 * Math.PI);
};
/** GeckoLib 4 的 step：级数 n（默认 2）时取 0、1/n … (n−1)/n 里不超过 t 的最大一级（原文是二分查找，这里照抄） */
const 分级 = (a?: number): 曲线 => {
  const n2 = a ?? 2;
  if (n2 < 2) throw new Error(`缓动 step：级数要 ≥ 2，给的是 ${n2}`);
  const 级 = Math.trunc(n2);
  const 长 = 1 / 级;
  return (t) => {
    if (t < 0) return 0;
    const 顶 = (级 - 1) * 长;
    if (t > 顶) return 顶;
    let [左, 右] = [0, 级 - 1];
    while (右 - 左 !== 1) {
      const 中 = 左 + Math.trunc((右 - 左) / 2);
      if (t >= 中 * 长) 左 = 中;
      else 右 = 中;
    }
    return 左 * 长;
  };
};
const 基本: Record<string, (a?: number) => 曲线> = {
  sine: () => (n) => 1 - Math.cos((n * Math.PI) / 2),
  quad: () => (n) => n * n,
  cubic: () => (n) => n * n * n,
  quart: () => 幂(4),
  quint: () => 幂(5),
  expo: () => (n) => 2 ** (10 * (n - 1)),
  circ: () => (n) => 1 - Math.sqrt(1 - n * n),
  back: 回弹,
  elastic: 弹性,
  bounce: 弹跳,
};
const 缓动表 = new Map<string, (a?: number) => 曲线>([
  ['linear', () => (n) => n],
  ['none', () => (n) => n],
  ['step', 分级],
]);
for (const [名, f] of Object.entries(基本)) {
  缓动表.set(`easein${名}`, 名 === 'quint' ? () => 幂(4) : f);
  缓动表.set(`easeout${名}`, (a) => 出(f(a)));
  缓动表.set(`easeinout${名}`, (a) => 进出(f(a)));
}

/**
 * 缓动名 → 0～1 的进度映射（GeckoLib 4 口径）；不认识的名字按线性。
 * catmullrom 不在这里：GeckoLib 4 的 catmullrom 是样条（控制点要相邻关键帧），由 基岩动画.ts 的取样处理
 */
export const 缓动 = (名: string | undefined, u: number, 参数?: readonly number[]): number => {
  const f = 名 && 缓动表.get(名.toLowerCase());
  return f ? f(参数?.[0])(u) : u;
};

/** 认识的缓动名（文档和检查用；大小写随意） */
export const 缓动名们: readonly string[] = [
  'linear', 'none', 'step', 'catmullrom',
  ...Object.keys(基本).flatMap((k) => {
    const K = k[0]!.toUpperCase() + k.slice(1);
    return [`easeIn${K}`, `easeOut${K}`, `easeInOut${K}`];
  }),
];
