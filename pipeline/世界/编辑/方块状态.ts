// 编辑层里的方块状态：照 MC 命令的写法（`[命名空间:]名字[属性=值,…]`，省了命名空间就是 minecraft），规范成存档读出来的那种写法（存档.ts 的 状态串），
// 再按方块表（资产 数据/场景/关键帧/方块表，engine/voxel/真实方块表.ts 读的那份）校验：方块 id 要在表里，表里有的属性值要对得上。
// 方块表只导了影响外观的属性（楼梯没有 waterlogged，水没有 level），表里没有、又在 不影响外观 里的属性照写不查；别的不认识的属性报错。
// 不支持方块实体 NBT（`{…}`）和方块标签（`#minecraft:logs`）：烘焙不画方块实体，标签要游戏里的标签表。
import { 状态串 } from '../存档.ts';

export type 方块状态 = { 方块: string; 属性: Record<string, string> };

/** 方块表里没有、但存档里常见的属性：不影响外观，所以表里不导 */
const 不影响外观 = new Set(['waterlogged', 'distance', 'persistent', 'level', 'power', 'powered', 'triggered', 'enabled', 'locked', 'conditional', 'has_record', 'in_wall', 'occupied', 'signal_fire', 'bottom', 'disarmed', 'attached', 'hanging', 'drag', 'unstable', 'note', 'instrument', 'delay', 'mode', 'inverted', 'moisture', 'stage', 'honey_level', 'hatch', 'eggs', 'pickles', 'charges', 'bites', 'candles', 'lit', 'extended', 'short']);
export const 空气们 = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air']);

export class 状态写法错误 extends Error {}

/** 解析一个方块状态（不校验） */
export const 解析状态 = (文: string): 方块状态 => {
  const s = 文.trim();
  if (s.startsWith('#')) throw new 状态写法错误(`不支持方块标签 ${s}（要逐个写方块）`);
  if (s.includes('{')) throw new 状态写法错误(`不支持方块实体 NBT：${s}（烘焙不画方块实体）`);
  const m = /^([a-z0-9_.-]+:)?([a-z0-9_./-]+)(?:\[([^\]]*)\])?$/.exec(s);
  if (!m) throw new 状态写法错误(`方块状态写法不对：${s}（写成 命名空间:名字[属性=值,…]）`);
  const 属性: Record<string, string> = {};
  for (const kv of (m[3] ?? '').split(',').filter((x) => x.trim())) {
    const [k, v, ...多] = kv.split('=').map((x) => x.trim());
    if (!k || !v || 多.length) throw new 状态写法错误(`属性写法不对：${kv}（在 ${s} 里）`);
    if (k in 属性) throw new 状态写法错误(`属性 ${k} 写了两次（在 ${s} 里）`);
    属性[k] = v;
  }
  return { 方块: `${m[1] ?? 'minecraft:'}${m[2]}`, 属性 };
};

/** 规范写法：和存档里读出来的同一种（空气并掉、树叶去 distance/persistent、属性排序） */
export const 规范 = (s: 方块状态) => 状态串(s.方块, Object.keys(s.属性).length ? s.属性 : undefined);

/** 存档里的状态串拆回 方块 + 属性 */
export const 拆状态串 = (s: string): 方块状态 => {
  const i = s.indexOf('[');
  if (i < 0) return { 方块: s, 属性: {} };
  return { 方块: s.slice(0, i), 属性: Object.fromEntries(s.slice(i + 1, -1).split(',').map((kv) => kv.split('=') as [string, string])) };
};

/** 按方块表建的索引：方块 id → 属性名 → 可取的值 */
export class 方块表索引 {
  private 表 = new Map<string, Map<string, Set<string>>>();

  constructor(全部状态: readonly string[]) {
    for (const st of 全部状态) {
      const { 方块, 属性 } = 拆状态串(st);
      let m = this.表.get(方块);
      if (!m) this.表.set(方块, (m = new Map()));
      for (const [k, v] of Object.entries(属性)) {
        let vs = m.get(k);
        if (!vs) m.set(k, (vs = new Set()));
        vs.add(v);
      }
    }
  }

  有方块(id: string) {
    return 空气们.has(id) || this.表.has(id);
  }

  /** 校验；不过就抛错，说清是哪一处、表里有什么 */
  校验(s: 方块状态, 原文: string) {
    if (空气们.has(s.方块)) {
      if (Object.keys(s.属性).length) throw new 状态写法错误(`${原文}：空气没有属性`);
      return;
    }
    const m = this.表.get(s.方块);
    if (!m) {
      const 名 = s.方块.split(':')[1]!;
      const 像 = [...this.表.keys()].filter((k) => k.includes(名) || 名.includes(k.split(':')[1]!)).slice(0, 6);
      throw new 状态写法错误(`${原文}：方块表里没有 ${s.方块}${像.length ? `（像的有：${像.join('、')}）` : ''}；箱子、告示牌这类方块实体本来就不在表里`);
    }
    for (const [k, v] of Object.entries(s.属性)) {
      const vs = m.get(k);
      if (!vs) {
        if (不影响外观.has(k)) continue;
        throw new 状态写法错误(`${原文}：${s.方块} 没有属性 ${k}（方块表里有：${[...m.keys()].join('、') || '无'}）`);
      }
      if (!vs.has(v)) throw new 状态写法错误(`${原文}：${s.方块} 的 ${k} 不能是 ${v}（方块表里有：${[...vs].join('、')}）`);
    }
  }
}

/** replace / filtered 的过滤：方块一样，写了的属性都一样（照 MC 的方块谓词：没写的属性不管） */
export const 匹配 = (要: 方块状态, 实际状态串: string) => {
  const 实 = 拆状态串(实际状态串);
  if (要.方块 !== 实.方块 && !(空气们.has(要.方块) && 空气们.has(实.方块))) return false;
  return Object.entries(要.属性).every(([k, v]) => 实.属性[k] === v);
};
