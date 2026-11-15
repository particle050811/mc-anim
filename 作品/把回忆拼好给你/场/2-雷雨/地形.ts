// 第 6、7 句屋子四周的地：屋前屋后那块平地（弹坑.ts）往外起伏的平原，西北边一道缓坡上是樱花林，东北两道山梁（近的长着橡树），零星几棵橡树。纯计算（不 import react、three），测试直接引。
// 用户 10-24「而且怎么超平坦背景 合理吗？」：地平线上要有起伏、樱花林、树，远处照原版的雾淡出；屋子盖在第 1 句远处那片樱花林的边上，长法同 场/2-新世界/地形.ts
//   （平原起伏一两格、樱花树照原版 CherryTrunkPlacer、CherryFoliagePlacer，地上铺粉红花簇；树的长法在 地点/原版树.ts），看得出是同一片地。
// 不是存档导出的，手搓；随机都用定死的噪声和散列，同一组参数每次出一样的方块。只铺镜头看得到的北边一扇（镜头一直朝北），背后的不铺。
// 坐标同 弹坑.ts：格 (i, j, k) 占 x ∈ [i − 0.5, i + 0.5]、y ∈ [j, j + 1]、z ∈ [k, k + 1]，屋前地面顶 z = 0（草方块是 k = −1）。
import type { PlacedBlock } from '@engine/model/方块拼搭.tsx';
import { fbm, hash2, simplex2, smoothstep } from '@engine/core/噪声.ts';
import { cherryTree, oakTree, type VanillaTree } from '../../地点/原版树.ts';
import { flatArea } from './弹坑.ts';

/** 平原：起伏几格、多大一片（格）；出了平地 坡宽 格才起伏满（屋子那块平地是平的） */
export const plainsParams = { 种子: 61906, 起伏: 2.6, undulationScale: 52, fineUndulation: 0.6, fineUndulationScale: 14, slopeWidth: 14, grassRate: 0.22, tallGrassShare: 0.18, flowerRate: 0.02 } as const;
/** 樱花林：一道缓坡（心、山脚半径、顶半径、高），林子在 林半径 以内，每 树距 见方一棵。屋子在林子东南边上，最近的樱花树离后墙十来格；
 *  林子在屋子西北，第 6 句从他俩身后看过去是屋子左后方一片粉，第 7 句仰机位是地平线左半边一片粉。Agent 暂定 */
export const cherryGrove = { 心: [-16, 40] as const, mountainHeight: 6, mountainRadius: 40, topRadius: 12, mountainJitter: 0.3, mountainJitterScale: 30, forestRadius: 30, treeSpacing: 7, treeRate: 0.85, petalClusterRate: 0.35 } as const;
/** 零星几棵橡树 [i, j, 树干高]：屋子东北、东边远处，不挡屋子和光柱（Agent 摆的） */
export const oaks: readonly (readonly [number, number, number])[] = [
  [22, 26, 5],
  [38, 58, 6],
  [-44, 96, 5],
  [64, 34, 5],
  [12, 92, 4],
  [30, 40, 5],
  [48, 30, 4],
];
/** 东北的山梁（屋子右后方）：只有樱花林那一道坡的话，第 7 句仰机位右半边的地平线还是一条直线（核查 10-24）。
 *  每道梁是一段线（从、到），离线 脚宽 格起坡、顶宽 以内到 高，按噪声扭；近的那道 90～120 格、长着橡树，远的那道压在原版雾边上（172.8～192 格）只剩个淡影。Agent 摆的 */
export const ridges: readonly { 从: readonly [number, number]; 到: readonly [number, number]; 高: number; footWidth: number; topWidth: number }[] = [
  { 从: [34, 78], 到: [112, 46], 高: 9, footWidth: 26, topWidth: 6 },
  { 从: [70, 150], 到: [150, 96], 高: 16, footWidth: 34, topWidth: 8 },
];
/** 山梁上的橡树：每 树距 见方一格，离梁的线 林宽 以内、这一格的散列小于 成树率 才长（Agent 暂定） */
export const ridgeTrees = { treeSpacing: 8, forestWidth: 16, treeRate: 0.6 } as const;
/** 铺的范围：镜头在屋子南边、一直朝北看。从 扇心 往北张开（第 7 句仰机位的眼在 (2.5, −30)，画面宽 94°），离 扇心 不超过 半径（> 雾止 192，雾里不露地形的边） */
export const terrainRange = { south: -40, fanCenter: [2.5, -34] as const, fanWidth: 30, fanSpread: 1.2, radius: 205, plantRadius: 90 } as const;

const noise = simplex2(plainsParams.种子);
const fineNoise = simplex2(plainsParams.种子 + 7);
const mountainNoise = simplex2(plainsParams.种子 + 13);

/** 离屋前平地多远（格，平地里 0） */
const distFromFlat = (i: number, j: number) => Math.hypot(Math.max(0, flatArea.west - i, i - flatArea.east), Math.max(0, flatArea.south - j, j - flatArea.north));

/** 樱花林那道坡在 (i, j) 有多高（格，小数）：山脚、山顶的半径按噪声扭（不是同心圆） */
const mountainHeightAt = (i: number, j: number) => {
  const L = cherryGrove;
  const distance = Math.hypot(i - L.心[0], j - L.心[1]);
  const jitter = 1 + L.mountainJitter * fbm(mountainNoise, i, j, L.mountainJitterScale, 3);
  return L.mountainHeight * smoothstep(L.mountainRadius * jitter, L.topRadius * jitter, distance);
};

/** (i, j) 离一段线多远 */
const distToLine = (i: number, j: number, a: readonly [number, number], b: readonly [number, number]) => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(0, Math.min(1, ((i - a[0]) * dx + (j - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(i - a[0] - t * dx, j - a[1] - t * dy);
};
/** 东北那几道山梁在 (i, j) 有多高（格，小数），几道取最高 */
const ridgeHeightAt = (i: number, j: number) => {
  let h = 0;
  for (const L of ridges) {
    const jitter = 1 + cherryGrove.mountainJitter * fbm(mountainNoise, i + 500, j, cherryGrove.mountainJitterScale, 3);
    h = Math.max(h, L.高 * smoothstep(L.footWidth * jitter, L.topWidth * jitter, distToLine(i, j, L.从, L.到)));
  }
  return h;
};

/** (i, j) 那一列地面顶的高度（整数格，屋前平地 0）：平地外 坡宽 格里起伏慢慢长满，樱花林那道坡也从平地边上起 */
export const groundHeight = (i: number, j: number): number => {
  const slope = smoothstep(0, plainsParams.slopeWidth, distFromFlat(i, j));
  const undulation = plainsParams.起伏 * fbm(noise, i, j, plainsParams.undulationScale, 3) + plainsParams.fineUndulation * fbm(fineNoise, i, j, plainsParams.fineUndulationScale, 2);
  return Math.round((undulation + mountainHeightAt(i, j) + ridgeHeightAt(i, j)) * slope);
};

/** 这一列铺不铺：平地（弹坑.ts 铺）以外、扇面以内 */
export const paved = (i: number, j: number): boolean => {
  if (distFromFlat(i, j) === 0) return false;
  const r = terrainRange;
  if (j < r.south) return false;
  if (Math.abs(i - r.fanCenter[0]) > r.fanWidth + (j - r.fanCenter[1]) * r.fanSpread) return false;
  return Math.hypot(i - r.fanCenter[0], j - r.fanCenter[1]) <= r.radius;
};

const inGrove = (i: number, j: number) => Math.hypot(i - cherryGrove.心[0], j - cherryGrove.心[1]) <= cherryGrove.forestRadius;

type Tree = VanillaTree & { 种: '橡' | '樱' };
/** 树的位置：樱花林里按格子撒（抖一抖），离屋前平地至少 4 格；橡树照 橡树们 */
export const trees = (): Tree[] => {
  const out: Tree[] = [];
  const d = cherryGrove.treeSpacing;
  const [cx, cy] = cherryGrove.心;
  for (let gx = Math.floor((cx - cherryGrove.forestRadius) / d); gx <= Math.ceil((cx + cherryGrove.forestRadius) / d); gx++)
    for (let gy = Math.floor((cy - cherryGrove.forestRadius) / d); gy <= Math.ceil((cy + cherryGrove.forestRadius) / d); gy++) {
      const i = Math.round(gx * d + (hash2(gx, gy, 1) - 0.5) * d * 0.7);
      const j = Math.round(gy * d + (hash2(gx, gy, 2) - 0.5) * d * 0.7);
      if (!inGrove(i, j) || hash2(gx, gy, 3) > cherryGrove.treeRate || distFromFlat(i, j) < 4) continue;
      out.push({ i, j, 种: '樱', 高: 0, 种子: gx * 131 + gy });
    }
  for (const [i, j, treeHeight] of oaks) out.push({ i, j, 种: '橡', 高: treeHeight, 种子: i * 7 + j });
  // 近的那道山梁上撒橡树（远的那道在雾里，树看不出来，不长）
  const ridge = ridges[0]!;
  const T = ridgeTrees;
  for (let gx = Math.floor((Math.min(ridge.从[0], ridge.到[0]) - T.forestWidth) / T.treeSpacing); gx <= Math.ceil((Math.max(ridge.从[0], ridge.到[0]) + T.forestWidth) / T.treeSpacing); gx++)
    for (let gy = Math.floor((Math.min(ridge.从[1], ridge.到[1]) - T.forestWidth) / T.treeSpacing); gy <= Math.ceil((Math.max(ridge.从[1], ridge.到[1]) + T.forestWidth) / T.treeSpacing); gy++) {
      const i = Math.round(gx * T.treeSpacing + (hash2(gx, gy, 21) - 0.5) * T.treeSpacing * 0.7);
      const j = Math.round(gy * T.treeSpacing + (hash2(gx, gy, 22) - 0.5) * T.treeSpacing * 0.7);
      if (distToLine(i, j, ridge.从, ridge.到) > T.forestWidth || hash2(gx, gy, 23) > T.treeRate) continue;
      out.push({ i, j, 种: '橡', 高: 4 + Math.floor(hash2(gx, gy, 24) * 3), 种子: gx * 977 + gy });
    }
  return out;
};

const flowers = ['minecraft:dandelion', 'minecraft:poppy', 'minecraft:oxeye_daisy', 'minecraft:cornflower', 'minecraft:azure_bluet'] as const;
const petalFacing = ['north', 'east', 'south', 'west'] as const;

export type SurroundBlocks = { plains: PlacedBlock[]; cherryGrove: PlacedBlock[] };

/** 平地以外铺出来的方块：平原（群系 plains）、樱花林（群系 cherry_grove：草色、树叶色按它染）分两份 */
export const SurroundBlocks = (): SurroundBlocks => {
  const occupied = new Set<string>();
  const out: SurroundBlocks = { plains: [], cherryGrove: [] };
  const makePlacer = (inForest: boolean) => (b: PlacedBlock) => {
    const k = `${b.位[0]},${b.位[1]},${b.位[2]}`;
    if (occupied.has(k)) return;
    occupied.add(k);
    (inForest ? out.cherryGrove : out.plains).push(b);
  };
  const treeTable = trees();
  const treeKeys = new Set(treeTable.map((t) => `${t.i},${t.j}`));
  // 先放树（树叶占了的格，地上的草、花就不放了）；钻进地里的枝叶不放（原版树只长在空气、能替换的格里）
  for (const t of treeTable) {
    if (!paved(t.i, t.j)) continue;
    const z0 = groundHeight(t.i, t.j);
    const placer = makePlacer(t.种 === '樱');
    (t.种 === '橡' ? oakTree : cherryTree)(t, z0, (b) => {
      if (b.位[2] >= groundHeight(b.位[0], b.位[1]) && distFromFlat(b.位[0], b.位[1]) > 0) placer(b);
    });
  }
  const r = terrainRange;
  const northEdge = r.fanCenter[1] + r.radius;
  const width = r.fanWidth + (northEdge - r.fanCenter[1]) * r.fanSpread;
  for (let j = r.south; j <= northEdge; j++)
    for (let i = Math.floor(r.fanCenter[0] - width); i <= Math.ceil(r.fanCenter[0] + width); i++) {
      if (!paved(i, j)) continue;
      const inForest = inGrove(i, j) || Math.hypot(i - cherryGrove.心[0], j - cherryGrove.心[1]) <= cherryGrove.mountainRadius * 0.8;
      const placer = makePlacer(inForest);
      const h = groundHeight(i, j);
      // 侧面露出来的要填：往下填到四邻里最低的那格顶
      let bottom = h;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) bottom = Math.min(bottom, distFromFlat(i + di, j + dj) === 0 ? 0 : groundHeight(i + di, j + dj));
      // 树干底下原版换成泥土（TrunkPlacer.setDirtAt）
      placer({ 状态: treeKeys.has(`${i},${j}`) ? 'minecraft:dirt' : 'minecraft:grass_block[snowy=false]', 位: [i, j, h - 1] });
      for (let k = h - 2; k >= bottom - 1; k--) placer({ 状态: h - 1 - k > 3 ? 'minecraft:stone' : 'minecraft:dirt', 位: [i, j, k] });
      if (treeKeys.has(`${i},${j}`)) continue;
      if (Math.hypot(i - r.fanCenter[0], j - r.fanCenter[1]) > r.plantRadius && !inForest) continue;
      const u = hash2(i, j, 11);
      if (inForest) {
        if (u < cherryGrove.petalClusterRate) placer({ 状态: `minecraft:pink_petals[facing=${petalFacing[Math.floor(hash2(i, j, 12) * 4)]},flower_amount=${1 + Math.floor(hash2(i, j, 13) * 4)}]`, 位: [i, j, h] });
        else if (u < cherryGrove.petalClusterRate + 0.12) placer({ 状态: 'minecraft:grass', 位: [i, j, h] });
        continue;
      }
      const grassDensity = plainsParams.grassRate * (0.55 + 0.9 * Math.max(0, fbm(fineNoise, i + 300, j, 14, 2) + 0.3));
      if (u < plainsParams.flowerRate) placer({ 状态: flowers[Math.floor(hash2(i, j, 14) * flowers.length)]!, 位: [i, j, h] });
      else if (u < plainsParams.flowerRate + grassDensity * plainsParams.tallGrassShare) {
        placer({ 状态: 'minecraft:tall_grass[half=lower]', 位: [i, j, h] });
        placer({ 状态: 'minecraft:tall_grass[half=upper]', 位: [i, j, h + 1] });
      } else if (u < plainsParams.flowerRate + grassDensity) placer({ 状态: 'minecraft:grass', 位: [i, j, h] });
    }
  return out;
};
