// 服务端相关单测共用：最小的 zip 写入器（假的 mcai jar、数据包 zip 用）
import fs from 'node:fs';
import { deflateRawSync } from 'node:zlib';

/** 测试用的最小 zip 写入器：第一个条目 stored，其余 deflate */
export const 写zip = (f: string, 条目: Record<string, string>) => {
  const 本地: Buffer[] = [], 中央: Buffer[] = [];
  let 偏 = 0;
  Object.entries(条目).forEach(([名, 文], i) => {
    const 原 = Buffer.from(文), 数据 = i ? deflateRawSync(原) : 原, n = Buffer.from(名);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(i ? 8 : 0, 8);
    h.writeUInt32LE(数据.length, 18);
    h.writeUInt32LE(原.length, 22);
    h.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(i ? 8 : 0, 10);
    c.writeUInt32LE(数据.length, 20);
    c.writeUInt32LE(原.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(偏, 42);
    本地.push(h, n, 数据);
    中央.push(c, n);
    偏 += 30 + n.length + 数据.length;
  });
  const cd = Buffer.concat(中央);
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0);
  e.writeUInt16LE(中央.length / 2, 8);
  e.writeUInt16LE(中央.length / 2, 10);
  e.writeUInt32LE(cd.length, 12);
  e.writeUInt32LE(偏, 16);
  fs.writeFileSync(f, Buffer.concat([...本地, cd, e]));
};
