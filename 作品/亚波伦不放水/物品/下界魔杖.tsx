// 下界魔杖：诡厄巫法 2.5.60.6 的 goety:nether_staff（zh_cn「下界魔杖」，MIT），亚波伦手里拿的（用户 11-09 定，原话叫「下界法杖」）。
// 模型是 jar 里 models/item/nether_staff.json 原样导出（Blockbench 元素模型，17 个元素，32×32 贴图；配方「下界魔杖」），用 BlockModel 画，不手改。
// 没有 parent、没有 Forge 的 separate_transforms；启示录没盖这个模型。几何（模型像素，y 朝上）：
//   杖身 1×24×1（x 7～8、z 8～9、y 0～24），杖头 y 24～31：托 3×1×3、两层镂空的笼（4×2×4、5×2×5）、中间 3×3×3 的芯、四角各一片斜 45 度的尖。全长 31 像素。
// display 照 json 抄：第三人称左右手都只有平移 [0, -7, 1]，没有旋转、缩放，握点在杖身 y = 15（正中）。
//
// 接口：<下界魔杖 />      物品空间（单位格，原点 = 模型 (8, 8, 8)，Y 朝上，游戏的北 = −Z），核对图、掉落物用。
//       <手持下界魔杖 />  挂在基岩模型的手部定位骨上（骨骼坐标：原点 = pivot，单位像素，Y 朝上，正面 −Z）。
import type { FC } from 'react';
import { BlockModel, type BlockModelData } from '@engine/model/方块模型.tsx';
import { ItemDisplay, type ItemTransform } from '@engine/model/物品贴图.tsx';
import { png } from '@engine/model/贴图.ts';
import 数据 from 'asset:模型/物品/下界魔杖';
import 图集 from 'asset:贴图/物品/下界魔杖';

const 模型 = 数据 as unknown as BlockModelData;

/** models/item/nether_staff.json 的 display（没列的 head 等用默认） */
export const 下界魔杖显示 = {
  thirdperson_righthand: { translation: [0, -7, 1] },
  thirdperson_lefthand: { translation: [0, -7, 1] },
  firstperson_righthand: { translation: [0, -7, 0] },
  firstperson_lefthand: { translation: [0, -7, 0] },
  ground: { translation: [0, 2, 0], scale: [0.5, 0.5, 0.5] },
  gui: { rotation: [0, -45, -45], translation: [-2.5, -3.5, 0], scale: [0.6, 0.6, 0.6] },
  fixed: { rotation: [0, -180, -45], translation: [3.5, -4, 1], scale: [0.75, 0.75, 0.75] },
} satisfies Record<string, ItemTransform>;

// BlockModel 的坐标是 游戏的上 = +Z、游戏的北 = +Y，绕 X 转 −90 度换回物品空间
export const 下界魔杖: FC = () => (
  <group rotation={[-Math.PI / 2, 0, 0]}>
    <BlockModel data={模型} atlas={png(图集)} part="杖" />
  </group>
);

/**
 * 拿在 YSM 模型手上：挂到 LeftHandLocator / RightHandLocator。
 * 定位骨之后的变换 YSM 2.6.5 在原生库里核对不了，这里照同一作者开源的车万女仆 GeckoLayerMaidHeld 写（是推断）：
 * 平移 (0, −1/16, −0.1) 格 → 绕 X 转 −90 度 → 物品的第三人称显示变换。手臂垂着时杖头朝前，手臂前平举时杖头朝上。
 */
export const 手持下界魔杖: FC<{ 左手?: boolean }> = ({ 左手 }) => (
  <group scale={16}>
    <group position={[0, -1 / 16, -0.1]} rotation={[-Math.PI / 2, 0, 0]}>
      <ItemDisplay t={下界魔杖显示[左手 ? 'thirdperson_lefthand' : 'thirdperson_righthand']} left={左手}>
        <下界魔杖 />
      </ItemDisplay>
    </group>
  </group>
);
