// 喷溅型治疗药水：原版 1.20.1 的 splash_potion（item/generated 两层：layer0 = potion_overlay 按药水颜色染色，layer1 = splash_potion 瓶身），
// 贴图照抄 client jar（npm run 取材 -- 药水）。治疗药水的颜色取 MobEffects.HEAL 的颜色 16262179 = #F82423。
// 扔出去时游戏用 ThrownItemRenderer 按 GROUND 显示：item/generated 的 ground 缩放 0.5 → 半格大的一张贴片。
// 坐标：物品空间（单位格，中心在原点，贴图正面朝 +Z、上 = +Y）。
import React from 'react';
import { DISPLAY, ItemDisplay, ItemSprite } from '../../engine/model/物品贴图.tsx';
import { pngDir } from '../../engine/model/贴图.ts';
import { 资产目录 } from '../../engine/core/资产目录.ts';
import 资_0 from 'asset:贴图/物品/喷溅药水/bottle';
import 资_1 from 'asset:贴图/物品/喷溅药水/overlay';

const TEXTURES = pngDir(资产目录({ './bottle.png': 资_0, './overlay.png': 资_1 }));
export const HEALING_COLOR = '#F82423';
const LAYERS = [{ tex: TEXTURES.overlay, tint: HEALING_COLOR }, { tex: TEXTURES.bottle }];
export const POTION_TEX = TEXTURES;

export const SplashPotion: React.FC<{ opacity?: number }> = ({ opacity }) => <ItemSprite layers={LAYERS} opacity={opacity} />;

// 飞行中的药水（GROUND 显示：半格大）
export const ThrownSplashPotion: React.FC<{ opacity?: number }> = ({ opacity }) => (
  <ItemDisplay t={{ ...DISPLAY.generated.ground, translation: [0, 0, 0] }}>
    <SplashPotion opacity={opacity} />
  </ItemDisplay>
);
