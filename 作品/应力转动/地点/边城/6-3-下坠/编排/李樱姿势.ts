// 李樱的姿态和骨架上的几个量（纯函数，不碰下落的物理解）：起跳那刻的髋、打击姿势的撞击深度、落点。
// 时间线.ts 拿这些求下落（`solveFall`），编排/李樱.ts 拿姿态排动作；单放出来是为了让 时间线.ts 能引它而不成环（本文件只引 基准.ts，不引 时间线.ts）。
// 约定见 李樱.ts 文件头：以髋关节为基准点，身子绕髋的左右轴往前翻 φ 度。
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { broomMatrix, liYingHand, liYingRidePose, RIDE } from '@库/角色/骑扫帚.tsx';
import type { FigurePose } from '@库/角色/骨架.tsx';
import { BROOM } from '@库/物品/扫帚.tsx';
import { MACE } from '@库/物品/重锤.tsx';
import { ROLLER } from '@库/物品/动力压路机.tsx';
import { borderTownPos } from '../../../主世界116.ts';
import { tick, start } from '../基准.ts';
import { releasePose } from '../../6-3-3/下落攻击.ts';
import { add, D2R } from './工具.ts';
import { broomState, broomMatrixAt } from './扫帚.ts';
import { smoothstep01, lerp, lerpV } from '@engine/core/数学.ts';

export const PX = 1.875 / 32; // 李樱：一像素多少格

// ---------- 李樱的姿态 ----------
// 骨架的髋高（像素）：照 骨架.tsx 的 Figure 算（哪条腿伸得更低就以它贴地，ground 在 0～1 之间插值）
export const hipPx = (pose: FigurePose) => {
  const reach = (a: number, knee: number) => 6 * Math.cos((a + pose.pitch) * D2R) + 6 * Math.cos((a + pose.pitch - knee) * D2R);
  const grounded = Math.max(3, reach(pose.legR, pose.kneeR ?? 0), reach(pose.legL, pose.kneeL ?? 0));
  return (12 + (pose.ground ?? 1) * (grounded - 12)) * pose.squash;
};
export type PosePart = Partial<FigurePose> & { hammer?: number };
const RIDE0 = (() => {
  const rider = start.riders.李樱 as { lean?: number; headRaise?: number };
  const pose = liYingRidePose(rider.lean ?? 18);
  pose.headPitch += rider.headRaise ?? 0;
  return pose;
})();
// 站在杆上：脚踩在前座的杆顶，膝盖弯着稳住，两手张开保持平衡，低头看城
export const STAND: FigurePose = {
  loc: [0, RIDE.front, BROOM.stickTop - BROOM.stickZ + 0.02],
  pitch: -6, squash: 1, headPitch: -28, headYaw: 0,
  legR: 26, legL: 26, kneeR: 44, kneeL: 44, legRRoll: -8, legLRoll: -8,
  armR: 28, armL: 28, armRRoll: -24, armLRoll: -24, elbowR: 25, elbowL: 25, ground: 1,
};
// 关键姿势（物理时间 → 姿势的一部分）；锤 = 锤是否在手上（0～1，按物品切换：够到肩后那一刻出现）
const STAND_T = tick.standUp + 0.48; // 站直的时刻
export const KEYS: [number, PosePart][] = [
  [0, {}],
  [tick.standUp, {}],
  [STAND_T, { ...STAND }],
  // 右手往右肩后面够（上臂往上往后、前臂往下折）
  [tick.reachForMace, { armR: 28, elbowR: 25, armRRoll: -24 }],
  [tick.maceAppears, { armR: 205, elbowR: 125, armRRoll: -8, headYaw: -18, hammer: 1 }],
  // 抡到身前：两手在胸前握住锤柄，锤头朝前上方
  [tick.maceAppears + 0.18, { armR: 115, elbowR: 30, armRRoll: 18, armL: 95, elbowL: 40, armLRoll: 28, headYaw: 0 }],
  [tick.swingOut, { armR: 120, elbowR: 35, armRRoll: 22, armL: 120, elbowL: 35, armLRoll: 22 }],
  // 下蹲蓄力：锤举过头顶
  [tick.crouch + 0.26, { ground: 1, pitch: -26, legR: 72, legL: 72, kneeR: 118, kneeL: 118, armR: 172, elbowR: 45, armL: 172, elbowL: 45, armRRoll: 22, armLRoll: 22, headPitch: -30 }],
  // 一蹬：腿蹬直、离开杆（ground 1 → 0），身子往前翻
  [tick.leap + 0.1, { pitch: -10, legR: 8, legL: 8, kneeR: 6, kneeL: 6, ground: 0, armR: 175, elbowR: 15, armL: 175, elbowL: 15, headPitch: 0 }],
  // 俯冲：双臂伸过头顶（顺着身子往地面方向），锤头领在最前面；腿并拢伸直，抬头（对倒过来的人是往地面看）
  [tick.leap + 0.6, { pitch: 0, legR: 2, legL: 2, kneeR: 12, kneeL: 12, legRRoll: 2, legLRoll: 2, armR: 168, elbowR: 6, armL: 168, elbowL: 6, armRRoll: 18, armLRoll: 18, headPitch: 32, ground: 0 }],
];
export const legacyPose = (t: number) => blend(KEYS, t, STAND); // 原来的姿势（6-3-3/下落攻击.ts 拿它接前后）
export const FIELDS = ['pitch', 'headPitch', 'headYaw', 'legR', 'legL', 'kneeR', 'kneeL', 'legRRoll', 'legLRoll', 'armR', 'armL', 'armRRoll', 'armLRoll', 'elbowR', 'elbowL', 'ground', 'twist'] as const;
const STRIKE_HIT: PosePart = { armR: 155, elbowR: 0, armL: 155, elbowL: 0, kneeR: 20, kneeL: 20, pitch: -6, headPitch: 30 };
export const blend = (keys: [number, PosePart][], t: number, base: FigurePose): FigurePose => {
  // 每个字段单独找前后两个写了它的关键姿势插值（没写的字段沿用上一个），平滑插值
  const out: FigurePose = { ...base, loc: [...base.loc] };
  for (const field of FIELDS) {
    const pts = keys.filter(([, k]) => k[field] !== undefined).map(([t0, k]) => [t0, k[field] as number] as [number, number]);
    if (!pts.length) continue;
    if (t <= pts[0][0]) {
      (out as Record<string, unknown>)[field] = pts[0][1];
      continue;
    }
    let value = pts[pts.length - 1][1];
    for (let i = 1; i < pts.length; i++)
      if (t <= pts[i][0]) {
        value = lerp(pts[i - 1][1], pts[i][1], smoothstep01((t - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0])));
        break;
      }
    (out as Record<string, unknown>)[field] = value;
  }
  return out;
};
// 俯冲时的前翻角 φ（度）：头朝下、往前斜 25°（φ 怎么随时间变见 李樱.ts 的 `phi`）
export const PHI_DIVE = 155;
// 骑乘姿势（跨坐 → 站起）在扫帚本地坐标里
export const onBroomPose = (physSec: number): FigurePose => {
  const k = smoothstep01((physSec - tick.standUp) / (STAND_T - tick.standUp));
  const base: FigurePose = {
    ...RIDE0,
    loc: lerpV(RIDE0.loc, STAND.loc, k),
    ground: k,
  };
  for (const field of FIELDS) {
    const rideVal = (RIDE0 as unknown as Record<string, number | undefined>)[field] ?? 0;
    const standVal = (STAND as unknown as Record<string, number | undefined>)[field] ?? 0;
    (base as Record<string, unknown>)[field] = lerp(rideVal, standVal, k);
  }
  // 刻.抡出 以后的蓄力、蹬出、空中抡锤见 6-3-3/下落攻击.ts；跃出那一刻的髋高和段末姿势和旧版一致
  return physSec < STAND_T ? base : releasePose(physSec, blend(KEYS, physSec, STAND), legacyPose);
};
// 跃出那一刻扫帚的转动（之后李樱的身子以它为基准往前翻）
const Q_LEAP = new THREE.Quaternion().setFromRotationMatrix(broomMatrix([0, 0, 0], broomState(tick.leap).yaw, broomState(tick.leap).pitch, broomState(tick.leap).roll));
// 髋在扫帚本地坐标里的位置
export const hipLocal = (p: FigurePose): V3 => [p.loc[0], p.loc[1], p.loc[2] + hipPx(p) * PX];
export const freeMatrix = (hipW: V3, φ: number, pose: FigurePose) => {
  const quat = Q_LEAP.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -φ * D2R));
  // Figure 的 loc 填 0：髋在 (0, 0, hip)，所以先往下挪 hip 再转、再挪到 hipW
  return new THREE.Matrix4().compose(new THREE.Vector3(...hipW), quat, new THREE.Vector3(1, 1, 1)).multiply(new THREE.Matrix4().makeTranslation(0, 0, -hipPx(pose) * PX));
};
// 打击姿势时，滚筒最低点在髋下方多深（场景里的竖直距离），撞击时刻按它算
export const strikePose = (): FigurePose => ({ ...blend(KEYS, 99, STAND), ...STRIKE_HIT, loc: [0, 0, 0], ground: 0 });
export const maceHeadAt = (pose: FigurePose, matrix: THREE.Matrix4, maceAngle: number): V3 => {
  // 握持点（Figure 外层坐标，loc = 0、ground = 0）+ 锤的方向 × 锤头距离
  const grip = liYingHand(pose, 'R');
  const angleRad = maceAngle * D2R;
  const dirBody = new THREE.Vector3(0, -Math.sin(angleRad), Math.cos(angleRad)); // 身体坐标（去掉转身、前倾）
  dirBody.applyEuler(new THREE.Euler(pose.pitch * D2R, 0, 0)).applyEuler(new THREE.Euler(0, 0, (pose.yaw ?? 0) * D2R));
  const head = new THREE.Vector3(...grip).addScaledVector(dirBody, MACE.head * 16 * PX).applyMatrix4(matrix);
  return [head.x, head.y, head.z];
};
export const maceAngleOf = (p: FigurePose) => p.armR + (p.elbowR ?? 0) + 180;
export const rollerGhostScale = 1.25; // 压路机虚影在锤头上的缩放（滚筒直径约 1.8 米、外壳 1.2 米见方，比李樱略小，五格来宽的竖井装得下）
export const rollerRadius = ROLLER.radius * rollerGhostScale * 16 * PX;

// 起跳点（髋）：时间线.ts 从这里往下积分
export const LY_LEAP_HIP = (() => {
  const pose = onBroomPose(tick.leap);
  const hip = new THREE.Vector3(...hipLocal(pose)).applyMatrix4(broomMatrixAt(tick.leap));
  return [hip.x, hip.y, hip.z] as V3;
})();
// 头朝下俯冲（翻到 155°）时的变换、滚筒最低点比髋低多少：6-3-2 思索场景板上摆同一个李樱也用（6-3-2/编排.ts）
export const diveMatrix = (hip: V3, pose: FigurePose) => freeMatrix(hip, PHI_DIVE, pose);
export const ghostDepth = (pose: FigurePose) => -maceHeadAt(pose, diveMatrix([0, 0, 0], pose), maceAngleOf(pose))[2] + rollerRadius;
// 打击深：打击姿势下滚筒最低点比髋低多少
export const strikeDepth = ghostDepth(strikePose());
// 落点：砸在城门进来的南北大街（x ±12）和 y 97～103 横街的路口正中（用户 10-05 定竖井相对城的位置不变；边城/布局.ts 也照这个路口搭，路口四角街区限高 15 米，6-3-5、6-3-6 镜头从高处斜看）。
// 推力目标速度要带一点水平分量（4.6 米/秒，偏离竖直 0.7°）才对得准，竖直朝下的话水平初速很快被拉回 0，落点偏到路口北 18 米。
// 对准路口正中那格的格心 (-0.5, 100.5)：坑和竖井网格摆在撞击点那格的格心（井心），锤正好落在井轴上
// 髋在 hip、摆打击姿势头朝下时锤头的位置：时间线.ts 的 `solveFall` 拿它在撞击那刻对落点
export const impactMaceHead = (hip: V3): V3 => {
  const pose = strikePose();
  return maceHeadAt(pose, freeMatrix(hip, PHI_DIVE, pose), maceAngleOf(pose));
};
export const landingSpot = add(borderTownPos, [-0.5, 100.5, 0]);
