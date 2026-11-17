// 测试用：造一个 DH 的 LOD 库（表 FullDataCubic，格式见 读库.ts）。只给测试引。
import { DatabaseSync } from 'node:sqlite';
import { zstdCompressSync } from 'node:zlib';
import { dhRowSpan } from './读库.ts';

/** 一列从上往下的段：[映射串, 高几格]，高度加起来 = 行高。映射串如 'minecraft:plains_DH-BSW_minecraft:stone'、'minecraft:plains_DH-BSW_AIR' */
export type DhTestColumn = [mapping: string, height: number][];
/** 一行：级、PosX、PosY、PosZ，和各列（区段内 x、z 0～63；y0 = 这一行最低那格的 y）的内容；返回 null = 这一行不存 */
export type DhTestRow = { level: number; posX: number; posY: number; posZ: number; column: (x: number, z: number, y0: number, span: number) => DhTestColumn };

const varint = (out: number[], v: number) => {
  while (v >= 128) {
    out.push((v % 128) | 128);
    v = Math.floor(v / 128);
  }
  out.push(v);
};

export const makeDhDb = (file: string, rows: DhTestRow[]) => {
  const db = new DatabaseSync(file);
  db.exec('create table FullDataCubic (DetailLevel integer, PosX integer, PosY integer, PosZ integer, Data blob, Mapping blob, NorthAdjData blob, SouthAdjData blob, EastAdjData blob, WestAdjData blob, primary key (DetailLevel, PosX, PosY, PosZ))');
  const insert = db.prepare('insert into FullDataCubic values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const r of rows) {
    const span = dhRowSpan(r.level);
    const names: string[] = [];
    const ids = new Map<string, number>();
    const plane = (cols: [number, number][]) => {
      const counts: number[] = [], points: number[] = [], heights: number[] = [];
      for (const [x, z] of cols) {
        const column = r.column(x, z, r.posY * span, span);
        if (column.reduce((s, [, h]) => s + h, 0) !== span) throw new Error(`第 ${r.level} 级一行高 ${span}，(${x}, ${z}) 这一列加起来不是`);
        varint(counts, column.length);
        for (const [name, h] of column) {
          let id = ids.get(name);
          if (id === undefined) ids.set(name, (id = names.push(name) - 1));
          varint(points, id * 4 + 1);
          varint(heights, h);
        }
      }
      return zstdCompressSync(Buffer.from([...counts, ...points, ...heights]));
    };
    const line = (at: (k: number) => [number, number]) => Array.from({ length: 64 }, (_, k) => at(k));
    const inner: [number, number][] = [];
    for (let x = 1; x < 63; x++) for (let z = 1; z < 63; z++) inner.push([x, z]);
    const data = plane(inner);
    const north = plane(line((x) => [x, 0])), south = plane(line((x) => [x, 63])), east = plane(line((z) => [63, z])), west = plane(line((z) => [0, z]));
    const parts = [Buffer.alloc(4)];
    parts[0]!.writeUInt32BE(names.length);
    for (const name of names) {
      const s = Buffer.from(name, 'utf8'), len = Buffer.alloc(2);
      len.writeUInt16BE(s.length);
      parts.push(len, s);
    }
    insert.run(r.level, r.posX, r.posY, r.posZ, data, zstdCompressSync(Buffer.concat(parts)), north, south, east, west);
  }
  db.close();
};
