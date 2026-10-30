// 编辑层的一条命令：照 MC 1.20 的命令写法（前面的 / 可写可不写），坐标一律写绝对整数（没有执行者，~ ^ 没有意义）。
//   fill x1 y1 z1 x2 y2 z2 <状态> [replace [<过滤>] | keep | hollow | outline | destroy]
//   setblock x y z <状态> [replace | keep | destroy]
//   clone x1 y1 z1 x2 y2 z2 x y z [replace | masked | filtered <过滤>] [normal | force | move]
//   place template <结构> x y z [none | clockwise_90 | 180 | counterclockwise_90] [none | front_back | left_right]
// <结构> 是 asset:<id>（资产锁里 .nbt / .schem 的字节），或相对 sourcing/worlds/ 的文件路径。这是唯一和游戏不同的地方：游戏里要的是资源路径，
// 重放时（重放.ts）展开成 setblock/fill，不用先把文件放进存档。destroy 当 replace（不掉落物品，烘焙也没有掉落物）。
import { 解析状态, 规范, type 方块状态 } from './方块状态.ts';
import { 旋转们, 镜像们, 变换位置, type 旋转, type 镜像, type 结构 } from './结构.ts';

export type 盒 = { x1: number; y1: number; z1: number; x2: number; y2: number; z2: number };
type 共有 = { 原文: string; 出处: string; 盒: 盒 };
export type 步 = 共有 &
  (
    | { 种: 'fill'; 状态: string; 状态原文: string; 模式: 'replace' | 'keep' | 'hollow' | 'outline'; 过滤?: 方块状态; 过滤原文?: string }
    | { 种: 'setblock'; 状态: string; 状态原文: string; 模式: 'replace' | 'keep' }
    | { 种: 'clone'; 源: 盒; 偏移: [number, number, number]; 遮罩: 'replace' | 'masked' | 'filtered'; 过滤?: 方块状态; 移动: boolean }
    | { 种: 'place'; 结构名: string; 结构: 结构; 位置: [number, number, number]; 旋转: 旋转; 镜像: 镜像 }
  );

export class 命令错误 extends Error {}

/** 按空白拆，方括号里的不拆（状态里的属性可以带空格），引号括起来的算一个 */
export const 拆词 = (s: string) => {
  const out: string[] = [];
  let cur = '', 深 = 0, 引: string | null = null;
  for (const ch of s.trim()) {
    if (引) {
      if (ch === 引) 引 = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") 引 = ch;
    else if (ch === '[') (深++, (cur += ch));
    else if (ch === ']') (深--, (cur += ch));
    else if (/\s/.test(ch) && 深 === 0) {
      if (cur) out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (引 || 深) throw new 命令错误(`引号或方括号没配对：${s}`);
  if (cur) out.push(cur);
  return out;
};

const 整数 = (t: string | undefined, 何: string, 原文: string) => {
  if (t === undefined) throw new 命令错误(`${原文}：缺 ${何}`);
  if (t.startsWith('~') || t.startsWith('^')) throw new 命令错误(`${原文}：${何} 要写绝对坐标（编辑层没有执行者，~ ^ 没有意义）`);
  if (!/^-?\d+$/.test(t)) throw new 命令错误(`${原文}：${何} 要是整数，写的是 ${t}`);
  return Number(t);
};
const 盒于 = (a: number[], b: number[]): 盒 => ({ x1: Math.min(a[0]!, b[0]!), y1: Math.min(a[1]!, b[1]!), z1: Math.min(a[2]!, b[2]!), x2: Math.max(a[0]!, b[0]!), y2: Math.max(a[1]!, b[1]!), z2: Math.max(a[2]!, b[2]!) });
export const 体积 = (b: 盒) => (b.x2 - b.x1 + 1) * (b.y2 - b.y1 + 1) * (b.z2 - b.z1 + 1);
export const 相交 = (a: 盒, b: 盒) => a.x1 <= b.x2 && b.x1 <= a.x2 && a.y1 <= b.y2 && b.y1 <= a.y2 && a.z1 <= b.z2 && b.z1 <= a.z2;
export const 并盒 = (a: 盒, b: 盒): 盒 => ({ x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), z1: Math.min(a.z1, b.z1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2), z2: Math.max(a.z2, b.z2) });

export type 解析环境 = {
  /** 校验方块状态（方块表），不过就抛 */
  校验: (s: 方块状态, 原文: string) => void;
  /** 按名字取结构（asset:<id> 或相对 sourcing/worlds/ 的路径） */
  取结构: (名: string) => 结构;
};

/** 状态参数：解析、校验、规范 */
const 状态参数 = (t: string | undefined, 原文: string, 环境: 解析环境) => {
  if (!t) throw new 命令错误(`${原文}：缺方块状态`);
  const s = 解析状态(t);
  环境.校验(s, 原文);
  return { 解析: s, 规范: 规范(s) };
};

/** 解析一条命令成一步 */
export const 解析命令 = (原文: string, 出处: string, 环境: 解析环境): 步 => {
  const w = 拆词(原文.replace(/^\s*\//, ''));
  const 尾 = (i: number, 允许: number) => {
    if (w.length > i + 允许) throw new 命令错误(`${原文}：多了 ${w.slice(i + 允许).join(' ')}`);
  };
  const 坐 = (i: number) => [整数(w[i], 'x', 原文), 整数(w[i + 1], 'y', 原文), 整数(w[i + 2], 'z', 原文)];
  switch (w[0]) {
    case 'fill': {
      const 盒 = 盒于(坐(1), 坐(4));
      const s = 状态参数(w[7], 原文, 环境);
      const 模 = w[8] ?? 'replace';
      if (模 === 'replace') {
        尾(9, 1);
        return { 种: 'fill', 原文, 出处, 盒, 状态: s.规范, 状态原文: w[7]!, 模式: 'replace', 过滤: w[9] ? 状态参数(w[9], 原文, 环境).解析 : undefined, 过滤原文: w[9] };
      }
      尾(9, 0);
      if (模 === 'destroy') return { 种: 'fill', 原文, 出处, 盒, 状态: s.规范, 状态原文: w[7]!, 模式: 'replace' };
      if (模 !== 'keep' && 模 !== 'hollow' && 模 !== 'outline') throw new 命令错误(`${原文}：fill 的模式只认 replace、keep、hollow、outline、destroy`);
      return { 种: 'fill', 原文, 出处, 盒, 状态: s.规范, 状态原文: w[7]!, 模式: 模 };
    }
    case 'setblock': {
      const p = 坐(1);
      const s = 状态参数(w[4], 原文, 环境);
      const 模 = w[5] ?? 'replace';
      尾(6, 0);
      if (模 !== 'replace' && 模 !== 'keep' && 模 !== 'destroy') throw new 命令错误(`${原文}：setblock 的模式只认 replace、keep、destroy`);
      return { 种: 'setblock', 原文, 出处, 盒: 盒于(p, p), 状态: s.规范, 状态原文: w[4]!, 模式: 模 === 'keep' ? 'keep' : 'replace' };
    }
    case 'clone': {
      if (w[1] === 'from' || w[1] === 'to') throw new 命令错误(`${原文}：不支持跨维度 clone（编辑层只管本世界这个维度）`);
      const 源 = 盒于(坐(1), 坐(4));
      const 到 = 坐(7);
      let i = 10;
      type 遮罩种 = 'replace' | 'masked' | 'filtered';
      let 遮罩: 遮罩种 = 'replace';
      let 过滤: 方块状态 | undefined;
      if (w[i] === 'replace' || w[i] === 'masked' || w[i] === 'filtered') {
        遮罩 = w[i] as 遮罩种;
        i++;
        if (遮罩 === 'filtered') 过滤 = 状态参数(w[i++], 原文, 环境).解析;
      }
      const 移 = w[i] ?? 'normal';
      if (移 !== 'normal' && 移 !== 'force' && 移 !== 'move') throw new 命令错误(`${原文}：clone 的最后一项只认 normal、force、move`);
      尾(i + 1, 0);
      const 偏移: [number, number, number] = [到[0]! - 源.x1, 到[1]! - 源.y1, 到[2]! - 源.z1];
      const 目标: 盒 = { x1: 源.x1 + 偏移[0], y1: 源.y1 + 偏移[1], z1: 源.z1 + 偏移[2], x2: 源.x2 + 偏移[0], y2: 源.y2 + 偏移[1], z2: 源.z2 + 偏移[2] };
      if (移 === 'normal' && 相交(源, 目标)) throw new 命令错误(`${原文}：源和目标重叠，游戏里 normal 会拒绝（要重叠写 force 或 move）`);
      return { 种: 'clone', 原文, 出处, 盒: 移 === 'move' ? 并盒(源, 目标) : 目标, 源, 偏移, 遮罩, 过滤, 移动: 移 === 'move' };
    }
    case 'place': {
      if (w[1] !== 'template') throw new 命令错误(`${原文}：place 只支持 place template（摆结构文件）`);
      const 名 = w[2];
      if (!名) throw new 命令错误(`${原文}：缺结构`);
      const 位置 = 坐(3) as [number, number, number];
      const r = (w[6] ?? 'none') as 旋转;
      const m = (w[7] ?? 'none') as 镜像;
      if (!旋转们.includes(r)) throw new 命令错误(`${原文}：旋转只认 ${旋转们.join('、')}`);
      if (!镜像们.includes(m)) throw new 命令错误(`${原文}：镜像只认 ${镜像们.join('、')}`);
      尾(8, 0);
      const 结构 = 环境.取结构(名);
      const [sx, sy, sz] = 结构.大小;
      const 角们 = [变换位置(0, 0, r, m), 变换位置(sx - 1, 0, r, m), 变换位置(0, sz - 1, r, m), 变换位置(sx - 1, sz - 1, r, m)];
      const 盒: 盒 = {
        x1: 位置[0] + Math.min(...角们.map((c) => c[0])),
        x2: 位置[0] + Math.max(...角们.map((c) => c[0])),
        z1: 位置[2] + Math.min(...角们.map((c) => c[1])),
        z2: 位置[2] + Math.max(...角们.map((c) => c[1])),
        y1: 位置[1],
        y2: 位置[1] + sy - 1,
      };
      return { 种: 'place', 原文, 出处, 盒, 结构名: 名, 结构, 位置, 旋转: r, 镜像: m };
    }
    default:
      throw new 命令错误(`${原文}：编辑层只认 fill、setblock、clone、place template`);
  }
};
