// 小木屋门口身后的地（第 13～15 句门这个机位的背景）：用户 10-24 问「怎么超平坦背景 合理吗？」，要起伏的地形、樱花林、树，远处照原版的雾淡出，
//   屋子就在第 1 句远处那片樱花林的边上。纯计算（不 import react、three），测试直接引。
// 两层，各是一张自己的侧剖面（像素比近景小一号 = 远一点，场/2-门口/林间门口.tsx 照近景的取景对齐、叠在近景后面）：
//   中景：屋子西边的缓坡，东边几棵原有的橡树；远景：再往后的一座山和平原的缓坡，淡进原版的雾里。
// 樱花林是她种的（告示牌「想我的时候就种棵樱花树吧」）：用户 10-25 看第 13 句「怎么是同步生长？ 应该是樱花树越来越多才对 背景从什么都没有到长成一片樱花林」。
//   生长 0（第 13 句起风以前、第 12 句末横移出屋）两层坡上只有草、花和零星橡树；第 13 句跟着日历，樱花树从门口那棵树苗身后起往两边、往远处一棵棵冒出来，
//   每棵一冒出来就是长成的原版整棵（原版树苗长成树是一刻之内的事），越冒越快；生长 1（第 13 句末、第 14、15 句）两层长满，和原来开满的林子一样。
// 樱花树照原版 1.20.1 CherryTrunkPlacer、CherryFoliagePlacer 的长法（同 地点/原版树.ts 的规则，这里按种子另写一份长在原点），
//   橡树照原版 oak（StraightTrunkPlacer 4～6、BlobFoliagePlacer 半径 2）；随机用定死的散列，同一组参数每次出一样的方块。
// 坐标：每层自己的格（x 东、y 往里、z 上），这一层最前一排地面顶在 z = 0；树位、起伏、种下的先后都是 Agent 暂定。
import { fbm, hash2, simplex2 } from '@engine/core/噪声.ts';
import type { PlacedBlock } from '@engine/model/方块拼搭.tsx';
import { randInt, mulberry32 } from '@engine/core/数学.ts';

type Position = [number, number, number];
type Dir2D = readonly [number, number];
/** 水平四向（北、东、南、西；y 往里 = 北） */
const fourDirs: readonly Dir2D[] = [[0, 1], [1, 0], [0, -1], [-1, 0]];
/** 横着的原木：东西向是原版 axis=x，南北向是 axis=z */
const horizontalLog = (d: Dir2D) => `minecraft:cherry_log[axis=${d[0] !== 0 ? 'x' : 'z'}]`;
const verticalLog = 'minecraft:cherry_log[axis=y]';
const cherryLeaves = 'minecraft:cherry_leaves';

/** 一组方块，同一格只放第一次（原版树先放树干、枝，叶子不顶掉木头） */
const newBlockGroup = () => {
  const occupiedBlocks = new Map<string, PlacedBlock>();
  const place = (b: PlacedBlock) => {
    const k = b.位.join(',');
    if (!occupiedBlocks.has(k)) occupiedBlocks.set(k, b);
  };
  return { 放: place, 有: (x: number, y: number, z: number) => occupiedBlocks.has(`${x},${y},${z}`), 全: () => [...occupiedBlocks.values()] };
};

/**
 * 一棵长成的原版樱花树（TreeFeatures.CHERRY），相对树根那格 [0, 0, 0]（地面上第一格）：
 * 树干 CherryTrunkPlacer(7, 1, 0, 枝数 1/2/3 等概率, 枝横长 2～4, 枝起离顶 −4～−3, 枝末离顶 −1～0)：主干长到最高的枝起处，
 *   一根枝往一个水平方向先横出一两格，再斜着走（每步按还差的竖直比例随机往上或往前）到枝末，枝末上面一格挂一团叶子；两枝时另一根朝反方向，三枝时主干顶上也挂一团。
 * 叶子 CherryFoliagePlacer(半径 4, 高 5, 底层边上缺 0.25, 角上缺 0.25, 垂叶 1/6, 垂叶再长 1/3)：往上两层半径 1、2，中间、往下一层半径 3（边角随机缺），
 *   往下两层半径 2；下面两层的外圈底下随机垂一两格叶子。
 */
export const vanillaCherryTree = (seed: number): PlacedBlock[] => {
  const blockGroup = newBlockGroup();
  const placeBlock = (blockState: string, x: number, y: number, z: number) => blockGroup.放({ state: blockState, 位: [x, y, z] });
  const r = mulberry32(seed * 2654435761 + 97);
  const treeHeight = 7 + randInt(r, 0, 1);
  const branchStart = Math.max(0, treeHeight - 1 + randInt(r, -4, -3));
  let secondBranchStart = Math.max(0, treeHeight - 1 + randInt(r, -4, -4));
  if (secondBranchStart >= branchStart) secondBranchStart++;
  const branchCount = randInt(r, 1, 3);
  const trunkHeight = branchCount === 3 ? treeHeight : branchCount === 2 ? Math.max(branchStart, secondBranchStart) + 1 : branchStart + 1;
  for (let k = 0; k < trunkHeight; k++) placeBlock(verticalLog, 0, 0, k);
  const branch = (d: Dir2D, start: number, notAtTop: boolean): Position => {
    const m: Position = [0, 0, start];
    const end = treeHeight - 1 + randInt(r, -1, 0);
    const horizontalFirst = notAtTop || end < start;
    const branchLength = randInt(r, 2, 4) + (horizontalFirst ? 1 : 0);
    const tip: Position = [d[0] * branchLength, d[1] * branchLength, end];
    for (let l = 0; l < (horizontalFirst ? 2 : 1); l++) {
      m[0] += d[0];
      m[1] += d[1];
      placeBlock(horizontalLog(d), ...m);
    }
    const vertDir = tip[2] > m[2] ? 1 : -1;
    for (;;) {
      const manhattanDiff = Math.abs(tip[0] - m[0]) + Math.abs(tip[1] - m[1]) + Math.abs(tip[2] - m[2]);
      if (manhattanDiff === 0) return [tip[0], tip[1], tip[2] + 1];
      const vertical = r() < Math.abs(tip[2] - m[2]) / manhattanDiff;
      if (vertical) m[2] += vertDir;
      else {
        m[0] += d[0];
        m[1] += d[1];
      }
      placeBlock(vertical ? verticalLog : horizontalLog(d), ...m);
    }
  };
  const leafPoints: Position[] = [];
  if (branchCount === 3) leafPoints.push([0, 0, trunkHeight]);
  const d = fourDirs[randInt(r, 0, 3)]!;
  leafPoints.push(branch(d, branchStart, branchStart < trunkHeight - 1));
  if (branchCount >= 2) leafPoints.push(branch([-d[0], -d[1]], secondBranchStart, secondBranchStart < trunkHeight - 1));
  for (const p of leafPoints) {
    const leaves = new Set<string>();
    const placeLeaves = (x: number, y: number, z: number) => {
      leaves.add(`${x},${y},${z}`);
      placeBlock(cherryLeaves, x, y, z);
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
      fourDirs.forEach((dd, k) => {
        const d1 = fourDirs[(k + 1) % 4]!;
        let x = p[0] + d1[0] * ring - dd[0] * ring;
        let y = p[1] + d1[1] * ring - dd[1] * ring;
        const z = p[2] + ly - 1;
        for (let n = -ring; n < ring; n++, x += dd[0], y += dd[1]) if (leaves.has(`${x},${y},${z + 1}`) && droop(x, y, z, 1 / 6)) droop(x, y, z - 1, 1 / 3);
      });
    };
    leafLayer(1, 2);
    leafLayer(2, 1);
    leafLayer(3, 0);
    droopLeafLayer(3, -1);
    droopLeafLayer(2, -2);
  }
  return blockGroup.全();
};

/** 一棵原版橡树（TreeFeatures.OAK：树干 4～6、BlobFoliagePlacer 半径 2 高 3），相对树根那格 */
export const vanillaOak = (seed: number): PlacedBlock[] => {
  const blockGroup = newBlockGroup();
  const r = mulberry32(seed * 40503 + 11);
  const treeHeight = 4 + randInt(r, 0, 2);
  for (let k = 0; k < treeHeight; k++) blockGroup.放({ state: 'minecraft:oak_log[axis=y]', 位: [0, 0, k] });
  for (let dz = -3; dz <= 0; dz++) {
    const ring = dz >= -1 ? 1 : 2;
    for (let dx = -ring; dx <= ring; dx++)
      for (let dy = -ring; dy <= ring; dy++) {
        const corner = Math.abs(dx) === ring && Math.abs(dy) === ring;
        if (corner && (dz === 0 || r() < 0.5)) continue;
        blockGroup.放({ state: 'minecraft:oak_leaves', 位: [dx, dy, treeHeight + dz] });
      }
  }
  return blockGroup.全();
};

/** 把相对树根的方块挪到 根 */
const shiftBlocks = (bs: readonly PlacedBlock[], root: Position): PlacedBlock[] => bs.map((b) => ({ ...b, 位: [b.位[0] + root[0], b.位[1] + root[1], b.位[2] + root[2]] as Position }));

const cherryCache = new Map<number, PlacedBlock[]>();
const oakCache = new Map<number, PlacedBlock[]>();
const getCherryBlocks = (seed: number) => {
  let b = cherryCache.get(seed);
  if (!b) cherryCache.set(seed, (b = vanillaCherryTree(seed)));
  return b;
};
const getOakBlocks = (seed: number) => {
  let b = oakCache.get(seed);
  if (!b) oakCache.set(seed, (b = vanillaOak(seed)));
  return b;
};

/** 一棵树：出 = 生长到几时冒出来（0～1，见 冒出）；原有的橡树 −1，一直在 */
export type ForestTree = { x: number; y: number; kind: '樱' | '橡'; seed: number; 出: number };
type PendingTree = Omit<ForestTree, '出'>;

// ---------- 中景：她种下的那片樱花林 ----------

/** 中景：N = 4（近景 N 8、10 的一半上下），顶面同近景（往里每排画面上升 32 成片像素）；铺 行 排、x 左～右；屋子东边（x > 林东）只有零星几棵原有的橡树 */
/** 地左：地比树往左多铺一截（树照 左 种，改 左 树位全挪）。第 12 句末横移出卧室、2-时差 接入那几帧林子往左看得更远，原来左沿露出地的断面（核查 10-24） */
export const midGrove = { N: 4, topDepth: 2, 行: 6, left: -36, groundLeft: -56, right: 32, seed: 1310, forestEast: 2 } as const;

const midNoise = simplex2(midGrove.seed);

/** 中景 (x, y) 那一列地面顶的高度（整数格）：往里慢慢抬，左右按噪声起伏；最前一排是 0（接近景草地的后沿） */
export const midGroundHeight = (x: number, y: number): number =>
  Math.max(0, Math.round(0.28 * y + 1.3 * fbm(midNoise, x, 0, 11, 2) * Math.min(1, y / 2.5) + 0.4 * fbm(midNoise, x + 300, y, 4, 1) * Math.min(1, y / 2)));

/** 中景的树位：樱花树每 4～5 格一棵，前后两排错开；东边是原有的橡树。
 *  核查 10-24「2-时差 末尾要看得出是林子」：原来每 5 格一棵，门口那棵大树后面只露出两三根树干，加密到每 4 格 */
const midTreePos: readonly PendingTree[] = (() => {
  const out: PendingTree[] = [];
  let n = 0;
  for (let x = midGrove.left + 2; x <= midGrove.right - 2; x += 4) {
    n++;
    const row = n % 2 === 0 ? 2 : 4;
    const xx = x + Math.round((hash2(x, 3, 7) - 0.5) * 2);
    const inCherryZone = xx <= midGrove.forestEast;
    if (!inCherryZone && hash2(x, 5, 9) < 0.45) continue;
    out.push({ x: xx, y: row, kind: inCherryZone ? '樱' : '橡', seed: 7000 + n });
  }
  return out;
})();

/** 地面：草方块，前面露出来的侧面往下填到前一排的顶；树底下换泥土。长满的樱花树脚下铺一圈粉红花簇，空地上零星短草、花 */
const layGround = (left: number, right: number, rows: number, heightAt: (x: number, y: number) => number, blockGroup: ReturnType<typeof newBlockGroup>, treeCells: Set<string>, biomeAt?: (x: number, y: number) => string | undefined, grassRate = 0.22) => {
  for (let y = 0; y < rows; y++)
    for (let x = left; x <= right; x++) {
      const h = heightAt(x, y);
      const bottom = y === 0 ? -3 : Math.min(h, heightAt(x, y - 1)) - 1;
      const g = biomeAt?.(x, y);
      const treeBelow = treeCells.has(`${x},${y}`);
      blockGroup.放({ state: treeBelow ? 'minecraft:dirt' : 'minecraft:grass_block[snowy=false]', 位: [x, y, h - 1], biome: g });
      for (let k = h - 2; k >= bottom; k--) blockGroup.放({ state: 'minecraft:dirt', 位: [x, y, k] });
      if (treeBelow || blockGroup.有(x, y, h)) continue;
      const s = hash2(x, y, 31);
      if (s < grassRate) blockGroup.放({ state: 'minecraft:grass', 位: [x, y, h], biome: g });
      else if (s < grassRate + 0.03) blockGroup.放({ state: hash2(x, y, 37) < 0.5 ? 'minecraft:dandelion' : 'minecraft:poppy', 位: [x, y, h] });
    }
};

/** 这一刻在不在：生长 到了它的 出（原有的橡树一直在） */
export const isPresent = (t: ForestTree, growth: number) => growth >= t.出;

const midCache = new Map<string, PlacedBlock[]>();
/** 中景的全部方块（群系 plains），生长 = 第 13 句的生长进度（0～1；第 14、15 句给 1）。按哪几棵在缓存 */
export const midBlocks = (growth: number): PlacedBlock[] => {
  const presentTrees = midTrees.map((t) => isPresent(t, growth));
  const cacheKey = presentTrees.map(Number).join('');
  let out = midCache.get(cacheKey);
  if (out) return out;
  const blockGroup = newBlockGroup();
  const treeCells = new Set<string>();
  midTrees.forEach((t, n) => {
    if (!presentTrees[n]) return;
    const h = midGroundHeight(t.x, t.y);
    treeCells.add(`${t.x},${t.y}`);
    const root: Position = [t.x, t.y, h];
    const bs = shiftBlocks(t.kind === '橡' ? getOakBlocks(t.seed) : getCherryBlocks(t.seed), root);
    // 钻进地里的枝叶不放（原版树只长在空气里）
    for (const b of bs) if (b.位[2] >= midGroundHeight(b.位[0], b.位[1]) && b.位[1] >= 0 && b.位[1] < midGrove.行 + 4) blockGroup.放(b);
    if (t.kind === '樱')
      for (let dx = -2; dx <= 2; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const x = t.x + dx, y = t.y + dy;
          if ((dx || dy) && y >= 0 && y < midGrove.行 && hash2(x, y, 41) < 0.6 && !blockGroup.有(x, y, midGroundHeight(x, y)))
            blockGroup.放({ state: `minecraft:pink_petals[facing=${['north', 'east', 'south', 'west'][(x + y + 8) % 4]},flower_amount=${(Math.abs(x * 3 + y) % 3) + 2}]`, 位: [x, y, midGroundHeight(x, y)] });
        }
  });
  layGround(midGrove.groundLeft, midGrove.right, midGrove.行, midGroundHeight, blockGroup, treeCells);
  midCache.set(cacheKey, (out = blockGroup.全()));
  return out;
};

// ---------- 远景：第 1 句那座樱花林山和平原 ----------

/** 远景：N = 2，纯侧面（顶面 0：远处的地往里不再上抬，只看得出山的轮廓）；铺 行 排。
 *  山：樱花林那座山在 山心x（屋子西边，同第 1 句「屋子在樱花林边上」），山高、山半径（格）；别处是平原的缓坡，屋子东边（东坡x）一道矮坡 */
/** 地左：同 中景 的 地左 */
export const farLayer = { N: 2, topDepth: 0, 行: 14, left: -60, groundLeft: -100, right: 60, seed: 20230607, mountainCenterX: -30, mountainCenterY: 9, mountainHeight: 11, mountainRadius: 26, topRadius: 8, eastSlopeX: 30 } as const;

const farNoise = simplex2(farLayer.seed);
const onMountain = (x: number, y: number) => Math.hypot(x - farLayer.mountainCenterX, (y - farLayer.mountainCenterY) * 2) < farLayer.mountainRadius * 0.75;

/** 远景 (x, y) 那一列地面顶的高度（整数格）：平原两三格的缓坡，西边一座樱花林的山 */
export const farGroundHeight = (x: number, y: number): number => {
  const plainHeight = 3 + 2.6 * fbm(farNoise, x, y, 15, 2) + 0.2 * y + 4 * Math.max(0, 1 - Math.abs(x - farLayer.eastSlopeX) / 18);
  const distance = Math.hypot(x - farLayer.mountainCenterX, (y - farLayer.mountainCenterY) * 2);
  const slope = Math.max(0, Math.min(1, (farLayer.mountainRadius - distance) / (farLayer.mountainRadius - farLayer.topRadius)));
  const mountain = farLayer.mountainHeight * slope * slope * (3 - 2 * slope) * (1 + 0.15 * fbm(farNoise, x + 200, y, 9, 2));
  return Math.max(1, Math.round(plainHeight + mountain));
};

/** 远景的树位：山上一片樱花树（每 4～5 格），平原上零星橡树 */
const farTreePos: readonly PendingTree[] = (() => {
  const out: PendingTree[] = [];
  for (let y = 4; y < farLayer.行; y += 3)
    for (let x = farLayer.left + 2; x <= farLayer.right - 2; x += 4) {
      const xx = x + Math.round((hash2(x, y, 51) - 0.5) * 3);
      const seed = 9000 + x * 37 + y;
      if (onMountain(xx, y)) {
        if (hash2(x, y, 53) < 0.85) out.push({ x: xx, y, kind: '樱', seed: seed });
      } else if (hash2(x, y, 57) < 0.12) out.push({ x: xx, y, kind: '橡', seed: seed });
    }
  return out;
})();

// ---------- 第 13 句樱花树一棵棵冒出来的先后 ----------

/** 用户 10-25「应该是樱花树越来越多才对」：樱花树一棵一棵冒出来，出 = 冒出来那一刻的 生长（场/2-门口/分屏参数.ts：生长 = 日历吹走的页数 ÷ 页数）。
 *  先远后近：远景（N 2，一棵在左屏上约 4 格宽，手机上四十来像素）先在山坡上一棵棵冒，看得出数目在变多；中景的树（N 4，一棵占左屏小半）冒一棵就盖住一大片坡，
 *  放在后头、越冒越快地把近处的坡也盖满（试过远近混着冒：中景两三棵一出来坡就整片是粉的，后面再冒的远景都在它背后看不见）。
 *  每层里先冒的是门口那棵树苗（第 13 句左屏近景 N 近N 时 x 树苗x）正后方那棵，往后每次挑离已经冒出来的都最远的那棵（树冠在画面上的位置），
 *  树冠先一棵棵散开在坡上、分得出一棵棵，再往空当里补满（试过按离树苗远近排：挨着的几棵树冠一冒就粘成一团粉）。
 *  左屏看得见的（树干在 看得见 里）匀开在吹走的页上：远景头一棵跟着头一页，单独站一会儿（她这时蹲下），其余匀开在 远景页；中景匀开在 中景页；
 *  页是越吹越快的，树也就越冒越快。树干在左屏外的都在最后一页（和门口那棵同一帧，分屏参数.ts 的 门口长成帧）。Agent 暂定 */
export const popOut = { nearCount: 8, saplingX: -5, visibleRange: [-9.5, 0.5], pageCount: 99, farPages: [7, 49], midPages: [52, 92] } as const;

const arranged = (() => {
  const revealTimes = new Map<PendingTree, number>();
  /** 一层：N、顶面、地面高 用来算树冠在画面上的位置（这一层的格）；页们(r, K) = 第 r 个冒出来的在第几页 */
  const arrangeLayer = (ts: readonly PendingTree[], N: number, topDepth: number, groundHeight: (x: number, y: number) => number, pageOf: (r: number, K: number) => number) => {
    const cherryTrees = ts.filter((t) => t.kind === '樱');
    const visibleTrees = cherryTrees.filter((t) => {
      const nx = (t.x * N) / popOut.nearCount;
      return nx >= popOut.visibleRange[0] && nx <= popOut.visibleRange[1];
    });
    // 树冠中心在画面上：x，高 = 地面 + 往里每排上升 顶面/N + 原版樱花树冠中心离地约 6 格
    const posOf = (t: PendingTree) => [t.x, groundHeight(t.x, t.y) + (t.y * topDepth) / N + 6] as const;
    const saplingX = (popOut.saplingX * popOut.nearCount) / N;
    const remaining = [...visibleTrees];
    const placed: PendingTree[] = [];
    const dist = (a: PendingTree, b: PendingTree) => Math.hypot(posOf(a)[0] - posOf(b)[0], posOf(a)[1] - posOf(b)[1]);
    while (remaining.length) {
      const pickIndex = placed.length
        ? remaining.reduce((best, t) => (Math.min(...placed.map((u) => dist(t, u))) > Math.min(...placed.map((u) => dist(best, u))) ? t : best))
        : remaining.reduce((best, t) => (Math.abs(t.x - saplingX) < Math.abs(best.x - saplingX) ? t : best));
      placed.push(pickIndex);
      remaining.splice(remaining.indexOf(pickIndex), 1);
    }
    placed.forEach((t, r) => revealTimes.set(t, pageOf(r, placed.length) / popOut.pageCount));
    for (const t of cherryTrees) if (!revealTimes.has(t)) revealTimes.set(t, 1);
  };
  /** 第 r 个（共 K 个）匀开在 [a, b] 页上 */
  const lerpRound = ([a, b]: readonly [number, number], r: number, K: number) => Math.round(a + ((b - a) * r) / Math.max(1, K - 1));
  arrangeLayer(farTreePos, farLayer.N, farLayer.topDepth, farGroundHeight, (r, K) => (r === 0 ? 1 : lerpRound(popOut.farPages, r - 1, K - 1)));
  arrangeLayer(midTreePos, midGrove.N, midGrove.topDepth, midGroundHeight, (r, K) => lerpRound(popOut.midPages, r, K));
  const withExit = (ts: readonly PendingTree[]): ForestTree[] => ts.map((t) => ({ ...t, 出: revealTimes.get(t) ?? -1 }));
  return { 中: withExit(midTreePos), far: withExit(farTreePos) };
})();

/** 中景的树（出 见 冒出） */
export const midTrees: readonly ForestTree[] = arranged.中;
/** 远景的树（出 见 冒出） */
export const farTrees: readonly ForestTree[] = arranged.far;

const farCache = new Map<string, PlacedBlock[]>();
/** 远景的全部方块（山上的草、树叶按樱花林群系染色），生长 同 中景方块。按哪几棵在缓存 */
export const farBlocks = (growth: number): PlacedBlock[] => {
  const presentFlags = farTrees.map((t) => isPresent(t, growth));
  const cacheKey = presentFlags.map(Number).join('');
  let out = farCache.get(cacheKey);
  if (out) return out;
  const blockGroup = newBlockGroup();
  const presentTrees = farTrees.filter((_, n) => presentFlags[n]);
  const treeCells = new Set(presentTrees.map((t) => `${t.x},${t.y}`));
  for (const t of presentTrees) {
    const root: Position = [t.x, t.y, farGroundHeight(t.x, t.y)];
    const bs = t.kind === '橡' ? shiftBlocks(getOakBlocks(t.seed), root) : shiftBlocks(getCherryBlocks(t.seed), root);
    for (const b of bs) if (b.位[2] >= farGroundHeight(b.位[0], b.位[1])) blockGroup.放({ ...b, biome: t.kind === '樱' ? 'minecraft:cherry_grove' : undefined });
  }
  layGround(farLayer.groundLeft, farLayer.right, farLayer.行, farGroundHeight, blockGroup, treeCells, (x, y) => (onMountain(x, y) ? 'minecraft:cherry_grove' : undefined), 0);
  farCache.set(cacheKey, (out = blockGroup.全()));
  return out;
};
