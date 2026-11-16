import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readMachineSnapshot, readMachineSnapshotParallel, type MachineSnapshot } from './机器.ts';
import { oneLineStatus, renderView, readState, type SchedulerState } from './看.ts';
import { judgeAlerts, monitorRound } from './告警.ts';
import { watchSched } from './盯.ts';
import { resolveSchedulerEnv } from './任务.ts';
import { readCaller } from './发起者.ts';
import { passRenderGate } from './闸.ts';
import { readSchedulerEvents } from './调度日志.ts';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-thermal-gate-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
const fakeMachine = (thermalLevel: number | null = 0): MachineSnapshot => ({ load: 1, cores: 10, gate: 80, pressure: 1, free: 1e9, compressed: 0, swap: 0, swapOut: 0, GPU: 0, thermal: thermalLevel, chipMaxTemp: 83.2, thermalLevel: thermalLevel, disk: 1e11, orphans: 0, processes: '' });
const stateForLevel = (thermalLevel: number | null): SchedulerState => ({ timestamp: 0, machine: fakeMachine(thermalLevel), ticket: [], lockHolders: [], 在跑: [], 最近: [] });

it('一行和完整视图展示芯温和零级，缺读数不显示，旧快照仍能读', () => {
  for (const formatter of [oneLineStatus, renderView]) {
    expect(formatter(stateForLevel(0))).toContain('芯温83.2°C 热0');
    const s = stateForLevel(null); s.machine.chipMaxTemp = null;
    expect(formatter(s)).not.toMatch(/芯温|热/);
    delete s.machine.chipMaxTemp; delete s.machine.thermalLevel;
    expect(formatter(s)).not.toMatch(/芯温|热/);
  }
  expect(JSON.parse(JSON.stringify(stateForLevel(2))).machine).toMatchObject({ chipMaxTemp: 83.2, thermalLevel: 2 });
});

it.each([null, 0, 1, 2, 3, 4])('发热等级 %s：仅 ≥3 告警，温度高本身不告警', thermalLevel => {
  const s = stateForLevel(thermalLevel); s.machine.chipMaxTemp = 110;
  const alerts = judgeAlerts(s, 0).filter(x => x.type === '发热');
  expect(alerts).toHaveLength(thermalLevel !== null && thermalLevel >= 3 ? 1 : 0);
  if (alerts.length) expect(alerts[0]).toMatchObject({ subject: '机器', threshold: 3, value: thermalLevel });
});

it('2 不叫醒，3 叫醒一次，重挂及升到 4 仍按现有公式去重', async () => {
  let now = 0, thermalLevel = 2;
  // 没有会话的 盯 什么都报，测的只是阈值和去重，不随跑测试的会话变
  const e = resolveSchedulerEnv({ lockDir: dir, nowMs: () => now, caller: readCaller({}, [], dir, false) }), outputLines: string[] = [];
  const opts = { maxSec: 10, parentAlive: () => true, output: (s: string) => outputLines.push(s), 读: () => ({ ...stateForLevel(thermalLevel), timestamp: now }), sleep: async (ms: number) => { now += ms; } };
  expect(await watchSched(e, opts)).toBe(124);
  expect(outputLines).toHaveLength(0);
  thermalLevel = 3;
  expect(await watchSched(e, opts)).toBe(0);
  expect(outputLines[0]).toContain('发热 机器');
  expect(await watchSched(e, opts)).toBe(124);
  expect(outputLines).toHaveLength(1);
  thermalLevel = 4;
  expect(await watchSched(e, opts)).toBe(124);
  expect(outputLines).toHaveLength(1);
  expect(readSchedulerEvents(e.logDir).filter(x => x.event === '告警')).toHaveLength(1);
});

it.each([180, 300, 600])('五次独立渲染间隔 %s 秒，每次升到 2 再回落都不叫醒', async intervalSec => {
  let now = 0, startMs = 0;
  const e = resolveSchedulerEnv({ lockDir: dir, nowMs: () => now }), outputLines: string[] = [];
  const opts = { maxSec: 600, parentAlive: () => true, output: (s: string) => outputLines.push(s), 读: () => ({ ...stateForLevel(now - startMs < 186_000 ? 0 : 2), timestamp: now }), sleep: async (ms: number) => { now += ms; } };
  for (let iteration = 0; iteration < 5; iteration++) {
    startMs = now;
    expect(await watchSched(e, opts)).toBe(124);
    now = startMs + 626_000;
    monitorRound(e, { ...stateForLevel(1), timestamp: now });
    now = startMs + 665_000;
    monitorRound(e, { ...stateForLevel(0), timestamp: now });
    now = startMs + (600 + intervalSec) * 1000;
  }
  expect(outputLines).toHaveLength(0);
  expect(readSchedulerEvents(e.logDir).filter(x => x.event === '告警')).toHaveLength(0);
});

it('恒为 2，采样中断 6 分钟再挂盯也不叫醒', async () => {
  let now = 0;
  const e = resolveSchedulerEnv({ lockDir: dir, nowMs: () => now }), outputLines: string[] = [];
  const opts = { maxSec: 10, parentAlive: () => true, output: (s: string) => outputLines.push(s), 读: () => ({ ...stateForLevel(2), timestamp: now }), sleep: async (ms: number) => { now += ms; } };
  expect(await watchSched(e, opts)).toBe(124);
  now += 360_000;
  expect(await watchSched(e, opts)).toBe(124);
  expect(outputLines).toHaveLength(0);
  expect(readSchedulerEvents(e.logDir).filter(x => x.event === '告警')).toHaveLength(0);
});

it('高温不挡渲染，领票拿锁放锁都留下两项机器读数', async () => {
  const m = fakeMachine(4), fn = vi.fn(async () => '已渲');
  const e = resolveSchedulerEnv({ lockDir: dir });
  expect(await passRenderGate(fn, () => {}, { ...e, readMachine: () => m, readMemory: () => null, readPressure: () => 1, load1Min: () => 0, coreCount: () => 10 }, { kind: 'render' })).toBe('已渲');
  expect(fn).toHaveBeenCalledOnce();
  const rows = readSchedulerEvents(e.logDir).filter(x => ['领票', '拿锁', '放锁'].includes(x.event));
  expect(rows).toHaveLength(3);
  for (const row of rows) expect(row.machine).toMatchObject({ chipMaxTemp: 83.2, thermalLevel: 4 });
});

it('把温度读数函数换成失败，同步及异步调度和渲染闸照常', async () => {
  const throwing = () => { throw new Error('读不到传感器'); };
  const m = readMachineSnapshot(throwing);
  expect(m).toMatchObject({ chipMaxTemp: null, thermalLevel: null });
  const p = await readMachineSnapshotParallel(async () => '', async () => throwing());
  expect(p).toMatchObject({ chipMaxTemp: null, thermalLevel: null });
  const e = resolveSchedulerEnv({ lockDir: dir }), s = readState(e, () => m);
  expect(oneLineStatus(s)).not.toMatch(/芯温|热/);
  expect(await passRenderGate(async () => '正常', () => {}, { ...e, readMachine: () => m, readMemory: () => null, readPressure: () => 1, load1Min: () => 0 }, { kind: 'render' })).toBe('正常');
});
