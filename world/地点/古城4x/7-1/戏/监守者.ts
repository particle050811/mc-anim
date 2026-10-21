// 7-1 监守者的朝向和动作：看谁、逐刻转身、攻击和中箭变红，输出给模型的状态。
import type { V3 } from '../../../../../engine/model/parts.tsx';
import { nearYaw } from '../../6-4-1/古城戏.ts';
import * as geom from '../几何.ts';
import * as timeline from '../时间线.ts';
import { elevationDeg, gameSec, groundZ, lerp, roarAnimSec, ss, yawFromTo } from './公用.ts';
import { huangLeaps, landT } from './跳.ts';
import { lastTick, leanedPoint, shieldBreakT, shieldState, shieldSwingTs, tickSec, wardenAt, wardenLean } from './监守者路.ts';
import { horseSpawnPos, horseState, huangPanPos, liuXinzhongPos } from './位置.ts';
import { chargeDelays, swingTs, vexCount, vexDeathTs, vexTrackAt } from './恼鬼.ts';
// 看谁：拍恼鬼时看最近那只冲过来的；其余时候按戏看人
const nearestVex = (t: number): V3 | undefined => {
  const wardenPos = wardenAt(t).p;
  let best: V3 | undefined;
  let bd = 7;
  for (let i = 0; i < vexCount; i++) {
    if (t >= vexDeathTs[i] || t < timeline.vexChargeT + chargeDelays[i]) continue;
    const vexPos = vexTrackAt(i, t).p;
    const dist = Math.hypot(vexPos[0] - wardenPos[0], vexPos[1] - wardenPos[1]);
    if (dist < bd) {
      bd = dist;
      best = vexPos;
    }
  }
  return best;
};
const shieldCenter = () => shieldState(timeline.shieldT + 0.01)!.at;
const wardenLookAt = (t: number): V3 => {
  if (t < timeline.wardenTurnHeadT) return [geom.wardenStart[0] + 5, geom.wardenStart[1] - 0.6, 1];
  // 扑刘心忠：扑到时他刚蹬地，头跟着往上看他飞走
  if (t < landT(huangLeaps.H1) + 0.25) return liuXinzhongPos(t);
  if (t < timeline.wardenTurnToLiuT) {
    const vexPos = t > timeline.vexChargeT ? nearestVex(t) : undefined;
    return vexPos ?? huangPanPos(t);
  }
  // 中箭：脚下不停，头往放箭的黄叛那边一甩（0.35 秒），又接着追刘心忠
  const hurtAt = hurtTs.find((x) => t >= x && t < x + 0.35);
  if (hurtAt !== undefined) {
    const huang = huangPanPos(hurtAt);
    return [huang[0], huang[1], huang[2] + 1.5];
  }
  if (t < timeline.lungeSwingT + 0.3) return [liuXinzhongPos(t)[0], liuXinzhongPos(t)[1], liuXinzhongPos(t)[2] + 1.2];
  if (t < shieldBreakT()) return shieldCenter();
  // 护盾碎了：看着跃上北墙头的马（第 3 场接着朝它追）
  const horse = horseState(t);
  return horse ? [horse.p[0], horse.p[1], horse.p[2] + 2.2] : [horseSpawnPos[0], horseSpawnPos[1], groundZ + 2.2];
};
// 身子朝向：逐刻转（跑的时候朝前进方向，站着朝看点），转速 1440°/秒（60 米/秒跑起来，0.12 秒就得拧过去）
let wardenYawCache: number[] | undefined;
const wardenYawTrack = (): number[] => {
  if (wardenYawCache) return wardenYawCache;
  const out: number[] = [];
  let y = geom.wardenStartYaw - 180;
  for (let k = 0; k <= lastTick; k++) {
    const t = k * tickSec;
    const now = wardenAt(t);
    let targetYaw = y;
    const lookPt = wardenLookAt(t);
    if (now.v > 3) targetYaw = yawFromTo([0, 0], now.heading);
    else if (Math.hypot(lookPt[0] - now.p[0], lookPt[1] - now.p[1]) > 0.3) targetYaw = yawFromTo(now.p, lookPt);
    targetYaw = nearYaw(y, targetYaw);
    const maxTurn = 1440 * tickSec;
    y += Math.max(-maxTurn, Math.min(maxTurn, targetYaw - y));
    out.push(y);
  }
  wardenYawCache = out;
  return out;
};
// 中箭（7-1-5、7-1-7 的三支风矢；原版 hurtTime 10 刻变红）。黄叛.ts 算出箭以后往里推
export const hurtTs: number[] = [];
const allSwingTs = () => [timeline.firstLungeSwingT, ...swingTs, timeline.lungeSwingT, ...shieldSwingTs];
export const wardenState = (t: number) => {
  const gameTime = gameSec(t);
  const lastSwing = allSwingTs().filter((x) => t >= x).pop();
  const attackSec = lastSwing !== undefined && t - lastSwing < 0.4 ? t - lastSwing : undefined;
  const hurt = hurtTs.some((x) => t >= x && t < x + 0.5) ? 1 : 0;
  const track = wardenAt(t);
  const x = Math.min(lastTick, Math.max(0, t * 20));
  const i = Math.floor(x);
  const yawTrack = wardenYawTrack();
  const yaw = lerp(yawTrack[i], yawTrack[Math.min(lastTick, i + 1)], x - i);
  // 头：看点相对身子朝向的偏转（夹 ±40°）、仰角（够不着高处时抬头）
  const lookPt = wardenLookAt(t);
  const headYawRel = Math.max(-40, Math.min(40, nearYaw(0, yawFromTo(track.p, lookPt) - yaw)));
  const headPitchRel = Math.max(-40, Math.min(20, -(elevationDeg([track.p[0], track.p[1], track.p[2] + 2.6], lookPt)) * 0.8));
  const turnIn = t < timeline.wardenTurnHeadT ? 0 : ss((t - timeline.wardenTurnHeadT) / 0.25);
  return {
    p: track.p,
    entityYaw: yaw + 180,
    秒: gameTime,
    行走: { 相位: track.legPhase, 幅度: Math.min(1, track.v / 5.7) }, // 摆幅同 7-3（原版 5.7 米/秒是 1）；站着 0（7-3 接着这条相位走）
    前倾: wardenLean(t),
    攻击: attackSec,
    吼叫: roarAnimSec(t), // 6-4-9 吼到一半切过来，接着吼完
    受伤: hurt,
    // 实体约定：头偏 正 = 往实体自己的右手边转；FigurePose 的 yaw 正 = 往左。
    头偏: -headYawRel * turnIn,
    headPitch: t < timeline.wardenTurnHeadT ? 8 : headPitchRel * turnIn + 8 * (1 - turnIn),
  };
};
export const wardenChest = (t: number): V3 => leanedPoint(t, 1.6);
