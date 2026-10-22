// 6-4-8、6-4-9 二人的姿势零件：刘心忠举杖戒备、黄叛搭箭拉弓，喘气和重心晃、一激灵、蹲身蓄力、往后急退的空中姿势、落地卸力、挪步、吼声里压低身子。
// 两段共用（6-4-9 接着 6-4-8 末帧演），编排各自按自己的时间轴调这些零件；`endSpots` 是 6-4-9 末帧的站位，也是 7-1-1 首帧（7-1/几何.ts 的 pursuersStart 从 6-4-9 末帧取）。
// 用户 10-18 嫌二人「完全站着看着监守者出来 一点反应都没有」：反应快、急退拉开、摆开架势，站着时也一直在喘、在挪重心，不定格。
import type { V3 } from '@engine/model/parts.tsx';
import { drawBowPose } from '../../../角色/追兵.tsx';
import { standPose, type FigurePose } from '@库/角色/骨架.tsx';
import { nearYaw, yawTo } from '../6-4-1/古城戏.ts';
import { G4 } from '../../古城4x.tsx';
import { huangPanSpot, liuXinzhongSpot, wardenEmerge } from '../布局.ts';

export const ss = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const rampIn = (x: number, a: number, b: number) => Math.min(1, Math.max(0, (x - a) / (b - a)));
// a～b 之间为 1，前后各用 rampIn / rampOut 秒淡入淡出
export const pulse = (t: number, a: number, b: number, rampInSec = 0.1, rampOutSec = 0.1) => ss((t - a) / rampInSec) * (1 - ss((t - b) / rampOutSec));
export const bump = (t: number, a: number, b: number) => (t <= a || t >= b ? 0 : Math.sin((Math.PI * (t - a)) / (b - a)));

// ---------- 站位（场景坐标） ----------
// 往后急退的落点：刘心忠往东北、黄叛往东南，各退三四米、往外岔开一两米（落点和路上都是平的幽匿地，工具/古城4x布局/方块.py 查过）
export const hopTo: { 刘: V3; 黄: V3 } = { 刘: G4(-862.8, -51, 218.0), 黄: G4(-860.6, -51, 225.4) };
// 6-4-9 末帧 = 7-1-1 首帧的站位：照 7-1 一直接的位置（原来 6-4-8 退半步后的 刘心忠站位 + 0.5、黄叛站位 + 0.3 格），二人在 6-4-9 里一步步逼回这里
export const endSpots: { 刘: V3; 黄: V3 } = {
  刘: [liuXinzhongSpot[0] + 0.5, liuXinzhongSpot[1], liuXinzhongSpot[2]],
  黄: [huangPanSpot[0] + 0.3, huangPanSpot[1], huangPanSpot[2]],
};
export const WARDEN_AT = wardenEmerge;
export const yawToWarden = (feet: number[]) => yawTo(WARDEN_AT[0] - feet[0], WARDEN_AT[1] - feet[1]);
export const yawToward = (from: number[], to: number[]) => yawTo(to[0] - from[0], to[1] - from[1]);
// 从眼睛看监守者身上离地 h 格那一点的仰角（度，正 = 抬头）
export const elevationTo = (feet: number[], h: number, eye = 1.6) =>
  (Math.atan2(WARDEN_AT[2] + h - (feet[2] + eye), Math.hypot(WARDEN_AT[0] - feet[0], WARDEN_AT[1] - feet[1])) * 180) / Math.PI;

// ---------- 站着 ----------
// 喘气和重心晃（s 秒，phase 让两人错开）：紧张时喘得快（约 0.75 下/秒），重心左右挪得慢
const breath = (s: number, phase: number) => Math.sin(s * 4.7 + phase);
const sway = (s: number, phase: number) => Math.sin(s * 1.7 + phase * 1.3);
const swayOffset = (loc: number[], yaw: number, s: number, phase: number, amount: number): V3 => {
  const side = sway(s, phase) * 0.035 * amount;
  const r = (yaw * Math.PI) / 180;
  return [loc[0] + Math.cos(r) * side, loc[1] + Math.sin(r) * side, loc[2]];
};

// 刘心忠：g 0～1 从垂手站着到举杖戒备（右手杖往前上方举、左手往前张开，右脚在前、两脚岔开、压低重心、右肩往前送）；look 头看的仰角
// live 0～1：喘气、晃动加多少（6-4-8 开头还在走路时是 0）
export const liuGuardPose = (feet: number[], yaw: number, s: number, g: number, lookPitch: number, live = 1): FigurePose => {
  const b = breath(s, 0.7) * live;
  const pose: FigurePose = {
    ...standPose(swayOffset(feet, yaw, s, 0.7, g * live)),
    yaw,
    armR: 70 * g + 2.5 * b * g,
    armRRoll: 4,
    armL: 52 * g + 3.5 * b,
    armLRoll: 4 - 18 * g,
    legR: 14 * g,
    legL: -12 * g,
    kneeR: 14 * g,
    kneeL: 24 * g,
    legRRoll: -5 * g,
    legLRoll: -5 * g,
    squash: 1 - 0.045 * g - 0.012 * (b * 0.5 + 0.5) * live,
    pitch: -6 * g - 1.5 * b * g + 1.2 * sway(s, 0.7) * g * live,
    twist: 12 * g,
    headYaw: -12 * g,
    headPitch: lookPitch + 6 * g - 1.5 * b,
  };
  return pose;
};

// 黄叛：r 0～1 把弓举到身前（右手扣在弦上，没拉），d 0～1 拉满（贴图另按 `bowTexture`）；aimPitch 箭瞄的仰角
// 拉满时手抖（拉着几十磅的弓撑久了），左脚在前、两脚岔开
export const huangAimPose = (feet: number[], yaw: number, s: number, r: number, d: number, aimPitch: number, live = 1): FigurePose => {
  const b = breath(s, 2.1) * live;
  const k = r * (0.72 + 0.28 * d);
  const pose = drawBowPose(swayOffset(feet, yaw, s, 2.1, r * live) as V3, yaw, 0, aimPitch * k, k);
  pose.armL += (0.6 * d * Math.sin(s * 41) + 2 * b * (1 - d)) * live * r;
  pose.armR += (0.8 * d * Math.sin(s * 33 + 1) + 2 * b * (1 - d)) * live * r;
  pose.legL = 12 * r;
  pose.legR = -10 * r;
  pose.kneeL = 14 * r;
  pose.kneeR = 20 * r;
  pose.legRRoll = -5 * r;
  pose.legLRoll = -5 * r;
  pose.squash = 1 - 0.035 * r - 0.012 * (b * 0.5 + 0.5) * live;
  pose.pitch = -3 * r - 1.2 * b * r + sway(s, 2.1) * r * live;
  pose.headPitch = aimPitch - 1.2 * b * (1 - d);
  return pose;
};
// 拉弓贴图：照原版三档（拉到 0.65、0.9 换），d 不到 0.05 算没拉
export const bowPull = (d: number) => ({ pulling: d > 0.05, pull: d });

// ---------- 动作叠加 ----------
// 一激灵（j 0～1 的一下，用 bump）：身子往后一挺、头一抬、两手一缩
export const startle = (pose: FigurePose, j: number): FigurePose => ({
  ...pose,
  pitch: pose.pitch + 9 * j,
  headPitch: pose.headPitch + 8 * j,
  armR: pose.armR + 16 * j,
  armL: pose.armL + 18 * j,
  squash: pose.squash * (1 + 0.02 * j),
});
// 蹲身（起跳蓄力、落地卸力、吼声里压低）：c 0～1
export const crouchBy = (pose: FigurePose, c: number): FigurePose => ({
  ...pose,
  squash: pose.squash * (1 - 0.13 * c),
  pitch: pose.pitch - 12 * c,
  headPitch: pose.headPitch + 8 * c,
  legR: pose.legR + 22 * c,
  legL: pose.legL + 22 * c,
  kneeR: (pose.kneeR ?? 0) + 45 * c,
  kneeL: (pose.kneeL ?? 0) + 45 * c,
});
// 往后急退的空中（u 0～1）：面朝监守者往后飞，腿收到身子底下、身子往前探着压住重心。rightTuck 右腿往前收多少（负 = 往后撩；刘心忠杖在右前方，右腿往前收会顶到杖）
export const hopAir = (pose: FigurePose, u: number, rightTuck = 1): FigurePose => {
  const tuck = Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
  return {
    ...pose,
    ground: 0,
    squash: 1,
    pitch: pose.pitch - 10 * tuck,
    headPitch: pose.headPitch + 8 * tuck,
    legR: (20 + 40 * tuck) * rightTuck,
    legL: 10 + 50 * tuck,
    kneeR: 30 + 55 * tuck * Math.abs(rightTuck),
    kneeL: 25 + 60 * tuck,
    legRRoll: -6,
    legLRoll: -6,
  };
};
// 落地卸力（sinceLand 秒）：2 帧压到底、蹲住，0.35 秒起来（同 7-1 的落地缓冲，短一点：急退以后立刻要摆架势）
export const landingCushion = (sinceLand: number) => {
  if (sinceLand < 0 || sinceLand >= 0.42) return 0;
  if (sinceLand < 0.08) return 0.6 + 0.4 * ss(sinceLand / 0.08);
  if (sinceLand < 0.14) return 1;
  return 1 - ss((sinceLand - 0.14) / 0.28);
};
// 挪一步（k 0～1）：前脚抬起往前迈、落下，身子跟着一沉一起（leg 'R' / 'L' 迈哪只脚；amp 抬多高，刘心忠右脚抬低点免得顶到杖）
export const stepLeg = (pose: FigurePose, k: number, leg: 'R' | 'L', amp = 1): FigurePose => {
  if (k <= 0 || k >= 1) return pose;
  const lift = Math.sin(Math.PI * k) * amp;
  const out = { ...pose, squash: pose.squash * (1 - 0.02 * lift) };
  if (leg === 'R') return { ...out, legR: pose.legR + 28 * lift, kneeR: (pose.kneeR ?? 0) + 40 * lift };
  return { ...out, legL: pose.legL + 28 * lift, kneeL: (pose.kneeL ?? 0) + 40 * lift };
};
// 头转过去看某处（相对身子的偏转夹在 ±70°），w 0～1
export const glanceAt = (pose: FigurePose, from: number[], to: number[], w: number): FigurePose => {
  if (w <= 0) return pose;
  const rel = Math.max(-70, Math.min(70, nearYaw(0, yawToward(from, to) - (pose.yaw ?? 0) - (pose.twist ?? 0))));
  return { ...pose, headYaw: lerp(pose.headYaw, rel, w) };
};
