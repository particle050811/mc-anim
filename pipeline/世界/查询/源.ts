// 查询（block、heightmap、map、slice）读方块的两种来源，接口一样：
//   存档：区域源（默认套编辑层，--原样 不套），整列都有；
//   地形包：烘好的区段包第 0 级（engine/voxel/区段包.ts 的格式），只存了地表附近（k底 以下当实心、没存），看的是渲染实际拿到的方块。
// 坐标一律是游戏坐标（x, y, z），y 朝上、z 朝南。
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { 列号, type 解开的列段 } from '../列段.ts';
import type { 区域源 } from '../区域源.ts';
import type { 体素库 } from '../体素库.ts';
import type { 包信息, SectionData } from '../../../engine/voxel/区段包.ts';

/** 一列从上往下的段，盖满 [y底, y顶]；状态 null = 没数据 */
export type 段 = { 底: number; 顶: number; 状态: string | null; 群系: string | null };
export type 列视图 = { y底: number; y顶: number; 段: 段[] };
export type 范围 = { x1: number; z1: number; x2: number; z2: number };

export interface 方块源 {
  readonly 描述: string;
  /** 一列；整列没数据（区块没生成、包里没有）返回 null */
  列(x: number, z: number): 列视图 | null;
  /** 一列最高的非空气方块 */
  顶(x: number, z: number): { y: number; 状态: string; 群系: string | null } | null;
}

export const 规范范围 = (x1: number, z1: number, x2: number, z2: number): 范围 => ({ x1: Math.min(x1, x2), z1: Math.min(z1, z2), x2: Math.max(x1, x2), z2: Math.max(z1, z2) });

const 空气 = 'minecraft:air';

export class 存档方块源 implements 方块源 {
  readonly 描述: string;
  private 源: 区域源;
  private 区们 = new Map<string, 解开的列段 | null>();

  constructor(源: 区域源, 描述: string) {
    this.源 = 源;
    this.描述 = 描述;
  }

  /** 范围里要从存档解（没有列段缓存）的区域 */
  没缓存的区域(r: 范围): [number, number][] {
    const out: [number, number][] = [];
    for (let rz = r.z1 >> 9; rz <= r.z2 >> 9; rz++) for (let rx = r.x1 >> 9; rx <= r.x2 >> 9; rx++) if (fs.existsSync(this.源.文件(rx, rz)) && !this.源.已缓存(rx, rz)) out.push([rx, rz]);
    return out;
  }

  /** 先把范围里的区域读进来：没缓存、范围又只盖区域里少数区块的，只解那几个区块（不写缓存） */
  载入(r: 范围) {
    for (let rz = r.z1 >> 9; rz <= r.z2 >> 9; rz++)
      for (let rx = r.x1 >> 9; rx <= r.x2 >> 9; rx++) {
        const k = `${rx},${rz}`;
        if (this.区们.has(k)) continue;
        if (this.源.已缓存(rx, rz)) {
          this.区们.set(k, this.源.区域(rx, rz));
          continue;
        }
        const 区块 = new Set<number>();
        for (let cz = Math.max(r.z1, rz * 512) >> 4; cz <= Math.min(r.z2, rz * 512 + 511) >> 4; cz++)
          for (let cx = Math.max(r.x1, rx * 512) >> 4; cx <= Math.min(r.x2, rx * 512 + 511) >> 4; cx++) 区块.add((cz & 31) * 32 + (cx & 31));
        this.区们.set(k, 区块.size <= 64 ? this.源.局部(rx, rz, 区块) : this.源.区域(rx, rz));
      }
  }

  private 区(x: number, z: number) {
    const k = `${x >> 9},${z >> 9}`;
    if (!this.区们.has(k)) this.区们.set(k, this.源.区域(x >> 9, z >> 9));
    return this.区们.get(k)!;
  }

  列(x: number, z: number): 列视图 | null {
    const r = this.区(x, z);
    if (!r) return null;
    const col = 列号(r.rx, r.rz, x, z);
    const s = r.runStarts[col]!, e = r.runStarts[col + 1]!;
    if (s === e) return null;
    const 段们: 段[] = [];
    let 顶 = r.y顶;
    for (let k = s; k < e; k++) {
      段们.push({ 底: r.底[k]!, 顶, 状态: r.状态表[r.状态[k]!]!, 群系: r.群系表[r.群系[k]!]! });
      顶 = r.底[k]! - 1;
    }
    return { y底: r.y底, y顶: r.y顶, 段: 段们 };
  }

  顶(x: number, z: number) {
    const r = this.区(x, z);
    if (!r) return null;
    const col = 列号(r.rx, r.rz, x, z);
    let 顶 = r.y顶;
    for (let k = r.runStarts[col]!, e = r.runStarts[col + 1]!; k < e; k++) {
      const st = r.状态表[r.状态[k]!]!;
      if (st !== 空气) return { y: 顶, 状态: st, 群系: r.群系表[r.群系[k]!]! };
      顶 = r.底[k]! - 1;
    }
    return null;
  }
}

/** 地形包第 0 级：场景格 (i, j, k) = 游戏 (x − ox, oz − 1 − z, y − oy)，一个区段 32 × 32 列（带一圈相邻，34 × 34） */
export class 包方块源 implements 方块源 {
  readonly 描述: string;
  readonly 信息: 包信息;
  private dir: string;
  private 库: 体素库;
  private 头们 = new Map<string, Uint32Array | null>();
  private 区段们 = new Map<string, { d: SectionData; 起: Uint32Array } | null>();

  constructor(dir: string, 库: 体素库, 描述: string) {
    this.dir = dir;
    this.库 = 库;
    this.描述 = 描述;
    this.信息 = JSON.parse(fs.readFileSync(path.join(dir, '包.json'), 'utf8')) as 包信息;
  }

  private 区段(si: number, sj: number) {
    const k = `${si},${sj}`;
    if (this.区段们.has(k)) return this.区段们.get(k)!;
    const P = this.库.区段包;
    const { ti, tj, slot } = P.sectionInTile({ L: 0, i: si, j: sj });
    const f = path.join(this.dir, P.tileFileName(ti, tj));
    let 头 = this.头们.get(`${ti},${tj}`);
    if (头 === undefined) {
      头 = fs.existsSync(f) ? P.decodeTileHeader(new Uint8Array(fs.readFileSync(f).subarray(0, P.tileHeaderLen))) : null;
      this.头们.set(`${ti},${tj}`, 头);
    }
    let v: { d: SectionData; 起: Uint32Array } | null = null;
    const 偏 = 头?.[2 * slot] ?? 0, 长 = 头?.[2 * slot + 1] ?? 0;
    if (长) {
      const fd = fs.openSync(f, 'r');
      const buf = Buffer.alloc(长);
      fs.readSync(fd, buf, 0, 长, 偏);
      fs.closeSync(fd);
      const d = P.decodeSection(gunzipSync(buf));
      const 起 = new Uint32Array(d.runCounts.length + 1);
      for (let c = 0; c < d.runCounts.length; c++) 起[c + 1] = 起[c]! + d.runCounts[c]!;
      v = { d, 起 };
    }
    if (this.区段们.size > 4096) this.区段们.clear();
    this.区段们.set(k, v);
    return v;
  }

  private 段们(x: number, z: number): 列视图 | null {
    const [ox, oy, oz] = this.信息.原点;
    const i = x - ox, j = oz - 1 - z;
    const si = Math.floor(i / 32), sj = Math.floor(j / 32);
    const s = this.区段(si, sj);
    if (!s) return null;
    const { d, 起 } = s;
    const c = (j - sj * 32 + 1) * 34 + (i - si * 32 + 1);
    if (起[c] === 起[c + 1]) return null;
    const out: 段[] = [];
    let 顶 = d.kBottom + d.nz - 1 + oy;
    for (let r = 起[c]!; r < 起[c + 1]!; r++) {
      const p = d.paletteIndex[r]!;
      const st = d.palette[2 * p]!, bi = d.palette[2 * p + 1]!;
      const 底 = 顶 - d.runLengths[r]! + 1;
      out.push({ 底, 顶, 状态: this.信息.状态[st] ?? null, 群系: bi === this.库.区段包.noBiome ? null : (this.信息.群系[bi] ?? null) });
      顶 = 底 - 1;
    }
    return { y底: d.kBottom + oy, y顶: d.kBottom + d.nz - 1 + oy, 段: out };
  }

  列(x: number, z: number) {
    return this.段们(x, z);
  }

  顶(x: number, z: number) {
    const c = this.段们(x, z);
    const s = c?.段.find((x) => x.状态 && x.状态 !== 空气);
    return s ? { y: s.顶, 状态: s.状态!, 群系: s.群系 } : null;
  }
}

/** 列里 y 处的方块；y 出了这一列的范围返回 undefined */
export const 列中 = (c: 列视图, y: number) => c.段.find((s) => s.底 <= y && y <= s.顶);
