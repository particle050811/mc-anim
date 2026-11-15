// 服务端相关单测共用：最小的 zip 写入器（假的 mcai jar、数据包 zip 用）
import fs from 'node:fs';
import { deflateRawSync } from 'node:zlib';

/** 测试用的最小 zip 写入器：第一个条目 stored，其余 deflate */
export const writeZip = (f: string, entryContents: Record<string, string>) => {
  const localHeaders: Buffer[] = [], centralHeaders: Buffer[] = [];
  let byteOffset = 0;
  Object.entries(entryContents).forEach(([entryName, content], i) => {
    const raw = Buffer.from(content), payload = i ? deflateRawSync(raw) : raw, n = Buffer.from(entryName);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(i ? 8 : 0, 8);
    h.writeUInt32LE(payload.length, 18);
    h.writeUInt32LE(raw.length, 22);
    h.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(i ? 8 : 0, 10);
    c.writeUInt32LE(payload.length, 20);
    c.writeUInt32LE(raw.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(byteOffset, 42);
    localHeaders.push(h, n, payload);
    centralHeaders.push(c, n);
    byteOffset += 30 + n.length + payload.length;
  });
  const cd = Buffer.concat(centralHeaders);
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0);
  e.writeUInt16LE(centralHeaders.length / 2, 8);
  e.writeUInt16LE(centralHeaders.length / 2, 10);
  e.writeUInt32LE(cd.length, 12);
  e.writeUInt32LE(byteOffset, 16);
  fs.writeFileSync(f, Buffer.concat([...localHeaders, cd, e]));
};
