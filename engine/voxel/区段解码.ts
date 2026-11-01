// 区段解码：块文件里一段（区段包.ts 的格式 2）→ SectionData。主线程不用它（主线程重换用工人传回来留着的 SectionData），调用方是区段工人和 Node 里的查询、转码、烘焙核对。
// 第一次用时才编译 WASM，每个线程一份实例，解码是同步的、实例内存复用。
import { wasmBase64 } from './区段解码器.生成.ts';
import { 初值表 } from './区段模型表.生成.ts';
import type { SectionData } from './区段包.ts';

export { 初值表 }; // 编码半边（pipeline）经体素库取，同一份表

const 列数 = 34 * 34;
export const 区段头长 = 6; // u16 nz、i16 kBottom、u16 色板项

// 内存布局（字节）：头 64 KB 留给 WASM 模块；后面是初值表、工作拷贝、色板号的概率，再往后按这个区段的 nz 现排
const 表址 = 1 << 16, 工址 = 表址 + 4096, 树址 = 工址 + 4096, 动态址 = 树址 + (2 << 16);

type 解函数 = (入: number, 入长: number, 表: number, 工: number, 树: number, cm: number, 跑: number, 数: number, 号: number, 长: number, nz: number, 色板项: number, L: number) => number;
let 实例: { 解: 解函数; 内存: WebAssembly.Memory } | null = null;

const 起实例 = () => {
  const 模块 = new WebAssembly.Module(Uint8Array.from(atob(wasmBase64), (c) => c.charCodeAt(0)));
  const e = new WebAssembly.Instance(模块).exports as { 解: 解函数; memory: WebAssembly.Memory };
  if (e.memory.buffer.byteLength < 动态址) e.memory.grow(Math.ceil((动态址 - e.memory.buffer.byteLength) / 65536));
  new Uint16Array(e.memory.buffer, 表址, 初值表.length).set(初值表);
  return (实例 = { 解: e.解, 内存: e.memory });
};

/** raw：一个区段的字节（可以是大缓冲里的一段）；L、i、j 由它在块文件索引里的位置定，文件里不存。返回的四个数组同一块缓冲，可以转交 */
export const 解区段 = (raw: Uint8Array, id: { L: number; i: number; j: number }): SectionData => {
  if (raw.length < 区段头长) throw new Error(`区段 ${id.L}/${id.i}/${id.j} 只有 ${raw.length} 字节，读不出`);
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const nz = dv.getUint16(0, true), kBottom = dv.getInt16(2, true), 色板项 = dv.getUint16(4, true);
  const 流起 = 区段头长 + 4 * 色板项;
  const 流长 = raw.length - 流起;
  if (流长 < 4) throw new Error(`区段 ${id.L}/${id.i}/${id.j} 只有 ${raw.length} 字节，读不出（nz ${nz}、色板 ${色板项} 项）`);
  const { 解, 内存 } = 实例 ?? 起实例();
  const 格数 = 列数 * nz;
  const 入 = 动态址, cm = (入 + 流长 + 16 + 1) & ~1, 跑 = cm + 2 * 格数, 数 = 跑 + 2 * 格数, 号 = 数 + 2 * 列数, 长 = 号 + 2 * 格数, 尾 = 长 + 2 * 格数;
  if (内存.buffer.byteLength < 尾) 内存.grow(Math.ceil((尾 - 内存.buffer.byteLength) / 65536));
  const 字节 = new Uint8Array(内存.buffer);
  字节.set(raw.subarray(流起), 入);
  字节.fill(0, 入 + 流长, 入 + 流长 + 16); // 坏数据读过头时读到的是确定的 0，解完由读到的位置判错
  const R = 解(入, 流长, 表址, 工址, 树址, cm, 跑, 数, 号, 长, nz, 色板项, id.L);
  if (R < 0) throw new Error(`区段 ${id.L}/${id.i}/${id.j} 的编码流坏了（${流长} 字节没有正好读完）：文件损坏或格式不对，anim check --深 核对地形包`);
  const ab = new ArrayBuffer((2 * 色板项 + 列数 + 2 * R) * 2);
  const palette = new Uint16Array(ab, 0, 2 * 色板项);
  const runCounts = new Uint16Array(ab, palette.byteLength, 列数);
  const paletteIndex = new Uint16Array(ab, palette.byteLength + runCounts.byteLength, R);
  const runLengths = new Uint16Array(ab, palette.byteLength + runCounts.byteLength + paletteIndex.byteLength, R);
  new Uint8Array(ab, 0, 4 * 色板项).set(raw.subarray(区段头长, 流起));
  const 内 = 内存.buffer;
  runCounts.set(new Uint16Array(内, 数, 列数));
  paletteIndex.set(new Uint16Array(内, 号, R));
  runLengths.set(new Uint16Array(内, 长, R));
  return { L: id.L, i: id.i, j: id.j, kBottom, nz, palette, runCounts, paletteIndex, runLengths };
};
