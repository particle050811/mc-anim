// 边城布局各部分共用的：城墙和街道的尺寸坐标（哪些不能改见 布局.ts 文件头）、固定种子的随机数、方块简写。
import { idOf, type BlockName, type Shape } from '../方块.ts';

export const BORDER_TOWN = { w: 480, d: 400, h: 28, thick: 6, tower: 36 };
export const W2 = BORDER_TOWN.w / 2; // 240
export const D2 = BORDER_TOWN.d / 2; // 200
export const T2 = BORDER_TOWN.thick / 2; // 3
export const wallHeight = BORDER_TOWN.h; // 28
// 城里（墙内侧以内）：x ±237、y ±197；房子离墙至少 8 格（环城路）
export const innerBounds = { x: W2 - T2, y: D2 - T2 };
export const buildBounds = { x: innerBounds.x - 8, y: innerBounds.y - 8 };
// 街道：[起, 止)。南北大街（城门进来）x ±12 贯穿全城；东西大街 y ±6；其余的街 6 格宽。广场 [-40, 40)²，四周一圈街
export const mainStreetX: [number, number] = [-12, 12];
export const mainStreetY: [number, number] = [-6, 6];
export const streetsX: [number, number][] = [[-200, -194], [-152, -146], [-98, -92], [-46, -40], [40, 46], [92, 98], [142, 148], [192, 198]];
// y 97～103 这条横街和南北大街在竖井口那里交叉（见文件头）
export const streetsY: [number, number][] = [[-142, -136], [-94, -88], [-46, -40], [40, 46], [97, 103], [150, 156]];
export const plazaHalf = 40;
// 北墙东门楼旁、贴着墙里面的落水池（6-3-8 卫兵从走道内沿跳下来落水）：水占 [x0, x1)×[y0, y1)，z 0～2 两格（池底是浸水的石半砖），
// 西、南、东三面一圈两格高的石砖池沿（北面就是城墙），池沿顶面 z = waterTop。水面画法见 边城/水池.tsx
export const fallPool = { x0: 21, x1: 58, y0: 193, y1: 197, waterTop: 2 };

// ---------- 随机数（固定种子，每次搭出来一样） ----------
export const mulberry = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export type Rng = () => number;
export const ri = (r: Rng, a: number, b: number) => a + Math.floor(r() * (b - a + 1)); // [a, b] 里的整数
export const pick = <Item,>(r: Rng, a: readonly Item[]) => a[Math.floor(r() * a.length)];
export const mod = (a: number, n: number) => ((a % n) + n) % n;

export const blockOf = (n: BlockName, s: Shape = '全') => idOf(n, s);
export type Facing = '北' | '南' | '东' | '西';
