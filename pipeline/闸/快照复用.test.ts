import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readMachineSnapshot, readMachineSnapshotParallel, type MachineSnapshot } from './机器.ts';
import { passRenderGate, passGate, type GateEnv } from './闸.ts';
import { resolveSchedulerEnv } from './任务.ts';
import { readSchedulerEvents } from './调度日志.ts';
import { listTickets, claimTicket, setOrder } from './票.ts';
import { readCaller } from './发起者.ts';
import { tryAcquire, releaseLock } from './锁.ts';

vi.mock('./机器.ts', async (actual) => ({ ...await actual<typeof import('./机器.ts')>(), readMachineSnapshot: vi.fn(), readMachineSnapshotParallel: vi.fn() }));
const fakeMachine = (gate = 80, thermalLevel = 0): MachineSnapshot => ({ 负载: 1, 核: 10, 闸: gate, 压力: 1, free: 1e9, 压缩: 0, swap: 0, swapOut: 0, GPU: 0, 热: thermalLevel, 芯片最高温: 83.2, 发热等级: thermalLevel, disk: 1e11, orphans: 0, psOutput: '不进日志' });
const makeMemory = (freePercent: number) => ({ 总: 100, free: freePercent, freePercent, swapTotal: 0, swapUsed: 0 });
let dir: string;
let e: GateEnv;
beforeEach(() => {
  vi.resetAllMocks();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-快照复用-'));
  e = { ...resolveSchedulerEnv({ lockDir: dir, caller: readCaller({}, [], dir, false) }), memFloor: 30, readMemory: () => makeMemory(80), readPressure: () => 1, load1Min: () => 0, coreCount: () => 10, sleep: vi.fn(async () => {}), clearOrphans: () => [], readMachine: readMachineSnapshot };
  vi.mocked(readMachineSnapshot).mockReturnValue(fakeMachine(45));
  vi.mocked(readMachineSnapshotParallel).mockResolvedValue(fakeMachine());
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });
const readLogs = () => readSchedulerEvents(e.logDir);

it('无竞争：领票、监测和拿锁共用一次并行观测，不睡；放锁另读新快照', async () => {
  vi.mocked(readMachineSnapshotParallel).mockResolvedValue(fakeMachine(80, 3));
  await passRenderGate(async () => {
    expect(readMachineSnapshotParallel).toHaveBeenCalledOnce();
    expect(readMachineSnapshot).not.toHaveBeenCalled();
    expect(e.sleep).not.toHaveBeenCalled();
  }, () => {}, e, { 种: 'render' });
  expect(readMachineSnapshot).toHaveBeenCalledOnce();
  const rows = readLogs();
  for (const eventName of ['领票', '拿锁']) {
    const r = rows.find(x => x.事 === eventName)!;
    expect(r.机).toMatchObject({ 闸: 80, 芯片最高温: 83.2, 发热等级: 3 });
    expect(r.队).toMatchObject({ queueDepth: 0, ahead: [] });
    expect(r.机).not.toHaveProperty('进程');
  }
  expect(rows.find(x => x.事 === '告警' && x.类 === '发热')).toBeDefined();
  expect(rows.find(x => x.事 === '拿锁')).toMatchObject({ lockWaitSec: expect.any(Number), waitMemorySec: 0, overtakenCount: 0 });
  expect(rows.find(x => x.事 === '放锁')!.机).toMatchObject({ 闸: 45, 发热等级: 0 });
});

it('观察快照不作准入：实时内存和压力各自挡住，监测到点才采样，拿锁缺快照时同步现读', async () => {
  let now = Date.now(), loopCount = 0;
  vi.mocked(readMachineSnapshotParallel).mockImplementation(async () => fakeMachine(80 - loopCount));
  e.nowMs = () => now;
  e.readMemory = () => makeMemory(loopCount < 4 ? 29 : 80);
  e.readPressure = () => loopCount >= 4 && loopCount < 8 ? 4 : 1;
  e.sleep = vi.fn(async () => { now += 1000; loopCount++; if (loopCount > 8) throw Error('准入未恢复'); });
  await passRenderGate(async () => { expect(loopCount).toBe(8); }, () => {}, e, { 种: 'render' });
  expect(readMachineSnapshotParallel).toHaveBeenCalledTimes(1 + Math.floor(8 / 3));
  expect(e.sleep).toHaveBeenCalledTimes(8);
  expect(readLogs().find(x => x.事 === '领票')!.机).toMatchObject({ 闸: 80 });
  expect(readLogs().find(x => x.事 === '拿锁')).toMatchObject({ 机: { 闸: 45 }, waitMemorySec: 8 });
});

it.each(['锁被占', '等内存', '放行间隔'] as const)('%s 60 轮：整机采样约每三轮一次，不随锁空或准入状态加采', async scenario => {
  let now = Math.floor(Date.now() / 1000) * 1000, loopCount = 0;
  const lockPath = path.join(dir, '渲染.lock');
  e.nowMs = () => now;
  if (scenario === '锁被占') expect(tryAcquire(lockPath, e.localHost)).toBe(true);
  if (scenario === '等内存') e.readMemory = () => makeMemory(loopCount < 60 ? 29 : 80);
  if (scenario === '放行间隔') {
    fs.writeFileSync(path.join(dir, '上次放行'), String(now / 1000));
    fs.writeFileSync(path.join(dir, '上次放行.信息.json'), JSON.stringify({ 秒: now / 1000, pid: process.pid }));
  }
  e.sleep = vi.fn(async () => {
    now += 1000;
    if (++loopCount > 60) throw Error('等待未结束');
    if (scenario === '锁被占' && loopCount === 60) releaseLock(lockPath);
  });
  const passGateFn = scenario === '放行间隔' ? passGate : passRenderGate;
  await passGateFn(async () => { expect(loopCount).toBe(60); }, () => {}, e, { 种: '测试' });
  expect(e.sleep).toHaveBeenCalledTimes(60);
  expect(readMachineSnapshotParallel).toHaveBeenCalledTimes(21);
  // 只有等内存的起止另读整机快照；另外一次是放锁。第 60 轮拿锁复用到点快照。
  expect(readMachineSnapshot).toHaveBeenCalledTimes(scenario === '等内存' ? 3 : 1);
  expect(readLogs().find(x => x.事 === '拿锁')).toMatchObject({ 机: { 闸: 80 }, lockWaitSec: 60, waitMemorySec: scenario === '等内存' ? 60 : 0 });
});

it('放行闸准入不读观测快照：实时内存不足或压力 4 都必须等内存', async () => {
  let now = Date.now(), loopCount = 0;
  e.nowMs = () => now;
  e.readMemory = () => makeMemory(loopCount ? 80 : 29);
  e.readPressure = () => loopCount === 1 ? 4 : 1;
  e.sleep = vi.fn(async () => { now += 3100; if (++loopCount > 2) throw Error('准入未恢复'); });
  await passGate(async () => { expect(loopCount).toBe(2); }, () => {}, e, { 种: 'voice' });
  expect(readMachineSnapshotParallel).toHaveBeenCalledTimes(3);
  expect(readLogs().find(x => x.事 === '放行等起')).toMatchObject({ stuckOn: '内存', 机: { 闸: 29, 压力: 1 } });
  expect(readLogs().find(x => x.事 === '拿锁')).toMatchObject({ waitMemorySec: 6.2 });
});

it('异步采样期间票被改到前面：采完重读队序，不拿旧队位抢锁', async () => {
  let now = Date.now();
  e.nowMs = () => now;
  let frontTicketFile: string | undefined;
  vi.mocked(readMachineSnapshotParallel).mockImplementation(async () => {
    await Promise.resolve();
    if (!frontTicketFile) {
      const ticketDir = path.join(dir, '渲染.排队'), ticket = listTickets(ticketDir)[0]!;
      const t = claimTicket(ticketDir, e.localHost, { 任务: '新来的', 主机: e.localHost, 起: Date.now(), 心跳: Date.now(), 发起: e.caller, 声明: {} }, Date.now());
      frontTicketFile = setOrder(t, String(ticket.时间 - 1)).文件;
    }
    return fakeMachine();
  });
  e.sleep = vi.fn(async () => {
    expect(fs.existsSync(path.join(dir, '渲染.lock'))).toBe(false);
    fs.unlinkSync(frontTicketFile!);
    now += 3100;
  });
  await passRenderGate(async () => { expect(e.sleep).toHaveBeenCalledOnce(); }, () => {}, e, { 种: 'render' });
  expect(readMachineSnapshotParallel).toHaveBeenCalledTimes(2);
  expect(readLogs().find(x => x.事 === '领票')!.队).toMatchObject({ queueDepth: 0, ahead: [] });
});

it('并行探针失败不影响拿锁和收尾，下一张票会重新读', async () => {
  vi.mocked(readMachineSnapshotParallel).mockRejectedValueOnce(Error('读不到')).mockResolvedValue(fakeMachine());
  for (let i = 0; i < 2; i++) {
    expect(await passRenderGate(async () => '成', () => {}, e, { 种: 'render' })).toBe('成');
    expect(fs.existsSync(path.join(dir, '渲染.lock'))).toBe(false);
    expect(listTickets(path.join(dir, '渲染.排队'))).toEqual([]);
  }
  expect(readMachineSnapshotParallel).toHaveBeenCalledTimes(2);
  expect(readLogs().filter(x => x.事 === '拿锁')[1]!.机).toMatchObject({ 闸: 80 });
});
