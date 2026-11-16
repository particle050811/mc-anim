import { readModel, modelFileName, type SectionModel } from '../../../engine/voxel/区段模型.ts';
// 查询（block、heightmap、map、slice）读方块的两种来源，接口一样：
//   存档：区域源（默认套编辑层，--raw 不套），整列都有；
//   地形包：烘好的区段包第 0 级（engine/voxel/区段包.ts 的格式），只存了地表附近（k底 以下当实心、没存），看的是渲染实际拿到的方块。
// 坐标一律是游戏坐标（x, y, z），y 朝上、z 朝南。
import fs from 'node:fs';
import path from 'node:path';
import { columnIndex, type UnpackedColumnSegmentRegion } from '../列段.ts';
import type { RegionSource } from '../区域源.ts';
import type { VoxelLib } from '../体素库.ts';
import type { PackageInfo, SectionData } from '../../../engine/voxel/区段包.ts';

/** 一列从上往下的段，盖满 [y底, y顶]；状态 null = 没数据 */
export type ColumnSeg = { bottom: number; topY: number; state: string | null; biome: string | null };
export type ColumnView = { yBottom: number; yTop: number; segment: ColumnSeg[] };
export type QueryRect = { x1: number; z1: number; x2: number; z2: number };

export interface BlockSource {
  readonly description: string;
  /** 一列；整列没数据（区块没生成、包里没有）返回 null */
  列(x: number, z: number): ColumnView | null;
  /** 一列最高的非空气方块 */
  topBlockAt(x: number, z: number): { y: number; state: string; biome: string | null } | null;
}

export const normalizeRange = (x1: number, z1: number, x2: number, z2: number): QueryRect => ({ x1: Math.min(x1, x2), z1: Math.min(z1, z2), x2: Math.max(x1, x2), z2: Math.max(z1, z2) });

const airState = 'minecraft:air';

export class SaveBlockSource implements BlockSource {
  readonly description: string;
  private 源: RegionSource;
  private regions = new Map<string, UnpackedColumnSegmentRegion | null>();

  constructor(regionSource: RegionSource, description: string) {
    this.源 = regionSource;
    this.description = description;
  }

  /** 范围里要从存档解（没有列段缓存）的区域 */
  uncachedRegions(r: QueryRect): [number, number][] {
    const out: [number, number][] = [];
    for (let rz = r.z1 >> 9; rz <= r.z2 >> 9; rz++) for (let rx = r.x1 >> 9; rx <= r.x2 >> 9; rx++) if (fs.existsSync(this.源.file(rx, rz)) && !this.源.isCached(rx, rz)) out.push([rx, rz]);
    return out;
  }

  /** 先把范围里的区域读进来：没缓存、范围又只盖区域里少数区块的，只解那几个区块（不写缓存） */
  load(r: QueryRect) {
    for (let rz = r.z1 >> 9; rz <= r.z2 >> 9; rz++)
      for (let rx = r.x1 >> 9; rx <= r.x2 >> 9; rx++) {
        const k = `${rx},${rz}`;
        if (this.regions.has(k)) continue;
        if (this.源.isCached(rx, rz)) {
          this.regions.set(k, this.源.region(rx, rz));
          continue;
        }
        const chunks = new Set<number>();
        for (let cz = Math.max(r.z1, rz * 512) >> 4; cz <= Math.min(r.z2, rz * 512 + 511) >> 4; cz++)
          for (let cx = Math.max(r.x1, rx * 512) >> 4; cx <= Math.min(r.x2, rx * 512 + 511) >> 4; cx++) chunks.add((cz & 31) * 32 + (cx & 31));
        this.regions.set(k, chunks.size <= 64 ? this.源.partialRegion(rx, rz, chunks) : this.源.region(rx, rz));
      }
  }

  private regionAt(x: number, z: number) {
    const k = `${x >> 9},${z >> 9}`;
    if (!this.regions.has(k)) this.regions.set(k, this.源.region(x >> 9, z >> 9));
    return this.regions.get(k)!;
  }

  列(x: number, z: number): ColumnView | null {
    const r = this.regionAt(x, z);
    if (!r) return null;
    const col = columnIndex(r.rx, r.rz, x, z);
    const s = r.runStarts[col]!, e = r.runStarts[col + 1]!;
    if (s === e) return null;
    const segments: ColumnSeg[] = [];
    let topY = r.yTop;
    for (let k = s; k < e; k++) {
      segments.push({ bottom: r.bottom[k]!, topY, state: r.stateTable[r.state[k]!]!, biome: r.biomeTable[r.biome[k]!]! });
      topY = r.bottom[k]! - 1;
    }
    return { yBottom: r.yBottom, yTop: r.yTop, segment: segments };
  }

  topBlockAt(x: number, z: number) {
    const r = this.regionAt(x, z);
    if (!r) return null;
    const col = columnIndex(r.rx, r.rz, x, z);
    let topY = r.yTop;
    for (let k = r.runStarts[col]!, e = r.runStarts[col + 1]!; k < e; k++) {
      const st = r.stateTable[r.state[k]!]!;
      if (st !== airState) return { y: topY, state: st, biome: r.biomeTable[r.biome[k]!]! };
      topY = r.bottom[k]! - 1;
    }
    return null;
  }
}

/** 地形包第 0 级：场景格 (i, j, k) = 游戏 (x − ox, oz − 1 − z, y − oy)，一个区段 sectionCells × sectionCells 列（带一圈相邻，paddedSectionCols 见方） */
export class PackBlockSource implements BlockSource {
  readonly description: string;
  readonly packageInfo: PackageInfo;
  private model: SectionModel;
  private dir: string;
  private lib: VoxelLib;
  private heads = new Map<string, Uint32Array | null>();
  private sections = new Map<string, { d: SectionData; start: Uint32Array } | null>();

  constructor(dir: string, voxelLib: VoxelLib, description: string) {
    this.dir = dir;
    this.lib = voxelLib;
    this.description = description;
    this.packageInfo = JSON.parse(fs.readFileSync(path.join(dir, '包.json'), 'utf8')) as PackageInfo;
    if (this.packageInfo.version !== voxelLib.sectionPack.formatVersion) throw new Error(`地形包是格式 ${this.packageInfo.version}，只读格式 ${voxelLib.sectionPack.formatVersion}：anim assets pull，或 anim world transcode`);
    this.model = readModel(fs.readFileSync(path.join(dir, modelFileName)));
  }

  private 区段(si: number, sj: number) {
    const k = `${si},${sj}`;
    if (this.sections.has(k)) return this.sections.get(k)!;
    const P = this.lib.sectionPack;
    const { ti, tj, slot } = P.sectionInTile({ L: 0, i: si, j: sj });
    const f = path.join(this.dir, P.tileFileName(ti, tj));
    let tileHeader = this.heads.get(`${ti},${tj}`);
    if (tileHeader === undefined) {
      tileHeader = fs.existsSync(f) ? P.decodeTileHeader(new Uint8Array(fs.readFileSync(f).subarray(0, P.tileHeaderLen))) : null;
      this.heads.set(`${ti},${tj}`, tileHeader);
    }
    let v: { d: SectionData; start: Uint32Array } | null = null;
    const byteOffset = tileHeader?.[2 * slot] ?? 0, length = tileHeader?.[2 * slot + 1] ?? 0;
    if (length) {
      const fd = fs.openSync(f, 'r');
      const buf = Buffer.alloc(length);
      fs.readSync(fd, buf, 0, length, byteOffset);
      fs.closeSync(fd);
      const d = this.lib.sectionDecoder.decodeSection(buf, { L: 0, i: si, j: sj }, this.model);
      const runStarts = new Uint32Array(d.runCounts.length + 1);
      for (let c = 0; c < d.runCounts.length; c++) runStarts[c + 1] = runStarts[c]! + d.runCounts[c]!;
      v = { d, start: runStarts };
    }
    if (this.sections.size > 4096) this.sections.clear();
    this.sections.set(k, v);
    return v;
  }

  private segments(x: number, z: number): ColumnView | null {
    const [ox, oy, oz] = this.packageInfo.origin;
    const i = x - ox, j = oz - 1 - z;
    const { sectionCells } = this.lib.sections, { paddedSectionCols } = this.lib.sectionPack;
    const si = Math.floor(i / sectionCells), sj = Math.floor(j / sectionCells);
    const s = this.区段(si, sj);
    if (!s) return null;
    const { d, start: runStarts } = s;
    const c = (j - sj * sectionCells + 1) * paddedSectionCols + (i - si * sectionCells + 1);
    if (runStarts[c] === runStarts[c + 1]) return null;
    const out: ColumnSeg[] = [];
    let topY = d.kBottom + d.nz - 1 + oy;
    for (let r = runStarts[c]!; r < runStarts[c + 1]!; r++) {
      const p = d.paletteIndex[r]!;
      const st = d.palette[2 * p]!, bi = d.palette[2 * p + 1]!;
      const bottom = topY - d.runLengths[r]! + 1;
      out.push({ bottom, topY, state: this.packageInfo.state[st] ?? null, biome: bi === this.lib.sectionPack.noBiome ? null : (this.packageInfo.biome[bi] ?? null) });
      topY = bottom - 1;
    }
    return { yBottom: d.kBottom + oy, yTop: d.kBottom + d.nz - 1 + oy, segment: out };
  }

  列(x: number, z: number) {
    return this.segments(x, z);
  }

  topBlockAt(x: number, z: number) {
    const c = this.segments(x, z);
    const s = c?.segment.find((x) => x.state && x.state !== airState);
    return s ? { y: s.topY, state: s.state!, biome: s.biome } : null;
  }
}

/** 列里 y 处的方块；y 出了这一列的范围返回 undefined */
export const segmentAt = (c: ColumnView, y: number) => c.segment.find((s) => s.bottom <= y && y <= s.topY);
