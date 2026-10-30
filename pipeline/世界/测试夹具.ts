// 测试用：造一个极小的 1.20.1 存档（level.dat + 区域文件），区块按给的函数逐格填方块。只给 *.test.ts 用。
import fs from 'node:fs';
import path from 'node:path';
import { deflateSync, gzipSync } from 'node:zlib';
import { 写NBT, type 标签 } from './nbt.ts';

/** 每个 long 放 ⌊64/位数⌋ 个、不跨 long、从低位起（解紧凑 的反过来） */
export const 压紧凑 = (vals: ArrayLike<number>, bits: number): bigint[] => {
  const per = Math.floor(64 / bits);
  const out: bigint[] = [];
  for (let i = 0; i < vals.length; i += per) {
    let v = 0n;
    for (let j = 0; j < per && i + j < vals.length; j++) v |= BigInt(vals[i + j]!) << BigInt(j * bits);
    out.push(BigInt.asIntN(64, v));
  }
  return out;
};

const 字 = (v: string): 标签 => ({ t: 'string', v });
const 状态标签 = (s: string): 标签 => {
  const m = /^([^[]+)(?:\[(.*)\])?$/.exec(s)!;
  const v: Record<string, 标签> = { Name: 字(m[1]!) };
  if (m[2]) v.Properties = { t: 'compound', v: Object.fromEntries(m[2].split(',').map((kv) => kv.split('=')).map(([k, x]) => [k!, 字(x!)])) };
  return { t: 'compound', v };
};

/** 一个区块：方块(x, y, z) 给区块内坐标和世界 y，返回状态串；群系一律 群系。y 范围 [y底, y底 + 16·段数) */
export const 造区块 = (cx: number, cz: number, 方块: (x: number, y: number, z: number) => string, o: { y底?: number; 段数?: number; 群系?: string; 状态?: string } = {}): Buffer => {
  const y底 = o.y底 ?? -64, 段数 = o.段数 ?? 24;
  const sections: 标签[] = [];
  for (let s = 0; s < 段数; s++) {
    const pal: string[] = [];
    const idx = new Array<number>(4096);
    for (let y = 0; y < 16; y++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const st = 方块(x, y底 + s * 16 + y, z);
          let k = pal.indexOf(st);
          if (k < 0) k = pal.push(st) - 1;
          idx[y * 256 + z * 16 + x] = k;
        }
    const bs: Record<string, 标签> = { palette: { t: 'list', 元素: 'compound', v: pal.map(状态标签) } };
    if (pal.length > 1) bs.data = { t: 'longArray', v: 压紧凑(idx, Math.max(4, Math.ceil(Math.log2(pal.length)))) };
    sections.push({ t: 'compound', v: { Y: { t: 'byte', v: y底 / 16 + s }, block_states: { t: 'compound', v: bs }, biomes: { t: 'compound', v: { palette: { t: 'list', 元素: 'string', v: [字(o.群系 ?? 'minecraft:plains')] } } } } });
  }
  return 写NBT({
    DataVersion: { t: 'int', v: 3465 },
    xPos: { t: 'int', v: cx },
    zPos: { t: 'int', v: cz },
    yPos: { t: 'int', v: y底 / 16 },
    Status: 字(o.状态 ?? 'minecraft:full'),
    sections: { t: 'list', 元素: 'compound', v: sections },
  });
};

/** 区域文件：区块 NBT（未压缩）按 cz·32 + cx 放，zlib 压 */
export const 造区域文件 = (区块: Map<number, Buffer>): Buffer => {
  const head = Buffer.alloc(8192);
  const bodies: Buffer[] = [];
  let sector = 2;
  for (const [i, nbt] of [...区块].sort((a, b) => a[0] - b[0])) {
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
export const 造世界 = (dir: string, 种子: bigint, 区块们: [number, number, (x: number, y: number, z: number) => string][], o: Parameters<typeof 造区块>[3] = {}) => {
  fs.mkdirSync(path.join(dir, 'region'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'level.dat'), gzipSync(写NBT({ Data: { t: 'compound', v: { WorldGenSettings: { t: 'compound', v: { seed: { t: 'long', v: 种子 } } } } } })));
  const 按区域 = new Map<string, Map<number, Buffer>>();
  for (const [cx, cz, f] of 区块们) {
    const k = `${cx >> 5}.${cz >> 5}`;
    if (!按区域.has(k)) 按区域.set(k, new Map());
    按区域.get(k)!.set((cz & 31) * 32 + (cx & 31), 造区块(cx, cz, (x, y, z) => f(cx * 16 + x, y, cz * 16 + z), o));
  }
  for (const [k, m] of 按区域) fs.writeFileSync(path.join(dir, 'region', `r.${k}.mca`), 造区域文件(m));
};
