// 第 14 句右屏：教学楼下的空地、楼的立面和你（史蒂夫）。布局、你的站位和头在 楼下布局.ts；纸是 2D 叠层（场/2-门口/纸花层.tsx）。
// 放进 现实画布（顶面 = 楼下顶面、天 = 楼下天色）。纯按 props 画，不读帧号。
import type React from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { 方块拼搭, type 方块 } from '@engine/model/方块拼搭.tsx';
import { 描边 } from '@engine/三渲二/描边.tsx';
import { 贴图像素对齐 } from '@engine/三渲二/对齐.tsx';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { 你在楼下, 楼, 空地 } from './楼下布局.ts';

const 楼下方块 = (): 方块[] => {
  const out: 方块[] = [];
  const 放 = (状态: string, i: number, j: number, k: number) => out.push({ 状态, 位: [i, j, k] });
  for (let i = 空地.左; i < 空地.右; i++)
    for (let j = 0; j < 楼.j; j++) {
      放(空地.面, i, j, -1);
      放(空地.底, i, j, -2);
    }
  for (let i = 楼.左; i < 楼.右; i++)
    for (let k = 0; k < 楼.顶; k++) {
      const 层内 = k % 楼.层高;
      const 窗 = (层内 === 1 || 层内 === 2) && ((i % 楼.窗距) + 楼.窗距) % 楼.窗距 !== 0;
      放(层内 === 0 ? 楼.楼板 : 窗 ? 楼.窗 : 楼.墙, i, 楼.j, k);
    }
  return out;
};
const 方块们 = 楼下方块();

export const 楼下: React.FC<{ 头: readonly [number, number]; 秒: number }> = ({ 头, 秒 }) => {
  const 位: V3 = [你在楼下.x, 0.5, 0];
  const 你 = stevePose(位, 你在楼下.朝向, { sec: 秒, scale: 你在楼下.倍, headPitch: 头[0], headYaw: 头[1] });
  return (
    <>
      <方块拼搭 方块们={方块们} />
      <描边>
        <贴图像素对齐 锚={位}>
          <Steve pose={你} />
        </贴图像素对齐>
      </描边>
    </>
  );
};
