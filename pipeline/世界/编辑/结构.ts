// 摆结构用的结构文件：原版结构方块存的 .nbt（gzip NBT：size、palette 或 palettes、blocks），Sponge / WorldEdit 的 .schem（版本 2、3）。
// 读成统一的 结构：大小 + 逐格状态（null = 不动原来的方块：原版结构里没列出的格，即结构空位）。方块实体、实体丢掉（烘焙不画），读时记个数。
// 坐标：结构里 (x, y, z) 是相对最小角的偏移；.schem 的 Offset 只是 WorldEdit 粘贴时的参考点，这里不用（摆放位置 = 最小角，和 place template 一样）。
import { decompressNbt, readNbtNamed, type Compound, type NbtValue } from '../nbt.ts';
import { stateString } from '../存档.ts';

export type Structure = { 大小: [number, number, number]; 格: (string | null)[]; blockEntityCount: number; 格式: 'nbt' | 'schem2' | 'schem3' };
export const cellIndex = (s: Structure, x: number, y: number, z: number) => (y * s.大小[2] + z) * s.大小[0] + x;

const nbtNum = (v: NbtValue | undefined, fieldName: string) => {
  if (typeof v !== 'number') throw new Error(`结构文件缺 ${fieldName}`);
  return v;
};

/** 原版结构 .nbt */
const readVanilla = (root: Compound): Structure => {
  const size = root.size as number[];
  if (!Array.isArray(size) || size.length !== 3) throw new Error('结构 .nbt 缺 size');
  const dims = [size[0]!, size[1]!, size[2]!] as [number, number, number];
  const palette = (root.palette ?? (root.palettes as Compound[][] | undefined)?.[0]) as Compound[] | undefined;
  if (!palette) throw new Error('结构 .nbt 缺 palette');
  const blockStates = palette.map((p) => (p.Name === 'minecraft:structure_void' ? null : stateString(p.Name as string, p.Properties as Record<string, string> | undefined)));
  const s: Structure = { 大小: dims, 格: new Array(dims[0] * dims[1] * dims[2]).fill(null), blockEntityCount: 0, 格式: 'nbt' };
  for (const b of (root.blocks ?? []) as Compound[]) {
    const [x, y, z] = b.pos as number[];
    s.格[cellIndex(s, x!, y!, z!)] = blockStates[b.state as number] ?? null;
    if (b.nbt) s.blockEntityCount++;
  }
  return s;
};

// Sponge 的方块数据是变长整数（每字节低 7 位，高位 = 后面还有），下标 = x + z·宽 + y·宽·长
const readVarLen = (buf: Buffer, n: number) => {
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
const splitNotation = (s: string) => {
  const i = s.indexOf('[');
  return i < 0 ? stateString(s) : stateString(s.slice(0, i), Object.fromEntries(s.slice(i + 1, -1).split(',').filter(Boolean).map((kv) => kv.split('=') as [string, string])));
};

const readSponge = (sch: Compound): Structure => {
  const schematicVersion = nbtNum(sch.Version, 'Version');
  const size: [number, number, number] = [nbtNum(sch.Width, 'Width') & 0xffff, nbtNum(sch.Height, 'Height') & 0xffff, nbtNum(sch.Length, 'Length') & 0xffff];
  const schemBlocks = schematicVersion >= 3 ? (sch.Blocks as Compound | undefined) : sch;
  if (!schemBlocks) throw new Error('.schem 缺 Blocks');
  const pal = schemBlocks.Palette as Record<string, number> | undefined;
  const data = (schematicVersion >= 3 ? schemBlocks.Data : schemBlocks.BlockData) as Buffer | undefined;
  if (!pal || !data) throw new Error('.schem 缺 Palette 或方块数据');
  const blockStates: (string | null)[] = [];
  for (const [k, i] of Object.entries(pal)) blockStates[i] = k === 'minecraft:structure_void' ? null : splitNotation(k);
  const n = size[0] * size[1] * size[2];
  const ids = readVarLen(data, n);
  const s: Structure = { 大小: size, 格: new Array(n), blockEntityCount: ((schematicVersion >= 3 ? schemBlocks.BlockEntities : sch.BlockEntities) as unknown[] | undefined)?.length ?? 0, 格式: schematicVersion >= 3 ? 'schem3' : 'schem2' };
  // Sponge 的下标 x + z·宽 + y·宽·长 正好就是 格下标 的 (y·长 + z)·宽 + x
  for (let i = 0; i < n; i++) s.格[i] = blockStates[ids[i]!] ?? null;
  return s;
};

export const readStructure = (buf: Buffer, displayName = '结构'): Structure => {
  const { 名: rootName, 值: value } = readNbtNamed(decompressNbt(buf));
  try {
    if (rootName === 'Schematic' && value.Version !== undefined) return readSponge(value); // 版本 2：根就叫 Schematic
    if (value.Schematic && typeof value.Schematic === 'object') return readSponge(value.Schematic as Compound); // 版本 3：根下包一层
    if (value.size && (value.palette || value.palettes)) return readVanilla(value);
  } catch (e) {
    throw new Error(`${displayName}：${(e as Error).message}`);
  }
  throw new Error(`${displayName}：认不出是原版结构 .nbt 还是 Sponge .schem`);
};

// ---------- 旋转、镜像（照 place template / StructureTemplate 的规矩）----------
export type Rotation = 'none' | 'clockwise_90' | '180' | 'counterclockwise_90';
export type Mirror = 'none' | 'front_back' | 'left_right';
export const rotations: readonly Rotation[] = ['none', 'clockwise_90', '180', 'counterclockwise_90'];
export const mirrorModes: readonly Mirror[] = ['none', 'front_back', 'left_right'];

const horizontalDirs = ['north', 'east', 'south', 'west'] as const;
const rotateDir = (d: string, r: Rotation) => {
  const i = horizontalDirs.indexOf(d as (typeof horizontalDirs)[number]);
  if (i < 0) return d;
  return horizontalDirs[(i + rotations.indexOf(r)) % 4]!;
};
const mirrorDir = (d: string, m: Mirror) => (m === 'left_right' ? ({ north: 'south', south: 'north' } as Record<string, string>)[d] ?? d : m === 'front_back' ? ({ east: 'west', west: 'east' } as Record<string, string>)[d] ?? d : d);

// 铁轨的 shape（RailShape）由方向词拼成，跟着转、跟着镜像后按游戏的写法取回（south_east 不写成 east_south）
const railShapes = ['north_south', 'east_west', 'ascending_east', 'ascending_west', 'ascending_north', 'ascending_south', 'south_east', 'south_west', 'north_west', 'north_east'];
const transformRailShape = (v: string, r: Rotation, m: Mirror) => {
  if (!railShapes.includes(v)) return v;
  const [a, b] = v.split('_') as [string, string];
  const transformDir = (d: string) => rotateDir(mirrorDir(d, m), r);
  if (a === 'ascending') return `ascending_${transformDir(b)}`;
  const [p, q] = [transformDir(a), transformDir(b)];
  return railShapes.find((s) => s === `${p}_${q}` || s === `${q}_${p}`) ?? v;
};

/** 方块状态跟着转：facing、axis、rotation（0～15）、四个水平方向的连接属性、铁轨 shape；镜像时门的 hinge 左右对调（照 DoorBlock.mirror）。
 * 楼梯 shape 镜像时左右没换（游戏里分朝向轴有特例，没照搬；记在 docs/世界.md） */
export const transformState = (s: string, r: Rotation, m: Mirror) => {
  if ((r === 'none' && m === 'none') || !s.includes('[')) return s;
  const i = s.indexOf('[');
  const blockId = s.slice(0, i);
  const properties = Object.fromEntries(s.slice(i + 1, -1).split(',').map((kv) => kv.split('=') as [string, string]));
  const nextState: Record<string, string> = {};
  for (const [k, v] of Object.entries(properties)) {
    if (k === 'facing' || k === 'horizontal_facing') nextState[k] = rotateDir(mirrorDir(v, m), r);
    else if (k === 'axis' && (r === 'clockwise_90' || r === 'counterclockwise_90')) nextState[k] = v === 'x' ? 'z' : v === 'z' ? 'x' : v;
    else if (k === 'shape') nextState[k] = transformRailShape(v, r, m);
    else if (k === 'hinge' && m !== 'none') nextState[k] = v === 'left' ? 'right' : v === 'right' ? 'left' : v;
    else if (k === 'rotation' && /^\d+$/.test(v)) {
      let n = Number(v);
      // 照 Mirror.mirror(rotation, 16)：rotation 0 南、4 西、8 北、12 东；left_right 南北对调，front_back 东西对调
      if (m === 'left_right') n = (24 - n) % 16;
      else if (m === 'front_back') n = (16 - n) % 16;
      nextState[k] = String((n + 4 * rotations.indexOf(r)) % 16);
    } else if ((horizontalDirs as readonly string[]).includes(k)) {
      const destIndex = rotateDir(mirrorDir(k, m), r);
      nextState[destIndex] = v;
    } else nextState[k] = v;
  }
  return stateString(blockId, nextState);
};

/** 结构里 (x, y, z) 摆到世界后相对摆放点的偏移（先镜像再旋转，绕结构最小角） */
export const transformPos = (x: number, z: number, r: Rotation, m: Mirror): [number, number] => {
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
