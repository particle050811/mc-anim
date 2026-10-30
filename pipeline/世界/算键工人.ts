// 算列段缓存键的工作线程（区域源.ts 起）：区域文件的 sha256 接上后缀（种子、读法版本），一个区域文件十来 MB，几百个在主线程上算要好几秒。
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { parentPort } from 'node:worker_threads';

const buf = Buffer.alloc(1 << 22);
parentPort!.on('message', (m: { 文件: string; 后缀: string }) => {
  const h = createHash('sha256');
  const fd = fs.openSync(m.文件, 'r');
  try {
    for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0; ) h.update(buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  parentPort!.postMessage(h.update(m.后缀).digest('hex'));
});
