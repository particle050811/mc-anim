// 列段：存档（.mca）和区段包之间的中间格式，一个区域文件 r.<rx>.<rz>.mca（512 × 512 列）对应一份。照搬旧项目 工具/导入/列段.ts（格式版本 2），
// 字节不变：旧缓存、旧工具读得了新写的，反之亦然（所以表 JSON 的键照旧是中文，盘键迁移不动它）。坐标全是游戏坐标（y 朝上、z 朝南），换成场景坐标是烘焙的事。
// 按列存：每列从最高一格（y顶）往下到最低一格（y底），相邻两格方块状态和群系都一样就并成一段；空气也成段（只存实心的话分不清洞口和地底），
// 所以一列的各段首尾相接正好盖满 [y底, y顶]，每段只记底。
//
// 文件：整个文件 gzip（level 6），解开后小端：
//   0 "MCLD"  4 u32 版本 2  8 i32 rx、rz  16 i32 y底、y顶  24 u32 N 段总数  28 u32 J 表字节数（补到 4 的倍数）
//   32 表：J 字节 UTF-8 JSON {"状态": [...], "群系": [...], "种子": "世界种子"}，末尾补空格
//   接着：段数 u16[262144]（列号 = (z − 512·rz)·512 + (x − 512·rx)，0 = 区块不存在或没生成完）、状态 u16[N]、底 i16[N]、群系 u8[N]
// 状态写成「命名空间:名字[属性=值,…]」，属性按名字排序；cave_air、void_air 记成 air，树叶去掉 distance、persistent（同一团树叶每格都不一样，会把列切碎）。
// 群系摊到每一格（游戏里 4×4×4 共用一个），群系变了也切段；方块实际取哪个群系格要按种子抖动，是烘焙的事。
import { gunzipSync, gzipSync } from 'node:zlib';

export const REGION_COLUMN_COUNT = 512 * 512;
const magic = 0x444c434d; // "MCLD" 按小端读出来的数
const FORMAT_VERSION = 2;
const HEADER_LENGTH = 32;

export type ColumnSegmentRegion = {
  rx: number;
  rz: number;
  yBottom: number;
  yTop: number;
  stateTable: string[];
  biomeTable: string[];
  /** 世界种子，十进制 */
  seed: string;
  段数: Uint16Array;
  state: Uint16Array;
  bottom: Int16Array;
  biome: Uint8Array;
};
/** 解码出来的多一张 runStarts：第 k 列第一段在段数组里的下标（区域列数 + 1 个） */
export type UnpackedColumnSegmentRegion = ColumnSegmentRegion & { runStarts: Uint32Array };

export const encodeColumnSegments = (region: ColumnSegmentRegion): Buffer => {
  if (region.biomeTable.length > 256) throw new Error(`r.${region.rx}.${region.rz} 群系超过 256 种，群系号放不进 u8`);
  if (region.stateTable.length > 65536) throw new Error(`r.${region.rx}.${region.rz} 方块状态超过 65536 种，放不进 u16`);
  const runCount = region.state.length;
  const tableJson = Buffer.from(JSON.stringify({ 状态: region.stateTable, 群系: region.biomeTable, 种子: region.seed }), 'utf8');
  const tableBytes = (tableJson.length + 3) & ~3;
  const buf = Buffer.alloc(HEADER_LENGTH + tableBytes + REGION_COLUMN_COUNT * 2 + runCount * 5, 0x20);
  buf.writeUInt32LE(magic, 0);
  buf.writeUInt32LE(FORMAT_VERSION, 4);
  buf.writeInt32LE(region.rx, 8);
  buf.writeInt32LE(region.rz, 12);
  buf.writeInt32LE(region.yBottom, 16);
  buf.writeInt32LE(region.yTop, 20);
  buf.writeUInt32LE(runCount, 24);
  buf.writeUInt32LE(tableBytes, 28);
  tableJson.copy(buf, HEADER_LENGTH);
  let offset = HEADER_LENGTH + tableBytes;
  for (const array of [region.段数, region.state, region.bottom, region.biome]) {
    const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    bytes.copy(buf, offset);
    offset += bytes.length;
  }
  return gzipSync(buf, { level: 6 });
};

export const startTable = (segRunCounts: Uint16Array) => {
  const runStarts = new Uint32Array(REGION_COLUMN_COUNT + 1);
  for (let k = 0; k < REGION_COLUMN_COUNT; k++) runStarts[k + 1] = runStarts[k]! + segRunCounts[k]!;
  return runStarts;
};

export const decodeColumnSegments = (gz: Uint8Array): UnpackedColumnSegmentRegion => {
  const raw = gunzipSync(gz);
  // 拷进一块新的 ArrayBuffer，偏移从 0 起，u16 / i16 数组才对得齐
  const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const dv = new DataView(ab);
  if (dv.getUint32(0, true) !== magic || dv.getUint32(4, true) !== FORMAT_VERSION) throw new Error('不是版本 2 的列段文件');
  const runCount = dv.getUint32(24, true);
  const tableBytes = dv.getUint32(28, true);
  const table = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, HEADER_LENGTH, tableBytes))) as { 状态: string[]; 群系: string[]; 种子: string };
  let offset = HEADER_LENGTH + tableBytes;
  const segRunCounts = new Uint16Array(ab, offset, REGION_COLUMN_COUNT);
  offset += REGION_COLUMN_COUNT * 2;
  const stateIds = new Uint16Array(ab, offset, runCount);
  offset += runCount * 2;
  const bottom = new Int16Array(ab, offset, runCount);
  offset += runCount * 2;
  const biomeIds = new Uint8Array(ab, offset, runCount);
  return { rx: dv.getInt32(8, true), rz: dv.getInt32(12, true), yBottom: dv.getInt32(16, true), yTop: dv.getInt32(20, true), stateTable: table.状态, biomeTable: table.群系, seed: table.种子, 段数: segRunCounts, state: stateIds, bottom, biome: biomeIds, runStarts: startTable(segRunCounts) };
};

/** 游戏坐标 (x, z) 在区域里的列号 */
export const columnIndex = (rx: number, rz: number, x: number, z: number) => (z - 512 * rz) * 512 + (x - 512 * rx);

/** 一列里 y 处的段下标；列没有数据或 y 出界返回 −1 */
export const segAt = (r: UnpackedColumnSegmentRegion, col: number, y: number) => {
  const s = r.runStarts[col]!, e = r.runStarts[col + 1]!;
  if (s === e || y < r.yBottom || y > r.yTop) return -1;
  for (let k = s; k < e; k++) if (r.bottom[k]! <= y) return k;
  return -1;
};

/** 游戏方块 (x, y, z) 的状态和群系；不在这个区域、没数据返回 null */
export const blockAt = (r: UnpackedColumnSegmentRegion, x: number, y: number, z: number): { state: string; biome: string } | null => {
  if (x >> 9 !== r.rx || z >> 9 !== r.rz) return null;
  const k = segAt(r, columnIndex(r.rx, r.rz, x, z), y);
  return k < 0 ? null : { state: r.stateTable[r.state[k]!]!, biome: r.biomeTable[r.biome[k]!]! };
};

/** 一列摊开成逐格（下标 y − y底），状态、群系是区域表的下标；没数据返回 null */
export const spreadColumn = (r: UnpackedColumnSegmentRegion, col: number): { state: Uint16Array; biome: Uint8Array } | null => {
  const s = r.runStarts[col]!, e = r.runStarts[col + 1]!;
  if (s === e) return null;
  const height = r.yTop - r.yBottom + 1;
  const stateIds = new Uint16Array(height);
  const biomeIds = new Uint8Array(height);
  let top = r.yTop;
  for (let k = s; k < e; k++) {
    const b = r.bottom[k]!;
    stateIds.fill(r.state[k]!, b - r.yBottom, top - r.yBottom + 1);
    biomeIds.fill(r.biome[k]!, b - r.yBottom, top - r.yBottom + 1);
    top = b - 1;
  }
  return { state: stateIds, biome: biomeIds };
};
