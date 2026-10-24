// 第 5 句的两个人：她（魔法酒狐新动作版，按 编排.ts 的 她态 摆）、你（原版玩家模型，会潜行、会挥手点龙蛋）。各包一组描边。
// 挥手照 1.20.1 HumanoidModel.setupAttackAnimation（右手、attackTime 6 刻 0→1）：身子绕竖轴扭 sin(√t·2π)×0.2，两肩跟着身子转，
// 右臂往前上甩 sin((1−(1−t)⁴)·π)×1.2 + sin(t·π)×(0.7 − 头的俯仰)×0.75、再往里收 sin(t·π)×0.4。转角加在 steveParts 换算好的原版部件转角上（原版也是在 xRot、yRot、zRot 上直接加）。
// 透视机位不做贴图像素对齐（对齐.tsx：透视只缩放不吸附，这一镜不缩放）。
import React from 'react';
import { 描边 } from '@engine/三渲二/描边.tsx';
import type { PartPose } from '@engine/model/实体模型.tsx';
import { EntityModel } from '@engine/model/实体模型.tsx';
import { STEVE_MODEL, STEVE_SKIN, steveLookAt, steveParts, stevePose, steveRootMatrix, type StevePose } from '@库/角色/史蒂夫.tsx';
import { MagicalWineFoxEx } from '@库/角色/魔法酒狐新动作组件.tsx';
import type { 她态, 你态 } from './编排.ts';

/** 在原版部件转角上叠挥手（右手） */
const 叠挥手 = (parts: Record<string, PartPose>, t: number) => {
  const 身 = parts.body!, 右 = parts.right_arm!, 左 = parts.left_arm!, 头 = parts.head!;
  const by = Math.sin(Math.sqrt(t) * Math.PI * 2) * 0.2;
  身.rot = [身.rot![0]!, 身.rot![1]! + by, 身.rot![2]!];
  右.offset = [-Math.cos(by) * 5, 右.offset![1]!, Math.sin(by) * 5];
  左.offset = [Math.cos(by) * 5, 左.offset![1]!, -Math.sin(by) * 5];
  const f = 1 - (1 - t) ** 4;
  const f1 = Math.sin(f * Math.PI);
  const f2 = Math.sin(t * Math.PI) * -(头.rot![0]! - 0.7) * 0.75;
  右.rot = [右.rot![0]! - (f1 * 1.2 + f2), 右.rot![1]! + by + by * 2, 右.rot![2]! + Math.sin(t * Math.PI) * -0.4];
  左.rot = [左.rot![0]! + by, 左.rot![1]! + by, 左.rot![2]!];
};

/** 史蒂夫，挥：attackTime（null = 没在挥） */
export const 挥手史蒂夫: React.FC<{ pose: StevePose; 挥: number | null }> = ({ pose, 挥 }) => {
  const parts = steveParts(pose);
  if (挥 !== null) {
    // steveParts 里 body 和 jacket、right_arm 和 right_sleeve 是同一个对象，改一处两层都跟着
    叠挥手(parts, 挥);
  }
  return (
    <group matrix={steveRootMatrix(pose)} matrixAutoUpdate={false}>
      <EntityModel model={STEVE_MODEL} tex={STEVE_SKIN} pose={parts} />
    </group>
  );
};

export const 你的姿势 = (s: 你态): StevePose => steveLookAt(stevePose(s.loc, s.yaw, { crouch: s.蹲, sec: s.秒 }), s.看, true);

export const 末地角色: React.FC<{ 她: 她态; 你: 你态; 描边?: boolean }> = ({ 她, 你, 描边: 描 = true }) => (
  <>
    <描边 开={描}>
      <挥手史蒂夫 pose={你的姿势(你)} 挥={你.挥} />
    </描边>
    <描边 开={描}>
      <MagicalWineFoxEx
        pose={她.pose}
        姿势={她.姿势}
        表情={她.表情}
        看向={她.看向}
        骨骼={她.骨骼}
        眨眼={她.眨眼}
        秒={她.秒}
        背后法杖={false}
      />
    </描边>
  </>
);
