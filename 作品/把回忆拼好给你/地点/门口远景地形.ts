// 门口这个机位身后的远景地形（用户 10-24「而且怎么超平坦背景 合理吗？」）：小木屋就在第 1 句远处那片樱花林的边上，镜头朝北看，
// 屋后左边（西）是起伏的山坡上一大片樱花林、地上铺粉红花簇，右边（东）是平原、零星几棵橡树，越远越往原版的雾里淡。纯计算（不 import react、three），测试直接引。
// 和第 1 句（场/2-新世界/地形.ts）同一套长法：原版 1.20.1 的草地、樱花树（CherryTrunkPlacer、CherryFoliagePlacer）、橡树，随机都用定死的噪声和散列；
//   地点不许引场，树的长法从那里照抄（两边要改一起改）。山、林子的位置是 Agent 摆的，用户没看过。
// 坐标照 门口小木屋.tsx（x 东、y 北、z 上，格 (i, j, k) 占 [i, i+1]×[j, j+1]×[k, k+1]，原点不挪）；屋前地面顶在 z = 0。
// 屋子、屋前四排草地是正交那一层画的（门口小木屋.tsx），这里只铺它后面看得到的：屋后 30 格以内是平的（透视里藏在屋前那条草地后面），往后才起伏、长树。
import type { 方块 } from '@engine/model/方块拼搭.tsx';
import { fbm, hash2, simplex2, smoothstep } from '@engine/core/噪声.ts';

/** 远景的数（Agent 暂定）：
 *  范围：x、y 的格（含两头），要盖住镜头看得到的那一扇一直到雾全淡掉（地点/门口远景.tsx：眼睛在 y = −视距 6、雾按离眼睛的水平距离 192 格淡完；
 *    N = 10 的整屏取景画面左右边沿的视线在 x ±154 处到 192 格，再留取景中心左右挪的余量）；
 *  平到：屋后多远以内是平地（y）；起伏、起伏尺度：平原的起伏（格）；
 *  林：樱花林在西边，林边是一条按噪声扭的线（x < 林边x + 林边扭 × 噪声），离屋子最近 林近 格起才有树（再近的树在透视里比屋子还高）；
 *  山：林子里一座缓坡山（心、半径、高），樱花林长在坡上；远山：雾里东北边一道矮山梁，地平线不是一条直线 */
export const 门口远景 = {
  种子: 20230625,
  范围: { 西: -168, 东: 168, 南: 0, 北: 190 },
  平到: 30,
  起伏: 2.2,
  起伏尺度: 36,
  林: { 林边x: -5, 林边扭: 7, 林边尺度: 30, 林近: 36, 树距: 7, 成树率: 0.85, 花簇率: 0.35 },
  山: { 心: [-46, 104] as const, 半径: 58, 高: 7, 扰: 0.3, 扰尺度: 30 },
  远山: { 心: [44, 168] as const, 半径: 60, 高: 9 },
  /** 平原上的橡树 [x, y, 树干高]：在屋子东边（大多被屋子挡住，下摇开头从屋顶上面露出一点）和林边外 */
  橡树们: [
    [10, 58, 5],
    [27, 74, 6],
    [-1, 96, 5],
    [48, 110, 5],
    [16, 132, 4],
    [70, 90, 5],
  ] as const,
  /** 平原上的短草铺到多远（再远一株草不到两个像素） */
  草到: 90,
  草率: 0.22,
};

const 远 = 门口远景;
const 噪 = simplex2(远.种子);
const 噪山 = simplex2(远.种子 + 13);
const 噪林 = simplex2(远.种子 + 29);

/** (i, j) 在不在樱花林里 */
export const 在林里 = (i: number, j: number) => j >= 远.平到 && i < 远.林.林边x + 远.林.林边扭 * fbm(噪林, i, j, 远.林.林边尺度, 2);

/** (i, j) 那一列地面顶的高度（整数格，屋前地面 0） */
export const 远景地面高 = (i: number, j: number): number => {
  const 起 = smoothstep(远.平到, 远.平到 + 30, j);
  const 平原 = 远.起伏 * (fbm(噪, i, j, 远.起伏尺度, 3) + 0.35);
  const s = 远.山;
  const 扰 = 1 + s.扰 * fbm(噪山, i, j, s.扰尺度, 2);
  const 山 = s.高 * smoothstep(s.半径 * 扰, 0, Math.hypot(i - s.心[0], j - s.心[1]));
  const m = 远.远山;
  const 远山 = m.高 * smoothstep(m.半径, 0, Math.hypot((i - m.心[0]) * 0.6, j - m.心[1]));
  return Math.max(0, Math.round(起 * (平原 + 山 + 远山)));
};

type 树 = { i: number; j: number; 种: '橡' | '樱'; 高: number; 种子: number };

/** 樱花林里按格子撒（每 树距 见方一棵，抖一抖），平原上 橡树们 */
export const 远景树们 = (): 树[] => {
  const out: 树[] = [];
  const L = 远.林;
  const r = 远.范围;
  for (let gx = Math.floor(r.西 / L.树距); gx <= Math.ceil(r.东 / L.树距); gx++)
    for (let gy = Math.floor(L.林近 / L.树距); gy <= Math.ceil(r.北 / L.树距); gy++) {
      const i = Math.round(gx * L.树距 + (hash2(gx, gy, 1) - 0.5) * L.树距 * 0.7);
      const j = Math.round(gy * L.树距 + (hash2(gx, gy, 2) - 0.5) * L.树距 * 0.7);
      if (j < L.林近 || j > r.北 || i < r.西 || i > r.东 || !在林里(i, j) || hash2(gx, gy, 3) > L.成树率) continue;
      out.push({ i, j, 种: '樱', 高: 0, 种子: gx * 131 + gy });
    }
  for (const [i, j, 高] of 远.橡树们) out.push({ i, j, 种: '橡', 高, 种子: i * 7 + j });
  return out;
};

// ---------- 树（照抄 场/2-新世界/地形.ts） ----------

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

/** 樱花树，照原版 1.20.1 的 cherry 配置（TreeFeatures.CHERRY），长法的说明见 场/2-新世界/地形.ts */
const 樱花树 = (t: 树, z0: number, 放: (b: 方块) => void) => {
  const r = 随机(t.种子 * 2654435761 + 97);
  const 高 = 7 + 整(r, 0, 1);
  const 枝起 = Math.max(0, 高 - 1 + 整(r, -4, -3));
  let 枝起2 = Math.max(0, 高 - 1 + 整(r, -4, -4));
  if (枝起2 >= 枝起) 枝起2++;
  const 枝数 = 整(r, 1, 3);
  const 干高 = 枝数 === 3 ? 高 : 枝数 === 2 ? Math.max(枝起, 枝起2) + 1 : 枝起 + 1;
  for (let k = 0; k < 干高; k++) 放({ 状态: 竖木, 位: [t.i, t.j, z0 + k] });
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

const 花簇朝向 = ['north', 'east', 'south', 'west'] as const;

export type 远景方块 = { 平原: 方块[]; 樱花林: 方块[] };

/** 铺出来的全部方块：平原（群系 plains，草色同屋前那条草地）、樱花林（群系 cherry_grove：草色、树叶色按它染）分两份 */
export const 远景方块 = (): 远景方块 => {
  const 占 = new Set<string>();
  const out: 远景方块 = { 平原: [], 樱花林: [] };
  const 放到 = (林: boolean) => (b: 方块) => {
    const k = `${b.位[0]},${b.位[1]},${b.位[2]}`;
    if (占.has(k)) return;
    占.add(k);
    (林 ? out.樱花林 : out.平原).push(b);
  };
  const r = 远.范围;
  const 树表 = 远景树们();
  const 有树 = new Set(树表.map((t) => `${t.i},${t.j}`));
  // 先放树（树叶占了的格，地上的草、花就不放了）；钻进地里的枝叶不放
  for (const t of 树表) {
    const 放 = 放到(t.种 === '樱');
    (t.种 === '橡' ? 橡树 : 樱花树)(t, 远景地面高(t.i, t.j), (b) => {
      if (b.位[2] >= 远景地面高(b.位[0], b.位[1])) 放(b);
    });
  }
  for (let j = r.南; j <= r.北; j++)
    for (let i = r.西; i <= r.东; i++) {
      const 林 = 在林里(i, j);
      const 放 = 放到(林);
      const h = 远景地面高(i, j);
      // 侧面露出来的要填：往下填到四邻里最低的那格顶
      let 底 = h;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) 底 = Math.min(底, 远景地面高(i + di, j + dj));
      放({ 状态: 有树.has(`${i},${j}`) ? 'minecraft:dirt' : 'minecraft:grass_block[snowy=false]', 位: [i, j, h - 1] });
      for (let k = h - 2; k >= 底 - 1; k--) 放({ 状态: 'minecraft:dirt', 位: [i, j, k] });
      if (有树.has(`${i},${j}`) || j < 远.平到) continue;
      const u = hash2(i, j, 11);
      if (林) {
        if (u < 远.林.花簇率) 放({ 状态: `minecraft:pink_petals[facing=${花簇朝向[Math.floor(hash2(i, j, 12) * 4)]},flower_amount=${1 + Math.floor(hash2(i, j, 13) * 4)}]`, 位: [i, j, h] });
      } else if (j <= 远.草到 && u < 远.草率) 放({ 状态: 'minecraft:grass', 位: [i, j, h] });
    }
  return out;
};
