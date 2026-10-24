// 祭坛四周的樱花林：草地、樱花树、地上的粉红花簇，全部是原版方块（engine/model/方块拼搭.tsx 照方块表和图集拼，群系 cherry_grove 染草色）。纯数据。
// 树照原版 1.20.1 的形状简化搭（CherryTrunkPlacer 主干 7 格上下、一两根斜出的枝；CherryFoliagePlacer 半径 4、高 5 的树冠，底层边上有缺口、往下挂一两格叶子），
// 和 场/2-隐世之境/窗外.tsx 的樱花树同一个搭法（那边自己建网格，这里出方块表）。种子定死，每帧一样。
// 格 (i, j, k) 占 [i, i+1]×[j, j+1]×[k, k+1]（方块拼搭 原点 不给），地面顶在 z 0，草方块在 k −1。
import type { 方块 } from '@engine/model/方块拼搭.tsx';
import { rng } from '@engine/model/parts.tsx';
import { 樱花林 as 参, 柱顶材料, 你 } from './参数.ts';

type 格 = [number, number, number];
const 键 = (p: readonly number[]) => p.join(',');

/** 一棵樱花树：根格 (x, y, 0)，主干高 高（不给按随机 6～7）。r 是这棵树自己的随机数 */
const 一棵 = (x: number, y: number, r: () => number, 定高?: number): { 木: 格[]; 叶: 格[] } => {
  const 木: 格[] = [];
  const 叶 = new Map<string, 格>();
  const 放叶 = (p: 格) => 叶.set(键(p), p);
  const 高 = 定高 ?? 6 + Math.floor(r() * 2);
  for (let z = 0; z < 高; z++) 木.push([x, y, z]);
  const 冠心: 格[] = [[x, y, 高]];
  const 枝数 = r() < 0.5 ? 1 : 2;
  const 方向们: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const 起向 = Math.floor(r() * 4);
  for (let b = 0; b < 枝数; b++) {
    const [dx, dy] = 方向们[(起向 + b * 2) % 4]!;
    const 长 = 2 + Math.floor(r() * 2);
    let [cx, cy, cz] = [x, y, 高 - 3];
    for (let i = 1; i <= 长; i++) {
      cx += dx;
      cy += dy;
      if (i > 1) cz += 1;
      木.push([cx, cy, cz]);
    }
    木.push([cx, cy, cz + 1]);
    冠心.push([cx, cy, cz + 2]);
  }
  const 半径 = [4, 4, 4, 3, 2];
  for (const [ox, oy, oz] of 冠心)
    半径.forEach((rad, i) => {
      const z = oz - 1 + i;
      for (let dx = -rad; dx <= rad; dx++)
        for (let dy = -rad; dy <= rad; dy++) {
          const 边 = Math.abs(dx) === rad || Math.abs(dy) === rad;
          if (Math.abs(dx) === rad && Math.abs(dy) === rad) continue;
          if (Math.abs(dx) + Math.abs(dy) > rad + 2) continue;
          if (边 && i === 0 && r() < 0.25) continue;
          放叶([ox + dx, oy + dy, z]);
          if (边 && i === 0 && r() < 1 / 6) {
            放叶([ox + dx, oy + dy, z - 1]);
            if (r() < 1 / 3) 放叶([ox + dx, oy + dy, z - 2]);
          }
        }
    });
  for (const p of 木) 叶.delete(键(p));
  return { 木, 叶: [...叶.values()] };
};

/** 祭坛占的地（柱子、鸟居、圈里）加镜头前那一片：不撒树、不长花 */
const 离祭坛 = (x: number, y: number) => Math.hypot(x, y);
/** 镜头那一边（南边）留空：树不长在镜头和祭坛之间 */
const 在南边空地 = (x: number, y: number) => y < 6 && Math.abs(x) < 10;

/** 树的根格们：定点 + 按种子撒（北边和两侧） */
export const 樱花林树根 = (): [number, number, number?][] => {
  const r = rng(参.种子);
  const 根们: [number, number, number?][] = 参.定点.map(([x, y, 高]) => [x, y, 高]);
  const 目标 = 参.定点.length + 参.撒树数;
  for (let tries = 0; 根们.length < 目标 && tries < 参.撒树数 * 300; tries++) {
    const x = Math.round((r() * 2 - 1) * 40);
    const y = Math.round(-4 + r() * 54);
    if (离祭坛(x, y) < 参.让祭坛 || 在南边空地(x, y)) continue;
    if (y < 14 && Math.abs(x) < 10) continue;
    if (Math.abs(x) <= 3 && y < 30) continue; // 鸟居正后面留一条天
    if (根们.some(([a, b]) => Math.hypot(a - x, b - y) < 参.间距)) continue;
    根们.push([x, y]);
  }
  return 根们;
};

const 花簇朝向 = ['north', 'east', 'south', 'west'] as const;

/** 整片林子的方块（草地 + 树 + 花簇）。每次调用出同一张表；画的时候 useMemo 一次 */
export const 樱花林方块 = (): 方块[] => {
  const out: 方块[] = [];
  const 占 = new Set<string>();
  const 放 = (状态: string, p: 格) => {
    const k = 键(p);
    if (占.has(k)) return;
    占.add(k);
    out.push({ 状态, 位: p });
  };
  const r = rng(参.种子 * 7 + 1);
  const 树们 = 樱花林树根().map(([x, y, 高]) => 一棵(x, y, rng(参.种子 * 131 + x * 977 + y * 31), 高));
  for (const t of 树们) for (const p of t.木) 放('minecraft:cherry_log[axis=y]', p);
  for (const t of 树们) for (const p of t.叶) 放('minecraft:cherry_leaves[distance=1,persistent=false,waterlogged=false]', p);
  // 花簇：树下多、空地上少；祭坛圈里、柱子脚下、你站的地方不撒
  const [x0, y0, x1, y1] = 参.地;
  const 柱脚 = (x: number, y: number) => 柱顶材料.some(({ 柱: [cx, cy] }) => Math.abs(x + 0.5 - cx) < 1.2 && Math.abs(y + 0.5 - cy) < 1.2);
  const 你脚 = (x: number, y: number) => Math.abs(x + 0.5 - 你.脚[0]) < 1.2 && Math.abs(y + 0.5 - 你.脚[1]) < 1.2;
  for (let n = 0, tries = 0; n < 参.花簇数 && tries < 参.花簇数 * 20; tries++) {
    const x = Math.floor(-30 + r() * 60);
    const y = Math.floor(-10 + r() * 50);
    if (离祭坛(x + 0.5, y + 0.5) < 参.花簇让 || 柱脚(x, y) || 你脚(x, y)) continue;
    // 鸟居两根柱子脚下（y 3～4、x ±2.5～3.5）不撒
    if (y === 3 && Math.abs(x + 0.5) > 1.5 && Math.abs(x + 0.5) < 4.5) continue;
    const 近树 = 树们.some((t) => Math.hypot(t.木[0]![0] - x, t.木[0]![1] - y) < 5);
    if (!近树 && r() < 0.55) continue;
    if (占.has(键([x, y, 0]))) continue;
    放(`minecraft:pink_petals[facing=${花簇朝向[Math.floor(r() * 4)]},flower_amount=${1 + Math.floor(r() * 4)}]`, [x, y, 0]);
    n++;
  }
  for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) 放('minecraft:grass_block[snowy=false]', [x, y, -1]);
  return out;
};
