// 立着的橡木告示牌（方块实体，方块表里查不到）：形状照 1.20.1 SignRenderer.createSignLayer，牌面 texOffs(0,0) 24×12×2、木棍 texOffs(0,14) 2×14×2，
// 整体缩 2/3（一个贴图像素 1/24 格）；牌面底边离地 14/24 格、顶边 26/24 格。rotation 0 = 字朝南（朝镜头）。
// 字：原版每行 10 个字像素高、四行，一个字像素 = 1/96 格（文字缩放 0.015625 × 2/3），一行最宽 90 个字像素。
import React from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { png } from '@engine/model/贴图.ts';
import { TexBox } from '@engine/model/贴图方盒.tsx';
import { toVanillaCoords } from '@engine/model/贴图倍数.ts';
import oakSign from 'asset:贴图/物品/橡木告示牌';

// 原版 entity/signs/oak.png 是 64×32，坐标照它写；材质包的高清图由 按原版坐标 换算
const TEX = toVanillaCoords(png(oakSign), [64, 32]);
const PX = 1 / 24;

/** 告示牌的尺寸（格，相对底面中心）。字面：放字的那块，中心在牌面南边贴面处 */
export const signSize = {
  signBoard: { width: 24 * PX, height: 12 * PX, thickness: 2 * PX, bottom: 14 * PX },
  topPx: 26 * PX,
  textPanel: { center: [0, -PX - 1 / 512, 20 * PX] as V3, width: 90 / 96, height: 40 / 96 },
  glyphPx: 1 / 96,
  行高: 10 / 96,
};

/** 位：底面中心；children：字，放在字面中心的 group 里（Z 朝上，x 右、z 上） */
export const Signboard: React.FC<{ 位: V3; children?: React.ReactNode }> = ({ 位: pos, children }) => (
  <group position={pos}>
    <TexBox tex={TEX} px={[24, 12, 2]} uv={[0, 0]} s={[24 * PX, 2 * PX, 12 * PX]} p={[0, 0, 20 * PX]} />
    <TexBox tex={TEX} px={[2, 14, 2]} uv={[0, 14]} s={[2 * PX, 2 * PX, 14 * PX]} p={[0, 0, 7 * PX]} />
    {children && <group position={signSize.textPanel.center}>{children}</group>}
  </group>
);
