// 7-1 幽灵马（召出、跳上北墙头站住），刘心忠和黄叛的脚底位置（一串跳；刘心忠上马后随马）。
import type { V3 } from '../../../../../engine/model/parts.tsx';
import { steedRear } from '../../../../生物/幽灵马.tsx';
import { leapFeetAt, type 跳 } from '../../布局.ts';
import * as geom from '../几何.ts';
import * as timeline from '../时间线.ts';
import { FPS } from './公用.ts';
import { huangLeaps, huangStart, landT, leapAtSec, leapChainPos, liuLeaps, liuStart, takeoffT } from './跳.ts';
export const horseSpawnPos = geom.horseSpawnPos;

export const horseLeap: 跳 = leapAtSec(horseSpawnPos, geom.spots.wallEntry, geom.horseLeapApex, timeline.horseJumpT);
export const wallLandT = landT(horseLeap);
// 马每一跃离地的时刻（人立从这一刻起，幽灵马.tsx 的 `steedStand`；第 3 场接着用）
export const horseTakeoffs = [takeoffT(horseLeap)];
export const sceneEndT = timeline.segmentEndT('7-1-7');
export const horseState = (t: number) => {
  if (t < timeline.horseSpawnT) return undefined;
  const northYaw = 0;
  const 人立 = steedRear(horseTakeoffs, t);
  if (t < timeline.horseJumpT) {
    return { p: horseSpawnPos, yaw: northYaw, entityYaw: northYaw + 180, 行走: { 相位: 0, 幅度: 0 }, 速: 0, 人立 };
  }
  if (t < wallLandT) {
    const pos = leapFeetAt(horseLeap, t * FPS);
    return { p: pos, yaw: northYaw, entityYaw: northYaw + 180, 行走: { 相位: (t - timeline.horseJumpT) * 20 * 0.6, 幅度: 0.3 }, 速: horseLeap.horizSpeed, 人立 };
  }
  // 落上墙头站住（= 衔接.七三首.马），第 3 场从这里接着跑
  const landPhase = (wallLandT - timeline.horseJumpT) * 20 * 0.6;
  return { p: geom.spots.wallEntry, yaw: northYaw, entityYaw: northYaw + 180, 行走: { 相位: landPhase, 幅度: 0 }, 速: 0, 人立 };
};

export const liuLeapList = [liuLeaps.J1, liuLeaps.J2, liuLeaps.J3, liuLeaps.J4, liuLeaps.闪];
export const liuXinzhongPos = (t: number): V3 => {
  if (t >= timeline.mountT) {
    const horse = horseState(t);
    if (horse) return horse.p;
  }
  return leapChainPos(liuStart.loc as V3, liuLeapList, t);
};

export const huangLeapList = [huangLeaps.H1, huangLeaps.H2, huangLeaps.H3];
export const huangPanPos = (t: number): V3 => leapChainPos(huangStart.loc as V3, huangLeapList, t);
