// 地形跟随：给一条水平航线（若干 [x, y] 航点）和地面高度，算出离地 净空 格的飞行高度——前方有山提前爬升越过去，过了山再慢慢降回来。
// 用户 2026-10-02（6-2-5、6-2-6）要 500 米高度、遇到山再抬高，不贴地不贴水（默认参数照这个）；6-2-5 后改成与暮色差不多的巡航高度（净空 80，见 6-2-5/编排.ts）。
//
// 做法：
// 1. 水平航线用向心 Catmull-Rom 连起来（lib/飞行路径.ts 的 航线，z 全是 0），按水平弧长每 步长 格取一个点；
// 2. 每个点取左右 侧宽 格内最高的地面（含树冠），要求高度 = 地面 + 净空；再和 下限(s) 取大（俯冲线、进城爬升线这类手写的约束）；
// 3. 包络：往后扫一遍保证"山前提前爬升"（每往前一格最多降 爬坡 格，即从山顶往回看，高度按 爬坡 的坡度往下递减），
//    往前扫一遍保证"过山以后慢慢下降"（按 降坡 递减），两遍取大——高度曲线是一串斜坡，不会撞山，也不会一过山顶就往下扎；
// 4. 高斯平滑几遍（每遍完再和要求高度取大，保证不低于净空），去掉斜坡交界的折角。
// 返回密的三维点（每 步长 一个），交给 航线 再连成光滑曲线。
import { Route } from './飞行路径.ts';
import type { V3 } from '../model/parts.tsx';

export type TerrainFollowParams = {
  clearance: number; // 离地多少格，默认 500
  climbSlope: number; // 山前爬升的最大坡度（高 / 水平），默认 0.35（约 19°）
  descentSlope: number; // 过山以后下降的坡度，默认 0.22（约 12°）
  sideWidth: number; // 航线左右多宽内取最高地面，默认 150
  stepLength: number; // 默认 100
  smooth: number; // 高斯平滑的半宽（格），默认 300
};
const defaults: TerrainFollowParams = { clearance: 500, climbSlope: 0.35, descentSlope: 0.22, sideWidth: 150, stepLength: 100, smooth: 300 };

export type TerrainFollowResult = {
  points: V3[]; // 每 步长 一个的三维点（第一个是水平航线的起点）
  horizArcLen: number[]; // 每个点的水平弧长
  groundTops: number[]; // 每个点（含左右）的最高地面
  高度: (arcLen: number) => number; // 水平弧长 → 飞行高度（线性插值）
  posAt: (arcLen: number) => [number, number]; // 水平弧长 → 水平位置
  length: number; // 水平总长
};

export const terrainFollow = (waypoints: [number, number][], groundHeightAt: (x: number, y: number) => number, minHeightAt: (arcLen: number) => number = () => -Infinity, params: Partial<TerrainFollowParams> = {}): TerrainFollowResult => {
  const opts = { ...defaults, ...params };
  const flat = new Route(waypoints.map(([x, y]) => [x, y, 0] as V3));
  const sampleCount = Math.max(2, Math.ceil(flat.length / opts.stepLength) + 1);
  const ds = flat.length / (sampleCount - 1);
  const xs: number[] = [];
  const ys: number[] = [];
  const groundTops: number[] = [];
  const req: number[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const arcLen = i * ds;
    const pos = flat.at(arcLen);
    const dir = flat.dir(arcLen);
    const nx = -dir[1];
    const ny = dir[0];
    let groundTop = -Infinity;
    for (const sideFrac of [-1, -0.5, 0, 0.5, 1]) groundTop = Math.max(groundTop, groundHeightAt(pos[0] + nx * sideFrac * opts.sideWidth, pos[1] + ny * sideFrac * opts.sideWidth));
    xs.push(pos[0]);
    ys.push(pos[1]);
    groundTops.push(groundTop);
    req.push(Math.max(groundTop + opts.clearance, minHeightAt(arcLen)));
  }
  const envelope = (heights: number[]) => {
    const up = heights.slice();
    for (let i = sampleCount - 2; i >= 0; i--) up[i] = Math.max(up[i], up[i + 1] - opts.climbSlope * ds);
    const down = heights.slice();
    for (let i = 1; i < sampleCount; i++) down[i] = Math.max(down[i], down[i - 1] - opts.descentSlope * ds);
    return up.map((v, i) => Math.max(v, down[i]));
  };
  let z = envelope(req);
  const sigma = opts.smooth / ds;
  const kernelRadius = Math.ceil(sigma * 2.5);
  const kernel = Array.from({ length: 2 * kernelRadius + 1 }, (_, k) => Math.exp(-((k - kernelRadius) ** 2) / (2 * sigma * sigma)));
  for (let it = 0; it < 3; it++) {
    const out = z.map((_, i) => {
      let weightedSum = 0;
      let ws = 0;
      for (let k = -kernelRadius; k <= kernelRadius; k++) {
        const j = Math.min(sampleCount - 1, Math.max(0, i + k));
        weightedSum += z[j] * kernel[k + kernelRadius];
        ws += kernel[k + kernelRadius];
      }
      return weightedSum / ws;
    });
    z = envelope(out.map((v, i) => Math.max(v, req[i])));
  }
  const points: V3[] = xs.map((x, i) => [x, ys[i], z[i]]);
  const horizArcLen = xs.map((_, i) => i * ds);
  const lerpAt = (arr: number[], arcLen: number) => {
    const t = Math.min(Math.max(arcLen / ds, 0), sampleCount - 1);
    const i = Math.min(Math.floor(t), sampleCount - 2);
    return arr[i] + (arr[i + 1] - arr[i]) * (t - i);
  };
  return {
    points: points,
    horizArcLen,
    groundTops: groundTops,
    高度: (s) => lerpAt(z, s),
    posAt: (s) => [lerpAt(xs, s), lerpAt(ys, s)],
    length: flat.length,
  };
};
