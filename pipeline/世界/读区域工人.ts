// 读存档的工作线程（区域源.ts 起）：主线程发一个区域，读成列段写进缓存，回区块数和字节数。
import { parentPort, workerData } from 'node:worker_threads';
import { encodeColumnSegments } from './列段.ts';
import { saveFormat, type SaveFormatSpec } from './存档格式.ts';
import { writeCache } from './区域源.ts';

const { seed, format: formatSpec } = workerData as { seed: string; format: SaveFormatSpec };
const format = saveFormat(formatSpec);
parentPort!.on('message', (m: { files: string[]; rx: number; rz: number; cachePath: string }) => {
  const r = format.read(m.files, m.rx, m.rz, seed);
  const gz = r ? encodeColumnSegments(r.columnSeg) : null;
  writeCache(m.cachePath, gz);
  parentPort!.postMessage({ rx: m.rx, rz: m.rz, chunkCount: r?.chunks.length ?? 0, bytes: gz?.length ?? 0 });
});
