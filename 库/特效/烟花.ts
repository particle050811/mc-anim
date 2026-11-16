// 原版烟花（1.20.1）：火箭往上蹿、拖白火花，到寿命炸成一球火花，火花随年龄换贴图、过半寿命淡出，带拖尾的一路留下不动的火花，带闪烁的后段一闪一闪。
// 纯模块（不 import react、three），给一个歌上的秒数，算出这一刻还在的火箭、火花和闪光，画法另写（作品里按镜头的像素网格画）。
// 照原版：FireworkRocketEntity.tick（每刻 速度 ×(1.15, 1, 1.15) + (0, 0.04, 0) 再移动，移动后在新位置放一颗白火花，速度 (高斯·0.05, −竖速·0.5, 高斯·0.05)）；
//   FireworkParticles.Starter（球：−size～size 的立方体外壳，每点抖 (rand − rand)·0.5，速度 = 方向 ÷ (长/speed + 高斯·0.05)；小球 (0.25, 2) 98 颗、大球 (0.5, 4) 386 颗）；
//   SparkParticle（重力 0.1、摩擦 0.91、半边长 0.075～0.15、寿命 48 + rand(12)、贴图 spark_7 → spark_0、过半寿命 alpha = 1 − (age − 寿命/2)/寿命；
//   拖尾：age < 寿命/2 且 (age + 寿命) 为偶数时在原地放一颗 age = 寿命/2 的；闪烁：age ≥ 寿命/3 后 ((age + 寿命)/3) 为奇数的刻不画）；
//   FLASH（OverlayParticle，寿命 4 刻，颜色取第一种颜色）。数都是 client jar 反汇编核过的。
// 坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格），时间是歌上的秒，原版一刻 = 1/20 秒；位置在两刻之间按原版渲染插值。
import { lerpV } from '../../engine/core/数学.ts';

/** 原版 DyeColor 的烟花色（getFireworkColor） */
export const fireworkDyeColors = {
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
export type FireworkDye = keyof typeof fireworkDyeColors;

export type Firework = {
  name: string;
  /** 火箭放出（第 0 刻）在歌上的秒 */
  launchSec: number;
  /** 移动几刻后炸（原版 寿命 + 1；Flight 0 的寿命 10～21，所以 11～22） */
  flightTick: number;
  /** 放的位置：地面上的 [x, y]，火箭从 z = 地面 + 0.15 起（右键方块顶面往外 0.15） */
  位: readonly [number, number];
  ballSize: '小球' | '大球';
  fireworkColors: readonly FireworkDye[];
  trail?: boolean;
  twinkle?: boolean;
  seed: number;
};

const tickLenSec = 1 / 20;
const ground = 0;
const startHeight = 0.15;
const sparkGravity = 0.04 * 0.1;
const sparkFriction = 0.91;

/** 炸开在歌上的秒 */
export const burstSec = (firework: Firework) => firework.launchSec + firework.flightTick * tickLenSec;

// 确定性随机数（mulberry32）：每帧从头重算，同一发每次都是同一个样子
const rng = (seed: number) => {
  let s = seed >>> 0;
  const r = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gaussian = () => {
    const u = Math.max(1e-12, r());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  };
  return { r, gaussian, randBelow: (n: number) => Math.floor(r() * n) };
};

type V3 = [number, number, number];
/** 火箭每刻末的位置（第 0 项是放出的位置），共 飞刻 + 1 项；和每刻移动后的竖速 */
export const rocketPath = (firework: Firework): { 位: V3[]; vertSpeed: number[] } => {
  const g = rng(firework.seed * 977 + 1);
  // triangle(0, 0.002297) = 0.002297 × (rand − rand)
  let vx = 0.002297 * (g.r() - g.r());
  let vy = 0.002297 * (g.r() - g.r());
  let vz = 0.05;
  const positions: V3[] = [[firework.位[0], firework.位[1], ground + startHeight]];
  const vertSpeed = [vz];
  for (let k = 1; k <= firework.flightTick; k++) {
    vx *= 1.15;
    vy *= 1.15;
    vz += 0.04;
    const p = positions[k - 1]!;
    positions.push([p[0] + vx, p[1] + vy, p[2] + vz]);
    vertSpeed.push(vz);
  }
  return { 位: positions, vertSpeed };
};

/** 炸点：最后一刻火箭的位置 */
export const burstPoint = (firework: Firework): V3 => rocketPath(firework).位[firework.flightTick]!;

/** 火箭本体（画成朝镜头的物品贴图，原版 GROUND 显示：0.5 格见方、中心比实体位置高 0.125 格）；没放或已经炸了给 null */
export const rocketPos = (firework: Firework, sec: number): V3 | null => {
  const τ = (sec - firework.launchSec) / tickLenSec;
  if (τ < 0 || τ >= firework.flightTick) return null;
  const { 位: positions } = rocketPath(firework);
  const k = Math.floor(τ);
  return lerpV(positions[k]!, positions[Math.min(k + 1, firework.flightTick)]!, τ - k);
};

export type Spark = {
  /** 方片中心（场景坐标） */
  p: V3;
  /** 半边长（格，原版 quadSize） */
  halfSize: number;
  /** 贴图：spark_0～spark_7 的 n（年轻的是 7、最大） */
  贴图: number;
  /** 颜色（sRGB 0～1） */
  色: V3;
  alpha: number;
};

type Particle = {
  /** 生出来的刻（相对炸开或放出，整数，这一刻末生出、下一刻起动） */
  spawnTick: number;
  位: V3;
  速: V3;
  寿命: number;
  halfSize: number;
  /** 生出来时的 age（拖尾那颗是 寿命/2） */
  startAge: number;
  色: V3;
  trail: boolean;
  twinkle: boolean;
};

const splitColorInt = (c: number): V3 => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];

/** 一颗火花按原版走 n 刻（n ≥ 0），返回每刻末的位置；拖尾的话顺手记下这一路放出的火花 */
const trace = (q: Particle, n: number, trails?: Particle[], g?: ReturnType<typeof rng>): V3[] => {
  const positions: V3[] = [q.位];
  let [x, y, z] = q.位;
  let [vx, vy, vz] = q.速;
  let landed = false;
  for (let i = 1; i <= n; i++) {
    const age = q.startAge + i;
    vz -= sparkGravity;
    x += vx;
    y += vy;
    z += vz;
    if (z < ground) {
      z = ground;
      vz = 0;
      landed = true;
    }
    vx *= sparkFriction;
    vy *= sparkFriction;
    vz *= sparkFriction;
    if (landed) {
      vx *= 0.7;
      vy *= 0.7;
    }
    positions.push([x, y, z]);
    if (trails && g && q.trail && age < Math.floor(q.寿命 / 2) && (age + q.寿命) % 2 === 0) {
      // 新的一颗：自己的随机大小、寿命，age 直接设成 寿命/2，颜色照抄
      const halfSize = 0.1 * (g.r() * 0.5 + 0.5) * 2 * 0.75;
      const lifetime = 48 + g.randBelow(12);
      trails.push({ spawnTick: q.spawnTick + i, 位: [x, y, z], 速: [0, 0, 0], 寿命: lifetime, halfSize, startAge: Math.floor(lifetime / 2), 色: q.色, trail: false, twinkle: q.twinkle });
    }
  }
  return positions;
};

const newSpark = (g: ReturnType<typeof rng>, spawnTick: number, pos: V3, speedVec: V3, color: V3, trail: boolean, twinkle: boolean): Particle => {
  // Particle 构造：quadSize = 0.1 × (rand·0.5 + 0.5) × 2，SparkParticle 再 ×0.75；寿命 48 + rand(12)
  const halfSize = 0.1 * (g.r() * 0.5 + 0.5) * 2 * 0.75;
  return { spawnTick, 位: pos, 速: speedVec, 寿命: 48 + g.randBelow(12), halfSize, startAge: 0, 色: color, trail, twinkle };
};

/** 这一颗在 τ 刻（相对它那一串的 0 刻，带小数）的样子；不在就 null */
const drawSpark = (q: Particle, τ: number, positions: V3[]): Spark | null => {
  const ageTick = τ - q.spawnTick;
  if (ageTick < 0) return null;
  const walked = Math.floor(ageTick);
  const age = q.startAge + walked;
  if (age >= q.寿命) return null;
  const pt = ageTick - walked;
  const p = lerpV(positions[walked]!, positions[Math.min(walked + 1, positions.length - 1)]!, pt);
  if (q.twinkle && !(age < Math.floor(q.寿命 / 3) || Math.floor((age + q.寿命) / 3) % 2 === 0)) return null;
  const halfLife = Math.floor(q.寿命 / 2);
  const alpha = age > halfLife ? 1 - (age - halfLife) / q.寿命 : 0.99;
  // 拖尾那颗刚放出来、还没走第一刻时，贴图停在构造时的第一张（spark_7）
  const spriteIndex = q.startAge > 0 && walked === 0 ? 7 : 7 - Math.floor((age * 7) / q.寿命);
  return { p, halfSize: q.halfSize, 贴图: spriteIndex, 色: q.色, alpha };
};

/** 球：立方体外壳上的点（原版 createParticleBall 的走法和随机数顺序） */
const ballSparks = (firework: Firework, g: ReturnType<typeof rng>, burstCenter: V3): Particle[] => {
  const [speed, halfSizeCells] = firework.ballSize === '大球' ? [0.5, 4] : [0.25, 2];
  const fireworkColors = firework.fireworkColors.map((c) => splitColorInt(fireworkDyeColors[c]));
  const r: Particle[] = [];
  for (let i = -halfSizeCells; i <= halfSizeCells; i++)
    for (let j = -halfSizeCells; j <= halfSizeCells; j++)
      for (let k = -halfSizeCells; k <= halfSizeCells; k++) {
        const dx = j + (g.r() - g.r()) * 0.5;
        const dy = i + (g.r() - g.r()) * 0.5;
        const dz = k + (g.r() - g.r()) * 0.5;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) / speed + g.gaussian() * 0.05;
        const color = fireworkColors[g.randBelow(fireworkColors.length)]!;
        // 原版 y 朝上、z 朝南：换成场景的 (x, −z, y)
        r.push(newSpark(g, 0, burstCenter, [dx / d, -dz / d, dy / d], color, !!firework.trail, !!firework.twinkle));
        if (i !== -halfSizeCells && i !== halfSizeCells && j !== -halfSizeCells && j !== halfSizeCells) k += halfSizeCells * 2 - 1;
      }
  return r;
};

/** 这一发在歌上 秒 这一刻的所有火花（火箭一路拖的白火花、炸开的球、球的拖尾） */
export const fireworkSparks = (firework: Firework, sec: number): Spark[] => {
  const τ = (sec - firework.launchSec) / tickLenSec;
  if (τ < 0) return [];
  const g = rng(firework.seed * 7919 + 3);
  const out: Spark[] = [];
  const white: V3 = [1, 1, 1];
  // 火箭拖的白火花：第 k 刻移动后放出（k = 1…飞刻），速度 (高斯·0.05, −竖速·0.5, 高斯·0.05)
  const { 位: positions, vertSpeed } = rocketPath(firework);
  for (let k = 1; k <= firework.flightTick; k++) {
    const q = newSpark(g, k, positions[k]!, [g.gaussian() * 0.05, -g.gaussian() * 0.05, -vertSpeed[k]! * 0.5], white, false, false);
    if (τ < k) continue;
    const walked = Math.min(Math.floor(τ - k) + 1, q.寿命);
    const spark = drawSpark(q, τ, trace(q, walked));
    if (spark) out.push(spark);
  }
  if (τ < firework.flightTick) return out;
  const burstCenter = positions[firework.flightTick]!;
  const sphereSparks = ballSparks(firework, g, burstCenter).map((q) => ({ ...q, spawnTick: firework.flightTick }));
  for (const [i, q] of sphereSparks.entries()) {
    const walked = Math.min(Math.floor(τ - q.spawnTick) + 1, q.寿命);
    const trails: Particle[] = [];
    const positions = trace(q, walked, trails, rng(firework.seed * 31 + i * 7919 + 17));
    const spark = drawSpark(q, τ, positions);
    if (spark) out.push(spark);
    for (const t of trails) {
      if (τ < t.spawnTick) continue;
      const n = Math.min(Math.floor(τ - t.spawnTick) + 1, t.寿命 - t.startAge);
      const tailSpark = drawSpark(t, τ, trace(t, n));
      if (tailSpark) out.push(tailSpark);
    }
  }
  return out;
};

/** 原版 FLASH：炸开时在炸点放一片朝镜头的大光片，寿命 4 刻；这里只给时刻和颜色，画法由镜头定（不画平滑光晕） */
export const fireworkFlash = (firework: Firework, sec: number): { 心: V3; 刻: number; 色: V3 } | null => {
  const tick = (sec - burstSec(firework)) / tickLenSec;
  if (tick < 0 || tick >= 4) return null;
  return { 心: burstPoint(firework), 刻: tick, 色: splitColorInt(fireworkDyeColors[firework.fireworkColors[0]!]) };
};

/** 炸开时球的半径（格）：火花初速 speed 每刻 ×0.91，k 刻后走了 speed·(1 − 0.91^k)/0.09（不算重力） */
export const sphereRadius = (ballSize: Firework['ballSize'], tick: number) => ((ballSize === '大球' ? 0.5 : 0.25) * (1 - sparkFriction ** tick)) / (1 - sparkFriction);

/** 声音：放出（launch）、炸开（blast / large_blast，大球用 large）、闪烁的炸完 1 + 15 刻后噼啪（twinkle） */
export const fireworkSounds = (firework: Firework): { kind: '发射' | '炸' | '大炸' | '噼啪'; sec: number }[] => {
  const blastSec = burstSec(firework);
  return [
    { kind: '发射', sec: firework.launchSec },
    { kind: firework.ballSize === '大球' ? '大炸' : '炸', sec: blastSec },
    ...(firework.twinkle ? [{ kind: '噼啪' as const, sec: blastSec + 17 * tickLenSec }] : []),
  ];
};
