// 编辑层的一条命令：照 MC 1.20 的命令写法（前面的 / 可写可不写），坐标一律写绝对整数（没有执行者，~ ^ 没有意义）。
//   fill x1 y1 z1 x2 y2 z2 <状态> [replace [<过滤>] | keep | hollow | outline | destroy]
//   setblock x y z <状态> [replace | keep | destroy]
//   clone x1 y1 z1 x2 y2 z2 x y z [replace | masked | filtered <过滤>] [normal | force | move]
//   place template <结构> x y z [none | clockwise_90 | 180 | counterclockwise_90] [none | front_back | left_right]
// <结构> 是 asset:<id>（资产锁里 .nbt / .schem 的字节），或相对 sourcing/worlds/ 的文件路径。这是唯一和游戏不同的地方：游戏里要的是资源路径，
// 重放时（重放.ts）展开成 setblock/fill，不用先把文件放进存档。destroy 当 replace（不掉落物品，烘焙也没有掉落物）。
import { parseState, canonicalState, type BlockState } from './方块状态.ts';
import { rotations, mirrorModes, transformPos, type Rotation, type Mirror, type Structure } from './结构.ts';

export type Box = { x1: number; y1: number; z1: number; x2: number; y2: number; z2: number };
type CommonFields = { 原文: string; provenance: string; boxes: Box };
export type EditStep = CommonFields &
  (
    | { kind: 'fill'; state: string; stateText: string; fillMode: 'replace' | 'keep' | 'hollow' | 'outline'; filterState?: BlockState; filterText?: string }
    | { kind: 'setblock'; state: string; stateText: string; fillMode: 'replace' | 'keep' }
    | { kind: 'clone'; 源: Box; offset: [number, number, number]; maskMode: 'replace' | 'masked' | 'filtered'; filterState?: BlockState; isMove: boolean }
    | { kind: 'place'; structureName: string; 结构: Structure; 位置: [number, number, number]; rotation: Rotation; mirror: Mirror }
  );

export class CommandError extends Error {}

/** 按空白拆，方括号里的不拆（状态里的属性可以带空格），引号括起来的算一个 */
export const splitWords = (s: string) => {
  const out: string[] = [];
  let cur = '', depth = 0, quoteChar: string | null = null;
  for (const ch of s.trim()) {
    if (quoteChar) {
      if (ch === quoteChar) quoteChar = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") quoteChar = ch;
    else if (ch === '[') (depth++, (cur += ch));
    else if (ch === ']') (depth--, (cur += ch));
    else if (/\s/.test(ch) && depth === 0) {
      if (cur) out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (quoteChar || depth) throw new CommandError(`引号或方括号没配对：${s}`);
  if (cur) out.push(cur);
  return out;
};

const toInt = (t: string | undefined, fieldName: string, raw: string) => {
  if (t === undefined) throw new CommandError(`${raw}：缺 ${fieldName}`);
  if (t.startsWith('~') || t.startsWith('^')) throw new CommandError(`${raw}：${fieldName} 要写绝对坐标（编辑层没有执行者，~ ^ 没有意义）`);
  if (!/^-?\d+$/.test(t)) throw new CommandError(`${raw}：${fieldName} 要是整数，写的是 ${t}`);
  return Number(t);
};
const boxOf = (a: number[], b: number[]): Box => ({ x1: Math.min(a[0]!, b[0]!), y1: Math.min(a[1]!, b[1]!), z1: Math.min(a[2]!, b[2]!), x2: Math.max(a[0]!, b[0]!), y2: Math.max(a[1]!, b[1]!), z2: Math.max(a[2]!, b[2]!) });
export const volume = (b: Box) => (b.x2 - b.x1 + 1) * (b.y2 - b.y1 + 1) * (b.z2 - b.z1 + 1);
export const intersects = (a: Box, b: Box) => a.x1 <= b.x2 && b.x1 <= a.x2 && a.y1 <= b.y2 && b.y1 <= a.y2 && a.z1 <= b.z2 && b.z1 <= a.z2;
export const unionBox = (a: Box, b: Box): Box => ({ x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), z1: Math.min(a.z1, b.z1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2), z2: Math.max(a.z2, b.z2) });

export type ParseEnv = {
  /** 校验方块状态（方块表），不过就抛 */
  validate: (s: BlockState, raw: string) => void;
  /** 按名字取结构（asset:<id> 或相对 sourcing/worlds/ 的路径） */
  getStructure: (structName: string) => Structure;
};

/** 状态参数：解析、校验、规范 */
const stateParam = (t: string | undefined, raw: string, env: ParseEnv) => {
  if (!t) throw new CommandError(`${raw}：缺方块状态`);
  const s = parseState(t);
  env.validate(s, raw);
  return { parsed: s, canonical: canonicalState(s) };
};

/** 解析一条命令成一步 */
export const parseCommand = (raw: string, source: string, env: ParseEnv): EditStep => {
  const w = splitWords(raw.replace(/^\s*\//, ''));
  const takeRest = (i: number, allowedCount: number) => {
    if (w.length > i + allowedCount) throw new CommandError(`${raw}：多了 ${w.slice(i + allowedCount).join(' ')}`);
  };
  const coord = (i: number) => [toInt(w[i], 'x', raw), toInt(w[i + 1], 'y', raw), toInt(w[i + 2], 'z', raw)];
  switch (w[0]) {
    case 'fill': {
      const box = boxOf(coord(1), coord(4));
      const s = stateParam(w[7], raw, env);
      const mode = w[8] ?? 'replace';
      if (mode === 'replace') {
        takeRest(9, 1);
        return { kind: 'fill', 原文: raw, provenance: source, boxes: box, state: s.canonical, stateText: w[7]!, fillMode: 'replace', filterState: w[9] ? stateParam(w[9], raw, env).parsed : undefined, filterText: w[9] };
      }
      takeRest(9, 0);
      if (mode === 'destroy') return { kind: 'fill', 原文: raw, provenance: source, boxes: box, state: s.canonical, stateText: w[7]!, fillMode: 'replace' };
      if (mode !== 'keep' && mode !== 'hollow' && mode !== 'outline') throw new CommandError(`${raw}：fill 的模式只认 replace、keep、hollow、outline、destroy`);
      return { kind: 'fill', 原文: raw, provenance: source, boxes: box, state: s.canonical, stateText: w[7]!, fillMode: mode };
    }
    case 'setblock': {
      const p = coord(1);
      const s = stateParam(w[4], raw, env);
      const mode = w[5] ?? 'replace';
      takeRest(6, 0);
      if (mode !== 'replace' && mode !== 'keep' && mode !== 'destroy') throw new CommandError(`${raw}：setblock 的模式只认 replace、keep、destroy`);
      return { kind: 'setblock', 原文: raw, provenance: source, boxes: boxOf(p, p), state: s.canonical, stateText: w[4]!, fillMode: mode === 'keep' ? 'keep' : 'replace' };
    }
    case 'clone': {
      if (w[1] === 'from' || w[1] === 'to') throw new CommandError(`${raw}：不支持跨维度 clone（编辑层只管本世界这个维度）`);
      const srcBox = boxOf(coord(1), coord(4));
      const endPos = coord(7);
      let i = 10;
      type MaskKind = 'replace' | 'masked' | 'filtered';
      let maskMode: MaskKind = 'replace';
      let filterState: BlockState | undefined;
      if (w[i] === 'replace' || w[i] === 'masked' || w[i] === 'filtered') {
        maskMode = w[i] as MaskKind;
        i++;
        if (maskMode === 'filtered') filterState = stateParam(w[i++], raw, env).parsed;
      }
      const moveMode = w[i] ?? 'normal';
      if (moveMode !== 'normal' && moveMode !== 'force' && moveMode !== 'move') throw new CommandError(`${raw}：clone 的最后一项只认 normal、force、move`);
      takeRest(i + 1, 0);
      const offset: [number, number, number] = [endPos[0]! - srcBox.x1, endPos[1]! - srcBox.y1, endPos[2]! - srcBox.z1];
      const target: Box = { x1: srcBox.x1 + offset[0], y1: srcBox.y1 + offset[1], z1: srcBox.z1 + offset[2], x2: srcBox.x2 + offset[0], y2: srcBox.y2 + offset[1], z2: srcBox.z2 + offset[2] };
      if (moveMode === 'normal' && intersects(srcBox, target)) throw new CommandError(`${raw}：源和目标重叠，游戏里 normal 会拒绝（要重叠写 force 或 move）`);
      return { kind: 'clone', 原文: raw, provenance: source, boxes: moveMode === 'move' ? unionBox(srcBox, target) : target, 源: srcBox, offset, maskMode, filterState, isMove: moveMode === 'move' };
    }
    case 'place': {
      if (w[1] !== 'template') throw new CommandError(`${raw}：place 只支持 place template（摆结构文件）`);
      const structName = w[2];
      if (!structName) throw new CommandError(`${raw}：缺结构`);
      const position = coord(3) as [number, number, number];
      const r = (w[6] ?? 'none') as Rotation;
      const m = (w[7] ?? 'none') as Mirror;
      if (!rotations.includes(r)) throw new CommandError(`${raw}：旋转只认 ${rotations.join('、')}`);
      if (!mirrorModes.includes(m)) throw new CommandError(`${raw}：镜像只认 ${mirrorModes.join('、')}`);
      takeRest(8, 0);
      const structure = env.getStructure(structName);
      const [sx, sy, sz] = structure.size;
      const corners = [transformPos(0, 0, r, m), transformPos(sx - 1, 0, r, m), transformPos(0, sz - 1, r, m), transformPos(sx - 1, sz - 1, r, m)];
      const box: Box = {
        x1: position[0] + Math.min(...corners.map((c) => c[0])),
        x2: position[0] + Math.max(...corners.map((c) => c[0])),
        z1: position[2] + Math.min(...corners.map((c) => c[1])),
        z2: position[2] + Math.max(...corners.map((c) => c[1])),
        y1: position[1],
        y2: position[1] + sy - 1,
      };
      return { kind: 'place', 原文: raw, provenance: source, boxes: box, structureName: structName, 结构: structure, 位置: position, rotation: r, mirror: m };
    }
    default:
      throw new CommandError(`${raw}：编辑层只认 fill、setblock、clone、place template`);
  }
};
