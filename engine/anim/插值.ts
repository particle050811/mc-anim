// 基岩 / GeckoLib 动画关键帧之间的插值。纯函数，不 import react、three。
// linear、catmullrom 照车万女仆（TLM）1.5.3 自带的 GeckoLib 3 分支（MathUtil.lerpValues、MathUtil.catmullRom 反汇编）；
// 游戏里结果转 float（joml Vector3f），这里全程 double：和库里的手抄版逐位一致，和游戏差在 1e-6 量级。
// step、bezier 是基岩版 / Blockbench 的写法（没对过实现，见各自的注释）；缓动名照 GeckoLib 4 源码，见 缓动。
import { easeInSine } from '../core/数学.ts';

export type InterpMode = 'linear' | 'step' | 'catmullrom' | 'bezier';

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
export const step = (u: number, steps?: number): number => (steps && steps > 0 ? Math.floor(u * steps) / steps : u >= 1 ? 1 : 0);

/**
 * 三次贝塞尔（Blockbench 关键帧的 bezier 手柄）：P0 = 起点 (t0, v0)，P1 = 起点 + 右手柄，P2 = 终点 + 左手柄，P3 = 终点 (t1, v1)；
 * 手柄是相对关键帧的 [时间, 值]。先在时间轴上解出曲线参数，再取值。手柄时间夹在本段内，保证时间单调。
 * 出处：Blockbench 关键帧面板的 bezier_left/right_time/value 字段语义；自己按定义实现，没对过 Blockbench 的输出
 */
export const bezier = (
  t: number,
  startKey: { t: number; v: number; rightHandle: [number, number] },
  endKey: { t: number; v: number; leftHandle: [number, number] },
): number => {
  const clampTime = (x: number) => Math.min(endKey.t, Math.max(startKey.t, x));
  const x = [startKey.t, clampTime(startKey.t + startKey.rightHandle[0]), clampTime(endKey.t + endKey.leftHandle[0]), endKey.t];
  const y = [startKey.v, startKey.v + startKey.rightHandle[1], endKey.v + endKey.leftHandle[1], endKey.v];
  const bezierAt = (p: number[], s: number) => {
    const r = 1 - s;
    return r * r * r * p[0]! + 3 * r * r * s * p[1]! + 3 * r * s * s * p[2]! + s * s * s * p[3]!;
  };
  if (t <= startKey.t) return startKey.v;
  if (t >= endKey.t) return endKey.v;
  let low = 0;
  let upper = 1;
  for (let i = 0; i < 60; i++) {
    const midT = (low + upper) / 2;
    if (bezierAt(x, midT) < t) low = midT;
    else upper = midT;
  }
  return bezierAt(y, (low + upper) / 2);
};

// 缓动：GeckoLib 4 关键帧 "easing" 的名字和公式，照 geckolib-forge-1.20.1-4.8.4 的 EasingType.java（MIT，源码包原文）。
// 和 easings.net 的 Penner 公式不一样的地方都照 GeckoLib 4：
//   easeInQuint 是 n⁴（它注册时写成 pow(4)，Out、InOut 才是 5 次）；Expo 是 2^(10(n−1))，0 处不是 0；
//   Elastic 是 1 − cos³(nπ/2)·cos(n·k·π)（k = 参数，默认 1）；Bounce 是四段抛物线取最小（参数 = 弹性，默认 0.5）；
//   Back 的参数是 1.70158 的倍数（默认 1 倍）；step 默认 2 级（只到 0.5），级数 < 2 报错。
// 名字不分大小写（GeckoLib 4 先转小写再查表），不认识的按 linear（同 GeckoLib 4 的 fromString）。
// 段末（进度到 1）GeckoLib 4 直接取终点值，不过缓动（EasingType.apply），所以 Expo 这类 1 处不等于 1 的也不跳
type Curve = (n: number) => number;
const toEaseOut = (f: Curve): Curve => (n) => 1 - f(1 - n);
const easeInOut = (f: Curve): Curve => (n) => (n < 0.5 ? f(n * 2) / 2 : 1 - f((1 - n) * 2) / 2);
const powerCurve = (k: number): Curve => (n) => n ** k;
const f32 = Math.fround;
const bounceEase = (a?: number): Curve => {
  const n2 = a ?? 0.5;
  // 6f/11f 这些是 Java 的 float 除法
  const [c1, c2, c3] = [f32(6 / 11), f32(9 / 11), f32(10.5 / 11)];
  return (x) =>
    Math.min(
      Math.min((121 / 16) * x * x, (121 / 4) * n2 * (x - c1) ** 2 + 1 - n2),
      Math.min(121 * n2 * n2 * (x - c2) ** 2 + 1 - n2 * n2, 484 * n2 * n2 * n2 * (x - c3) ** 2 + 1 - n2 * n2 * n2),
    );
};
const backEase = (a?: number): Curve => {
  const n2 = a === undefined ? 1.70158 : a * 1.70158;
  return (t) => t * t * ((n2 + 1) * t - n2);
};
const elasticEase = (a?: number): Curve => {
  const n2 = a ?? 1;
  return (t) => 1 - Math.cos((t * Math.PI) / 2) ** 3 * Math.cos(t * n2 * Math.PI);
};
/** GeckoLib 4 的 step：级数 n（默认 2）时取 0、1/n … (n−1)/n 里不超过 t 的最大一级（原文是二分查找，这里照抄） */
const stepped = (a?: number): Curve => {
  const n2 = a ?? 2;
  if (n2 < 2) throw new Error(`缓动 step：级数要 ≥ 2，给的是 ${n2}`);
  const levels = Math.trunc(n2);
  const bandLength = 1 / levels;
  return (t) => {
    if (t < 0) return 0;
    const levelTop = (levels - 1) * bandLength;
    if (t > levelTop) return levelTop;
    let [leftIdx, right] = [0, levels - 1];
    while (right - leftIdx !== 1) {
      const midIdx = leftIdx + Math.trunc((right - leftIdx) / 2);
      if (t >= midIdx * bandLength) leftIdx = midIdx;
      else right = midIdx;
    }
    return leftIdx * bandLength;
  };
};
const basicCurves: Record<string, (a?: number) => Curve> = {
  sine: () => easeInSine, // 1 − cos(nπ/2)，同 GeckoLib 4（它会把输入夹到 0～1，段内进度本来就在里面）
  quad: () => (n) => n * n,
  cubic: () => (n) => n * n * n,
  quart: () => powerCurve(4),
  quint: () => powerCurve(5),
  expo: () => (n) => 2 ** (10 * (n - 1)),
  circ: () => (n) => 1 - Math.sqrt(1 - n * n),
  back: backEase,
  elastic: elasticEase,
  bounce: bounceEase,
};
const easeTable = new Map<string, (a?: number) => Curve>([
  ['linear', () => (n) => n],
  ['none', () => (n) => n],
  ['step', stepped],
]);
for (const [easingName, f] of Object.entries(basicCurves)) {
  easeTable.set(`easein${easingName}`, easingName === 'quint' ? () => powerCurve(4) : f);
  easeTable.set(`easeout${easingName}`, (a) => toEaseOut(f(a)));
  easeTable.set(`easeinout${easingName}`, (a) => easeInOut(f(a)));
}

/**
 * 缓动名 → 0～1 的进度映射（GeckoLib 4 口径）；不认识的名字按线性。
 * catmullrom 不在这里：GeckoLib 4 的 catmullrom 是样条（控制点要相邻关键帧），由 基岩动画.ts 的取样处理
 */
export const applyEasing = (easingName: string | undefined, u: number, params?: readonly number[]): number => {
  const f = easingName && easeTable.get(easingName.toLowerCase());
  return f ? f(params?.[0])(u) : u;
};

/** 认识的缓动名（文档和检查用；大小写随意） */
export const easingNames: readonly string[] = [
  'linear', 'none', 'step', 'catmullrom',
  ...Object.keys(basicCurves).flatMap((k) => {
    const K = k[0]!.toUpperCase() + k.slice(1);
    return [`easeIn${K}`, `easeOut${K}`, `easeInOut${K}`];
  }),
];
