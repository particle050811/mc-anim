// 手臂逆解：调姿势里的几个角度，让手上某一点落到目标点，给编排算「手够到书」这类接触用（7-4-3 翻书、拿书、递书）。
// 阻尼最小二乘、有限差分；从给定的初值出发，每个量偏离初值都有代价（往初值拉回），同样的输入结果确定——Remotion 各帧分开算，不能靠上一帧接着解
// （试过接着上一帧解：卡在「胳膊贴着书边」那种折点上，目标走了手不跟）。
import * as THREE from 'three';
import type { V3 } from '../../engine/model/parts.tsx';
import { handMatrix, type FigurePose } from './骨架.tsx';

// point(x)：参数 x 时那一点在哪；weights[i]：第 i 个量偏离初值 1 个单位，代价相当于差多少格；bounds[i]：第 i 个量的范围（出了范围每单位罚 0.05 格）；
// penalty(x)：额外的残差（格），给「胳膊不许穿进桌子」这类：穿进去多深就罚多少，比够不着目标更不能接受
export const solveReach = (
  point: (x: number[]) => V3,
  x0: number[],
  target: V3,
  weights: number[],
  bounds?: ([number, number] | undefined)[],
  penalty?: (x: number[]) => number[],
  iterations = 60,
): number[] => {
  const x = [...x0];
  const outside = (v: number, b?: [number, number]) => (b ? 0.05 * (Math.max(0, b[0] - v) + Math.max(0, v - b[1])) : 0);
  const residual = (v: number[]) => {
    const p = point(v);
    return [
      p[0] - target[0],
      p[1] - target[1],
      p[2] - target[2],
      ...v.map((vi, i) => weights[i] * (vi - x0[i])),
      ...v.map((vi, i) => outside(vi, bounds?.[i])),
      ...(penalty ? penalty(v) : []),
    ];
  };
  let lambda = 1e-4;
  let r = residual(x);
  let cost = r.reduce((a, b) => a + b * b, 0);
  for (let it = 0; it < iterations; it++) {
    const step = 0.01;
    const J = x.map((_, j) => {
      const xh = [...x];
      xh[j] += step;
      return residual(xh).map((v, k) => (v - r[k]) / step);
    });
    // 正规方程 (JᵀJ + λ·diag) dx = −Jᵀr
    const n = x.length;
    const JTJ = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => J[a].reduce((s, v, k) => s + v * J[b][k], 0)));
    const JTr = Array.from({ length: n }, (_, a) => J[a].reduce((s, v, k) => s + v * r[k], 0));
    const dx = solveLinear(JTJ.map((row, a) => row.map((v, b) => v + (a === b ? lambda * (v + 1e-9) : 0))), JTr.map((v) => -v));
    const xn = x.map((v, i) => v + dx[i]);
    const rn = residual(xn);
    const costN = rn.reduce((a, b) => a + b * b, 0);
    if (costN < cost) {
      x.splice(0, n, ...xn);
      r = rn;
      cost = costN;
      lambda = Math.max(1e-7, lambda / 3);
    } else {
      lambda *= 4;
    }
  }
  return x;
};

// 小方阵高斯消元
const solveLinear = (A: number[][], b: number[]): number[] => {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-14) continue;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j];
    }
  }
  return M.map((row, i) => (Math.abs(row[i]) < 1e-14 ? 0 : row[n] / row[i]));
};

type NumericKey = { [K in keyof FigurePose]-?: FigurePose[K] extends number | undefined ? K : never }[keyof FigurePose];
// 骨架人（骨架.tsx 的 Figure）：调 params 里的那几个量（度，[量, 权重, 范围]），让手插槽里的 slotPoint（像素）落到 target（和 pose.loc 同一坐标系）
export type ReachParam = [NumericKey, number, [number, number]?];
// penalty(pose)：同 `solveReach`，按姿势算
export const reachFigure = (
  pose: FigurePose,
  height: number,
  hand: 'R' | 'L',
  slotPoint: V3,
  target: V3,
  params: ReachParam[],
  penalty?: (p: FigurePose) => number[],
): FigurePose => {
  const withParams = (x: number[]): FigurePose => {
    const p = { ...pose };
    params.forEach(([k], i) => ((p as Record<string, unknown>)[k] = x[i]));
    return p;
  };
  const point = (x: number[]): V3 => {
    const v = new THREE.Vector3(...slotPoint).applyMatrix4(handMatrix(withParams(x), height, hand));
    return [v.x, v.y, v.z];
  };
  const x = solveReach(
    point,
    params.map(([k]) => (pose[k] as number | undefined) ?? 0), target, params.map(([, w]) => w), params.map(([, , b]) => b),
    penalty && ((x) => penalty(withParams(x))),
  );
  return withParams(x);
};
