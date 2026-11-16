// 第 1 句的新世界：你第一次进这个世界时脚下那片原版 1.20.1 平原，远处地平线上一座小山上是樱花林。纯计算（不 import react、three），测试直接引。
// 不是存档导出的：按原版平原的样子手搓（起伏一两格的草地、短草、高草、原版 flower_plain 的九种花、零星几棵橡树；樱花林在山坡上，
// 樱花树照原版 CherryTrunkPlacer、CherryFoliagePlacer 的长法，地上铺粉红花簇；远处一道道缓坡，坡上两片橡树林）。随机都用定死的噪声和散列（不是原版的随机数，长出来的样子同一套规则），
// 同一组参数每次出一样的方块。只铺镜头看得到的那一扇（参数.ts 的 地形范围），背后的不铺。
// 第 1 句尾到 2-第一晚 镜头落到你挖坑那一格的地面剖面：剖面附近的列（剖面列）另铺到地下（剖面方块、剥排方块），新世界方块 本身不变（别的段拿它当远景）。
// 坐标照场景约定：x 东、y 北、z 上，格 (i, j, k) 占 [i, i+1]×[j, j+1]×[k, k+1]；出生点那格地面顶在 z = 0（草方块是 k = −1 那格）。
import type { PlacedBlock } from '@engine/model/方块拼搭.tsx';
import { fbm, hash2, simplex2 } from '@engine/core/噪声.ts';
import { terrainRange, crossSection, pit, farGroves, farHills } from './参数.ts';
import { smoothstep } from '@engine/core/数学.ts';
import { plainsParams, cherryGrove, fineNoise, mountainHeightAt, plainsUndulation, isForest, groveTrees, plainsFlower, petalFacing, type GroveTree } from '../../地点/新世界地形.ts';
import { oakTree, cherryTree } from '../../地点/原版树.ts';

const farNoise = simplex2(plainsParams.seed + 41);

const radPerDeg = Math.PI / 180;
/** 从出生点看樱花林的方位角（弧度，0 朝北、正 = 偏东） */
const groveAzimuth = Math.atan2(cherryGrove.心[0], cherryGrove.心[1]);

/** 远山在 (i, j) 抬多高（格，小数）：离出生点 远山.起 以内是 0，到 远山.满 抬满；坡的形状是低频噪声，樱花林方向让开 */
const farHillHeightAt = (i: number, j: number): number => {
  const distance = Math.hypot(i, j);
  if (distance <= farHills.start) return 0;
  const angleOffset = Math.abs(Math.atan2(i, j) - groveAzimuth);
  const clearing = smoothstep(farHills.forestYieldDeg[0] * radPerDeg, farHills.forestYieldDeg[1] * radPerDeg, angleOffset);
  const slope = Math.min(1, Math.max(0, fbm(farNoise, i, j, farHills.scale, 3) + farHills.offset));
  return farHills.height * smoothstep(farHills.start, farHills.full, distance) * clearing * slope;
};

/** (i, j) 那一列地面顶的高度（整数格，出生点 0） */
export const groundHeight = (i: number, j: number): number => {
  const mountain = mountainHeightAt(i, j) + farHillHeightAt(i, j);
  // 出生点附近 平 = 0、离樱花林远，山 = 0：出生点那格正好是 0
  return Math.round(plainsUndulation(i, j) + mountain);
};

/** 这一列在不在铺的范围里：镜头前方一扇（从 扇心 往北张开），离 远心 不超过 半径 */
export const paved = (i: number, j: number): boolean => {
  const r = terrainRange;
  if (j < r.south) return false;
  if (Math.abs(i + 0.5 - r.fanCenter[0]) > r.fanWidth + (j - r.fanCenter[1]) * r.fanSpread) return false;
  return Math.hypot(i + 0.5 - r.rangeCenter[0], j + 0.5 - r.rangeCenter[1]) <= r.radius;
};

/** 树的位置：樱花林里按格子撒（每 樱花林.树距 见方一棵，抖一抖），平原上零星几棵橡树（平原.橡树们，Agent 摆的），远林里同样按格子撒橡树 */
export const trees = (): GroveTree[] => {
  const out = groveTrees();
  farGroves.forEach((grove, n) => {
    const [lx, ly] = grove.心;
    const e = grove.treeSpacing;
    for (let gx = Math.floor((lx - grove.radius) / e); gx <= Math.ceil((lx + grove.radius) / e); gx++)
      for (let gy = Math.floor((ly - grove.radius) / e); gy <= Math.ceil((ly + grove.radius) / e); gy++) {
        const i = Math.round(gx * e + (hash2(gx, gy, 21 + n) - 0.5) * e * 0.7);
        const j = Math.round(gy * e + (hash2(gx, gy, 22 + n) - 0.5) * e * 0.7);
        if (Math.hypot(i - lx, j - ly) > grove.radius) continue;
        out.push({ i, j, kind: '橡', height: 4 + Math.floor(hash2(gx, gy, 23 + n) * 3), seed: i * 7 + j });
      }
  });
  return out;
};

/** 一列地：顶上草方块（树干底下原版换成泥土，TrunkPlacer.setDirtAt），往下泥土三格、再往下石头，填到 底（不给 = 侧面露出来的那么深：四邻里最低的那格顶往下一格）；
 *  长草时地上铺草、花。新世界方块 和剖面共用这一个铺法，同一列铺出来一样 */
const column = (i: number, j: number, place: (b: PlacedBlock) => void, o: { hasTree: boolean; bottom?: number; growGrass?: boolean }) => {
  const inForest = isForest(i, j);
  const h = groundHeight(i, j);
  let bottom = h;
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) bottom = Math.min(bottom, groundHeight(i + di, j + dj));
  const lowestY = o.bottom ?? bottom - 1;
  place({ state: o.hasTree ? 'minecraft:dirt' : 'minecraft:grass_block[snowy=false]', 位: [i, j, h - 1] });
  for (let k = h - 2; k >= lowestY; k--) place({ state: h - 1 - k > 3 ? 'minecraft:stone' : 'minecraft:dirt', 位: [i, j, k] });
  if (o.hasTree || o.growGrass === false) return;
  // 地上的东西：平原上只铺到离出生点 植物半径（再远一株草不到几个像素，原版远处也一样有，这里省掉）
  if (Math.hypot(i, j) > terrainRange.plantRadius && !inForest) return;
  const u = hash2(i, j, 11);
  if (inForest) {
    if (u < cherryGrove.petalClusterRate) place({ state: `minecraft:pink_petals[facing=${petalFacing[Math.floor(hash2(i, j, 12) * 4)]},flower_amount=${1 + Math.floor(hash2(i, j, 13) * 4)}]`, 位: [i, j, h] });
    else if (u < cherryGrove.petalClusterRate + 0.12) place({ state: 'minecraft:grass', 位: [i, j, h] });
    return;
  }
  // 平原：草丛成片（噪声），高草夹在里面，花零星
  const grassDensity = plainsParams.grassRate * (0.55 + 0.9 * Math.max(0, fbm(fineNoise, i + 300, j, 14, 2) + 0.3));
  if (u < plainsParams.flowerRate) place({ state: plainsFlower(i, j), 位: [i, j, h] });
  else if (u < plainsParams.flowerRate + grassDensity * plainsParams.tallGrassShare) {
    place({ state: 'minecraft:tall_grass[half=lower]', 位: [i, j, h] });
    place({ state: 'minecraft:tall_grass[half=upper]', 位: [i, j, h + 1] });
  } else if (u < plainsParams.flowerRate + grassDensity) place({ state: 'minecraft:grass', 位: [i, j, h] });
};

export type NewWorldBlocks = { plains: PlacedBlock[]; cherryGrove: PlacedBlock[] };

/** 铺出来的全部方块：平原（群系 plains）、樱花林（群系 cherry_grove：草色、树叶色按它染）分两份 */
export const NewWorldBlocks = (): NewWorldBlocks => {
  const occupied = new Set<string>();
  const out: NewWorldBlocks = { plains: [], cherryGrove: [] };
  const makePlacer = (inForest: boolean) => (b: PlacedBlock) => {
    const k = `${b.位[0]},${b.位[1]},${b.位[2]}`;
    if (occupied.has(k)) return;
    occupied.add(k);
    (inForest ? out.cherryGrove : out.plains).push(b);
  };
  const r = terrainRange;
  const treeTable = trees();
  const treeKeys = new Set(treeTable.map((t) => `${t.i},${t.j}`));
  // 先放树（树叶占了的格，地上的草、花就不放了）；原版树只长在空气、能替换的格里，钻进地里的枝叶不放
  for (const t of treeTable) {
    if (!paved(t.i, t.j)) continue;
    const z0 = groundHeight(t.i, t.j);
    const placer = makePlacer(t.kind === '樱');
    (t.kind === '橡' ? oakTree : cherryTree)(t, z0, (b) => {
      if (b.位[2] >= groundHeight(b.位[0], b.位[1])) placer(b);
    });
  }
  for (let j = r.south; j <= r.north; j++)
    for (let i = r.west; i <= r.east; i++) {
      if (!paved(i, j)) continue;
      column(i, j, makePlacer(isForest(i, j)), { hasTree: treeKeys.has(`${i},${j}`) });
    }
  return out;
};

// ---------- 剖面（第 1 句尾到 2-第一晚：你挖坑那一格的地面剖面） ----------

/** 坑挖到哪一步：挖掉 = 从草方块往下挖掉了几格（0～坑.深），顶土 = 头顶填上的那格（放在草方块原来的位置）。2-第一晚 的编排算 */
export type PitState = { dugCount: number; dirtCovered: boolean };

/** 这一列归剖面的哪一截：'剖' = 坑这一排和后墙那一排（按坑态重铺），'剥' = 坑和镜头之间撤掉的那几排，null = 不归剖面（新世界方块 照常铺）。
 *  这两截从 新世界方块 里拿掉，另外铺到 剖面.底（世界.tsx 分开建网格） */
export const sectionColumn = (i: number, j: number): '剖' | '剥' | null => {
  if ((j === pit.j || j === pit.j + 1) && Math.abs(i - pit.i) <= crossSection.halfWidth) return '剖';
  if (j >= pit.j - crossSection.stripRows && j < pit.j && Math.abs(i - pit.i) <= crossSection.stripHalfWidth) return '剥';
  return null;
};

/** 坑这一排、后墙那一排（一张表）：照 新世界方块 的铺法铺到 剖面.底；坑那一格按坑态挖掉、填土，坑左右 让草 列内不长草、不开花；
 *  后墙（坑后面那一格）草方块以下压暗到 剖面.后墙亮（草方块的顶面在地面上看得见，不压，它朝洞里那面由 2-第一晚 另压） */
export const crossSectionBlocks = (pitState: PitState): PlacedBlock[] => {
  const out: PlacedBlock[] = [];
  for (const j of [pit.j, pit.j + 1])
    for (let i = pit.i - crossSection.halfWidth; i <= pit.i + crossSection.halfWidth; i++) {
      if (!paved(i, j)) continue;
      const isPitCell = i === pit.i && j === pit.j;
      const backWall = i === pit.i && j === pit.j + 1;
      const h = groundHeight(i, j);
      column(i, j, (b) => {
        const k = b.位[2];
        if (isPitCell && k < h && k >= h - pitState.dugCount) return;
        out.push(backWall && k < h - 1 ? { ...b, brightness: crossSection.backWallLight } : b);
      }, { hasTree: false, bottom: crossSection.bottom, growGrass: Math.abs(i - pit.i) > crossSection.grassClearDist });
      if (isPitCell && pitState.dirtCovered) out.push({ state: 'minecraft:dirt', 位: [i, j, h - 1] });
    }
  return out;
};

/** 坑和镜头之间还没撤掉的那几排（一张表）：撤了 剥了 排（从镜头那头撤起），剩下的照 新世界方块 的铺法铺到 剖面.底，最前面那排的南面就是切面 */
export const stripBlocks = (peeled: number): PlacedBlock[] => {
  const out: PlacedBlock[] = [];
  for (let j = pit.j - crossSection.stripRows + peeled; j < pit.j; j++)
    for (let i = pit.i - crossSection.stripHalfWidth; i <= pit.i + crossSection.stripHalfWidth; i++) if (paved(i, j)) column(i, j, (b) => out.push(b), { hasTree: false, bottom: crossSection.bottom });
  return out;
};
