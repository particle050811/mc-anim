// 多进程抢回收：持有者偶尔「被 SIGKILL」（锁里留死 pid 不放），用一个 O_EXCL 占位文件量有没有同时两个持有者。比真实一秒一轮夸张得多。
import fs from 'node:fs';
import { 回收死锁, 试拿, 放, 持有者 } from '../锁.ts';
const [, , file, 占位, 死pid, 毫秒] = process.argv as [string, string, string, string, string, string];
const 止 = Date.now() + Number(毫秒);
let 拿到 = 0, 重叠 = 0, 回收 = 0;
while (Date.now() < 止) {
  回收死锁(file, '本机', () => { 回收++; });
  if (!试拿(file, '本机')) continue;
  拿到++;
  let 我占 = false;
  try {
    fs.closeSync(fs.openSync(占位, 'wx'));
    我占 = true;
  } catch {
    重叠++;
  }
  for (const t = Date.now() + 1; Date.now() < t;);
  if (我占) fs.rmSync(占位, { force: true });
  if (Math.random() < 0.34 && 持有者(file) === process.pid) fs.writeFileSync(file, `${死pid}\n`);
  else 放(file);
}
console.log(JSON.stringify({ 拿到, 重叠, 回收 }));
