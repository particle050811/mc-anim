// 第 1、2 幕走位用的两样小工具：过关键点的速度连续曲线（人在空中飞、在地上跑的平面轨迹），和抛物线跳。纯计算。
// 用户 11-10 嫌人物「就像暂停了」、要「动作也要非常流畅」：位置不能一段一段直线插值（每个关键点速度断一下就是一顿），
// 这里过每个点速度连续，人在点上不停，要停的点写速度 0。
import { hermite } from '@engine/core/数学.ts';

/** 一个关键点：几秒、在哪（几维都行）、这一刻的速度（每秒；不写 = 照前后两段的平均速度取，首尾不写 = 停） */
export type 轨点 = readonly [秒: number, 位: readonly number[], 速?: readonly number[]];

/**
 * 过关键点的曲线（三次埃尔米特，切线照不等间隔的 Catmull-Rom：前后两段平均速度按段长加权，同 engine/core/机位.ts 的 机位样条）。
 * 两头之外停在端点。返回 在(秒)。
 */
export const 过点轨 = (点: readonly 轨点[]) => {
  const n = 点.length;
  if (!n) throw new Error('过点轨至少要一个点');
  for (let i = 1; i < n; i++) if (!(点[i]![0] > 点[i - 1]![0])) throw new Error(`过点轨的时刻要递增：第 ${i} 个点 ${点[i]![0]} 秒`);
  const 维 = 点[0]![1].length;
  const 速 = 点.map(([t, p, v], k): readonly number[] => {
    if (v) return v;
    const 前 = 点[k - 1];
    const 后 = 点[k + 1];
    if (!前 || !后) return p.map(() => 0);
    const [ha, hb] = [t - 前[0], 后[0] - t];
    return p.map((x, j) => (((x - 前[1][j]!) / ha) * hb + ((后[1][j]! - x) / hb) * ha) / (ha + hb));
  });
  return (t: number): number[] => {
    if (n === 1 || t <= 点[0]![0]) return [...点[0]![1]];
    if (t >= 点[n - 1]![0]) return [...点[n - 1]![1]];
    let i = 0;
    while (i + 2 < n && t >= 点[i + 1]![0]) i++;
    const [t0, p0] = 点[i]!;
    const [t1, p1] = 点[i + 1]!;
    const h = t1 - t0;
    const s = (t - t0) / h;
    return Array.from({ length: 维 }, (_, j) => hermite(p0[j]!, 速[i]![j]! * h, p1[j]!, 速[i + 1]![j]! * h, s));
  };
};

/** 跳的重力（格/秒²）：原版玩家每刻 −0.08 再乘 0.98，折合约 32 */
export const 跳重力 = 32;
/** 从 起高 跳到 落高，空中 T 秒，起跳后第 τ 秒的高度（抛物线） */
export const 抛高 = (τ: number, T: number, 起高: number, 落高: number, g = 跳重力) => {
  const v0 = (落高 - 起高 + (g / 2) * T * T) / T;
  return 起高 + v0 * τ - (g / 2) * τ * τ;
};
