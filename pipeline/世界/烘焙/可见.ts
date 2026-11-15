// 地形包「只保真看得见的格子」的安全项（用户 11-14 定目标，11-15 定做进管线）：封腔填实、埋格换石、邻圈、第 0 级核心边。
// 网格不变，或只少掉封死的腔壁；核心边只换裙边的贴图。格式、解码不变，渲染那边不用知道。原型、抽样实测和取舍见 docs/决策/0011-地形压缩.md「只保真看得见的格子」。
// 烘焙和转码（转码.ts 的 转码目录）都走这里：训练用的样本、写进包的区段都是变换后的。
//
// 区段是 34×34 列的窗口（核心 32×32 加一圈相邻区段的格，即邻圈），cm[c·nz + k]，c = y·34 + x，k 从下往上。
// 「整格」只看是不是整格不透明（方块表的 full，网格.ts occlusionMask 第 0 位）；树叶、玻璃、水、花草、半砖都不算。
// 区段最上一层上面当空气，最下一层下面当实心，同 网格.ts。
import fs from 'node:fs';
import path from 'node:path';
import type { SectionData, PackageInfo } from '../../../engine/voxel/区段包.ts';
import type { VoxelLib } from '../体素库.ts';
import { toColumnMajor } from './区段编码.ts';
import { decodeSectionFormat2 as decodeFormat2Section } from './格式2解码.ts';
import { blockFiles, blockCoordsFromName, blockFormat, readPackModel, readBlockIndex, decodeFormat1Section } from './读区段.ts';

export const windowEdge = 34;

/** 保真范围：游戏 x0, z0, x1, z1（两端都含）。渲染时会挖开、整平导入地形的地方，碰到的区段整块原样保留（世界声明 [[烘焙.保真]]） */
export type PreserveBox = [number, number, number, number];
/** 世界声明给的变换设置；填充 是换进去的整格方块（默认 minecraft:stone，下界没有石头要另写） */
export type VisibleSettings = { fillBlock: string; 保真: PreserveBox[] };
/** 记进 包.json 的 可见：包按它做过变换。保真 排好序，名字不记（改名字不该变包版本） */
export type VisibleRecord = { 填充: string; 保真: PreserveBox[] };
export const toRecord = (s: VisibleSettings): VisibleRecord => ({ 填充: s.fillBlock, 保真: [...s.保真].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]) });
/** 记录 a 是不是盖住了 b 的全部保真盒（同填充） */
export const recordCovers = (a: VisibleRecord, b: VisibleRecord) => a.填充 === b.填充 && b.保真.every((x) => a.保真.some((y) => y.join() === x.join()));

/** 可改的区段格子：色板可以加项；满[p] = 色板第 p 项是不是整格；石 = 填充方块的色板号。宽：窗口每边几列，不写是 34（原型拼大区段时用） */
export type CellGrid = { id: { L: number; i: number; j: number }; kBottom: number; nz: number; cm: Uint16Array; palette: number[]; fullMask: Uint8Array; stone: number; 宽?: number };

/** 状态号 → 整格（满）、挡面掩码（罩：1 整格、2 树叶、4 水这一层，网格.ts 只拿它剔核心边的面） */
export const stateTable = (voxelLib: VoxelLib, info: Pick<PackageInfo, '状态' | '群系'>) => {
  const value = voxelLib.sectionPack.buildPackTables(info).值, { full, leaf, layer } = voxelLib.blockTable.blockProps;
  const fullMask = Uint8Array.from(info.状态, (_, s) => full[value[s]!]!);
  const occlusion = Uint8Array.from(info.状态, (_, s) => { const v = value[s]!; return full[v]! | (leaf[v]! << 1) | (layer[v] === 3 ? 4 : 0); });
  return { fullMask, occlusion };
};

export const toGrid = (d: SectionData, stateFullMask: Uint8Array, fillId: number): CellGrid => {
  const palette = Array.from(d.palette);
  let stone = -1;
  for (let p = 1; p < palette.length / 2; p++) if (palette[2 * p] === fillId && palette[2 * p + 1] === 65535) { stone = p; break; }
  if (stone < 0) { stone = palette.length / 2; palette.push(fillId, 65535); }
  const fullMask = new Uint8Array(palette.length / 2);
  for (let p = 1; p < fullMask.length; p++) fullMask[p] = stateFullMask[palette[2 * p]!]!;
  return { id: { L: d.L, i: d.i, j: d.j }, kBottom: d.kBottom, nz: d.nz, cm: toColumnMajor(d), palette, fullMask, stone };
};
export const copyGrid = (g: CellGrid): CellGrid => ({ ...g, cm: g.cm.slice() });

/** 格子 → SectionData：色板照 写区段.ts 按出现先后重排（列从小到大、列内从上往下），没用到的丢掉，空气固定第 0 项。烘出来的区段本来就是这个顺序，所以没改的格子原样回来 */
export const makeSection = (g: CellGrid): SectionData => {
  const { nz, cm } = g, colCount = windowEdge * windowEdge, newIds = new Int32Array(g.palette.length / 2).fill(-1), palette = [g.palette[0]!, g.palette[1]!];
  newIds[0] = 0;
  const runCounts = new Uint16Array(colCount), runIds: number[] = [], runLengths: number[] = [];
  for (let c = 0; c < colCount; c++) {
    const r0 = runIds.length;
    for (let k = nz - 1; k >= 0; k--) {
      const p = cm[c * nz + k]!;
      let q = newIds[p]!;
      if (q < 0) { q = newIds[p] = palette.length / 2; palette.push(g.palette[2 * p]!, g.palette[2 * p + 1]!); }
      if (runIds.length > r0 && runIds[runIds.length - 1] === q) runLengths[runLengths.length - 1]!++;
      else { runIds.push(q); runLengths.push(1); }
    }
    runCounts[c] = runIds.length - r0;
  }
  return { ...g.id, kBottom: g.kBottom, nz, palette: Uint16Array.from(palette), runCounts, paletteIndex: Uint16Array.from(runIds), runLengths: Uint16Array.from(runLengths) };
};

/** 埋格换石：整格、六个邻格也都整格的换成填充方块。只动第 2～31 列（第 1、32 列是核心的边，网格给它们出裙边；第 0、33 列是邻圈），
 *  同一格在两个区段里的两份抄本始终一样。邻格都按没换之前判，换完仍是整格，先后无关。返回换了几格 */
export const replaceBuriedWithStone = (g: CellGrid): number => {
  const { nz, cm, fullMask, stone } = g, edge = g.宽 ?? windowEdge, rowStride = edge * nz, changed: number[] = [];
  for (let y = 2; y <= edge - 3; y++) for (let x = 2; x <= edge - 3; x++) {
    const base = (y * edge + x) * nz;
    for (let k = 0; k < nz - 1; k++) {
      const at = base + k, p = cm[at]!;
      if (p === stone || !fullMask[p] || !fullMask[cm[at + 1]!] || (k > 0 && !fullMask[cm[at - 1]!])) continue;
      if (!fullMask[cm[at - nz]!] || !fullMask[cm[at + nz]!] || !fullMask[cm[at - rowStride]!] || !fullMask[cm[at + rowStride]!]) continue;
      changed.push(at);
    }
  }
  for (const at of changed) cm[at] = stone;
  return changed.length;
};

/** 和露天连通的非整格（空气、水、树叶、花草、半砖……）：六邻连通，不设最小口径（1 格的口也算通）。
 *  种子：最上一层的非整格；离窗口边不到 种子圈 列的非整格（窗口外不知道，当连通） */
export const openAirConnected = (g: CellGrid, seedRing: number): Uint8Array => {
  const { nz, cm, fullMask } = g, edge = g.宽 ?? windowEdge, colCount = edge * edge, rowStride = edge * nz, openMask = new Uint8Array(cm.length), stack = new Int32Array(cm.length);
  let n = 0;
  const enqueue = (at: number) => { if (!openMask[at] && !fullMask[cm[at]!]) { openMask[at] = 1; stack[n++] = at; } };
  if (nz) for (let c = 0; c < colCount; c++) {
    const x = c % edge, y = (c - x) / edge;
    if (x < seedRing || y < seedRing || x >= edge - seedRing || y >= edge - seedRing) for (let k = 0; k < nz; k++) enqueue(c * nz + k);
    else enqueue(c * nz + nz - 1);
  }
  while (n) {
    const at = stack[--n]!, c = Math.floor(at / nz), k = at - c * nz, x = c % edge, y = (c - x) / edge;
    if (k > 0) enqueue(at - 1);
    if (k < nz - 1) enqueue(at + 1);
    if (x > 0) enqueue(at - nz);
    if (x < edge - 1) enqueue(at + nz);
    if (y > 0) enqueue(at - rowStride);
    if (y < edge - 1) enqueue(at + rowStride);
  }
  return openMask;
};

/** 封腔填实：不和露天连通的非整格填成填充方块。碰到核心的边（第 1、32 列）或邻圈就当连通（跨区段不判，见 0011），所以填的都在第 2～31 列。返回填掉的格（下标） */
export const fillSealedCavity = (g: CellGrid): Int32Array => {
  const { cm, fullMask, stone } = g, openMask = openAirConnected(g, 2), filled: number[] = [];
  for (let at = 0; at < cm.length; at++) if (!fullMask[cm[at]!] && !openMask[at]) filled.push(at);
  for (const at of filled) cm[at] = stone;
  return Int32Array.from(filled);
};

/** 邻圈（第 0、33 列）：本段从不出它们的面，网格只拿它的挡面掩码剔核心边的面。所以六面被埋的整格换填充方块（窗口外当整格；露在外面的那层不换，
 *  和旁边核心边那一列长得像，编码上下文更准），挡面掩码是 0 的非空气（归空[p] = 1：花草、火把这类）换成空气。返回换了几格 */
export const normalizeNeighborRing = (g: CellGrid, toAir: Uint8Array): number => {
  const { nz, cm, fullMask, stone } = g, edge = g.宽 ?? windowEdge, rowStride = edge * nz, changed: number[] = [];
  for (let c = 0; c < edge * edge; c++) {
    const x = c % edge, y = (c - x) / edge;
    if (x > 0 && y > 0 && x < edge - 1 && y < edge - 1) continue;
    for (let k = 0; k < nz; k++) {
      const at = c * nz + k, p = cm[at]!;
      if (!fullMask[p]) { if (p !== 0 && toAir[p]) changed.push(at); continue; }
      if (p === stone) continue;
      if (k === nz - 1 || !fullMask[cm[at + 1]!] || (k > 0 && !fullMask[cm[at - 1]!]) || (x > 0 && !fullMask[cm[at - nz]!]) || (x < edge - 1 && !fullMask[cm[at + nz]!]) || (y > 0 && !fullMask[cm[at - rowStride]!]) || (y < edge - 1 && !fullMask[cm[at + rowStride]!])) continue;
      changed.push(at);
    }
  }
  for (const at of changed) cm[at] = fullMask[cm[at]!] ? stone : 0;
  return changed.length;
};

/** 核心边（第 1、32 列）上六面被埋的整格换填充方块：网格只给它出朝邻圈的裙边面（邻段这一帧同级在画时不画），换了以后裙边贴图变成填充方块、并得更大。
 *  有邻 = [+x, −x, +y, −y] 那一侧同一级的区段在不在包里，不在的那一侧（包的边）不动。
 *  可挡(x, y, k, 侧)：邻段换粗一级画时，这块裙边朝着的那一格整个被粗格挡住（见 可见环境.父格挡）；不给 = 都挡（测试用）。返回换掉的格（下标） */
export const replaceCoreEdgeWithStone = (g: CellGrid, hasNeighbor: readonly boolean[], canBlock?: (x: number, y: number, k: number, side: number) => boolean): Int32Array => {
  const { nz, cm, fullMask, stone } = g, edge = g.宽 ?? windowEdge, rowStride = edge * nz, changed: number[] = [];
  for (let y = 1; y < edge - 1; y++) for (let x = 1; x < edge - 1; x++) {
    if (x > 1 && x < edge - 2 && y > 1 && y < edge - 2) continue;
    const sideFlags = [x === edge - 2, x === 1, y === edge - 2, y === 1];
    if (sideFlags.some((atSide, d) => atSide && !hasNeighbor[d])) continue;
    const base = (y * edge + x) * nz;
    for (let k = 0; k < nz - 1; k++) {
      const at = base + k, p = cm[at]!;
      if (p === stone || !fullMask[p] || !fullMask[cm[at + 1]!] || (k > 0 && !fullMask[cm[at - 1]!]) || !fullMask[cm[at - nz]!] || !fullMask[cm[at + nz]!] || !fullMask[cm[at - rowStride]!] || !fullMask[cm[at + rowStride]!]) continue;
      if (canBlock && sideFlags.some((atSide, d) => atSide && !canBlock(x, y, k, d))) continue;
      changed.push(at);
    }
  }
  for (const at of changed) cm[at] = stone;
  return Int32Array.from(changed);
};

export type TransformRecord = { filled: Int32Array; buriedCount: number; 邻圈: number; 核心边: Int32Array };
/** 四项按这个顺序做（封腔填完的格算整格，再判埋没埋）；原格子不动，返回改后的和记录 */
export const applySafety = (g0: CellGrid, occlusion: Uint8Array, hasNeighbor: readonly boolean[], canBlock?: (x: number, y: number, k: number, side: number) => boolean) => {
  const g = copyGrid(g0);
  const filled = fillSealedCavity(g), buriedCount = replaceBuriedWithStone(g);
  const toAir = Uint8Array.from({ length: g.palette.length / 2 }, (_, p) => (p && occlusion[g.palette[2 * p]!] === 0 ? 1 : 0));
  const neighborRingCount = normalizeNeighborRing(g, toAir);
  const coreEdge = g.id.L === 0 ? replaceCoreEdgeWithStone(g, hasNeighbor, canBlock) : new Int32Array(0);
  return { g, changeRecord: { filled, buriedCount, 邻圈: neighborRingCount, 核心边: coreEdge } satisfies TransformRecord };
};

type ParentSection = { kBottom: number; nz: number; occlusion: Uint8Array };

/** 一个包（变换的源：烘焙的中性表暂存包，或要转的旧包）的变换环境：整包索引（邻段在不在）、保真区段、第 1 级区段（核心边查父格）。
 *  源可以是格式 1、2、3；读的永远是原样的格子 */
export class VisibleEnv {
  readonly fullMask: Uint8Array;
  readonly occlusion: Uint8Array;
  readonly fillId: number;
  readonly record: VisibleRecord;
  private 有 = new Set<string>();
  private 保真 = new Set<string>();
  private 块 = new Map<string, { 文件: string; 格式: number; 索引: Uint32Array; fd?: number }>();
  private parentCache = new Map<string, ParentSection | null>();
  private 库: VoxelLib;
  private dir: string;

  constructor(voxelLib: VoxelLib, dir: string, settings: VisibleSettings) {
    this.库 = voxelLib;
    this.dir = dir;
    const info = JSON.parse(fs.readFileSync(path.join(dir, '包.json'), 'utf8')) as PackageInfo;
    ({ fullMask: this.fullMask, occlusion: this.occlusion } = stateTable(voxelLib, info));
    this.fillId = info.状态.indexOf(settings.fillBlock);
    if (this.fillId < 0) throw new Error(`包的状态表里没有填充方块 ${settings.fillBlock}（世界声明 [烘焙] 填充 换一种这个维度有的整格方块）`);
    if (!this.fullMask[this.fillId]) throw new Error(`填充方块 ${settings.fillBlock} 不是整格不透明`);
    this.record = toRecord(settings);
    const { tileHeaderLen, sectionAtIndex } = voxelLib.sectionPack;
    for (const fileName of blockFiles(dir)) {
      const file = path.join(dir, fileName), header = Buffer.alloc(tileHeaderLen), fd = fs.openSync(file, 'r');
      try { fs.readSync(fd, header, 0, tileHeaderLen, 0); } finally { fs.closeSync(fd); }
      const index = readBlockIndex(voxelLib, header), [ti, tj] = blockCoordsFromName(fileName);
      this.块.set(`${ti}.${tj}`, { 文件: file, 格式: blockFormat(header), 索引: index });
      for (let slot = 0; slot < voxelLib.sectionPack.tileEntryCount; slot++) if (index[2 * slot + 1]) { const q = sectionAtIndex(ti, tj, slot); this.有.add(`${q.L}/${q.i}/${q.j}`); }
    }
    // 保真盒碰到的区段（各级，四周多留 2 格）：游戏 (x, z) → 第 0 级的格 (x − ox, oz − 1 − z)，同 导入地形.ts 的 toSceneBox
    const [ox, , oz] = info.原点;
    for (const [x0, z0, x1, z1] of this.record.保真) {
      const a0 = x0 - ox, a1 = x1 - ox, b0 = oz - 1 - z1, b1 = oz - 1 - z0;
      for (let L = 0; L <= voxelLib.区段.coarsestLevel; L++) {
        const s = 2 ** L, w = 32 * s;
        for (let j = Math.floor((b0 - 2 * s) / w); j <= Math.floor((b1 + 2 * s) / w); j++)
          for (let i = Math.floor((a0 - 2 * s) / w); i <= Math.floor((a1 + 2 * s) / w); i++) this.保真.add(`${L}/${i}/${j}`);
      }
    }
  }

  hasSection = (L: number, i: number, j: number) => this.有.has(`${L}/${i}/${j}`);
  inPreserve = (L: number, i: number, j: number) => this.保真.has(`${L}/${i}/${j}`);
  get preservedSectionCount() { return [...this.保真].filter((k) => this.有.has(k)).length; }

  /** 从源包取一个区段（原样） */
  取 = (L: number, i: number, j: number): SectionData | null => {
    const { ti, tj, slot } = this.库.sectionPack.sectionInTile({ L, i, j });
    const b = this.块.get(`${ti}.${tj}`);
    const len = b?.索引[2 * slot + 1];
    if (!b || !len) return null;
    b.fd ??= fs.openSync(b.文件, 'r');
    const raw = Buffer.alloc(len);
    if (fs.readSync(b.fd, raw, 0, len, b.索引[2 * slot]!) !== len) throw new Error(`${b.文件} 读短了`);
    const id = { L, i, j };
    return b.格式 === 1 ? decodeFormat1Section(raw) : b.格式 === 2 ? decodeFormat2Section(raw, id) : this.库.sectionDecoder.decodeSection(raw, id, readPackModel(this.dir));
  };

  private parent = (i: number, j: number): ParentSection | null => {
    const k = `${i}/${j}`;
    let v = this.parentCache.get(k);
    if (v !== undefined) { this.parentCache.delete(k); this.parentCache.set(k, v); return v; }
    const d = this.取(1, i, j);
    v = null;
    if (d) {
      const cm = toColumnMajor(d), occlusion = new Uint8Array(cm.length);
      for (let at = 0; at < cm.length; at++) if (cm[at]) occlusion[at] = this.occlusion[d.palette[2 * cm[at]!]!]!;
      v = { kBottom: d.kBottom, nz: d.nz, occlusion };
    }
    if (this.parentCache.size >= 256) this.parentCache.delete(this.parentCache.keys().next().value!);
    this.parentCache.set(k, v);
    return v;
  };

  /** 第 0 级区段 (i, j) 的核心边格 (x, y, k) 朝 侧 那一格的裙边：邻段换第 1 级画时，正对着的粗格整格（或树叶，粗级画成实心）就挡住了。
   *  粗格在粗段 k底 以下时粗段不出面，按网格的规矩当实心，要那一列最下面存着的一格是实心才算挡（不然从那个洞看得到，见 0011 的 507 格）；
   *  没有粗段、粗格高过粗段顶都不算挡 */
  parentBlocks = (i: number, j: number, kBottom: number, x: number, y: number, k: number, side: number) => {
    const ax = side === 0 ? windowEdge - 1 : side === 1 ? 0 : x, ay = side === 2 ? windowEdge - 1 : side === 3 ? 0 : y;
    const X = Math.floor((32 * i + ax - 1) / 2), Y = Math.floor((32 * j + ay - 1) / 2), Z = Math.floor((kBottom + k) / 2);
    const pi = Math.floor(X / 32), pj = Math.floor(Y / 32), p = this.parent(pi, pj);
    if (!p) return false;
    const k1 = Z - p.kBottom, column = ((Y - 32 * pj + 1) * windowEdge + X - 32 * pi + 1) * p.nz;
    if (k1 >= p.nz) return false;
    return (p.occlusion[column + Math.max(0, k1)]! & 3) !== 0;
  };

  /** 一个区段的变换。保真范围里的原样；什么都没改也原样（字节不变） */
  transform = (d: SectionData): { d: SectionData; changeRecord: TransformRecord | null; g0?: CellGrid; g?: CellGrid } => {
    if (this.inPreserve(d.L, d.i, d.j)) return { d, changeRecord: null };
    const g0 = toGrid(d, this.fullMask, this.fillId);
    const hasNeighbor = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => this.hasSection(d.L, d.i + a!, d.j + b!));
    const { g, changeRecord } = applySafety(g0, this.occlusion, hasNeighbor, (x, y, k, side) => this.parentBlocks(d.i, d.j, d.kBottom, x, y, k, side));
    if (!changeRecord.filled.length && !changeRecord.buriedCount && !changeRecord.邻圈 && !changeRecord.核心边.length) return { d, changeRecord, g0, g };
    return { d: makeSection(g), changeRecord, g0, g };
  };

  close = () => {
    for (const b of this.块.values()) if (b.fd !== undefined) { fs.closeSync(b.fd); b.fd = undefined; }
  };
}
