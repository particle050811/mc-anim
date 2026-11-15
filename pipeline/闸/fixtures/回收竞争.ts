// 多进程抢回收：持有者偶尔「被 SIGKILL」（锁里留死 pid 不放），用一个 O_EXCL 占位文件量有没有同时两个持有者。比真实一秒一轮夸张得多。
import fs from 'node:fs';
import { reclaimDeadLock, tryAcquire, releaseLock, holderPid } from '../锁.ts';
const [, , file, lockPath, deadPid, holdMs] = process.argv as [string, string, string, string, string, string];
const deadline = Date.now() + Number(holdMs);
let acquired = 0, overlaps = 0, reclaimCount = 0;
while (Date.now() < deadline) {
  reclaimDeadLock(file, '本机', () => { reclaimCount++; });
  if (!tryAcquire(file, '本机')) continue;
  acquired++;
  let heldByMe = false;
  try {
    fs.closeSync(fs.openSync(lockPath, 'wx'));
    heldByMe = true;
  } catch {
    overlaps++;
  }
  for (const t = Date.now() + 1; Date.now() < t;);
  if (heldByMe) fs.rmSync(lockPath, { force: true });
  if (Math.random() < 0.34 && holderPid(file) === process.pid) fs.writeFileSync(file, `${deadPid}\n`);
  else releaseLock(file);
}
console.log(JSON.stringify({ acquired, overlaps, reclaimCount }));
