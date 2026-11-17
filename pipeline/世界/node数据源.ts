// Node 里的数据源（engine/core/数据读取.ts 的接口）：路径和页面一样相对 public 目录写，第一段（terrain、solveCache、私有配乐、lightVolume）
// 按 pipeline/资产/public链接.ts 的表换成数据根里的目录，直接读盘，不经 run/public 的链接。地形覆盖这类在 Node 里跑 engine 纯函数的工具用。
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { missingDataError, onceTable, type DataSource } from '../../engine/core/数据读取.ts';
import { publicLinks } from '../资产/public链接.ts';

const asArrayBuffer = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

export const nodeDataSource = (links: Record<string, string> = publicLinks()): DataSource => {
  const filePath = (rel: string) => {
    const slash = rel.indexOf('/');
    const root = slash > 0 ? links[rel.slice(0, slash)] : undefined;
    if (!root) throw new Error(`数据源路径 ${rel} 的第一段不是 public 目录里的链接（${Object.keys(links).join('、')}）`);
    return path.join(root, rel.slice(slash + 1));
  };
  // 没有这个文件给 null，别的错照抛
  const readIfAny = async (rel: string): Promise<Buffer | null> => {
    try {
      return await fs.promises.readFile(filePath(rel));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  };
  const must = async (rel: string, hint?: string) => {
    const bytes = await readIfAny(rel);
    if (!bytes) throw missingDataError(rel, 'ENOENT', hint);
    return bytes;
  };
  return {
    kind: 'node',
    json: async (rel, hint) => JSON.parse((await must(rel, hint)).toString('utf8')),
    jsonIfAny: async (rel) => {
      const bytes = await readIfAny(rel);
      return bytes ? JSON.parse(bytes.toString('utf8')) : null;
    },
    gunzip: async (rel, hint) => asArrayBuffer(gunzipSync(await must(rel, hint))),
    once: onceTable(),
  };
};
