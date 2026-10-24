// 门口小木屋四周的地：屋子四周一块平地往外起伏的平原，西北边一道缓坡上是樱花林，零星几棵橡树。纯计算（不 import react、three），测试直接引。
// 用户 10-24「而且怎么超平坦背景 合理吗？」：地平线上要有起伏、樱花林、树，远处照原版的雾淡出，几句的背景看得出是同一片地。
// 出处：数和长法照 末地雷雨 那一路 2b716b1 的 场/2-雷雨/地形.ts（第 6、7 句屋子四周的地）一字不改抄来，第 8 句门口的屋后远景（屋后远景.tsx）铺的是同一片地；
//   那边的 平地 在 场/2-雷雨/弹坑.ts，这里抄成常数（地点不许引场）。两边合进 main 以后该留一份：场/2-雷雨/地形.ts 改成引这里（同一组数铺出同样的方块，测试对过）。
// 铺多大一扇看镜头：四周方块 的 范围 默认是第 6、7 句那一扇（从屋子南边朝北张开），门口机位的屋后远景（屋后远景.tsx）用 屋后远景范围。
// 坐标同 门口小木屋.tsx：格 (i, j, k) 占 x ∈ [i − 0.5, i + 0.5]、y ∈ [j, j + 1]、z ∈ [k, k + 1]，屋前地面顶 z = 0（草方块是 k = −1）。
import type { 方块 } from '@engine/model/方块拼搭.tsx';
import { fbm, hash2, simplex2, smoothstep } from '@engine/core/噪声.ts';
import { 樱花树, 橡树, type 原版树 } from './原版树.ts';

/** 屋子四周那块平地（地面顶 z 0）：i、j 的范围（同 场/2-雷雨/弹坑.ts 的 平地）。外面从 0 起坡 */
export const 平地 = { 西: -16, 东: 16, 南: -12, 北: 12 } as const;
/** 平原：起伏几格、多大一片（格）；出了平地 坡宽 格才起伏满 */
export const 平原 = { 种子: 61906, 起伏: 2.6, 起伏尺度: 52, 细起伏: 0.6, 细起伏尺度: 14, 坡宽: 14, 草率: 0.22, 高草占: 0.18, 花率: 0.02 } as const;
/** 樱花林：一道缓坡（心、山脚半径、顶半径、高），林子在 林半径 以内，每 树距 见方一棵。屋子在林子东南边上，最近的樱花树离后墙十来格（Agent 暂定） */
export const 樱花林 = { 心: [-16, 40] as const, 山高: 6, 山半径: 40, 顶半径: 12, 山扰: 0.3, 山扰尺度: 30, 林半径: 30, 树距: 7, 成树率: 0.85, 花簇率: 0.35 } as const;
/** 零星几棵橡树 [i, j, 树干高]：屋子东北、东边远处（Agent 摆的） */
export const 橡树们: readonly (readonly [number, number, number])[] = [
  [22, 26, 5],
  [38, 58, 6],
  [-44, 96, 5],
  [64, 34, 5],
  [12, 92, 4],
];

/** 铺哪一扇：从 扇心 往北张开（扇心处宽 ± 扇宽，往北每格两边各宽 扇张），离 扇心 不超过 半径（要过雾止 192，雾里不露地形的边）；
 *  花草只铺到离 扇心 植物半径（再远一株不到两个像素），樱花林里都铺 */
export type 四周范围 = { 南: number; 扇心: readonly [number, number]; 扇宽: number; 扇张: number; 半径: number; 植物半径: number };
/** 第 6、7 句那一扇（同 场/2-雷雨/地形.ts 的 地形范围：仰机位的眼在 (2.5, −30)，画面宽 94°） */
export const 地形范围: 四周范围 = { 南: -40, 扇心: [2.5, -34], 扇宽: 30, 扇张: 1.2, 半径: 205, 植物半径: 90 };
/** 第 8 句起门口机位屋后那一扇（屋后远景.tsx）：眼睛在 (取景中心 x, −6)（远景视距 6），N = 10 的整屏取景画面左右边沿的视线张开 8 / 6，
 *  扇张 1.4 盖住，再留取景中心左右挪的余量；雾按离眼睛的水平距离 192 格淡完，半径要过它 */
export const 屋后远景范围: 四周范围 = { 南: -6, 扇心: [0, -6], 扇宽: 6, 扇张: 1.4, 半径: 200, 植物半径: 90 };

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

/** 这一列铺不铺：平地以外、扇面以内 */
export const 铺 = (i: number, j: number, r: 四周范围 = 地形范围): boolean => {
  if (离平地(i, j) === 0) return false;
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

/** 平地以外、范围 里铺出来的方块：平原（群系 plains）、樱花林（群系 cherry_grove：草色、树叶色按它染）分两份 */
export const 四周方块 = (r: 四周范围 = 地形范围): 四周方块 => {
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
    if (!铺(t.i, t.j, r)) continue;
    const z0 = 地面高(t.i, t.j);
    const 放 = 放到(t.种 === '樱');
    (t.种 === '橡' ? 橡树 : 樱花树)(t, z0, (b) => {
      if (b.位[2] >= 地面高(b.位[0], b.位[1]) && 离平地(b.位[0], b.位[1]) > 0) 放(b);
    });
  }
  const 北 = r.扇心[1] + r.半径;
  const 宽 = r.扇宽 + (北 - r.扇心[1]) * r.扇张;
  for (let j = r.南; j <= 北; j++)
    for (let i = Math.floor(r.扇心[0] - 宽); i <= Math.ceil(r.扇心[0] + 宽); i++) {
      if (!铺(i, j, r)) continue;
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
