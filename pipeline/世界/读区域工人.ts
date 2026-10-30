// 读存档的工作线程（区域源.ts 起）：主线程发一个区域，读成列段写进缓存，回区块数和字节数。
import { parentPort, workerData } from 'node:worker_threads';
import { 编码列段 } from './列段.ts';
import { 读区域 } from './存档.ts';
import { 写缓存 } from './区域源.ts';

const { 种子 } = workerData as { 种子: string };
parentPort!.on('message', (m: { 文件: string; rx: number; rz: number; 缓存: string }) => {
  const r = 读区域(m.文件, m.rx, m.rz, 种子);
  const gz = r ? 编码列段(r.列段) : null;
  写缓存(m.缓存, gz);
  parentPort!.postMessage({ rx: m.rx, rz: m.rz, 区块数: r?.区块.length ?? 0, 字节: gz?.length ?? 0 });
});
