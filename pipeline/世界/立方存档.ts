// 读 Better Cubic Chunks（1.21.1 的立方区块模组，世界没有固定高度）的存档：cubes/r.<X>.<Y>.<Z>.mcr3d → 列段（列段.ts）。
// 模组没公开源码，格式是照存档逆向的，怎么核的见 docs/世界.md「立方区块存档」：
// - 一个文件 = 16×16×16 个 cube（每边 256 格），cube 是 16³ 格。头 8 个扇区（一扇区 4096 字节）：4096 项 u32 大端「(扇区号 << 8) | 扇区数」，再 4096 项时间戳；
//   项号 = (y << 8) | (z << 4) | x，都是 cube 在文件里的 0～15。
// - cube：u32 大端长度、u8 压缩方式（见到的都是 3 = u32 大端解压后长度 + LZ4 原始块，不是 LZ4 帧）。解开是 NBT：
//   block_states { palette, data }（整个 cube 是空气就没有；色板只有一项没有 data）、biomes { palette, data }，紧凑数组和格的先后同原版区段；status 5 = 生成完，别的不收。
// 立方存档只存玩家到过的 cube，一列从上到下不一定都在。一个列段区域（512 × 512 列）= 2 × 2 个文件列的全部 Y，规则：
// - 高度范围由世界声明给（yRange），所有区域一样（烘焙按一个范围算）。
// - 从上往下，没存的 cube 在这一列碰到第一格非空气之前当空气，之后当石头（地下没存到的部分）。
// - 第一格非空气的正上方得是存着的格，才知道它是地表；不是的列（只飞过高空、只存了地下一截）记成没数据，不然高空的飞行轨迹会烘成实心柱。
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync, inflateSync } from 'node:zlib';
import { assembleColumnSegments, stateString, unpackCompact, type ChunkSegment, type ReadRegionResult } from './存档.ts';
import { readNbt, type Compound, type LongArray } from './nbt.ts';

const SECTOR_BYTES = 4096;
const CUBES_PER_FILE = 4096;
const FULL_STATUS = 5;
/** 地表以下没存的 cube 填什么 */
const UNDERGROUND_FILL = 'minecraft:stone';

export const cubicRegionFileName = (X: number, Y: number, Z: number) => `r.${X}.${Y}.${Z}.mcr3d`;
export const parseCubicRegionFileName = (f: string) => {
  const m = /^r\.(-?\d+)\.(-?\d+)\.(-?\d+)\.mcr3d$/.exec(f);
  return m ? ([Number(m[1]), Number(m[2]), Number(m[3])] as const) : null;
};
/** cube 在文件偏移表里的项号；lx、ly、lz 是 cube 在文件里的 0～15 */
export const cubeIndex = (lx: number, ly: number, lz: number) => (ly << 8) | (lz << 4) | lx;

/** LZ4 原始块（没有帧头）解压；outLen 是解压后的长度 */
export const lz4Block = (src: Uint8Array, outLen: number): Buffer => {
  const out = Buffer.allocUnsafe(outLen);
  const n = src.length;
  let i = 0, o = 0;
  const bad = () => new Error('LZ4 块坏了');
  while (i < n) {
    const token = src[i++]!;
    let literalLen = token >> 4;
    if (literalLen === 15) for (let c = 255; c === 255; literalLen += c) c = src[i++]!;
    if (i + literalLen > n || o + literalLen > outLen) throw bad();
    out.set(src.subarray(i, i + literalLen), o);
    i += literalLen;
    o += literalLen;
    if (i >= n) break; // 最后一组只有字面量
    const offset = src[i]! | (src[i + 1]! << 8);
    i += 2;
    let matchLen = token & 15;
    if (matchLen === 15) for (let c = 255; c === 255; matchLen += c) c = src[i++]!;
    matchLen += 4;
    if (!offset || offset > o || o + matchLen > outLen) throw bad();
    // 偏移比长度短 = 重复刚写出的字节，只能逐字节抄
    if (offset >= matchLen) out.copyWithin(o, o - offset, o - offset + matchLen);
    else for (let k = 0; k < matchLen; k++) out[o + k] = out[o - offset + k]!;
    o += matchLen;
  }
  if (o !== outLen) throw bad();
  return out;
};

/** 文件里第 index 个 cube 的 NBT；偏移表里没有返回 null */
export const readCube = (data: Buffer, index: number, file: string): Compound | null => {
  const loc = data.readUInt32BE(4 * index);
  if (!loc) return null;
  const off = (loc >>> 8) * SECTOR_BYTES;
  const len = data.readUInt32BE(off);
  const method = data[off + 4];
  const body = data.subarray(off + 5, off + 4 + len);
  if (method === 3) return readNbt(lz4Block(body.subarray(4), body.readUInt32BE(0)));
  if (method === 2) return readNbt(inflateSync(body));
  if (method === 1) return readNbt(gunzipSync(body));
  throw new Error(`${file} 第 ${index} 个 cube 压缩方式 ${method} 不认识`);
};

/** 存档 cubes 目录里的文件按列段区域分好：键 "rx,rz"（rx = X >> 1），值是文件名，排好序 */
export const listCubicRegions = (dir: string): Map<string, string[]> => {
  const out = new Map<string, string[]>();
  for (const f of fs.readdirSync(dir).sort()) {
    const xyz = parseCubicRegionFileName(f);
    if (!xyz) continue;
    const k = `${xyz[0] >> 1},${xyz[2] >> 1}`;
    let list = out.get(k);
    if (!list) out.set(k, (list = []));
    list.push(f);
  }
  return out;
};

const bitsFor = (n: number) => Math.ceil(Math.log2(n));
// 一个 cube 解出来的：stored = 存着且生成完；uniformState / uniformBiome ≥ 0 = 整个 cube 一样（就不展开成数组）
type Slab = { y0: number; stored: boolean; uniformState: number; states: Uint16Array | null; uniformBiome: number; biomes: Uint8Array | null };

/** 读一个列段区域：files 是组成它的 .mcr3d（X >> 1 = rx、Z >> 1 = rz 的全部 Y）；没有一列知道地表返回 null。wanted：只解这些区块（下标 cz·32 + cx） */
export const readCubicRegion = (files: readonly string[], rx: number, rz: number, seed: string, yRange: readonly [number, number], wanted?: ReadonlySet<number>): ReadRegionResult | null => {
  const [yBottom, yTop] = yRange;
  if (yBottom & 15 || (yTop + 1) & 15 || yTop < yBottom) throw new Error(`yRange 要对齐 cube（底是 16 的倍数、顶是 16 的倍数减 1），给的是 ${yBottom}～${yTop}`);
  if (yBottom < -32768 || yTop > 32767) throw new Error(`yRange ${yBottom}～${yTop} 超出列段放得下的 −32768～32767`);
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
  const fillState = intern(stateList, stateIds, UNDERGROUND_FILL);
  // 文件按 (X, Z) 分，各自的 Y 从高到低
  const fileColumns = new Map<string, { X: number; Z: number; byY: Map<number, string> }>();
  for (const f of files) {
    const xyz = parseCubicRegionFileName(path.basename(f));
    if (!xyz || xyz[0] >> 1 !== rx || xyz[2] >> 1 !== rz) throw new Error(`${f} 不属于列段区域 r.${rx}.${rz}`);
    const k = `${xyz[0]},${xyz[2]}`;
    let fc = fileColumns.get(k);
    if (!fc) fileColumns.set(k, (fc = { X: xyz[0], Z: xyz[2], byY: new Map() }));
    fc.byY.set(xyz[1], f);
  }
  const cubeBottom = yBottom >> 4, cubeTop = yTop >> 4;
  const tmp = new Uint16Array(4096);
  let runStates = new Uint16Array(1 << 16);
  let runBottoms = new Int16Array(1 << 16);
  let runBiomes = new Uint8Array(1 << 16);
  const chunks = new Map<number, ChunkSegment>();

  for (const { X, Z, byY } of fileColumns.values()) {
    const loaded = new Map<number, { data: Buffer; file: string }>();
    for (const [Y, f] of byY) if (Y * 16 + 15 >= cubeBottom && Y * 16 <= cubeTop) loaded.set(Y, { data: fs.readFileSync(f), file: f });
    if (!loaded.size) continue;
    for (let lcz = 0; lcz < 16; lcz++)
      for (let lcx = 0; lcx < 16; lcx++) {
        const chunkKey = ((Z & 1) * 16 + lcz) * 32 + (X & 1) * 16 + lcx;
        if (wanted && !wanted.has(chunkKey)) continue;
        // 这一摞 cube 从上往下解开
        const slabs: Slab[] = [];
        let anyStored = false;
        for (let cy = cubeTop; cy >= cubeBottom; cy--) {
          const slab: Slab = { y0: cy * 16, stored: false, uniformState: 0, states: null, uniformBiome: -1, biomes: null };
          slabs.push(slab);
          const src = loaded.get(cy >> 4);
          if (!src || src.data.length < 8 * SECTOR_BYTES) continue;
          const cube = readCube(src.data, cubeIndex(lcx, cy & 15, lcz), src.file);
          if (!cube || cube.status !== FULL_STATUS) continue;
          slab.stored = anyStored = true;
          const bs = cube.block_states as Compound | undefined;
          if (bs) {
            const ids = (bs.palette as Compound[]).map((p) => intern(stateList, stateIds, stateString(p.Name as string, p.Properties as Record<string, string> | undefined)));
            if (ids.length === 1) slab.uniformState = ids[0]!;
            else {
              unpackCompact((bs.data as LongArray).length, Math.max(4, bitsFor(ids.length)), 4096, tmp);
              const states = (slab.states = new Uint16Array(4096));
              for (let k = 0; k < 4096; k++) states[k] = ids[tmp[k]!]!;
              slab.uniformState = -1;
            }
          }
          const bm = cube.biomes as Compound;
          const bids = (bm.palette as string[]).map((n) => intern(biomeList, biomeIds, n));
          if (bids.length === 1) slab.uniformBiome = bids[0]!;
          else {
            unpackCompact((bm.data as LongArray).length, bitsFor(bids.length), 64, tmp);
            const biomes = (slab.biomes = new Uint8Array(64));
            for (let k = 0; k < 64; k++) biomes[k] = bids[tmp[k]!]!;
          }
        }
        if (!anyStored) continue;
        const runCounts = new Uint16Array(256);
        let runTotal = 0;
        for (let col = 0; col < 256; col++) {
          const bc = ((col >> 4) >> 2) * 4 + ((col & 15) >> 2);
          const m0 = runTotal;
          let state = 0, biome = -1;
          let surfaceSeen = false, surfaceKnown = false, aboveStored = false;
          const endRun = (bottom: number) => {
            if (runTotal === runStates.length) {
              const grow = <T extends Uint16Array | Int16Array | Uint8Array>(a: T): T => {
                const b = new (a.constructor as new (n: number) => T)(a.length * 2);
                b.set(a);
                return b;
              };
              runStates = grow(runStates);
              runBottoms = grow(runBottoms);
              runBiomes = grow(runBiomes);
            }
            runStates[runTotal] = state;
            runBiomes[runTotal] = Math.max(0, biome);
            runBottoms[runTotal++] = bottom;
          };
          for (const slab of slabs) {
            if (!slab.stored) {
              const s = surfaceSeen ? fillState : 0;
              if (s !== state) {
                endRun(slab.y0 + 16);
                state = s;
              }
              aboveStored = false;
              continue;
            }
            const wholeSlab = slab.uniformState >= 0 && slab.uniformBiome >= 0;
            for (let ly = 15; ly >= 0; ly--) {
              const s = slab.uniformState >= 0 ? slab.uniformState : slab.states![ly * 256 + col]!;
              const b = slab.uniformBiome >= 0 ? slab.uniformBiome : slab.biomes![(ly >> 2) * 16 + bc]!;
              if (s && !surfaceSeen) {
                surfaceSeen = true;
                surfaceKnown = ly < 15 || aboveStored;
              }
              // 还不知道群系（上面都没存）时不切段，沿用碰到的第一个
              if (s !== state || (b !== biome && biome >= 0)) {
                endRun(slab.y0 + ly + 1);
                state = s;
              }
              biome = b;
              if (wholeSlab) break; // 整个 cube 一样，看最上一格就够
            }
            aboveStored = true;
          }
          endRun(yBottom);
          if (surfaceKnown) runCounts[col] = runTotal - m0;
          else runTotal = m0;
        }
        if (!runTotal) continue;
        const runStarts = new Uint32Array(257);
        for (let k = 0; k < 256; k++) runStarts[k + 1] = runStarts[k]! + runCounts[k]!;
        chunks.set(chunkKey, { runCounts, runStarts, states: runStates.slice(0, runTotal), bottoms: runBottoms.slice(0, runTotal), biomes: runBiomes.slice(0, runTotal) });
      }
  }
  if (!chunks.size) return null;
  return assembleColumnSegments(chunks, { rx, rz, yBottom, yTop, stateTable: stateList, biomeTable: biomeList, seed });
};
