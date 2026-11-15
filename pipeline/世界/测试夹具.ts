// 测试用：造一个极小的 1.20.1 存档（level.dat + 区域文件），区块按给的函数逐格填方块。只给 *.test.ts 用。
import fs from 'node:fs';
import path from 'node:path';
import { deflateSync, gzipSync } from 'node:zlib';
import { writeNbt, type NbtLabel } from './nbt.ts';

/** 每个 long 放 ⌊64/位数⌋ 个、不跨 long、从低位起（解紧凑 的反过来） */
export const packCompact = (vals: ArrayLike<number>, bits: number): bigint[] => {
  const per = Math.floor(64 / bits);
  const out: bigint[] = [];
  for (let i = 0; i < vals.length; i += per) {
    let v = 0n;
    for (let j = 0; j < per && i + j < vals.length; j++) v |= BigInt(vals[i + j]!) << BigInt(j * bits);
    out.push(BigInt.asIntN(64, v));
  }
  return out;
};

const stringTag = (v: string): NbtLabel => ({ t: 'string', v });
const stateTag = (s: string): NbtLabel => {
  const m = /^([^[]+)(?:\[(.*)\])?$/.exec(s)!;
  const v: Record<string, NbtLabel> = { Name: stringTag(m[1]!) };
  if (m[2]) v.Properties = { t: 'compound', v: Object.fromEntries(m[2].split(',').map((kv) => kv.split('=')).map(([k, x]) => [k!, stringTag(x!)])) };
  return { t: 'compound', v };
};

/** 一个区块：方块(x, y, z) 给区块内坐标和世界 y，返回状态串；群系一律 群系。y 范围 [y底, y底 + 16·段数) */
export const makeChunk = (cx: number, cz: number, blockAt: (x: number, y: number, z: number) => string, o: { yBottom?: number; 段数?: number; 群系?: string; 状态?: string } = {}): Buffer => {
  const yBottom = o.yBottom ?? -64, segCount = o.段数 ?? 24;
  const sections: NbtLabel[] = [];
  for (let s = 0; s < segCount; s++) {
    const pal: string[] = [];
    const idx = new Array<number>(4096);
    for (let y = 0; y < 16; y++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const st = blockAt(x, yBottom + s * 16 + y, z);
          let k = pal.indexOf(st);
          if (k < 0) k = pal.push(st) - 1;
          idx[y * 256 + z * 16 + x] = k;
        }
    const bs: Record<string, NbtLabel> = { palette: { t: 'list', elementType: 'compound', v: pal.map(stateTag) } };
    if (pal.length > 1) bs.data = { t: 'longArray', v: packCompact(idx, Math.max(4, Math.ceil(Math.log2(pal.length)))) };
    sections.push({ t: 'compound', v: { Y: { t: 'byte', v: yBottom / 16 + s }, block_states: { t: 'compound', v: bs }, biomes: { t: 'compound', v: { palette: { t: 'list', elementType: 'string', v: [stringTag(o.群系 ?? 'minecraft:plains')] } } } } });
  }
  return writeNbt({
    DataVersion: { t: 'int', v: 3465 },
    xPos: { t: 'int', v: cx },
    zPos: { t: 'int', v: cz },
    yPos: { t: 'int', v: yBottom / 16 },
    Status: stringTag(o.状态 ?? 'minecraft:full'),
    sections: { t: 'list', elementType: 'compound', v: sections },
  });
};

/** 区域文件：区块 NBT（未压缩）按 cz·32 + cx 放，zlib 压 */
export const makeRegionFile = (chunks: Map<number, Buffer>): Buffer => {
  const head = Buffer.alloc(8192);
  const bodies: Buffer[] = [];
  let sector = 2;
  for (const [i, nbt] of [...chunks].sort((a, b) => a[0] - b[0])) {
    const z = deflateSync(nbt);
    const len = Buffer.alloc(5);
    len.writeUInt32BE(z.length + 1);
    len[4] = 2;
    const n = Math.ceil((z.length + 5) / 4096);
    const body = Buffer.alloc(n * 4096);
    Buffer.concat([len, z]).copy(body);
    bodies.push(body);
    head.writeUInt32BE((sector << 8) | n, 4 * i);
    sector += n;
  }
  return Buffer.concat([head, ...bodies]);
};

/** 世界目录：level.dat（只有种子）+ region/；区块们 = [cx, cz, 方块函数] */
export const makeWorld = (dir: string, seed: bigint, chunks: [number, number, (x: number, y: number, z: number) => string][], o: Parameters<typeof makeChunk>[3] = {}) => {
  fs.mkdirSync(path.join(dir, 'region'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'level.dat'), gzipSync(writeNbt({ Data: { t: 'compound', v: { WorldGenSettings: { t: 'compound', v: { seed: { t: 'long', v: seed } } } } } })));
  const byRegion = new Map<string, Map<number, Buffer>>();
  for (const [cx, cz, f] of chunks) {
    const k = `${cx >> 5}.${cz >> 5}`;
    if (!byRegion.has(k)) byRegion.set(k, new Map());
    byRegion.get(k)!.set((cz & 31) * 32 + (cx & 31), makeChunk(cx, cz, (x, y, z) => f(cx * 16 + x, y, cz * 16 + z), o));
  }
  for (const [k, m] of byRegion) fs.writeFileSync(path.join(dir, 'region', `r.${k}.mca`), makeRegionFile(m));
};
