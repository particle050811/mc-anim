// 资源闸的锁，协议和旧项目 参考模型库/工具/公共/锁.py、锁.mjs 一样（迁移期两个项目共用一个锁目录，一起排队）：
// 锁是 <锁目录>/<名>.lock，O_EXCL 建出来就是拿到，内容是持有者的 pid，放锁就是删掉；刚建出来还没写进 pid 的空文件，10 秒内当有人拿着。
// 持有者进程不在了（或 pid 已被别的进程复用）就当过期：先过回收门，再改名成只有自己知道的临时名（原子），看改走的是不是刚判死的那把，是才删，不是就改回原名（旧项目 bd3a6a0d 的做法）。
// 主机名不写进锁文件（旧 锁.py 只认纯数字，写了别的它 10 秒后就当空文件删掉），另写在旁边的 <名>.lock.<pid>.主机：
// 持有者在别的机器上（共享盘上的锁目录）时本机查不了它的 pid，就当它活着。
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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

/** pid 会复用，进程在吗 分不出是不是原来那个：启动得比它声称的拿锁、领票时刻还晚就是换人了。读不到（没有 ps）返回 null。 */
export const 进程起于 = (pid: number): number | null => {
  const r = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, LC_ALL: 'C' } });
  const t = r.status === 0 ? Date.parse(r.stdout.trim()) : NaN;
  return Number.isNaN(t) ? null : t;
};

/** 判错会抢走活进程的锁，所以余量宁大：时钟回拨、共享盘 mtime 走服务器钟都不该误判；pid 一轮要几小时，漏不掉真复用。 */
const 复用余量毫秒 = 300_000;
const 起于缓存 = new Map<number, { 时: number; 起: number | null }>();
/** 活着的 pid 比 时刻（锁或票最后写入）晚得多才启动，就不是当时那个进程。排队每轮都判，时刻还新就不开 ps，查过的半分钟内不再查。 */
export const pid换人了 = (pid: number, 时刻: number) => {
  const 现在 = Date.now();
  if (现在 - 时刻 <= 复用余量毫秒) return false;
  let c = 起于缓存.get(pid);
  if (!c || 现在 - c.时 > 30_000) {
    c = { 时: 现在, 起: 进程起于(pid) };
    起于缓存.set(pid, c);
  }
  return c.起 !== null && c.起 > 时刻 + 复用余量毫秒;
};

const code = (err: unknown) => (err as NodeJS.ErrnoException).code ?? '';

const 睡 = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Windows 上别的进程正读着（Python 读文件不带 FILE_SHARE_DELETE）时删不掉、改不了名，等一下再来，最多 5 秒（未在 Windows 实测）。
 * 别的系统上这类错误照常抛出，不空转 */
export const 重试 = <T>(fn: () => T): T => {
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
  return !进程在吗(pid) || Date.now() - os.uptime() * 1000 > mtimeMs || pid换人了(pid, mtimeMs);
};

/** 门留下来（回收者死在门里）过这么久作废，下一轮再回收。门里只有几次文件操作。 */
const 门作废毫秒 = 10_000;
/**
 * 回收者一次一个：死锁只有回收者能挪走，门里再判一次死，改名改走的就只会是这把死锁。
 * 没有门的话，读完判死被抢占的回收者醒来会把别人刚拿的新锁改走，改回去之前原名是空的，第三方能拿到，两个持有者。
 * 有人在门里返回 false，调用方这轮别等；不能原地重试，试拿 是同步的，门留下时会空转 10 秒卡死事件循环。
 */
const 清掉过期 = (file: string, 判死的pid: number | null, 本机: string, 回收?: (pid:number|null) => void): boolean => {
  const 门 = `${file}.回收`;
  try {
    fs.closeSync(fs.openSync(门, 'wx'));
  } catch (err) {
    if (code(err) !== 'EEXIST') throw err;
    try {
      if (Date.now() - fs.statSync(门).mtimeMs > 门作废毫秒) 删(门);
    } catch { /* 刚被别人删了 */ }
    return false;
  }
  let 回收了 = false;
  try {
    const seen = 读(file);
    if (!seen || seen[0] !== 判死的pid || !过期(file, seen[0], seen[1], 本机)) return true;
    const tmp = `${file}.过期-${process.pid}-${randomBytes(4).toString('hex')}`;
    try {
      重试(() => fs.renameSync(file, tmp));
    } catch (err) {
      if (code(err) === 'ENOENT') return true;
      throw err;
    }
    const now = 读(tmp);
    if (now && now[0] === 判死的pid) {
      回收了 = 判死的pid !== null;
      if (回收了) 删(主机文件(file, 判死的pid!));
    } else {
      // 旧项目的工具不认门，可能抢先回收又拿了新锁：用硬链接改回原名，原名上又有了新锁就不覆盖它
      try {
        fs.linkSync(tmp, file);
      } catch (err) {
        if (code(err) !== 'EEXIST') throw err;
      }
    }
    删(tmp);
  } finally {
    删(门);
  }
  // 回收回调要清孤儿、写日志，不占着门。
  if (回收了) 回收?.(判死的pid);
  return true;
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

/** 持有者已死就回收，拿不拿锁另说：等内存的等待者也要先回收，否则孤儿 Chrome 占着内存，内存永远回不来 */
export const 回收死锁 = (file: string, 本机: string, 回收?: (pid: number | null) => void) => {
  const seen = 读(file);
  if (seen && 过期(file, seen[0], seen[1], 本机)) 清掉过期(file, seen[0], 本机, 回收);
};

/** 锁在活进程手里（包括宽限内还没写进 pid 的空文件） */
export const 锁被占 = (file: string, 本机: string) => {
  const seen = 读(file);
  return seen !== null && !过期(file, seen[0], seen[1], 本机);
};

/** 读 pid 和判死用同一次读：分两次读，正常放锁落在中间也会被报成持锁者死。 */
export const 读持有 = (file: string, 本机: string) => {
  const seen = 读(file);
  return seen?.[0] ? { pid: seen[0], 死: 过期(file, seen[0], seen[1], 本机) } : null;
};

/** 抢一次：拿到返回 true，锁在活着的进程手里返回 false */
export const 试拿 = (file: string, 本机: string, 回收?: (pid:number|null)=>void): boolean => {
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
    if (!过期(file, seen[0], seen[1], 本机) || !清掉过期(file, seen[0], 本机, 回收)) {
      if (seen[0] !== process.pid) 删(我的主机文件);
      return false;
    }
  }
};

/** 放锁：只删自己拿着的 */
export const 放 = (file: string) => {
  if (持有者(file) === process.pid) 删(file);
  删(主机文件(file, process.pid));
};

/** 拿不到不等：这种短锁里的事，别人正在做就等于这轮做过了。 */
export const 试做 = <T>(file: string, 本机: string, fn: () => T): T | undefined => {
  if (!试拿(file, 本机)) return undefined;
  try {
    return fn();
  } finally {
    放(file);
  }
};
