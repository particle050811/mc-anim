// 资源闸的两条规则（假时钟、假内存、假负载，不真等）：
//   渲染闸：拿着「渲染」锁跑 fn，只等内存够、不看负载；
//   放行闸：等离上次放行满 60 秒、1 分钟负载低于核数 × 0.8、空闲内存不低于下限，记下放行时间就放锁，fn 不占锁。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { 内存读数 } from '../环境/资源.ts';
import { 懒放行闸, 祖先持锁变量, 过放行闸, 过渲染闸, type 闸环境 } from './闸.ts';
import { 持有者 } from './锁.ts';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-闸测试-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const 内存 = (空闲百分比: number): 内存读数 => ({ 总: 100, 空闲: 空闲百分比, 空闲百分比, 交换区总: 0, 交换区已用: 0 });

/** 假环境：睡就是把时钟往前拨；读数按序列给，给完了停在最后一个 */
const 假环境 = (o: { 内存?: (内存读数 | null)[]; 负载?: (number | null)[]; 起?: number } = {}) => {
  let 现在 = o.起 ?? 1_000_000_000_000;
  const 睡过: number[] = [];
  const 序列 = <T>(xs: T[], 缺省: T) => {
    let i = 0;
    return () => (xs.length ? xs[Math.min(i++, xs.length - 1)]! : 缺省);
  };
  const 环境: Partial<闸环境> = {
    锁目录: dir,
    本机: os.hostname(),
    内存下限: 20,
    读内存: 序列(o.内存 ?? [], 内存(80) as 内存读数 | null),
    一分钟负载: 序列(o.负载 ?? [], 0 as number | null),
    核数: () => 10,
    现在毫秒: () => 现在,
    睡: async (ms) => {
      睡过.push(ms);
      现在 += ms;
    },
    排队间隔毫秒: 5,
  };
  return { 环境, 睡过, 现在: () => 现在 };
};
const 不提示 = () => {};
const 上次放行 = () => Number(fs.readFileSync(path.join(dir, '上次放行'), 'utf8').trim());

describe('放行闸', () => {
  it('离上次放行不满 60 秒就等，满了才放；放行时间写成现在', async () => {
    const e = 假环境();
    fs.writeFileSync(path.join(dir, '上次放行'), `${Math.floor(e.现在() / 1000) - 30}\n`);
    const 提示: string[] = [];
    expect(await 过放行闸(async () => 'ok', (s) => 提示.push(s), e.环境)).toBe('ok');
    expect(e.睡过).toEqual([10_000, 10_000, 10_000]);
    expect(上次放行()).toBe(Math.floor(e.现在() / 1000));
    expect(提示.filter((s) => s.startsWith('等资源'))).toHaveLength(1);
  });

  it('1 分钟负载不低于核数 × 0.8 就等（10 核上限 8）', async () => {
    const e = 假环境({ 负载: [9, 8, 7.9] });
    await 过放行闸(async () => {}, 不提示, e.环境);
    expect(e.睡过).toHaveLength(2);
  });

  it('空闲内存低于下限就等；读不到负载（Windows）、读不到内存都不卡', async () => {
    const e = 假环境({ 内存: [内存(10), 内存(19), 内存(20)], 负载: [null] });
    await 过放行闸(async () => {}, 不提示, e.环境);
    expect(e.睡过).toHaveLength(2);
    const f = 假环境({ 内存: [null], 负载: [null], 起: e.现在() + 60_000 });
    await 过放行闸(async () => {}, 不提示, f.环境);
    expect(f.睡过).toHaveLength(0);
  });

  it('fn 跑的时候已经放了锁（放行锁只管排队和记时间）', async () => {
    const e = 假环境();
    await 过放行闸(async () => {
      expect(fs.existsSync(path.join(dir, '放行.lock'))).toBe(false);
    }, 不提示, e.环境);
  });

  it('懒放行闸：不调用就不过闸，调用几次都只过一次', async () => {
    let 过了 = 0;
    const 过闸 = async (fn: () => Promise<void>) => {
      过了++;
      await fn();
    };
    懒放行闸(过闸);
    expect(过了).toBe(0);
    const 等 = 懒放行闸(过闸);
    await Promise.all([等(), 等()]);
    await 等();
    expect(过了).toBe(1);
  });
});

describe('渲染闸', () => {
  it('拿着渲染锁跑 fn、子进程能看出祖先持锁；跑完放锁，fn 抛错也放', async () => {
    const e = 假环境();
    const 锁 = path.join(dir, '渲染.lock');
    await 过渲染闸(async () => {
      expect(持有者(锁)).toBe(process.pid);
      expect(process.env[祖先持锁变量]).toBe(String(process.pid));
    }, 不提示, e.环境);
    expect(fs.existsSync(锁)).toBe(false);
    expect(process.env[祖先持锁变量]).toBeUndefined();
    await expect(过渲染闸(async () => { throw new Error('渲坏了'); }, 不提示, e.环境)).rejects.toThrow('渲坏了');
    expect(fs.existsSync(锁)).toBe(false);
  });

  it('只等内存，不看负载、不看上次放行', async () => {
    const e = 假环境({ 负载: [100], 内存: [内存(5), 内存(15), 内存(25)] });
    fs.writeFileSync(path.join(dir, '上次放行'), `${Math.floor(e.现在() / 1000)}\n`);
    const 提示: string[] = [];
    await 过渲染闸(async () => {}, (s) => 提示.push(s), e.环境);
    expect(e.睡过).toEqual([10_000, 10_000]);
    expect(提示.some((s) => s.startsWith('渲染等内存'))).toBe(true);
    expect(提示.at(-1)).toMatch(/^放行渲染/);
  });

  it('两个渲染不同时跑：后来的等前一个放锁', async () => {
    const e = 假环境();
    const 次序: string[] = [];
    let 放甲!: () => void;
    const 甲 = 过渲染闸(() => new Promise<void>((r) => { 次序.push('甲开始'); 放甲 = () => { 次序.push('甲结束'); r(); }; }), 不提示, e.环境);
    await new Promise((r) => setTimeout(r, 30));
    const 乙 = 过渲染闸(async () => { 次序.push('乙开始'); }, 不提示, e.环境);
    await new Promise((r) => setTimeout(r, 30));
    expect(次序).toEqual(['甲开始']);
    放甲();
    await Promise.all([甲, 乙]);
    expect(次序).toEqual(['甲开始', '甲结束', '乙开始']);
  });
});
