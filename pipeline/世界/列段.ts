// 列段：存档（.mca）和区段包之间的中间格式，一个区域文件 r.<rx>.<rz>.mca（512 × 512 列）对应一份。照搬旧项目 工具/导入/列段.ts（格式版本 2），
// 字节不变：旧缓存、旧工具读得了新写的，反之亦然。坐标全是游戏坐标（y 朝上、z 朝南），换成场景坐标是烘焙的事。
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

export const 区域列数 = 512 * 512;
const 魔数 = 0x444c434d; // "MCLD" 按小端读出来的数
const 格式版本 = 2;
const 头长 = 32;

export type 列段区域 = {
  rx: number;
  rz: number;
  y底: number;
  y顶: number;
  状态表: string[];
  群系表: string[];
  /** 世界种子，十进制 */
  种子: string;
  段数: Uint16Array;
  状态: Uint16Array;
  底: Int16Array;
  群系: Uint8Array;
};
/** 解码出来的多一张 runStarts：第 k 列第一段在段数组里的下标（区域列数 + 1 个） */
export type 解开的列段 = 列段区域 & { runStarts: Uint32Array };

export const 编码列段 = (region: 列段区域): Buffer => {
  if (region.群系表.length > 256) throw new Error(`r.${region.rx}.${region.rz} 群系超过 256 种，群系号放不进 u8`);
  if (region.状态表.length > 65536) throw new Error(`r.${region.rx}.${region.rz} 方块状态超过 65536 种，放不进 u16`);
  const runCount = region.状态.length;
  const tableJson = Buffer.from(JSON.stringify({ 状态: region.状态表, 群系: region.群系表, 种子: region.种子 }), 'utf8');
  const tableBytes = (tableJson.length + 3) & ~3;
  const buf = Buffer.alloc(头长 + tableBytes + 区域列数 * 2 + runCount * 5, 0x20);
  buf.writeUInt32LE(魔数, 0);
  buf.writeUInt32LE(格式版本, 4);
  buf.writeInt32LE(region.rx, 8);
  buf.writeInt32LE(region.rz, 12);
  buf.writeInt32LE(region.y底, 16);
  buf.writeInt32LE(region.y顶, 20);
  buf.writeUInt32LE(runCount, 24);
  buf.writeUInt32LE(tableBytes, 28);
  tableJson.copy(buf, 头长);
  let offset = 头长 + tableBytes;
  for (const array of [region.段数, region.状态, region.底, region.群系]) {
    const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    bytes.copy(buf, offset);
    offset += bytes.length;
  }
  return gzipSync(buf, { level: 6 });
};

export const 起点表 = (段数: Uint16Array) => {
  const runStarts = new Uint32Array(区域列数 + 1);
  for (let k = 0; k < 区域列数; k++) runStarts[k + 1] = runStarts[k]! + 段数[k]!;
  return runStarts;
};

export const 解码列段 = (gz: Uint8Array): 解开的列段 => {
  const raw = gunzipSync(gz);
  // 拷进一块新的 ArrayBuffer，偏移从 0 起，u16 / i16 数组才对得齐
  const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const dv = new DataView(ab);
  if (dv.getUint32(0, true) !== 魔数 || dv.getUint32(4, true) !== 格式版本) throw new Error('不是版本 2 的列段文件');
  const runCount = dv.getUint32(24, true);
  const tableBytes = dv.getUint32(28, true);
  const table = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 头长, tableBytes))) as { 状态: string[]; 群系: string[]; 种子: string };
  let offset = 头长 + tableBytes;
  const 段数 = new Uint16Array(ab, offset, 区域列数);
  offset += 区域列数 * 2;
  const 状态 = new Uint16Array(ab, offset, runCount);
  offset += runCount * 2;
  const 底 = new Int16Array(ab, offset, runCount);
  offset += runCount * 2;
  const 群系 = new Uint8Array(ab, offset, runCount);
  return { rx: dv.getInt32(8, true), rz: dv.getInt32(12, true), y底: dv.getInt32(16, true), y顶: dv.getInt32(20, true), 状态表: table.状态, 群系表: table.群系, 种子: table.种子, 段数, 状态, 底, 群系, runStarts: 起点表(段数) };
};

/** 游戏坐标 (x, z) 在区域里的列号 */
export const 列号 = (rx: number, rz: number, x: number, z: number) => (z - 512 * rz) * 512 + (x - 512 * rx);

/** 一列里 y 处的段下标；列没有数据或 y 出界返回 −1 */
export const 段于 = (r: 解开的列段, col: number, y: number) => {
  const s = r.runStarts[col]!, e = r.runStarts[col + 1]!;
  if (s === e || y < r.y底 || y > r.y顶) return -1;
  for (let k = s; k < e; k++) if (r.底[k]! <= y) return k;
  return -1;
};

/** 游戏方块 (x, y, z) 的状态和群系；不在这个区域、没数据返回 null */
export const 方块于 = (r: 解开的列段, x: number, y: number, z: number): { 状态: string; 群系: string } | null => {
  if (x >> 9 !== r.rx || z >> 9 !== r.rz) return null;
  const k = 段于(r, 列号(r.rx, r.rz, x, z), y);
  return k < 0 ? null : { 状态: r.状态表[r.状态[k]!]!, 群系: r.群系表[r.群系[k]!]! };
};

/** 一列摊开成逐格（下标 y − y底），状态、群系是区域表的下标；没数据返回 null */
export const 摊开列 = (r: 解开的列段, col: number): { 状态: Uint16Array; 群系: Uint8Array } | null => {
  const s = r.runStarts[col]!, e = r.runStarts[col + 1]!;
  if (s === e) return null;
  const 高 = r.y顶 - r.y底 + 1;
  const 状态 = new Uint16Array(高);
  const 群系 = new Uint8Array(高);
  let top = r.y顶;
  for (let k = s; k < e; k++) {
    const b = r.底[k]!;
    状态.fill(r.状态[k]!, b - r.y底, top - r.y底 + 1);
    群系.fill(r.群系[k]!, b - r.y底, top - r.y底 + 1);
    top = b - 1;
  }
  return { 状态, 群系 };
};
