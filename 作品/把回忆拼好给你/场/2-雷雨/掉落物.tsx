// 炸出来的掉落物（ItemEntity），照原版 1.20.1 ItemEntityRenderer 画：上下浮 sin((刻 + 帧内)/10 + bobOffs)·0.1 + 0.1，
// 绕竖轴转 (刻 + 帧内)/20 + bobOffs 弧度；方块物品按 block/block 的 ground 显示变换缩到 1/4 格、往上抬 3/16 格。
// 一堆不止一个时多画几份（原版 getRenderAmount：>1 两份、>16 三份、>32 四份、>48 五份），方块物品每份在 ±0.15 格里随机错开（种子 = 物品和个数，这里用列号）。
// 炸出来的是方块（木板、圆石，和箱子本身）：箱子的物品模型是方块实体（builtin/entity），同 block/block 的 ground 显示变换，画法照 库/物品/箱子.tsx。
// 箱子里洒出来的树苗、花、蛋糕是平面物品（item/generated）：挤出 1 像素厚的薄片（engine/model/物品贴图.tsx），ground 显示变换抬 2/16、缩到 1/2，往上抬 0.25 × 0.5 格；
//   几份前后错开 0.09375 格、横竖在 ±0.075 里错开（ItemEntityRenderer 不是 3D 物品的那一支）。树苗、花的物品图就是方块贴图（item/poppy.json 的 layer0 = block/poppy），从方块图集里切。
import React from 'react';
import { BlockAssembly } from '@engine/model/方块拼搭.tsx';
import type { V3 } from '@engine/model/parts.tsx';
import { ItemSprite, type ItemLayer } from '@engine/model/物品贴图.tsx';
import { png, type Png } from '@engine/model/贴图.ts';
import { textureNames } from '@engine/voxel/真实方块表.ts';
import { toVanillaCoords } from '@engine/model/贴图倍数.ts';
import { Chest, VANILLA_CHEST_TEX } from '@库/物品/箱子.tsx';
import { CAKE } from '@库/物品/蛋糕.tsx';
import blockTablePng from 'asset:贴图/场景/关键帧/方块表';
import { JavaRandom } from './弹坑.ts';

/** 方块图集里的一张贴图（图集是 格 宽的竖条，一张 格×格 接一张，顺序同 textureNames；格 原版 16，材质包高清图集 32） */
const blockTexture = (blockName: string): Png => {
  const k = textureNames.indexOf(blockName);
  if (k < 0) throw new Error(`方块图集里没有 ${blockName}`);
  const blockTableImg = png(blockTablePng);
  const cellSize = blockTableImg.w;
  return { w: cellSize, h: cellSize, px: blockTableImg.px.subarray(k * cellSize * cellSize * 4, (k + 1) * cellSize * cellSize * 4) };
};
/** 平面物品的贴图层 */
const flatItems: Record<string, () => ItemLayer[]> = {
  'minecraft:cherry_sapling': () => [{ tex: blockTexture('minecraft:block/cherry_sapling') }],
  'minecraft:poppy': () => [{ tex: blockTexture('minecraft:block/poppy') }],
  'minecraft:cake': () => CAKE,
};

/** 物品 id → 画成哪个方块状态（物品模型是方块的默认状态） */
const itemBlocks: Record<string, string> = {
  'minecraft:furnace': 'minecraft:furnace[facing=north,lit=false]',
  'minecraft:oak_log': 'minecraft:oak_log[axis=y]',
};

const copyCount = (itemCount: number) => (itemCount > 48 ? 5 : itemCount > 32 ? 4 : itemCount > 16 ? 3 : itemCount > 1 ? 2 : 1);

export type Drop = { item: string; itemCount: number; 位: V3; floatOffset: number };

/** 一堆掉落物：位 = 实体位置（落在地上的那点）；刻 = 它的 age（游戏刻，可带小数） */
const ItemPile: React.FC<{ d: Drop; 刻: number }> = ({ d, 刻: tick }) => {
  const floatOffset = Math.sin(tick / 10 + d.floatOffset) * 0.1 + 0.1;
  const rotationRad = tick / 20 + d.floatOffset;
  const blockState = itemBlocks[d.item] ?? d.item;
  const r = new JavaRandom(Math.round(d.位[0] * 1000) * 31 + d.itemCount);
  const n = copyCount(d.itemCount);
  const flatItem = flatItems[d.item];
  if (flatItem) {
    const layers = flatItem();
    return (
      <group position={[d.位[0], d.位[1], d.位[2] + floatOffset + 0.25 * 0.5]} rotation={[0, 0, rotationRad]}>
        {/* 物品空间（Y 上、Z 朝前）转到场景（Z 上） */}
        <group rotation={[Math.PI / 2, 0, 0]}>
          <group position={[0, 0, (-0.09375 * (n - 1)) / 2]}>
            {Array.from({ length: n }, (_, k) => {
              const o = k === 0 ? [0, 0] : [(r.nextFloat() * 2 - 1) * 0.075, (r.nextFloat() * 2 - 1) * 0.075];
              return (
                <group key={k} position={[o[0]!, o[1]! + 2 / 16, 0.09375 * k]} scale={0.5}>
                  <ItemSprite layers={layers} emissive={0} shadow={false} />
                </group>
              );
            })}
          </group>
        </group>
      </group>
    );
  }
  return (
    <group position={[d.位[0], d.位[1], d.位[2] + floatOffset + 0.25 * 0.25]} rotation={[0, 0, rotationRad]}>
      {Array.from({ length: n }, (_, k) => {
        const o = k === 0 ? [0, 0, 0] : [(r.nextFloat() * 2 - 1) * 0.15, (r.nextFloat() * 2 - 1) * 0.15, (r.nextFloat() * 2 - 1) * 0.15];
        return (
          <group key={k} position={[o[0]!, o[1]!, o[2]! + 3 / 16]} scale={0.25}>
            {d.item === 'minecraft:chest' ? <Chest 贴图={toVanillaCoords(VANILLA_CHEST_TEX, [64, 64])} p={[0, 0, -0.5]} facing="south" /> : <BlockAssembly blocks={[{ 状态: blockState, 位: [0, 0, 0] }]} 原点={[-0.5, -0.5, -0.5]} />}
          </group>
        );
      })}
    </group>
  );
};

export const dropItemLayer: React.FC<{ 们: readonly Drop[]; 刻: number }> = ({ 们: drops, 刻: tick }) => (
  <>
    {drops.map((d, k) => (
      <ItemPile key={k} d={d} 刻={tick} />
    ))}
  </>
);
