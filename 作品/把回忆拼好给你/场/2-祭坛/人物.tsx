// 第 3 句的两个人：你（史蒂夫，站在两根前柱子之间，右手先拿御币、后拿蛋糕，每次右键挥一下手）和她（第三下拆盒以后站在圈心，低着头，「光」那一拍抬头看你的眼睛）。
// 挥手照原版 HumanoidModel.setupAttackAnimation（1.20.1，attackTime 0～1，6 刻挥完），叠在 库/角色/史蒂夫.tsx 的 steveParts 算好的部件上；
// 库里的 Steve 组件没有挥手，这里照它的画法自己挂（不改库，免得动到别的段的指纹）。
import React from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { EntityModel, type PartPose } from '@engine/model/实体模型.tsx';
import { DISPLAY, HeldItem, ItemSprite } from '@engine/model/物品贴图.tsx';
import { standPose, type FigurePose } from '@库/角色/骨架.tsx';
import { magicalWineFoxLookAt } from '@库/角色/魔法酒狐.tsx';
import { MagicalWineFoxEx, magicalWineFoxBoneAt, magicalWineFoxExBones, type 魔法酒狐新动作Props } from '@库/角色/魔法酒狐新动作组件.tsx';
import { STEVE_MODEL, STEVE_SKIN, steveLookAt, steveParts, stevePose, steveRootMatrix, type StevePose } from '@库/角色/史蒂夫.tsx';
import { CAKE } from '@库/物品/蛋糕.tsx';
import { 御币, 御币显示 } from './模型.tsx';
import * as 参 from './参数.ts';
import { 你朝向, 你看, 你眼, 她编排, 手里, 挥手进度, 末帧, 末机位, 秒, type 机 } from './编排.ts';

type 部件表 = Record<string, PartPose>;
const 转 = (p: PartPose | undefined) => (p?.rot ?? [0, 0, 0]) as [number, number, number];

/** 原版挥手：attackTime t 时身子、两臂的转角和两肩的位置（右手挥） */
export const 挥手部件 = (部件: 部件表, t: number | null): 部件表 => {
  if (t === null) return 部件;
  const 身转 = Math.sin(Math.sqrt(t) * Math.PI * 2) * 0.2;
  const [hx] = 转(部件.head);
  const [bx, , bz] = 转(部件.body);
  const 右 = 部件.right_arm!, 左 = 部件.left_arm!;
  const [rx, ry, rz] = 转(右);
  const [lx, ly, lz] = 转(左);
  const f = 1 - (1 - t) ** 4;
  const f1 = Math.sin(f * Math.PI);
  const f2 = Math.sin(t * Math.PI) * -(hx - 0.7) * 0.75;
  const 身: PartPose = { ...部件.body, rot: [bx, 身转, bz] };
  const 右臂: PartPose = {
    ...右,
    offset: [-Math.cos(身转) * 5, 右.offset?.[1] ?? 2, Math.sin(身转) * 5],
    rot: [rx - (f1 * 1.2 + f2), ry + 身转 + 身转 * 2, rz + Math.sin(t * Math.PI) * -0.4],
  };
  const 左臂: PartPose = { ...左, offset: [Math.cos(身转) * 5, 左.offset?.[1] ?? 2, -Math.sin(身转) * 5], rot: [lx + 身转, ly + 身转, lz] };
  return { ...部件, body: 身, jacket: 身, right_arm: 右臂, right_sleeve: 右臂, left_arm: 左臂, left_sleeve: 左臂 };
};

/** 你这一帧的姿势：站在 参.你.脚、身子对着圈心、头看着 你看；右手拿着东西（ArmPose.ITEM）。不给 sec：两臂的轻晃停在 0 那一刻 */
export const 你姿势 = (g: number): StevePose => steveLookAt(stevePose([...参.你.脚] as V3, 你朝向, { holdR: 手里(g) !== null }), 你看, false);

export const 你: React.FC<{ g: number }> = ({ g }) => {
  const pose = 你姿势(g);
  const 部件 = 挥手部件(steveParts(pose), 挥手进度(g));
  const 拿 = 手里(g);
  const attach: Record<string, React.ReactNode> = {};
  if (拿 === '御币')
    attach.right_arm = (
      <HeldItem t={御币显示}>
        <御币 />
      </HeldItem>
    );
  if (拿 === '蛋糕')
    attach.right_arm = (
      <HeldItem t={DISPLAY.generated.thirdperson_righthand}>
        <ItemSprite layers={CAKE} />
      </HeldItem>
    );
  return (
    <group matrix={steveRootMatrix(pose)} matrixAutoUpdate={false}>
      <EntityModel model={STEVE_MODEL} tex={STEVE_SKIN} pose={部件} attach={attach} />
    </group>
  );
};

// ---------- 她 ----------
export const 她姿势: FigurePose = { ...standPose([...参.她.脚]), yaw: 参.她.朝向 };
/** 抬起头以后看你眼睛的 [俯仰, 左右] */
export const 她看你 = magicalWineFoxLookAt(她姿势, 你眼, '站');

const 她属性 = (g: number): 魔法酒狐新动作Props | null => {
  const 编 = 她编排(g);
  if (!编) return null;
  const 看: [number, number] = [参.低头.俯仰 + (她看你[0] - 参.低头.俯仰) * 编.抬, 她看你[1]];
  // 不眨眼：最后一帧要两只眼睛睁着接第 4 句的眼睛特写；背后的法杖不画（同第 8 句门口）
  return { pose: 她姿势, 姿势: '站', 表情: 编.表情, 看, 眨眼: 0, 秒: 秒(g), 背后法杖: false };
};

export const 她: React.FC<{ g: number }> = ({ g }) => {
  const p = 她属性(g);
  return p ? <MagicalWineFoxEx {...p} /> : null;
};

/** 她两只眼睛的中点（场景坐标），按第 g 帧的姿势算 */
export const 她眼中 = (g: number): V3 => {
  const p = 她属性(g);
  if (!p) throw new Error(`第 ${g} 帧她还没出来`);
  const 表 = magicalWineFoxExBones(p);
  const r = magicalWineFoxBoneAt(她姿势, 表, 'ysmGlowRightEyePublic');
  const l = magicalWineFoxBoneAt(她姿势, 表, 'ysmGlowLeftEyePublic');
  return [(r[0] + l[0]) / 2, (r[1] + l[1]) / 2, (r[2] + l[2]) / 2];
};

/** 最后一帧的机位：在她两眼中点前面、沿她看你眼睛的那条线 */
export const 末机 = ((): 机 => {
  const 中 = 她眼中(末帧);
  const d = [你眼[0] - 中[0], 你眼[1] - 中[1], 你眼[2] - 中[2]];
  const l = Math.hypot(d[0]!, d[1]!, d[2]!);
  return 末机位(中, [d[0]! / l, d[1]! / l, d[2]! / l]);
})();
