// 区段包：从存档导入的地形，按 lib/体素/区段.ts 的 (L, i, j) 一块块烘焙好的方块。
// 存档（.mca）→ 列段（工具/导入/列段.ts）→ 区段包（工具/导入/烘焙.ts 写）→ 这里解成 lib/体素/生成.ts 的 体素块，交给网格。
// 这个文件只管格式（纯函数，不碰 node:fs / zlib，浏览器里也能用；gzip 由调用方解：Node 用 `gunzipSync`，浏览器用 `DecompressionStream`）。
//
// ---------- 坐标 ----------
// 场景坐标 Z 朝上、北 = +Y（游戏 −Z）、1 格 = 1 米；游戏坐标 y 朝上、z 朝南。包.json 的 原点 = [ox, oy, oz]：
//   场景 X = 游戏 x − ox，场景 Y = oz − 游戏 z，场景 Z = 游戏 y − oy（连续坐标，和 lib/方块网格.tsx 的 fromGame [x, −z, y] 同一个朝向）；
//   反过来 游戏 x = X + ox，游戏 z = oz − Y，游戏 y = Z + oy。
//   一格方块按最小角记：游戏方块 (x, y, z) 是场景格 (x − ox, oz − 1 − z, y − oy)，场景格 (i, j, k) 是游戏方块 (i + ox, k + oy, oz − 1 − j)。
// ox、oz 取 2048 的整数倍（最粗一级一个区段 2048 米）：每级格子边界都落在游戏坐标 2^L 的整数倍上，和 Voxy 一级级合并的格子对齐，合并时比的位序（游戏坐标 x·4 + y·2 + z，见 lib/体素/生成.ts）才对得上。
// oy：暮色森林 0（twilight_noise_gen.json 的 sea_level 是 0），主世界 64（场景 z = 0 是 y = 64，海平面 y = 63 在 z = −1）。
//
// ---------- 包 ----------
// 一个目录：
//   包.json         包信息（下面的类型）：原点、方块状态表、群系表、粗高度图
//   <ti>.<tj>.块     块文件：2048 米一块（最粗一级的一个区段，烘焙也按这个分块做），块里各级的区段打成一个文件，格式见下面的 块文件
// 区段的核心（32 × 32 列，不算相邻那圈）里一列数据都没有的不存。
//
// 区段（块文件里的一段，gzip 解开后，小端）：
//   偏移 0  "MCQD" 魔数     4  u32 版本 1
//        8  i32 L、i32 i、i32 j
//        20 i32 k底         存的最低一格的格号（第 L 级一格 2^L 米，场景 z = k底·2^L）；再往下当实心（网格那边下面当石头，不画）
//        24 u32 nz          存了几格高；再往上全是空气
//        28 u32 P           色板项数，色板[0] 固定是空气
//        32 u32 R           段总数
//        36 色板 u16[2P]    每项 (状态号, 群系号)，下标进 包.json 的 状态、群系；群系号 65535 = 不染色的方块，不记群系
//        接着 段数 u16[34·34]、号 u16[R]、长 u16[R]
//   34 × 34 列 = 核心 32 × 32 列加四周各一列相邻区段的格（同一级），按 (y, x) 排、x 先变（和 体素块 的 vox 一样）。
//   每列从上往下若干段，每段 号（色板下标）连续 长 格，一列的各段正好盖满 [k底, k底 + nz)；空气也成段，没有数据的列是一整段空气。
//
// 区段里只存地表附近：`kBottom` = ⌊(区段连同相邻那圈里最低的地表 − 4) / 2^L⌋（照 lib/体素/生成.ts 往地面下多留 4 米），地表 = 一列里最高的整格不透明方块的顶；
// 浮空的东西（云岛、空中史莱姆岛）底下的高空当横着连到露天的，地表拉到空当底（见 工具/导入/烘焙.ts 的 `surfaceUnderOverhangs`）。
// 竖井、洞口、湖底这些从上面看得见的低处会把地表拉低，跟着存下来，不会被封死。
//
// 方块状态存字符串（包.json 的 `state` 表），解的时候才用 lib/真实方块表.ts 的 `voxelFromState()` 换成体素值，所以方块表往后加方块、换编号，旧包照样解得对。
// 群系只给染色的方块记（草、树叶、水……），颜色解的时候按群系取固定色、不做混合（用户 10-04 定，和 mcai mesh 导出的网格一致）。
// 第 1 级以上的格子是烘焙时照 Voxy Mipper 合并好的（比不透明度，要查方块表），所以方块表改了不透明度、补了缺的方块，要重新烘焙。
import { voxelFromState, blockProps, buildTintTable, biomeIndex } from './真实方块表.ts';
import { sectionCells, coarsestLevel, type SectionId } from './区段.ts';
import type { VoxelGrid, PaletteEntry } from './生成.ts';

export const paddedSectionCols = sectionCells + 2; // 带相邻那一圈，一边 34 列
const sectionMagic = 0x4451434d; // "MCQD" 按小端读出来的数
const formatVersion = 1;
const headerLen = 36;
export const noBiome = 65535;

// ---------- 块文件 ----------
// 一块一个文件，不一个区段一个：区段有十几万个，Remotion 列 public 目录只列前 1 万个、bundle 要一个个拷。
// 文件（小端）：
//   偏移 0  "MCQK" 魔数   4  u32 版本 1   8  i32 ti、i32 tj（块号：块的场景范围 [ti·2048, ti·2048 + 2048) × [tj·2048, …)）
//        16 索引：L = 0…6 依次，第 L 级 n² 项（n = 64 >> L，块里一边几个区段），按 (sj, si) 排、si 先变，区段 (i, j) = (ti·n + si, tj·n + sj)；
//           每项 u32 偏移、u32 长（字节，偏移从文件开头算），长 0 = 没有这个区段
//        接着各区段的数据（上面的区段格式，各自 gzip），按索引的顺序挨着放
// 浏览器里先按 Range 取文件头（块头长 字节）拿到索引，再按 Range 取要的区段（lib/体素/导入地形.ts；Remotion 渲染和 Studio 的静态服务都支持单段 Range）。
export const tileSizeM = sectionCells * 2 ** coarsestLevel; // 2048 米
const tileMagic = 0x4b51434d; // "MCQK"
const levelIndexStart = [0]; // 第 L 级的索引从第几项起
for (let level = 0; level <= coarsestLevel; level++) levelIndexStart.push(levelIndexStart[level] + (tileSizeM / (sectionCells * 2 ** level)) ** 2);
export const tileEntryCount = levelIndexStart[coarsestLevel + 1];
export const tileHeaderLen = 16 + tileEntryCount * 8;
export const tileFileName = (ti: number, tj: number) => `${ti}.${tj}.块`;
// 区段在哪个块、是索引的第几项
export const sectionInTile = (section: SectionId) => {
  const perEdge = tileSizeM / (sectionCells * 2 ** section.L);
  const ti = Math.floor(section.i / perEdge), tj = Math.floor(section.j / perEdge);
  return { ti, tj, slot: levelIndexStart[section.L] + (section.j - tj * perEdge) * perEdge + (section.i - ti * perEdge) };
};
// 第 项 项是哪一级的哪个区段（核对时遍历块里的区段用）
export const sectionAtIndex = (ti: number, tj: number, index: number): SectionId => {
  let level = 0;
  while (index >= levelIndexStart[level + 1]) level++;
  const perEdge = tileSizeM / (sectionCells * 2 ** level);
  const k = index - levelIndexStart[level];
  return { L: level, i: ti * perEdge + (k % perEdge), j: tj * perEdge + Math.floor(k / perEdge) };
};
// 索引：2·块项数 个 u32，(偏移, 长) 交替
export const encodeTileHeader = (ti: number, tj: number, indexTable: Uint32Array): Uint8Array => {
  const out = new Uint8Array(tileHeaderLen);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, tileMagic, true);
  dv.setUint32(4, formatVersion, true);
  dv.setInt32(8, ti, true);
  dv.setInt32(12, tj, true);
  for (let k = 0; k < 2 * tileEntryCount; k++) dv.setUint32(16 + 4 * k, indexTable[k], true);
  return out;
};
export const decodeTileHeader = (raw: Uint8Array): Uint32Array => {
  const dv = new DataView(raw.buffer, raw.byteOffset, tileHeaderLen);
  if (dv.getUint32(0, true) !== tileMagic || dv.getUint32(4, true) !== formatVersion) throw new Error('不是版本 1 的块文件');
  return Uint32Array.from({ length: 2 * tileEntryCount }, (_, k) => dv.getUint32(16 + 4 * k, true));
};

export type 包信息 = {
  版本: number;
  维度: string; // 暮色 / 主世界
  原点: [number, number, number]; // [ox, oy, oz]，见文件头
  状态: string[]; // 方块状态表，状态[0] = "minecraft:air"
  群系: string[];
  // 粗高度图：格 米一格，覆盖 [x0, x0 + 格·nx) × [y0, y0 + 格·ny)（场景坐标）；高 是 base64 的 Int16（小端，按 (y, x) 排），
  // 每格是格里最高那块方块的顶（场景 z，含树冠、水面），−32768 = 这一格没有数据
  粗高度: { 格: number; x0: number; y0: number; nx: number; ny: number; 高: string };
};

// 一个区段的数据（编码前 / 解码后、换成体素块之前）
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

export const encodeSection = (data: SectionData): Uint8Array => {
  const paletteCount = data.palette.length / 2;
  const runCount = data.paletteIndex.length;
  const out = new Uint8Array(headerLen + (2 * paletteCount + paddedSectionCols * paddedSectionCols + 2 * runCount) * 2);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, sectionMagic, true);
  dv.setUint32(4, formatVersion, true);
  dv.setInt32(8, data.L, true);
  dv.setInt32(12, data.i, true);
  dv.setInt32(16, data.j, true);
  dv.setInt32(20, data.kBottom, true);
  dv.setUint32(24, data.nz, true);
  dv.setUint32(28, paletteCount, true);
  dv.setUint32(32, runCount, true);
  let offset = headerLen;
  for (const array of [data.palette, data.runCounts, data.paletteIndex, data.runLengths]) {
    out.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), offset);
    offset += array.byteLength;
  }
  return out;
};

export const decodeSection = (raw: Uint8Array): SectionData => {
  // 拷进一块新的 ArrayBuffer，偏移从 0 起，u16 数组才对得齐
  const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const dv = new DataView(ab);
  if (dv.getUint32(0, true) !== sectionMagic || dv.getUint32(4, true) !== formatVersion) throw new Error('不是版本 1 的区段文件');
  const paletteCount = dv.getUint32(28, true);
  const runCount = dv.getUint32(32, true);
  let offset = headerLen;
  const readU16s = (count: number) => {
    const array = new Uint16Array(ab, offset, count);
    offset += count * 2;
    return array;
  };
  return {
    L: dv.getInt32(8, true),
    i: dv.getInt32(12, true),
    j: dv.getInt32(16, true),
    kBottom: dv.getInt32(20, true),
    nz: dv.getUint32(24, true),
    palette: readU16s(2 * paletteCount),
    runCounts: readU16s(paddedSectionCols * paddedSectionCols),
    paletteIndex: readU16s(runCount),
    runLengths: readU16s(runCount),
  };
};

// 包里的状态号、群系号 → 体素值、染色（每个包建一次）
export type 包表 = { 值: Uint16Array; 色: (stateIdx: number, biomeIdx: number) => PaletteEntry['c'] };
export const buildPackTables = (info: Pick<包信息, '状态' | '群系'>): 包表 => {
  const voxelByState = Uint16Array.from(info.状态, (s) => voxelFromState(s));
  const { t, C: tintRoutes } = buildTintTable();
  const globalBiome = info.群系.map(biomeIndex);
  const { tint: TINT } = blockProps;
  return {
    值: voxelByState,
    色: (stateIdx, biomeIdx) => {
      const tintRoute = TINT[voxelByState[stateIdx]];
      if (!tintRoute || biomeIdx === noBiome) return [255, 255, 255];
      const offset = (globalBiome[biomeIdx] * tintRoutes + tintRoute) * 3;
      return [t[offset], t[offset + 1], t[offset + 2]];
    },
  };
};

// 区段数据 → 体素块（lib/体素/生成.ts 的格式：x、y 两边各带一圈相邻格，原点是下标 (1, 1, 0) 那一格的最小角）
export const sectionToVoxels = (data: SectionData, tables: 包表): VoxelGrid => {
  const cellM = 2 ** data.L;
  const cols = paddedSectionCols;
  const palette: PaletteEntry[] = [];
  for (let idx = 0; idx < data.palette.length; idx += 2) {
    const st = data.palette[idx];
    palette.push({ v: tables.值[st], c: tables.色(st, data.palette[idx + 1]) });
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
  return { nx: cols, ny: cols, nz: data.nz, 格: cellM, 原点: [data.i * sectionCells * cellM, data.j * sectionCells * cellM, data.kBottom * cellM], vox, 色板: palette };
};

// ---------- 粗高度图 ----------
// 给 lib/地形跟随.ts（航线下面的地面）和 lib/体素/区段.ts 的 选区段（地物顶）同步查，体积小，可以直接打进包里
export type 粗高度图 = { 格: number; x0: number; y0: number; nx: number; ny: number; 高: Int16Array };
export const decodeCoarseHeight = (info: Pick<包信息, '粗高度'>): 粗高度图 => {
  const { 格: cellM, x0, y0, nx, ny, 高: heightsB64 } = info.粗高度;
  const bytes = Uint8Array.from(atob(heightsB64), (ch) => ch.charCodeAt(0));
  return { 格: cellM, x0, y0, nx, ny, 高: new Int16Array(bytes.buffer, 0, nx * ny) };
};
// 场景坐标 (x, y) 那一格里最高那块方块的顶（场景 z）；没有数据是 −Infinity（地形跟随取最高时不算它；选区段 用时 lib/体素/导入地形.ts 换成 0，见那里）
export const coarseHeightAt = (heightMap: 粗高度图, x: number, y: number) => {
  const col = Math.floor((x - heightMap.x0) / heightMap.格);
  const row = Math.floor((y - heightMap.y0) / heightMap.格);
  if (col < 0 || row < 0 || col >= heightMap.nx || row >= heightMap.ny) return -Infinity;
  const height = heightMap.高[row * heightMap.nx + col];
  return height === -32768 ? -Infinity : height;
};
// 粗高度图的指纹（FNV-1a，范围和每一格的值）：导入范围变了它就变。交界修正（工具/导入/交界.ts）记下算时的指纹，
// lib/体素/主世界地形.ts 取的时候对不上就提示重跑，免得拿旧范围的修正去修新交界
export const coarseHeightFingerprint = (heightMap: 粗高度图) => {
  let hash = 0x811c9dc5;
  const mix = (value: number) => {
    hash = Math.imul(hash ^ (value & 0xffff), 0x01000193);
  };
  for (const value of [heightMap.格, heightMap.x0, heightMap.y0, heightMap.nx, heightMap.ny]) mix(value), mix(value >> 16);
  for (let k = 0; k < heightMap.高.length; k++) mix(heightMap.高[k]);
  return (hash >>> 0).toString(16).padStart(8, '0');
};
// 包里有没有这个区段：核心范围里有一格粗高度有数据就有（烘焙时区段核心有一列数据就写，粗高度格对齐区段边界，两边一致）
export const hasSection = (heightMap: 粗高度图, section: SectionId) => {
  const sizeM = sectionCells * 2 ** section.L;
  const a0 = Math.max(0, (section.i * sizeM - heightMap.x0) / heightMap.格), a1 = Math.min(heightMap.nx, (section.i * sizeM + sizeM - heightMap.x0) / heightMap.格);
  const b0 = Math.max(0, (section.j * sizeM - heightMap.y0) / heightMap.格), b1 = Math.min(heightMap.ny, (section.j * sizeM + sizeM - heightMap.y0) / heightMap.格);
  for (let row = b0; row < b1; row++) for (let col = a0; col < a1; col++) if (heightMap.高[row * heightMap.nx + col] !== -32768) return true;
  return false;
};
