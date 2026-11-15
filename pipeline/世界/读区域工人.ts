// 读存档的工作线程（区域源.ts 起）：主线程发一个区域，读成列段写进缓存，回区块数和字节数。
import { parentPort, workerData } from 'node:worker_threads';
import { encodeColumnSegments } from './列段.ts';
import { readRegion } from './存档.ts';
import { writeCache } from './区域源.ts';

const { 种子: seed } = workerData as { 种子: string };
parentPort!.on('message', (m: { 文件: string; rx: number; rz: number; cachePath: string }) => {
  const r = readRegion(m.文件, m.rx, m.rz, seed);
  const gz = r ? encodeColumnSegments(r.columnSeg) : null;
  writeCache(m.cachePath, gz);
  parentPort!.postMessage({ rx: m.rx, rz: m.rz, 区块数: r?.区块.length ?? 0, 字节: gz?.length ?? 0 });
});
