// 巫妖的权杖：暮色森林 4.3.2508 的暮色权杖（twilightforest:twilight_scepter），贴图照抄 jar（npm run 取材 -- 巫妖）。
// 巫妖第一阶段（带护盾、放影子分身那段，LichShadowsGoal）手里拿的就是它；死后掉落的四种权杖之一。
// 模型是 item/handheld（item/generated 挤出 1 像素厚，拿在手上斜着），1 格见方的贴图：杖身从左下到右上，紫黑色的宝珠在右上。
// 坐标：物品空间（单位格，中心在原点，贴图正面朝 +Z、上 = +Y）。
import React from 'react';
import { DISPLAY, HeldItem, ItemSprite } from '../../engine/model/物品贴图.tsx';
import { png } from '../../engine/model/贴图.ts';
import tex from 'asset:贴图/物品/巫妖权杖';

const LAYERS = [{ tex: png(tex) }];

export const TwilightScepter: React.FC<{ opacity?: number }> = ({ opacity }) => <ItemSprite layers={LAYERS} opacity={opacity} />;

// 拿在生物右手上（挂到 实体模型.tsx 的 attach.right_arm；照 ItemInHandLayer + handheld 的 thirdperson_righthand）
export const ScepterInHand: React.FC = () => (
  <HeldItem t={DISPLAY.handheld.thirdperson_righthand}>
    <TwilightScepter />
  </HeldItem>
);
