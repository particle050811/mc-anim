// 门口小木屋四周的地：屋子四周一块平地往外起伏的平原，西北边一道缓坡上是樱花林，零星几棵橡树。纯计算（不 import react、three），测试直接引。
// 用户 10-24「而且怎么超平坦背景 合理吗？」：地平线上要有起伏、樱花林、树，远处照原版的雾淡出，几句的背景看得出是同一片地。
// 出处：数和长法照 末地雷雨 那一路 2b716b1 的 场/2-雷雨/地形.ts（第 6、7 句屋子四周的地）一字不改抄来，第 8 句门口的屋后远景（屋后远景.tsx）铺的是同一片地；
//   那边的 平地 在 场/2-雷雨/弹坑.ts，这里抄成常数（地点不许引场）。两边合进 main 以后该留一份：场/2-雷雨/地形.ts 改成引这里（同一组数铺出同样的方块，测试对过）。
// 铺多大一扇看镜头：四周方块 的 范围 默认是第 6、7 句那一扇（从屋子南边朝北张开），门口机位的屋后远景（屋后远景.tsx）用 屋后远景范围。
// 门口机位（第 8～11 句）那一扇不长樱花林：用户 10-25 看第 13 句「背景从什么都没有到长成一片樱花林」，门口身后的坡要到第 13 句才一棵棵冒出樱花树（樱花林.ts），
//   在那之前这片坡上只有草、花和零星橡树，不然林子先有后没。第 6、7 句（场/2-雷雨/地形.ts 自己那份）主会话 10-25 定不动。
// 坐标同 门口小木屋.tsx：格 (i, j, k) 占 x ∈ [i − 0.5, i + 0.5]、y ∈ [j, j + 1]、z ∈ [k, k + 1]，屋前地面顶 z = 0（草方块是 k = −1）。
import type { PlacedBlock } from '@engine/model/方块拼搭.tsx';
import { fbm, hash2, simplex2, smoothstep } from '@engine/core/噪声.ts';
import { cherryTree, oakTree, type VanillaTree } from './原版树.ts';

/** 屋子四周那块平地（地面顶 z 0）：i、j 的范围（同 场/2-雷雨/弹坑.ts 的 平地）。外面从 0 起坡 */
export const flatArea = { west: -16, east: 16, south: -12, north: 12 } as const;
/** 平原：起伏几格、多大一片（格）；出了平地 坡宽 格才起伏满 */
export const plainsParams = { 种子: 61906, 起伏: 2.6, undulationScale: 52, fineUndulation: 0.6, fineUndulationScale: 14, slopeWidth: 14, grassRate: 0.22, tallGrassShare: 0.18, flowerRate: 0.02 } as const;
/** 樱花林：一道缓坡（心、山脚半径、顶半径、高），林子在 林半径 以内，每 树距 见方一棵。屋子在林子东南边上，最近的樱花树离后墙十来格（Agent 暂定） */
export const cherryGrove = { 心: [-16, 40] as const, mountainHeight: 6, mountainRadius: 40, topRadius: 12, mountainJitter: 0.3, mountainJitterScale: 30, forestRadius: 30, treeSpacing: 7, treeRate: 0.85, petalClusterRate: 0.35 } as const;
/** 零星几棵橡树 [i, j, 树干高]：屋子东北、东边远处（Agent 摆的） */
export const oaks: readonly (readonly [number, number, number])[] = [
  [22, 26, 5],
  [38, 58, 6],
  [-44, 96, 5],
  [64, 34, 5],
  [12, 92, 4],
];

/** 铺哪一扇：从 扇心 往北张开（扇心处宽 ± 扇宽，往北每格两边各宽 扇张），离 扇心 不超过 半径（要过雾止 192，雾里不露地形的边）；
 *  花草只铺到离 扇心 植物半径（再远一株不到两个像素），樱花林里都铺 */
export type SurroundRange = {
  south: number;
  fanCenter: readonly [number, number];
  fanWidth: number;
  fanSpread: number;
  radius: number;
  plantRadius: number;
  /** false：不长樱花林（樱花树、粉红花簇都没有，那道坡照平原铺草、花，群系 plains）；不给 = 长 */
  cherryGrove?: boolean;
};
/** 第 6、7 句那一扇（同 场/2-雷雨/地形.ts 的 地形范围：仰机位的眼在 (2.5, −30)，画面宽 94°） */
export const terrainRange: SurroundRange = { south: -40, fanCenter: [2.5, -34], fanWidth: 30, fanSpread: 1.2, radius: 205, plantRadius: 90 };
/** 第 8 句起门口机位屋后那一扇（屋后远景.tsx）：眼睛在 (取景中心 x, −6)（远景视距 6），N = 10 的整屏取景画面左右边沿的视线张开 8 / 6，
 *  扇张 1.4 盖住，再留取景中心左右挪的余量；雾按离眼睛的水平距离 192 格淡完，半径要过它。不长樱花林（见文件头） */
export const behindHouseRange: SurroundRange = { south: -6, fanCenter: [0, -6], fanWidth: 6, fanSpread: 1.4, radius: 200, plantRadius: 90, cherryGrove: false };

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

/** (i, j) 那一列地面顶的高度（整数格，屋前平地 0）：平地外 坡宽 格里起伏慢慢长满，樱花林那道坡也从平地边上起 */
export const groundHeight = (i: number, j: number): number => {
  const slope = smoothstep(0, plainsParams.slopeWidth, distFromFlat(i, j));
  const undulation = plainsParams.起伏 * fbm(noise, i, j, plainsParams.undulationScale, 3) + plainsParams.fineUndulation * fbm(fineNoise, i, j, plainsParams.fineUndulationScale, 2);
  return Math.round((undulation + mountainHeightAt(i, j)) * slope);
};

/** 这一列铺不铺：平地以外、扇面以内 */
export const paved = (i: number, j: number, r: SurroundRange = terrainRange): boolean => {
  if (distFromFlat(i, j) === 0) return false;
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
  return out;
};

const flowers = ['minecraft:dandelion', 'minecraft:poppy', 'minecraft:oxeye_daisy', 'minecraft:cornflower', 'minecraft:azure_bluet'] as const;
const petalFacing = ['north', 'east', 'south', 'west'] as const;

export type SurroundBlocks = { plains: PlacedBlock[]; cherryGrove: PlacedBlock[] };

/** 平地以外、范围 里铺出来的方块：平原（群系 plains）、樱花林（群系 cherry_grove：草色、树叶色按它染）分两份 */
export const SurroundBlocks = (r: SurroundRange = terrainRange): SurroundBlocks => {
  const occupied = new Set<string>();
  const out: SurroundBlocks = { plains: [], cherryGrove: [] };
  const makePlacer = (inForest: boolean) => (b: PlacedBlock) => {
    const k = `${b.位[0]},${b.位[1]},${b.位[2]}`;
    if (occupied.has(k)) return;
    occupied.add(k);
    (inForest ? out.cherryGrove : out.plains).push(b);
  };
  const cherryAllowed = r.cherryGrove !== false;
  const treeTable = trees().filter((t) => cherryAllowed || t.种 !== '樱');
  const treeKeys = new Set(treeTable.map((t) => `${t.i},${t.j}`));
  // 先放树（树叶占了的格，地上的草、花就不放了）；钻进地里的枝叶不放（原版树只长在空气、能替换的格里）
  for (const t of treeTable) {
    if (!paved(t.i, t.j, r)) continue;
    const z0 = groundHeight(t.i, t.j);
    const placer = makePlacer(t.种 === '樱');
    (t.种 === '橡' ? oakTree : cherryTree)(t, z0, (b) => {
      if (b.位[2] >= groundHeight(b.位[0], b.位[1]) && distFromFlat(b.位[0], b.位[1]) > 0) placer(b);
    });
  }
  const northEdge = r.fanCenter[1] + r.radius;
  const fanHalfWidth = r.fanWidth + (northEdge - r.fanCenter[1]) * r.fanSpread;
  for (let j = r.south; j <= northEdge; j++)
    for (let i = Math.floor(r.fanCenter[0] - fanHalfWidth); i <= Math.ceil(r.fanCenter[0] + fanHalfWidth); i++) {
      if (!paved(i, j, r)) continue;
      const inForest = cherryAllowed && (inGrove(i, j) || Math.hypot(i - cherryGrove.心[0], j - cherryGrove.心[1]) <= cherryGrove.mountainRadius * 0.8);
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
