// 只读的小 zip 读取器：看 jar 里有没有某个类、读数据包 zip 里的文件（服务端开服前的核对用）。只认不加密的 stored、deflate 两种，
// 不认 zip64（几个 GB 的包用不上）。整个文件读进内存，jar、数据包都是几 MB 到一两百 MB。
import fs from 'node:fs';
import { inflateRawSync } from 'node:zlib';

export type zip条目 = { 名: string; 方法: number; 压缩长: number; 原长: number; 本地头: number };

export class 只读zip {
  private buf: Buffer;
  readonly 条目 = new Map<string, zip条目>();

  constructor(文件: string) {
    this.buf = fs.readFileSync(文件);
    const b = this.buf;
    // 中央目录结尾记录在最后 22 + 注释（≤ 65535）字节里，从后往前找签名
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--)
      if (b.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    if (eocd < 0) throw new Error(`${文件} 不是 zip（找不到中央目录）`);
    const 个数 = b.readUInt16LE(eocd + 10);
    let p = b.readUInt32LE(eocd + 16);
    for (let n = 0; n < 个数; n++) {
      if (b.readUInt32LE(p) !== 0x02014b50) throw new Error(`${文件} 的中央目录坏了`);
      const 名长 = b.readUInt16LE(p + 28), 额外长 = b.readUInt16LE(p + 30), 注释长 = b.readUInt16LE(p + 32);
      const 名 = b.toString('utf8', p + 46, p + 46 + 名长);
      this.条目.set(名, { 名, 方法: b.readUInt16LE(p + 10), 压缩长: b.readUInt32LE(p + 20), 原长: b.readUInt32LE(p + 24), 本地头: b.readUInt32LE(p + 42) });
      p += 46 + 名长 + 额外长 + 注释长;
    }
  }

  名们() {
    return [...this.条目.keys()];
  }

  读(名: string): Buffer {
    const e = this.条目.get(名);
    if (!e) throw new Error(`zip 里没有 ${名}`);
    const b = this.buf;
    const 起 = e.本地头 + 30 + b.readUInt16LE(e.本地头 + 26) + b.readUInt16LE(e.本地头 + 28);
    const 数据 = b.subarray(起, 起 + e.压缩长);
    if (e.方法 === 0) return Buffer.from(数据);
    if (e.方法 === 8) return inflateRawSync(数据);
    throw new Error(`zip 条目 ${名} 的压缩方法 ${e.方法} 不认`);
  }
}
