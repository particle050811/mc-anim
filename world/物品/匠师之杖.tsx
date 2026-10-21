// 匠师之杖：铁魔法（Iron's Spells 'n Spellbooks，irons_spellbooks-1.20.1-3.16.3.jar，放 game/缓存/铁魔法/）的 irons_spellbooks:artificer_cane（Artificer's Cane），刘心忠拿的法杖。
// 用户 10-12 剪映注释定：以它为准，替换原来的木杖。
//
// 模型：jar 里 models/item/artificer_cane.json（Java 物品模型，32×32 贴图 textures/item/artificer_cane.png），npm run 取材 -- 匠师之杖 原样导出成 匠师之杖.模型.json/.png，用 lib/方块模型.tsx 的 `BlockModel` 画，不手改。几何（模型像素，y 朝上）：
//   杖身 1×32×1（y −15～17，最下一格是金色杖尖）、杖身下段一圈 2×1×2 的金箍（y −13～−12）、杖头是上下两片 3×1×3 的金盖（y 17～18、23～24）夹着两张十字交叉、3×5 的镂空贴片（y 18～23，里面是一小块紫粉色晶体）。
//   全长 39 像素 = 2.44 格。display.thirdperson 只有平移、没有缩放，游戏里拿在手上就是这么长（比人还高），照游戏比例不缩。
//
// 握在哪：游戏里（`ItemInHandLayer` + display.thirdperson_righthand 平移 [0, 3, 1.25]）握持点在模型 y = 3 附近，差不多是杖的正中；但游戏里是往前平伸的，镜头里要的是像拐杖一样竖着拄、举（杖头朝上）。
// 竖着拄时杖尖要扎进地里 5 像素，所以握持点往下挪到 y = −2：垂手（手在地面上方约 13 像素）时杖尖刚好点地，杖头高出头顶，举过头顶时大半根在手上面。
//
// 接口：<ArtificerCane />  手插槽坐标（骨架.tsx 的 handR，1 = 1 像素），原点 = 握持点，杖身沿本地 +Z（杖头在 +Z）。调用方用 rotation / quaternion 把 +Z 转到要的方向（追兵.tsx 的 `LiuXinzhong` 用 骨架.tsx 的 `bladeInHand` 让它一直朝上）。
//       <ArtificerCaneModel />  物品模型原样（单位格、原点在方块中心 = 模型 (8, 8, 8)，游戏的上 = +Z），核对图用。
import React from 'react';
import { BlockModel, type BlockModelData } from '../../engine/model/方块模型.tsx';
import { png } from '../../engine/model/贴图.ts';
import data from 'asset:模型/物品/匠师之杖';
import atlasPng from 'asset:贴图/物品/匠师之杖';

const MODEL = data as unknown as BlockModelData;
const ATLAS = png(atlasPng);

// 握持点在模型里的高度（模型像素，y 朝上）：见文件头
export const ARTIFICER_CANE_GRIP_Y = -2;
export const ARTIFICER_CANE_LENGTH = 39; // 像素，y −15～24

export const ArtificerCaneModel: React.FC = () => <BlockModel data={MODEL} atlas={ATLAS} part="杖" />;

// 手插槽里：模型方块中心在 (8, 8, 8)，握持点 (8, 握点, 8) 挪到原点；1 格 = 16 像素
export const ArtificerCane: React.FC = () => (
  <group scale={16}>
    <group position={[0, 0, (8 - ARTIFICER_CANE_GRIP_Y) / 16]}>
      <ArtificerCaneModel />
    </group>
  </group>
);
