// 第 3 句祭坛四周的地：和第 1 句新世界同一片地（同一套生成法、同一组种子，参数.ts 的 新世界地形），祭坛摆在樱花林那座山的南坡脚下，
// 脚下压平一块（祭坛、你、镜头的路），往外慢慢接回原来的起伏；背后是山坡上的樱花林，两边是平原，远处照原版雾淡出（祭坛.tsx 补雾）。纯计算。
// 生成法照抄 场/2-新世界/地形.ts（场之间不能互引；那边改了这里要一起改，见 参数.ts 新世界地形 的注释）。
// 输出是祭坛的局部格：世界格 (i, j, k) = 局部 (x + 祭坛.世界[0], y + 祭坛.世界[1], z + 祭坛.地面)，祭坛圈心在局部原点、地面顶 z = 0（草方块在 k = −1）。
// 不转方向：方块和祭坛都对着世界的格子，鸟居朝北。
import type { 方块 } from '@engine/model/方块拼搭.tsx';
import { fbm, hash2, simplex2, smoothstep } from '@engine/core/噪声.ts';
import { 你, 柱顶材料, 祭坛位, 新世界地形 } from './参数.ts';

const { 平原, 樱花林 } = 新世界地形;
const 噪 = simplex2(平原.种子);
const 噪2 = simplex2(平原.种子 + 7);
const 噪山 = simplex2(平原.种子 + 13);
const 噪花 = simplex2(平原.种子 + 29);

/** 樱花林那座山在世界格 (i, j) 有多高（同 场/2-新世界/地形.ts） */
const 山高在 = (i: number, j: number): number => {
  const L = 樱花林;
  const 距 = Math.hypot(i - L.心[0], j - L.心[1]);
  const 扰 = 1 + L.山扰 * fbm(噪山, i, j, L.山扰尺度, 3);
  const 坡 = smoothstep(L.山半径 * 扰, L.顶半径 * 扰, 距);
  return L.山高 * 坡 + L.坡起伏 * fbm(噪山, i + 500, j - 300, L.坡起伏尺度, 2) * Math.min(1, 坡 * 3);
};

/** 世界格 (i, j) 原来的地面高（同 场/2-新世界/地形.ts 的 地面高，出生点 0） */
export const 原地面高 = (i: number, j: number): number => {
  const 起伏 = 平原.起伏 * fbm(噪, i, j, 平原.起伏尺度, 3) + 平原.细起伏 * fbm(噪2, i, j, 平原.细起伏尺度, 2);
  const 距出生 = Math.hypot(i, j);
  const 平 = smoothstep(平原.出生平半径, 平原.出生平半径 * 3, 距出生);
  return Math.round(起伏 * 平 + 山高在(i, j));
};

const 世 = (x: number, y: number): [number, number] => [x + 祭坛位.世界[0], y + 祭坛位.世界[1]];

/** 局部 (x, y) 离压平的那块有多远（格，在里面是 0） */
const 离平台 = (x: number, y: number) => {
  const p = 祭坛位.平台;
  const dx = Math.max(p.西 - (x + 0.5), 0, x + 0.5 - p.东);
  const dy = Math.max(p.南 - (y + 0.5), 0, y + 0.5 - p.北);
  return Math.hypot(dx, dy);
};

/** 局部 (x, y) 那一列地面顶的高（局部 z，祭坛脚下 0）：平台里是 0，往外 缓 格里接回原来的地 */
export const 地面高 = (x: number, y: number): number => {
  const [i, j] = 世(x, y);
  const 原 = 原地面高(i, j) - 祭坛位.地面;
  const t = smoothstep(0, 祭坛位.平台.缓, 离平台(x, y));
  return Math.round(原 * t);
};

/** 铺的范围（局部）：镜头一直朝北看，只铺前方一扇，同 场/2-新世界/参数.ts 地形范围 的做法 */
export const 铺 = (x: number, y: number): boolean => {
  const r = 祭坛位.范围;
  if (y < r.南) return false;
  if (Math.abs(x + 0.5 - r.扇心[0]) > r.扇宽 + (y - r.扇心[1]) * r.扇张) return false;
  return Math.hypot(x + 0.5 - r.远心[0], y + 0.5 - r.远心[1]) <= r.半径;
};

/** 世界格在不在樱花林里（群系、花簇、地上的树），同 场/2-新世界/地形.ts */
const 在林里 = (i: number, j: number) => Math.hypot(i - 樱花林.心[0], j - 樱花林.心[1]) <= 樱花林.林半径;
const 樱花林群系 = (i: number, j: number) => 在林里(i, j) || Math.hypot(i - 樱花林.心[0], j - 樱花林.心[1]) <= 樱花林.山半径 * 0.8;

type 树 = { x: number; y: number; 种: '橡' | '樱'; 高: number; 种子: number };

/** 樱花林里的树（同 场/2-新世界/地形.ts 的 树们，换成局部格），离平台 让树 格以内的不种（树冠会伸进祭坛、挡镜头） */
export const 树们 = (): 树[] => {
  const out: 树[] = [];
  const d = 樱花林.树距;
  const [cx, cy] = 樱花林.心;
  for (let gx = Math.floor((cx - 樱花林.林半径) / d); gx <= Math.ceil((cx + 樱花林.林半径) / d); gx++)
    for (let gy = Math.floor((cy - 樱花林.林半径) / d); gy <= Math.ceil((cy + 樱花林.林半径) / d); gy++) {
      const i = Math.round(gx * d + (hash2(gx, gy, 1) - 0.5) * d * 0.7);
      const j = Math.round(gy * d + (hash2(gx, gy, 2) - 0.5) * d * 0.7);
      if (!在林里(i, j) || hash2(gx, gy, 3) > 樱花林.成树率) continue;
      out.push({ x: i - 祭坛位.世界[0], y: j - 祭坛位.世界[1], 种: '樱', 高: 0, 种子: gx * 131 + gy });
    }
  for (const [i, j, 高] of 平原.橡树们) out.push({ x: i - 祭坛位.世界[0], y: j - 祭坛位.世界[1], 种: '橡', 高, 种子: i * 7 + j });
  return out.filter((t) => 离平台(t.x, t.y) >= 祭坛位.让树);
};

const 郁金香们 = ['minecraft:orange_tulip', 'minecraft:red_tulip', 'minecraft:pink_tulip', 'minecraft:white_tulip'] as const;
const 高花们 = ['minecraft:poppy', 'minecraft:azure_bluet', 'minecraft:oxeye_daisy', 'minecraft:cornflower'] as const;
/** 原版 flower_plain（同 场/2-新世界/地形.ts 的 平原花，世界格） */
const 平原花 = (i: number, j: number): string => {
  if (fbm(噪花, i, j, 平原.郁金香尺度, 2) < 平原.郁金香阈) return 郁金香们[Math.floor(hash2(i, j, 14) * 4)]!;
  return hash2(i, j, 15) < 1 / 3 ? 高花们[Math.floor(hash2(i, j, 14) * 4)]! : 'minecraft:dandelion';
};
const 花簇朝向 = ['north', 'east', 'south', 'west'] as const;

/** 橡树（原版 TreeFeatures.OAK，同 场/2-新世界/地形.ts） */
const 橡树 = (t: 树, z0: number, 放: (b: 方块) => void) => {
  const top = z0 + t.高;
  for (let k = z0; k < top; k++) 放({ 状态: 'minecraft:oak_log[axis=y]', 位: [t.x, t.y, k] });
  const [ti, tj] = 世(t.x, t.y);
  for (let dz = -3; dz <= 0; dz++) {
    const r = dz >= -1 ? 1 : 2;
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++) {
        if (dx === 0 && dy === 0 && dz < 0) continue;
        const 角 = Math.abs(dx) === r && Math.abs(dy) === r;
        if (角 && (dz === 0 || hash2(ti + dx, tj + dy, 40 + dz) < 0.5)) continue;
        放({ 状态: 'minecraft:oak_leaves', 位: [t.x + dx, t.y + dy, top + dz] });
      }
  }
};

/** 定死的随机数（mulberry32），一棵树一个种子 */
const 随机 = (种子: number) => {
  let a = 种子 >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const 整 = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

type 向 = readonly [number, number];
const 四向: readonly 向[] = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const 横木 = (d: 向) => `minecraft:cherry_log[axis=${d[0] !== 0 ? 'x' : 'z'}]`;
const 竖木 = 'minecraft:cherry_log[axis=y]';
const 樱叶 = 'minecraft:cherry_leaves';

/** 樱花树：原版 1.20.1 CherryTrunkPlacer、CherryFoliagePlacer 的长法（同 场/2-新世界/地形.ts 的 樱花树，那边注释写了各数的出处） */
const 樱花树 = (t: 树, z0: number, 放: (b: 方块) => void) => {
  const r = 随机(t.种子 * 2654435761 + 97);
  const 高 = 7 + 整(r, 0, 1);
  const 枝起 = Math.max(0, 高 - 1 + 整(r, -4, -3));
  let 枝起2 = Math.max(0, 高 - 1 + 整(r, -4, -4));
  if (枝起2 >= 枝起) 枝起2++;
  const 枝数 = 整(r, 1, 3);
  const 干高 = 枝数 === 3 ? 高 : 枝数 === 2 ? Math.max(枝起, 枝起2) + 1 : 枝起 + 1;
  for (let k = 0; k < 干高; k++) 放({ 状态: 竖木, 位: [t.x, t.y, z0 + k] });
  const 枝 = (d: 向, 起: number, 没到顶: boolean): [number, number, number] => {
    const m = [t.x, t.y, z0 + 起];
    const 末 = 高 - 1 + 整(r, -1, 0);
    const 先横 = 没到顶 || 末 < 起;
    const 长 = 整(r, 2, 4) + (先横 ? 1 : 0);
    const 终 = [t.x + d[0] * 长, t.y + d[1] * 长, z0 + 末];
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
  if (枝数 === 3) 叶点.push([t.x, t.y, z0 + 干高]);
  const d = 四向[整(r, 0, 3)]!;
  叶点.push(枝(d, 枝起, 枝起 < 干高 - 1));
  if (枝数 >= 2) 叶点.push(枝([-d[0], -d[1]], 枝起2, 枝起2 < 干高 - 1));
  for (const p of 叶点) 樱花叶团(p, r, 放);
};

/** CherryFoliagePlacer 的一团叶子（同 场/2-新世界/地形.ts） */
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

/** 平台上不长东西的地方：祭坛圈里、柱子和鸟居脚下、你站的地方、镜头底下那一条（镜头前面几格的草会大得糊住画面下沿） */
const 平台上空着 = (x: number, y: number) => {
  const cx = x + 0.5, cy = y + 0.5;
  if (Math.hypot(cx, cy) < 祭坛位.圈让) return true;
  if (柱顶材料.some(({ 柱: [px, py] }) => Math.abs(cx - px) < 1.2 && Math.abs(cy - py) < 1.2)) return true;
  if (Math.abs(cy - 3.5) < 1 && Math.abs(cx) < 4.5) return true;
  if (Math.abs(cx - 你.脚[0]) < 1.2 && Math.abs(cy - 你.脚[1]) < 1.2) return true;
  const 道 = 祭坛位.镜头道;
  return cx > 道.西 && cx < 道.东 && cy > 道.南 && cy < 道.北;
};

export type 祭坛地形方块 = { 平原: 方块[]; 樱花林: 方块[] };

/** 铺出来的全部方块（局部格）：平原、樱花林分两份（群系不同，草和树叶染色不同） */
export const 祭坛地形方块 = (): 祭坛地形方块 => {
  const 占 = new Set<string>();
  const out: 祭坛地形方块 = { 平原: [], 樱花林: [] };
  const 放到 = (林: boolean) => (b: 方块) => {
    const k = `${b.位[0]},${b.位[1]},${b.位[2]}`;
    if (占.has(k)) return;
    占.add(k);
    (林 ? out.樱花林 : out.平原).push(b);
  };
  const r = 祭坛位.范围;
  const 树表 = 树们();
  const 有树 = new Set(树表.map((t) => `${t.x},${t.y}`));
  for (const t of 树表) {
    if (!铺(t.x, t.y)) continue;
    const z0 = 地面高(t.x, t.y);
    const 放 = 放到(t.种 === '樱');
    (t.种 === '橡' ? 橡树 : 樱花树)(t, z0, (b) => {
      if (b.位[2] >= 地面高(b.位[0], b.位[1])) 放(b);
    });
  }
  for (let y = r.南; y <= r.北; y++)
    for (let x = r.西; x <= r.东; x++) {
      if (!铺(x, y)) continue;
      const [i, j] = 世(x, y);
      const 林 = 樱花林群系(i, j);
      const 放 = 放到(林);
      const h = 地面高(x, y);
      let 底 = h;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) 底 = Math.min(底, 地面高(x + dx, y + dy));
      放({ 状态: 有树.has(`${x},${y}`) ? 'minecraft:dirt' : 'minecraft:grass_block[snowy=false]', 位: [x, y, h - 1] });
      for (let k = h - 2; k >= 底 - 1; k--) 放({ 状态: h - 1 - k > 3 ? 'minecraft:stone' : 'minecraft:dirt', 位: [x, y, k] });
      if (有树.has(`${x},${y}`)) continue;
      if (离平台(x, y) === 0 && 平台上空着(x, y)) continue;
      if (Math.hypot(x, y) > r.植物半径 && !林) continue;
      const u = hash2(i, j, 11);
      if (林) {
        if (u < 樱花林.花簇率) 放({ 状态: `minecraft:pink_petals[facing=${花簇朝向[Math.floor(hash2(i, j, 12) * 4)]},flower_amount=${1 + Math.floor(hash2(i, j, 13) * 4)}]`, 位: [x, y, h] });
        else if (u < 樱花林.花簇率 + 0.12) 放({ 状态: 'minecraft:grass', 位: [x, y, h] });
        continue;
      }
      const 草密 = 平原.草率 * (0.55 + 0.9 * Math.max(0, fbm(噪2, i + 300, j, 14, 2) + 0.3));
      if (u < 平原.花率) 放({ 状态: 平原花(i, j), 位: [x, y, h] });
      else if (u < 平原.花率 + 草密 * 平原.高草占) {
        放({ 状态: 'minecraft:tall_grass[half=lower]', 位: [x, y, h] });
        放({ 状态: 'minecraft:tall_grass[half=upper]', 位: [x, y, h + 1] });
      } else if (u < 平原.花率 + 草密) 放({ 状态: 'minecraft:grass', 位: [x, y, h] });
    }
  return out;
};
