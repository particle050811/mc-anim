// 本片的史蒂夫（用户 11-10 定）：穿附魔的神灵金全套、右手拿断曜流光、头后戴晋升之环。人还是 库/角色/史蒂夫.tsx 的原版史蒂夫（模型、皮肤、姿势都用那边的），
// 这里只是照 Steve 组件的写法把装备挂到各部件上（Steve 不收 attach，所以外面那层 steveRootMatrix + EntityModel 在这里重写了一遍，要和那边保持一样）。
// 各件的出处见 物品/神灵金盔甲.tsx、物品/断曜流光.tsx、物品/晋升之环.tsx。姿势用 stevePose / steveLookAt，手里有剑时传 holdR: true。
// 神灵金套和剑默认用旧版外观（用户 11-10 定「用旧版本的，新版本建模很丑」；两套的来历见 物品/装备外观.ts），新版留着，传 外观: '新版' 切回；晋升之环只有一套。
// 剑也带附魔光效（用户 11-10 定「加一下附魔光泽」），和盔甲一起由 附魔 开关。
import React from 'react';
import { EntityModel } from '@engine/model/实体模型.tsx';
import { HeldItem } from '@engine/model/物品贴图.tsx';
import type { PartPose } from '@engine/model/实体模型.tsx';
import { STEVE_MODEL, STEVE_SKIN, type StevePose, steveParts, steveRootMatrix } from '@库/角色/史蒂夫.tsx';
import { 断曜流光, 断曜流光显示 } from '../物品/断曜流光.tsx';
import { 晋升之环 } from '../物品/晋升之环.tsx';
import { type 神灵金件, 神灵金全套, use神灵金盔甲 } from '../物品/神灵金盔甲.tsx';
import { 默认外观, type 装备外观 } from '../物品/装备外观.ts';

export type 史蒂夫装备 = {
  /** 穿哪几件神灵金甲，不给 = 全套，[] = 不穿 */
  盔甲?: readonly 神灵金件[];
  /** 盔甲和剑带不带附魔光泽，不给 = 带 */
  附魔?: boolean;
  /** 右手拿不拿断曜流光，不给 = 拿 */
  剑?: boolean;
  /** 戴不戴晋升之环，不给 = 戴 */
  环?: boolean;
  /** 神灵金套和剑用哪套外观，不给 = 旧版 */
  外观?: 装备外观;
  /** 右手换成别的东西（已经包好 HeldItem 的节点，比如弓）；给了就不画剑 */
  右手?: React.ReactNode;
  /** 左手拿的东西（已经包好 HeldItem left 的节点，比如盾、图腾） */
  左手?: React.ReactNode;
};

/** 秒：附魔光泽滚动、光环自转的时钟（段里传段内秒；游戏里这两样都按系统时间走，和人的动作无关）。
 *  改部件：steveParts 出来的原版部件表再改一道（举盾、拉弓、挥剑这类直接按原版部件转角写的姿势，见 角色/史蒂夫反应.ts）。
 *  受伤：原版受伤、死亡的变红 0～1，只红皮肤（原版盔甲层、手里的东西都不套受伤色） */
export const 装备史蒂夫: React.FC<{
  pose: StevePose;
  秒: number;
  装备?: 史蒂夫装备;
  改部件?: (部件: Record<string, PartPose>) => Record<string, PartPose>;
  受伤?: number;
}> = ({ pose, 秒, 装备 = {}, 改部件, 受伤 }) => {
  const { 盔甲 = 神灵金全套, 附魔 = true, 剑 = true, 环 = true, 外观 = 默认外观, 右手, 左手 } = 装备;
  const 甲 = use神灵金盔甲(盔甲, 附魔 ? 秒 : undefined, 外观);
  const attach: Record<string, React.ReactNode> = { ...甲 };
  if (环)
    attach.head = (
      <>
        {甲.head}
        <晋升之环 秒={秒} />
      </>
    );
  if (右手)
    attach.right_arm = (
      <>
        {甲.right_arm}
        {右手}
      </>
    );
  else if (剑)
    attach.right_arm = (
      <>
        {甲.right_arm}
        <HeldItem t={断曜流光显示[外观].thirdperson_righthand}>
          <断曜流光 外观={外观} 光泽秒={附魔 ? 秒 : undefined} />
        </HeldItem>
      </>
    );
  if (左手)
    attach.left_arm = (
      <>
        {甲.left_arm}
        {左手}
      </>
    );
  const 部件 = 改部件 ? 改部件(steveParts(pose)) : steveParts(pose);
  return (
    <group matrix={steveRootMatrix(pose)} matrixAutoUpdate={false}>
      <EntityModel model={STEVE_MODEL} tex={STEVE_SKIN} pose={部件} attach={attach} hurt={受伤} />
    </group>
  );
};
