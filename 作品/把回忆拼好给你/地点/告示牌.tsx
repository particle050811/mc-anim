// 立着的橡木告示牌（方块实体，方块表里查不到）：形状照 1.20.1 SignRenderer.createSignLayer，牌面 texOffs(0,0) 24×12×2、木棍 texOffs(0,14) 2×14×2，
// 整体缩 2/3（一个贴图像素 1/24 格）；牌面底边离地 14/24 格、顶边 26/24 格。rotation 0 = 字朝南（朝镜头）。
// 字：原版每行 10 个字像素高、四行，一个字像素 = 1/96 格（文字缩放 0.015625 × 2/3），一行最宽 90 个字像素。
import React from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { png } from '@engine/model/贴图.ts';
import { TexBox } from '@engine/model/贴图方盒.tsx';
import oakSign from 'asset:贴图/物品/橡木告示牌';

const TEX = png(oakSign);
const PX = 1 / 24;

/** 告示牌的尺寸（格，相对底面中心）。字面：放字的那块，中心在牌面南边贴面处 */
export const 告示牌尺寸 = {
  牌面: { 宽: 24 * PX, 高: 12 * PX, 厚: 2 * PX, 底: 14 * PX },
  顶: 26 * PX,
  字面: { 中心: [0, -PX - 1 / 512, 20 * PX] as V3, 宽: 90 / 96, 高: 40 / 96 },
  字像素: 1 / 96,
  行高: 10 / 96,
};

/** 位：底面中心；children：字，放在字面中心的 group 里（Z 朝上，x 右、z 上） */
export const 告示牌: React.FC<{ 位: V3; children?: React.ReactNode }> = ({ 位, children }) => (
  <group position={位}>
    <TexBox tex={TEX} px={[24, 12, 2]} uv={[0, 0]} s={[24 * PX, 2 * PX, 12 * PX]} p={[0, 0, 20 * PX]} />
    <TexBox tex={TEX} px={[2, 14, 2]} uv={[0, 14]} s={[2 * PX, 2 * PX, 14 * PX]} p={[0, 0, 7 * PX]} />
    {children && <group position={告示牌尺寸.字面.中心}>{children}</group>}
  </group>
);
