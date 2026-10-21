// 地面上的草、花（十字片小植物）：远景（lib/体素/远景.ts）各级和导入的粗级（lib/体素/主世界地形.ts 的 `fillGroundPlants`）照导入量出的比例补上（远景地面草.json，工具/导入/地面草校准.ts 写，npm run 远景:地面草）。
// 为什么（用户 10-10 指出陆地也有色差）：第 0 级草地上的草花十字片把地面压暗；粗级照 Mipper 合并，草和地面挤同一格时地面赢，草越来越少，远景原来一株不长，远处草地偏黄偏亮，交界上跳一下。
// 做法同海里（远景海底.ts 的 `coarseSeaPlant`）：粗级在地面上面那格放一株，跟着格子放大。量出的比例见 远景地面草.json（L1 比 L0 高：植物那格合并时下面没有地面，Mipper 挑到的就是植物）。
// 补多少：每级都补到第 0 级的比例 r0。导入的粗级里本来就有 r_L，光地面的列里再挑 (r0 − r_L) / (1 − r_L)，够了的不补；远景哪级都没有，挑 r0。挑哪种按第 0 级各种植物的比例。第 0 级（只有远景用）按量到的高度长。
// 表里按群系、地表方块分开；这个群系这种地表没量到（列数不够）就借全部群系合起来的（*），再没有就不长。
import { hash2 } from '../core/噪声.ts';
import raw from 'asset:数据/体素/远景地面草';

type LevelEntry = { n: number; 草: [string, number][] } | null;
type SurfaceEntry = { 级: LevelEntry[]; 草高: [string, number, number][] | null };
const stats = raw as unknown as { 群系: Record<string, Record<string, SurfaceEntry>> };
const seed = 23;
const id = (s: string) => s.replace(/\[.*$/, '');
const totalShare = (e: NonNullable<LevelEntry>) => e.草.reduce((a, [, share]) => a + share, 0);
const lookup = (biome: string, surfaceName: string) => {
  const surfaceId = id(surfaceName);
  return [stats.群系[biome]?.[surfaceId], stats.群系['*']?.[surfaceId]];
};
const level0Entry = (biome: string, surfaceName: string) => {
  for (const entry of lookup(biome, surfaceName)) if (entry?.级[0]) return entry;
  return undefined;
};
// 植物的第 i 格（从下往上）的方块状态：两格高的分上下半（没有 half 属性的方块，体素值 会忽略它）
const plantState = (b: string, h: number, i: number) => (h === 2 ? `${b}[half=${i === 0 ? 'lower' : 'upper'}]` : b);

// 第 0 级（远景）游戏坐标 (gx, gz) 这一列地表上长什么：[下面那格, 最上面那格, 格数]，不长是 null
export const fineGroundPlant = (biome: string, surfaceName: string, gx: number, gz: number): [string, string, number] | null => {
  const t = level0Entry(biome, surfaceName)?.草高;
  if (!t) return null;
  const roll = hash2(gx, gz, seed);
  let acc = 0;
  for (const [block, heightCells, share] of t) {
    acc += share;
    if (roll < acc) return [plantState(block, heightCells, 0), plantState(block, heightCells, heightCells - 1), heightCells];
  }
  return null;
};

// 第 L 级（≥ 1）一格（游戏坐标 [gx0, gx0 + 2^L) × [gz0, gz0 + 2^L)）地表上面那一格放的植物（状态名），不放是 undefined。
// 导入：这一格来自导入的粗级（本来就有一部分植物，只补差的那些）；远景的粗级给 false
export const coarseGroundPlant = (biome: string, surfaceName: string, gx0: number, gz0: number, level: number, imported: boolean): string | undefined => {
  const e0 = level0Entry(biome, surfaceName)?.级[0];
  if (!e0) return undefined;
  const r0 = totalShare(e0);
  let rL = 0;
  if (imported)
    for (const entry of lookup(biome, surfaceName)) {
      const t = entry?.级[level];
      if (t) {
        rL = totalShare(t);
        break;
      }
    }
  if (rL >= r0) return undefined;
  const fillProb = (r0 - rL) / (1 - rL);
  const roll = hash2(gx0 >> level, gz0 >> level, seed + level);
  if (roll >= fillProb) return undefined;
  const scaledRoll = (roll / fillProb) * r0;
  let acc = 0;
  for (const [block, share] of e0.草) {
    acc += share;
    if (scaledRoll < acc) return plantState(block, 2, 0);
  }
  return undefined;
};
