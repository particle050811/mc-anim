// 末地这一镜的方块：主岛顶面一层末地石（半径 岛半径 的圆盘）、出口传送门（基岩环、中间 4 格高的基岩柱、柱子四面的墙上火把）、远处两根黑曜石柱、龙蛋。
// 传送门照 1.20.1 EndPodiumFeature：原点格 (0, 0) 那一层和地面齐平；离原点 距离² < 6.25 的格（去掉原点）是传送门方块（末地传送门.tsx 另画），
// 6.25～12.25 的一圈 16 格是基岩；柱子在原点 k = −1～2，火把在 k = 1、贴着柱子朝外。方块表里没有传送门方块（方块实体），这里留空。
// 方块不描边（画风.ts：方块、方块似的实体不描）。龙蛋是一格方块，按格单独画，位置跟着 编排.ts 的 蛋格。
import React from 'react';
import { BlockAssembly, type PlacedBlock } from '@engine/model/方块拼搭.tsx';
import { islandRadius, obsidianPillars } from './参数.ts';

/** 黑曜石柱占的格（离中心格 距离² ≤ 半径² + 1，EndSpikeFeature 的 distToLowCornerSqr） */
const pillarCells = obsidianPillars.flatMap(({ 中心: [ci, cj], radius, 高: pillarHeight }) => {
  const r: { i: number; j: number; 高: number }[] = [];
  for (let i = ci - radius; i <= ci + radius; i++) for (let j = cj - radius; j <= cj + radius; j++) if ((i - ci) ** 2 + (j - cj) ** 2 <= radius * radius + 1) r.push({ i, j, 高: pillarHeight });
  return r;
});

const groundBlocks = ((): PlacedBlock[] => {
  const r: PlacedBlock[] = [];
  const pillarKeys = new Set(pillarCells.map(({ i, j }) => `${i},${j}`));
  for (let i = -islandRadius; i <= islandRadius; i++)
    for (let j = -islandRadius; j <= islandRadius; j++) {
      const d2 = i * i + j * j;
      if (d2 > islandRadius * islandRadius || pillarKeys.has(`${i},${j}`)) continue;
      if (d2 < 6.25) continue; // 传送门方块和柱子
      r.push({ 状态: d2 < 12.25 ? 'minecraft:bedrock' : 'minecraft:end_stone', 位: [i, j, -1] });
    }
  for (let k = -1; k <= 2; k++) r.push({ 状态: 'minecraft:bedrock', 位: [0, 0, k] });
  // 原版方向 → 场景格：北 +j、南 −j、东 +i、西 −i
  r.push({ 状态: 'minecraft:wall_torch[facing=north]', 位: [0, 1, 1] });
  r.push({ 状态: 'minecraft:wall_torch[facing=south]', 位: [0, -1, 1] });
  r.push({ 状态: 'minecraft:wall_torch[facing=east]', 位: [1, 0, 1] });
  r.push({ 状态: 'minecraft:wall_torch[facing=west]', 位: [-1, 0, 1] });
  // 黑曜石柱：从地面那层（k = −1）起，顶上一块基岩（末影水晶的底座，水晶已经被炸掉）
  for (const { i, j, 高: pillarHeight } of pillarCells) for (let k = -1; k < pillarHeight; k++) r.push({ 状态: 'minecraft:obsidian', 位: [i, j, k] });
  for (const { 中心: [ci, cj], 高: pillarHeight } of obsidianPillars) r.push({ 状态: 'minecraft:bedrock', 位: [ci, cj, pillarHeight] });
  return r;
})();

/** 主岛、传送门、黑曜石柱（火把在方块拼搭里按发光方块画、不受光，画布不用给发光区） */
export const EndSet: React.FC = () => <BlockAssembly blocks={groundBlocks} />;

const eggBlockMap = new Map<string, PlacedBlock[]>();
/** 龙蛋：格 (i, j, k) */
export const DragonEgg: React.FC<{ 格: readonly [number, number, number] }> = ({ 格: cellPos }) => {
  const cacheKey = cellPos.join(',');
  let eggBlocks = eggBlockMap.get(cacheKey);
  if (!eggBlocks) eggBlockMap.set(cacheKey, (eggBlocks = [{ 状态: 'minecraft:dragon_egg', 位: cellPos }]));
  return <BlockAssembly blocks={eggBlocks} />;
};
