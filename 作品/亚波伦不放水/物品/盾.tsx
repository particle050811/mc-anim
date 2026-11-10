// 原版盾牌（minecraft:shield，没贴旗帜）：史蒂夫副手举盾用。照 1.20.1 client jar：
// - 形状：ShieldModel.createLayer（javap 读的）：plate 方盒 (−6, −11, −2) 起 12×22×1、texOffs(0, 0)；handle 方盒 (−1, −3, −1) 起 2×6×6、texOffs(26, 0)；贴图 64×64。
// - 贴图：没旗帜时 BlockEntityWithoutLevelRenderer.renderByItem 用 entity/shield_base_nopattern。
// - 摆法：物品模型是 builtin/entity，ItemRenderer 套完 display 后平移 (−0.5, −0.5, −0.5)，renderByItem 里再 scale(1, −1, −1)，模型原点落在物品方格的角上。
// - display：models/item/shield.json；举着挡（blocking = 1）换 models/item/shield_blocking.json，只有手里的变换不一样。
// 坐标：物品空间（中心在原点，上 +Y，正面 +Z，单位格），挂手上用 HeldItem + 盾显示。
import React from 'react';
import type { ItemTransform } from '@engine/model/物品贴图.tsx';
import { png } from '@engine/model/贴图.ts';
import { TexBox } from '@engine/model/贴图方盒.tsx';
import 盾图 from 'asset:贴图/法术/minecraft/entity/shield_base_nopattern';

export const 盾显示 = {
  平时: {
    thirdperson_righthand: { rotation: [0, 90, 0], translation: [10, 6, -4], scale: [1, 1, 1] },
    thirdperson_lefthand: { rotation: [0, 90, 0], translation: [10, 6, 12], scale: [1, 1, 1] },
    ground: { rotation: [0, 0, 0], translation: [2, 4, 2], scale: [0.25, 0.25, 0.25] },
    gui: { rotation: [15, -25, -5], translation: [2, 3, 0], scale: [0.65, 0.65, 0.65] },
  },
  举盾: {
    thirdperson_righthand: { rotation: [45, 135, 0], translation: [3.51, 11, -2], scale: [1, 1, 1] },
    thirdperson_lefthand: { rotation: [45, 135, 0], translation: [13.51, 3, 5], scale: [1, 1, 1] },
  },
} satisfies Record<string, Record<string, ItemTransform>>;

/** 物品空间里的盾。TexBox 用实体坐标（X = 模型 x、Y = 模型 z、Z = −模型 y），绕 X 转 −90 度正好是 renderByItem 的 scale(1, −1, −1) 之后的朝向 */
export const 盾: React.FC = () => {
  const 图 = png(盾图);
  return (
    <group position={[-0.5, -0.5, -0.5]} rotation={[-Math.PI / 2, 0, 0]}>
      <TexBox tex={图} px={[12, 22, 1]} uv={[0, 0]} s={[12 / 16, 1 / 16, 22 / 16]} p={[0, -1.5 / 16, 0]} />
      <TexBox tex={图} px={[2, 6, 6]} uv={[26, 0]} s={[2 / 16, 6 / 16, 6 / 16]} p={[0, 2 / 16, 0]} />
    </group>
  );
};
