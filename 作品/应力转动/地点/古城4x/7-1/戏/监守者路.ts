// 7-1 监守者的走位（按走位命令逐步推：60 米/秒、0.3 秒到全速、到点刹住，同 ../../7-3/追逐.ts），护盾的状态。
// 命令：从 t 起，从当时的位置沿 路 跑，跑到头刹住；后一条命令一到就改道（不减速、身子 监守者.ts 里逐刻拧过去）。
import type { V3 } from '@engine/model/parts.tsx';
import { shieldPos } from '@库/特效/护盾术.tsx';
import * as geom from '../几何.ts';
import * as timeline from '../时间线.ts';
import { groundZ, lerp, lerpV, ss } from './公用.ts';
import { huangLeaps, landT, liuLeaps, takeoffT } from './跳.ts';
type WalkOrder = { t: number; path: V3[] };
const walkOrders: WalkOrder[] = [
  { t: timeline.wardenStepT, path: [geom.firstLungeStep] }, // 扑刘心忠（扑空）
  { t: landT(huangLeaps.H1) + 0.25, path: [geom.spots.belowWardenPlatform] }, // 听到黄叛落在黄台上
  { t: landT(huangLeaps.H2) + 0.25, path: [geom.platformNE] }, // 黄叛落到南台顶：边拍恼鬼边绕过去
  { t: timeline.wardenLungeMoundT, path: [geom.moundFoot] }, // 刘心忠喊出声了
  { t: takeoffT(liuLeaps.J2) + 0.25, path: [geom.eastWallFoot] }, // 他在丘顶上蹬地那一下，不等落地就往东追
  { t: landT(liuLeaps.J3) + 0.25, path: [geom.spots.C1] },
  { t: landT(liuLeaps.J4) + 0.25, path: [geom.lungeAtLiuPoint] },
  { t: timeline.lungeSwingT + 0.3, path: [geom.shieldFront] }, // 扑空，接着往刘心忠落地的地方压
  { t: timeline.shieldBreakT + 0.25, path: [geom.belowHorse] }, // 护盾碎了，循着马蹬地的振动追到马起跳的墙脚下（第 3 场接着追）
];
export const shieldSwingTs = timeline.shieldSwingTs;
export const shieldBreakT = () => timeline.shieldBreakT;

export const tickSec = 1 / 20;
export const lastTick = Math.ceil((timeline.sceneEndT0 + 2) * 20);
// 逐步推（每刻 12 步，命令的时刻按步对齐），存每一步；腿的相位照 7-3（每秒 4 × 速度，原版跑步动画最快那一档封顶）
const SUB = 12;
const stepSec = tickSec / SUB;
const legMaxRate = (2 * Math.PI * 4.5) / 0.8662;
type WardenStep = { p: V3; v: number; distWalked: number; legPhase: number; heading: V3 };
const track: WardenStep[] = (() => {
  const out: WardenStep[] = [];
  let pos: V3 = [...geom.wardenStart] as V3;
  let v = 0;
  let distWalked = 0;
  let legPhase = 0;
  let heading: V3 = [0, 0, 0];
  let path: V3[] = [];
  let ci = 0;
  for (let k = 0; k <= lastTick * SUB; k++) {
    const t = k * stepSec;
    while (ci < walkOrders.length && t >= walkOrders[ci].t - 1e-9) path = [...walkOrders[ci++].path];
    const remaining = path.reduce((sum, p, i) => sum + Math.hypot(p[0] - (i ? path[i - 1][0] : pos[0]), p[1] - (i ? path[i - 1][1] : pos[1])), 0);
    v = remaining > 1e-6 ? Math.min(geom.wardenSpeed, v + geom.wardenAccel * stepSec, Math.sqrt(2 * geom.wardenAccel * remaining)) : 0;
    let stepLeft = v * stepSec;
    while (path.length && stepLeft > 0) {
      const waypoint = path[0];
      const dist = Math.hypot(waypoint[0] - pos[0], waypoint[1] - pos[1]);
      if (dist > 1e-6) heading = [(waypoint[0] - pos[0]) / dist, (waypoint[1] - pos[1]) / dist, 0];
      if (dist <= stepLeft) {
        pos = [waypoint[0], waypoint[1], groundZ];
        stepLeft -= dist;
        distWalked += dist;
        path.shift();
      } else {
        pos = [pos[0] + heading[0] * stepLeft, pos[1] + heading[1] * stepLeft, groundZ];
        distWalked += stepLeft;
        stepLeft = 0;
      }
    }
    if (!path.length) v = 0;
    legPhase += Math.min(4 * v, legMaxRate) * stepSec;
    out.push({ p: pos, v, distWalked, legPhase, heading });
  }
  return out;
})();
// 到了命令的终点才算到（刹车最后一步用 √(2a·剩下) 限速，会比解析的 `wardenTravelSec` 早到几毫秒）
for (const [t, at] of [[timeline.firstLungeArriveT, geom.firstLungeStep], [timeline.moundArriveT, geom.moundFoot], [timeline.lungeSwingT + 0.1, geom.lungeAtLiuPoint]] as [number, V3][]) {
  const p = track[Math.round(t / stepSec)].p;
  if (Math.hypot(p[0] - at[0], p[1] - at[1]) > 0.3) throw new Error(`7-1 监守者 ${t.toFixed(2)} 秒没到预定的点`);
}
export const wardenAt = (t: number) => {
  const x = Math.min(lastTick * SUB, Math.max(0, t / stepSec));
  const i = Math.floor(x);
  const a = track[i];
  const b = track[Math.min(track.length - 1, i + 1)];
  const k = x - i;
  return { p: lerpV(a.p, b.p, k), v: lerp(a.v, b.v, k), distWalked: lerp(a.distWalked, b.distWalked, k), legPhase: lerp(a.legPhase, b.legPhase, k), walking: a.v > 0.05 || b.v > 0.05, heading: a.heading };
};
// 跑起来往前扑（度，同 7-3：越快伏得越低，60 米/秒 18°），胸口、头跟着往前移
export const wardenLean = (t: number) => 18 * ss(wardenAt(t).v / geom.wardenSpeed);
export const leanedPoint = (t: number, height: number, entityYaw?: number): V3 => {
  const w = wardenAt(t);
  const lean = (wardenLean(t) * Math.PI) / 180;
  // 前倾方向取跑的方向（站着不倾，方向无所谓）；entityYaw 给了就按身子朝向（模型正面 −Y）
  const fwd = entityYaw === undefined ? [w.heading[0], w.heading[1]] : [-Math.sin(((entityYaw - 180) * Math.PI) / 180), Math.cos(((entityYaw - 180) * Math.PI) / 180)];
  return [w.p[0] + fwd[0] * height * Math.sin(lean), w.p[1] + fwd[1] * height * Math.sin(lean), w.p[2] + height * Math.cos(lean)];
};
export const wardenChestPos = (t: number): V3 => leanedPoint(t, 1.6);

// ======================= 护盾 =======================
// 闪避跳半空里回身甩出（瞬发），在刘心忠眼前 3 格、朝着扑过来的监守者；挨第三拍时碎掉（0.3 秒淡掉）
export const shieldState = (t: number) => {
  if (t < timeline.shieldT) return undefined;
  const spot = geom.spots.shieldPoint;
  const eye: V3 = [spot[0], spot[1], spot[2] + 1.62];
  const dir: V3 = [1, 0, 0];
  const breakT = timeline.shieldBreakT;
  if (t > breakT + 0.3) return undefined;
  return { at: shieldPos(eye, dir), dir, 秒: t - timeline.shieldT, opacity: t < breakT ? 1 : 1 - (t - breakT) / 0.3 };
};
