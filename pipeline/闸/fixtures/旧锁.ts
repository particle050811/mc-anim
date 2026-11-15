// 资源闸的锁，协议和旧项目 参考模型库/工具/公共/锁.py、锁.mjs 一样（迁移期两个项目共用一个锁目录，一起排队）：
// 锁是 <锁目录>/<名>.lock，O_EXCL 建出来就是拿到，内容是持有者的 pid，放锁就是删掉；刚建出来还没写进 pid 的空文件，10 秒内当有人拿着。
// 持有者进程不在了就当过期：先改名成只有自己知道的临时名（原子），看改走的是不是刚判死的那把，是才删，不是就改回原名（旧项目 bd3a6a0d 的做法）。
// 主机名不写进锁文件（旧 锁.py 只认纯数字，写了别的它 10 秒后就当空文件删掉），另写在旁边的 <名>.lock.<pid>.主机：
// 持有者在别的机器上（共享盘上的锁目录）时本机查不了它的 pid，就当它活着。
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isWindows } from '../../环境/配置.ts';

const emptyFileGraceMs = 10_000;

export const lockPath = (lockDir: string, lockName: string) => {
  fs.mkdirSync(lockDir, { recursive: true });
  return path.join(lockDir, `${lockName}.lock`);
};

export const processAlive = (pid: number) => {
  if (!(pid > 0)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
};

const code = (err: unknown) => (err as NodeJS.ErrnoException).code ?? '';

const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Windows 上别的进程正读着（Python 读文件不带 FILE_SHARE_DELETE）时删不掉、改不了名，等一下再来，最多 5 秒（未在 Windows 实测）。
 * 别的系统上这类错误照常抛出，不空转 */
const retry = <T>(fn: () => T): T => {
  for (let i = 0; i < 50; i++) {
    try {
      return fn();
    } catch (err) {
      if (!(isWindows && ['EPERM', 'EBUSY', 'EACCES'].includes(code(err)))) throw err;
      sleep(100);
    }
  }
  return fn();
};

const removeFile = (file: string) => retry(() => fs.rmSync(file, { force: true }));

const hostFile = (file: string, pid: number) => `${file}.${pid}.主机`;

/** [锁里的 pid（还没写进 pid 时是 null）, mtime]；没有这个文件返回 null */
const readLock = (file: string): [number | null, number] | null => {
  try {
    const text = fs.readFileSync(file, 'utf8').trim();
    return [/^\d+$/.test(text) ? Number(text) : null, fs.statSync(file).mtimeMs];
  } catch {
    return null;
  }
};

export const holderPid = (file: string): number | null => readLock(file)?.[0] ?? null;

/** 持有者所在主机；旁边没有 .主机 文件（旧项目的工具拿的）就当本机 */
export const holderHost = (file: string, pid: number): string | null => {
  try {
    return fs.readFileSync(hostFile(file, pid), 'utf8').trim() || null;
  } catch {
    return null;
  }
};

const isStale = (file: string, pid: number | null, mtimeMs: number, localHost: string) => {
  if (pid === null) return Date.now() - mtimeMs > emptyFileGraceMs;
  const host = holderHost(file, pid);
  if (host && host !== localHost) return false;
  return !processAlive(pid);
};

const clearExpired = (file: string, deadPid: number | null, localHost: string) => {
  const tmp = `${file}.过期-${process.pid}-${randomBytes(4).toString('hex')}`;
  try {
    retry(() => fs.renameSync(file, tmp));
  } catch (err) {
    if (code(err) === 'ENOENT') return; // 别人先改走了
    throw err;
  }
  const now = readLock(tmp);
  if (!(now && now[0] === deadPid && isStale(file, now[0], now[1], localHost))) {
    // 改走的是别人刚建的新锁：用硬链接改回原名，原名上又有了新锁（第三方趁这一下建的）就不覆盖它
    try {
      fs.linkSync(tmp, file);
    } catch (err) {
      if (code(err) !== 'EEXIST') throw err;
    }
  } else if (deadPid !== null) {
    removeFile(hostFile(file, deadPid));
  }
  removeFile(tmp);
};

/** 旧项目的工具回收过期锁时不知道旁边的 .主机 文件，拿到锁时顺手删掉本机已死进程留下的 */
const sweepDeadHostFiles = (file: string, localHost: string) => {
  const filePrefix = path.basename(file) + '.';
  for (const fileName of fs.readdirSync(path.dirname(file))) {
    const pid = Number(/^(\d+)\.主机$/.exec(fileName.startsWith(filePrefix) ? fileName.slice(filePrefix.length) : '')?.[1]);
    if (!pid || pid === process.pid) continue;
    const p = path.join(path.dirname(file), fileName);
    if (holderHost(file, pid) === localHost && !processAlive(pid)) removeFile(p);
  }
};

/** 抢一次：拿到返回 true，锁在活着的进程手里返回 false */
export const tryAcquire = (file: string, localHost: string): boolean => {
  // 主机先写好再建锁：别的机器看到锁时，主机文件已经在了
  const myHostFile = hostFile(file, process.pid);
  fs.writeFileSync(myHostFile, `${localHost}\n`, 'utf8');
  for (;;) {
    try {
      const fd = fs.openSync(file, 'wx');
      fs.writeSync(fd, `${process.pid}\n`);
      fs.closeSync(fd);
      sweepDeadHostFiles(file, localHost);
      return true;
    } catch (err) {
      if (code(err) !== 'EEXIST') throw err;
    }
    const seen = readLock(file);
    if (!seen) continue; // 刚被放掉，再抢
    if (!isStale(file, seen[0], seen[1], localHost)) {
      if (seen[0] !== process.pid) removeFile(myHostFile);
      return false;
    }
    clearExpired(file, seen[0], localHost);
  }
};

/** 放锁：只删自己拿着的 */
export const releaseLock = (file: string) => {
  if (holderPid(file) === process.pid) removeFile(file);
  removeFile(hostFile(file, process.pid));
};
