// 原版玩家挥手（1.20.1 HumanoidModel.setupAttackAnimation）的正本（10-30 整体优化方案 0.6）。新代码一律从这里 import；
// 旧代码里的四份（库/角色/挥手.ts，把回忆 2-祭坛/人物.tsx、2-末地/角色.tsx、2-第一晚/史蒂夫.tsx）原样不动，登记在 docs/副本表.tsv。纯模块。
//
// 原版（attackTime = t，0～1；出手那只手是 HumanoidArm）：
//   body.yRot = sin(√t·2π)·0.2（左手出手取反）；两肩绕身子中线转：右肩 (x, z) = (−cos·5, sin·5)、左肩 (cos·5, −sin·5)；
//   两臂 yRot += body.yRot，左臂 xRot += body.yRot；出手那只臂 xRot −= sin((1 − (1 − t)⁴)·π)·1.2 + sin(tπ)·−(头 xRot − 0.7)·0.75、
//   yRot += 2·body.yRot、zRot += sin(tπ)·−0.4。原版的 sin 是 Mth 查表，这里和四份副本一样用 Math.sin（差在 1e−4 弧度以内）。
// 两种姿态写法：
// - 挥手部件：原版部件表（engine/model/实体模型.tsx 的 PartPose，弧度、像素），库/角色/史蒂夫.tsx 的 steveParts 出的就是它。
// - 加挥手：库/角色/骨架.tsx 的 FigurePose（度），只做右手（同 库/角色/挥手.ts，手臂挂在胸上、跟着 twist 转，所以右臂 yRot 只再加 2 倍）。
// 副本差别：
// - 2-祭坛 把身子 yRot 直接设成 body.yRot（盖掉 steveParts 里 twist 给的那份），这里和另两份一样是加上去；t 为 null 时不挥。
// - 2-末地 原地改传进来的部件表（steveParts 里身子和外套、手臂和袖子是同一个对象，改一处两层都跟着），这里返回新表、不动传进来的。
// - 2-第一晚 只在 t > 0 时挥；这里和 库/角色/挥手.ts 一样只在 0 < t < 1 时挥（t = 0、1 时原版算出来本来就是不挥的姿态）。
import type { PartPose } from '../../engine/model/实体模型.tsx';
import type { FigurePose } from './骨架.tsx';

const degPerRad = 180 / Math.PI;

/** 普通挥手几刻挥完（LivingEntity.getCurrentSwingDuration，没有急迫、挖掘疲劳时是 6） */
export const waveTicks = 6;

/** 挥手进度：距点击几秒 → attackTime（不在挥的时候是 0）。挥手刻数 可以换（急迫 6 − 级数、挖掘疲劳 6 + 2·级数） */
export const waveProgress = (sinceClickSec: number, tickCount = waveTicks) => {
  const t = (sinceClickSec * 20) / tickCount;
  return t > 0 && t < 1 ? t : 0;
};

export type SwingHand = '右' | '左';

/** 一次挥手在原版部件上的增量（弧度、像素），t = attackTime，头x = 头的 xRot（弧度） */
export const waveAmount = (t: number, headX: number, hand: SwingHand = '右') => {
  const bodyTwist = Math.sin(Math.sqrt(t) * Math.PI * 2) * 0.2 * (hand === '右' ? 1 : -1);
  const f = 1 - (1 - t) ** 4;
  const swing = Math.sin(f * Math.PI) * 1.2 + Math.sin(t * Math.PI) * -(headX - 0.7) * 0.75;
  const zOffset = Math.sin(t * Math.PI) * -0.4;
  const waveAmount = { x: -swing, y: bodyTwist * 2, z: zOffset };
  const rightRot: [number, number, number] = [0, bodyTwist, 0];
  const leftArmRot: [number, number, number] = [bodyTwist, bodyTwist, 0];
  const armVec = hand === '右' ? rightRot : leftArmRot;
  armVec[0] += waveAmount.x;
  armVec[1] += waveAmount.y;
  armVec[2] += waveAmount.z;
  return {
    bodyTwist,
    /** 两臂 [xRot, yRot, zRot] 的增量 */
    rightArm: rightRot,
    leftArm: leftArmRot,
    /** 两肩的 (x, z)（原版直接设，不是增量；y 不动） */
    rightShoulder: [-Math.cos(bodyTwist) * 5, Math.sin(bodyTwist) * 5] as const,
    leftShoulder: [Math.cos(bodyTwist) * 5, -Math.sin(bodyTwist) * 5] as const,
  };
};

const addRot = (a: readonly number[] | undefined, d: readonly number[]) => [0, 1, 2].map((i) => (a?.[i] ?? 0) + d[i]!);

/** 在原版部件表上叠一次挥手（t 不在 (0, 1) 里原样返回）。身子、外套共用一份，手臂、袖子共用一份；返回新表 */
export const waveParts = (poses: Readonly<Record<string, PartPose>>, t: number, hand: SwingHand = '右'): Record<string, PartPose> => {
  if (!(t > 0 && t < 1)) return { ...poses };
  const wave = waveAmount(t, poses.head?.rot?.[0] ?? 0, hand);
  const body: PartPose = { ...poses.body, rot: addRot(poses.body?.rot, [0, wave.bodyTwist, 0]) };
  const armPart = (p: PartPose | undefined, d: readonly number[], shoulderOffset: readonly [number, number]): PartPose => ({
    ...p,
    offset: [shoulderOffset[0], p?.offset?.[1] ?? 2, shoulderOffset[1]],
    rot: addRot(p?.rot, d),
  });
  const rightArm = armPart(poses.right_arm, wave.rightArm, wave.rightShoulder);
  const leftArm = armPart(poses.left_arm, wave.leftArm, wave.leftShoulder);
  return { ...poses, body: body, jacket: body, right_arm: rightArm, right_sleeve: rightArm, left_arm: leftArm, left_sleeve: leftArm };
};

/** 在 FigurePose 上叠一次右手挥手（t 不在 (0, 1) 里原样返回）。和 库/角色/挥手.ts 的 加挥手 一样 */
export const addWave = <P extends FigurePose>(pose: P, t: number): P => {
  if (!(t > 0 && t < 1)) return pose;
  const wave = waveAmount(t, (-pose.headPitch * Math.PI) / 180);
  return {
    ...pose,
    twist: (pose.twist ?? 0) - wave.bodyTwist * degPerRad,
    // FigurePose 的 armR 正 = 往前抬，和原版 xRot 反号；右臂已经跟着 twist 转了一份 身转，原版的三份只再加两份
    armR: pose.armR - wave.rightArm[0] * degPerRad,
    armRYaw: (pose.armRYaw ?? 0) - 2 * wave.bodyTwist * degPerRad,
    armRRoll: pose.armRRoll - wave.rightArm[2] * degPerRad,
    armL: pose.armL - wave.bodyTwist * degPerRad,
  };
};
