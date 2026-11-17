// 算列段缓存键的工作线程（区域源.ts 起）：区域各文件的 sha256 接上后缀（种子、读法版本），一个区域文件十来 MB，几百个在主线程上算要好几秒。
// namesInKey：每个文件前先接文件名（一个区域多个文件的存档格式，见 存档格式.ts）；算法要和 区域源.ts 的 cacheFile 一样。
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parentPort } from 'node:worker_threads';

const buf = Buffer.alloc(1 << 22);
parentPort!.on('message', (m: { files: string[]; namesInKey: boolean; suffix: string }) => {
  const h = createHash('sha256');
  for (const f of m.files) {
    if (m.namesInKey) h.update(`${path.basename(f)}\0`);
    const fd = fs.openSync(f, 'r');
    try {
      for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0; ) h.update(buf.subarray(0, n));
    } finally {
      fs.closeSync(fd);
    }
  }
  parentPort!.postMessage(h.update(m.suffix).digest('hex'));
});
