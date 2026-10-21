// 规划航线：逐程求解（带求解缓存）、拼成整条按时间采样的航线，按路程查位置、速度、物理时刻，各处贯穿时刻。
import { makeSolver, type LegSolution, type EndState } from '../航线求解.ts';
import { isInTwilightLandmark, twilightTerrainKey, cruiseClearanceM, canopySurface } from '../../../../../world/地点/暮色新世界.tsx';
import { hash64, solverFingerprint, cachedSolve } from '../../../../../engine/core/求解缓存.ts';
import type { V3 } from '../../../../../engine/model/parts.tsx';
import * as castleChoreo from '../../6-1-9/编排.ts';
import {
  V_CRUISE, 限值, 程转速, alignAheadM, legOverrides, landingCruiseZ, landingDecel, skeletonRadii, sub, len,
  B0, V0, A0, 起飞方位, takeoffPitch, 穿刺表, type Boss名, ORDER, placeName, pitchAt, centerAt, bearingAt,
} from './输入表.ts';

// ====================== 一程 ======================
// 求解代码在 航线求解.ts（单独一个模块，求解缓存按它的源码分层）
const { 解程: solveLegRaw } = makeSolver(限值, skeletonRadii);
// 求解缓存（lib/求解缓存.ts）：每一程一份，键 = 代码层（航线求解.ts 源码指纹）+ 输入表 + 巡航层取法和地形 + 起止端态和参数。改某处穿刺线只重算挨着它的两程。
// `params.层` 是函数不能当键，由 `layerKey` 代替
const solveLeg = (start: EndState, end: EndState, params: Parameters<typeof solveLegRaw>[2], layerKey: unknown) =>
  cachedSolve('一镜到底程', [solverFingerprint('航线求解'), 限值, skeletonRadii, layerKey, start, end, { ...params, 层: null }], () => solveLegRaw(start, end, params));

// 一程的巡航层（用户 10-07：玩家定一个高度平飞，不盯着脚下的树冠一路调）：沿线（地标外）每 50 米取一次树冠面，中位 + 巡航离地
const canopyLayer = (track: (dist: number) => number[], trackLen: number) => {
  const heights: number[] = [];
  for (let dist = 0; dist <= trackLen; dist += 50) {
    const pt = track(dist);
    if (!isInTwilightLandmark(pt[0], pt[1])) heights.push(canopySurface(pt[0], pt[1]));
  }
  if (!heights.length) return -Infinity;
  heights.sort((a, b) => a - b);
  return heights[Math.floor(heights.length / 2)] + cruiseClearanceM;
};

const canopyLayerKey = () => ['树冠层', hash64(canopyLayer.toString()), cruiseClearanceM, twilightTerrainKey()];

// ====================== 拼整条航线 ======================
// 全程按时间采样：每个点 [t, x, y, z, v, ψ, γ, ω]（t 物理秒，ψ 方位，γ 俯仰，ω 航向角速度 度/秒，正 = 右转）
export const samples: number[][] = [];
type Mark = { name: string; i: number };
const MARK: Mark[] = [];
export const 程表: LegSolution[] = [];
export type 弯 = { 程: string; 处: '穿出后' | '进对正前' | '起飞后'; 方向: '左' | '右'; 角: number; 峰率: number; t: number; 时长: number };
export const 弯表: 弯[] = [];
{
  let exitState: EndState = { p: [...B0] as V3, ψ: 起飞方位, γ: takeoffPitch, v: V0, a: A0 };
  let exitName = '起点';
  let t0 = 0;
  const appendLeg = (leg: LegSolution) => {
    程表.push(leg);
    const n0 = samples.length ? 1 : 0;
    for (let i = n0; i < leg.t.length; i++) samples.push([t0 + leg.t[i], leg.x[i], leg.y[i], leg.z[i], leg.v[i], leg.ψ[i], leg.γ[i], leg.ω[i]]);
    for (const turn of leg.弯) {
      const where = turn.起 > 0 ? '进对正前' : leg.名.startsWith('娜迦') ? '起飞后' : '穿出后';
      弯表.push({ 程: leg.名, 处: where, 方向: turn.角 < 0 ? '左' : '右', 角: Math.abs(turn.角), 峰率: turn.峰率, t: t0 + turn.起, 时长: turn.时长 });
    }
    t0 += leg.T;
  };
  for (const bossName of ORDER) {
    const pierce = 穿刺表[bossName];
    const endState: EndState = { p: centerAt(pierce, pierce.前), ψ: bearingAt(pierce, pierce.前 + 1), γ: pitchAt(pierce, pierce.前), v: pierce.V, a: 0 };
    const legName = `${exitName === '起点' ? '娜迦庭院' : placeName(exitName)} → ${placeName(bossName)}`;
    const override = legOverrides[exitName as Boss名] ?? {};
    appendLeg(solveLeg(exitState, endState, { name: legName, cruiseSpeed: override.巡航 ?? V_CRUISE, turnRate: 程转速[exitName as Boss名] ?? 限值.视角转速, finalStraight: alignAheadM[bossName] ?? 0, 层: canopyLayer, maxSlopeDeg: override.maxSlopeDeg }, canopyLayerKey()));
    // 穿刺线：矛尖每 0.5 米一个点（另外在前、撞、贯穿、出、后各放一个），扫帚杆中心按 centerAt；速度恒定 P.V
    const as = new Set<number>([pierce.前, pierce.撞, 0, pierce.出, pierce.后]);
    for (let along = Math.ceil(pierce.前 * 2) / 2; along < pierce.后; along += 0.5) as.add(along);
    const alongs = [...as].sort((x, y) => x - y);
    let prev = centerAt(pierce, alongs[0]);
    alongs.forEach((along, k) => {
      const center = centerAt(pierce, along);
      if (k > 0) t0 += len(sub(center, prev)) / pierce.V;
      prev = center;
      const tag = along === pierce.前 ? '前' : along === pierce.撞 ? '撞' : along === 0 ? '贯穿' : along === pierce.出 ? '出' : along === pierce.后 ? '后' : '';
      if (k === 0) {
        // 和上一程的末点是同一点：替换掉，不重复
        samples.pop();
      }
      if (tag) MARK.push({ name: `${bossName}.${tag}`, i: samples.length });
      samples.push([t0, center[0], center[1], center[2], pierce.V, bearingAt(pierce, along), pitchAt(pierce, along), 0]);
    });
    exitState = { p: centerAt(pierce, pierce.后), ψ: bearingAt(pierce, pierce.后 - 1), γ: pitchAt(pierce, pierce.后), v: pierce.V, a: 0 };
    exitName = bossName;
  }
  // 降落：云中小屋穿出来以后对正降落点正南那条线（最后 提前对正.降落 米直飞），爬到 降落层 过城堡的塔楼，最后斜着朝平台扎下去，到脱手点减到 末速（6-1-9/编排.ts）
  const landPt = castleChoreo.LAND;
  appendLeg(
    solveLeg(exitState, { p: [landPt[0], landPt[1], landPt[2]], ψ: 0, γ: castleChoreo.endPitch, v: castleChoreo.endSpeed, a: 0 }, {
      name: '云中小屋 → 终焉高原城堡',
      cruiseSpeed: exitState.v,
      turnRate: 限值.视角转速,
      finalStraight: alignAheadM.降落 ?? 0,
      层: () => landingCruiseZ,
      landDecelA: landingDecel.A,
      landDecelJ: landingDecel.J,
    }, ['降落层', landingCruiseZ]),
  );
  MARK.push({ name: '降落', i: samples.length - 1 });
}

// ---------- 按路程查 ----------
export const NP = samples.length;
const TAB_T = Float64Array.from(samples, (q) => q[0]);
export const TAB_S = new Float64Array(NP);
for (let i = 1; i < NP; i++) TAB_S[i] = TAB_S[i - 1] + Math.hypot(samples[i][1] - samples[i - 1][1], samples[i][2] - samples[i - 1][2], samples[i][3] - samples[i - 1][3]);
export const 路线长 = TAB_S[NP - 1];
export const bisect = (tab: ArrayLike<number>, value: number) => {
  let lo = 0;
  let hi = tab.length - 1;
  if (value <= tab[0]) return 0;
  if (value >= tab[hi]) return hi - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (tab[mid] <= value) lo = mid;
    else hi = mid;
  }
  return lo;
};
const interp = (tab: ArrayLike<number>, k: number) => (dist: number) => {
  const clamped = Math.min(Math.max(dist, 0), 路线长);
  const i = bisect(TAB_S, clamped);
  const frac = (clamped - TAB_S[i]) / Math.max(1e-12, TAB_S[i + 1] - TAB_S[i]);
  void tab;
  return samples[i][k] + (samples[i + 1][k] - samples[i][k]) * frac;
};
const interpX = interp(TAB_S, 1);
const interpY = interp(TAB_S, 2);
const interpZ = interp(TAB_S, 3);
// 规划航线（不带真实飞行的偏移）上第 s 米处的扫帚杆中心
export const 规划位置 = (s: number): V3 => [interpX(s), interpY(s), interpZ(s)];
// 速度（米/秒）
export const 速度 = interp(TAB_S, 4);
// 航向角速度（度/秒，正 = 右转；内倾、诊断用）
export const 航向角速度 = interp(TAB_S, 7);
export const 标记路程 = (markName: string) => {
  const mark = MARK.find((x) => x.name === markName);
  if (!mark) throw new Error(`没有标记 ${markName}`);
  return TAB_S[mark.i];
};
// 路程 s 处的视角转速上限（度/秒）：程转速 单给的那一程按它，别处 视角转速（诊断、验收用）
export const 视角转速于 = (dist: number) => {
  for (let i = 0; i + 1 < ORDER.length; i++) {
    const rate = 程转速[ORDER[i]];
    if (rate !== undefined && dist >= 标记路程(`${ORDER[i]}.后`) && dist <= 标记路程(`${ORDER[i + 1]}.前`)) return rate;
  }
  return 限值.视角转速;
};

// ---------- 物理时间 T(s) ----------
export const 时刻 = (dist: number) => {
  const clamped = Math.min(Math.max(dist, 0), 路线长);
  const i = bisect(TAB_S, clamped);
  const frac = (clamped - TAB_S[i]) / Math.max(1e-12, TAB_S[i + 1] - TAB_S[i]);
  return TAB_T[i] + (TAB_T[i + 1] - TAB_T[i]) * frac;
};
// 落到平台上的物理时刻
export const T_ARRIVE = TAB_T[NP - 1];
// T → s
export const 路程 = (physT: number) => {
  if (physT <= 0) return 0;
  if (physT >= T_ARRIVE) return 路线长;
  const i = bisect(TAB_T, physT);
  const frac = (physT - TAB_T[i]) / Math.max(1e-12, TAB_T[i + 1] - TAB_T[i]);
  return TAB_S[i] + (TAB_S[i + 1] - TAB_S[i]) * frac;
};
// 各 boss 贯穿那一刻的物理时间（各段 编排.ts 的 t = T − 贯穿时刻）
export const 贯穿时刻 = Object.fromEntries(ORDER.map((n) => [n, 时刻(标记路程(`${n}.贯穿`))])) as Record<Boss名, number>;
