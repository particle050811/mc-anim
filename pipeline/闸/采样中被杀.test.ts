import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readMachineSnapshot, readMachineSnapshotParallel, type MachineSnapshot } from './机器.ts';
import { passRenderGate, gateRecordKilled, type GateEnv } from './闸.ts';
import { resolveSchedulerEnv } from './任务.ts';
import { readCaller } from './发起者.ts';
import { listTickets } from './票.ts';
vi.mock('./机器.ts', async (actual) => ({ ...await actual<typeof import('./机器.ts')>(), readMachineSnapshot: vi.fn(), readMachineSnapshotParallel: vi.fn() }));
const fakeMachine = (): MachineSnapshot => ({ 负载: 1, 核: 10, 闸: 80, 压力: 1, free: 1e9, 压缩: 0, swap: 0, swapOut: 0, GPU: 0, 热: 0, 芯片最高温: 50, 发热等级: 0, disk: 1e11, orphans: 0, psOutput: '' });
let dir: string;
beforeEach(() => { vi.resetAllMocks(); dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-采样中被杀-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });
it('首轮采样途中被杀：票已删', async () => {
  const e: GateEnv = { ...resolveSchedulerEnv({ lockDir: dir, caller: readCaller({}, [], dir, false) }), memFloor: 30, readMemory: () => ({ 总: 100, free: 80, freePercent: 80, swapTotal: 0, swapUsed: 0 }), readPressure: () => 1, load1Min: () => 0, coreCount: () => 10, sleep: vi.fn(async () => {}), clearOrphans: () => [], readMachine: readMachineSnapshot };
  vi.mocked(readMachineSnapshot).mockReturnValue(fakeMachine());
  let release!: () => void, reachedSampling!: () => void;
  const sampleStarted = new Promise<void>(r => { reachedSampling = r; });
  vi.mocked(readMachineSnapshotParallel).mockImplementation(() => new Promise<MachineSnapshot>(r => {
    release = () => r(fakeMachine());
    reachedSampling();
  }));
  const q = path.join(dir, '渲染.排队');
  const runPromise = passRenderGate(async () => {}, () => {}, e, { 种: 'render' });
  await sampleStarted;
  try {
    expect(listTickets(q)).toHaveLength(1);
    gateRecordKilled('SIGTERM');
    expect(listTickets(q)).toEqual([]);
    expect(fs.existsSync(path.join(dir, '渲染.lock'))).toBe(false);
  } finally {
    release();
    await runPromise;
  }
});
