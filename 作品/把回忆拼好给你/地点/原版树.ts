// 原版 1.20.1 的橡树、樱花树长法（TreeFeatures.OAK、TreeFeatures.CHERRY），给铺地形的场用。纯计算。
// 出处：照 场/2-新世界/地形.ts 的 橡树、樱花树 抄一份（场之间不互引；那份在第 1 句开头那一路名下，不动它），算法、注释同那边。
// 随机不是原版的随机数：一棵树一个定死的种子（mulberry32），长出来的样子同一套规则，同一组参数每次出一样的方块。
// 坐标照场景约定：x 东、y 北、z 上，格 (i, j, k) 占 [i, i+1]×[j, j+1]×[k, k+1]；z0 = 树根那格（地面顶上那一格）的 k。
import type { PlacedBlock } from '@engine/model/方块拼搭.tsx';
import { hash2 } from '@engine/core/噪声.ts';

/** 一棵树：根在 (i, j)；高 = 橡树的树干高（樱花树的高按原版自己抽）；种子定这棵树的随机 */
export type VanillaTree = { i: number; j: number; 高: number; 种子: number };

/** 定死的随机数（mulberry32） */
export const rng = (seed: number) => {
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

/** 橡树（原版 TreeFeatures.OAK：树干 4～6、两层 5×5 叶子去角随机、上两层 3×3 十字） */
export const oakTree = (t: VanillaTree, z0: number, place: (b: PlacedBlock) => void) => {
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
export const cherryTree = (t: VanillaTree, z0: number, place: (b: PlacedBlock) => void) => {
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
