// 摆结构用的结构文件：原版结构方块存的 .nbt（gzip NBT：size、palette 或 palettes、blocks），Sponge / WorldEdit 的 .schem（版本 2、3）。
// 读成统一的 结构：大小 + 逐格状态（null = 不动原来的方块：原版结构里没列出的格，即结构空位）。方块实体、实体丢掉（烘焙不画），读时记个数。
// 坐标：结构里 (x, y, z) 是相对最小角的偏移；.schem 的 Offset 只是 WorldEdit 粘贴时的参考点，这里不用（摆放位置 = 最小角，和 place template 一样）。
import { 解压NBT, 读NBT带名, type 复合, type NBT值 } from '../nbt.ts';
import { 状态串 } from '../存档.ts';

export type 结构 = { 大小: [number, number, number]; 格: (string | null)[]; 方块实体数: number; 格式: 'nbt' | 'schem2' | 'schem3' };
export const 格下标 = (s: 结构, x: number, y: number, z: number) => (y * s.大小[2] + z) * s.大小[0] + x;

const 数 = (v: NBT值 | undefined, 何: string) => {
  if (typeof v !== 'number') throw new Error(`结构文件缺 ${何}`);
  return v;
};

/** 原版结构 .nbt */
const 读原版 = (根: 复合): 结构 => {
  const size = 根.size as number[];
  if (!Array.isArray(size) || size.length !== 3) throw new Error('结构 .nbt 缺 size');
  const 大小 = [size[0]!, size[1]!, size[2]!] as [number, number, number];
  const palette = (根.palette ?? (根.palettes as 复合[][] | undefined)?.[0]) as 复合[] | undefined;
  if (!palette) throw new Error('结构 .nbt 缺 palette');
  const 色 = palette.map((p) => (p.Name === 'minecraft:structure_void' ? null : 状态串(p.Name as string, p.Properties as Record<string, string> | undefined)));
  const s: 结构 = { 大小, 格: new Array(大小[0] * 大小[1] * 大小[2]).fill(null), 方块实体数: 0, 格式: 'nbt' };
  for (const b of (根.blocks ?? []) as 复合[]) {
    const [x, y, z] = b.pos as number[];
    s.格[格下标(s, x!, y!, z!)] = 色[b.state as number] ?? null;
    if (b.nbt) s.方块实体数++;
  }
  return s;
};

// Sponge 的方块数据是变长整数（每字节低 7 位，高位 = 后面还有），下标 = x + z·宽 + y·宽·长
const 解变长 = (buf: Buffer, n: number) => {
  const out = new Int32Array(n);
  let pos = 0;
  for (let i = 0; i < n; i++) {
    let v = 0, shift = 0, b: number;
    do {
      b = buf[pos++]!;
      v |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80);
    out[i] = v;
  }
  return out;
};
const 拆写法 = (s: string) => {
  const i = s.indexOf('[');
  return i < 0 ? 状态串(s) : 状态串(s.slice(0, i), Object.fromEntries(s.slice(i + 1, -1).split(',').filter(Boolean).map((kv) => kv.split('=') as [string, string])));
};

const 读Sponge = (sch: 复合): 结构 => {
  const 版本 = 数(sch.Version, 'Version');
  const 大小: [number, number, number] = [数(sch.Width, 'Width') & 0xffff, 数(sch.Height, 'Height') & 0xffff, 数(sch.Length, 'Length') & 0xffff];
  const 块 = 版本 >= 3 ? (sch.Blocks as 复合 | undefined) : sch;
  if (!块) throw new Error('.schem 缺 Blocks');
  const pal = 块.Palette as Record<string, number> | undefined;
  const data = (版本 >= 3 ? 块.Data : 块.BlockData) as Buffer | undefined;
  if (!pal || !data) throw new Error('.schem 缺 Palette 或方块数据');
  const 色: (string | null)[] = [];
  for (const [k, i] of Object.entries(pal)) 色[i] = k === 'minecraft:structure_void' ? null : 拆写法(k);
  const n = 大小[0] * 大小[1] * 大小[2];
  const ids = 解变长(data, n);
  const s: 结构 = { 大小, 格: new Array(n), 方块实体数: ((版本 >= 3 ? 块.BlockEntities : sch.BlockEntities) as unknown[] | undefined)?.length ?? 0, 格式: 版本 >= 3 ? 'schem3' : 'schem2' };
  // Sponge 的下标 x + z·宽 + y·宽·长 正好就是 格下标 的 (y·长 + z)·宽 + x
  for (let i = 0; i < n; i++) s.格[i] = 色[ids[i]!] ?? null;
  return s;
};

export const 读结构 = (buf: Buffer, 名 = '结构'): 结构 => {
  const { 名: 根名, 值 } = 读NBT带名(解压NBT(buf));
  try {
    if (根名 === 'Schematic' && 值.Version !== undefined) return 读Sponge(值); // 版本 2：根就叫 Schematic
    if (值.Schematic && typeof 值.Schematic === 'object') return 读Sponge(值.Schematic as 复合); // 版本 3：根下包一层
    if (值.size && (值.palette || 值.palettes)) return 读原版(值);
  } catch (e) {
    throw new Error(`${名}：${(e as Error).message}`);
  }
  throw new Error(`${名}：认不出是原版结构 .nbt 还是 Sponge .schem`);
};

// ---------- 旋转、镜像（照 place template / StructureTemplate 的规矩）----------
export type 旋转 = 'none' | 'clockwise_90' | '180' | 'counterclockwise_90';
export type 镜像 = 'none' | 'front_back' | 'left_right';
export const 旋转们: readonly 旋转[] = ['none', 'clockwise_90', '180', 'counterclockwise_90'];
export const 镜像们: readonly 镜像[] = ['none', 'front_back', 'left_right'];

const 水平向 = ['north', 'east', 'south', 'west'] as const;
const 转向 = (d: string, r: 旋转) => {
  const i = 水平向.indexOf(d as (typeof 水平向)[number]);
  if (i < 0) return d;
  return 水平向[(i + 旋转们.indexOf(r)) % 4]!;
};
const 镜向 = (d: string, m: 镜像) => (m === 'left_right' ? ({ north: 'south', south: 'north' } as Record<string, string>)[d] ?? d : m === 'front_back' ? ({ east: 'west', west: 'east' } as Record<string, string>)[d] ?? d : d);

/** 方块状态跟着转：facing、axis、rotation（0～15）、四个水平方向的连接属性。楼梯 shape、铁轨 shape 这类跟镜像的左右没换（记在 docs/世界.md） */
export const 变换状态 = (s: string, r: 旋转, m: 镜像) => {
  if ((r === 'none' && m === 'none') || !s.includes('[')) return s;
  const i = s.indexOf('[');
  const 方块 = s.slice(0, i);
  const 属性 = Object.fromEntries(s.slice(i + 1, -1).split(',').map((kv) => kv.split('=') as [string, string]));
  const 新: Record<string, string> = {};
  for (const [k, v] of Object.entries(属性)) {
    if (k === 'facing' || k === 'horizontal_facing') 新[k] = 转向(镜向(v, m), r);
    else if (k === 'axis' && (r === 'clockwise_90' || r === 'counterclockwise_90')) 新[k] = v === 'x' ? 'z' : v === 'z' ? 'x' : v;
    else if (k === 'rotation' && /^\d+$/.test(v)) {
      let n = Number(v);
      // 照 Mirror.mirror(rotation, 16)：rotation 0 南、4 西、8 北、12 东；left_right 南北对调，front_back 东西对调
      if (m === 'left_right') n = (24 - n) % 16;
      else if (m === 'front_back') n = (16 - n) % 16;
      新[k] = String((n + 4 * 旋转们.indexOf(r)) % 16);
    } else if ((水平向 as readonly string[]).includes(k)) {
      const 到 = 转向(镜向(k, m), r);
      新[到] = v;
    } else 新[k] = v;
  }
  return 状态串(方块, 新);
};

/** 结构里 (x, y, z) 摆到世界后相对摆放点的偏移（先镜像再旋转，绕结构最小角） */
export const 变换位置 = (x: number, z: number, r: 旋转, m: 镜像): [number, number] => {
  let a = x, b = z;
  if (m === 'left_right') b = -b;
  else if (m === 'front_back') a = -a;
  switch (r) {
    case 'clockwise_90':
      return [-b, a];
    case 'counterclockwise_90':
      return [b, -a];
    case '180':
      return [-a, -b];
    default:
      return [a, b];
  }
};
