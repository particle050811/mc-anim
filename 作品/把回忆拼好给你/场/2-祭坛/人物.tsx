// 第 3 句的两个人：你（史蒂夫，站在她右前方，右手远景里拿御币、切到近景已经拿着蛋糕（立体蛋糕方块，用户 11-02 要），每次右键挥一下手）和她（现身就站在圈心看着你的眼睛，
// 推眼睛那一拍稍后转过来正对镜头，最后一帧是 末态.ts 的 末她）。
// 拿御币点祭坛是演绎（三稿）：原版放上最后一样材料就自动合成，御币只用来搭祭坛，见 编排.ts 的 点击帧们。
// 挥手照原版 HumanoidModel.setupAttackAnimation（1.20.1，attackTime 0～1，6 刻挥完），叠在 库/角色/史蒂夫.tsx 的 steveParts 算好的部件上；
// 库里的 Steve 组件没有挥手，这里照它的画法自己挂（不改库，免得动到别的段的指纹）。
import React from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { EntityModel, type PartPose } from '@engine/model/实体模型.tsx';
import { HeldItem } from '@engine/model/物品贴图.tsx';
import { standPose, type FigurePose } from '@库/角色/骨架.tsx';
import { magicalWineFoxLookAt } from '@库/角色/魔法酒狐.tsx';
import { MagicalWineFoxEx, type MagicalWineFoxExProps } from '@库/角色/魔法酒狐新动作组件.tsx';
import { STEVE_MODEL, STEVE_SKIN, steveLookAt, steveParts, stevePose, steveRootMatrix, type StevePose } from '@库/角色/史蒂夫.tsx';
import { blockDisplay, CakeBlock } from '@库/物品/蛋糕方块.tsx';
import { Gohei, goheiDisplay } from './模型.tsx';
import * as params from './参数.ts';
import { youFacing, youLook, youEyePos, CharArrange, HandItem, waveProgress, toSec } from './编排.ts';
import { liYingFinal } from './末态.ts';

type PartTable = Record<string, PartPose>;
const rotationOf = (p: PartPose | undefined) => (p?.rot ?? [0, 0, 0]) as [number, number, number];

/** 原版挥手：attackTime t 时身子、两臂的转角和两肩的位置（右手挥） */
export const waveParts = (poses: PartTable, t: number | null): PartTable => {
  if (t === null) return poses;
  const bodyTwist = Math.sin(Math.sqrt(t) * Math.PI * 2) * 0.2;
  const [hx] = rotationOf(poses.head);
  const [bx, , bz] = rotationOf(poses.body);
  const origRightArm = poses.right_arm!, origLeftArm = poses.left_arm!;
  const [rx, ry, rz] = rotationOf(origRightArm);
  const [lx, ly, lz] = rotationOf(origLeftArm);
  const f = 1 - (1 - t) ** 4;
  const f1 = Math.sin(f * Math.PI);
  const f2 = Math.sin(t * Math.PI) * -(hx - 0.7) * 0.75;
  const body: PartPose = { ...poses.body, rot: [bx, bodyTwist, bz] };
  const rightArm: PartPose = {
    ...origRightArm,
    offset: [-Math.cos(bodyTwist) * 5, origRightArm.offset?.[1] ?? 2, Math.sin(bodyTwist) * 5],
    rot: [rx - (f1 * 1.2 + f2), ry + bodyTwist + bodyTwist * 2, rz + Math.sin(t * Math.PI) * -0.4],
  };
  const leftArm: PartPose = { ...origLeftArm, offset: [Math.cos(bodyTwist) * 5, origLeftArm.offset?.[1] ?? 2, -Math.sin(bodyTwist) * 5], rot: [lx + bodyTwist, ly + bodyTwist, lz] };
  return { ...poses, body: body, jacket: body, right_arm: rightArm, right_sleeve: rightArm, left_arm: leftArm, left_sleeve: leftArm };
};

/** 你这一帧的姿势：站在 参.你.脚、身子对着圈心、头看着 你看；右手拿着东西（ArmPose.ITEM）。不给 sec：两臂的轻晃停在 0 那一刻 */
export const youPose = (g: number): StevePose => steveLookAt(stevePose([...params.you.feet] as V3, youFacing, { holdR: HandItem(g) !== null }), youLook, false);

export const You: React.FC<{ g: number }> = ({ g }) => {
  const pose = youPose(g);
  const poses = waveParts(steveParts(pose), waveProgress(g));
  const held = HandItem(g);
  const attach: Record<string, React.ReactNode> = {};
  if (held === '御币')
    attach.right_arm = (
      <HeldItem t={goheiDisplay}>
        <Gohei />
      </HeldItem>
    );
  if (held === '蛋糕')
    attach.right_arm = (
      <HeldItem t={blockDisplay.thirdperson_righthand}>
        <CakeBlock />
      </HeldItem>
    );
  return (
    <group matrix={steveRootMatrix(pose)} matrixAutoUpdate={false}>
      <EntityModel model={STEVE_MODEL} tex={STEVE_SKIN} pose={poses} attach={attach} />
    </group>
  );
};

// ---------- 她 ----------
export const liYingPose: FigurePose = { ...standPose([...params.liYing.feet]), yaw: params.liYing.facing };
/** 看你眼睛的 [俯仰, 左右] */
export const liYingLooksAtYou = magicalWineFoxLookAt(liYingPose, youEyePos, '站');

/** 她这一帧的属性（还没现身 = null）。看：现身就看着你 → 转过来正对镜头 */
export const magicalWineFoxProps = (g: number): MagicalWineFoxExProps | null => {
  const choreo = CharArrange(g);
  if (!choreo) return null;
  const gaze: [number, number] = [liYingLooksAtYou[0] + (liYingFinal.看[0] - liYingLooksAtYou[0]) * choreo.转, liYingLooksAtYou[1] + (liYingFinal.看[1] - liYingLooksAtYou[1]) * choreo.转];
  // 不眨眼：最后一帧要两只眼睛睁着接第 4 句的眼睛特写；背后的法杖不画（同第 8 句门口）
  return { pose: liYingPose, stancePose: '站', expression: choreo.expression, 看: gaze, blink: 0, 秒: toSec(g), backStaff: false };
};

export const LiYing: React.FC<{ g: number }> = ({ g }) => {
  const p = magicalWineFoxProps(g);
  return p ? <MagicalWineFoxEx {...p} /> : null;
};
