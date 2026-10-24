// 炸开的屋子里面的光：照原版 1.20.1 的天光、方块光（LightEngine）和亮度图（LightTexture），算出屋里每个面暗多少，屋子才看得出是一个黑洞洞的缺口，不是一面平墙上的凹槽。
// 天光：头顶一直通天的格 15，往旁边每走一格减 1（不透光的方块挡住）；方块光：火把 14，同样每格减 1。一个面的亮 = 它朝外那一格的光（原版关平滑光照的算法）。
// 亮度图：f = l/15、b = f / (4 − 3f)，亮度选项默认 0.5（往 1 − (1 − b)⁴ 混一半）；除以 15 级的值，屋外照满的面还是 1。天色暗下来（下雨）整体由色调管，这里只管屋里比屋外暗多少。
// 只算屋子和平地这一块（弹坑.ts 的 平地 以内），外面都当照满。纯计算（测试也引）。
import type { 方块 } from '@engine/model/方块拼搭.tsx';
import { 平地 } from './弹坑.ts';

/** 不透光的方块（原版 lightBlock 15 或按形状挡光的台阶、半砖都当整格挡）；花草、火把、门、玻璃、箱子透光 */
const 不透光 = /^minecraft:(grass_block|dirt|stone|cobblestone|oak_planks|spruce_planks|oak_log|spruce_stairs|spruce_slab|crafting_table|furnace|barrel)(\[|$)/;
/** 发光方块的亮度（原版 lightEmission） */
const 发光: Record<string, number> = { 'minecraft:wall_torch': 14, 'minecraft:torch': 14 };

const 范围 = { i0: 平地.西 - 1, i1: 平地.东 + 1, j0: 平地.南 - 1, j1: 平地.北 + 1, k0: -9, k1: 9 } as const;
const 宽 = 范围.i1 - 范围.i0 + 1, 深 = 范围.j1 - 范围.j0 + 1, 高 = 范围.k1 - 范围.k0 + 1;
const 在内 = (i: number, j: number, k: number) => i >= 范围.i0 && i <= 范围.i1 && j >= 范围.j0 && j <= 范围.j1 && k >= 范围.k0 && k <= 范围.k1;
const 号 = (i: number, j: number, k: number) => ((k - 范围.k0) * 深 + (j - 范围.j0)) * 宽 + (i - 范围.i0);
const 邻 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;

/** 亮度图：l 级光的亮（相对 15 级） */
export const 亮度 = (l: number) => {
  const 一 = (x: number) => {
    const f = x / 15;
    const b = f / (4 - 3 * f);
    return 0.5 * b + 0.5 * (1 - (1 - b) ** 4);
  };
  return 一(Math.max(0, Math.min(15, l))) / 一(15);
};

export type 光表 = { 光: (i: number, j: number, k: number) => number; 挡: (i: number, j: number, k: number) => boolean };

/** 方块们的光：每一格的光级（天光、方块光取大） */
export const 算光 = (方块们: readonly 方块[]): 光表 => {
  const 挡格 = new Uint8Array(宽 * 深 * 高);
  for (const b of 方块们) if (在内(...b.位) && 不透光.test(b.状态)) 挡格[号(...b.位)] = 1;
  const 挡 = (i: number, j: number, k: number) => 在内(i, j, k) && 挡格[号(i, j, k)] === 1;
  const 扩散 = (起: [number, number, number, number][]) => {
    const l = new Int8Array(宽 * 深 * 高);
    const 队: [number, number, number][] = [];
    for (const [i, j, k, v] of 起) {
      const n = 号(i, j, k);
      if (v > l[n]!) {
        l[n] = v;
        队.push([i, j, k]);
      }
    }
    for (let q = 0; q < 队.length; q++) {
      const [i, j, k] = 队[q]!;
      const v = l[号(i, j, k)]! - 1;
      if (v <= 0) continue;
      for (const [di, dj, dk] of 邻) {
        const [a, b, c] = [i + di, j + dj, k + dk];
        if (!在内(a, b, c) || 挡(a, b, c) || l[号(a, b, c)]! >= v) continue;
        l[号(a, b, c)] = v;
        队.push([a, b, c]);
      }
    }
    return l;
  };
  // 天光：每一列从顶往下，碰到不透光的为止都是 15；范围边上一圈当屋外（照满）
  const 天起: [number, number, number, number][] = [];
  for (let i = 范围.i0; i <= 范围.i1; i++)
    for (let j = 范围.j0; j <= 范围.j1; j++)
      for (let k = 范围.k1; k >= 范围.k0 && !挡(i, j, k); k--) 天起.push([i, j, k, 15]);
  const 天 = 扩散(天起);
  const 灯 = 扩散(方块们.filter((b) => 在内(...b.位) && 发光[b.状态.replace(/\[.*$/, '')]).map((b) => [...b.位, 发光[b.状态.replace(/\[.*$/, '')]!] as [number, number, number, number]));
  const 光 = (i: number, j: number, k: number) => {
    if (!在内(i, j, k)) return 15;
    if (挡(i, j, k)) return 0;
    const n = 号(i, j, k);
    return Math.max(天[n]!, 灯[n]!);
  };
  return { 光, 挡 };
};

/** 一个面的亮（相对屋外照满）：面心往法线外挪一点落到的那一格的光；落在不透光的格里（台阶的台阶面这类）取它四邻里最亮的 */
export const 面亮 = (表: 光表, 心: readonly number[], 法: readonly number[]) => {
  const x = 心[0]! + 法[0]! * 0.01, y = 心[1]! + 法[1]! * 0.01, z = 心[2]! + 法[2]! * 0.01;
  // 格 i 占 x ∈ [i − 0.5, i + 0.5]、y ∈ [j, j + 1]、z ∈ [k, k + 1]（同 弹坑.ts）
  const [i, j, k] = [Math.round(x), Math.floor(y), Math.floor(z)];
  if (!表.挡(i, j, k)) return 亮度(表.光(i, j, k));
  return 亮度(Math.max(...邻.map(([a, b, c]) => 表.光(i + a, j + b, k + c))));
};
