// 第 1 句的新世界：你第一次进这个世界时脚下那片原版 1.20.1 平原，远处地平线上一座小山上是樱花林。纯计算（不 import react、three），测试直接引。
// 不是存档导出的：按原版平原的样子手搓（起伏一两格的草地、短草、高草、原版 flower_plain 的九种花、零星几棵橡树；樱花林在山坡上，
// 樱花树照原版 CherryTrunkPlacer、CherryFoliagePlacer 的长法，地上铺粉红花簇）。随机都用定死的噪声和散列（不是原版的随机数，长出来的样子同一套规则），
// 同一组参数每次出一样的方块。只铺镜头看得到的那一扇（参数.ts 的 地形范围），背后的不铺。
// 第 1 句尾到 2-第一晚 镜头落到你挖坑那一格的地面剖面：剖面附近的列（剖面列）另铺到地下（剖面方块、剥排方块），新世界方块 本身不变（别的段拿它当远景）。
// 坐标照场景约定：x 东、y 北、z 上，格 (i, j, k) 占 [i, i+1]×[j, j+1]×[k, k+1]；出生点那格地面顶在 z = 0（草方块是 k = −1 那格）。
import type { 方块 } from '@engine/model/方块拼搭.tsx';
import { fbm, hash2, simplex2, smoothstep } from '@engine/core/噪声.ts';
import { 地形范围, 剖面, 坑, 樱花林, 平原 } from './参数.ts';

const 噪 = simplex2(平原.种子);
const 噪2 = simplex2(平原.种子 + 7);
const 噪山 = simplex2(平原.种子 + 13);
const 噪花 = simplex2(平原.种子 + 29);

/** 樱花林那座山在 (i, j) 有多高（格，小数）：山脚、山顶的半径按噪声扭，坡上、顶上加一点起伏 */
const 山高在 = (i: number, j: number): number => {
  const L = 樱花林;
  const 距 = Math.hypot(i - L.心[0], j - L.心[1]);
  const 扰 = 1 + L.山扰 * fbm(噪山, i, j, L.山扰尺度, 3);
  const 坡 = smoothstep(L.山半径 * 扰, L.顶半径 * 扰, 距);
  return L.山高 * 坡 + L.坡起伏 * fbm(噪山, i + 500, j - 300, L.坡起伏尺度, 2) * Math.min(1, 坡 * 3);
};

/** (i, j) 那一列地面顶的高度（整数格，出生点 0） */
export const 地面高 = (i: number, j: number): number => {
  const 起伏 = 平原.起伏 * fbm(噪, i, j, 平原.起伏尺度, 3) + 平原.细起伏 * fbm(噪2, i, j, 平原.细起伏尺度, 2);
  const 山 = 山高在(i, j);
  // 出生点附近压平一点：你站的那块地是平的
  const 距出生 = Math.hypot(i, j);
  const 平 = smoothstep(平原.出生平半径, 平原.出生平半径 * 3, 距出生);
  // 出生点附近 平 = 0、离樱花林远，山 = 0：出生点那格正好是 0
  return Math.round(起伏 * 平 + 山);
};

/** 这一列在不在铺的范围里：镜头前方一扇（从 扇心 往北张开），离 远心 不超过 半径 */
export const 铺 = (i: number, j: number): boolean => {
  const r = 地形范围;
  if (j < r.南) return false;
  if (Math.abs(i + 0.5 - r.扇心[0]) > r.扇宽 + (j - r.扇心[1]) * r.扇张) return false;
  return Math.hypot(i + 0.5 - r.远心[0], j + 0.5 - r.远心[1]) <= r.半径;
};

/** 离樱花林中心多远算樱花林（群系、花簇、地上的树） */
const 在林里 = (i: number, j: number) => Math.hypot(i - 樱花林.心[0], j - 樱花林.心[1]) <= 樱花林.林半径;

/** 高：橡树的树干高（樱花树的高按原版自己抽，写 0） */
type 树 = { i: number; j: number; 种: '橡' | '樱'; 高: number; 种子: number };

/** 树的位置：樱花林里按格子撒（每 樱花林.树距 见方一棵，抖一抖），平原上零星几棵橡树（平原.橡树们，Agent 摆的） */
export const 树们 = (): 树[] => {
  const out: 树[] = [];
  const d = 樱花林.树距;
  const [cx, cy] = 樱花林.心;
  for (let gx = Math.floor((cx - 樱花林.林半径) / d); gx <= Math.ceil((cx + 樱花林.林半径) / d); gx++)
    for (let gy = Math.floor((cy - 樱花林.林半径) / d); gy <= Math.ceil((cy + 樱花林.林半径) / d); gy++) {
      const i = Math.round(gx * d + (hash2(gx, gy, 1) - 0.5) * d * 0.7);
      const j = Math.round(gy * d + (hash2(gx, gy, 2) - 0.5) * d * 0.7);
      if (!在林里(i, j) || hash2(gx, gy, 3) > 樱花林.成树率) continue;
      out.push({ i, j, 种: '樱', 高: 0, 种子: gx * 131 + gy });
    }
  for (const [i, j, 高] of 平原.橡树们) out.push({ i, j, 种: '橡', 高, 种子: i * 7 + j });
  return out;
};

const 郁金香们 = ['minecraft:orange_tulip', 'minecraft:red_tulip', 'minecraft:pink_tulip', 'minecraft:white_tulip'] as const;
const 高花们 = ['minecraft:poppy', 'minecraft:azure_bluet', 'minecraft:oxeye_daisy', 'minecraft:cornflower'] as const;
/** 原版 flower_plain：噪声低于阈出郁金香（四种随机），不然三分之一出 高花们 里随机一种，其余蒲公英 */
export const 平原花 = (i: number, j: number): string => {
  if (fbm(噪花, i, j, 平原.郁金香尺度, 2) < 平原.郁金香阈) return 郁金香们[Math.floor(hash2(i, j, 14) * 4)]!;
  return hash2(i, j, 15) < 1 / 3 ? 高花们[Math.floor(hash2(i, j, 14) * 4)]! : 'minecraft:dandelion';
};
const 花簇朝向 = ['north', 'east', 'south', 'west'] as const;

/** 橡树（原版 TreeFeatures.OAK：树干 4～6、两层 5×5 叶子去角随机、上两层 3×3 十字） */
const 橡树 = (t: 树, z0: number, 放: (b: 方块) => void) => {
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
/** [lo, hi] 里的整数 */
const 整 = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

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
const 樱花树 = (t: 树, z0: number, 放: (b: 方块) => void) => {
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

/** 这一列的群系是不是樱花林（草色、树叶色按它染）：林子和山坡下半截 */
const 是林 = (i: number, j: number) => 在林里(i, j) || Math.hypot(i - 樱花林.心[0], j - 樱花林.心[1]) <= 樱花林.山半径 * 0.8;

/** 一列地：顶上草方块（树干底下原版换成泥土，TrunkPlacer.setDirtAt），往下泥土三格、再往下石头，填到 底（不给 = 侧面露出来的那么深：四邻里最低的那格顶往下一格）；
 *  长草时地上铺草、花。新世界方块 和剖面共用这一个铺法，同一列铺出来一样 */
const 一列 = (i: number, j: number, 放: (b: 方块) => void, o: { 有树: boolean; 底?: number; 长草?: boolean }) => {
  const 林 = 是林(i, j);
  const h = 地面高(i, j);
  let 底 = h;
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) 底 = Math.min(底, 地面高(i + di, j + dj));
  const 最底 = o.底 ?? 底 - 1;
  放({ 状态: o.有树 ? 'minecraft:dirt' : 'minecraft:grass_block[snowy=false]', 位: [i, j, h - 1] });
  for (let k = h - 2; k >= 最底; k--) 放({ 状态: h - 1 - k > 3 ? 'minecraft:stone' : 'minecraft:dirt', 位: [i, j, k] });
  if (o.有树 || o.长草 === false) return;
  // 地上的东西：平原上只铺到离出生点 植物半径（再远一株草不到几个像素，原版远处也一样有，这里省掉）
  if (Math.hypot(i, j) > 地形范围.植物半径 && !林) return;
  const u = hash2(i, j, 11);
  if (林) {
    if (u < 樱花林.花簇率) 放({ 状态: `minecraft:pink_petals[facing=${花簇朝向[Math.floor(hash2(i, j, 12) * 4)]},flower_amount=${1 + Math.floor(hash2(i, j, 13) * 4)}]`, 位: [i, j, h] });
    else if (u < 樱花林.花簇率 + 0.12) 放({ 状态: 'minecraft:grass', 位: [i, j, h] });
    return;
  }
  // 平原：草丛成片（噪声），高草夹在里面，花零星
  const 草密 = 平原.草率 * (0.55 + 0.9 * Math.max(0, fbm(噪2, i + 300, j, 14, 2) + 0.3));
  if (u < 平原.花率) 放({ 状态: 平原花(i, j), 位: [i, j, h] });
  else if (u < 平原.花率 + 草密 * 平原.高草占) {
    放({ 状态: 'minecraft:tall_grass[half=lower]', 位: [i, j, h] });
    放({ 状态: 'minecraft:tall_grass[half=upper]', 位: [i, j, h + 1] });
  } else if (u < 平原.花率 + 草密) 放({ 状态: 'minecraft:grass', 位: [i, j, h] });
};

export type 新世界方块 = { 平原: 方块[]; 樱花林: 方块[] };

/** 铺出来的全部方块：平原（群系 plains）、樱花林（群系 cherry_grove：草色、树叶色按它染）分两份 */
export const 新世界方块 = (): 新世界方块 => {
  const 占 = new Set<string>();
  const out: 新世界方块 = { 平原: [], 樱花林: [] };
  const 放到 = (林: boolean) => (b: 方块) => {
    const k = `${b.位[0]},${b.位[1]},${b.位[2]}`;
    if (占.has(k)) return;
    占.add(k);
    (林 ? out.樱花林 : out.平原).push(b);
  };
  const r = 地形范围;
  const 树表 = 树们();
  const 有树 = new Set(树表.map((t) => `${t.i},${t.j}`));
  // 先放树（树叶占了的格，地上的草、花就不放了）；原版树只长在空气、能替换的格里，钻进地里的枝叶不放
  for (const t of 树表) {
    if (!铺(t.i, t.j)) continue;
    const z0 = 地面高(t.i, t.j);
    const 放 = 放到(t.种 === '樱');
    (t.种 === '橡' ? 橡树 : 樱花树)(t, z0, (b) => {
      if (b.位[2] >= 地面高(b.位[0], b.位[1])) 放(b);
    });
  }
  for (let j = r.南; j <= r.北; j++)
    for (let i = r.西; i <= r.东; i++) {
      if (!铺(i, j)) continue;
      一列(i, j, 放到(是林(i, j)), { 有树: 有树.has(`${i},${j}`) });
    }
  return out;
};

// ---------- 剖面（第 1 句尾到 2-第一晚：你挖坑那一格的地面剖面） ----------

/** 坑挖到哪一步：挖掉 = 从草方块往下挖掉了几格（0～坑.深），顶土 = 头顶填上的那格（放在草方块原来的位置）。2-第一晚 的编排算 */
export type 坑态 = { 挖掉: number; 顶土: boolean };

/** 这一列归剖面的哪一截：'剖' = 坑这一排和后墙那一排（按坑态重铺），'剥' = 坑和镜头之间撤掉的那几排，null = 不归剖面（新世界方块 照常铺）。
 *  这两截从 新世界方块 里拿掉，另外铺到 剖面.底（世界.tsx 分开建网格） */
export const 剖面列 = (i: number, j: number): '剖' | '剥' | null => {
  if ((j === 坑.j || j === 坑.j + 1) && Math.abs(i - 坑.i) <= 剖面.半宽) return '剖';
  if (j >= 坑.j - 剖面.剥排 && j < 坑.j && Math.abs(i - 坑.i) <= 剖面.剥半宽) return '剥';
  return null;
};

/** 坑这一排、后墙那一排（一张表）：照 新世界方块 的铺法铺到 剖面.底；坑那一格按坑态挖掉、填土，坑左右 让草 列内不长草、不开花；
 *  后墙（坑后面那一格）草方块以下压暗到 剖面.后墙亮 */
export const 剖面方块 = (态: 坑态): 方块[] => {
  const out: 方块[] = [];
  for (const j of [坑.j, 坑.j + 1])
    for (let i = 坑.i - 剖面.半宽; i <= 坑.i + 剖面.半宽; i++) {
      if (!铺(i, j)) continue;
      const 坑格 = i === 坑.i && j === 坑.j;
      const 后墙 = i === 坑.i && j === 坑.j + 1;
      const h = 地面高(i, j);
      一列(i, j, (b) => {
        const k = b.位[2];
        if (坑格 && k < h && k >= h - 态.挖掉) return;
        out.push(后墙 && k < h - 1 ? { ...b, 亮: 剖面.后墙亮 } : b);
      }, { 有树: false, 底: 剖面.底, 长草: Math.abs(i - 坑.i) > 剖面.让草 });
      if (坑格 && 态.顶土) out.push({ 状态: 'minecraft:dirt', 位: [i, j, h - 1] });
    }
  return out;
};

/** 坑和镜头之间还没撤掉的那几排（一张表）：撤了 剥了 排（从镜头那头撤起），剩下的照 新世界方块 的铺法铺到 剖面.底，最前面那排的南面就是切面 */
export const 剥排方块 = (剥了: number): 方块[] => {
  const out: 方块[] = [];
  for (let j = 坑.j - 剖面.剥排 + 剥了; j < 坑.j; j++)
    for (let i = 坑.i - 剖面.剥半宽; i <= 坑.i + 剖面.剥半宽; i++) if (铺(i, j)) 一列(i, j, (b) => out.push(b), { 有树: false, 底: 剖面.底 });
  return out;
};
