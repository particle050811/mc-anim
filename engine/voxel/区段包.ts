// 区段包：从存档导入的地形，按 lib/体素/区段.ts 的 (L, i, j) 一块块烘焙好的方块。
// 存档（.mca）→ 列段（工具/导入/列段.ts）→ 区段包（工具/导入/烘焙.ts 写）→ 这里解成 lib/体素/生成.ts 的 体素块，交给网格。
// 这个文件只管块文件、包信息和体素块的格式（纯函数，不碰 node:fs，浏览器里也能用）；区段的编码在 pipeline/世界/烘焙/区段编码.ts，解码在 engine/voxel/区段解码.ts。
//
// ---------- 坐标 ----------
// 场景坐标 Z 朝上、北 = +Y（游戏 −Z）、1 格 = 1 米；游戏坐标 y 朝上、z 朝南。包.json 的 原点 = [ox, oy, oz]：
//   场景 X = 游戏 x − ox，场景 Y = oz − 游戏 z，场景 Z = 游戏 y − oy（连续坐标，和 lib/方块网格.tsx 的 fromGame [x, −z, y] 同一个朝向）；
//   反过来 游戏 x = X + ox，游戏 z = oz − Y，游戏 y = Z + oy。
//   一格方块按最小角记：游戏方块 (x, y, z) 是场景格 (x − ox, oz − 1 − z, y − oy)，场景格 (i, j, k) 是游戏方块 (i + ox, k + oy, oz − 1 − j)。
// ox、oz 取 2048 的整数倍（格式 3 以前最粗一级一个区段 2048 米；格式 4 起是 4096 米，块不再和游戏坐标的 4096 对齐，不要紧）：每级格子边界都落在游戏坐标 2^L 的整数倍上，和 Voxy 一级级合并的格子对齐，合并时比的位序（游戏坐标 x·4 + y·2 + z，见 lib/体素/生成.ts）才对得上。
// oy：暮色森林 0（twilight_noise_gen.json 的 sea_level 是 0），主世界 64（场景 z = 0 是 y = 64，海平面 y = 63 在 z = −1）。
//
// ---------- 包 ----------
// 一个目录：
//   包.json         包信息（下面的类型）：原点、方块状态表、群系表、最粗级、粗图里各数组在哪
//   粗图.bin.gz     粗高度图、能不能细分的位图（gzip，见下面的 包信息）
//   模型.bin       本包的概率模型（区段模型.ts），改模型改变包版本，不改变解码器代码
//   <ti>.<tj>.块     块文件：最粗一级的一个区段一块（现有包 4096 米，烘焙也按这个分块做），块里各级的区段打成一个文件，格式见下面的 块文件
// 区段的核心（64 × 64 列，不算相邻那圈）里一列数据都没有的不存。
//
// 区段（块文件里的一段，小端；L、i、j 由它在块头里的位置定，不存）：
//   偏移 0  u16 nz          存了几格高；再往上全是空气
//        2  i16 k底         存的最低一格的格号（第 L 级一格 2^L 米，场景 z = k底·2^L）；再往下当实心（网格那边下面当石头，不画）
//        4  u16 P           色板项数，色板[0] 固定是空气
//        6  色板 u16[2P]    每项 (状态号, 群系号)，下标进 包.json 的 状态、群系；群系号 65535 = 不染色的方块，不记群系
//        接着区间编码流（逐格预测压缩，见 pipeline/世界/烘焙/区段编码.ts，不包 gzip）
//   解出来是 SectionData：66 × 66 列 = 核心 64 × 64 列加四周各一列相邻区段的格（同一级），按 (y, x) 排、x 先变（和 体素块 的 vox 一样）。
//   每列从上往下若干段，每段 号（色板下标）连续 长 格，一列的各段正好盖满 [k底, k底 + nz)；空气也成段，没有数据的列是一整段空气。
//
// 区段里只存地表附近：`kBottom` = ⌊(区段连同相邻那圈里最低的地表 − 4) / 2^L⌋（照 lib/体素/生成.ts 往地面下多留 4 米），地表 = 一列里最高的整格不透明方块的顶；
// 浮空的东西（云岛、空中史莱姆岛）底下的高空当横着连到露天的，地表拉到空当底（见 工具/导入/烘焙.ts 的 `surfaceUnderOverhangs`）。
// 竖井、洞口、湖底这些从上面看得见的低处会把地表拉低，跟着存下来，不会被封死。
//
// 方块状态存字符串（包.json 的 `state` 表），解的时候才用 lib/真实方块表.ts 的 `voxelFromState()` 换成体素值，所以方块表往后加方块、换编号，旧包照样解得对。
// 群系只给染色的方块记（草、树叶、水……），颜色解的时候按群系取固定色、不做混合（用户 10-04 定，和 mcai mesh 导出的网格一致）。
// 第 1 级以上的格子是烘焙时照 Voxy Mipper 合并好的（比不透明度，要查方块表），所以方块表改了不透明度、补了缺的方块，要重新烘焙。
import { sectionFormatVersion } from './区段模型.ts';
import { defaultBlockTable, type BlockTable } from './真实方块表.ts';
import { sectionCells, paddedSectionCols, maxCoarsestLevel, type SectionId } from './区段.ts';
import type { VoxelGrid, PaletteEntry } from './生成.ts';

export { paddedSectionCols };
// 1：行程 gzip；2：全局初值逐格预测；3：每包模型（模型.bin）、32 类状态条件概率；4：区段从 32×32 改成 64×64（66 列带邻圈）、块从 2048 米改成 4096 米，编码同 3；
// 5：块头只记有的区段、每包自己定最粗级、粗高度图从 包.json 挪进 粗图.bin.gz，区段编码同 4。
// 旧格式只有 pipeline 读（转码用）：块头见 pipeline/世界/烘焙/旧块头.ts，区段解码见同目录 格式2解码.ts、格式3解码.ts，包.json 见 包信息.ts。
export const formatVersion = sectionFormatVersion;
export const noBiome = 65535;

// ---------- 块文件 ----------
// 一块一个文件，不一个区段一个：区段有十几万个，Remotion 列 public 目录只列前 1 万个、bundle 要一个个拷。
// 一块 = 最粗一级的一个区段，边长 64 × 2^最粗级 米（包.json 的 coarsestLevel；现有包都是 6，一块 4096 米）。块里第 L 级一边 n = 2^(最粗级 − L) 个区段，
// 块内项号 k = sj·n + si（si 先变），区段 (i, j) = (ti·n + si, tj·n + sj)。
// 文件（格式 5，小端）：
//   偏移 0  "MCQK" 魔数   4  u32 版本（formatVersion）   8  i32 ti、i32 tj（块号：块的场景范围 [ti·块边长, …) × [tj·块边长, …)）
//        16 u32 头长 H（整个文件头的字节数，区段数据从 H 起）   20 u8 最粗级（和包.json 的一样）   21 三个 0
//        24 起 L = 0…最粗级 依次，每级一个 u8 存法，后面跟这一级有哪些项：
//           0 = 一项都没有；1 = n² 项全有；2 = 位图 ⌈n²/8⌉ 字节（第 k 位 = 第 k 项，字节里从低位起）；3 = 列表：u32 个数 m，再 m 个 u32 项号（升序）
//           写的时候每级挑 2、3 里字节少的（一样多挑位图），全有、全没有用 1、0
//        接着 u32 长[]：有的区段每个一项，按级、级内项号升序
//        H 起各区段的数据（区段格式见上），和长的顺序一样挨着放、不留空：第 n 个的偏移 = H + 前 n 个的长之和
// 格式 4 以前文件头定长（7 级全部可能的 5461 项各存偏移和长，没有的也占位），稀疏的包（珠峰 DH 1344 块只有第 6 级一个区段）头比数据还大；
// 格式 5 只记有的：铺满的块头约是格式 4 的一半，只有一个区段的块 35 字节。
// 浏览器先按 Range 取文件头再按 Range 取要的区段（engine/voxel/导入地形.ts）：头不定长，第一次按包.json 的 tileHeaderMax（本包最长的头，封顶 tileHeaderGuessCap）取，
// 头比取到的长（只有比封顶还长的块）才补取一次。Range 越过文件尾时 Remotion 渲染和 Studio 的静态服务都截到文件尾（range-parser）。
export const tileSizeOf = (coarsestLevel: number) => sectionCells * 2 ** coarsestLevel;
const tileMagic = 0x4b51434d; // "MCQK"
export const tilePrefixLen = 24;
export const tileHeaderGuessCap = 64 * 1024;
export const tileFileName = (ti: number, tj: number) => `${ti}.${tj}.块`;

const checkCoarsest = (coarsestLevel: number) => {
  if (!(Number.isInteger(coarsestLevel) && coarsestLevel >= 0 && coarsestLevel <= maxCoarsestLevel)) throw new Error(`最粗级要是 0～${maxCoarsestLevel} 的整数，拿到 ${coarsestLevel}`);
};
/** 区段在哪个块、是这一级的第几项 */
export const sectionInTile = (section: SectionId, coarsestLevel: number) => {
  if (!(section.L >= 0 && section.L <= coarsestLevel)) throw new Error(`区段 ${section.L}|${section.i}|${section.j} 的级不在 0～${coarsestLevel}（本包最粗级）`);
  const perEdge = 2 ** (coarsestLevel - section.L);
  const ti = Math.floor(section.i / perEdge), tj = Math.floor(section.j / perEdge);
  return { ti, tj, local: (section.j - tj * perEdge) * perEdge + (section.i - ti * perEdge) };
};
export const sectionAtLocal = (ti: number, tj: number, coarsestLevel: number, L: number, local: number): SectionId => {
  const perEdge = 2 ** (coarsestLevel - L);
  return { L, i: ti * perEdge + (local % perEdge), j: tj * perEdge + Math.floor(local / perEdge) };
};

/** 解开的块头：第 L 级的区段是第 levelStart[L] ～ levelStart[L + 1] − 1 个，local 是级内项号（升序），offset 从文件开头算 */
export type TileIndex = { ti: number; tj: number; coarsestLevel: number; headerLen: number; levelStart: Uint32Array; local: Uint32Array; offset: Uint32Array; length: Uint32Array };

/** 块里的区段，按文件里的先后 */
export function* tileSections(index: TileIndex): Generator<{ id: SectionId; off: number; len: number }> {
  for (let L = 0; L <= index.coarsestLevel; L++)
    for (let n = index.levelStart[L]!; n < index.levelStart[L + 1]!; n++) yield { id: sectionAtLocal(index.ti, index.tj, index.coarsestLevel, L, index.local[n]!), off: index.offset[n]!, len: index.length[n]! };
}
/** 块里有没有这个区段：有就给偏移和长，没有给 null（区段要在这一块里） */
export const findInTile = (index: TileIndex, section: SectionId): { off: number; len: number } | null => {
  const at = sectionInTile(section, index.coarsestLevel);
  if (at.ti !== index.ti || at.tj !== index.tj) throw new Error(`区段 ${section.L}|${section.i}|${section.j} 不在块 ${index.ti}.${index.tj} 里`);
  let lo = index.levelStart[section.L]!, hi = index.levelStart[section.L + 1]!;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (index.local[mid]! < at.local) lo = mid + 1;
    else hi = mid;
  }
  return lo < index.levelStart[section.L + 1]! && index.local[lo] === at.local ? { off: index.offset[lo]!, len: index.length[lo]! } : null;
};

/** 写块文件：给这一块的区段（编好的字节，先后不限），返回按格式排好的 [块头, 各区段]，依次写进文件 */
export const encodeTile = (ti: number, tj: number, coarsestLevel: number, sections: readonly { id: SectionId; bytes: Uint8Array }[]): Uint8Array[] => {
  checkCoarsest(coarsestLevel);
  const items = sections.map((s) => {
    const at = sectionInTile(s.id, coarsestLevel);
    if (at.ti !== ti || at.tj !== tj) throw new Error(`区段 ${s.id.L}|${s.id.i}|${s.id.j} 不在块 ${ti}.${tj} 里`);
    return { L: s.id.L, local: at.local, bytes: s.bytes };
  });
  items.sort((a, b) => a.L - b.L || a.local - b.local);
  for (let n = 1; n < items.length; n++) if (items[n]!.L === items[n - 1]!.L && items[n]!.local === items[n - 1]!.local) throw new Error(`块 ${ti}.${tj} 里区段重复：第 ${items[n]!.L} 级第 ${items[n]!.local} 项`);
  const perLevel: number[][] = Array.from({ length: coarsestLevel + 1 }, () => []);
  for (const it of items) perLevel[it.L]!.push(it.local);
  let headerLen = tilePrefixLen;
  const modes = perLevel.map((locals, L) => {
    const n2 = 4 ** (coarsestLevel - L), bitmapBytes = Math.ceil(n2 / 8), listBytes = 4 + 4 * locals.length;
    const mode = !locals.length ? 0 : locals.length === n2 ? 1 : bitmapBytes <= listBytes ? 2 : 3;
    headerLen += 1 + (mode === 2 ? bitmapBytes : mode === 3 ? listBytes : 0);
    return mode;
  });
  headerLen += 4 * items.length;
  const head = new Uint8Array(headerLen), dv = new DataView(head.buffer);
  dv.setUint32(0, tileMagic, true);
  dv.setUint32(4, formatVersion, true);
  dv.setInt32(8, ti, true);
  dv.setInt32(12, tj, true);
  dv.setUint32(16, headerLen, true);
  head[20] = coarsestLevel;
  let p = tilePrefixLen;
  perLevel.forEach((locals, L) => {
    const mode = modes[L]!;
    head[p++] = mode;
    if (mode === 2) {
      for (const k of locals) head[p + (k >> 3)]! |= 1 << (k & 7);
      p += Math.ceil(4 ** (coarsestLevel - L) / 8);
    } else if (mode === 3) {
      dv.setUint32(p, locals.length, true);
      p += 4;
      for (const k of locals) dv.setUint32(p, k, true), (p += 4);
    }
  });
  let total = headerLen;
  for (const it of items) {
    dv.setUint32(p, it.bytes.length, true);
    p += 4;
    total += it.bytes.length;
  }
  if (total > 0xffffffff) throw new Error(`块 ${ti}.${tj} 超过 4 GB`);
  return [head, ...items.map((it) => it.bytes)];
};

const corruptTile = (why: string) => new Error(`块文件头损坏（${why}）：anim check --deep 核对地形包`);
/** 文件头开头 tilePrefixLen 字节 → 整个头多长（核魔数、版本） */
export const tileHeaderLength = (raw: Uint8Array): number => {
  if (raw.length < tilePrefixLen) throw corruptTile(`不到 ${tilePrefixLen} 字节`);
  const dv = new DataView(raw.buffer, raw.byteOffset, tilePrefixLen);
  if (dv.getUint32(0, true) !== tileMagic) throw new Error('不是块文件');
  const version = dv.getUint32(4, true);
  if (version !== formatVersion) throw new Error(`块文件是格式 ${version}，这版代码只读格式 ${formatVersion}：地形包版本和 assets/地形版本.json 对不上，anim assets pull，或 anim world transcode 转过来`);
  return dv.getUint32(16, true);
};
/** 解块头：raw 至少要有整个头（tileHeaderLength 说的长度），多出来的不管 */
export const decodeTileHeader = (raw: Uint8Array): TileIndex => {
  const headerLen = tileHeaderLength(raw);
  if (raw.length < headerLen) throw corruptTile(`头 ${headerLen} 字节，只给了 ${raw.length}`);
  const dv = new DataView(raw.buffer, raw.byteOffset, headerLen);
  const coarsestLevel = raw[20]!;
  checkCoarsest(coarsestLevel);
  const levelStart = new Uint32Array(coarsestLevel + 2);
  const locals: number[] = [];
  let p = tilePrefixLen;
  const need = (n: number) => {
    if (p + n > headerLen) throw corruptTile('级表越过头长');
  };
  for (let L = 0; L <= coarsestLevel; L++) {
    levelStart[L] = locals.length;
    need(1);
    const mode = raw[p++]!, n2 = 4 ** (coarsestLevel - L);
    if (mode === 1) for (let k = 0; k < n2; k++) locals.push(k);
    else if (mode === 2) {
      const bytes = Math.ceil(n2 / 8);
      need(bytes);
      for (let k = 0; k < n2; k++) if ((raw[p + (k >> 3)]! >> (k & 7)) & 1) locals.push(k);
      p += bytes;
    } else if (mode === 3) {
      need(4);
      const m = dv.getUint32(p, true);
      p += 4;
      need(4 * m);
      for (let n = 0; n < m; n++, p += 4) {
        const k = dv.getUint32(p, true);
        if (k >= n2 || (n && k <= locals[locals.length - 1]!)) throw corruptTile(`第 ${L} 级的项号不对`);
        locals.push(k);
      }
    } else if (mode !== 0) throw corruptTile(`第 ${L} 级存法 ${mode}`);
  }
  levelStart[coarsestLevel + 1] = locals.length;
  if (p + 4 * locals.length !== headerLen) throw corruptTile('头长和区段数对不上');
  const count = locals.length, offset = new Uint32Array(count), length = new Uint32Array(count);
  let off = headerLen;
  for (let n = 0; n < count; n++, p += 4) {
    length[n] = dv.getUint32(p, true);
    offset[n] = off;
    off += length[n]!;
  }
  return { ti: dv.getInt32(8, true), tj: dv.getInt32(12, true), coarsestLevel, headerLen, levelStart, local: Uint32Array.from(locals), offset, length };
};

// ---------- 包信息 ----------
// 包.json 只放元数据；粗高度图、能不能细分的位图这类大数组放 粗图.bin.gz（gzip，解开后各数组按 包.json 里的 at = [偏移, 长] 取）。
// 格式 4 以前粗高度图是 包.json 里的 base64（珠峰 DH 的 包.json 16 MB 里占 15.7 MB）。
export const packMapsFileName = '粗图.bin.gz';
export type ByteRange = [number, number];
export type PackageInfo = {
  version: number;
  dimension: string; // 暮色 / 主世界
  origin: [number, number, number]; // [ox, oy, oz]，见文件头
  state: string[]; // 方块状态表，状态[0] = "minecraft:air"
  biome: string[];
  coarsestLevel: number; // 最粗一级（见 块文件）
  tileHeaderMax: number; // 本包最长的块头（字节），浏览器第一次取块头取这么多
  // 粗高度图：格 米一格，覆盖 [x0, x0 + 格·nx) × [y0, y0 + 格·ny)（场景坐标）；按 (y, x) 排，每格是格里最高那块方块的顶（场景 z，含树冠、水面），−32768 = 这一格没有数据。
  // 存在 粗图 的 at 那段：Int16 小端，每行第一格原样、往后每格存和左边一格的差（按 16 位回绕）
  coarseHeight: { cell: number; x0: number; y0: number; nx: number; ny: number; at: ByteRange };
  // 各处最细能到哪一级不一样的包才有（从 DH 的 LOD 库烘的，pipeline/世界/dh/烘焙.ts）：下标 = 级（第 0 项 null），那一级哪些区段能再细分成四块。
  // 不能细分的地方包里没有更细的区段，挑区段时停在这一级。没有这一项 = 各级铺满（从存档烘的包）
  splittable?: (SplittableLevel | null)[];
  // 裁过的包才有（pipeline/世界/裁级/裁剪.ts，docs/世界.md「裁级」）：从哪个完整包版本裁的、留表（留下的区段）的 sha256、裁法。粗图、模型和完整包一样
  trim?: TrimInfo;
};
/** 区段 (i, j)（i0 ≤ i < i0 + ni，j 同）能不能细分：粗图 at 那段是位图，第 (j − j0)·ni + (i − i0) 位，字节里从低位起；范围外的不能 */
export type SplittableLevel = { i0: number; j0: number; ni: number; nj: number; at: ByteRange };
export type TrimInfo = { from: string; keepSha256: string; method: string };
// 一个区段的数据（编码前 / 解码后、换成体素块之前）；解码（engine/voxel/区段解码.ts）出来的四个数组同一块缓冲
export type SectionData = {
  L: number;
  i: number;
  j: number;
  kBottom: number;
  nz: number;
  palette: Uint16Array; // 2P 个：(状态号, 群系号) 交替
  runCounts: Uint16Array; // 区段边² 个
  paletteIndex: Uint16Array;
  runLengths: Uint16Array;
};

// 包里的状态号、群系号 → 体素值、染色（每个包建一次）；table 是方块表，单测传小表
export type PackTable = { value: Uint16Array; 色: (stateIdx: number, biomeIdx: number) => PaletteEntry['c'] };
export const buildPackTables = (info: Pick<PackageInfo, 'state' | 'biome'>, table: BlockTable = defaultBlockTable): PackTable => {
  const { voxelFromState, blockProps, buildTintTable, biomeIndex } = table;
  const voxelByState = Uint16Array.from(info.state, (s) => voxelFromState(s));
  const { t, C: tintRoutes } = buildTintTable();
  const globalBiome = info.biome.map(biomeIndex);
  const { tint: TINT } = blockProps;
  return {
    value: voxelByState,
    色: (stateIdx, biomeIdx) => {
      const tintRoute = TINT[voxelByState[stateIdx]];
      if (!tintRoute || biomeIdx === noBiome) return [255, 255, 255];
      const offset = (globalBiome[biomeIdx] * tintRoutes + tintRoute) * 3;
      return [t[offset], t[offset + 1], t[offset + 2]];
    },
  };
};

// 区段数据 → 体素块（lib/体素/生成.ts 的格式：x、y 两边各带一圈相邻格，原点是下标 (1, 1, 0) 那一格的最小角）
export const sectionToVoxels = (data: SectionData, tables: PackTable): VoxelGrid => {
  const cellM = 2 ** data.L;
  const cols = paddedSectionCols;
  const palette: PaletteEntry[] = [];
  for (let idx = 0; idx < data.palette.length; idx += 2) {
    const st = data.palette[idx];
    palette.push({ v: tables.value[st], c: tables.色(st, data.palette[idx + 1]) });
  }
  const vox = new Uint16Array(cols * cols * data.nz);
  let run = 0;
  for (let column = 0; column < cols * cols; column++) {
    let z = data.nz;
    for (let runEnd = run + data.runCounts[column]; run < runEnd; run++) {
      const paletteIdx = data.paletteIndex[run];
      const z0 = z - data.runLengths[run];
      if (paletteIdx) for (let k = z0; k < z; k++) vox[k * cols * cols + column] = paletteIdx;
      z = z0;
    }
  }
  return { nx: cols, ny: cols, nz: data.nz, cell: cellM, origin: [data.i * sectionCells * cellM, data.j * sectionCells * cellM, data.kBottom * cellM], vox, palette: palette };
};

// ---------- 粗高度图 ----------
// 给 lib/地形跟随.ts（航线下面的地面）和 lib/体素/区段.ts 的 选区段（地物顶）同步查，取包时一次解开
export type CoarseHeightMap = { cell: number; x0: number; y0: number; nx: number; ny: number; height: Int16Array };
/** 能不能细分的位图，解开的（下标 = 级，同 包.json 的 splittable） */
export type SplittableBits = ({ i0: number; j0: number; ni: number; nj: number; bits: Uint8Array } | null)[];
export type PackMaps = { coarse: CoarseHeightMap; splittable?: SplittableBits };

/** 粗图 → 字节（还没 gzip）和 包.json 里对应的两项 */
export const encodePackMaps = (maps: PackMaps): { bytes: Uint8Array; coarseHeight: PackageInfo['coarseHeight']; splittable?: PackageInfo['splittable'] } => {
  const { cell, x0, y0, nx, ny, height } = maps.coarse;
  if (height.length !== nx * ny) throw new Error(`粗高度图 ${nx}×${ny} 格，给了 ${height.length} 个`);
  const levels = maps.splittable ?? [];
  const splitBytes = levels.reduce((n, s) => n + (s ? Math.ceil((s.ni * s.nj) / 8) : 0), 0);
  const bytes = new Uint8Array(2 * nx * ny + splitBytes), dv = new DataView(bytes.buffer);
  for (let row = 0; row < ny; row++)
    for (let col = 0; col < nx; col++) {
      const k = row * nx + col;
      dv.setInt16(2 * k, col ? height[k]! - height[k - 1]! : height[k]!, true); // setInt16 按 16 位截断，差也就回绕了
    }
  let p = 2 * nx * ny;
  const splittable = maps.splittable?.map((s) => {
    if (!s) return null;
    const len = Math.ceil((s.ni * s.nj) / 8);
    if (s.bits.length !== len) throw new Error(`能不能细分的位图 ${s.ni}×${s.nj} 要 ${len} 字节，给了 ${s.bits.length}`);
    bytes.set(s.bits, p);
    const out: SplittableLevel = { i0: s.i0, j0: s.j0, ni: s.ni, nj: s.nj, at: [p, len] };
    p += len;
    return out;
  });
  return { bytes, coarseHeight: { cell, x0, y0, nx, ny, at: [0, 2 * nx * ny] }, ...(splittable ? { splittable } : {}) };
};
/** 粗图（gzip 解开后的字节）→ 粗高度图、能不能细分的位图 */
export const decodePackMaps = (info: Pick<PackageInfo, 'coarseHeight' | 'splittable'>, raw: Uint8Array): PackMaps => {
  const slice = ([off, len]: ByteRange, what: string) => {
    if (off + len > raw.length) throw new Error(`${packMapsFileName} 只有 ${raw.length} 字节，${what}要到 ${off + len}：anim check --deep 核对地形包`);
    return raw.subarray(off, off + len);
  };
  const { cell, x0, y0, nx, ny, at } = info.coarseHeight;
  if (at[1] !== 2 * nx * ny) throw new Error(`包.json 的粗高度图 ${nx}×${ny} 格，at 的长是 ${at[1]}`);
  const src = slice(at, '粗高度图'), dv = new DataView(src.buffer, src.byteOffset, src.byteLength), height = new Int16Array(nx * ny);
  for (let row = 0; row < ny; row++) {
    for (let col = 0; col < nx; col++) {
      const k = row * nx + col;
      height[k] = col ? height[k - 1]! + dv.getInt16(2 * k, true) : dv.getInt16(2 * k, true); // Int16Array 存的时候也按 16 位回绕
    }
  }
  const splittable = info.splittable?.map((s) => (s ? { i0: s.i0, j0: s.j0, ni: s.ni, nj: s.nj, bits: slice(s.at, '能不能细分的位图') } : null));
  return { coarse: { cell, x0, y0, nx, ny, height }, ...(splittable ? { splittable } : {}) };
};
// 场景坐标 (x, y) 那一格里最高那块方块的顶（场景 z）；没有数据是 −Infinity（地形跟随取最高时不算它；选区段 用时 lib/体素/导入地形.ts 换成 0，见那里）
export const coarseHeightAt = (heightMap: CoarseHeightMap, x: number, y: number) => {
  const col = Math.floor((x - heightMap.x0) / heightMap.cell);
  const row = Math.floor((y - heightMap.y0) / heightMap.cell);
  if (col < 0 || row < 0 || col >= heightMap.nx || row >= heightMap.ny) return -Infinity;
  const height = heightMap.height[row * heightMap.nx + col];
  return height === -32768 ? -Infinity : height;
};
// 粗高度图的指纹（FNV-1a，范围和每一格的值）：导入范围变了它就变。交界修正（工具/导入/交界.ts）记下算时的指纹，
// lib/体素/主世界地形.ts 取的时候对不上就提示重跑，免得拿旧范围的修正去修新交界
export const coarseHeightFingerprint = (heightMap: CoarseHeightMap) => {
  let hash = 0x811c9dc5;
  const mix = (value: number) => {
    hash = Math.imul(hash ^ (value & 0xffff), 0x01000193);
  };
  for (const value of [heightMap.cell, heightMap.x0, heightMap.y0, heightMap.nx, heightMap.ny]) mix(value), mix(value >> 16);
  for (let k = 0; k < heightMap.height.length; k++) mix(heightMap.height[k]);
  return (hash >>> 0).toString(16).padStart(8, '0');
};
/** 能不能细分的位图 → 判断函数；包里没有这一项返回 undefined（各级铺满，都能分） */
export const decodeSplittable = (splittable: SplittableBits | undefined): ((level: number, i: number, j: number) => boolean) | undefined => {
  if (!splittable) return undefined;
  return (level, i, j) => {
    const s = splittable[level];
    if (!s) return false;
    const a = i - s.i0, b = j - s.j0;
    if (a < 0 || b < 0 || a >= s.ni || b >= s.nj) return false;
    const n = b * s.ni + a;
    return ((s.bits[n >> 3]! >> (n & 7)) & 1) === 1;
  };
};
// 包里有没有这个区段：核心范围里有一格粗高度有数据就有（烘焙时区段核心有一列数据就写，粗高度格对齐区段边界，两边一致）
export const hasSection = (heightMap: CoarseHeightMap, section: SectionId) => {
  const sizeM = sectionCells * 2 ** section.L;
  const a0 = Math.max(0, (section.i * sizeM - heightMap.x0) / heightMap.cell), a1 = Math.min(heightMap.nx, (section.i * sizeM + sizeM - heightMap.x0) / heightMap.cell);
  const b0 = Math.max(0, (section.j * sizeM - heightMap.y0) / heightMap.cell), b1 = Math.min(heightMap.ny, (section.j * sizeM + sizeM - heightMap.y0) / heightMap.cell);
  for (let row = b0; row < b1; row++) for (let col = a0; col < a1; col++) if (heightMap.height[row * heightMap.nx + col] !== -32768) return true;
  return false;
};
