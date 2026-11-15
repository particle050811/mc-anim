// 第三人称看玩家挥手（右手）：原版 1.20.1 HumanoidModel.setupAttackAnimation，换成 FigurePose 的角度（度）。纯模块。
// attackTime（0～1）由右键那一刻起 6 刻走完（LivingEntity 普通挥手的 getCurrentSwingDuration），渲染时按刻插值连续走。
// 原版：body.yRot = sin(√t·2π)·0.2；右臂 yRot 先跟身子 +body.yRot、再 +2·body.yRot，xRot −= sin((1 − (1 − t)⁴)·π)·1.2 + sin(tπ)·−(头 xRot − 0.7)·0.75，
//   zRot += sin(tπ)·−0.4；左臂 yRot += body.yRot、xRot += body.yRot。FigurePose 里手臂挂在胸上（跟着 twist 转），所以右臂只再加 2 倍。
import type { FigurePose } from './骨架.tsx';

const degPerRad = 180 / Math.PI;

/** 挥手进度：距右键几秒 → attackTime（不在挥的时候是 0） */
export const waveProgress = (sinceRightClickSec: number) => {
  const t = (sinceRightClickSec * 20) / 6;
  return t > 0 && t < 1 ? t : 0;
};

/** 在姿势上叠一次右手挥手（t = attackTime）；t 不在 (0, 1) 里原样返回 */
export const addWave = <P extends FigurePose>(pose: P, t: number): P => {
  if (!(t > 0 && t < 1)) return pose;
  const bodyTwist = Math.sin(Math.sqrt(t) * Math.PI * 2) * 0.2;
  const f = 1 - (1 - t) ** 4;
  const f1 = Math.sin(f * Math.PI);
  const headX = (-pose.headPitch * Math.PI) / 180;
  const f2 = Math.sin(t * Math.PI) * -(headX - 0.7) * 0.75;
  return {
    ...pose,
    twist: (pose.twist ?? 0) - bodyTwist * degPerRad,
    armR: pose.armR + (f1 * 1.2 + f2) * degPerRad,
    armRYaw: (pose.armRYaw ?? 0) - 2 * bodyTwist * degPerRad,
    armRRoll: pose.armRRoll + 0.4 * Math.sin(t * Math.PI) * degPerRad,
    armL: pose.armL - bodyTwist * degPerRad,
  };
};
