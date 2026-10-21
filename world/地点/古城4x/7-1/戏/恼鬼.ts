// 7-1 恼鬼：照原版逐刻推飞行，监守者拍哪只、哪一刻也在这里推出来（`swingTs`、`vexDeathTs`）。
import type { V3 } from '../../../../../engine/model/parts.tsx';
import { rng } from '../../../../../engine/model/parts.tsx';
import { yawTo } from '../../6-4-1/古城戏.ts';
import * as geom from '../几何.ts';
import * as timeline from '../时间线.ts';
import { groundZ, lerpV } from './公用.ts';
import { lastTick, leanedPoint, tickSec, wardenAt, wardenChestPos } from './监守者路.ts';
import { liuXinzhongPos } from './位置.ts';
export const vexCount = 5;
const vr = rng(7101);
// 出生：刘心忠眼睛 + (±2, +1, ±2)（铁魔法 SummonVexSpell）
const vexSpawnOffsets: V3[] = Array.from({ length: vexCount }, () => [(vr() * 2 - 1) * 2, (vr() * 2 - 1) * 2, vr()]);
// 散开的方向（场景角度，0 = 东，逆时针）、半径、离地，和冲出去的先后：挑成监守者每次冷却一好（0.9 秒）就正好有一只冲到胸口（用户 10-18 嫌缠斗像回合制，拍击不留空档），
// 第一拍在 时间线.ts 的 `firstVexSwingT`。改了二人的跳或监守者的走位，拍t 会跟着变，要重挑（工具/追兵/7-1恼鬼挑参.ts）
export type VexSpread = { 角: number; 半径: number; 高: number };
export const vexSpread: VexSpread[] = [
  { 角: 351, 半径: 7.0, 高: 4.1 },
  { 角: 163, 半径: 3.8, 高: 5.6 },
  { 角: 302, 半径: 3.9, 高: 3.2 },
  { 角: 150, 半径: 6.3, 高: 5.9 },
  { 角: 275, 半径: 6.8, 高: 4.0 },
];
export const chargeDelays = [0, 1.34, 1.13, 0.36, 1.49];
type VexTick = { p: V3; v: V3; charge: boolean };
const wardenHeadPos = (t: number): V3 => leanedPoint(t, 2.6);
// 整场逐刻推一遍：返回每只每刻的位置、拍的时刻（攻击动画起点）、死的时刻
export const simulateVexes = (spread: VexSpread[], delays: number[], untilTick = lastTick) => {
  const tracks: VexTick[][] = [];
  const swings: number[] = [];
  const deaths: number[] = Array(vexCount).fill(Infinity);
  const k0 = Math.ceil(timeline.vexSpawnT * 20);
  const liuEye = (() => {
    const feet = liuXinzhongPos(timeline.vexSpawnT);
    return [feet[0], feet[1], feet[2] + 1.62] as V3;
  })();
  const st = Array.from({ length: vexCount }, (_, i) => ({
    p: [liuEye[0] + vexSpawnOffsets[i][0], liuEye[1] + vexSpawnOffsets[i][1], liuEye[2] + 1 + vexSpawnOffsets[i][2]] as V3,
    v: [0, 0, 0] as V3,
    phase: 0, // 0 散开、1 俯冲、2 冲过头
    target: [0, 0, 0] as V3,
    dead: false,
  }));
  let cooldownUntil = 0;
  for (let i = 0; i < vexCount; i++) tracks.push([]);
  for (let k = 0; k <= untilTick; k++) {
    const t = k * tickSec;
    for (let i = 0; i < vexCount; i++) {
      const vex = st[i];
      if (k < k0) {
        tracks[i].push({ p: vex.p, v: [0, 0, 0], charge: false });
        continue;
      }
      if (!vex.dead) {
        const charging = t >= timeline.vexChargeT + delays[i];
        let target: V3;
        if (!charging) target = vex.p;
        else if (vex.phase === 0) {
          const wardenPos = wardenAt(t).p;
          const angle = (spread[i].角 * Math.PI) / 180;
          target = [wardenPos[0] + spread[i].半径 * Math.cos(angle), wardenPos[1] + spread[i].半径 * Math.sin(angle), groundZ + spread[i].高];
          if (Math.hypot(target[0] - vex.p[0], target[1] - vex.p[1], target[2] - vex.p[2]) < 2.5) vex.phase = 1;
        } else if (vex.phase === 1) {
          target = wardenHeadPos(t);
          const dist = Math.hypot(target[0] - vex.p[0], target[1] - vex.p[1], target[2] - vex.p[2]);
          const closing = (target[0] - vex.p[0]) * vex.v[0] + (target[1] - vex.p[1]) * vex.v[1] + (target[2] - vex.p[2]) * vex.v[2];
          if (dist < 0.9 || (dist < 3.5 && closing < 0)) {
            // 冲过头：沿当下的速度方向再冲 9 格、往上抬一点
            const speedLen = Math.hypot(...vex.v) || 1;
            vex.target = [vex.p[0] + (vex.v[0] / speedLen) * 9, vex.p[1] + (vex.v[1] / speedLen) * 9, Math.max(groundZ + 1.5, vex.p[2] + (vex.v[2] / speedLen) * 9 + 1.5)];
            vex.phase = 2;
          }
        } else {
          target = vex.target;
          if (Math.hypot(target[0] - vex.p[0], target[1] - vex.p[1], target[2] - vex.p[2]) < 2) vex.phase = 1;
        }
        const dx = target[0] - vex.p[0];
        const dy = target[1] - vex.p[1];
        const dz = target[2] - vex.p[2];
        const dist = Math.hypot(dx, dy, dz);
        if (charging && dist > 0.4) vex.v = [vex.v[0] + (dx / dist) * 0.05, vex.v[1] + (dy / dist) * 0.05, vex.v[2] + (dz / dist) * 0.05];
        else vex.v = [vex.v[0] * 0.5, vex.v[1] * 0.5, vex.v[2] * 0.5];
        vex.v = [vex.v[0] * 0.91, vex.v[1] * 0.91, vex.v[2] * 0.91];
        vex.p = [vex.p[0] + vex.v[0], vex.p[1] + vex.v[1], vex.p[2] + vex.v[2]];
      } else {
        // 死了：照原版挨的击退往外甩，每刻 ×0.91 慢下来
        vex.v = [vex.v[0] * 0.91, vex.v[1] * 0.91, vex.v[2] * 0.91];
        vex.p = [vex.p[0] + vex.v[0], vex.p[1] + vex.v[1], Math.max(groundZ + 0.1, vex.p[2] + vex.v[2])];
      }
      tracks[i].push({ p: vex.p, v: vex.v, charge: !vex.dead && t >= timeline.vexChargeT + delays[i] });
    }
    // 监守者拍：冷却好了、有冲过来的恼鬼在胸口 2.8 格内（只拍已经俯冲过一次以后的，散开路上不算）
    if (k >= cooldownUntil) {
      const chest = wardenChestPos(t);
      let picked = -1;
      let nearestDist = 2.8;
      for (let i = 0; i < vexCount; i++) {
        const vex = st[i];
        if (vex.dead || vex.phase === 0) continue;
        const dist = Math.hypot(vex.p[0] - chest[0], vex.p[1] - chest[1], vex.p[2] - chest[2]);
        if (dist < nearestDist) {
          nearestDist = dist;
          picked = i;
        }
      }
      if (picked >= 0) {
        const vex = st[picked];
        vex.dead = true;
        deaths[picked] = t;
        swings.push(t - 0.1);
        cooldownUntil = k + Math.round(geom.attackCooldownSec * 20);
        const awayDir = [vex.p[0] - chest[0], vex.p[1] - chest[1]];
        const awayLen = Math.hypot(awayDir[0], awayDir[1]) || 1;
        vex.v = [vex.v[0] / 2 + (awayDir[0] / awayLen) * 0.75, vex.v[1] / 2 + (awayDir[1] / awayLen) * 0.75, vex.v[2] / 2 + 0.15];
      }
    }
  }
  return { tracks, swings, deaths };
};
const sim = simulateVexes(vexSpread, chargeDelays);
const vexTracks = sim.tracks;
export const swingTs: number[] = sim.swings; // 拍恼鬼的攻击动画起点（场时刻）
export const vexDeathTs: number[] = sim.deaths;
// 7-1-3 的编排按这几拍切镜，开头查一下
export const checkVexSwings = () => {
  if (swingTs.length !== vexCount || Math.abs(swingTs[0] - timeline.firstVexSwingT) > 0.026 || swingTs[vexCount - 1] > timeline.impossibleT - 0.3)
    throw new Error(`7-1 恼鬼：拍的时刻 ${swingTs.map((x) => x.toFixed(2)).join(' ')} 和时间线对不上，要重挑散开参数`);
};
export const vexTrackAt = (i: number, t: number) => {
  const x = Math.min(lastTick, Math.max(0, t * 20));
  const j = Math.floor(x);
  const prevTick = vexTracks[i][j];
  const nextTick = vexTracks[i][Math.min(lastTick, j + 1)];
  return { p: lerpV(prevTick.p, nextTick.p, x - j), v: prevTick.v, charge: prevTick.charge };
};
export const vexState = (i: number, t: number) => {
  const track = vexTrackAt(i, t);
  const deathT = vexDeathTs[i];
  const wardenPos = wardenAt(t).p;
  const sp = Math.hypot(track.v[0], track.v[1]);
  // 飞得快时面朝飞的方向，慢下来时面朝监守者
  const yaw = sp > 0.08 && t < deathT ? yawTo(track.v[0], track.v[1]) : yawTo(wardenPos[0] - track.p[0], wardenPos[1] - track.p[1]);
  return {
    visible: t >= timeline.vexSpawnT && t < deathT + 1,
    p: track.p,
    entityYaw: yaw + 180,
    冲锋: track.charge && t < deathT,
    secSinceDeath: t >= deathT ? t - deathT : undefined,
    死t: deathT,
  };
};
