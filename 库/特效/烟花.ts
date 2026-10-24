// 原版烟花（1.20.1）：火箭往上蹿、拖白火花，到寿命炸成一球火花，火花随年龄换贴图、过半寿命淡出，带拖尾的一路留下不动的火花，带闪烁的后段一闪一闪。
// 纯模块（不 import react、three），给一个歌上的秒数，算出这一刻还在的火箭、火花和闪光，画法另写（作品里按镜头的像素网格画）。
// 照原版：FireworkRocketEntity.tick（每刻 速度 ×(1.15, 1, 1.15) + (0, 0.04, 0) 再移动，移动后在新位置放一颗白火花，速度 (高斯·0.05, −竖速·0.5, 高斯·0.05)）；
//   FireworkParticles.Starter（球：−size～size 的立方体外壳，每点抖 (rand − rand)·0.5，速度 = 方向 ÷ (长/speed + 高斯·0.05)；小球 (0.25, 2) 98 颗、大球 (0.5, 4) 386 颗）；
//   SparkParticle（重力 0.1、摩擦 0.91、半边长 0.075～0.15、寿命 48 + rand(12)、贴图 spark_7 → spark_0、过半寿命 alpha = 1 − (age − 寿命/2)/寿命；
//   拖尾：age < 寿命/2 且 (age + 寿命) 为偶数时在原地放一颗 age = 寿命/2 的；闪烁：age ≥ 寿命/3 后 ((age + 寿命)/3) 为奇数的刻不画）；
//   FLASH（OverlayParticle，寿命 4 刻，颜色取第一种颜色）。数都是 client jar 反汇编核过的。
// 坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格），时间是歌上的秒，原版一刻 = 1/20 秒；位置在两刻之间按原版渲染插值。

/** 原版 DyeColor 的烟花色（getFireworkColor） */
export const 烟花染料色 = {
  白: 0xf0f0f0,
  橙: 0xeb8844,
  品红: 0xc354cd,
  淡蓝: 0x6689d3,
  黄: 0xdecf2a,
  黄绿: 0x41cd34,
  粉: 0xd88198,
  灰: 0x434343,
  淡灰: 0xababab,
  青: 0x287697,
  紫: 0x7b2fbe,
  蓝: 0x253192,
  棕: 0x51301a,
  绿: 0x3b511a,
  红: 0xb3312c,
  黑: 0x1e1b1b,
} as const;
export type 烟花染料 = keyof typeof 烟花染料色;

export type 一发烟花 = {
  名: string;
  /** 火箭放出（第 0 刻）在歌上的秒 */
  发射秒: number;
  /** 移动几刻后炸（原版 寿命 + 1；Flight 0 的寿命 10～21，所以 11～22） */
  飞刻: number;
  /** 放的位置：地面上的 [x, y]，火箭从 z = 地面 + 0.15 起（右键方块顶面往外 0.15） */
  位: readonly [number, number];
  形: '小球' | '大球';
  色们: readonly 烟花染料[];
  拖尾?: boolean;
  闪烁?: boolean;
  种子: number;
};

const 刻长 = 1 / 20;
const 地面 = 0;
const 起高 = 0.15;
const 火花重力 = 0.04 * 0.1;
const 火花摩擦 = 0.91;

/** 炸开在歌上的秒 */
export const 炸开秒 = (发: 一发烟花) => 发.发射秒 + 发.飞刻 * 刻长;

// 确定性随机数（mulberry32）：每帧从头重算，同一发每次都是同一个样子
const 随机 = (seed: number) => {
  let s = seed >>> 0;
  const r = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const 高斯 = () => {
    const u = Math.max(1e-12, r());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  };
  return { r, 高斯, 整: (n: number) => Math.floor(r() * n) };
};

type V3 = [number, number, number];
const 插 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** 火箭每刻末的位置（第 0 项是放出的位置），共 飞刻 + 1 项；和每刻移动后的竖速 */
export const 火箭轨迹 = (发: 一发烟花): { 位: V3[]; 竖速: number[] } => {
  const g = 随机(发.种子 * 977 + 1);
  // triangle(0, 0.002297) = 0.002297 × (rand − rand)
  let vx = 0.002297 * (g.r() - g.r());
  let vy = 0.002297 * (g.r() - g.r());
  let vz = 0.05;
  const 位: V3[] = [[发.位[0], 发.位[1], 地面 + 起高]];
  const 竖速 = [vz];
  for (let k = 1; k <= 发.飞刻; k++) {
    vx *= 1.15;
    vy *= 1.15;
    vz += 0.04;
    const p = 位[k - 1]!;
    位.push([p[0] + vx, p[1] + vy, p[2] + vz]);
    竖速.push(vz);
  }
  return { 位, 竖速 };
};

/** 炸点：最后一刻火箭的位置 */
export const 炸点 = (发: 一发烟花): V3 => 火箭轨迹(发).位[发.飞刻]!;

/** 火箭本体（画成朝镜头的物品贴图，原版 GROUND 显示：0.5 格见方、中心比实体位置高 0.125 格）；没放或已经炸了给 null */
export const 火箭位置 = (发: 一发烟花, 秒: number): V3 | null => {
  const τ = (秒 - 发.发射秒) / 刻长;
  if (τ < 0 || τ >= 发.飞刻) return null;
  const { 位 } = 火箭轨迹(发);
  const k = Math.floor(τ);
  return 插(位[k]!, 位[Math.min(k + 1, 发.飞刻)]!, τ - k);
};

export type 火花 = {
  /** 方片中心（场景坐标） */
  p: V3;
  /** 半边长（格，原版 quadSize） */
  半: number;
  /** 贴图：spark_0～spark_7 的 n（年轻的是 7、最大） */
  贴图: number;
  /** 颜色（sRGB 0～1） */
  色: V3;
  alpha: number;
};

type 粒子 = {
  /** 生出来的刻（相对炸开或放出，整数，这一刻末生出、下一刻起动） */
  生刻: number;
  位: V3;
  速: V3;
  寿命: number;
  半: number;
  /** 生出来时的 age（拖尾那颗是 寿命/2） */
  起龄: number;
  色: V3;
  拖尾: boolean;
  闪烁: boolean;
};

const 拆色 = (c: number): V3 => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];

/** 一颗火花按原版走 n 刻（n ≥ 0），返回每刻末的位置；拖尾的话顺手记下这一路放出的火花 */
const 走 = (q: 粒子, n: number, 拖尾们?: 粒子[], g?: ReturnType<typeof 随机>): V3[] => {
  const 位们: V3[] = [q.位];
  let [x, y, z] = q.位;
  let [vx, vy, vz] = q.速;
  let 着地 = false;
  for (let i = 1; i <= n; i++) {
    const age = q.起龄 + i;
    vz -= 火花重力;
    x += vx;
    y += vy;
    z += vz;
    if (z < 地面) {
      z = 地面;
      vz = 0;
      着地 = true;
    }
    vx *= 火花摩擦;
    vy *= 火花摩擦;
    vz *= 火花摩擦;
    if (着地) {
      vx *= 0.7;
      vy *= 0.7;
    }
    位们.push([x, y, z]);
    if (拖尾们 && g && q.拖尾 && age < Math.floor(q.寿命 / 2) && (age + q.寿命) % 2 === 0) {
      // 新的一颗：自己的随机大小、寿命，age 直接设成 寿命/2，颜色照抄
      const 半 = 0.1 * (g.r() * 0.5 + 0.5) * 2 * 0.75;
      const 寿命 = 48 + g.整(12);
      拖尾们.push({ 生刻: q.生刻 + i, 位: [x, y, z], 速: [0, 0, 0], 寿命, 半, 起龄: Math.floor(寿命 / 2), 色: q.色, 拖尾: false, 闪烁: q.闪烁 });
    }
  }
  return 位们;
};

const 新火花 = (g: ReturnType<typeof 随机>, 生刻: number, 位: V3, 速: V3, 色: V3, 拖尾: boolean, 闪烁: boolean): 粒子 => {
  // Particle 构造：quadSize = 0.1 × (rand·0.5 + 0.5) × 2，SparkParticle 再 ×0.75；寿命 48 + rand(12)
  const 半 = 0.1 * (g.r() * 0.5 + 0.5) * 2 * 0.75;
  return { 生刻, 位, 速, 寿命: 48 + g.整(12), 半, 起龄: 0, 色, 拖尾, 闪烁 };
};

/** 这一颗在 τ 刻（相对它那一串的 0 刻，带小数）的样子；不在就 null */
const 画一颗 = (q: 粒子, τ: number, 位们: V3[]): 火花 | null => {
  const 过 = τ - q.生刻;
  if (过 < 0) return null;
  const 走过 = Math.floor(过);
  const age = q.起龄 + 走过;
  if (age >= q.寿命) return null;
  const pt = 过 - 走过;
  const p = 插(位们[走过]!, 位们[Math.min(走过 + 1, 位们.length - 1)]!, pt);
  if (q.闪烁 && !(age < Math.floor(q.寿命 / 3) || Math.floor((age + q.寿命) / 3) % 2 === 0)) return null;
  const 半寿 = Math.floor(q.寿命 / 2);
  const alpha = age > 半寿 ? 1 - (age - 半寿) / q.寿命 : 0.99;
  // 拖尾那颗刚放出来、还没走第一刻时，贴图停在构造时的第一张（spark_7）
  const 张 = q.起龄 > 0 && 走过 === 0 ? 7 : 7 - Math.floor((age * 7) / q.寿命);
  return { p, 半: q.半, 贴图: 张, 色: q.色, alpha };
};

/** 球：立方体外壳上的点（原版 createParticleBall 的走法和随机数顺序） */
const 球火花 = (发: 一发烟花, g: ReturnType<typeof 随机>, 心: V3): 粒子[] => {
  const [速度, 大小] = 发.形 === '大球' ? [0.5, 4] : [0.25, 2];
  const 色们 = 发.色们.map((c) => 拆色(烟花染料色[c]));
  const r: 粒子[] = [];
  for (let i = -大小; i <= 大小; i++)
    for (let j = -大小; j <= 大小; j++)
      for (let k = -大小; k <= 大小; k++) {
        const dx = j + (g.r() - g.r()) * 0.5;
        const dy = i + (g.r() - g.r()) * 0.5;
        const dz = k + (g.r() - g.r()) * 0.5;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) / 速度 + g.高斯() * 0.05;
        const 色 = 色们[g.整(色们.length)]!;
        // 原版 y 朝上、z 朝南：换成场景的 (x, −z, y)
        r.push(新火花(g, 0, 心, [dx / d, -dz / d, dy / d], 色, !!发.拖尾, !!发.闪烁));
        if (i !== -大小 && i !== 大小 && j !== -大小 && j !== 大小) k += 大小 * 2 - 1;
      }
  return r;
};

/** 这一发在歌上 秒 这一刻的所有火花（火箭一路拖的白火花、炸开的球、球的拖尾） */
export const 烟花火花们 = (发: 一发烟花, 秒: number): 火花[] => {
  const τ = (秒 - 发.发射秒) / 刻长;
  if (τ < 0) return [];
  const g = 随机(发.种子 * 7919 + 3);
  const out: 火花[] = [];
  const 白: V3 = [1, 1, 1];
  // 火箭拖的白火花：第 k 刻移动后放出（k = 1…飞刻），速度 (高斯·0.05, −竖速·0.5, 高斯·0.05)
  const { 位, 竖速 } = 火箭轨迹(发);
  for (let k = 1; k <= 发.飞刻; k++) {
    const q = 新火花(g, k, 位[k]!, [g.高斯() * 0.05, -g.高斯() * 0.05, -竖速[k]! * 0.5], 白, false, false);
    if (τ < k) continue;
    const 走过 = Math.min(Math.floor(τ - k) + 1, q.寿命);
    const 一 = 画一颗(q, τ, 走(q, 走过));
    if (一) out.push(一);
  }
  if (τ < 发.飞刻) return out;
  const 心 = 位[发.飞刻]!;
  const 球 = 球火花(发, g, 心).map((q) => ({ ...q, 生刻: 发.飞刻 }));
  for (const [i, q] of 球.entries()) {
    const 走过 = Math.min(Math.floor(τ - q.生刻) + 1, q.寿命);
    const 拖尾们: 粒子[] = [];
    const 位们 = 走(q, 走过, 拖尾们, 随机(发.种子 * 31 + i * 7919 + 17));
    const 一 = 画一颗(q, τ, 位们);
    if (一) out.push(一);
    for (const t of 拖尾们) {
      if (τ < t.生刻) continue;
      const n = Math.min(Math.floor(τ - t.生刻) + 1, t.寿命 - t.起龄);
      const 尾 = 画一颗(t, τ, 走(t, n));
      if (尾) out.push(尾);
    }
  }
  return out;
};

/** 原版 FLASH：炸开时在炸点放一片朝镜头的大光片，寿命 4 刻；这里只给时刻和颜色，画法由镜头定（不画平滑光晕） */
export const 闪光 = (发: 一发烟花, 秒: number): { 心: V3; 刻: number; 色: V3 } | null => {
  const 刻 = (秒 - 炸开秒(发)) / 刻长;
  if (刻 < 0 || 刻 >= 4) return null;
  return { 心: 炸点(发), 刻, 色: 拆色(烟花染料色[发.色们[0]!]) };
};

/** 炸开时球的半径（格）：火花初速 speed 每刻 ×0.91，k 刻后走了 speed·(1 − 0.91^k)/0.09（不算重力） */
export const 球半径 = (形: 一发烟花['形'], 刻: number) => ((形 === '大球' ? 0.5 : 0.25) * (1 - 火花摩擦 ** 刻)) / (1 - 火花摩擦);

/** 声音：放出（launch）、炸开（blast / large_blast，大球用 large）、闪烁的炸完 1 + 15 刻后噼啪（twinkle） */
export const 烟花声音们 = (发: 一发烟花): { 种: '发射' | '炸' | '大炸' | '噼啪'; 秒: number }[] => {
  const 炸 = 炸开秒(发);
  return [
    { 种: '发射', 秒: 发.发射秒 },
    { 种: 发.形 === '大球' ? '大炸' : '炸', 秒: 炸 },
    ...(发.闪烁 ? [{ 种: '噼啪' as const, 秒: 炸 + 17 * 刻长 }] : []),
  ];
};
