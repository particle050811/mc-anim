// 第 1 句的新世界：你第一次进这个世界时脚下那片原版 1.20.1 平原，远处地平线上一座小山上是樱花林。纯计算（不 import react、three），测试直接引。
// 不是存档导出的：按原版平原的样子手搓（起伏一两格的草地、短草、高草、原版 flower_plain 的九种花、零星几棵橡树；樱花林在山坡上，
// 樱花树照原版 CherryTrunkPlacer、CherryFoliagePlacer 的长法，地上铺粉红花簇；远处一道道缓坡，坡上两片橡树林）。随机都用定死的噪声和散列（不是原版的随机数，长出来的样子同一套规则），
// 同一组参数每次出一样的方块。只铺镜头看得到的那一扇（参数.ts 的 地形范围），背后的不铺。
// 第 1 句尾到 2-第一晚 镜头落到你挖坑那一格的地面剖面：剖面附近的列（剖面列）另铺到地下（剖面方块、剥排方块），新世界方块 本身不变（别的段拿它当远景）。
// 坐标照场景约定：x 东、y 北、z 上，格 (i, j, k) 占 [i, i+1]×[j, j+1]×[k, k+1]；出生点那格地面顶在 z = 0（草方块是 k = −1 那格）。
import type { PlacedBlock } from '@engine/model/方块拼搭.tsx';
import { fbm, hash2, simplex2, smoothstep } from '@engine/core/噪声.ts';
import { terrainRange, crossSection, pit, cherryGrove, plainsParams, farGroves, farHills } from './参数.ts';

const noise = simplex2(plainsParams.种子);
const fineNoise = simplex2(plainsParams.种子 + 7);
const mountainNoise = simplex2(plainsParams.种子 + 13);
const flowerNoise = simplex2(plainsParams.种子 + 29);
const farNoise = simplex2(plainsParams.种子 + 41);

const radPerDeg = Math.PI / 180;
/** 从出生点看樱花林的方位角（弧度，0 朝北、正 = 偏东） */
const groveAzimuth = Math.atan2(cherryGrove.心[0], cherryGrove.心[1]);

/** 远山在 (i, j) 抬多高（格，小数）：离出生点 远山.起 以内是 0，到 远山.满 抬满；坡的形状是低频噪声，樱花林方向让开 */
const farHillHeightAt = (i: number, j: number): number => {
  const distance = Math.hypot(i, j);
  if (distance <= farHills.起) return 0;
  const angleOffset = Math.abs(Math.atan2(i, j) - groveAzimuth);
  const clearing = smoothstep(farHills.forestYieldDeg[0] * radPerDeg, farHills.forestYieldDeg[1] * radPerDeg, angleOffset);
  const slope = Math.min(1, Math.max(0, fbm(farNoise, i, j, farHills.scale, 3) + farHills.offset));
  return farHills.高 * smoothstep(farHills.起, farHills.full, distance) * clearing * slope;
};

/** 樱花林那座山在 (i, j) 有多高（格，小数）：山脚、山顶的半径按噪声扭，坡上、顶上加一点起伏 */
const mountainHeightAt = (i: number, j: number): number => {
  const L = cherryGrove;
  const distance = Math.hypot(i - L.心[0], j - L.心[1]);
  const jitter = 1 + L.mountainJitter * fbm(mountainNoise, i, j, L.mountainJitterScale, 3);
  const slope = smoothstep(L.mountainRadius * jitter, L.topRadius * jitter, distance);
  return L.mountainHeight * slope + L.slopeUndulation * fbm(mountainNoise, i + 500, j - 300, L.slopeUndulationScale, 2) * Math.min(1, slope * 3);
};

/** (i, j) 那一列地面顶的高度（整数格，出生点 0） */
export const groundHeight = (i: number, j: number): number => {
  const undulation = plainsParams.起伏 * fbm(noise, i, j, plainsParams.undulationScale, 3) + plainsParams.fineUndulation * fbm(fineNoise, i, j, plainsParams.fineUndulationScale, 2);
  const mountain = mountainHeightAt(i, j) + farHillHeightAt(i, j);
  // 出生点附近压平一点：你站的那块地是平的
  const distFromSpawn = Math.hypot(i, j);
  const roughness = smoothstep(plainsParams.spawnFlatRadius, plainsParams.spawnFlatRadius * 3, distFromSpawn);
  // 出生点附近 平 = 0、离樱花林远，山 = 0：出生点那格正好是 0
  return Math.round(undulation * roughness + mountain);
};

/** 这一列在不在铺的范围里：镜头前方一扇（从 扇心 往北张开），离 远心 不超过 半径 */
export const paved = (i: number, j: number): boolean => {
  const r = terrainRange;
  if (j < r.south) return false;
  if (Math.abs(i + 0.5 - r.fanCenter[0]) > r.fanWidth + (j - r.fanCenter[1]) * r.fanSpread) return false;
  return Math.hypot(i + 0.5 - r.rangeCenter[0], j + 0.5 - r.rangeCenter[1]) <= r.radius;
};

/** 离樱花林中心多远算樱花林（群系、花簇、地上的树） */
const inGrove = (i: number, j: number) => Math.hypot(i - cherryGrove.心[0], j - cherryGrove.心[1]) <= cherryGrove.forestRadius;

/** 高：橡树的树干高（樱花树的高按原版自己抽，写 0） */
type Tree = { i: number; j: number; 种: '橡' | '樱'; 高: number; 种子: number };

/** 树的位置：樱花林里按格子撒（每 樱花林.树距 见方一棵，抖一抖），平原上零星几棵橡树（平原.橡树们，Agent 摆的），远林里同样按格子撒橡树 */
export const trees = (): Tree[] => {
  const out: Tree[] = [];
  const d = cherryGrove.treeSpacing;
  const [cx, cy] = cherryGrove.心;
  for (let gx = Math.floor((cx - cherryGrove.forestRadius) / d); gx <= Math.ceil((cx + cherryGrove.forestRadius) / d); gx++)
    for (let gy = Math.floor((cy - cherryGrove.forestRadius) / d); gy <= Math.ceil((cy + cherryGrove.forestRadius) / d); gy++) {
      const i = Math.round(gx * d + (hash2(gx, gy, 1) - 0.5) * d * 0.7);
      const j = Math.round(gy * d + (hash2(gx, gy, 2) - 0.5) * d * 0.7);
      if (!inGrove(i, j) || hash2(gx, gy, 3) > cherryGrove.treeRate) continue;
      out.push({ i, j, 种: '樱', 高: 0, 种子: gx * 131 + gy });
    }
  for (const [i, j, treeHeight] of plainsParams.oaks) out.push({ i, j, 种: '橡', 高: treeHeight, 种子: i * 7 + j });
  farGroves.forEach((grove, n) => {
    const [lx, ly] = grove.心;
    const e = grove.treeSpacing;
    for (let gx = Math.floor((lx - grove.radius) / e); gx <= Math.ceil((lx + grove.radius) / e); gx++)
      for (let gy = Math.floor((ly - grove.radius) / e); gy <= Math.ceil((ly + grove.radius) / e); gy++) {
        const i = Math.round(gx * e + (hash2(gx, gy, 21 + n) - 0.5) * e * 0.7);
        const j = Math.round(gy * e + (hash2(gx, gy, 22 + n) - 0.5) * e * 0.7);
        if (Math.hypot(i - lx, j - ly) > grove.radius) continue;
        out.push({ i, j, 种: '橡', 高: 4 + Math.floor(hash2(gx, gy, 23 + n) * 3), 种子: i * 7 + j });
      }
  });
  return out;
};

const tulips = ['minecraft:orange_tulip', 'minecraft:red_tulip', 'minecraft:pink_tulip', 'minecraft:white_tulip'] as const;
const tallFlowers = ['minecraft:poppy', 'minecraft:azure_bluet', 'minecraft:oxeye_daisy', 'minecraft:cornflower'] as const;
/** 原版 flower_plain：噪声低于阈出郁金香（四种随机），不然三分之一出 高花们 里随机一种，其余蒲公英 */
export const plainsFlower = (i: number, j: number): string => {
  if (fbm(flowerNoise, i, j, plainsParams.tulipScale, 2) < plainsParams.tulipThreshold) return tulips[Math.floor(hash2(i, j, 14) * 4)]!;
  return hash2(i, j, 15) < 1 / 3 ? tallFlowers[Math.floor(hash2(i, j, 14) * 4)]! : 'minecraft:dandelion';
};
const petalFacing = ['north', 'east', 'south', 'west'] as const;

/** 橡树（原版 TreeFeatures.OAK：树干 4～6、两层 5×5 叶子去角随机、上两层 3×3 十字） */
const oakTree = (t: Tree, z0: number, place: (b: PlacedBlock) => void) => {
  const top = z0 + t.高;
  for (let k = z0; k < top; k++) place({ 状态: 'minecraft:oak_log[axis=y]', 位: [t.i, t.j, k] });
  for (let dz = -3; dz <= 0; dz++) {
    const r = dz >= -1 ? 1 : 2;
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++) {
        if (dx === 0 && dy === 0 && dz < 0) continue;
        const corner = Math.abs(dx) === r && Math.abs(dy) === r;
        if (corner && (dz === 0 || hash2(t.i + dx, t.j + dy, 40 + dz) < 0.5)) continue;
        place({ 状态: 'minecraft:oak_leaves', 位: [t.i + dx, t.j + dy, top + dz] });
      }
  }
};

/** 定死的随机数（mulberry32），一棵树一个种子 */
const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
/** [lo, hi] 里的整数 */
const randInt = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

type Dir2D = readonly [number, number];
/** 水平四向，按顺时针（北、东、南、西；场景 y 朝北） */
const fourDirs: readonly Dir2D[] = [[0, 1], [1, 0], [0, -1], [-1, 0]];
/** 原木顺着哪根轴：东西向是原版 axis=x，南北向是原版 axis=z（场景 y 是原版 −z） */
const horizontalLog = (d: Dir2D) => `minecraft:cherry_log[axis=${d[0] !== 0 ? 'x' : 'z'}]`;
const verticalLog = 'minecraft:cherry_log[axis=y]';
const cherryLeaves = 'minecraft:cherry_leaves';

/**
 * 樱花树，照原版 1.20.1 的 cherry 配置（TreeFeatures.CHERRY）：
 * 树干 CherryTrunkPlacer(7, 1, 0, 枝数 1/2/3 等概率, 枝横长 2～4, 枝起离顶 −4～−3, 枝末离顶 −1～0)：主干长到最高的枝起处（三枝时长满），
 *   一根枝从主干往一个水平方向先横出一两格，再斜着走（每步按还差的竖直比例随机往上或往前）到枝末，枝末上面一格挂一团叶子；两枝时另一根朝反方向，三枝时主干顶上也挂一团。
 * 叶子 CherryFoliagePlacer(半径 4, 偏移 0, 高 5, 底层边上缺 0.25, 角上缺 0.25, 垂叶 1/6, 垂叶再长 1/3)：一团五层，往上 2 层半径 1、2，
 *   中间、往下一层半径 3（边角随机缺），往下两层半径 2；下面两层的外圈底下随机垂一两格叶子。
 */
const cherryTree = (t: Tree, z0: number, place: (b: PlacedBlock) => void) => {
  const r = rng(t.种子 * 2654435761 + 97);
  const treeHeight = 7 + randInt(r, 0, 1);
  const branchStart = Math.max(0, treeHeight - 1 + randInt(r, -4, -3));
  let secondBranchStart = Math.max(0, treeHeight - 1 + randInt(r, -4, -4));
  if (secondBranchStart >= branchStart) secondBranchStart++;
  const branchCount = randInt(r, 1, 3);
  const trunkHeight = branchCount === 3 ? treeHeight : branchCount === 2 ? Math.max(branchStart, secondBranchStart) + 1 : branchStart + 1;
  for (let k = 0; k < trunkHeight; k++) place({ 状态: verticalLog, 位: [t.i, t.j, z0 + k] });
  // 一根枝：从主干 起 那一格往 d 走，返回挂叶子的那一格
  const branch = (d: Dir2D, start: number, notAtTop: boolean): [number, number, number] => {
    const m = [t.i, t.j, z0 + start];
    const end = treeHeight - 1 + randInt(r, -1, 0);
    const horizontalFirst = notAtTop || end < start;
    const branchLength = randInt(r, 2, 4) + (horizontalFirst ? 1 : 0);
    const tip = [t.i + d[0] * branchLength, t.j + d[1] * branchLength, z0 + end];
    for (let l = 0; l < (horizontalFirst ? 2 : 1); l++) {
      m[0] += d[0];
      m[1] += d[1];
      place({ 状态: horizontalLog(d), 位: [m[0]!, m[1]!, m[2]!] });
    }
    const vertDir = tip[2]! > m[2]! ? 1 : -1;
    for (;;) {
      const manhattanDiff = Math.abs(tip[0]! - m[0]!) + Math.abs(tip[1]! - m[1]!) + Math.abs(tip[2]! - m[2]!);
      if (manhattanDiff === 0) return [tip[0]!, tip[1]!, tip[2]! + 1];
      const vertical = r() < Math.abs(tip[2]! - m[2]!) / manhattanDiff;
      if (vertical) m[2] += vertDir;
      else {
        m[0] += d[0];
        m[1] += d[1];
      }
      place({ 状态: vertical ? verticalLog : horizontalLog(d), 位: [m[0]!, m[1]!, m[2]!] });
    }
  };
  const leafPoints: [number, number, number][] = [];
  if (branchCount === 3) leafPoints.push([t.i, t.j, z0 + trunkHeight]);
  const d = fourDirs[randInt(r, 0, 3)]!;
  leafPoints.push(branch(d, branchStart, branchStart < trunkHeight - 1));
  if (branchCount >= 2) leafPoints.push(branch([-d[0], -d[1]], secondBranchStart, secondBranchStart < trunkHeight - 1));
  for (const p of leafPoints) cherryLeafBlob(p, r, place);
};

/** CherryFoliagePlacer 的一团叶子（挂点 p） */
const cherryLeafBlob = (p: readonly [number, number, number], r: () => number, place: (b: PlacedBlock) => void) => {
  const leaves = new Set<string>();
  const placeLeaves = (x: number, y: number, z: number) => {
    leaves.add(`${x},${y},${z}`);
    place({ 状态: cherryLeaves, 位: [x, y, z] });
  };
  const skipCell = (ax: number, ly: number, ay: number, ring: number) => {
    if (ly === -1 && (ax === ring || ay === ring) && r() < 0.25) return true;
    const corner = ax === ring && ay === ring;
    if (ring > 2) return corner || (ax + ay > ring * 2 - 2 && r() < 0.25);
    return corner && r() < 0.25;
  };
  const leafLayer = (ring: number, ly: number) => {
    for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) if (!skipCell(Math.abs(dx), ly, Math.abs(dy), ring)) placeLeaves(p[0] + dx, p[1] + dy, p[2] + ly);
  };
  // 垂叶：外圈一圈（每边 圈 × 2 格）底下，上面有叶子的，1/6 垂一格，垂了的再 1/3 往下多垂一格；离挂点下面那格曼哈顿距离 7 以上的不垂
  const droop = (x: number, y: number, z: number, chance: number) => {
    if (Math.abs(x - p[0]) + Math.abs(y - p[1]) + Math.abs(z - (p[2] - 1)) >= 7) return false;
    if (r() > chance) return false;
    placeLeaves(x, y, z);
    return true;
  };
  const droopLeafLayer = (ring: number, ly: number) => {
    leafLayer(ring, ly);
    fourDirs.forEach((d, k) => {
      const d1 = fourDirs[(k + 1) % 4]!;
      let x = p[0] + d1[0] * ring - d[0] * ring, y = p[1] + d1[1] * ring - d[1] * ring;
      const z = p[2] + ly - 1;
      for (let n = -ring; n < ring; n++, x += d[0], y += d[1]) {
        if (leaves.has(`${x},${y},${z + 1}`) && droop(x, y, z, 1 / 6)) droop(x, y, z - 1, 1 / 3);
      }
    });
  };
  const R = 4 - 1;
  leafLayer(R - 2, 2);
  leafLayer(R - 1, 1);
  leafLayer(R, 0);
  droopLeafLayer(R, -1);
  droopLeafLayer(R - 1, -2);
};

/** 这一列的群系是不是樱花林（草色、树叶色按它染）：林子和山坡下半截 */
const isForest = (i: number, j: number) => inGrove(i, j) || Math.hypot(i - cherryGrove.心[0], j - cherryGrove.心[1]) <= cherryGrove.mountainRadius * 0.8;

/** 一列地：顶上草方块（树干底下原版换成泥土，TrunkPlacer.setDirtAt），往下泥土三格、再往下石头，填到 底（不给 = 侧面露出来的那么深：四邻里最低的那格顶往下一格）；
 *  长草时地上铺草、花。新世界方块 和剖面共用这一个铺法，同一列铺出来一样 */
const column = (i: number, j: number, place: (b: PlacedBlock) => void, o: { hasTree: boolean; bottom?: number; growGrass?: boolean }) => {
  const inForest = isForest(i, j);
  const h = groundHeight(i, j);
  let bottom = h;
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) bottom = Math.min(bottom, groundHeight(i + di, j + dj));
  const lowestY = o.bottom ?? bottom - 1;
  place({ 状态: o.hasTree ? 'minecraft:dirt' : 'minecraft:grass_block[snowy=false]', 位: [i, j, h - 1] });
  for (let k = h - 2; k >= lowestY; k--) place({ 状态: h - 1 - k > 3 ? 'minecraft:stone' : 'minecraft:dirt', 位: [i, j, k] });
  if (o.hasTree || o.growGrass === false) return;
  // 地上的东西：平原上只铺到离出生点 植物半径（再远一株草不到几个像素，原版远处也一样有，这里省掉）
  if (Math.hypot(i, j) > terrainRange.plantRadius && !inForest) return;
  const u = hash2(i, j, 11);
  if (inForest) {
    if (u < cherryGrove.petalClusterRate) place({ 状态: `minecraft:pink_petals[facing=${petalFacing[Math.floor(hash2(i, j, 12) * 4)]},flower_amount=${1 + Math.floor(hash2(i, j, 13) * 4)}]`, 位: [i, j, h] });
    else if (u < cherryGrove.petalClusterRate + 0.12) place({ 状态: 'minecraft:grass', 位: [i, j, h] });
    return;
  }
  // 平原：草丛成片（噪声），高草夹在里面，花零星
  const grassDensity = plainsParams.grassRate * (0.55 + 0.9 * Math.max(0, fbm(fineNoise, i + 300, j, 14, 2) + 0.3));
  if (u < plainsParams.flowerRate) place({ 状态: plainsFlower(i, j), 位: [i, j, h] });
  else if (u < plainsParams.flowerRate + grassDensity * plainsParams.tallGrassShare) {
    place({ 状态: 'minecraft:tall_grass[half=lower]', 位: [i, j, h] });
    place({ 状态: 'minecraft:tall_grass[half=upper]', 位: [i, j, h + 1] });
  } else if (u < plainsParams.flowerRate + grassDensity) place({ 状态: 'minecraft:grass', 位: [i, j, h] });
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
    const placer = makePlacer(t.种 === '樱');
    (t.种 === '橡' ? oakTree : cherryTree)(t, z0, (b) => {
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
  if ((j === pit.j || j === pit.j + 1) && Math.abs(i - pit.i) <= crossSection.半宽) return '剖';
  if (j >= pit.j - crossSection.stripRows && j < pit.j && Math.abs(i - pit.i) <= crossSection.stripHalfWidth) return '剥';
  return null;
};

/** 坑这一排、后墙那一排（一张表）：照 新世界方块 的铺法铺到 剖面.底；坑那一格按坑态挖掉、填土，坑左右 让草 列内不长草、不开花；
 *  后墙（坑后面那一格）草方块以下压暗到 剖面.后墙亮（草方块的顶面在地面上看得见，不压，它朝洞里那面由 2-第一晚 另压） */
export const crossSectionBlocks = (pitState: PitState): PlacedBlock[] => {
  const out: PlacedBlock[] = [];
  for (const j of [pit.j, pit.j + 1])
    for (let i = pit.i - crossSection.半宽; i <= pit.i + crossSection.半宽; i++) {
      if (!paved(i, j)) continue;
      const isPitCell = i === pit.i && j === pit.j;
      const backWall = i === pit.i && j === pit.j + 1;
      const h = groundHeight(i, j);
      column(i, j, (b) => {
        const k = b.位[2];
        if (isPitCell && k < h && k >= h - pitState.dugCount) return;
        out.push(backWall && k < h - 1 ? { ...b, brightness: crossSection.backWallLight } : b);
      }, { hasTree: false, bottom: crossSection.bottom, growGrass: Math.abs(i - pit.i) > crossSection.grassClearDist });
      if (isPitCell && pitState.dirtCovered) out.push({ 状态: 'minecraft:dirt', 位: [i, j, h - 1] });
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
