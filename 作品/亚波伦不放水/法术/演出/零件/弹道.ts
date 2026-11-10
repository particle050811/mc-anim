// 弹道（纯数学，场景坐标 Z 朝上，速度 格/刻）：照原版各类弹射物的 tick() 一刻一刻走，再在两刻之间插值（游戏画的是上一刻和这一刻之间）。
// 出处：原版 1.20.1 AbstractHurtingProjectile.tick、ThrowableProjectile.tick、AbstractArrow.tick。
import type { 点 } from '../接口.ts';

export const 加 = (a: 点, b: 点): 点 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const 减 = (a: 点, b: 点): 点 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const 乘 = (a: 点, k: number): 点 => [a[0] * k, a[1] * k, a[2] * k];
export const 长 = (a: 点) => Math.hypot(a[0], a[1], a[2]);
export const 单位 = (a: 点): 点 => {
  const l = 长(a);
  return l > 0 ? 乘(a, 1 / l) : [0, 0, 0];
};
export const 混 = (a: 点, b: 点, t: number): 点 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** 一条弹道：第 n 刻末的位置（n 是整数，0 = 出生位置） */
export type 弹道 = (n: number) => 点;

/** 带小数的刻 → 位置：在 floor(刻) 和它下一刻之间线性插值（同游戏的 partialTicks）；刻 < 0 取出生位置 */
export const 弹道位置 = (道: 弹道, 刻: number): 点 => {
  if (刻 <= 0) return 道(0);
  const n = Math.floor(刻);
  return 混(道(n), 道(n + 1), 刻 - n);
};

/** 这一刻的飞行方向（单位向量），给模型朝向用 */
export const 弹道方向 = (道: 弹道, 刻: number): 点 => {
  const n = Math.max(0, Math.floor(刻));
  return 单位(减(道(n + 1), 道(n)));
};

const 记 = (步: (上: { 位: 点; 速: 点 }) => { 位: 点; 速: 点 }, 起: { 位: 点; 速: 点 }): 弹道 => {
  const 表 = [起];
  return (n) => {
    const m = Math.max(0, Math.floor(n));
    while (表.length <= m) 表.push(步(表[表.length - 1]!));
    return 表[m]!.位;
  };
};

/** 匀速直线：每刻走 速 */
export const 直线 = (起: 点, 速: 点): 弹道 => (n) => 加(起, 乘(速, Math.max(0, n)));

/**
 * 原版火球一类（AbstractHurtingProjectile）：出生时速度 0，每刻 位 += 速；速 = (速 + 加速) × 惯性。
 * 加速 = 朝向单位向量 × 0.1（构造函数里归一后乘 0.1）；惯性原版 0.95，Goety 的 SpellHurtingProjectile 是 0.82（稳态 0.456 格/刻）。
 */
export const 火球道 = (起: 点, 朝: 点, 选: { 惯性?: number; 加速?: number } = {}): 弹道 => {
  const 惯性 = 选.惯性 ?? 0.95;
  const 推 = 乘(单位(朝), 选.加速 ?? 0.1);
  return 记(({ 位, 速 }) => ({ 位: 加(位, 速), 速: 乘(加(速, 推), 惯性) }), { 位: 起, 速: [0, 0, 0] });
};

/**
 * 抛物线（ThrowableProjectile、AbstractArrow）：每刻 位 += 速；速 ×= 阻力；速.z −= 重力。
 * 投掷物 阻力 0.99、重力 0.03；箭 阻力 0.99、重力 0.05；初速 = 方向 × shoot 的 velocity。
 */
export const 抛物线 = (起: 点, 初速: 点, 选: { 阻力?: number; 重力?: number } = {}): 弹道 => {
  const 阻力 = 选.阻力 ?? 0.99;
  const 重力 = 选.重力 ?? 0.03;
  return 记(({ 位, 速 }) => {
    const 新位 = 加(位, 速);
    const v = 乘(速, 阻力);
    return { 位: 新位, 速: [v[0], v[1], v[2] - 重力] };
  }, { 位: 起, 速: 初速 });
};

/** 让抛物线落在目标上的初速：给定飞几刻，反解（阻力、重力同 抛物线） */
export const 抛到 = (起: 点, 目标: 点, 飞刻: number, 选: { 阻力?: number; 重力?: number } = {}): 点 => {
  const 阻力 = 选.阻力 ?? 0.99;
  const 重力 = 选.重力 ?? 0.03;
  // 位(n) = 起 + 速0 × S(n) − 重力 × G(n)，S(n) = Σ 阻力^i，G(n) = Σ_{k<n} Σ_{i<k} 阻力^i
  let S = 0;
  let G = 0;
  let 幂 = 1;
  for (let k = 0; k < 飞刻; k++) {
    G += S;
    S += 幂;
    幂 *= 阻力;
  }
  return [(目标[0] - 起[0]) / S, (目标[1] - 起[1]) / S, (目标[2] - 起[2] + 重力 * G) / S];
};

/**
 * 追踪：每刻把速度方向往「指向目标」转一点，速率不变。转向 0～1：新方向 = normalize(旧方向 × (1 − 转向) + 指向 × 转向)。
 * 游戏里各追踪弹的写法不一样（潜影贝导弹、Goety 的 homing），用的时候照那个类的常数给。
 */
export const 追踪 = (起: 点, 初速: 点, 目标: 点, 转向: number): 弹道 => {
  const 速率 = 长(初速);
  return 记(({ 位, 速 }) => {
    const 新位 = 加(位, 速);
    const 指 = 单位(减(目标, 新位));
    const 向 = 单位(加(乘(单位(速), 1 - 转向), 乘(指, 转向)));
    return { 位: 新位, 速: 乘(向, 速率) };
  }, { 位: 起, 速: 初速 });
};

/** 第一次进到离目标 半径 以内（或穿过去了）的刻，带小数；上限刻内没到返回 null */
export const 命中刻 = (道: 弹道, 目标: 点, 半径: number, 上限刻 = 400): number | null => {
  for (let n = 0; n < 上限刻; n++) {
    const a = 道(n);
    const b = 道(n + 1);
    const ab = 减(b, a);
    const l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
    if (l2 === 0) continue;
    const ao = 减(目标, a);
    const t = Math.min(1, Math.max(0, (ao[0] * ab[0] + ao[1] * ab[1] + ao[2] * ab[2]) / l2));
    if (长(减(混(a, b, t), 目标)) <= 半径) {
      // 线段上离目标正好 半径 的入点
      const 垂 = 长(减(混(a, b, (ao[0] * ab[0] + ao[1] * ab[1] + ao[2] * ab[2]) / l2), 目标));
      const 退 = Math.sqrt(Math.max(0, 半径 ** 2 - 垂 ** 2)) / Math.sqrt(l2);
      return n + Math.max(0, (ao[0] * ab[0] + ao[1] * ab[1] + ao[2] * ab[2]) / l2 - 退);
    }
  }
  return null;
};

/** 方向 → 游戏的 yaw、pitch（度）。场景 → MC：x 东同向，MC 的 z（南）= −y，MC 的 y = z。照 Entity 的约定：yaw 0 朝南（+z），pitch 正 = 朝下 */
export const 朝向角 = (向: 点): { yaw: number; pitch: number } => {
  const [dx, dy, dz] = [向[0], 向[2], -向[1]];
  return { yaw: (Math.atan2(-dx, dz) * 180) / Math.PI, pitch: (-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI };
};
