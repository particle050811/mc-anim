import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { 读进程 } from '../闸/孤儿.ts';
import { 列目录, type 带理由, type 目录条目, type 保留理由 } from './回收.ts';

/** 老包没有持有者记录；ps 没显示 serveUrl 也不能据此说没人用，仍有渲染进程时保守留下。 */
export const 打包保留理由 = (包: Pick<目录条目, '路径' | '改于'>, 现在: number, 进程: string): 保留理由[] => {
  if (现在 - 包.改于 <= 24 * 3600_000) return [{ 类: '近期', 说明: '打包不足 24 小时' }];
  const 行们 = 进程.trim().split('\n').filter(Boolean), 表 = 行们.map(l => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(l));
  if (!表.length || 表.some(m => !m)) return [{ 类: '算不出', 说明: '读不到完整进程表，不删打包' }];
  const 名 = path.basename(包.路径);
  for (const m of 表) {
    if (Number(m![1]) === process.pid) continue;
    const cmd = m![4]!;
    if (cmd.includes(名) || cmd.includes(encodeURIComponent(名))) return [{ 类: '在用', 说明: `进程 #${m![1]} 引用了这份打包` }];
  }
  const 不明 = 表.find(m => Number(m![1]) !== process.pid && (/pipeline[\\/]cli[\\/]main\.ts(?:\s|$)/.test(m![4]!) || /(?:\.remotion|@remotion)[\\/].*chrome-headless-shell/.test(m![4]!) || /(?:^|[\\/\s])remotion(?:\s|[\\/])/.test(m![4]!)));
  return 不明 ? [{ 类: '算不出', 说明: `渲染进程 #${不明[1]} 的打包归属不明` }] : [];
};

export const 扫打包 = (现在: number, 根 = os.tmpdir(), 进程 = 读进程()): 带理由<目录条目>[] =>
  列目录(根, 3, n => n.startsWith('remotion-webpack-bundle-') && fs.lstatSync(path.join(根, n), { throwIfNoEntry: false })?.isDirectory() === true)
    .map(d => ({ ...d, 理由: 打包保留理由(d, 现在, 进程) }));
