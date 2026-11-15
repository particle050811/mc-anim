// 锁协议：互斥、死锁回收、空文件宽限、跨主机不回收、排队票的先后。
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { queueAcquire } from './闸.ts';
import { holderPid, reclaimDeadLock, tryAcquire, releaseLock, processStartTime, lockHeld } from './锁.ts';
import { hostSlug, ticketAlive } from './票.ts';

const lockModule = path.join(import.meta.dirname, '锁.ts');
const localHost = os.hostname();

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-锁测试-'));
  file = path.join(dir, '渲染.lock');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

/** 一个已经退出的进程的 pid */
const deadPid = () => spawnSync(process.execPath, ['-e', '0']).pid!;

/** 起一个子进程，ready 行打出来以后返回；它一直挂着直到被杀 */
const spawnLockHolder = (cmd: string, args: string[], env: NodeJS.ProcessEnv = {}) =>
  new Promise<{ pid: number; 输出: string; kill: () => Promise<void> }>((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d: string) => {
      out += d;
      if (out.includes('\n'))
        resolve({
          pid: child.pid!,
          输出: out.trim(),
          kill: () =>
            new Promise((r) => {
              child.once('exit', () => r());
              child.kill('SIGKILL');
            }),
        });
    });
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`子进程提前退出 ${code}：${out}`)));
  });

const spawnNodeLockHolder = (f: string) =>
  spawnLockHolder(process.execPath, ['--input-type=module', '-e', `import {tryAcquire} from ${JSON.stringify(lockModule)}; console.log(tryAcquire(${JSON.stringify(f)}, ${JSON.stringify(localHost)})); setInterval(() => {}, 1000);`]);


describe('锁协议', () => {
  it('拿到以后别的进程拿不到，放了才能拿', async () => {
    const child = await spawnNodeLockHolder(file);
    expect(child.输出).toBe('true');
    expect(holderPid(file)).toBe(child.pid);
    expect(tryAcquire(file, localHost)).toBe(false);
    await child.kill();
    // 持有者死了：回收
    expect(tryAcquire(file, localHost)).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).toBe(`${process.pid}\n`);
    releaseLock(file);
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('锁文件里只有 pid（旧 锁.py 只认纯数字）', () => {
    expect(tryAcquire(file, localHost)).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).toMatch(/^\d+\n$/);
    expect(fs.readFileSync(`${file}.${process.pid}.主机`, 'utf8').trim()).toBe(localHost);
    releaseLock(file);
  });

  it('刚建出来的空文件 10 秒内当有人拿着，过了就回收', () => {
    fs.writeFileSync(file, '');
    expect(tryAcquire(file, localHost)).toBe(false);
    const old = new Date(Date.now() - 11_000);
    fs.utimesSync(file, old, old);
    expect(tryAcquire(file, localHost)).toBe(true);
    releaseLock(file);
  });

  it('持有者在别的主机上：查不了 pid，当它活着', () => {
    const pid = deadPid();
    fs.writeFileSync(file, `${pid}\n`);
    fs.writeFileSync(`${file}.${pid}.主机`, '别的机器\n');
    expect(tryAcquire(file, localHost)).toBe(false);
    fs.writeFileSync(`${file}.${pid}.主机`, `${localHost}\n`);
    expect(tryAcquire(file, localHost)).toBe(true);
    expect(fs.existsSync(`${file}.${pid}.主机`)).toBe(false);
    releaseLock(file);
  });

  it('只放自己拿着的', () => {
    fs.writeFileSync(file, `${deadPid()}\n`);
    releaseLock(file);
    expect(fs.existsSync(file)).toBe(true);
  });
});

describe('pid 被复用', () => {
  const tenMinutesAgo = () => new Date(Date.now() - 600_000);
  it.skipIf(process.platform === 'win32')('活进程启动比锁、票晚很多：算死，回收并回调；票还在更新就不用查', async () => {
    const c = spawn('sleep', ['30']);
    try {
      fs.writeFileSync(file, `${c.pid}\n`);
      fs.utimesSync(file, tenMinutesAgo(), tenMinutesAgo());
      expect(lockHeld(file, localHost)).toBe(false);
      const reclaimed: (number | null)[] = [];
      reclaimDeadLock(file, localHost, p => reclaimed.push(p));
      expect(fs.existsSync(file)).toBe(false);
      expect(reclaimed).toEqual([c.pid]);
      const ticketFile = path.join(dir, '票'), ticket = { 名: '票', 文件: ticketFile, pid: c.pid!, 主机: hostSlug(localHost), 时间: 0, 内容: null };
      fs.writeFileSync(ticketFile, '');
      expect(ticketAlive(ticket, localHost)).toBe(true);
      fs.utimesSync(ticketFile, tenMinutesAgo(), tenMinutesAgo());
      expect(ticketAlive(ticket, localHost)).toBe(false);
    } finally {
      c.kill('SIGKILL');
    }
  });
  const initStartedAt = process.platform === 'win32' ? null : processStartTime(1);
  it.skipIf(!initStartedAt || Date.now() - initStartedAt < 900_000)('进程比锁早（真持有者占了很久）不算换人', () => {
    fs.writeFileSync(file, '1\n');
    fs.utimesSync(file, tenMinutesAgo(), tenMinutesAgo());
    expect(lockHeld(file, localHost)).toBe(true);
    reclaimDeadLock(file, localHost);
    expect(fs.existsSync(file)).toBe(true);
    expect(tryAcquire(file, localHost)).toBe(false);
  });
});

describe('回收门', () => {
  it('有人在门里：这轮不回收也不空转；门走了下一轮回收，什么都不留', () => {
    fs.writeFileSync(file, `${deadPid()}\n`);
    fs.writeFileSync(`${file}.回收`, '');
    const startMs = performance.now();
    expect(tryAcquire(file, localHost)).toBe(false);
    reclaimDeadLock(file, localHost);
    expect(performance.now() - startMs).toBeLessThan(1000);
    expect(fs.existsSync(file)).toBe(true);
    fs.rmSync(`${file}.回收`);
    expect(tryAcquire(file, localHost)).toBe(true);
    releaseLock(file);
    expect(fs.readdirSync(dir)).toEqual([]);
  });
  it('门留下了（回收者死在门里）过 10 秒作废', () => {
    fs.writeFileSync(file, `${deadPid()}\n`);
    fs.writeFileSync(`${file}.回收`, '');
    const old = new Date(Date.now() - 11_000);
    fs.utimesSync(`${file}.回收`, old, old);
    expect(tryAcquire(file, localHost)).toBe(false);
    expect(tryAcquire(file, localHost)).toBe(true);
    releaseLock(file);
  });
  it('多进程紧循环抢回收：从不同时两个持有者', async () => {
    const workers = Array.from({ length: 4 }, () => new Promise<string>((r) => {
      const p = spawn(process.execPath, [path.join(import.meta.dirname, 'fixtures/回收竞争.ts'), file, path.join(dir, '占位'), String(deadPid()), '1500'], { stdio: ['ignore', 'pipe', 'inherit'] });
      let out = '';
      p.stdout.on('data', (d) => { out += d; });
      p.on('close', () => r(out));
    }));
    const results = (await Promise.all(workers)).map((x) => JSON.parse(x) as { acquired: number; overlaps: number; reclaimCount: number });
    expect(results.reduce((n, x) => n + x.reclaimCount, 0)).toBeGreaterThan(0);
    expect(results.reduce((n, x) => n + x.overlaps, 0)).toBe(0);
  }, 15_000);
});

describe('排队票', () => {
  it('按领票先后拿锁，不插队', async () => {
    const lockPath = path.join(dir, '渲染.lock');
    const child = await spawnNodeLockHolder(lockPath);
    const order: string[] = [];
    const firstLock = queueAcquire('渲染', { lockDir: dir, localHost, intervalMs: 30 }).then((handle) => {
      order.push('甲');
      return handle;
    });
    await new Promise((r) => setTimeout(r, 20));
    const secondLock = queueAcquire('渲染', { lockDir: dir, localHost, intervalMs: 30 }).then((handle) => {
      order.push('乙');
      return handle;
    });
    await new Promise((r) => setTimeout(r, 100));
    // 同进程串行领票，避免按 pid 查找时两张活票歧义；顺序仍由下面的断言核对。
    expect(fs.readdirSync(path.join(dir, '渲染.排队'))).toHaveLength(1);
    await child.kill();
    const firstHandle = await firstLock;
    await new Promise((r) => setTimeout(r, 150));
    expect(order).toEqual(['甲']); // 甲拿着，乙在等
    firstHandle.放();
    (await secondLock).放();
    expect(order).toEqual(['甲', '乙']);
    expect(fs.readdirSync(path.join(dir, '渲染.排队'))).toEqual([]);
  });

  it('死掉的票不挡路', async () => {
    const ticketDir = path.join(dir, '渲染.排队');
    fs.mkdirSync(ticketDir);
    fs.writeFileSync(path.join(ticketDir, `${'1'.padStart(15, '0')}-${localHost.replace(/[^A-Za-z0-9._-]/g, '_')}-${deadPid()}`), '');
    const handle = await queueAcquire('渲染', { lockDir: dir, localHost, intervalMs: 30 });
    handle.放();
    expect(fs.readdirSync(ticketDir)).toEqual([]);
  });
});
