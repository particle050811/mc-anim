// 拐角倒圆的折线路线和按弧长取点：娜迦爬的路、九胡在迷宫里跑的路共用。
import { rad } from '@engine/anim/anim.ts';

export type Trail = { pts: [number, number][]; s: number[]; len: number };
export const makeTrail = (corners: [number, number, number][]): Trail => {
  const pts: [number, number][] = [];
  const along = (from: number[], to: number[], dist: number): [number, number] => {
    const segLen = Math.hypot(to[0] - from[0], to[1] - from[1]);
    return [from[0] + ((to[0] - from[0]) * dist) / segLen, from[1] + ((to[1] - from[1]) * dist) / segLen];
  };
  let cur: [number, number] = [corners[0][0], corners[0][1]];
  for (let i = 1; i < corners.length; i++) {
    const radius = corners[i][2];
    const end: [number, number] = i < corners.length - 1 ? along(corners[i], corners[i - 1], radius) : [corners[i][0], corners[i][1]];
    const segLen = Math.hypot(end[0] - cur[0], end[1] - cur[1]);
    for (let dist = 0; dist < segLen; dist += 0.05) pts.push(along(cur, end, dist));
    if (i < corners.length - 1) {
      const out = along(corners[i], corners[i + 1], radius);
      for (let k = 0; k < 40; k++) {
        const t = k / 40;
        const wStart = (1 - t) ** 2;
        const wCtrl = 2 * t * (1 - t);
        const wEnd = t * t;
        pts.push([wStart * end[0] + wCtrl * corners[i][0] + wEnd * out[0], wStart * end[1] + wCtrl * corners[i][1] + wEnd * out[1]]);
      }
      cur = out;
    } else {
      pts.push(end);
    }
  }
  const cumLen = [0];
  for (let i = 1; i < pts.length; i++) cumLen[i] = cumLen[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return { pts, s: cumLen, len: cumLen[cumLen.length - 1] };
};
export const trailOn = (trail: Trail, dist: number): [number, number, number] => {
  const { pts, s: cumLen, len } = trail;
  const count = pts.length;
  const dirAt = (i: number) => (Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]) * 180) / Math.PI;
  if (dist <= 0 || dist >= len) {
    const i = dist <= 0 ? 0 : count - 2;
    const dirRad = rad(dirAt(i));
    const base = dist <= 0 ? pts[0] : pts[count - 1];
    const overshoot = dist <= 0 ? dist : dist - len;
    return [base[0] + Math.cos(dirRad) * overshoot, base[1] + Math.sin(dirRad) * overshoot, dirAt(i)];
  }
  let lo = 0;
  let hi = count - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumLen[mid] <= dist) lo = mid;
    else hi = mid;
  }
  const frac = (dist - cumLen[lo]) / (cumLen[hi] - cumLen[lo] || 1);
  // 方向取前后几个点平均，免得倒圆的折线点让朝向一顿一顿
  const j = Math.min(Math.max(lo, 3), count - 5);
  const dir = (Math.atan2(pts[j + 4][1] - pts[j - 3][1], pts[j + 4][0] - pts[j - 3][0]) * 180) / Math.PI;
  return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * frac, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * frac, dir];
};
