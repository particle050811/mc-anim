// 转码、核对、训练读取格式 1、2、3；旧格式解码仅留在 pipeline，不进任何段的依赖闭包。
import fs from 'node:fs';
import { 解区段 as 解格式2区段 } from './格式2解码.ts';
import { 读模型, 模型文件名, type 区段模型 } from '../../../engine/voxel/区段模型.ts';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { SectionData } from '../../../engine/voxel/区段包.ts';
import type { 体素库 } from '../体素库.ts';

const 列数 = 34 * 34;
const 区段魔数 = 0x4451434d; // "MCQD"
const 块魔数 = 0x4b51434d; // "MCQK"

/** 格式 1 的区段（gzip 解开后）：见 git 历史里 engine/voxel/区段包.ts 的文件头；L、i、j 在区段头里 */
export const 解格式1区段 = (gz: Uint8Array): SectionData => {
  const raw = gunzipSync(gz);
  const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  const dv = new DataView(ab);
  if (dv.getUint32(0, true) !== 区段魔数 || dv.getUint32(4, true) !== 1) throw new Error('不是格式 1 的区段');
  const 色板项 = dv.getUint32(28, true), R = dv.getUint32(32, true);
  let offset = 36;
  const u16 = (n: number) => {
    const a = new Uint16Array(ab, offset, n);
    offset += n * 2;
    return a;
  };
  return { L: dv.getInt32(8, true), i: dv.getInt32(12, true), j: dv.getInt32(16, true), kBottom: dv.getInt32(20, true), nz: dv.getUint32(24, true), palette: u16(2 * 色板项), runCounts: u16(列数), paletteIndex: u16(R), runLengths: u16(R) };
};

/** 造格式 1 的区段（只给测试造旧包用） */
export const 编格式1区段 = (d: SectionData): Uint8Array => {
  const 色板项 = d.palette.length / 2, R = d.paletteIndex.length;
  const out = new Uint8Array(36 + (2 * 色板项 + 列数 + 2 * R) * 2);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 区段魔数, true);
  dv.setUint32(4, 1, true);
  dv.setInt32(8, d.L, true);
  dv.setInt32(12, d.i, true);
  dv.setInt32(16, d.j, true);
  dv.setInt32(20, d.kBottom, true);
  dv.setUint32(24, d.nz, true);
  dv.setUint32(28, 色板项, true);
  dv.setUint32(32, R, true);
  let o = 36;
  for (const a of [d.palette, d.runCounts, d.paletteIndex, d.runLengths]) {
    out.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), o);
    o += a.byteLength;
  }
  return gzipSync(out, { level: 6 });
};

/** 块文件头的格式版本 */
export const 块格式 = (头: Uint8Array) => {
  const dv = new DataView(头.buffer, 头.byteOffset, 8);
  if (dv.getUint32(0, true) !== 块魔数) throw new Error('不是块文件');
  return dv.getUint32(4, true);
};

/** 块文件头的索引，不管格式几（各版索引布局一样） */
export const 读块索引 = (库: 体素库, 头: Uint8Array) => {
  const dv = new DataView(头.buffer, 头.byteOffset, 库.区段包.tileHeaderLen);
  return Uint32Array.from({ length: 2 * 库.区段包.tileEntryCount }, (_, k) => dv.getUint32(16 + 4 * k, true));
};

export const 块文件们 = (dir: string) =>
  fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.块'))
    .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
export const 块号 = (文件名: string) => 文件名.split('.').slice(0, 2).map(Number) as [number, number];

const 模型缓存 = new Map<string, 区段模型>();
export const 读包模型 = (dir: string) => {
  let m = 模型缓存.get(dir);
  if (!m) { m = 读模型(fs.readFileSync(path.join(dir, 模型文件名))); 模型缓存.set(dir, m); }
  return m;
};

/** 一个块文件的区段，按文件里的先后；取 才解 */
export function* 块里的区段(库: 体素库, 文件: string) {
  const buf = fs.readFileSync(文件);
  const 头 = new Uint8Array(buf.buffer, buf.byteOffset, 库.区段包.tileHeaderLen);
  const 格式 = 块格式(头);
  if (格式 !== 1 && 格式 !== 2 && 格式 !== 库.区段包.formatVersion) throw new Error(`${文件} 是格式 ${格式}，不认`);
  const 模型 = 格式 === 3 ? 读包模型(path.dirname(文件)) : null;
  const 索引 = 读块索引(库, 头);
  const [ti, tj] = 块号(path.basename(文件));
  const 项: { slot: number; off: number; len: number }[] = [];
  for (let slot = 0; slot < 库.区段包.tileEntryCount; slot++) if (索引[2 * slot + 1]) 项.push({ slot, off: 索引[2 * slot]!, len: 索引[2 * slot + 1]! });
  项.sort((a, b) => a.off - b.off);
  for (const { slot, off, len } of 项) {
    const raw = new Uint8Array(buf.buffer, buf.byteOffset + off, len);
    const id = 库.区段包.sectionAtIndex(ti, tj, slot);
    yield { slot, id, 字节: raw, 取: (): SectionData => (格式 === 1 ? 解格式1区段(raw) : 格式 === 2 ? 解格式2区段(raw, id) : 库.区段解码.解区段(raw, id, 模型!)) };
  }
}

/** 整个包的区段，按块文件名、文件里的先后 */
export function* 遍历区段(库: 体素库, dir: string) {
  for (const f of 块文件们(dir)) yield* 块里的区段(库, path.join(dir, f));
}
