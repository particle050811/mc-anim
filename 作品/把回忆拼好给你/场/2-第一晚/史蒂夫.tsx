// 第一晚的史蒂夫：库/角色/史蒂夫.tsx 的原版玩家模型，再加一样那边没有的原版动作（不改库，在这里包一层）：
// 出手（挥手）：HumanoidModel.setupAttackAnimation（1.20.1）。身子 yRot = sin(√t·2π)·0.2，两臂转轴跟着身子绕中线转（x = ∓cos·5、z = ±sin·5），
//   两臂 yRot、左臂 xRot 加身子的 yRot；出手那只（右）臂 xRot −= sin((1 − (1 − t)⁴)·π)·1.2 + sin(tπ)·−(头 xRot − 0.7)·0.75、yRot 再加两倍身子 yRot、
//   zRot += sin(tπ)·−0.4。出手进度由段的编排算（挖方块时每 4 刻重挥一次）。出手 0 时和 库 的 Steve 画出来一样（2-初入 接过来不跳）。
// 手里的泥土是方块物品：block/block.json 的第三人称右手显示变换（rotation 75, 45, 0；translation 0, 2.5, 0；scale 0.375）。
import React from 'react';
import { EntityModel, type PartPose } from '@engine/model/实体模型.tsx';
import { HeldItem, type ItemTransform } from '@engine/model/物品贴图.tsx';
import { STEVE_MODEL, STEVE_SKIN, type StevePose, steveParts, steveRootMatrix } from '@库/角色/史蒂夫.tsx';
import { 泥土块 } from './泥土块.tsx';

/** block/block.json 的 thirdperson_righthand */
export const 方块第三人称: ItemTransform = { rotation: [75, 45, 0], translation: [0, 2.5, 0], scale: [0.375, 0.375, 0.375] };

/** 原版各部件 + 出手（t 0～1，0 = 不挥）；右手出手 */
export const 挥手部件 = (pose: StevePose, t: number): Record<string, PartPose> => {
  const p = steveParts(pose);
  if (!(t > 0)) return p;
  const 加 = (a: number[] | undefined, d: readonly number[]) => (a ?? [0, 0, 0]).map((v, i) => v + d[i]!);
  const by = Math.sin(Math.sqrt(t) * Math.PI * 2) * 0.2;
  const 头x = p.head!.rot![0]!;
  let f = 1 - t;
  f = 1 - f * f * f * f;
  const f1 = Math.sin(f * Math.PI);
  const f2 = Math.sin(t * Math.PI) * -(头x - 0.7) * 0.75;
  const body = { ...p.body, rot: 加(p.body!.rot, [0, by, 0]) };
  const 右y = p.right_arm!.offset![1]!;
  const 左y = p.left_arm!.offset![1]!;
  const right_arm = { ...p.right_arm, offset: [-Math.cos(by) * 5, 右y, Math.sin(by) * 5], rot: 加(p.right_arm!.rot, [-(f1 * 1.2 + f2), by + by * 2, Math.sin(t * Math.PI) * -0.4]) };
  const left_arm = { ...p.left_arm, offset: [Math.cos(by) * 5, 左y, -Math.sin(by) * 5], rot: 加(p.left_arm!.rot, [by, by, 0]) };
  return { ...p, body, jacket: body, right_arm, right_sleeve: right_arm, left_arm, left_sleeve: left_arm };
};

export const 第一晚史蒂夫: React.FC<{
  pose: StevePose;
  /** 出手进度 0～1 */
  出手?: number;
  /** 右手拿着一块泥土 */
  拿土?: boolean;
}> = ({ pose, 出手 = 0, 拿土 = false }) => {
  const attach: Record<string, React.ReactNode> = 拿土
    ? {
        right_arm: (
          <HeldItem t={方块第三人称}>
            <泥土块 />
          </HeldItem>
        ),
      }
    : {};
  return (
    <group matrix={steveRootMatrix(pose)} matrixAutoUpdate={false}>
      <EntityModel model={STEVE_MODEL} tex={STEVE_SKIN} pose={挥手部件(pose, 出手)} attach={attach} />
    </group>
  );
};
