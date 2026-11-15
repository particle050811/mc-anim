// 资源闸的两条规则（假时钟、假内存、假负载，不真等）：
//   渲染闸：拿着「渲染」锁跑 fn，只等内存够、不看负载；
//   放行闸：等离上次放行满 60 秒、1 分钟负载低于核数 × 0.8、空闲内存不低于下限，记下放行时间就放锁，fn 不占锁。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MemReading } from '../环境/资源.ts';
import { lazyPassGate, ancestorLockEnv, passGate, passRenderGate, type GateEnv } from './闸.ts';
import { holderPid } from './锁.ts';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-闸测试-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const memoryReading = (freePercent: number): MemReading => ({ 总: 100, free: freePercent, freePercent, swapTotal: 0, swapUsed: 0 });

/** 假环境：睡就是把时钟往前拨；读数按序列给，给完了停在最后一个 */
const fakeEnv = (o: { memory?: (MemReading | null)[]; 负载?: (number | null)[]; 起?: number } = {}) => {
  let now = o.起 ?? 1_000_000_000_000;
  const sleepLog: number[] = [];
  const sequence = <T>(xs: T[], fallback: T) => {
    let i = 0;
    return () => (xs.length ? xs[Math.min(i++, xs.length - 1)]! : fallback);
  };
  const env: Partial<GateEnv> = {
    lockDir: dir,
    localHost: os.hostname(),
    memFloor: 20,
    readPressure: () => 1,
    readMemory: sequence(o.memory ?? [], memoryReading(80) as MemReading | null),
    load1Min: sequence(o.负载 ?? [], 0 as number | null),
    coreCount: () => 10,
    nowMs: () => now,
    sleep: async (ms) => {
      sleepLog.push(ms);
      now += ms;
      await new Promise((r) => setTimeout(r, 0));
    },
    queueIntervalMs: 5,
  };
  return { 环境: env, sleepLog, now: () => now };
};
const noPrompt = () => {};
const lastPassSec = () => Number(fs.readFileSync(path.join(dir, '上次放行'), 'utf8').trim());

describe('放行闸', () => {
  it('离上次放行不满 60 秒就等，满了才放；放行时间写成现在', async () => {
    const e = fakeEnv();e.环境.queueIntervalMs=10_000;
    fs.writeFileSync(path.join(dir, '上次放行'), `${Math.floor(e.now() / 1000) - 30}\n`);
    const hints: string[] = [];
    expect(await passGate(async () => 'ok', (s) => hints.push(s), e.环境)).toBe('ok');
    expect(e.sleepLog.reduce((a,b)=>a+b,0)).toBe(30_000);
    expect(lastPassSec()).toBe(Math.floor(e.now() / 1000));
    expect(hints.filter((s) => s.startsWith('等资源'))).toHaveLength(1);
  });

  it('1 分钟负载不低于核数 × 0.8 就等（10 核上限 8）', async () => {
    const e = fakeEnv({ 负载: [9, 8, 7.9] });
    await passGate(async () => {}, noPrompt, e.环境);
    expect(e.sleepLog).toHaveLength(2);
  });

  it('空闲内存低于下限就等；读不到负载（Windows）、读不到内存都不卡', async () => {
    const e = fakeEnv({ memory: [memoryReading(10), memoryReading(19), memoryReading(20)], 负载: [null] });
    await passGate(async () => {}, noPrompt, e.环境);
    expect(e.sleepLog).toHaveLength(2);
    const f = fakeEnv({ memory: [null], 负载: [null], 起: e.now() + 60_000 });
    await passGate(async () => {}, noPrompt, f.环境);
    expect(f.sleepLog).toHaveLength(0);
  });

  it('fn 跑的时候已经放了锁（放行锁只管排队和记时间）', async () => {
    const e = fakeEnv();
    await passGate(async () => {
      expect(fs.existsSync(path.join(dir, '放行.lock'))).toBe(false);
    }, noPrompt, e.环境);
  });

  it('懒放行闸：不调用就不过闸，调用几次都只过一次', async () => {
    let passed = 0;
    const passGateFn = async (fn: () => Promise<void>) => {
      passed++;
      await fn();
    };
    lazyPassGate(passGateFn);
    expect(passed).toBe(0);
    const lazyGate = lazyPassGate(passGateFn);
    await Promise.all([lazyGate(), lazyGate()]);
    await lazyGate();
    expect(passed).toBe(1);
  });
});

describe('渲染闸', () => {
  it('拿着渲染锁跑 fn、子进程能看出祖先持锁；跑完放锁，fn 抛错也放', async () => {
    const e = fakeEnv();
    const lockPath = path.join(dir, '渲染.lock');
    await passRenderGate(async () => {
      expect(holderPid(lockPath)).toBe(process.pid);
      expect(process.env[ancestorLockEnv]).toBe(String(process.pid));
    }, noPrompt, e.环境);
    expect(fs.existsSync(lockPath)).toBe(false);
    expect(process.env[ancestorLockEnv]).toBeUndefined();
    await expect(passRenderGate(async () => { throw new Error('渲坏了'); }, noPrompt, e.环境)).rejects.toThrow('渲坏了');
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('只等内存，不看负载、不看上次放行', async () => {
    const e = fakeEnv({ 负载: [100], memory: [memoryReading(5), memoryReading(15), memoryReading(25)] });
    fs.writeFileSync(path.join(dir, '上次放行'), `${Math.floor(e.now() / 1000)}\n`);
    const hints: string[] = [];
    await passRenderGate(async () => {}, (s) => hints.push(s), e.环境);
    expect(e.sleepLog).toEqual([5, 5]);
    expect(hints.some((s) => s.startsWith('渲染等内存'))).toBe(true);
    expect(hints.at(-1)).toMatch(/^放行渲染/);
  });

  it('两个渲染不同时跑：后来的等前一个放锁', async () => {
    const e = fakeEnv();
    const callOrder: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = passRenderGate(() => new Promise<void>((r) => { callOrder.push('甲开始'); releaseFirst = () => { callOrder.push('甲结束'); r(); }; }), noPrompt, e.环境);
    await new Promise((r) => setTimeout(r, 30));
    const secondGate = passRenderGate(async () => { callOrder.push('乙开始'); }, noPrompt, e.环境);
    await new Promise((r) => setTimeout(r, 30));
    expect(callOrder).toEqual(['甲开始']);
    releaseFirst();
    await Promise.all([firstGate, secondGate]);
    expect(callOrder).toEqual(['甲开始', '甲结束', '乙开始']);
  });
});
