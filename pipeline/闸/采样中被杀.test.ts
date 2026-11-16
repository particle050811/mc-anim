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
const fakeMachine = (): MachineSnapshot => ({ load: 1, cores: 10, gate: 80, pressure: 1, free: 1e9, compressed: 0, swap: 0, swapOut: 0, GPU: 0, thermal: 0, chipMaxTemp: 50, thermalLevel: 0, disk: 1e11, orphans: 0, processes: '' });
let dir: string;
beforeEach(() => { vi.resetAllMocks(); dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-采样中被杀-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });
it('首轮采样途中被杀：票已删', async () => {
  const e: GateEnv = { ...resolveSchedulerEnv({ lockDir: dir, caller: readCaller({}, [], dir, false) }), memFloor: 30, readMemory: () => ({ grandTotal: 100, free: 80, freePercent: 80, swapTotal: 0, swapUsed: 0 }), readPressure: () => 1, load1Min: () => 0, coreCount: () => 10, sleep: vi.fn(async () => {}), clearOrphans: () => [], readMachine: readMachineSnapshot };
  vi.mocked(readMachineSnapshot).mockReturnValue(fakeMachine());
  let release!: () => void, reachedSampling!: () => void;
  const sampleStarted = new Promise<void>(r => { reachedSampling = r; });
  vi.mocked(readMachineSnapshotParallel).mockImplementation(() => new Promise<MachineSnapshot>(r => {
    release = () => r(fakeMachine());
    reachedSampling();
  }));
  const q = path.join(dir, '渲染.排队');
  const runPromise = passRenderGate(async () => {}, () => {}, e, { kind: 'render' });
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
