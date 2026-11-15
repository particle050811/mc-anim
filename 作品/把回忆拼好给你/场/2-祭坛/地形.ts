// 第 3 句祭坛四周的地：和第 1 句新世界同一片地（同一套生成法、同一组种子，参数.ts 的 新世界地形），祭坛摆在樱花林那座山的南坡脚下，
// 脚下压平一块（祭坛、你、镜头的路），往外慢慢接回原来的起伏；背后是山坡上的樱花林，两边是平原，远处照原版雾淡出（祭坛.tsx 补雾）。纯计算。
// 生成法照抄 场/2-新世界/地形.ts（场之间不能互引；那边改了这里要一起改，见 参数.ts 新世界地形 的注释）。
// 输出是祭坛的局部格：世界格 (i, j, k) = 局部 (x + 祭坛.世界[0], y + 祭坛.世界[1], z + 祭坛.地面)，祭坛圈心在局部原点、地面顶 z = 0（草方块在 k = −1）。
// 不转方向：方块和祭坛都对着世界的格子，鸟居朝北。
import type { PlacedBlock } from '@engine/model/方块拼搭.tsx';
import { fbm, hash2, simplex2 } from '@engine/core/噪声.ts';
import { you, pillarTopMaterials, altarPos, newWorldTerrain } from './参数.ts';
import { smoothstep, randInt, mulberry32 } from '@engine/core/数学.ts';

const { plainsParams, cherryGrove } = newWorldTerrain;
const noise = simplex2(plainsParams.种子);
const fineNoise = simplex2(plainsParams.种子 + 7);
const mountainNoise = simplex2(plainsParams.种子 + 13);
const flowerNoise = simplex2(plainsParams.种子 + 29);

/** 樱花林那座山在世界格 (i, j) 有多高（同 场/2-新世界/地形.ts） */
const mountainHeightAt = (i: number, j: number): number => {
  const L = cherryGrove;
  const distance = Math.hypot(i - L.心[0], j - L.心[1]);
  const jitter = 1 + L.mountainJitter * fbm(mountainNoise, i, j, L.mountainJitterScale, 3);
  const slope = smoothstep(L.mountainRadius * jitter, L.topRadius * jitter, distance);
  return L.mountainHeight * slope + L.slopeUndulation * fbm(mountainNoise, i + 500, j - 300, L.slopeUndulationScale, 2) * Math.min(1, slope * 3);
};

/** 世界格 (i, j) 原来的地面高（同 场/2-新世界/地形.ts 的 地面高，出生点 0） */
export const originalGroundHeight = (i: number, j: number): number => {
  const undulation = plainsParams.起伏 * fbm(noise, i, j, plainsParams.undulationScale, 3) + plainsParams.fineUndulation * fbm(fineNoise, i, j, plainsParams.fineUndulationScale, 2);
  const distFromSpawn = Math.hypot(i, j);
  const roughness = smoothstep(plainsParams.spawnFlatRadius, plainsParams.spawnFlatRadius * 3, distFromSpawn);
  return Math.round(undulation * roughness + mountainHeightAt(i, j));
};

const toWorld = (x: number, y: number): [number, number] => [x + altarPos.世界[0], y + altarPos.世界[1]];

/** 局部 (x, y) 离压平的那块有多远（格，在里面是 0） */
const distFromPlatform = (x: number, y: number) => {
  const p = altarPos.平台;
  const dx = Math.max(p.west - (x + 0.5), 0, x + 0.5 - p.east);
  const dy = Math.max(p.south - (y + 0.5), 0, y + 0.5 - p.north);
  return Math.hypot(dx, dy);
};

/** 局部 (x, y) 那一列地面顶的高（局部 z，祭坛脚下 0）：平台里是 0，往外 缓 格里接回原来的地 */
export const groundHeight = (x: number, y: number): number => {
  const [i, j] = toWorld(x, y);
  const rawHeight = originalGroundHeight(i, j) - altarPos.ground;
  const t = smoothstep(0, altarPos.平台.fadeDist, distFromPlatform(x, y));
  return Math.round(rawHeight * t);
};

/** 铺的范围（局部）：镜头一直朝北看，只铺前方一扇，同 场/2-新世界/参数.ts 地形范围 的做法 */
export const paved = (x: number, y: number): boolean => {
  const r = altarPos.范围;
  if (y < r.south) return false;
  if (Math.abs(x + 0.5 - r.fanCenter[0]) > r.fanWidth + (y - r.fanCenter[1]) * r.fanSpread) return false;
  return Math.hypot(x + 0.5 - r.rangeCenter[0], y + 0.5 - r.rangeCenter[1]) <= r.radius;
};

/** 世界格在不在樱花林里（群系、花簇、地上的树），同 场/2-新世界/地形.ts */
const inGrove = (i: number, j: number) => Math.hypot(i - cherryGrove.心[0], j - cherryGrove.心[1]) <= cherryGrove.forestRadius;
const cherryGroveBiome = (i: number, j: number) => inGrove(i, j) || Math.hypot(i - cherryGrove.心[0], j - cherryGrove.心[1]) <= cherryGrove.mountainRadius * 0.8;

type Tree = { x: number; y: number; 种: '橡' | '樱'; 高: number; 种子: number };

/** 樱花林里的树（同 场/2-新世界/地形.ts 的 树们，换成局部格），离平台 让树 格以内的不种（树冠会伸进祭坛、挡镜头） */
export const trees = (): Tree[] => {
  const out: Tree[] = [];
  const d = cherryGrove.treeSpacing;
  const [cx, cy] = cherryGrove.心;
  for (let gx = Math.floor((cx - cherryGrove.forestRadius) / d); gx <= Math.ceil((cx + cherryGrove.forestRadius) / d); gx++)
    for (let gy = Math.floor((cy - cherryGrove.forestRadius) / d); gy <= Math.ceil((cy + cherryGrove.forestRadius) / d); gy++) {
      const i = Math.round(gx * d + (hash2(gx, gy, 1) - 0.5) * d * 0.7);
      const j = Math.round(gy * d + (hash2(gx, gy, 2) - 0.5) * d * 0.7);
      if (!inGrove(i, j) || hash2(gx, gy, 3) > cherryGrove.treeRate) continue;
      out.push({ x: i - altarPos.世界[0], y: j - altarPos.世界[1], 种: '樱', 高: 0, 种子: gx * 131 + gy });
    }
  for (const [i, j, treeHeight] of plainsParams.oaks) out.push({ x: i - altarPos.世界[0], y: j - altarPos.世界[1], 种: '橡', 高: treeHeight, 种子: i * 7 + j });
  return out.filter((t) => distFromPlatform(t.x, t.y) >= altarPos.treeClearance);
};

const tulips = ['minecraft:orange_tulip', 'minecraft:red_tulip', 'minecraft:pink_tulip', 'minecraft:white_tulip'] as const;
const tallFlowers = ['minecraft:poppy', 'minecraft:azure_bluet', 'minecraft:oxeye_daisy', 'minecraft:cornflower'] as const;
/** 原版 flower_plain（同 场/2-新世界/地形.ts 的 平原花，世界格） */
const plainsFlower = (i: number, j: number): string => {
  if (fbm(flowerNoise, i, j, plainsParams.tulipScale, 2) < plainsParams.tulipThreshold) return tulips[Math.floor(hash2(i, j, 14) * 4)]!;
  return hash2(i, j, 15) < 1 / 3 ? tallFlowers[Math.floor(hash2(i, j, 14) * 4)]! : 'minecraft:dandelion';
};
const petalFacing = ['north', 'east', 'south', 'west'] as const;

/** 橡树（原版 TreeFeatures.OAK，同 场/2-新世界/地形.ts） */
const oakTree = (t: Tree, z0: number, place: (b: PlacedBlock) => void) => {
  const top = z0 + t.高;
  for (let k = z0; k < top; k++) place({ 状态: 'minecraft:oak_log[axis=y]', 位: [t.x, t.y, k] });
  const [ti, tj] = toWorld(t.x, t.y);
  for (let dz = -3; dz <= 0; dz++) {
    const r = dz >= -1 ? 1 : 2;
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++) {
        if (dx === 0 && dy === 0 && dz < 0) continue;
        const corner = Math.abs(dx) === r && Math.abs(dy) === r;
        if (corner && (dz === 0 || hash2(ti + dx, tj + dy, 40 + dz) < 0.5)) continue;
        place({ 状态: 'minecraft:oak_leaves', 位: [t.x + dx, t.y + dy, top + dz] });
      }
  }
};
type Dir2D = readonly [number, number];
const fourDirs: readonly Dir2D[] = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const horizontalLog = (d: Dir2D) => `minecraft:cherry_log[axis=${d[0] !== 0 ? 'x' : 'z'}]`;
const verticalLog = 'minecraft:cherry_log[axis=y]';
const cherryLeaves = 'minecraft:cherry_leaves';

/** 樱花树：原版 1.20.1 CherryTrunkPlacer、CherryFoliagePlacer 的长法（同 场/2-新世界/地形.ts 的 樱花树，那边注释写了各数的出处） */
const cherryTree = (t: Tree, z0: number, place: (b: PlacedBlock) => void) => {
  const r = mulberry32(t.种子 * 2654435761 + 97);
  const treeHeight = 7 + randInt(r, 0, 1);
  const branchStart = Math.max(0, treeHeight - 1 + randInt(r, -4, -3));
  let secondBranchStart = Math.max(0, treeHeight - 1 + randInt(r, -4, -4));
  if (secondBranchStart >= branchStart) secondBranchStart++;
  const branchCount = randInt(r, 1, 3);
  const trunkHeight = branchCount === 3 ? treeHeight : branchCount === 2 ? Math.max(branchStart, secondBranchStart) + 1 : branchStart + 1;
  for (let k = 0; k < trunkHeight; k++) place({ 状态: verticalLog, 位: [t.x, t.y, z0 + k] });
  const branch = (d: Dir2D, start: number, notAtTop: boolean): [number, number, number] => {
    const m = [t.x, t.y, z0 + start];
    const end = treeHeight - 1 + randInt(r, -1, 0);
    const horizontalFirst = notAtTop || end < start;
    const branchLength = randInt(r, 2, 4) + (horizontalFirst ? 1 : 0);
    const tip = [t.x + d[0] * branchLength, t.y + d[1] * branchLength, z0 + end];
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
  if (branchCount === 3) leafPoints.push([t.x, t.y, z0 + trunkHeight]);
  const d = fourDirs[randInt(r, 0, 3)]!;
  leafPoints.push(branch(d, branchStart, branchStart < trunkHeight - 1));
  if (branchCount >= 2) leafPoints.push(branch([-d[0], -d[1]], secondBranchStart, secondBranchStart < trunkHeight - 1));
  for (const p of leafPoints) cherryLeafBlob(p, r, place);
};

/** CherryFoliagePlacer 的一团叶子（同 场/2-新世界/地形.ts） */
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

/** 平台上不长东西的地方：祭坛圈里、柱子和鸟居脚下、你站的地方、镜头底下那一条（镜头前面几格的草会大得糊住画面下沿） */
const isEmptyAbove = (x: number, y: number) => {
  const cx = x + 0.5, cy = y + 0.5;
  if (Math.hypot(cx, cy) < altarPos.ringClear) return true;
  if (pillarTopMaterials.some(({ pillarPos: [px, py] }) => Math.abs(cx - px) < 1.2 && Math.abs(cy - py) < 1.2)) return true;
  if (Math.abs(cy - 3.5) < 1 && Math.abs(cx) < 4.5) return true;
  if (Math.abs(cx - you.feet[0]) < 1.2 && Math.abs(cy - you.feet[1]) < 1.2) return true;
  const track = altarPos.shotBounds;
  return cx > track.west && cx < track.east && cy > track.south && cy < track.north;
};

export type AltarTerrainBlocks = { plains: PlacedBlock[]; cherryGrove: PlacedBlock[] };

/** 铺出来的全部方块（局部格）：平原、樱花林分两份（群系不同，草和树叶染色不同） */
export const AltarTerrainBlocks = (): AltarTerrainBlocks => {
  const occupied = new Set<string>();
  const out: AltarTerrainBlocks = { plains: [], cherryGrove: [] };
  const makePlacer = (inForest: boolean) => (b: PlacedBlock) => {
    const k = `${b.位[0]},${b.位[1]},${b.位[2]}`;
    if (occupied.has(k)) return;
    occupied.add(k);
    (inForest ? out.cherryGrove : out.plains).push(b);
  };
  const r = altarPos.范围;
  const treeTable = trees();
  const treeKeys = new Set(treeTable.map((t) => `${t.x},${t.y}`));
  for (const t of treeTable) {
    if (!paved(t.x, t.y)) continue;
    const z0 = groundHeight(t.x, t.y);
    const placer = makePlacer(t.种 === '樱');
    (t.种 === '橡' ? oakTree : cherryTree)(t, z0, (b) => {
      if (b.位[2] >= groundHeight(b.位[0], b.位[1])) placer(b);
    });
  }
  for (let y = r.south; y <= r.north; y++)
    for (let x = r.west; x <= r.east; x++) {
      if (!paved(x, y)) continue;
      const [i, j] = toWorld(x, y);
      const inForest = cherryGroveBiome(i, j);
      const placer = makePlacer(inForest);
      const h = groundHeight(x, y);
      let bottom = h;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) bottom = Math.min(bottom, groundHeight(x + dx, y + dy));
      placer({ 状态: treeKeys.has(`${x},${y}`) ? 'minecraft:dirt' : 'minecraft:grass_block[snowy=false]', 位: [x, y, h - 1] });
      for (let k = h - 2; k >= bottom - 1; k--) placer({ 状态: h - 1 - k > 3 ? 'minecraft:stone' : 'minecraft:dirt', 位: [x, y, k] });
      if (treeKeys.has(`${x},${y}`)) continue;
      if (distFromPlatform(x, y) === 0 && isEmptyAbove(x, y)) continue;
      if (Math.hypot(x, y) > r.plantRadius && !inForest) continue;
      const u = hash2(i, j, 11);
      if (inForest) {
        if (u < cherryGrove.petalClusterRate) placer({ 状态: `minecraft:pink_petals[facing=${petalFacing[Math.floor(hash2(i, j, 12) * 4)]},flower_amount=${1 + Math.floor(hash2(i, j, 13) * 4)}]`, 位: [x, y, h] });
        else if (u < cherryGrove.petalClusterRate + 0.12) placer({ 状态: 'minecraft:grass', 位: [x, y, h] });
        continue;
      }
      const grassDensity = plainsParams.grassRate * (0.55 + 0.9 * Math.max(0, fbm(fineNoise, i + 300, j, 14, 2) + 0.3));
      if (u < plainsParams.flowerRate) placer({ 状态: plainsFlower(i, j), 位: [x, y, h] });
      else if (u < plainsParams.flowerRate + grassDensity * plainsParams.tallGrassShare) {
        placer({ 状态: 'minecraft:tall_grass[half=lower]', 位: [x, y, h] });
        placer({ 状态: 'minecraft:tall_grass[half=upper]', 位: [x, y, h + 1] });
      } else if (u < plainsParams.flowerRate + grassDensity) placer({ 状态: 'minecraft:grass', 位: [x, y, h] });
    }
  return out;
};
