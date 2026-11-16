import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { 读进程 } from '../闸/孤儿.ts';
import { listDir, type WithReasons, type DirEntry, type KeepReason } from './回收.ts';

/** 老包没有持有者记录；ps 没显示 serveUrl 也不能据此说没人用，仍有渲染进程时保守留下。 */
export const bundleKeepReasons = (bundleEntry: Pick<DirEntry, 'path' | 'modifiedAt'>, now: number, psOutput: string): KeepReason[] => {
  if (now - bundleEntry.modifiedAt <= 24 * 3600_000) return [{ type: '近期', note: '打包不足 24 小时' }];
  const lines = psOutput.trim().split('\n').filter(Boolean), procMatches = lines.map(l => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(l));
  if (!procMatches.length || procMatches.some(m => !m)) return [{ type: '算不出', note: '读不到完整进程表，不删打包' }];
  const baseName = path.basename(bundleEntry.path);
  for (const m of procMatches) {
    if (Number(m![1]) === process.pid) continue;
    const cmd = m![4]!;
    if (cmd.includes(baseName) || cmd.includes(encodeURIComponent(baseName))) return [{ type: '在用', note: `进程 #${m![1]} 引用了这份打包` }];
  }
  const unknownOwner = procMatches.find(m => Number(m![1]) !== process.pid && (/pipeline[\\/]cli[\\/]main\.ts(?:\s|$)/.test(m![4]!) || /(?:\.remotion|@remotion|[\\/]cache[\\/]浏览器)[\\/].*chrome-headless-shell/.test(m![4]!) || /(?:^|[\\/\s])remotion(?:\s|[\\/])/.test(m![4]!)));
  return unknownOwner ? [{ type: '算不出', note: `渲染进程 #${unknownOwner[1]} 的打包归属不明` }] : [];
};

export const scanBundles = (now: number, root = os.tmpdir(), psOutput = 读进程()): WithReasons<DirEntry>[] =>
  listDir(root, 3, n => n.startsWith('remotion-webpack-bundle-') && fs.lstatSync(path.join(root, n), { throwIfNoEntry: false })?.isDirectory() === true)
    .map(d => ({ ...d, reason: bundleKeepReasons(d, now, psOutput) }));
