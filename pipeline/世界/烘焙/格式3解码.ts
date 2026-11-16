// 只给转码读历史格式 3（32×32 区段，每边 34 列）；冻结的 WASM 不进画面依赖闭包。内存排法照格式 4 以前的 engine/voxel/区段解码.ts。
import { wasmBase64 } from './格式3解码器.生成.ts';
import type { SectionModel } from '../../../engine/voxel/区段模型.ts';
import type { SectionData } from '../../../engine/voxel/区段包.ts';

const columnCount = 34 * 34;
type DecodeFn = (inPtr: number, inLength: number, tablePtr: number, workPtr: number, treeOff: number, cm: number, runOffset: number, countsOffset: number, idsOffset: number, runLengthsPtr: number, nz: number, paletteSize: number, L: number, pal: number, map: number, weights: number, scratch: number, classes: number, stride: number) => number;
type SectionDecoder = (raw: Uint8Array, id: { L: number; i: number; j: number }) => SectionData;
let wasmModule: WebAssembly.Module | undefined;
const decoderCache = new WeakMap<SectionModel, SectionDecoder>();

const createDecoder = (m: SectionModel): SectionDecoder => {
  wasmModule ??= new WebAssembly.Module(Uint8Array.from(atob(wasmBase64), (c) => c.charCodeAt(0)));
  const { decodeSection: decode, memory } = new WebAssembly.Instance(wasmModule).exports as { decodeSection: DecodeFn; memory: WebAssembly.Memory };
  const align = (x: number) => (x + 7) & ~7;
  const T = 65536, W = align(T + m.init.byteLength), M = align(W + m.init.byteLength), F = align(M + 65536), D = align(F + m.weights.byteLength);
  const grow = (end: number) => { if (memory.buffer.byteLength < end) memory.grow(Math.ceil((end - memory.buffer.byteLength) / 65536)); };
  grow(D);
  new Uint16Array(memory.buffer, T, m.init.length).set(m.init);
  new Uint8Array(memory.buffer, M, 65536).set(m.map);
  new Uint16Array(memory.buffer, F, m.weights.length).set(m.weights);
  return (raw, id) => {
    const unreadableError = () => new Error(`格式 3 区段 ${id.L}/${id.i}/${id.j} 只有 ${raw.length} 字节，读不出`);
    if (raw.length < 6) throw unreadableError();
    const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength), nz = dv.getUint16(0, true), kBottom = dv.getInt16(2, true), P = dv.getUint16(4, true);
    const h = 6 + P * 4, len = raw.length - h;
    if (!P || len < 4) throw unreadableError();
    const n = 1 << Math.max(1, Math.ceil(Math.log2(P))), tree = D, scratch = tree + m.classes * n * 2;
    const input = align(scratch + 8 * n + P), cm = align(input + raw.length + 16), runs = cm + 2 * nz * columnCount, counts = runs + 2 * nz * columnCount, values = counts + 2 * columnCount, lengths = values + 2 * nz * columnCount;
    grow(lengths + 2 * nz * columnCount);
    const mem = new Uint8Array(memory.buffer);
    mem.set(raw, input);
    mem.fill(0, input + raw.length, input + raw.length + 16);
    const R = decode(input + h, len, T, W, tree, cm, runs, counts, values, lengths, nz, P, id.L, input + 6, M, F, scratch, m.classes, m.stride);
    if (R < 0) throw new Error(`格式 3 区段 ${id.L}/${id.i}/${id.j} 的编码流坏了（${len} 字节没有正好读完）`);
    const ab = new ArrayBuffer((2 * P + columnCount + 2 * R) * 2), palette = new Uint16Array(ab, 0, 2 * P), runCounts = new Uint16Array(ab, 4 * P, columnCount), paletteIndex = new Uint16Array(ab, 4 * P + 2 * columnCount, R), runLengths = new Uint16Array(ab, 4 * P + 2 * columnCount + 2 * R, R);
    new Uint8Array(ab, 0, 4 * P).set(raw.subarray(6, h));
    runCounts.set(new Uint16Array(memory.buffer, counts, columnCount));
    paletteIndex.set(new Uint16Array(memory.buffer, values, R));
    runLengths.set(new Uint16Array(memory.buffer, lengths, R));
    return { ...id, kBottom, nz, palette, runCounts, paletteIndex, runLengths };
  };
};

/** 解一个格式 3 区段（34×34 列）；模型来自那个旧包的 模型.bin */
export const decodeSectionFormat3 = (raw: Uint8Array, id: { L: number; i: number; j: number }, sectionModel: SectionModel): SectionData => {
  let decoder = decoderCache.get(sectionModel);
  if (!decoder) { decoder = createDecoder(sectionModel); decoderCache.set(sectionModel, decoder); }
  return decoder(raw, id);
};
