// 模型的关键帧动作（HierarchicalModel.animate 那套）落到 模型件 的 姿态 上：从模型的初始姿态起，把几段动画各自播到的时刻加上去。
// 播法在 @engine/anim/关键帧动画.ts（照 1.20.1 的 KeyframeAnimations.animate）；动画数据是 anim extract 导出的（已换算），
// 或者照源码抄的短动画：抄的时候 posVec(x, y, z) 记成 [x, −y, z]，scaleVec(x, y, z) 记成 [x − 1, y − 1, z − 1]，degreeVec 换成弧度。
import { applyAnimation, restPose, toPartPoses, type AnimDef } from '@engine/anim/关键帧动画.ts';
import type { EntityModelData, PartPose } from '@engine/model/实体模型.tsx';

export type { AnimDef };

/** 取 import raw from 'asset:动画/法术/goety/<类名>' 里的一段 */
export const 取动画 = (raw: unknown, 名: string): AnimDef => {
  const 动画 = (raw as { animations?: Record<string, AnimDef> }).animations?.[名];
  if (!动画) throw new Error(`动画 json 里没有 ${名}`);
  return 动画;
};

/** 播们：[动画, 已经播了几秒]；秒 < 0 的（AnimationState 还没 start）跳过 */
export const 关键帧姿态 = (模型: EntityModelData, 播们: readonly (readonly [AnimDef, number])[]): Record<string, PartPose> => {
  const 姿 = restPose(模型.root);
  for (const [动画, 秒] of 播们) if (秒 >= 0) applyAnimation(姿, 动画, 秒);
  return toPartPoses(姿);
};
