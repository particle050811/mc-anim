// 炸开的屋子里面的光：照原版 1.20.1 的天光、方块光（LightEngine）和亮度图（LightTexture），算出屋里每个面暗多少，屋子才看得出是一个黑洞洞的缺口，不是一面平墙上的凹槽。
// 天光：头顶一直通天的格 15，往旁边每走一格减 1（不透光的方块挡住）；方块光：火把 14，同样每格减 1。一个面的亮 = 它朝外那一格的光（原版关平滑光照的算法）。
// 亮度图：f = l/15、b = f / (4 − 3f)，亮度选项默认 0.5（往 1 − (1 − b)⁴ 混一半）；除以 15 级的值，屋外照满的面还是 1。天色暗下来（下雨）整体由色调管，这里只管屋里比屋外暗多少。
// 只算屋子和平地这一块（弹坑.ts 的 平地 以内），外面都当照满。纯计算（测试也引）。
import type { PlacedBlock } from '@engine/model/方块拼搭.tsx';
import { flatArea } from './弹坑.ts';

/** 不透光的方块（原版 lightBlock 15 或按形状挡光的台阶、半砖都当整格挡）；花草、火把、门、玻璃、箱子透光 */
const opaqueBlockRegex = /^minecraft:(grass_block|dirt|stone|cobblestone|oak_planks|spruce_planks|oak_log|spruce_stairs|spruce_slab|crafting_table|furnace|barrel)(\[|$)/;
/** 发光方块的亮度（原版 lightEmission） */
const glowLevel: Record<string, number> = { 'minecraft:wall_torch': 14, 'minecraft:torch': 14 };

const bounds = { i0: flatArea.west - 1, i1: flatArea.east + 1, j0: flatArea.south - 1, j1: flatArea.north + 1, k0: -9, k1: 9 } as const;
const width = bounds.i1 - bounds.i0 + 1, depth = bounds.j1 - bounds.j0 + 1, height = bounds.k1 - bounds.k0 + 1;
const inRange = (i: number, j: number, k: number) => i >= bounds.i0 && i <= bounds.i1 && j >= bounds.j0 && j <= bounds.j1 && k >= bounds.k0 && k <= bounds.k1;
const voxelIndex = (i: number, j: number, k: number) => ((k - bounds.k0) * depth + (j - bounds.j0)) * width + (i - bounds.i0);
const neighbors = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;

/** 亮度图：l 级光的亮（相对 15 级） */
export const brightness = (l: number) => {
  const levelBrightness = (x: number) => {
    const f = x / 15;
    const b = f / (4 - 3 * f);
    return 0.5 * b + 0.5 * (1 - (1 - b) ** 4);
  };
  return levelBrightness(Math.max(0, Math.min(15, l))) / levelBrightness(15);
};

export type LightTable = { 光: (i: number, j: number, k: number) => number; 挡: (i: number, j: number, k: number) => boolean };

/** 方块们的光：每一格的光级（天光、方块光取大） */
export const computeLight = (blocks: readonly PlacedBlock[]): LightTable => {
  const blockingCells = new Uint8Array(width * depth * height);
  for (const b of blocks) if (inRange(...b.位) && opaqueBlockRegex.test(b.状态)) blockingCells[voxelIndex(...b.位)] = 1;
  const isBlocked = (i: number, j: number, k: number) => inRange(i, j, k) && blockingCells[voxelIndex(i, j, k)] === 1;
  const spread = (seeds: [number, number, number, number][]) => {
    const l = new Int8Array(width * depth * height);
    const queue: [number, number, number][] = [];
    for (const [i, j, k, v] of seeds) {
      const n = voxelIndex(i, j, k);
      if (v > l[n]!) {
        l[n] = v;
        queue.push([i, j, k]);
      }
    }
    for (let q = 0; q < queue.length; q++) {
      const [i, j, k] = queue[q]!;
      const v = l[voxelIndex(i, j, k)]! - 1;
      if (v <= 0) continue;
      for (const [di, dj, dk] of neighbors) {
        const [a, b, c] = [i + di, j + dj, k + dk];
        if (!inRange(a, b, c) || isBlocked(a, b, c) || l[voxelIndex(a, b, c)]! >= v) continue;
        l[voxelIndex(a, b, c)] = v;
        queue.push([a, b, c]);
      }
    }
    return l;
  };
  // 天光：每一列从顶往下，碰到不透光的为止都是 15；范围边上一圈当屋外（照满）
  const skySources: [number, number, number, number][] = [];
  for (let i = bounds.i0; i <= bounds.i1; i++)
    for (let j = bounds.j0; j <= bounds.j1; j++)
      for (let k = bounds.k1; k >= bounds.k0 && !isBlocked(i, j, k); k--) skySources.push([i, j, k, 15]);
  const skyRgb = spread(skySources);
  const blockLight = spread(blocks.filter((b) => inRange(...b.位) && glowLevel[b.状态.replace(/\[.*$/, '')]).map((b) => [...b.位, glowLevel[b.状态.replace(/\[.*$/, '')]!] as [number, number, number, number]));
  const lightAt = (i: number, j: number, k: number) => {
    if (!inRange(i, j, k)) return 15;
    if (isBlocked(i, j, k)) return 0;
    const n = voxelIndex(i, j, k);
    return Math.max(skyRgb[n]!, blockLight[n]!);
  };
  return { 光: lightAt, 挡: isBlocked };
};

/** 一个面的亮（相对屋外照满）：面心往法线外挪一点落到的那一格的光；落在不透光的格里（台阶的台阶面这类）取它四邻里最亮的 */
export const faceBrightness = (lightTable: LightTable, faceCenter: readonly number[], normal: readonly number[]) => {
  const x = faceCenter[0]! + normal[0]! * 0.01, y = faceCenter[1]! + normal[1]! * 0.01, z = faceCenter[2]! + normal[2]! * 0.01;
  // 格 i 占 x ∈ [i − 0.5, i + 0.5]、y ∈ [j, j + 1]、z ∈ [k, k + 1]（同 弹坑.ts）
  const [i, j, k] = [Math.round(x), Math.floor(y), Math.floor(z)];
  if (!lightTable.挡(i, j, k)) return brightness(lightTable.光(i, j, k));
  return brightness(Math.max(...neighbors.map(([a, b, c]) => lightTable.光(i + a, j + b, k + c))));
};
