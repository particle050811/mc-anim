// 只读的小 zip 读取器：看 jar 里有没有某个类、读数据包 zip 里的文件（服务端开服前的核对用）。只认不加密的 stored、deflate 两种，
// 不认 zip64（几个 GB 的包用不上）。整个文件读进内存，jar、数据包都是几 MB 到一两百 MB。
import fs from 'node:fs';
import { inflateRawSync } from 'node:zlib';

export type ZipEntry = { 名: string; 方法: number; compressedLen: number; uncompressedSize: number; localHeaderOffset: number };

export class ReadOnlyZip {
  private buf: Buffer;
  readonly entryMap = new Map<string, ZipEntry>();

  constructor(file: string) {
    this.buf = fs.readFileSync(file);
    const b = this.buf;
    // 中央目录结尾记录在最后 22 + 注释（≤ 65535）字节里，从后往前找签名
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--)
      if (b.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    if (eocd < 0) throw new Error(`${file} 不是 zip（找不到中央目录）`);
    const entryCount = b.readUInt16LE(eocd + 10);
    let p = b.readUInt32LE(eocd + 16);
    for (let n = 0; n < entryCount; n++) {
      if (b.readUInt32LE(p) !== 0x02014b50) throw new Error(`${file} 的中央目录坏了`);
      const nameLen = b.readUInt16LE(p + 28), extraLen = b.readUInt16LE(p + 30), commentLen = b.readUInt16LE(p + 32);
      const entryName = b.toString('utf8', p + 46, p + 46 + nameLen);
      this.entryMap.set(entryName, { 名: entryName, 方法: b.readUInt16LE(p + 10), compressedLen: b.readUInt32LE(p + 20), uncompressedSize: b.readUInt32LE(p + 24), localHeaderOffset: b.readUInt32LE(p + 42) });
      p += 46 + nameLen + extraLen + commentLen;
    }
  }

  names() {
    return [...this.entryMap.keys()];
  }

  读(entryName: string): Buffer {
    const e = this.entryMap.get(entryName);
    if (!e) throw new Error(`zip 里没有 ${entryName}`);
    const b = this.buf;
    const startOffset = e.localHeaderOffset + 30 + b.readUInt16LE(e.localHeaderOffset + 26) + b.readUInt16LE(e.localHeaderOffset + 28);
    const compressedBytes = b.subarray(startOffset, startOffset + e.compressedLen);
    if (e.方法 === 0) return Buffer.from(compressedBytes);
    if (e.方法 === 8) return inflateRawSync(compressedBytes);
    throw new Error(`zip 条目 ${entryName} 的压缩方法 ${e.方法} 不认`);
  }
}
