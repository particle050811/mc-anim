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

const 度 = 180 / Math.PI;

/** 普通挥手几刻挥完（LivingEntity.getCurrentSwingDuration，没有急迫、挖掘疲劳时是 6） */
export const 挥手刻数 = 6;

/** 挥手进度：距点击几秒 → attackTime（不在挥的时候是 0）。挥手刻数 可以换（急迫 6 − 级数、挖掘疲劳 6 + 2·级数） */
export const 挥手进度 = (距点击秒: number, 刻数 = 挥手刻数) => {
  const t = (距点击秒 * 20) / 刻数;
  return t > 0 && t < 1 ? t : 0;
};

export type 出手 = '右' | '左';

/** 一次挥手在原版部件上的增量（弧度、像素），t = attackTime，头x = 头的 xRot（弧度） */
export const 挥手量 = (t: number, 头x: number, 手: 出手 = '右') => {
  const 身转 = Math.sin(Math.sqrt(t) * Math.PI * 2) * 0.2 * (手 === '右' ? 1 : -1);
  const f = 1 - (1 - t) ** 4;
  const 甩 = Math.sin(f * Math.PI) * 1.2 + Math.sin(t * Math.PI) * -(头x - 0.7) * 0.75;
  const 收 = Math.sin(t * Math.PI) * -0.4;
  const 出 = { x: -甩, y: 身转 * 2, z: 收 };
  const 右: [number, number, number] = [0, 身转, 0];
  const 左: [number, number, number] = [身转, 身转, 0];
  const 臂 = 手 === '右' ? 右 : 左;
  臂[0] += 出.x;
  臂[1] += 出.y;
  臂[2] += 出.z;
  return {
    身转,
    /** 两臂 [xRot, yRot, zRot] 的增量 */
    右臂: 右,
    左臂: 左,
    /** 两肩的 (x, z)（原版直接设，不是增量；y 不动） */
    右肩: [-Math.cos(身转) * 5, Math.sin(身转) * 5] as const,
    左肩: [Math.cos(身转) * 5, -Math.sin(身转) * 5] as const,
  };
};

const 加 = (a: readonly number[] | undefined, d: readonly number[]) => [0, 1, 2].map((i) => (a?.[i] ?? 0) + d[i]!);

/** 在原版部件表上叠一次挥手（t 不在 (0, 1) 里原样返回）。身子、外套共用一份，手臂、袖子共用一份；返回新表 */
export const 挥手部件 = (部件: Readonly<Record<string, PartPose>>, t: number, 手: 出手 = '右'): Record<string, PartPose> => {
  if (!(t > 0 && t < 1)) return { ...部件 };
  const 量 = 挥手量(t, 部件.head?.rot?.[0] ?? 0, 手);
  const 身: PartPose = { ...部件.body, rot: 加(部件.body?.rot, [0, 量.身转, 0]) };
  const 臂 = (p: PartPose | undefined, d: readonly number[], 肩: readonly [number, number]): PartPose => ({
    ...p,
    offset: [肩[0], p?.offset?.[1] ?? 2, 肩[1]],
    rot: 加(p?.rot, d),
  });
  const 右 = 臂(部件.right_arm, 量.右臂, 量.右肩);
  const 左 = 臂(部件.left_arm, 量.左臂, 量.左肩);
  return { ...部件, body: 身, jacket: 身, right_arm: 右, right_sleeve: 右, left_arm: 左, left_sleeve: 左 };
};

/** 在 FigurePose 上叠一次右手挥手（t 不在 (0, 1) 里原样返回）。和 库/角色/挥手.ts 的 加挥手 一样 */
export const 加挥手 = <P extends FigurePose>(pose: P, t: number): P => {
  if (!(t > 0 && t < 1)) return pose;
  const 量 = 挥手量(t, (-pose.headPitch * Math.PI) / 180);
  return {
    ...pose,
    twist: (pose.twist ?? 0) - 量.身转 * 度,
    // FigurePose 的 armR 正 = 往前抬，和原版 xRot 反号；右臂已经跟着 twist 转了一份 身转，原版的三份只再加两份
    armR: pose.armR - 量.右臂[0] * 度,
    armRYaw: (pose.armRYaw ?? 0) - 2 * 量.身转 * 度,
    armRRoll: pose.armRRoll - 量.右臂[2] * 度,
    armL: pose.armL - 量.身转 * 度,
  };
};
