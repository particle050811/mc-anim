// 资源闸的锁，协议和旧项目 参考模型库/工具/公共/锁.py、锁.mjs 一样（迁移期两个项目共用一个锁目录，一起排队）：
// 锁是 <锁目录>/<名>.lock，O_EXCL 建出来就是拿到，内容是持有者的 pid，放锁就是删掉；刚建出来还没写进 pid 的空文件，10 秒内当有人拿着。
// 持有者进程不在了就当过期：先改名成只有自己知道的临时名（原子），看改走的是不是刚判死的那把，是才删，不是就改回原名（旧项目 bd3a6a0d 的做法）。
// 主机名不写进锁文件（旧 锁.py 只认纯数字，写了别的它 10 秒后就当空文件删掉），另写在旁边的 <名>.lock.<pid>.主机：
// 持有者在别的机器上（共享盘上的锁目录）时本机查不了它的 pid，就当它活着。
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isWindows } from '../环境/配置.ts';

const 空文件宽限毫秒 = 10_000;

export const 锁文件 = (锁目录: string, 名: string) => {
  fs.mkdirSync(锁目录, { recursive: true });
  return path.join(锁目录, `${名}.lock`);
};

export const 进程在吗 = (pid: number) => {
  if (!(pid > 0)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
};

const code = (err: unknown) => (err as NodeJS.ErrnoException).code ?? '';

const 睡 = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Windows 上别的进程正读着（Python 读文件不带 FILE_SHARE_DELETE）时删不掉、改不了名，等一下再来，最多 5 秒（未在 Windows 实测）。
 * 别的系统上这类错误照常抛出，不空转 */
const 重试 = <T>(fn: () => T): T => {
  for (let i = 0; i < 50; i++) {
    try {
      return fn();
    } catch (err) {
      if (!(isWindows && ['EPERM', 'EBUSY', 'EACCES'].includes(code(err)))) throw err;
      睡(100);
    }
  }
  return fn();
};

const 删 = (file: string) => 重试(() => fs.rmSync(file, { force: true }));

const 主机文件 = (file: string, pid: number) => `${file}.${pid}.主机`;

/** [锁里的 pid（还没写进 pid 时是 null）, mtime]；没有这个文件返回 null */
const 读 = (file: string): [number | null, number] | null => {
  try {
    const text = fs.readFileSync(file, 'utf8').trim();
    return [/^\d+$/.test(text) ? Number(text) : null, fs.statSync(file).mtimeMs];
  } catch {
    return null;
  }
};

export const 持有者 = (file: string): number | null => 读(file)?.[0] ?? null;

/** 持有者所在主机；旁边没有 .主机 文件（旧项目的工具拿的）就当本机 */
export const 持有者主机 = (file: string, pid: number): string | null => {
  try {
    return fs.readFileSync(主机文件(file, pid), 'utf8').trim() || null;
  } catch {
    return null;
  }
};

const 过期 = (file: string, pid: number | null, mtimeMs: number, 本机: string) => {
  if (pid === null) return Date.now() - mtimeMs > 空文件宽限毫秒;
  const 主机 = 持有者主机(file, pid);
  if (主机 && 主机 !== 本机) return false;
  return !进程在吗(pid);
};

const 清掉过期 = (file: string, 判死的pid: number | null, 本机: string) => {
  const tmp = `${file}.过期-${process.pid}-${randomBytes(4).toString('hex')}`;
  try {
    重试(() => fs.renameSync(file, tmp));
  } catch (err) {
    if (code(err) === 'ENOENT') return; // 别人先改走了
    throw err;
  }
  const now = 读(tmp);
  if (!(now && now[0] === 判死的pid && 过期(file, now[0], now[1], 本机))) {
    // 改走的是别人刚建的新锁：用硬链接改回原名，原名上又有了新锁（第三方趁这一下建的）就不覆盖它
    try {
      fs.linkSync(tmp, file);
    } catch (err) {
      if (code(err) !== 'EEXIST') throw err;
    }
  } else if (判死的pid !== null) {
    删(主机文件(file, 判死的pid));
  }
  删(tmp);
};

/** 旧项目的工具回收过期锁时不知道旁边的 .主机 文件，拿到锁时顺手删掉本机已死进程留下的 */
const 扫掉死主机文件 = (file: string, 本机: string) => {
  const 前缀 = path.basename(file) + '.';
  for (const 名 of fs.readdirSync(path.dirname(file))) {
    const pid = Number(/^(\d+)\.主机$/.exec(名.startsWith(前缀) ? 名.slice(前缀.length) : '')?.[1]);
    if (!pid || pid === process.pid) continue;
    const p = path.join(path.dirname(file), 名);
    if (持有者主机(file, pid) === 本机 && !进程在吗(pid)) 删(p);
  }
};

/** 抢一次：拿到返回 true，锁在活着的进程手里返回 false */
export const 试拿 = (file: string, 本机: string): boolean => {
  // 主机先写好再建锁：别的机器看到锁时，主机文件已经在了
  const 我的主机文件 = 主机文件(file, process.pid);
  fs.writeFileSync(我的主机文件, `${本机}\n`, 'utf8');
  for (;;) {
    try {
      const fd = fs.openSync(file, 'wx');
      fs.writeSync(fd, `${process.pid}\n`);
      fs.closeSync(fd);
      扫掉死主机文件(file, 本机);
      return true;
    } catch (err) {
      if (code(err) !== 'EEXIST') throw err;
    }
    const seen = 读(file);
    if (!seen) continue; // 刚被放掉，再抢
    if (!过期(file, seen[0], seen[1], 本机)) {
      if (seen[0] !== process.pid) 删(我的主机文件);
      return false;
    }
    清掉过期(file, seen[0], 本机);
  }
};

/** 放锁：只删自己拿着的 */
export const 放 = (file: string) => {
  if (持有者(file) === process.pid) 删(file);
  删(主机文件(file, process.pid));
};
