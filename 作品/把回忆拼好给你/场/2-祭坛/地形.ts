// 第 3 句祭坛四周的地：和第 1 句新世界同一片地（同一套生成法、同一组种子，地点/新世界地形.ts），祭坛摆在樱花林那座山的南坡脚下，
// 脚下压平一块（祭坛、你、镜头的路），往外慢慢接回原来的起伏；背后是山坡上的樱花林，两边是平原，远处照原版雾淡出（祭坛.tsx 补雾）。纯计算。
// 起伏、山、花、树和第 1 句共用 地点/新世界地形.ts、地点/原版树.ts；压平、铺列、平台上留空是这边自己的。
// 输出是祭坛的局部格：世界格 (i, j, k) = 局部 (x + 祭坛.世界[0], y + 祭坛.世界[1], z + 祭坛.地面)，祭坛圈心在局部原点、地面顶 z = 0（草方块在 k = −1）。
// 不转方向：方块和祭坛都对着世界的格子，鸟居朝北。
import type { PlacedBlock } from '@engine/model/方块拼搭.tsx';
import { fbm, hash2 } from '@engine/core/噪声.ts';
import { you, pillarTopMaterials, altarPos } from './参数.ts';
import { smoothstep } from '@engine/core/数学.ts';
import { plainsParams, cherryGrove, fineNoise, mountainHeightAt, plainsUndulation, isForest, groveTrees, plainsFlower, petalFacing } from '../../地点/新世界地形.ts';
import { oakTree, cherryTree } from '../../地点/原版树.ts';
/** 世界格 (i, j) 原来的地面高（出生点 0）。和 场/2-新世界/地形.ts 的 地面高 差在没加远山（第 1 句那边后加的，这边没跟；祭坛离出生点 129 格，在远山 起 70 格以外） */
export const originalGroundHeight = (i: number, j: number): number => Math.round(plainsUndulation(i, j) + mountainHeightAt(i, j));

const toWorld = (x: number, y: number): [number, number] => [x + altarPos.world[0], y + altarPos.world[1]];

/** 局部 (x, y) 离压平的那块有多远（格，在里面是 0） */
const distFromPlatform = (x: number, y: number) => {
  const p = altarPos.platform;
  const dx = Math.max(p.west - (x + 0.5), 0, x + 0.5 - p.east);
  const dy = Math.max(p.south - (y + 0.5), 0, y + 0.5 - p.north);
  return Math.hypot(dx, dy);
};

/** 局部 (x, y) 那一列地面顶的高（局部 z，祭坛脚下 0）：平台里是 0，往外 缓 格里接回原来的地 */
export const groundHeight = (x: number, y: number): number => {
  const [i, j] = toWorld(x, y);
  const rawHeight = originalGroundHeight(i, j) - altarPos.ground;
  const t = smoothstep(0, altarPos.platform.fadeDist, distFromPlatform(x, y));
  return Math.round(rawHeight * t);
};

/** 铺的范围（局部）：镜头一直朝北看，只铺前方一扇，同 场/2-新世界/参数.ts 地形范围 的做法 */
export const paved = (x: number, y: number): boolean => {
  const r = altarPos.bounds;
  if (y < r.south) return false;
  if (Math.abs(x + 0.5 - r.fanCenter[0]) > r.fanWidth + (y - r.fanCenter[1]) * r.fanSpread) return false;
  return Math.hypot(x + 0.5 - r.rangeCenter[0], y + 0.5 - r.rangeCenter[1]) <= r.radius;
};

type Tree = { x: number; y: number; kind: '橡' | '樱'; height: number; seed: number };

/** 樱花林里的树、平原上的橡树（地点/新世界地形.ts，换成局部格），离平台 让树 格以内的不种（树冠会伸进祭坛、挡镜头） */
export const trees = (): Tree[] =>
  groveTrees()
    .map((t) => ({ x: t.i - altarPos.world[0], y: t.j - altarPos.world[1], kind: t.kind, height: t.height, seed: t.seed }))
    .filter((t) => distFromPlatform(t.x, t.y) >= altarPos.treeClearance);

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
  const r = altarPos.bounds;
  const treeTable = trees();
  const treeKeys = new Set(treeTable.map((t) => `${t.x},${t.y}`));
  for (const t of treeTable) {
    if (!paved(t.x, t.y)) continue;
    const z0 = groundHeight(t.x, t.y);
    const placer = makePlacer(t.kind === '樱');
    const placeAboveGround = (b: PlacedBlock) => {
      if (b.位[2] >= groundHeight(b.位[0], b.位[1])) placer(b);
    };
    // 橡树叶去角的散列按世界格算（和第 1 句同一棵树长得一样），放的时候换回局部格；樱花树的随机只看种子，直接在局部格长
    if (t.kind === '橡') {
      const [ti, tj] = toWorld(t.x, t.y);
      oakTree({ i: ti, j: tj, height: t.height, seed: t.seed }, z0, (b) => placeAboveGround({ ...b, 位: [b.位[0] - altarPos.world[0], b.位[1] - altarPos.world[1], b.位[2]] }));
    } else cherryTree({ i: t.x, j: t.y, height: t.height, seed: t.seed }, z0, placeAboveGround);
  }
  for (let y = r.south; y <= r.north; y++)
    for (let x = r.west; x <= r.east; x++) {
      if (!paved(x, y)) continue;
      const [i, j] = toWorld(x, y);
      const inForest = isForest(i, j);
      const placer = makePlacer(inForest);
      const h = groundHeight(x, y);
      let bottom = h;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) bottom = Math.min(bottom, groundHeight(x + dx, y + dy));
      placer({ state: treeKeys.has(`${x},${y}`) ? 'minecraft:dirt' : 'minecraft:grass_block[snowy=false]', 位: [x, y, h - 1] });
      for (let k = h - 2; k >= bottom - 1; k--) placer({ state: h - 1 - k > 3 ? 'minecraft:stone' : 'minecraft:dirt', 位: [x, y, k] });
      if (treeKeys.has(`${x},${y}`)) continue;
      if (distFromPlatform(x, y) === 0 && isEmptyAbove(x, y)) continue;
      if (Math.hypot(x, y) > r.plantRadius && !inForest) continue;
      const u = hash2(i, j, 11);
      if (inForest) {
        if (u < cherryGrove.petalClusterRate) placer({ state: `minecraft:pink_petals[facing=${petalFacing[Math.floor(hash2(i, j, 12) * 4)]},flower_amount=${1 + Math.floor(hash2(i, j, 13) * 4)}]`, 位: [x, y, h] });
        else if (u < cherryGrove.petalClusterRate + 0.12) placer({ state: 'minecraft:grass', 位: [x, y, h] });
        continue;
      }
      const grassDensity = plainsParams.grassRate * (0.55 + 0.9 * Math.max(0, fbm(fineNoise, i + 300, j, 14, 2) + 0.3));
      if (u < plainsParams.flowerRate) placer({ state: plainsFlower(i, j), 位: [x, y, h] });
      else if (u < plainsParams.flowerRate + grassDensity * plainsParams.tallGrassShare) {
        placer({ state: 'minecraft:tall_grass[half=lower]', 位: [x, y, h] });
        placer({ state: 'minecraft:tall_grass[half=upper]', 位: [x, y, h + 1] });
      } else if (u < plainsParams.flowerRate + grassDensity) placer({ state: 'minecraft:grass', 位: [x, y, h] });
    }
  return out;
};
