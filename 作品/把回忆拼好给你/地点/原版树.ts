// 原版 1.20.1 的橡树、樱花树长法（TreeFeatures.OAK、TreeFeatures.CHERRY），给铺地形的场用。纯计算。
// 出处：照 场/2-新世界/地形.ts 的 橡树、樱花树 抄一份（场之间不互引；那份在第 1 句开头那一路名下，不动它），算法、注释同那边。
// 随机不是原版的随机数：一棵树一个定死的种子（mulberry32），长出来的样子同一套规则，同一组参数每次出一样的方块。
// 坐标照场景约定：x 东、y 北、z 上，格 (i, j, k) 占 [i, i+1]×[j, j+1]×[k, k+1]；z0 = 树根那格（地面顶上那一格）的 k。
import type { 方块 } from '@engine/model/方块拼搭.tsx';
import { hash2 } from '@engine/core/噪声.ts';

/** 一棵树：根在 (i, j)；高 = 橡树的树干高（樱花树的高按原版自己抽）；种子定这棵树的随机 */
export type 原版树 = { i: number; j: number; 高: number; 种子: number };

/** 定死的随机数（mulberry32） */
export const 随机 = (种子: number) => {
  let a = 种子 >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
/** [lo, hi] 里的整数 */
const 整 = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

/** 橡树（原版 TreeFeatures.OAK：树干 4～6、两层 5×5 叶子去角随机、上两层 3×3 十字） */
export const 橡树 = (t: 原版树, z0: number, 放: (b: 方块) => void) => {
  const top = z0 + t.高;
  for (let k = z0; k < top; k++) 放({ 状态: 'minecraft:oak_log[axis=y]', 位: [t.i, t.j, k] });
  for (let dz = -3; dz <= 0; dz++) {
    const r = dz >= -1 ? 1 : 2;
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++) {
        if (dx === 0 && dy === 0 && dz < 0) continue;
        const 角 = Math.abs(dx) === r && Math.abs(dy) === r;
        if (角 && (dz === 0 || hash2(t.i + dx, t.j + dy, 40 + dz) < 0.5)) continue;
        放({ 状态: 'minecraft:oak_leaves', 位: [t.i + dx, t.j + dy, top + dz] });
      }
  }
};

type 向 = readonly [number, number];
/** 水平四向，按顺时针（北、东、南、西；场景 y 朝北） */
const 四向: readonly 向[] = [[0, 1], [1, 0], [0, -1], [-1, 0]];
/** 原木顺着哪根轴：东西向是原版 axis=x，南北向是原版 axis=z（场景 y 是原版 −z） */
const 横木 = (d: 向) => `minecraft:cherry_log[axis=${d[0] !== 0 ? 'x' : 'z'}]`;
const 竖木 = 'minecraft:cherry_log[axis=y]';
const 樱叶 = 'minecraft:cherry_leaves';

/**
 * 樱花树，照原版 1.20.1 的 cherry 配置（TreeFeatures.CHERRY）：
 * 树干 CherryTrunkPlacer(7, 1, 0, 枝数 1/2/3 等概率, 枝横长 2～4, 枝起离顶 −4～−3, 枝末离顶 −1～0)：主干长到最高的枝起处（三枝时长满），
 *   一根枝从主干往一个水平方向先横出一两格，再斜着走（每步按还差的竖直比例随机往上或往前）到枝末，枝末上面一格挂一团叶子；两枝时另一根朝反方向，三枝时主干顶上也挂一团。
 * 叶子 CherryFoliagePlacer(半径 4, 偏移 0, 高 5, 底层边上缺 0.25, 角上缺 0.25, 垂叶 1/6, 垂叶再长 1/3)：一团五层，往上 2 层半径 1、2，
 *   中间、往下一层半径 3（边角随机缺），往下两层半径 2；下面两层的外圈底下随机垂一两格叶子。
 */
export const 樱花树 = (t: 原版树, z0: number, 放: (b: 方块) => void) => {
  const r = 随机(t.种子 * 2654435761 + 97);
  const 高 = 7 + 整(r, 0, 1);
  const 枝起 = Math.max(0, 高 - 1 + 整(r, -4, -3));
  let 枝起2 = Math.max(0, 高 - 1 + 整(r, -4, -4));
  if (枝起2 >= 枝起) 枝起2++;
  const 枝数 = 整(r, 1, 3);
  const 干高 = 枝数 === 3 ? 高 : 枝数 === 2 ? Math.max(枝起, 枝起2) + 1 : 枝起 + 1;
  for (let k = 0; k < 干高; k++) 放({ 状态: 竖木, 位: [t.i, t.j, z0 + k] });
  // 一根枝：从主干 起 那一格往 d 走，返回挂叶子的那一格
  const 枝 = (d: 向, 起: number, 没到顶: boolean): [number, number, number] => {
    const m = [t.i, t.j, z0 + 起];
    const 末 = 高 - 1 + 整(r, -1, 0);
    const 先横 = 没到顶 || 末 < 起;
    const 长 = 整(r, 2, 4) + (先横 ? 1 : 0);
    const 终 = [t.i + d[0] * 长, t.j + d[1] * 长, z0 + 末];
    for (let l = 0; l < (先横 ? 2 : 1); l++) {
      m[0] += d[0];
      m[1] += d[1];
      放({ 状态: 横木(d), 位: [m[0]!, m[1]!, m[2]!] });
    }
    const 竖向 = 终[2]! > m[2]! ? 1 : -1;
    for (;;) {
      const 差 = Math.abs(终[0]! - m[0]!) + Math.abs(终[1]! - m[1]!) + Math.abs(终[2]! - m[2]!);
      if (差 === 0) return [终[0]!, 终[1]!, 终[2]! + 1];
      const 竖 = r() < Math.abs(终[2]! - m[2]!) / 差;
      if (竖) m[2] += 竖向;
      else {
        m[0] += d[0];
        m[1] += d[1];
      }
      放({ 状态: 竖 ? 竖木 : 横木(d), 位: [m[0]!, m[1]!, m[2]!] });
    }
  };
  const 叶点: [number, number, number][] = [];
  if (枝数 === 3) 叶点.push([t.i, t.j, z0 + 干高]);
  const d = 四向[整(r, 0, 3)]!;
  叶点.push(枝(d, 枝起, 枝起 < 干高 - 1));
  if (枝数 >= 2) 叶点.push(枝([-d[0], -d[1]], 枝起2, 枝起2 < 干高 - 1));
  for (const p of 叶点) 樱花叶团(p, r, 放);
};

/** CherryFoliagePlacer 的一团叶子（挂点 p） */
const 樱花叶团 = (p: readonly [number, number, number], r: () => number, 放: (b: 方块) => void) => {
  const 叶 = new Set<string>();
  const 放叶 = (x: number, y: number, z: number) => {
    叶.add(`${x},${y},${z}`);
    放({ 状态: 樱叶, 位: [x, y, z] });
  };
  const 跳 = (ax: number, ly: number, ay: number, 圈: number) => {
    if (ly === -1 && (ax === 圈 || ay === 圈) && r() < 0.25) return true;
    const 角 = ax === 圈 && ay === 圈;
    if (圈 > 2) return 角 || (ax + ay > 圈 * 2 - 2 && r() < 0.25);
    return 角 && r() < 0.25;
  };
  const 一层 = (圈: number, ly: number) => {
    for (let dx = -圈; dx <= 圈; dx++) for (let dy = -圈; dy <= 圈; dy++) if (!跳(Math.abs(dx), ly, Math.abs(dy), 圈)) 放叶(p[0] + dx, p[1] + dy, p[2] + ly);
  };
  // 垂叶：外圈一圈（每边 圈 × 2 格）底下，上面有叶子的，1/6 垂一格，垂了的再 1/3 往下多垂一格；离挂点下面那格曼哈顿距离 7 以上的不垂
  const 垂 = (x: number, y: number, z: number, 几率: number) => {
    if (Math.abs(x - p[0]) + Math.abs(y - p[1]) + Math.abs(z - (p[2] - 1)) >= 7) return false;
    if (r() > 几率) return false;
    放叶(x, y, z);
    return true;
  };
  const 带垂一层 = (圈: number, ly: number) => {
    一层(圈, ly);
    四向.forEach((d, k) => {
      const d1 = 四向[(k + 1) % 4]!;
      let x = p[0] + d1[0] * 圈 - d[0] * 圈, y = p[1] + d1[1] * 圈 - d[1] * 圈;
      const z = p[2] + ly - 1;
      for (let n = -圈; n < 圈; n++, x += d[0], y += d[1]) {
        if (叶.has(`${x},${y},${z + 1}`) && 垂(x, y, z, 1 / 6)) 垂(x, y, z - 1, 1 / 3);
      }
    });
  };
  const R = 4 - 1;
  一层(R - 2, 2);
  一层(R - 1, 1);
  一层(R, 0);
  带垂一层(R, -1);
  带垂一层(R - 1, -2);
};
