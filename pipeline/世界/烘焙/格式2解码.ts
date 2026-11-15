// 只给转码读历史格式 2；冻结的 WASM 和初值不进入画面依赖闭包。
import { wasmBase64 } from './格式2解码器.生成.ts';
import { initialTable } from './格式2模型表.生成.ts';
import type { SectionData } from '../../../engine/voxel/区段包.ts';



const columnCount = 34 * 34;
export const sectionHeaderLength = 6; // u16 nz、i16 kBottom、u16 色板项

// 内存布局（字节）：头 64 KB 留给 WASM 模块；后面是初值表、工作拷贝、色板号的概率，再往后按这个区段的 nz 现排
const tableBase = 1 << 16, workBase = tableBase + 4096, treeBase = workBase + 4096, dynamicBase = treeBase + (2 << 16);

type DecodeFn = (inPtr: number, inLength: number, tablePtr: number, scratch: number, treeOff: number, cm: number, runOffset: number, countsOffset: number, idsOffset: number, runLengthsPtr: number, nz: number, paletteSize: number, L: number) => number;
let instance: { decode: DecodeFn; memory: WebAssembly.Memory } | null = null;

const createInstance = () => {
  const wasmModule = new WebAssembly.Module(Uint8Array.from(atob(wasmBase64), (c) => c.charCodeAt(0)));
  // 格式 2 的 WASM 是冻结的旧字节，导出名是改英文名之前的「解」
  const e = new WebAssembly.Instance(wasmModule).exports as { 解: DecodeFn; memory: WebAssembly.Memory };
  if (e.memory.buffer.byteLength < dynamicBase) e.memory.grow(Math.ceil((dynamicBase - e.memory.buffer.byteLength) / 65536));
  new Uint16Array(e.memory.buffer, tableBase, initialTable.length).set(initialTable);
  return (instance = { decode: e.解, memory: e.memory });
};

/** raw：一个区段的字节（可以是大缓冲里的一段）；L、i、j 由它在块文件索引里的位置定，文件里不存。返回的四个数组同一块缓冲，可以转交 */
export const decodeSectionFormat2 = (raw: Uint8Array, id: { L: number; i: number; j: number }): SectionData => {
  if (raw.length < sectionHeaderLength) throw new Error(`区段 ${id.L}/${id.i}/${id.j} 只有 ${raw.length} 字节，读不出`);
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const nz = dv.getUint16(0, true), kBottom = dv.getInt16(2, true), paletteSize = dv.getUint16(4, true);
  const streamStart = sectionHeaderLength + 4 * paletteSize;
  const streamLength = raw.length - streamStart;
  if (streamLength < 4) throw new Error(`区段 ${id.L}/${id.i}/${id.j} 只有 ${raw.length} 字节，读不出（nz ${nz}、色板 ${paletteSize} 项）`);
  const { decode, memory } = instance ?? createInstance();
  const cellCount = columnCount * nz;
  const inPtr = dynamicBase, cm = (inPtr + streamLength + 16 + 1) & ~1, runOffset = cm + 2 * cellCount, countsOffset = runOffset + 2 * cellCount, idsOffset = countsOffset + 2 * columnCount, runLengthsPtr = idsOffset + 2 * cellCount, endOffset = runLengthsPtr + 2 * cellCount;
  if (memory.buffer.byteLength < endOffset) memory.grow(Math.ceil((endOffset - memory.buffer.byteLength) / 65536));
  const bytes = new Uint8Array(memory.buffer);
  bytes.set(raw.subarray(streamStart), inPtr);
  bytes.fill(0, inPtr + streamLength, inPtr + streamLength + 16); // 坏数据读过头时读到的是确定的 0，解完由读到的位置判错
  const R = decode(inPtr, streamLength, tableBase, workBase, treeBase, cm, runOffset, countsOffset, idsOffset, runLengthsPtr, nz, paletteSize, id.L);
  if (R < 0) throw new Error(`区段 ${id.L}/${id.i}/${id.j} 的编码流坏了（${streamLength} 字节没有正好读完）：文件损坏或格式不对，anim check --深 核对地形包`);
  const ab = new ArrayBuffer((2 * paletteSize + columnCount + 2 * R) * 2);
  const palette = new Uint16Array(ab, 0, 2 * paletteSize);
  const runCounts = new Uint16Array(ab, palette.byteLength, columnCount);
  const paletteIndex = new Uint16Array(ab, palette.byteLength + runCounts.byteLength, R);
  const runLengths = new Uint16Array(ab, palette.byteLength + runCounts.byteLength + paletteIndex.byteLength, R);
  new Uint8Array(ab, 0, 4 * paletteSize).set(raw.subarray(sectionHeaderLength, streamStart));
  const buffer = memory.buffer;
  runCounts.set(new Uint16Array(buffer, countsOffset, columnCount));
  paletteIndex.set(new Uint16Array(buffer, idsOffset, R));
  runLengths.set(new Uint16Array(buffer, runLengthsPtr, R));
  return { L: id.L, i: id.i, j: id.j, kBottom, nz, palette, runCounts, paletteIndex, runLengths };
};
