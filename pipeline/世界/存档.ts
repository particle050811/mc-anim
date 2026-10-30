// 读 Java 版存档（1.18+ 的 .mca，按 1.20.1 核过）：区域文件 → 列段（列段.ts）。解码照旧项目 工具/导入/读存档.ts，列段逐字节和它写的一样。
// 区块按区域文件头的偏移表找，zlib / gzip 解压后是 NBT；每个区段（16 格高）的 block_states 是调色板加紧凑长整数数组
// （每个 long 放 ⌊64/位数⌋ 个、不跨 long、从低位起；方块至少 4 位，群系按调色板大小取位数），biomes 一样，只是 4×4×4 格一个。
// 只收状态是 minecraft:full 的区块：没生成完的区块里地物、树、结构都不全。
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync, inflateSync } from 'node:zlib';
import { 区域列数, type 列段区域 } from './列段.ts';
import { 读NBT, type 复合, type 长数组 } from './nbt.ts';

/** 维度 id → 存档里 region 目录（相对世界目录） */
export const 维度区域目录 = (维度: string) => {
  if (维度 === 'minecraft:overworld') return 'region';
  if (维度 === 'minecraft:the_nether') return path.join('DIM-1', 'region');
  if (维度 === 'minecraft:the_end') return path.join('DIM1', 'region');
  const [ns, name] = 维度.split(':');
  if (!ns || !name) throw new Error(`维度要写成 命名空间:名字，给的是 ${维度}`);
  return path.join('dimensions', ns, name, 'region');
};

/** 世界种子（level.dat 的 WorldGenSettings.seed，十进制） */
export const 世界种子 = (世界目录: string) => {
  const f = path.join(世界目录, 'level.dat');
  if (!fs.existsSync(f)) throw new Error(`${世界目录} 里没有 level.dat`);
  const data = 读NBT(gunzipSync(fs.readFileSync(f))).Data as 复合;
  return String((data.WorldGenSettings as 复合).seed as bigint);
};

export const 区域文件名 = (rx: number, rz: number) => `r.${rx}.${rz}.mca`;
export const 解析区域文件名 = (f: string) => {
  const m = /^r\.(-?\d+)\.(-?\d+)\.mca$/.exec(f);
  return m ? ([Number(m[1]), Number(m[2])] as const) : null;
};

/** 区域文件里的区块：[区域里的 cx、cz（0～31）, 区块 NBT]，只读偏移表里登记了的；只要 给了就只解这几个（下标 cz·32 + cx） */
export function* 区块们(data: Buffer, 文件: string, 只要?: ReadonlySet<number>) {
  if (data.length < 8192) return; // 游戏刚建出来还没写入的空区域文件
  for (let i = 0; i < 1024; i++) {
    if (只要 && !只要.has(i)) continue;
    const loc = data.readUInt32BE(4 * i);
    if (!loc) continue;
    const off = (loc >>> 8) * 4096;
    const len = data.readUInt32BE(off);
    const comp = data[off + 4];
    const body = data.subarray(off + 5, off + 4 + len);
    // 1.20.1 只有 1 gzip、2 zlib、3 不压缩；大于 1 MB 的区块另存 .mcc（comp 带 128），还没遇到过
    const raw = comp === 2 ? inflateSync(body) : comp === 1 ? gunzipSync(body) : comp === 3 ? body : null;
    if (!raw) throw new Error(`${文件} 第 ${i} 个区块压缩方式 ${comp} 不认识${comp !== undefined && comp & 128 ? '（外置 .mcc 区块还没支持）' : ''}`);
    yield [i & 31, i >> 5, 读NBT(raw)] as const;
  }
}

// 紧凑长整数数组解成 n 个数
export const 解紧凑 = (longs: Buffer, bits: number, count: number, out: Uint16Array) => {
  const per = Math.floor(64 / bits);
  const mask = (1 << bits) - 1;
  for (let k = 0, i = 0; i < count; k++) {
    const hi = longs.readUInt32BE(8 * k);
    const lo = longs.readUInt32BE(8 * k + 4);
    for (let j = 0, shift = 0; j < per && i < count; j++, shift += bits, i++)
      out[i] = shift + bits <= 32 ? (lo >>> shift) & mask : shift >= 32 ? (hi >>> (shift - 32)) & mask : ((lo >>> shift) | (hi << (32 - shift))) & mask;
  }
};
const 位数 = (n: number) => Math.ceil(Math.log2(n)); // 调色板 n 项要几位

// ---------- 方块状态的写法 ----------
// 并掉不影响外观、却会把一列切碎的（见 列段.ts 文件头）。编辑层写进世界的状态也走这里，和存档里读出的同一种写法
const 当空气 = new Set(['minecraft:cave_air', 'minecraft:void_air']);
const 丢属性 = (方块: string, k: string) => 方块.endsWith('leaves') && (k === 'distance' || k === 'persistent');
export const 状态串 = (方块: string, 属性?: Record<string, string>) => {
  if (当空气.has(方块)) return 'minecraft:air';
  if (!属性) return 方块;
  const kv = Object.keys(属性)
    .filter((k) => !丢属性(方块, k))
    .sort()
    .map((k) => `${k}=${属性[k]}`);
  return kv.length ? `${方块}[${kv.join(',')}]` : 方块;
};

// ---------- 一个区域 ----------
type 区块段 = { runCounts: Uint16Array; runStarts: Uint32Array; states: Uint16Array; bottoms: Int16Array; biomes: Uint8Array };
export type 读区域结果 = { 区块: (readonly [number, number])[]; 列段: 列段区域 };

/** 读一个区域文件成列段；一个生成完的区块都没有返回 null。只要：只解这些区块（下标 cz·32 + cx，查询小范围用） */
export const 读区域 = (文件: string, rx: number, rz: number, 种子: string, 只要?: ReadonlySet<number>): 读区域结果 | null => {
  const data = fs.readFileSync(文件);
  const stateList = ['minecraft:air'];
  const stateIds = new Map([['minecraft:air', 0]]);
  const biomeList: string[] = [];
  const biomeIds = new Map<string, number>();
  const intern = (list: string[], index: Map<string, number>, key: string) => {
    let id = index.get(key);
    if (id === undefined) {
      id = list.push(key) - 1;
      index.set(key, id);
    }
    return id;
  };
  let yBottom = 0;
  let height = 0;
  let blk = new Uint16Array(0); // 一个区块的方块：下标 (y − y底)·256 + z·16 + x
  let bio = new Uint8Array(0); // 一个区块的群系：下标 ((y − y底) >> 2)·16 + (z >> 2)·4 + (x >> 2)
  const tmp = new Uint16Array(4096);
  let runStates = new Uint16Array(0);
  let runBottoms = new Int16Array(0);
  let runBiomes = new Uint8Array(0);
  const chunks = new Map<number, 区块段>();

  for (const [lcx, lcz, chunk] of 区块们(data, 文件, 只要)) {
    // 1.17 及以前的区块包在 Level 里、方块另一种存法；不认就会全当没生成，悄悄烘出空洞，所以直接报错
    if (chunk.Level !== undefined) throw new Error(`${文件} 区块 ${lcx},${lcz} 是 1.17 及以前的格式（DataVersion ${String(chunk.DataVersion ?? '?')}），只认 1.18+；先用 1.18+ 的游戏把存档整个升级（--forceUpgrade）`);
    if (chunk.Status !== 'minecraft:full') continue;
    const secs = (chunk.sections as 复合[]).filter((s) => s.block_states);
    const lo = (chunk.yPos as number) * 16;
    const hi = Math.max(...secs.map((s) => s.Y as number)) * 16 + 15;
    if (!height) {
      yBottom = lo;
      height = hi - lo + 1;
      blk = new Uint16Array(height * 256);
      bio = new Uint8Array((height >> 2) * 16);
      runStates = new Uint16Array(height * 256);
      runBottoms = new Int16Array(height * 256);
      runBiomes = new Uint8Array(height * 256);
    } else if (lo !== yBottom || hi !== yBottom + height - 1) throw new Error(`${文件} 区块 ${lcx},${lcz} 的高度范围 ${lo}～${hi} 和前面的不一样`);
    blk.fill(0);
    bio.fill(0);
    for (const section of secs) {
      const sy = (section.Y as number) * 16 - yBottom;
      const bs = section.block_states as 复合;
      const ids = (bs.palette as 复合[]).map((p) => intern(stateList, stateIds, 状态串(p.Name as string, p.Properties as Record<string, string> | undefined)));
      if (ids.length === 1) blk.fill(ids[0]!, sy * 256, sy * 256 + 4096);
      else {
        解紧凑((bs.data as 长数组).长, Math.max(4, 位数(ids.length)), 4096, tmp);
        for (let k = 0; k < 4096; k++) blk[sy * 256 + k] = ids[tmp[k]!]!;
      }
      const bm = section.biomes as 复合;
      const bids = (bm.palette as string[]).map((n) => intern(biomeList, biomeIds, n));
      const b0 = (sy >> 2) * 16;
      if (bids.length === 1) bio.fill(bids[0]!, b0, b0 + 64);
      else {
        解紧凑((bm.data as 长数组).长, 位数(bids.length), 64, tmp);
        for (let k = 0; k < 64; k++) bio[b0 + k] = bids[tmp[k]!]!;
      }
    }
    const runCounts = new Uint16Array(256);
    let runTotal = 0;
    for (let z = 0; z < 16; z++)
      for (let x = 0; x < 16; x++) {
        const col = z * 16 + x;
        const bc = (z >> 2) * 4 + (x >> 2);
        let s0 = blk[(height - 1) * 256 + col]!;
        let b0 = bio[((height - 1) >> 2) * 16 + bc]!;
        const m0 = runTotal;
        for (let y = height - 2; y >= 0; y--) {
          const state = blk[y * 256 + col]!;
          const biome = bio[(y >> 2) * 16 + bc]!;
          if (state === s0 && biome === b0) continue;
          runStates[runTotal] = s0;
          runBiomes[runTotal] = b0;
          runBottoms[runTotal++] = yBottom + y + 1;
          s0 = state;
          b0 = biome;
        }
        runStates[runTotal] = s0;
        runBiomes[runTotal] = b0;
        runBottoms[runTotal++] = yBottom;
        runCounts[col] = runTotal - m0;
      }
    const runStarts = new Uint32Array(257);
    for (let k = 0; k < 256; k++) runStarts[k + 1] = runStarts[k]! + runCounts[k]!;
    chunks.set(lcz * 32 + lcx, { runCounts, runStarts, states: runStates.slice(0, runTotal), bottoms: runBottoms.slice(0, runTotal), biomes: runBiomes.slice(0, runTotal) });
  }
  if (!chunks.size) return null;

  let regionRunTotal = 0;
  for (const c of chunks.values()) regionRunTotal += c.states.length;
  const runCounts = new Uint16Array(区域列数);
  const states = new Uint16Array(regionRunTotal);
  const bottoms = new Int16Array(regionRunTotal);
  const biomes = new Uint8Array(regionRunTotal);
  let offset = 0;
  for (let lz = 0; lz < 512; lz++)
    for (let lcx = 0; lcx < 32; lcx++) {
      const c = chunks.get((lz >> 4) * 32 + lcx);
      if (!c) continue;
      const runStart = c.runStarts[(lz & 15) * 16]!;
      const runEnd = c.runStarts[(lz & 15) * 16 + 16]!;
      runCounts.set(c.runCounts.subarray((lz & 15) * 16, (lz & 15) * 16 + 16), lz * 512 + lcx * 16);
      states.set(c.states.subarray(runStart, runEnd), offset);
      bottoms.set(c.bottoms.subarray(runStart, runEnd), offset);
      biomes.set(c.biomes.subarray(runStart, runEnd), offset);
      offset += runEnd - runStart;
    }
  return {
    区块: [...chunks.keys()].map((k) => [rx * 32 + (k & 31), rz * 32 + (k >> 5)] as const),
    列段: { rx, rz, y底: yBottom, y顶: yBottom + height - 1, 状态表: stateList, 群系表: biomeList, 种子, 段数: runCounts, 状态: states, 底: bottoms, 群系: biomes },
  };
};
