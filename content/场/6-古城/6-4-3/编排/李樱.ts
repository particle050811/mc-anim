// 6-4-3 李樱：翻箱子 → 听到「哄」转身拔刀、居合挑箭 → 举刀戒备、抬头看碎石。
import { type Key, sample, track } from '../../../../../engine/anim/anim.ts';
import type { FigurePose } from '../../../../../world/角色/骨架.tsx';
import { lootPose, yawTo } from '../../../../../world/地点/古城4x/6-4-1/古城戏.ts';
import { chestArchery } from '../../../../../world/地点/古城4x/布局.ts';
import type { ChestOpening } from '../../../../../world/地点/古城4x/6-4-1/古城画面.tsx';
import * as geom from '../几何.ts';
import { ss, storySecAt } from './公用.ts';
// #210（Lootr 战利品箱，6-4-2 开的）：开头开着，听到「哄」松手、盖子落下
export const openChest = (g: number): ChestOpening => ({ 号: chestArchery.号, 开: -1, 关: geom.转身起, 秒: storySecAt(g) });
// 面朝南翻箱子，同 6-4-2 末帧
export const rummageFacing = yawTo(0, -1);
const FACE_CHEST = rummageFacing;
// 居合关键帧取自 6-1-2（帧号同，值见 6-1-2/编排.ts；腿改成站着的弓步）。刀从身子下方兜上来，挥到正前后接斩り上げ：
// 往上挑到几乎竖直（帧 108 仰 82°）、只偏右 12°，刀走近乎竖直的面，把箭往上挑飞。
const ARM_R: Key[] = [[93, 21], [98, 21], [100.4, 39], [101.6, 66], [102.8, 127], [104, 154], [105, 175], [106, 183], [108, 193]];
const ARM_R_ROLL: Key[] = [[93, 79], [98, 79], [100.4, 89], [101.6, 90], [102.8, 130], [104, 79], [105, 45], [106, 47], [108, 49]];
const ELBOW_R: Key[] = [[93, 0], [101.6, 0], [102.8, -45], [104, 0], [108, 0]];
const ARM_L: Key[] = [[93, -66], [98, -66], [100.4, -56], [101.6, -30], [102.8, -39], [104, -60], [105, -67], [106, -60], [108, -55]];
const ARM_L_ROLL: Key[] = [[93, 3], [98, 3], [100.4, -58], [101.6, -70], [102.8, -103], [104, -71], [105, -37], [106, -6], [108, -1]];
const ELBOW_L: Key[] = [[93, 92], [98, 92], [100.4, 110], [101.6, 88], [102.8, 55], [104, 73], [105, 74], [106, 61], [108, 56]];
const YAW: Key[] = [[93, 29], [98, 29], [100.4, 38], [101.6, 43], [102.8, 48], [104, 33], [105, 18], [106, -4], [108, -17]];
const TWIST: Key[] = [[93, 18], [98, 18], [100.4, 22], [101.6, 24], [102.8, 26], [104, 8], [105, -11], [106, -33], [108, -35]];
const HEAD_YAW: Key[] = [[93, -48], [98, -48], [102.8, -50], [104, -25], [105, 2], [106, 36], [108, 55]];
const BLADE: Key[] = [[98, 122], [100.4, 106], [101.6, 98], [102.8, 82], [104, 276], [105, 305], [106, 330], [108, 352]];
const BLADE_SIDE: Key[] = [[98, 11], [100.4, -20], [101.6, -26], [102.8, -31], [104, -9], [105, 4], [106, 10], [108, 12]];
// 6-1-2 帧号 → 剧情时间：93 按刀、98 起拔、104 刀挥到正前（斩击实体生成）、108 挥完
const OLD: [number, number][] = [
  [geom.听到哄, 93],
  [geom.拔刀起, 98],
  [geom.挥刀, 104],
  [geom.挥刀 + 0.03, 108],
];
const oldFrame = (t: number) => {
  if (t <= OLD[0][0]) return OLD[0][1];
  for (let i = 0; i < OLD.length - 1; i++) if (t <= OLD[i + 1][0]) return OLD[i][1] + ((OLD[i + 1][1] - OLD[i][1]) * (t - OLD[i][0])) / (OLD[i + 1][0] - OLD[i][0]);
  return 108;
};
// 挥完：刀慢慢放平、指着前方，举刀戒备
const AFTER: [number, number][] = [
  [geom.挥刀 + 0.03, 0],
  [geom.挥刀 + 0.8, 1],
];
// 朝向：帧 104 头相对髋转了 `YAW` + `TWIST` + `HEAD_YAW` = 33 + 8 − 25 = 16°，正好看着黄叛
const sightYaw = yawTo(geom.视线[0], geom.视线[1]);
const sightPitch = (Math.asin(geom.视线[2]) * 180) / Math.PI;
const HEADING = sightYaw - (sample(YAW, 104) + sample(TWIST, 104) + sample(HEAD_YAW, 104));
// 抬头：箭挑飞后钉进洞顶只有 0.026 秒，人看不过来，所以抬头落在碎石往下掉的那一阵（头仰 60°，不往身后扭）。
// 挥刀时腰往左拧（用户 10-10 修挡箭）：照 6-1-2 原样挥，刀刃离箭路最近也有 0.5 米、扫不到箭（工具/挡箭/刀刃扫箭.ts），
// 只挪弹开点不够，所以整个人绕脚底多拧 `挥刀转身` 度（帧 98 拧起、103 拧满），竖面斜过来横穿箭路；
// 头照旧锁着黄叛（`sightLock` 反扭回来），挥完跟 `AFTER` 一起拧回戒备朝向。拧多少见 几何.ts 的 `弹开关键帧`
export const swingTurnDeg = geom.挥刀转身;
const swingTwistAt = (o: number, after: number) => swingTurnDeg * ss((o - 98) / 5) * (1 - after);
// 抬头的时刻跟着弹开走
const lookUpAt = (t: number) => ss((t - geom.弹开 - 0.104) / 0.25) * (1 - ss((t - geom.弹开 - 1.074) / 0.5));
const lookUpPitch = 60;
// 正式演法（打斗编排.ts）：听到「哄」起压低重心、胸和身子往后拧着蓄力，刀甩出时收回（刀挥到正前时姿态回到主方案，刀刃照样扫过箭路）；
// 挥完在最高处多停一拍，再缓缓收成戒备
export type 李樱演法 = { 蓄势: boolean };
const windupAt = (o: number) => ss((o - 93) / 3) * (1 - ss((o - 102.8) / 1.2));
const WINDUP = { kneeR: 35, kneeL: 30, legR: 12, legL: -8, pitch: -8, twist: 12, yaw: 8 };
const holdAfterSwing = 0.12;

export const makeLiying = (variant?: 李樱演法) => (globalFrame: number) => {
  const t = storySecAt(globalFrame);
  // 翻箱子：手在箱子里来回翻
  const rummage = 0.3 + 0.2 * (0.5 + 0.5 * Math.sin(t * 7));
  const loot = lootPose(geom.FOOT, FACE_CHEST, rummage, 1.4);
  // 听到「哄」：下意识直起身、转向黄叛、手搭上刀柄，0.04 秒后拔刀
  const turnWeight = ss((t - geom.转身起) / (geom.拔刀起 - geom.转身起 + 0.01));
  if (turnWeight <= 0) return { pose: loot, bladeOn: false, blade: 0, bladeSide: 0 };
  const iaiFrame = oldFrame(t);
  const after = track(AFTER, variant ? t - holdAfterSwing : t);
  const w = variant?.蓄势 ? windupAt(iaiFrame) : 0;
  const turn = turnWeight;
  const heading = FACE_CHEST + (HEADING - FACE_CHEST) * turn;
  const pitch = -10 - 8 * ss((iaiFrame - 98) / 6) + 8 * after + WINDUP.pitch * w;
  const iai: FigurePose = {
    loc: geom.FOOT,
    pitch,
    squash: 1,
    // 抬头看着视线，身子前倾多少头就再抬多少
    headPitch: sightPitch * turn - pitch,
    // 蓄势时胸和身子多拧的，头反着扭回来，眼睛还盯着黄叛
    headYaw: sample(HEAD_YAW, iaiFrame) * (1 - after) + 20 * after - (WINDUP.twist + WINDUP.yaw) * w,
    legR: 28 + 10 * ss((iaiFrame - 98) / 6) + WINDUP.legR * w,
    kneeR: 30 + WINDUP.kneeR * w,
    legL: -18 + WINDUP.legL * w,
    kneeL: 22 + WINDUP.kneeL * w,
    armR: sample(ARM_R, iaiFrame) * (1 - after) + 100 * after,
    armRRoll: sample(ARM_R_ROLL, iaiFrame) * (1 - after) + 40 * after,
    elbowR: sample(ELBOW_R, iaiFrame) * (1 - after) + 10 * after,
    armL: sample(ARM_L, iaiFrame) * (1 - after) + -40 * after,
    armLRoll: sample(ARM_L_ROLL, iaiFrame) * (1 - after) + 8 * after,
    elbowL: sample(ELBOW_L, iaiFrame) * (1 - after) + 50 * after,
    yaw: heading + sample(YAW, iaiFrame) * (1 - after) + -10 * after + swingTwistAt(iaiFrame, after) + WINDUP.yaw * w,
    twist: sample(TWIST, iaiFrame) * (1 - after) + -15 * after + WINDUP.twist * w,
  };
  // 刀挥到正前后头一直看着黄叛：不跟 6-1-2 关键帧里头随身子回扭，头相对胸转多少由身子扭了多少定
  const sightLock = ss((iaiFrame - 103) / 1);
  iai.headYaw += (sightYaw - (iai.yaw ?? 0) - (iai.twist ?? 0) - iai.headYaw) * sightLock;
  iai.headPitch += (lookUpPitch - sightPitch) * lookUpAt(t);
  const mix = (a = 0, b = 0) => a + (b - a) * turnWeight;
  const pose: FigurePose = {
    loc: geom.FOOT,
    pitch: mix(loot.pitch, iai.pitch),
    squash: 1,
    headPitch: mix(loot.headPitch, iai.headPitch),
    headYaw: mix(loot.headYaw, iai.headYaw),
    legR: mix(loot.legR, iai.legR),
    legL: mix(loot.legL, iai.legL),
    kneeR: mix(loot.kneeR, iai.kneeR),
    kneeL: mix(loot.kneeL, iai.kneeL),
    armR: mix(loot.armR, iai.armR),
    armRRoll: mix(loot.armRRoll, iai.armRRoll),
    elbowR: mix(loot.elbowR, iai.elbowR),
    armL: mix(loot.armL, iai.armL),
    armLRoll: mix(loot.armLRoll, iai.armLRoll),
    elbowL: mix(loot.elbowL, iai.elbowL),
    yaw: mix(loot.yaw, iai.yaw),
    twist: mix(0, iai.twist),
  };
  const bladeOn = iaiFrame >= 98;
  return { pose, bladeOn, blade: sample(BLADE, iaiFrame) * (1 - after) + 285 * after, bladeSide: sample(BLADE_SIDE, iaiFrame) * (1 - after) + 10 * after };
};
export const liying = makeLiying();
