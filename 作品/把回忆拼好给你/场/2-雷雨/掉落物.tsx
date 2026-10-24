// 炸出来的掉落物（ItemEntity），照原版 1.20.1 ItemEntityRenderer 画：上下浮 sin((刻 + 帧内)/10 + bobOffs)·0.1 + 0.1，
// 绕竖轴转 (刻 + 帧内)/20 + bobOffs 弧度；方块物品按 block/block 的 ground 显示变换缩到 1/4 格、往上抬 3/16 格。
// 一堆不止一个时多画几份（原版 getRenderAmount：>1 两份、>16 三份、>32 四份、>48 五份），方块物品每份在 ±0.15 格里随机错开（种子 = 物品和个数，这里用列号）。
// 这一场炸出来的全是方块（木板、泥土、原木、圆石、熔炉），所以只写了方块物品。
import React from 'react';
import { 方块拼搭 } from '@engine/model/方块拼搭.tsx';
import type { V3 } from '@engine/model/parts.tsx';
import { Java随机 } from './弹坑.ts';

/** 物品 id → 画成哪个方块状态（物品模型是方块的默认状态） */
const 物品方块: Record<string, string> = {
  'minecraft:furnace': 'minecraft:furnace[facing=north,lit=false]',
  'minecraft:oak_log': 'minecraft:oak_log[axis=y]',
};

const 份数 = (个数: number) => (个数 > 48 ? 5 : 个数 > 32 ? 4 : 个数 > 16 ? 3 : 个数 > 1 ? 2 : 1);

export type 掉落物 = { 物品: string; 个数: number; 位: V3; 浮动偏: number };

/** 一堆掉落物：位 = 实体位置（落在地上的那点）；刻 = 它的 age（游戏刻，可带小数） */
const 一堆: React.FC<{ d: 掉落物; 刻: number }> = ({ d, 刻 }) => {
  const 浮 = Math.sin(刻 / 10 + d.浮动偏) * 0.1 + 0.1;
  const 转 = 刻 / 20 + d.浮动偏;
  const 状态 = 物品方块[d.物品] ?? d.物品;
  const r = new Java随机(Math.round(d.位[0] * 1000) * 31 + d.个数);
  const n = 份数(d.个数);
  return (
    <group position={[d.位[0], d.位[1], d.位[2] + 浮 + 0.25 * 0.25]} rotation={[0, 0, 转]}>
      {Array.from({ length: n }, (_, k) => {
        const o = k === 0 ? [0, 0, 0] : [(r.nextFloat() * 2 - 1) * 0.15, (r.nextFloat() * 2 - 1) * 0.15, (r.nextFloat() * 2 - 1) * 0.15];
        return (
          <group key={k} position={[o[0]!, o[1]!, o[2]! + 3 / 16]} scale={0.25}>
            <方块拼搭 方块们={[{ 状态, 位: [0, 0, 0] }]} 原点={[-0.5, -0.5, -0.5]} />
          </group>
        );
      })}
    </group>
  );
};

export const 掉落物们: React.FC<{ 们: readonly 掉落物[]; 刻: number }> = ({ 们, 刻 }) => (
  <>
    {们.map((d, k) => (
      <一堆 key={k} d={d} 刻={刻} />
    ))}
  </>
);
