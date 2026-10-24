// 苦力怕：原版模型和贴图（取材配方「苦力怕」：client 1.20.1 的 CreeperModel、entity/creeper/creeper.png）。
// 依据（1.20.1 SRG 客户端 jar，javap 反汇编）：
// - CreeperModel.createBodyLayer（m_170525_）：头 8×8×8（转轴 y 6）、身 8×12×4、四条腿 4×6×4（转轴 y 18，前后各在 z ∓4、左右 x ±2），贴图 64×32。整只头顶 1.625 格。
// - setupAnim：头 yRot = 头偏、xRot = 头仰；腿 xRot = cos(步×0.6662 [+π])×1.4×步幅，左后、右前同相，右后、左前反相。
// - CreeperRenderer：影子 0.5；scale() 只跟膨胀走，不膨胀时是 1。把回忆拼好给你 里的苦力怕全程不闪白、不膨胀（正片三稿第 8 句），膨胀、闪白、充能层都不做。
// - 头转角上限：Mob.getMaxHeadYRot 75°（BodyRotationControl 让身子跟着头转，头偏离身子不超过 75°）；俯仰没有另外的限，按 ±90°。
// - 眼高 = 身高 1.7 × 0.85 = 1.445。移动速度属性 0.25；Mob.setSpeed 把同一个数也写进前进输入 zza（再乘 0.98），
//   所以平地上每刻位移 = (0.25 × 速度倍率)² × 0.98 ÷ (1 − 0.6 × 0.91)。各 AI 目标的倍率：闲逛 0.8、追人 1.0、躲猫和豹猫远处 1.0 近处 1.2。
// 坐标同 骨架.tsx：原点在脚底中心，Z 朝上，朝向 +Y，单位格（EntityModel 本身朝 −Y，这里转过来）。
import React from 'react';
import { rad } from '../../engine/anim/anim.ts';
import type { V3 } from '../../engine/model/parts.tsx';
import { EntityModel, type EntityModelData, type PartPose } from '../../engine/model/实体模型.tsx';
import { png } from '../../engine/model/贴图.ts';
import raw from 'asset:模型/角色/苦力怕';
import texImg from 'asset:贴图/角色/苦力怕';

const MODEL = (raw as unknown as { models: { 苦力怕: EntityModelData } }).models.苦力怕;
const TEX = png(texImg);

const groundSpeed = (mult: number) => Math.round((((mult * 0.25) ** 2 * 0.98) / (1 - 0.6 * 0.91)) * 20 * 1000) / 1000;
export const CREEPER = {
  height: 1.625, // 头顶离脚底（格）
  box: [0.6, 1.7] as [number, number],
  eye: 1.445,
  headYawMax: 75,
  headPitchMax: 90,
  shadow: 0.5,
  // 平地上的速度（米/秒），按文件头的式子推
  speed: { wander: groundSpeed(0.8), chase: groundSpeed(1.0), flee: groundSpeed(1.2) },
  color: '#69b361', // 贴图不透明像素的平均色，给碎屑、粒子、剪影用
  colors: { green: '#00a500', light: '#82d077', dark: '#1c4c15', grey: '#d2d2d2', face: '#000000' },
};

/** loc：脚底；yaw：身子朝向（度，0 朝 +Y，正 = 往左，同 FigurePose）；limbSwing、stride：原版走路（库/角色/史蒂夫.tsx 的 vanillaWalk 能从速度算）；
 *  headYaw：头相对身子（度，正 = 往左）；headPitch：度，负 = 低头 */
export type CreeperPose = { loc: V3; yaw?: number; limbSwing?: number; stride?: number; headYaw?: number; headPitch?: number };

/** 原版各部件的 PartPose（模型空间，转角弧度） */
export const creeperParts = (p: CreeperPose): Record<string, PartPose> => {
  const ls = p.limbSwing ?? 0;
  const la = p.stride ?? 0;
  const inPhase = Math.cos(ls * 0.6662) * 1.4 * la;
  const antiPhase = Math.cos(ls * 0.6662 + Math.PI) * 1.4 * la;
  return {
    // 原版 yRot 正 = 往右、xRot 正 = 低头，和这里的约定相反
    head: { rot: [-rad(p.headPitch ?? 0), -rad(p.headYaw ?? 0), 0] },
    left_hind_leg: { rot: [inPhase, 0, 0] },
    right_hind_leg: { rot: [antiPhase, 0, 0] },
    left_front_leg: { rot: [antiPhase, 0, 0] },
    right_front_leg: { rot: [inPhase, 0, 0] },
  };
};

const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
const DEG = 180 / Math.PI;

/** 看向 target（场景坐标）：从眼睛（1.445 格）算头的偏航和俯仰。头偏离身子超过 75° 时，turnBody 就让身子跟着转过去，否则头停在 75° */
export const creeperLookAt = (pose: CreeperPose, target: V3, turnBody = true): CreeperPose => {
  const [x, y, z] = pose.loc;
  const dx = target[0] - x;
  const dy = target[1] - y;
  const dz = target[2] - (z + CREEPER.eye);
  let yaw = pose.yaw ?? 0;
  let rel = wrap180(Math.atan2(-dx, dy) * DEG - yaw);
  if (Math.abs(rel) > CREEPER.headYawMax) {
    const lim = Math.sign(rel) * CREEPER.headYawMax;
    if (turnBody) yaw += rel - lim;
    rel = lim;
  }
  const pitch = Math.min(CREEPER.headPitchMax, Math.max(-CREEPER.headPitchMax, Math.atan2(dz, Math.hypot(dx, dy)) * DEG));
  return { ...pose, yaw, headYaw: rel, headPitch: pitch };
};

/** mcLight：给了就照原版实体光照画、不受场景光（见 实体模型.tsx），值是亮度 0～1；opacity、hurt 同 EntityModel */
export const Creeper: React.FC<{ pose: CreeperPose; mcLight?: number; opacity?: number; hurt?: number }> = ({ pose, mcLight, opacity, hurt }) => (
  <group position={pose.loc} rotation={[0, 0, rad(pose.yaw ?? 0) + Math.PI]}>
    <EntityModel model={MODEL} tex={TEX} pose={creeperParts(pose)} mcLight={mcLight} opacity={opacity} hurt={hurt} />
  </group>
);
