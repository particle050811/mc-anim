// 第 1、2 幕走位用的两样小工具：过关键点的速度连续曲线（人在空中飞、在地上跑的平面轨迹），和抛物线跳。纯计算。
// 用户 11-10 嫌人物「就像暂停了」、要「动作也要非常流畅」：位置不能一段一段直线插值（每个关键点速度断一下就是一顿），
// 这里过每个点速度连续，人在点上不停，要停的点写速度 0。
import { hermite } from '@engine/core/数学.ts';

/** 一个关键点：几秒、在哪（几维都行）、这一刻的速度（每秒；不写 = 照前后两段的平均速度取，首尾不写 = 停） */
export type TrackPoint = readonly [sec: number, 位: readonly number[], 速?: readonly number[]];

/**
 * 过关键点的曲线（三次埃尔米特，切线照不等间隔的 Catmull-Rom：前后两段平均速度按段长加权，同 engine/core/机位.ts 的 机位样条）。
 * 两头之外停在端点。返回 在(秒)。
 */
export const pointTrack = (waypoints: readonly TrackPoint[]) => {
  const n = waypoints.length;
  if (!n) throw new Error('过点轨至少要一个点');
  for (let i = 1; i < n; i++) if (!(waypoints[i]![0] > waypoints[i - 1]![0])) throw new Error(`过点轨的时刻要递增：第 ${i} 个点 ${waypoints[i]![0]} 秒`);
  const dimCount = waypoints[0]![1].length;
  const speeds = waypoints.map(([t, p, v], k): readonly number[] => {
    if (v) return v;
    const prev = waypoints[k - 1];
    const nextPoint = waypoints[k + 1];
    if (!prev || !nextPoint) return p.map(() => 0);
    const [ha, hb] = [t - prev[0], nextPoint[0] - t];
    return p.map((x, j) => (((x - prev[1][j]!) / ha) * hb + ((nextPoint[1][j]! - x) / hb) * ha) / (ha + hb));
  });
  return (t: number): number[] => {
    if (n === 1 || t <= waypoints[0]![0]) return [...waypoints[0]![1]];
    if (t >= waypoints[n - 1]![0]) return [...waypoints[n - 1]![1]];
    let i = 0;
    while (i + 2 < n && t >= waypoints[i + 1]![0]) i++;
    const [t0, p0] = waypoints[i]!;
    const [t1, p1] = waypoints[i + 1]!;
    const h = t1 - t0;
    const s = (t - t0) / h;
    return Array.from({ length: dimCount }, (_, j) => hermite(p0[j]!, speeds[i]![j]! * h, p1[j]!, speeds[i + 1]![j]! * h, s));
  };
};
