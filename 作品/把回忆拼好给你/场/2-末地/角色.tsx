// 第 5 句的两个人：她（魔法酒狐新动作版，按 编排.ts 的 她态 摆）、你（原版玩家模型，站着挥手点龙蛋）。各包一组描边（开不开由 镜头.tsx 照 画风.ts 给，全片关）。
// 挥手照 1.20.1 HumanoidModel.setupAttackAnimation（右手、attackTime 6 刻 0→1）：身子绕竖轴扭 sin(√t·2π)×0.2，两肩跟着身子转，
// 右臂往前上甩 sin((1−(1−t)⁴)·π)×1.2 + sin(t·π)×(0.7 − 头的俯仰)×0.75、再往里收 sin(t·π)×0.4。转角加在 steveParts 换算好的原版部件转角上（原版也是在 xRot、yRot、zRot 上直接加）。
// 透视机位不做贴图像素对齐（对齐.tsx：透视只缩放不吸附，这一镜不缩放）。
import React from 'react';
import { Outline } from '@engine/三渲二/描边.tsx';
import type { PartPose } from '@engine/model/实体模型.tsx';
import { EntityModel } from '@engine/model/实体模型.tsx';
import { STEVE_MODEL, STEVE_SKIN, steveLookAt, steveParts, stevePose, steveRootMatrix, type StevePose } from '@库/角色/史蒂夫.tsx';
import { MagicalWineFoxEx } from '@库/角色/魔法酒狐新动作组件.tsx';
import type { LiYingState, YouState } from './编排.ts';

/** 在原版部件转角上叠挥手（右手） */
const addWave = (parts: Record<string, PartPose>, t: number) => {
  const body = parts.body!, rightArm = parts.right_arm!, leftArm = parts.left_arm!, headPart = parts.head!;
  const by = Math.sin(Math.sqrt(t) * Math.PI * 2) * 0.2;
  body.rot = [body.rot![0]!, body.rot![1]! + by, body.rot![2]!];
  rightArm.offset = [-Math.cos(by) * 5, rightArm.offset![1]!, Math.sin(by) * 5];
  leftArm.offset = [Math.cos(by) * 5, leftArm.offset![1]!, -Math.sin(by) * 5];
  const f = 1 - (1 - t) ** 4;
  const f1 = Math.sin(f * Math.PI);
  const f2 = Math.sin(t * Math.PI) * -(headPart.rot![0]! - 0.7) * 0.75;
  rightArm.rot = [rightArm.rot![0]! - (f1 * 1.2 + f2), rightArm.rot![1]! + by + by * 2, rightArm.rot![2]! + Math.sin(t * Math.PI) * -0.4];
  leftArm.rot = [leftArm.rot![0]! + by, leftArm.rot![1]! + by, leftArm.rot![2]!];
};

/** 史蒂夫，挥：attackTime（null = 没在挥） */
export const WaveSteve: React.FC<{ pose: StevePose; wave: number | null }> = ({ pose, wave }) => {
  const parts = steveParts(pose);
  if (wave !== null) {
    // steveParts 里 body 和 jacket、right_arm 和 right_sleeve 是同一个对象，改一处两层都跟着
    addWave(parts, wave);
  }
  return (
    <group matrix={steveRootMatrix(pose)} matrixAutoUpdate={false}>
      <EntityModel model={STEVE_MODEL} tex={STEVE_SKIN} pose={parts} />
    </group>
  );
};

export const youPose = (s: YouState): StevePose => steveLookAt(stevePose(s.loc, s.yaw, { sec: s.秒 }), s.看, true);

export const EndCharacter: React.FC<{ liYing: LiYingState; 你: YouState; outline?: boolean }> = ({ liYing, 你: you, outline: outline = true }) => (
  <>
    <Outline 开={outline}>
      <WaveSteve pose={youPose(you)} wave={you.wave} />
    </Outline>
    <Outline 开={outline}>
      <MagicalWineFoxEx
        pose={liYing.pose}
        stancePose={liYing.poseName}
        expression={liYing.expression}
        lookAt={liYing.lookAt}
        看={liYing.看}
        skeleton={liYing.skeleton}
        blink={liYing.blink}
        秒={liYing.秒}
        backStaff={false}
      />
    </Outline>
  </>
);
