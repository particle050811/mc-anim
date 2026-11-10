// 本片的史蒂夫（用户 11-10 定）：穿附魔的神灵金全套、右手拿断曜流光、头后戴晋升之环。人还是 库/角色/史蒂夫.tsx 的原版史蒂夫（模型、皮肤、姿势都用那边的），
// 这里只是照 Steve 组件的写法把装备挂到各部件上（Steve 不收 attach，所以外面那层 steveRootMatrix + EntityModel 在这里重写了一遍，要和那边保持一样）。
// 各件的出处见 物品/神灵金盔甲.tsx、物品/断曜流光.tsx、物品/晋升之环.tsx。姿势用 stevePose / steveLookAt，手里有剑时传 holdR: true。
// 取的默认：剑不加附魔光效（用户原话「附魔」说的是神灵金套；剑要不要附魔等用户定）。
import React from 'react';
import { EntityModel } from '@engine/model/实体模型.tsx';
import { HeldItem } from '@engine/model/物品贴图.tsx';
import { STEVE_MODEL, STEVE_SKIN, type StevePose, steveParts, steveRootMatrix } from '@库/角色/史蒂夫.tsx';
import { 断曜流光, 断曜流光显示 } from '../物品/断曜流光.tsx';
import { 晋升之环 } from '../物品/晋升之环.tsx';
import { type 神灵金件, 神灵金全套, use神灵金盔甲 } from '../物品/神灵金盔甲.tsx';

export type 史蒂夫装备 = {
  /** 穿哪几件神灵金甲，不给 = 全套，[] = 不穿 */
  盔甲?: readonly 神灵金件[];
  /** 盔甲带不带附魔光泽，不给 = 带 */
  附魔?: boolean;
  /** 右手拿不拿断曜流光，不给 = 拿 */
  剑?: boolean;
  /** 戴不戴晋升之环，不给 = 戴 */
  环?: boolean;
};

/** 秒：附魔光泽滚动、光环自转的时钟（段里传段内秒；游戏里这两样都按系统时间走，和人的动作无关） */
export const 装备史蒂夫: React.FC<{ pose: StevePose; 秒: number; 装备?: 史蒂夫装备 }> = ({ pose, 秒, 装备 = {} }) => {
  const { 盔甲 = 神灵金全套, 附魔 = true, 剑 = true, 环 = true } = 装备;
  const 甲 = use神灵金盔甲(盔甲, 附魔 ? 秒 : undefined);
  const attach: Record<string, React.ReactNode> = { ...甲 };
  if (环)
    attach.head = (
      <>
        {甲.head}
        <晋升之环 秒={秒} />
      </>
    );
  if (剑)
    attach.right_arm = (
      <>
        {甲.right_arm}
        <HeldItem t={断曜流光显示.thirdperson_righthand}>
          <断曜流光 />
        </HeldItem>
      </>
    );
  return (
    <group matrix={steveRootMatrix(pose)} matrixAutoUpdate={false}>
      <EntityModel model={STEVE_MODEL} tex={STEVE_SKIN} pose={steveParts(pose)} attach={attach} />
    </group>
  );
};
