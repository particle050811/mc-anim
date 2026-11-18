// 区段包的 包.json、粗图.bin.gz 在 pipeline 里的读写：格式 1～5 都读成同一个样子（PackDoc），写只写现行格式（engine/voxel/区段包.ts 的「包信息」）。
// 格式 4 以前粗高度图、能不能细分的位图是 包.json 里的 base64，最粗级固定 6，没有 coarsestLevel、tileHeaderMax。
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { PackMaps, PackageInfo } from '../../../engine/voxel/区段包.ts';
import type { VoxelLib } from '../体素库.ts';
import { blockFiles } from './读区段.ts';
import { legacyCoarsestLevel } from './旧块头.ts';

export type PackDoc = {
  /** 源 包.json 的 version */
  format: number;
  dimension: string;
  origin: [number, number, number];
  state: string[];
  biome: string[];
  coarsestLevel: number;
  maps: PackMaps;
  /** 别的键（visible、trim），按 包.json 里的先后 */
  extra: Record<string, unknown>;
};
const ownKeys = new Set(['version', 'dimension', 'origin', 'state', 'biome', 'coarsestLevel', 'tileHeaderMax', 'coarseHeight', 'splittable']);
type LegacyInfo = { coarseHeight: { cell: number; x0: number; y0: number; nx: number; ny: number; height: string }; splittable?: ({ i0: number; j0: number; ni: number; nj: number; bits: string } | null)[] };
const b64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));

export const readPackDoc = (voxelLib: VoxelLib, dir: string): PackDoc => {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, '包.json'), 'utf8')) as Record<string, unknown> & PackageInfo;
  const extra = Object.fromEntries(Object.entries(raw).filter(([k]) => !ownKeys.has(k)));
  const head = { format: raw.version, dimension: raw.dimension, origin: raw.origin, state: raw.state, biome: raw.biome };
  if (raw.version >= 5) {
    const P = voxelLib.sectionPack;
    return { ...head, coarsestLevel: raw.coarsestLevel, maps: P.decodePackMaps(raw, new Uint8Array(gunzipSync(fs.readFileSync(path.join(dir, P.packMapsFileName))))), extra };
  }
  const legacy = raw as unknown as LegacyInfo, { cell, x0, y0, nx, ny, height } = legacy.coarseHeight, bytes = b64(height);
  if (bytes.length !== 2 * nx * ny) throw new Error(`${dir}/包.json 的粗高度图 ${nx}×${ny} 格，base64 解出 ${bytes.length} 字节`);
  const coarse = { cell, x0, y0, nx, ny, height: new Int16Array(bytes.buffer, bytes.byteOffset, nx * ny) };
  const splittable = legacy.splittable?.map((s) => (s ? { i0: s.i0, j0: s.j0, ni: s.ni, nj: s.nj, bits: b64(s.bits) } : null));
  return { ...head, coarsestLevel: legacyCoarsestLevel, maps: { coarse, ...(splittable ? { splittable } : {}) }, extra };
};

const sameBytes = (a: ArrayBufferView, b: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength));
/** 两份粗图逐格、逐位一样 */
export const packMapsEqual = (a: PackMaps, b: PackMaps) => {
  const { height: ha, ...ca } = a.coarse, { height: hb, ...cb } = b.coarse;
  if (JSON.stringify(ca) !== JSON.stringify(cb) || !sameBytes(ha, hb)) return false;
  if (!a.splittable !== !b.splittable || (a.splittable?.length ?? 0) !== (b.splittable?.length ?? 0)) return false;
  return (a.splittable ?? []).every((s, L) => {
    const t = b.splittable![L];
    if (!s || !t) return !s && !t;
    return s.i0 === t.i0 && s.j0 === t.j0 && s.ni === t.ni && s.nj === t.nj && sameBytes(s.bits, t.bits);
  });
};

/** 目录里块头最长的那个（字节）：浏览器第一次取块头取这么多 */
export const tileHeaderMaxOf = (voxelLib: VoxelLib, dir: string) => {
  const P = voxelLib.sectionPack, prefix = Buffer.alloc(P.tilePrefixLen);
  let max = P.tilePrefixLen;
  for (const f of blockFiles(dir)) {
    const fd = fs.openSync(path.join(dir, f), 'r');
    try {
      if (fs.readSync(fd, prefix, 0, P.tilePrefixLen, 0) !== P.tilePrefixLen) throw new Error(`${dir}/${f} 不到 ${P.tilePrefixLen} 字节`);
    } finally {
      fs.closeSync(fd);
    }
    max = Math.max(max, P.tileHeaderLength(prefix));
  }
  return max;
};

/** 写现行格式的 包.json、粗图.bin.gz；块文件要先写好（tileHeaderMax 从块头量） */
export const writePackDoc = (voxelLib: VoxelLib, dir: string, doc: Omit<PackDoc, 'format'>) => {
  const P = voxelLib.sectionPack;
  const { bytes, coarseHeight, splittable } = P.encodePackMaps(doc.maps);
  fs.writeFileSync(path.join(dir, P.packMapsFileName), gzipSync(bytes, { level: 9 }));
  const info: PackageInfo = { version: P.formatVersion, dimension: doc.dimension, origin: doc.origin, state: doc.state, biome: doc.biome, coarsestLevel: doc.coarsestLevel, tileHeaderMax: tileHeaderMaxOf(voxelLib, dir), coarseHeight, ...(splittable ? { splittable } : {}) };
  fs.writeFileSync(path.join(dir, '包.json'), JSON.stringify({ ...info, ...doc.extra }));
};
