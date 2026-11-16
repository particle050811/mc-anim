// 资源闸的锁。格式沿用旧项目 参考模型库/工具/公共/锁.py、锁.mjs（迁移期两个项目共用一个锁目录）；旧项目退役后格式没改：在跑的 anim 进程不会跟着换新代码，改格式要另做迁移。
// 锁是 <锁目录>/<名>.lock，O_EXCL 建出来就是拿到，内容是持有者的 pid，放锁就是删掉；刚建出来还没写进 pid 的空文件，10 秒内当有人拿着。
// 持有者进程不在了（或 pid 已被别的进程复用）就当过期：先过回收门，再改名成只有自己知道的临时名（原子），看改走的是不是刚判死的那把，是才删，不是就改回原名（旧项目 bd3a6a0d 的做法）。
// 主机名不写进锁文件（当初是因为旧 锁.py 只认纯数字），另写在旁边的 <名>.lock.<pid>.主机：
// 持有者在别的机器上（共享盘上的锁目录）时本机查不了它的 pid，就当它活着。
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isWindows } from '../环境/配置.ts';

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

/** pid 会复用，进程在吗 分不出是不是原来那个：启动得比它声称的拿锁、领票时刻还晚就是换人了。读不到（没有 ps）返回 null。 */
export const processStartTime = (pid: number): number | null => {
  const r = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, LC_ALL: 'C' } });
  const t = r.status === 0 ? Date.parse(r.stdout.trim()) : NaN;
  return Number.isNaN(t) ? null : t;
};

/** 判错会抢走活进程的锁，所以余量宁大：时钟回拨、共享盘 mtime 走服务器钟都不该误判；pid 一轮要几小时，漏不掉真复用。 */
const reuseMarginMs = 300_000;
const procStartCache = new Map<number, { timestamp: number; start: number | null }>();
/** 活着的 pid 比 时刻（锁或票最后写入）晚得多才启动，就不是当时那个进程。排队每轮都判，时刻还新就不开 ps，查过的半分钟内不再查。 */
export const pidReplaced = (pid: number, timeMs: number) => {
  const now = Date.now();
  if (now - timeMs <= reuseMarginMs) return false;
  let c = procStartCache.get(pid);
  if (!c || now - c.timestamp > 30_000) {
    c = { timestamp: now, start: processStartTime(pid) };
    procStartCache.set(pid, c);
  }
  return c.start !== null && c.start > timeMs + reuseMarginMs;
};

const code = (err: unknown) => (err as NodeJS.ErrnoException).code ?? '';

const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Windows 上别的进程正读着（Python 读文件不带 FILE_SHARE_DELETE）时删不掉、改不了名，等一下再来，最多 5 秒（未在 Windows 实测）。
 * 别的系统上这类错误照常抛出，不空转 */
export const retry = <T>(fn: () => T): T => {
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

/** 持有者所在主机；旁边没有 .主机 文件就当本机 */
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
  return !processAlive(pid) || Date.now() - os.uptime() * 1000 > mtimeMs || pidReplaced(pid, mtimeMs);
};

/** 门留下来（回收者死在门里）过这么久作废，下一轮再回收。门里只有几次文件操作。 */
const gateStaleMs = 10_000;
/**
 * 回收者一次一个：死锁只有回收者能挪走，门里再判一次死，改名改走的就只会是这把死锁。
 * 没有门的话，读完判死被抢占的回收者醒来会把别人刚拿的新锁改走，改回去之前原名是空的，第三方能拿到，两个持有者。
 * 有人在门里返回 false，调用方这轮别等；不能原地重试，试拿 是同步的，门留下时会空转 10 秒卡死事件循环。
 */
const clearExpired = (file: string, deadPid: number | null, localHost: string, onReclaim?: (pid:number|null) => void): boolean => {
  const recyclePath = `${file}.回收`;
  try {
    fs.closeSync(fs.openSync(recyclePath, 'wx'));
  } catch (err) {
    if (code(err) !== 'EEXIST') throw err;
    try {
      if (Date.now() - fs.statSync(recyclePath).mtimeMs > gateStaleMs) removeFile(recyclePath);
    } catch { /* 刚被别人删了 */ }
    return false;
  }
  let reclaimed = false;
  try {
    const seen = readLock(file);
    if (!seen || seen[0] !== deadPid || !isStale(file, seen[0], seen[1], localHost)) return true;
    const tmp = `${file}.过期-${process.pid}-${randomBytes(4).toString('hex')}`;
    try {
      retry(() => fs.renameSync(file, tmp));
    } catch (err) {
      if (code(err) === 'ENOENT') return true;
      throw err;
    }
    const now = readLock(tmp);
    if (now && now[0] === deadPid) {
      reclaimed = deadPid !== null;
      if (reclaimed) removeFile(hostFile(file, deadPid!));
    } else {
      // 门作废过（上一个回收者在门里卡了 10 秒以上）时，别的回收者可能抢先回收又拿了新锁：用硬链接改回原名，原名上又有了新锁就不覆盖它
      try {
        fs.linkSync(tmp, file);
      } catch (err) {
        if (code(err) !== 'EEXIST') throw err;
      }
    }
    removeFile(tmp);
  } finally {
    removeFile(recyclePath);
  }
  // 回收回调要清孤儿、写日志，不占着门。
  if (reclaimed) onReclaim?.(deadPid);
  return true;
};

/** 持有者已死就回收，拿不拿锁另说：等内存的等待者也要先回收，否则孤儿 Chrome 占着内存，内存永远回不来 */
export const reclaimDeadLock = (file: string, localHost: string, onReclaim?: (pid: number | null) => void) => {
  const seen = readLock(file);
  if (seen && isStale(file, seen[0], seen[1], localHost)) clearExpired(file, seen[0], localHost, onReclaim);
};

/** 锁在活进程手里（包括宽限内还没写进 pid 的空文件） */
export const lockHeld = (file: string, localHost: string) => {
  const seen = readLock(file);
  return seen !== null && !isStale(file, seen[0], seen[1], localHost);
};

/** 读 pid 和判死用同一次读：分两次读，正常放锁落在中间也会被报成持锁者死。 */
export const readHolder = (file: string, localHost: string) => {
  const seen = readLock(file);
  return seen?.[0] ? { pid: seen[0], 死: isStale(file, seen[0], seen[1], localHost) } : null;
};

/** 抢一次：拿到返回 true，锁在活着的进程手里返回 false */
export const tryAcquire = (file: string, localHost: string, onReclaim?: (pid:number|null)=>void): boolean => {
  // 主机先写好再建锁：别的机器看到锁时，主机文件已经在了
  const myHostFile = hostFile(file, process.pid);
  fs.writeFileSync(myHostFile, `${localHost}\n`, 'utf8');
  for (;;) {
    try {
      const fd = fs.openSync(file, 'wx');
      fs.writeSync(fd, `${process.pid}\n`);
      fs.closeSync(fd);
      return true;
    } catch (err) {
      if (code(err) !== 'EEXIST') throw err;
    }
    const seen = readLock(file);
    if (!seen) continue; // 刚被放掉，再抢
    if (!isStale(file, seen[0], seen[1], localHost) || !clearExpired(file, seen[0], localHost, onReclaim)) {
      if (seen[0] !== process.pid) removeFile(myHostFile);
      return false;
    }
  }
};

/** 放锁：只删自己拿着的 */
export const releaseLock = (file: string) => {
  if (holderPid(file) === process.pid) removeFile(file);
  removeFile(hostFile(file, process.pid));
};

/** 拿不到不等：这种短锁里的事，别人正在做就等于这轮做过了。 */
export const tryLocked = <T>(file: string, localHost: string, fn: () => T): T | undefined => {
  if (!tryAcquire(file, localHost)) return undefined;
  try {
    return fn();
  } finally {
    releaseLock(file);
  }
};
