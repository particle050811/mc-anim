// 断曜流光：启示录的 goety_revelation:valettein（zh_cn「断曜流光」），史蒂夫手里的剑（用户 11-10 定）。
// 游戏里（反编译）：ValetteinItem extends ModSwordItem extends SwordItem，没有自己的渲染器、没有 isFoil 重写，拿在手上走原版 ItemInHandLayer。
// 模型 models/item/valettein.json 是 forge:separate_transforms：手里、地上用 valettein_normal（Blockbench 元素模型，58 个元素的 rotation 角度都是 0，64×64 贴图，
// 是一片 0.25 像素厚的薄片：x 5.25～10.5、y −0.25～19.5、z 8～8.25），物品栏用 valettein_gui（item/generated 的平面图标）。
// 这里的 3D 模型是 valettein_normal 原样导出（配方「亚波伦史蒂夫装备」），display 照 json 抄。变形外观（transform/）没取。
// 坐标：物品空间（单位格，原点 = 模型 (8, 8, 8)，Y 朝上，游戏的北 = −Z）。
import type { FC } from 'react';
import { BlockModel, type BlockModelData } from '@engine/model/方块模型.tsx';
import { ItemSprite, type ItemTransform } from '@engine/model/物品贴图.tsx';
import { png } from '@engine/model/贴图.ts';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import 数据 from 'asset:模型/物品/断曜流光';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import 图集 from 'asset:贴图/物品/断曜流光';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import 图标 from 'asset:贴图/物品/断曜流光.图标';

const 模型 = 数据 as unknown as BlockModelData;

/** models/item/valettein_normal.json 的 display */
export const 断曜流光显示 = {
  thirdperson_righthand: { rotation: [0, 90, 0], translation: [-0.25, 7.5, 1.5], scale: [1.8, 1.8, 1.8] },
  thirdperson_lefthand: { rotation: [0, -90, 0], translation: [0.25, 7.5, 1.5], scale: [1.8, 1.8, 1.8] },
  firstperson_righthand: { rotation: [10, 90, 0], translation: [-0.5, 4, 1.75] },
  firstperson_lefthand: { rotation: [15, -90, 0], translation: [-0.25, 4, 1.75] },
  ground: { rotation: [0, 0, -46], translation: [0, 1, 0], scale: [0.8, 0.8, 0.76] },
  gui: { rotation: [0, 0, -45], translation: [0, -1.5, 0], scale: [0.9, 0.9, 0.9] },
  fixed: { rotation: [0, 0, -45], translation: [0, -1.5, 0] },
} satisfies Record<string, ItemTransform>;

// BlockModel 的坐标是 游戏的上 = +Z、游戏的北 = +Y，绕 X 转 −90 度换回物品空间
export const 断曜流光: FC = () => (
  <group rotation={[-Math.PI / 2, 0, 0]}>
    <BlockModel data={模型} atlas={png(图集)} part="剑" />
  </group>
);

/** 物品栏里的样子：平面图标（valettein_gui），不是上面那个 3D 模型 */
export const 断曜流光图标: FC = () => <ItemSprite layers={[{ tex: png(图标) }]} />;
