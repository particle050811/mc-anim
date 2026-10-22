// 第 7 章第 1 场的戏：二人、监守者、恼鬼、箭、护盾、幽灵马在场时刻 t（秒，见 时间线.ts）的状态，打在监守者身上的伤害（戏/伤害.ts）。纯函数，七段共用。
// 游戏时间：监守者的待机晃动、心跳、斑纹接着 6-4-9 走（秒 = 6-4-9 末帧的游戏秒 + t）；粒子用 t×20 当刻。
//   - 二人每一跳都是 ../古城4x布局.ts 的 `eliteLeap` / `闪避跳`，落脚点在 `scene71`，核过身子碰撞箱（核对.py「7-1 跳」）；落地卸力 0.25 秒就走。
//   - 监守者照原版：5.7 米/秒，循着振动追，攻击冷却 18 刻，够得着就拍、一下一只；够不着高处就追到底下仰头。
//   - 恼鬼照原版 `VexMoveControl` 逐刻推（每刻往目标加 0.05 格/刻再 ×0.91，极速约 10.1 米/秒）：先散开，再俯冲穿过监守者的头、冲过 9 格兜回来；
//     监守者胸口 2.8 格内、冷却好了就拍，被拍的照原版击退（1.5 → 0.75 格/刻，之后每刻 ×0.91），变红倒下，1 秒后白烟。拍哪只、哪一刻（`swingTs`）是逐刻推出来的，不是排的。
// 各部分在 戏/ 下，本文件转出它们，另给黑暗、7-2 远景、第 3 场衔接。
import * as geom from './几何.ts';
import * as timeline from './时间线.ts';
import { gameSec } from './戏/公用.ts';
import { landT, takeoffT, liuLeaps, huangLeaps, windArrowReleaseT } from './戏/跳.ts';
import { shieldSwingTs, shieldState } from './戏/监守者路.ts';
import { horseLeap, horseTakeoffs, wallLandT, sceneEndT, horseState, liuXinzhongPos, huangPanPos } from './戏/位置.ts';
import { vexCount, chargeDelays, checkVexSwings, swingTs, vexDeathTs, vexState } from './戏/恼鬼.ts';
import { wardenState, wardenChest } from './戏/监守者.ts';
import { liuXinzhongPose } from './戏/刘心忠.ts';
import { type ArrowShot, torchArrows, windArrowShot, huangFollowArrows, allArrows, stuckArrows, wardenFrame, torches, flyingArrows, fanSize, fansAt, huangPanState, huangPanFeet } from './戏/黄叛.ts';
import { wardenMaxHp, wardenHits, wardenHpAt, type WardenHit } from './戏/伤害.ts';
import * as K649 from '../6-4-9/编排.ts';
import { nearYaw } from '../6-4-1/古城戏.ts';

export { gameSec, landT, takeoffT, liuLeaps, huangLeaps, windArrowReleaseT, liuXinzhongPos, shieldSwingTs, vexCount, chargeDelays, checkVexSwings, swingTs, vexDeathTs, vexState, wardenState, wardenChest };
export { horseLeap, horseTakeoffs, wallLandT, sceneEndT, horseState, shieldState, liuXinzhongPose, huangPanPos };
export { type ArrowShot, torchArrows, windArrowShot, huangFollowArrows, allArrows, stuckArrows, wardenFrame, torches, flyingArrows, fanSize, fansAt, huangPanState, huangPanFeet };
export { wardenMaxHp, wardenHits, wardenHpAt, type WardenHit };

// ======================= 接 6-4-9 末帧（首尾核对） =======================
// 场时刻 0 就是 6-4-9 末帧：监守者、二人的位置朝向、头、吼叫、游戏秒、弓都得和 6-4-9/编排.ts 末帧一样，对不上就在加载时报错：段与段硬切，世界状态要连续（CLAUDE.md 漫剧规则，报告第 13 条）
{
  const f = geom.handoffFrame649;
  const end649 = { 监守者: K649.warden(f), 二人: K649.pursuers(f), 弓: K649.bowAt(f) };
  const start71 = { 监守者: wardenState(0), 刘: liuXinzhongPose(0), 黄: huangPanState(0) };
  const off: string[] = [];
  const near = (what: string, a: number | undefined, b: number | undefined, tol: number) => {
    if (a === b) return;
    if (a === undefined || b === undefined || !(Math.abs(a - b) <= tol)) off.push(`${what}：6-4-9 末 ${a}，7-1 首 ${b}`);
  };
  const nearPos = (what: string, a: number[], b: number[]) => {
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (!(dist <= 0.001)) off.push(`${what}位置差 ${dist.toFixed(3)} 米`);
  };
  nearPos('监守者', K649.WARDEN_AT, start71.监守者.p);
  // 监守者朝向不比：7-1 开头它比 6-4-9 末帧多转约 20°，按已渲、用户看过的版本留着（用户 10-21：实际看过的才是权威）
  near('监守者头偏（°）', end649.监守者.头偏, start71.监守者.头偏, 0.1);
  near('监守者低头（°）', end649.监守者.headPitch, start71.监守者.headPitch, 0.1);
  near('监守者吼叫（秒）', end649.监守者.吼叫, start71.监守者.吼叫, 1e-6);
  near('监守者触角（7-1 不画亮）', end649.监守者.触角, 0, 0.01);
  near('游戏秒', end649.监守者.秒, start71.监守者.秒, 1e-6);
  for (const [who, pose] of [['刘', start71.刘], ['黄', start71.黄.pose]] as const) {
    const end = end649.二人[who];
    nearPos(who, end.loc, pose.loc);
    near(`${who}朝向（°）`, end.yaw ?? 0, nearYaw(end.yaw ?? 0, pose.yaw ?? 0), 0.1);
    near(`${who}头偏（°）`, end.headYaw, pose.headYaw, 0.1);
    near(`${who}抬头（°）`, end.headPitch, pose.headPitch, 0.1);
  }
  if (end649.弓 !== start71.黄.弓) off.push(`黄叛的弓：6-4-9 末 ${end649.弓}，7-1 首 ${start71.黄.弓}`);
  if (off.length) throw new Error(`7-1 接 6-4-9 末帧对不上：${off.join('；')}`);
}

// ======================= 黑暗 =======================
// 黑暗效果：黑暗t 起一直在（监守者每 6 秒给 20 格内的玩家续一次 13 秒，factor 停在 1，只有脉动）
export const darknessSec = (t: number) => t - timeline.darknessT;
export const darknessDuration = 1000;

// ======================= 7-2 远景用：t 时刻谁在哪 =======================
// 7-2-1 李樱在 V 上远望（../古城4x布局.ts 的 远望脚底），远景里的监守者、二人、马照这条时间轴摆。t 是第 1 场的场时刻。
export const wideShotState = (t: number) => ({
  监守者: wardenState(t).p,
  wardenEntityYaw: wardenState(t).entityYaw,
  刘: liuXinzhongPos(t),
  黄: huangPanPos(t),
  马: horseState(t)?.p,
  恼鬼: Array.from({ length: vexCount }, (_, i) => vexState(i, t)).filter((v) => v.visible).map((v) => v.p),
});

// ======================= 第 3 场接这里（7-1-7 末帧） =======================
// 7-1-7 末帧 = 场时刻 `末t`：马刚落上北墙头站着（= `handoffs.七三首.马`，朝北、不动）；监守者在墙脚下；黄叛在黄叛高台上。第 3 场只认这几个常量。
export const scene3Handoff = {
  wallLandT,
  上墙点: geom.spots.wallEntry,
  wardenAtWallLand: wardenState(wallLandT).p,
  末t: sceneEndT,
  endHorsePos: horseState(sceneEndT)!.p,
  endHorseSpeed: horseState(sceneEndT)!.速,
  endWarden: wardenState(sceneEndT).p,
  黄叛脚底: geom.spots.huangPanPerch,
};
