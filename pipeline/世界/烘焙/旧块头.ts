// 格式 1～4 的块文件头（定长）：只有转码读旧包、测试造旧包用，engine 只读格式 5（engine/voxel/区段包.ts）。
// 偏移 0 "MCQK"  4 u32 版本  8 i32 ti、i32 tj  16 起 L = 0…6 依次，第 L 级 (64 >> L)² 项，每项 u32 偏移、u32 长（偏移从文件开头算），长 0 = 没有这个区段；
// 级内按 (sj, si) 排、si 先变。格式 1～3 一块 2048 米（32 米区段），格式 4 一块 4096 米（64 米区段），每级一边的项数一样，项号 ↔ 区段的算法也一样。
import type { SectionId } from '../../../engine/voxel/区段.ts';

export const legacyCoarsestLevel = 6;
const levelStart = [0];
for (let L = 0; L <= legacyCoarsestLevel; L++) levelStart.push(levelStart[L]! + 4 ** (legacyCoarsestLevel - L));
export const legacyEntryCount = levelStart[legacyCoarsestLevel + 1]!; // 5461
export const legacyHeaderLen = 16 + 8 * legacyEntryCount;

export const legacySlotOf = (section: SectionId) => {
  const perEdge = 2 ** (legacyCoarsestLevel - section.L);
  const ti = Math.floor(section.i / perEdge), tj = Math.floor(section.j / perEdge);
  return { ti, tj, slot: levelStart[section.L]! + (section.j - tj * perEdge) * perEdge + (section.i - ti * perEdge) };
};
export const legacySectionAt = (ti: number, tj: number, slot: number): SectionId => {
  let L = 0;
  while (slot >= levelStart[L + 1]!) L++;
  const perEdge = 2 ** (legacyCoarsestLevel - L), k = slot - levelStart[L]!;
  return { L, i: ti * perEdge + (k % perEdge), j: tj * perEdge + Math.floor(k / perEdge) };
};

/** 文件头（至少 legacyHeaderLen 字节）→ 2·项数 个 u32，(偏移, 长) 交替 */
export const readLegacyIndex = (header: Uint8Array) => {
  if (header.length < legacyHeaderLen) throw new Error(`旧格式块文件头要 ${legacyHeaderLen} 字节，只有 ${header.length}`);
  const dv = new DataView(header.buffer, header.byteOffset, legacyHeaderLen);
  return Uint32Array.from({ length: 2 * legacyEntryCount }, (_, k) => dv.getUint32(16 + 4 * k, true));
};
/** 有的区段，按项号 */
export function* legacyEntries(ti: number, tj: number, index: Uint32Array) {
  for (let slot = 0; slot < legacyEntryCount; slot++) if (index[2 * slot + 1]) yield { slot, id: legacySectionAt(ti, tj, slot), off: index[2 * slot]!, len: index[2 * slot + 1]! };
}

/** 造旧格式的块文件头（只给测试造旧包用） */
export const encodeLegacyTileHeader = (ti: number, tj: number, version: number, index: Uint32Array): Uint8Array => {
  const out = new Uint8Array(legacyHeaderLen), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x4b51434d, true);
  dv.setUint32(4, version, true);
  dv.setInt32(8, ti, true);
  dv.setInt32(12, tj, true);
  for (let k = 0; k < 2 * legacyEntryCount; k++) dv.setUint32(16 + 4 * k, index[k]!, true);
  return out;
};
