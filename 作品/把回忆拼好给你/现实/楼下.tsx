// 第 14 句右屏：教学楼下的空地、楼的立面、楼上挂的红横幅和你（史蒂夫）。布局、你的站位和头在 楼下布局.ts；纸是 2D 叠层（场/2-门口/纸花层.tsx）。
// 放进 现实画布（顶面 = 楼下顶面、天 = 楼下天色）。纯按 props 画，不读帧号。
import type React from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { BlockAssembly, type PlacedBlock } from '@engine/model/方块拼搭.tsx';
import { Outline } from '@engine/三渲二/描边.tsx';
import { TexturePixelAlign } from '@engine/三渲二/对齐.tsx';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { youDownstairsPos, banner, building, emptyLot } from './楼下布局.ts';
import { newPixelArt, makeTexture } from './像素图.ts';
import { PixelSpace, FrontFace, useTexture } from './像素块.tsx';

const downstairsBlocks = (): PlacedBlock[] => {
  const out: PlacedBlock[] = [];
  const placeBlock = (blockState: string, i: number, j: number, k: number) => out.push({ state: blockState, 位: [i, j, k] });
  for (let i = emptyLot.left; i < emptyLot.right; i++)
    for (let j = 0; j < building.j; j++) {
      placeBlock(emptyLot.面, i, j, -1);
      placeBlock(emptyLot.bottomBlock, i, j, -2);
    }
  for (let i = building.left; i < building.right; i++)
    for (let k = 0; k < building.topLayers; k++) {
      const floorIndex = k % building.floorHeight;
      const isWindow = (floorIndex === 1 || floorIndex === 2) && ((i % building.windowSpacing) + building.windowSpacing) % building.windowSpacing !== 0;
      placeBlock(floorIndex === 0 ? building.floorSlab : isWindow ? building.窗 : building.wallBlock, i, building.j, k);
    }
  return out;
};
const blocks = downstairsBlocks();

/** 横幅的贴图（贴图像素：宽 = 横幅宽 × 16，高 16）：红色羊毛的噪点、上下各一道暗边，不写字（看点是纸，见 楼下布局.ts 的 横幅） */
const paintBanner = () => {
  const width = (banner.right - banner.left) * 16;
  const p = newPixelArt(width, 16);
  p.noise(0, 0, width, 16, [banner.red, banner.darkRed], 1431, [5, 1]);
  p.fillRect(0, 0, width, 1, banner.darkRed);
  p.fillRect(0, 15, width, 1, banner.darkRed);
  return makeTexture(p);
};

/** 横幅贴在立面正面前面一点（不和墙面打架） */
const BannerLayer: React.FC = () => {
  const image = useTexture(paintBanner, []);
  return (
    <PixelSpace 位={[banner.left, building.j - 0.02, banner.z]}>
      <FrontFace x={0} y={0} z={0} width={(banner.right - banner.left) * 16} height={16} image={image} />
    </PixelSpace>
  );
};

export const Downstairs: React.FC<{ 头: readonly [number, number]; sec: number }> = ({ 头: headPose, sec: sec }) => {
  const pos: V3 = [youDownstairsPos.x, 0.5, 0];
  const you = stevePose(pos, youDownstairsPos.facing, { sec: sec, scale: youDownstairsPos.scale, headPitch: headPose[0], headYaw: headPose[1] });
  return (
    <>
      <BlockAssembly blocks={blocks} />
      <BannerLayer />
      <Outline>
        <TexturePixelAlign 锚={pos}>
          <Steve pose={you} />
        </TexturePixelAlign>
      </Outline>
    </>
  );
};
