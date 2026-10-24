// 第 1 句的新世界：你第一次进六月樱服务器时脚下那片原版 1.20.1 平原，远处地平线上一座小山上是樱花林。纯计算（不 import react、three），测试直接引。
// 不是存档导出的：按原版平原的样子手搓（起伏一两格的草地、短草、高草、平原的五种花、零星几棵橡树；樱花林在山坡上，地上铺粉红花簇），
// 随机都用定死的噪声和散列，同一组参数每次出一样的方块。只铺镜头看得到的那一扇（参数.ts 的 地形范围），背后的不铺。
// 坐标照场景约定：x 东、y 北、z 上，格 (i, j, k) 占 [i, i+1]×[j, j+1]×[k, k+1]；出生点那格地面顶在 z = 0（草方块是 k = −1 那格）。
import type { 方块 } from '@engine/model/方块拼搭.tsx';
import { fbm, hash2, simplex2, smoothstep } from '@engine/core/噪声.ts';
import { 地形范围, 樱花林, 平原 } from './参数.ts';

const 噪 = simplex2(平原.种子);
const 噪2 = simplex2(平原.种子 + 7);

/** (i, j) 那一列地面顶的高度（整数格，出生点 0） */
export const 地面高 = (i: number, j: number): number => {
  const 起伏 = 平原.起伏 * fbm(噪, i, j, 平原.起伏尺度, 3) + 平原.细起伏 * fbm(噪2, i, j, 平原.细起伏尺度, 2);
  const 距林 = Math.hypot(i - 樱花林.心[0], j - 樱花林.心[1]);
  const 山 = 樱花林.山高 * smoothstep(樱花林.山半径, 樱花林.顶半径, 距林);
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
      out.push({ i, j, 种: '樱', 高: 樱花林.树干[0] + Math.floor(hash2(gx, gy, 4) * (樱花林.树干[1] - 樱花林.树干[0] + 1)), 种子: gx * 131 + gy });
    }
  for (const [i, j, 高] of 平原.橡树们) out.push({ i, j, 种: '橡', 高, 种子: i * 7 + j });
  return out;
};

const 花们 = ['minecraft:dandelion', 'minecraft:poppy', 'minecraft:azure_bluet', 'minecraft:oxeye_daisy', 'minecraft:cornflower'] as const;
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

/** 樱花树（照原版 CherryFoliagePlacer 的样子：直干、顶上一大团扁的叶子、边上往下垂几串），比原版略规整 */
const 樱花树 = (t: 树, z0: number, 放: (b: 方块) => void) => {
  const top = z0 + t.高;
  for (let k = z0; k < top; k++) 放({ 状态: 'minecraft:cherry_log[axis=y]', 位: [t.i, t.j, k] });
  const R = 樱花林.冠半径;
  for (let dz = -1; dz <= 2; dz++) {
    const r = dz === 2 ? R - 2 : dz === -1 ? R - 1 : R;
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++) {
        const d = Math.hypot(dx, dy);
        if (d > r + 0.3) continue;
        if (d > r - 1 && hash2(t.i + dx, t.j + dy, 60 + dz) < 0.35) continue;
        放({ 状态: 'minecraft:cherry_leaves', 位: [t.i + dx, t.j + dy, top + dz] });
        // 外圈往下垂一两格
        if (dz === -1 && d > r - 1.5 && hash2(t.i + dx, t.j + dy, 70) < 0.3) {
          放({ 状态: 'minecraft:cherry_leaves', 位: [t.i + dx, t.j + dy, top - 2] });
          if (hash2(t.i + dx, t.j + dy, 71) < 0.4) 放({ 状态: 'minecraft:cherry_leaves', 位: [t.i + dx, t.j + dy, top - 3] });
        }
      }
  }
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
  // 先放树（树叶占了的格，地上的草、花就不放了）
  for (const t of 树表) {
    if (!铺(t.i, t.j)) continue;
    const z0 = 地面高(t.i, t.j);
    (t.种 === '橡' ? 橡树 : 樱花树)(t, z0, 放到(t.种 === '樱'));
  }
  for (let j = r.南; j <= r.北; j++)
    for (let i = r.西; i <= r.东; i++) {
      if (!铺(i, j)) continue;
      const 林 = 在林里(i, j) || Math.hypot(i - 樱花林.心[0], j - 樱花林.心[1]) <= 樱花林.山半径 * 0.8;
      const 放 = 放到(林);
      const h = 地面高(i, j);
      // 侧面露出来的要填：往下填到四邻里最低的那格顶
      let 底 = h;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) 底 = Math.min(底, 地面高(i + di, j + dj));
      放({ 状态: 'minecraft:grass_block[snowy=false]', 位: [i, j, h - 1] });
      for (let k = h - 2; k >= 底 - 1; k--) 放({ 状态: h - 1 - k > 3 ? 'minecraft:stone' : 'minecraft:dirt', 位: [i, j, k] });
      if (有树.has(`${i},${j}`)) continue;
      // 地上的东西：平原上只铺到离出生点 植物半径（再远一株草不到几个像素，原版远处也一样有，这里省掉）
      if (Math.hypot(i, j) > r.植物半径 && !林) continue;
      const u = hash2(i, j, 11);
      if (林) {
        if (u < 樱花林.花簇率) 放({ 状态: `minecraft:pink_petals[facing=${花簇朝向[Math.floor(hash2(i, j, 12) * 4)]},flower_amount=${1 + Math.floor(hash2(i, j, 13) * 4)}]`, 位: [i, j, h] });
        else if (u < 樱花林.花簇率 + 0.12) 放({ 状态: 'minecraft:grass', 位: [i, j, h] });
        continue;
      }
      // 平原：草丛成片（噪声），高草夹在里面，花零星
      const 草密 = 平原.草率 * (0.55 + 0.9 * Math.max(0, fbm(噪2, i + 300, j, 14, 2) + 0.3));
      if (u < 平原.花率) 放({ 状态: 花们[Math.floor(hash2(i, j, 14) * 花们.length)]!, 位: [i, j, h] });
      else if (u < 平原.花率 + 草密 * 平原.高草占) {
        放({ 状态: 'minecraft:tall_grass[half=lower]', 位: [i, j, h] });
        放({ 状态: 'minecraft:tall_grass[half=upper]', 位: [i, j, h + 1] });
      } else if (u < 平原.花率 + 草密) 放({ 状态: 'minecraft:grass', 位: [i, j, h] });
    }
  return out;
};
