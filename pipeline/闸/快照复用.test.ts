import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { 读机器快照, 读机器快照并行, type 机器快照 } from './机器.ts';
import { 过渲染闸, type 闸环境 } from './闸.ts';
import { 取调度环境 } from './任务.ts';
import { 读调度 } from './调度日志.ts';
import { 列票, 领票, 改序 } from './票.ts';
import { 读发起者 } from './发起者.ts';

vi.mock('./机器.ts', async (原) => ({ ...await 原<typeof import('./机器.ts')>(), 读机器快照: vi.fn(), 读机器快照并行: vi.fn() }));
const 机 = (闸 = 80, 发热等级 = 0): 机器快照 => ({ 负载: 1, 核: 10, 闸, 压力: 1, free: 1e9, 压缩: 0, swap: 0, 换出: 0, GPU: 0, 热: 发热等级, 芯片最高温: 83.2, 发热等级, 盘: 1e11, 孤儿: 0, 进程: '不进日志' });
const 内存 = (空闲百分比: number) => ({ 总: 100, 空闲: 空闲百分比, 空闲百分比, 交换区总: 0, 交换区已用: 0 });
let dir: string;
let e: 闸环境;
beforeEach(() => {
  vi.resetAllMocks();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-快照复用-'));
  e = { ...取调度环境({ 锁目录: dir, 发起者: 读发起者({}, [], dir, false) }), 内存下限: 30, 读内存: () => 内存(80), 读压力: () => 1, 一分钟负载: () => 0, 核数: () => 10, 睡: vi.fn(async () => {}), 清孤儿: () => [], 读机器: 读机器快照 };
  vi.mocked(读机器快照).mockReturnValue(机(45));
  vi.mocked(读机器快照并行).mockResolvedValue(机());
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });
const 日志 = () => 读调度(e.日志目录);

it('无竞争：领票、监测和拿锁共用一次并行观测，不睡；放锁另读新快照', async () => {
  vi.mocked(读机器快照并行).mockResolvedValue(机(80, 3));
  await 过渲染闸(async () => {
    expect(读机器快照并行).toHaveBeenCalledOnce();
    expect(读机器快照).not.toHaveBeenCalled();
    expect(e.睡).not.toHaveBeenCalled();
  }, () => {}, e, { 种: 'render' });
  expect(读机器快照).toHaveBeenCalledOnce();
  const rows = 日志();
  for (const 事 of ['领票', '拿锁']) {
    const r = rows.find(x => x.事 === 事)!;
    expect(r.机).toMatchObject({ 闸: 80, 芯片最高温: 83.2, 发热等级: 3 });
    expect(r.队).toMatchObject({ 深度: 0, 前面: [] });
    expect(r.机).not.toHaveProperty('进程');
  }
  expect(rows.find(x => x.事 === '告警' && x.类 === '发热')).toBeDefined();
  expect(rows.find(x => x.事 === '拿锁')).toMatchObject({ 等锁秒: expect.any(Number), 等内存秒: 0, 被越次数: 0 });
  expect(rows.find(x => x.事 === '放锁')!.机).toMatchObject({ 闸: 45, 发热等级: 0 });
});

it('观察快照不作准入：仍读实时内存和压力，每次睡醒重新采样', async () => {
  let now = Date.now(), 轮 = 0;
  vi.mocked(读机器快照并行).mockImplementation(async () => 机(80 - 轮));
  e.现在毫秒 = () => now;
  e.读内存 = () => 内存(轮 ? 80 : 29);
  e.读压力 = () => 轮 === 1 ? 4 : 1;
  e.睡 = vi.fn(async () => { now += 1000; 轮++; if (轮 > 2) throw Error('准入未恢复'); });
  await 过渲染闸(async () => { expect(轮).toBe(2); }, () => {}, e, { 种: 'render' });
  expect(读机器快照并行).toHaveBeenCalledTimes(3);
  expect(e.睡).toHaveBeenCalledTimes(2);
  expect(日志().find(x => x.事 === '领票')!.机).toMatchObject({ 闸: 80 });
  expect(日志().find(x => x.事 === '拿锁')).toMatchObject({ 机: { 闸: 78 }, 等内存秒: 2 });
});

it('异步采样期间票被改到前面：采完重读队序，不拿旧队位抢锁', async () => {
  let 前票: string | undefined;
  vi.mocked(读机器快照并行).mockImplementation(async () => {
    await Promise.resolve();
    if (!前票) {
      const dir票 = path.join(dir, '渲染.排队'), 我 = 列票(dir票)[0]!;
      const t = 领票(dir票, e.本机, { 任务: '新来的', 主机: e.本机, 起: Date.now(), 心跳: Date.now(), 发起: e.发起者, 声明: {} }, Date.now());
      前票 = 改序(t, String(我.时间 - 1)).文件;
    }
    return 机();
  });
  e.睡 = vi.fn(async () => {
    expect(fs.existsSync(path.join(dir, '渲染.lock'))).toBe(false);
    fs.unlinkSync(前票!);
  });
  await 过渲染闸(async () => { expect(e.睡).toHaveBeenCalledOnce(); }, () => {}, e, { 种: 'render' });
  expect(读机器快照并行).toHaveBeenCalledTimes(2);
});

it('并行探针失败不影响拿锁和收尾，下一张票会重新读', async () => {
  vi.mocked(读机器快照并行).mockRejectedValueOnce(Error('读不到')).mockResolvedValue(机());
  for (let i = 0; i < 2; i++) {
    expect(await 过渲染闸(async () => '成', () => {}, e, { 种: 'render' })).toBe('成');
    expect(fs.existsSync(path.join(dir, '渲染.lock'))).toBe(false);
    expect(列票(path.join(dir, '渲染.排队'))).toEqual([]);
  }
  expect(读机器快照并行).toHaveBeenCalledTimes(2);
  expect(日志().filter(x => x.事 === '拿锁')[1]!.机).toMatchObject({ 闸: 80 });
});
