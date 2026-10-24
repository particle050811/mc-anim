// 第 6、7 句屋子四周的地：屋前屋后那块平地（弹坑.ts）往外起伏的平原，西北边一道缓坡上是樱花林，零星几棵橡树。纯计算（不 import react、three），测试直接引。
// 用户 10-24「而且怎么超平坦背景 合理吗？」：地平线上要有起伏、樱花林、树，远处照原版的雾淡出；屋子盖在第 1 句远处那片樱花林的边上，长法同 场/2-新世界/地形.ts
//   （平原起伏一两格、樱花树照原版 CherryTrunkPlacer、CherryFoliagePlacer，地上铺粉红花簇；树的长法在 地点/原版树.ts），看得出是同一片地。
// 不是存档导出的，手搓；随机都用定死的噪声和散列，同一组参数每次出一样的方块。只铺镜头看得到的北边一扇（镜头一直朝北），背后的不铺。
// 坐标同 弹坑.ts：格 (i, j, k) 占 x ∈ [i − 0.5, i + 0.5]、y ∈ [j, j + 1]、z ∈ [k, k + 1]，屋前地面顶 z = 0（草方块是 k = −1）。
import type { 方块 } from '@engine/model/方块拼搭.tsx';
import { fbm, hash2, simplex2, smoothstep } from '@engine/core/噪声.ts';
import { 樱花树, 橡树, type 原版树 } from '../../地点/原版树.ts';
import { 平地 } from './弹坑.ts';

/** 平原：起伏几格、多大一片（格）；出了平地 坡宽 格才起伏满（屋子那块平地是平的） */
export const 平原 = { 种子: 61906, 起伏: 2.6, 起伏尺度: 52, 细起伏: 0.6, 细起伏尺度: 14, 坡宽: 14, 草率: 0.22, 高草占: 0.18, 花率: 0.02 } as const;
/** 樱花林：一道缓坡（心、山脚半径、顶半径、高），林子在 林半径 以内，每 树距 见方一棵。屋子在林子东南边上，最近的樱花树离后墙十来格；
 *  林子在屋子西北，第 6 句从他俩身后看过去是屋子左后方一片粉，第 7 句仰机位是地平线左半边一片粉。Agent 暂定 */
export const 樱花林 = { 心: [-16, 40] as const, 山高: 6, 山半径: 40, 顶半径: 12, 山扰: 0.3, 山扰尺度: 30, 林半径: 30, 树距: 7, 成树率: 0.85, 花簇率: 0.35 } as const;
/** 零星几棵橡树 [i, j, 树干高]：屋子东北、东边远处，不挡屋子和光柱（Agent 摆的） */
export const 橡树们: readonly (readonly [number, number, number])[] = [
  [22, 26, 5],
  [38, 58, 6],
  [-44, 96, 5],
  [64, 34, 5],
  [12, 92, 4],
];
/** 铺的范围：镜头在屋子南边、一直朝北看。从 扇心 往北张开（第 7 句仰机位的眼在 (2.5, −30)，画面宽 94°），离 扇心 不超过 半径（> 雾止 192，雾里不露地形的边） */
export const 地形范围 = { 南: -40, 扇心: [2.5, -34] as const, 扇宽: 30, 扇张: 1.2, 半径: 205, 植物半径: 90 } as const;

const 噪 = simplex2(平原.种子);
const 噪2 = simplex2(平原.种子 + 7);
const 噪山 = simplex2(平原.种子 + 13);

/** 离屋前平地多远（格，平地里 0） */
const 离平地 = (i: number, j: number) => Math.hypot(Math.max(0, 平地.西 - i, i - 平地.东), Math.max(0, 平地.南 - j, j - 平地.北));

/** 樱花林那道坡在 (i, j) 有多高（格，小数）：山脚、山顶的半径按噪声扭（不是同心圆） */
const 山高在 = (i: number, j: number) => {
  const L = 樱花林;
  const 距 = Math.hypot(i - L.心[0], j - L.心[1]);
  const 扰 = 1 + L.山扰 * fbm(噪山, i, j, L.山扰尺度, 3);
  return L.山高 * smoothstep(L.山半径 * 扰, L.顶半径 * 扰, 距);
};

/** (i, j) 那一列地面顶的高度（整数格，屋前平地 0）：平地外 坡宽 格里起伏慢慢长满，樱花林那道坡也从平地边上起 */
export const 地面高 = (i: number, j: number): number => {
  const 坡 = smoothstep(0, 平原.坡宽, 离平地(i, j));
  const 起伏 = 平原.起伏 * fbm(噪, i, j, 平原.起伏尺度, 3) + 平原.细起伏 * fbm(噪2, i, j, 平原.细起伏尺度, 2);
  return Math.round((起伏 + 山高在(i, j)) * 坡);
};

/** 这一列铺不铺：平地（弹坑.ts 铺）以外、扇面以内 */
export const 铺 = (i: number, j: number): boolean => {
  if (离平地(i, j) === 0) return false;
  const r = 地形范围;
  if (j < r.南) return false;
  if (Math.abs(i - r.扇心[0]) > r.扇宽 + (j - r.扇心[1]) * r.扇张) return false;
  return Math.hypot(i - r.扇心[0], j - r.扇心[1]) <= r.半径;
};

const 在林里 = (i: number, j: number) => Math.hypot(i - 樱花林.心[0], j - 樱花林.心[1]) <= 樱花林.林半径;

type 树 = 原版树 & { 种: '橡' | '樱' };
/** 树的位置：樱花林里按格子撒（抖一抖），离屋前平地至少 4 格；橡树照 橡树们 */
export const 树们 = (): 树[] => {
  const out: 树[] = [];
  const d = 樱花林.树距;
  const [cx, cy] = 樱花林.心;
  for (let gx = Math.floor((cx - 樱花林.林半径) / d); gx <= Math.ceil((cx + 樱花林.林半径) / d); gx++)
    for (let gy = Math.floor((cy - 樱花林.林半径) / d); gy <= Math.ceil((cy + 樱花林.林半径) / d); gy++) {
      const i = Math.round(gx * d + (hash2(gx, gy, 1) - 0.5) * d * 0.7);
      const j = Math.round(gy * d + (hash2(gx, gy, 2) - 0.5) * d * 0.7);
      if (!在林里(i, j) || hash2(gx, gy, 3) > 樱花林.成树率 || 离平地(i, j) < 4) continue;
      out.push({ i, j, 种: '樱', 高: 0, 种子: gx * 131 + gy });
    }
  for (const [i, j, 高] of 橡树们) out.push({ i, j, 种: '橡', 高, 种子: i * 7 + j });
  return out;
};

const 花们 = ['minecraft:dandelion', 'minecraft:poppy', 'minecraft:oxeye_daisy', 'minecraft:cornflower', 'minecraft:azure_bluet'] as const;
const 花簇朝向 = ['north', 'east', 'south', 'west'] as const;

export type 四周方块 = { 平原: 方块[]; 樱花林: 方块[] };

/** 平地以外铺出来的方块：平原（群系 plains）、樱花林（群系 cherry_grove：草色、树叶色按它染）分两份 */
export const 四周方块 = (): 四周方块 => {
  const 占 = new Set<string>();
  const out: 四周方块 = { 平原: [], 樱花林: [] };
  const 放到 = (林: boolean) => (b: 方块) => {
    const k = `${b.位[0]},${b.位[1]},${b.位[2]}`;
    if (占.has(k)) return;
    占.add(k);
    (林 ? out.樱花林 : out.平原).push(b);
  };
  const 树表 = 树们();
  const 有树 = new Set(树表.map((t) => `${t.i},${t.j}`));
  // 先放树（树叶占了的格，地上的草、花就不放了）；钻进地里的枝叶不放（原版树只长在空气、能替换的格里）
  for (const t of 树表) {
    if (!铺(t.i, t.j)) continue;
    const z0 = 地面高(t.i, t.j);
    const 放 = 放到(t.种 === '樱');
    (t.种 === '橡' ? 橡树 : 樱花树)(t, z0, (b) => {
      if (b.位[2] >= 地面高(b.位[0], b.位[1]) && 离平地(b.位[0], b.位[1]) > 0) 放(b);
    });
  }
  const r = 地形范围;
  const 北 = r.扇心[1] + r.半径;
  const 宽 = r.扇宽 + (北 - r.扇心[1]) * r.扇张;
  for (let j = r.南; j <= 北; j++)
    for (let i = Math.floor(r.扇心[0] - 宽); i <= Math.ceil(r.扇心[0] + 宽); i++) {
      if (!铺(i, j)) continue;
      const 林 = 在林里(i, j) || Math.hypot(i - 樱花林.心[0], j - 樱花林.心[1]) <= 樱花林.山半径 * 0.8;
      const 放 = 放到(林);
      const h = 地面高(i, j);
      // 侧面露出来的要填：往下填到四邻里最低的那格顶
      let 底 = h;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) 底 = Math.min(底, 离平地(i + di, j + dj) === 0 ? 0 : 地面高(i + di, j + dj));
      // 树干底下原版换成泥土（TrunkPlacer.setDirtAt）
      放({ 状态: 有树.has(`${i},${j}`) ? 'minecraft:dirt' : 'minecraft:grass_block[snowy=false]', 位: [i, j, h - 1] });
      for (let k = h - 2; k >= 底 - 1; k--) 放({ 状态: h - 1 - k > 3 ? 'minecraft:stone' : 'minecraft:dirt', 位: [i, j, k] });
      if (有树.has(`${i},${j}`)) continue;
      if (Math.hypot(i - r.扇心[0], j - r.扇心[1]) > r.植物半径 && !林) continue;
      const u = hash2(i, j, 11);
      if (林) {
        if (u < 樱花林.花簇率) 放({ 状态: `minecraft:pink_petals[facing=${花簇朝向[Math.floor(hash2(i, j, 12) * 4)]},flower_amount=${1 + Math.floor(hash2(i, j, 13) * 4)}]`, 位: [i, j, h] });
        else if (u < 樱花林.花簇率 + 0.12) 放({ 状态: 'minecraft:grass', 位: [i, j, h] });
        continue;
      }
      const 草密 = 平原.草率 * (0.55 + 0.9 * Math.max(0, fbm(噪2, i + 300, j, 14, 2) + 0.3));
      if (u < 平原.花率) 放({ 状态: 花们[Math.floor(hash2(i, j, 14) * 花们.length)]!, 位: [i, j, h] });
      else if (u < 平原.花率 + 草密 * 平原.高草占) {
        放({ 状态: 'minecraft:tall_grass[half=lower]', 位: [i, j, h] });
        放({ 状态: 'minecraft:tall_grass[half=upper]', 位: [i, j, h + 1] });
      } else if (u < 平原.花率 + 草密) 放({ 状态: 'minecraft:grass', 位: [i, j, h] });
    }
  return out;
};
