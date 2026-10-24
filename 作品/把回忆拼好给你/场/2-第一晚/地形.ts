// 第一晚的方块（给 方块拼搭，原点 = 格原点 [−0.5, 0, 0]，格 i 的中心在 x = i）：远景的崖和草地一张，近景的坑按挖到哪一步各一张。
// 纯模块（只引类型）；每张表只建一次（方块拼搭 换了数组就重建网格），按状态取同一个数组。
import type { 方块 } from '@engine/model/方块拼搭.tsx';
import { 地层, 后墙亮, 崖, 花草 } from './参数.ts';

const 草 = 'minecraft:grass_block';
const 土 = 'minecraft:dirt';
const 石 = 'minecraft:stone';
const 两格高 = new Set(['minecraft:tall_grass', 'minecraft:large_fern']);

const 放花草 = (out: 方块[], i0: number, i1: number) => {
  for (const [状态, i] of 花草) {
    if (i < i0 || i > i1) continue;
    if (两格高.has(状态)) {
      out.push({ 状态: `${状态}[half=lower]`, 位: [i, 1, 0] }, { 状态: `${状态}[half=upper]`, 位: [i, 1, 1] });
    } else out.push({ 状态, 位: [i, 1, 0] });
  }
};

/** 剖面那排（j = 0）地下：草方块、两层泥土，往下石头到 k 底 */
const 地下 = (out: 方块[], i: number, k底: number, 跳过?: (k: number) => boolean) => {
  for (let k = 地层.草; k >= k底; k--) {
    if (跳过?.(k)) continue;
    const 状态 = k === 地层.草 ? 草 : k >= 地层.土[1] ? 土 : 石;
    out.push({ 状态, 位: [i, 0, k] });
  }
};

/** 远景：x −16～12。i ≤ 崖.面i 是石崖（前后四排，从 k −5 到画面上沿以上），凹进去的那几段崖面往里退一格，凹口下面那格石头顶上是草；
 *  崖外是草地（前后四排草方块），剖面那排地下草方块、泥土、石头 */
const 远景方块们 = (): 方块[] => {
  const out: 方块[] = [];
  const 顶k = 12; // 远景画面上沿 z 10.75，斜投影里后排再抬 0.67
  for (let i = -16; i <= 12; i++) {
    if (i <= 崖.面i) {
      for (let j = 0; j <= 3; j++)
        for (let k = -5; k <= 顶k; k++) {
          const 凹 = i === 崖.面i && 崖.凹.some(([a, b]) => k >= a && k <= b);
          if (凹) continue;
          const 凹下 = i === 崖.面i && 崖.凹.some(([a]) => k === a - 1);
          const 煤 = j === 0 && 崖.煤.some(([ci, ck]) => ci === i && ck === k);
          out.push({ 状态: 凹下 ? 草 : 煤 ? 'minecraft:coal_ore' : 石, 位: [i, j, k] });
        }
      continue;
    }
    for (let j = 1; j <= 3; j++) out.push({ 状态: 草, 位: [i, j, 地层.草] });
    地下(out, i, -5);
  }
  放花草(out, 崖.面i + 1, 12);
  return out;
};

export const 远景地形 = 远景方块们();

/** 近景的坑：挖到哪一步。顶土 = 头顶填上的那格（放在草方块原来的位置） */
export type 坑态 = { 挖掉: number; 顶土: boolean };

/** 近景：x −7～7，前后四排草方块，剖面那排地下到 k −4（坑底的石头）。坑在 x 0：挖掉 = 从草方块往下挖掉了几格（0～3）；
 *  坑后面那一排（j = 1）也铺到 k −4，从洞口看是后墙（泥土、石头压暗一截，顶上那格草方块不压：靠近地面亮一点） */
const 近景方块们 = (态: 坑态): 方块[] => {
  const out: 方块[] = [];
  const 底 = 地层.石顶;
  for (let i = -7; i <= 7; i++) {
    for (let j = 1; j <= 3; j++) out.push({ 状态: 草, 位: [i, j, 地层.草] });
    if (i !== 0) {
      地下(out, i, 底);
      continue;
    }
    地下(out, i, 底, (k) => k > 地层.草 - 态.挖掉);
    if (态.顶土) out.push({ 状态: 土, 位: [0, 0, 地层.草] });
    for (let k = 地层.草 - 1; k >= 底; k--) out.push({ 状态: k >= 地层.土[1] ? 土 : 石, 位: [0, 1, k], 亮: 后墙亮 });
  }
  放花草(out, -7, 7);
  return out;
};

const 近景表 = new Map<string, 方块[]>();
/** 同一个状态取同一个数组 */
export const 近景地形 = (态: 坑态): 方块[] => {
  const 键 = `${态.挖掉}|${态.顶土}`;
  let b = 近景表.get(键);
  if (!b) 近景表.set(键, (b = 近景方块们(态)));
  return b;
};
