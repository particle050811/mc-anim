// 通用数学函数的正本（10-30 整体优化方案 0.6）：新代码一律从这里 import，不在段、场、地点里另写一份。
// 旧代码里的副本原样不动（改了会让用到它的段过期），登记在 docs/副本表.tsv；anim check 的「副本」规则拦新增的副本。
// 只放和 Minecraft、three 无关的纯数学：坐标换算在 坐标.ts，机位在 机位.ts，关键帧插值在 engine/anim/。纯模块，不 import 任何东西。
// 各函数取的是副本里最通用的写法，和副本不一样的地方写在各自的注释里；正本和副本逐个对过的结果见 数学.test.ts。

/** 线性插值：t = 0 给 a、t = 1 给 b，不夹 t（出了 0～1 就外推）。副本都是这个写法，`a·(1−t) + b·t` 的写法只差末位舍入 */
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 逐分量线性插值，长度照 a。副本有只算三个分量的（`插3`、`lerp3`），三维时一样 */
export const lerpV = (a: readonly number[], b: readonly number[], t: number): number[] => a.map((v, i) => v + (b[i]! - v) * t);

/** lerp 反过来：x 在 a→b 上走到哪（不夹） */
export const invLerp = (a: number, b: number, x: number) => (x - a) / (b - a);

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** x 在 e0→e1 上走到哪，夹到 0～1（e0 > e1 时反着走） */
export const linearstep = (e0: number, e1: number, x: number) => clamp01((x - e0) / (e1 - e0));

/** 三次缓动 3t² − 2t³，t 先夹到 0～1：两头速度为 0。副本叫 ss、smooth01、缓、平滑；有几份不夹（`t * t * (3 - 2 * t)`），只在 0～1 外不同 */
export const smoothstep01 = (t: number) => {
  const k = clamp01(t);
  return k * k * (3 - 2 * k);
};
/** GLSL 的 smoothstep(e0, e1, x) */
export const smoothstep = (e0: number, e1: number, x: number) => smoothstep01((x - e0) / (e1 - e0));

/** 五次缓动 6t⁵ − 15t⁴ + 10t³（t 夹到 0～1）：两头速度、加速度都为 0 */
export const smootherstep01 = (t: number) => {
  const k = clamp01(t);
  return k * k * k * (k * (k * 6 - 15) + 10);
};
export const smootherstep = (e0: number, e1: number, x: number) => smootherstep01((x - e0) / (e1 - e0));

// 常用缓动，t 都先夹到 0～1。名字照 easings.net
export const easeInQuad = (t: number) => clamp01(t) ** 2;
export const easeOutQuad = (t: number) => 1 - (1 - clamp01(t)) ** 2;
export const easeInOutQuad = (t: number) => {
  const k = clamp01(t);
  return k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
};
export const easeInCubic = (t: number) => clamp01(t) ** 3;
export const easeOutCubic = (t: number) => 1 - (1 - clamp01(t)) ** 3;
export const easeInOutCubic = (t: number) => {
  const k = clamp01(t);
  return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
};
export const easeInSine = (t: number) => 1 - Math.cos((clamp01(t) * Math.PI) / 2);
export const easeOutSine = (t: number) => Math.sin((clamp01(t) * Math.PI) / 2);
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;

/**
 * 三次埃尔米特：p0 → p1，m0、m1 是两头的切线（已乘上这一段的长度，即「每单位 t」的变化量），t 0～1。
 * 副本：engine/flight/真实飞行/弹簧.ts 同参数顺序；把回忆的 `埃尔米特(p0, p1, m0, m1, h, s)` 切线按「每帧」给、另传段长 h，
 * 等于 hermite(p0, m0·h, p1, m1·h, s)；6-1-9b 落地编排的向量版逐分量调这个。
 */
export const hermite = (p0: number, m0: number, p1: number, m1: number, t: number) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
};

export const rad = (deg: number) => (deg * Math.PI) / 180;
export const deg = (r: number) => (r * 180) / Math.PI;

/** 非负取余：mod(−1, 4) = 3 */
export const mod = (a: number, n: number) => ((a % n) + n) % n;

// ---------- 固定种子的随机数 ----------
// 渲染代码不许用 Math.random（同一帧每次渲出来要一样），要随机就用这里的。

/** 随机数发生器：每调一次给 [0, 1) 里的下一个数 */
export type Rng = () => number;

/**
 * mulberry32（Tommy Ettinger）。种子取 32 位无符号整数（`seed >>>0`），种子相同出的序列相同。
 * 副本差别：库/界面/伤害数字.tsx、库/特效/夜幕刀光/共用.tsx 把种子 0 换成 1（`seed >>> 0 || 1`，mulberry32 种子 0 本来就能用，这一换只让种子 0 的序列变了）；
 * engine/flight/真实飞行/湍流.ts 先把种子打散（`imul(seed, 0x9e3779b1) ^ 0x85ebca6b`）再进同一个发生器；作品/应力转动/地点/边城/布局/共用.ts 的 `mulberry` 用 `| 0` 存状态，出的数一样。
 */
export const mulberry32 = (seed: number): Rng => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** [lo, hi] 里的整数（两头都含） */
export const randInt = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

/** 从数组里随机取一个 */
export const pick = <T>(r: Rng, items: readonly T[]): T => items[Math.floor(r() * items.length)]!;

/** 标准正态分布（Box–Muller，取两个均匀数）。1 − r() 落在 (0, 1]，不会取 log(0)；库/特效/烟花.ts 用 max(1e−12, r()) 防 0，同一对均匀数给的值不同 */
export const gaussian = (r: Rng) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
