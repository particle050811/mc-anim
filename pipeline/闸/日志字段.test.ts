// 日志字段按方案第 14 节：真实流程走临时锁目录和注入的读数。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../cli/参数.ts';
import { readSchedulerEvents } from './调度日志.ts';
import { readCaller } from './发起者.ts';
import { resolveSchedulerEnv, openTask } from './任务.ts';
import { changeScheduler } from './改调度.ts';
import { readState } from './看.ts';
import { listTickets, claimTicket, writeTicket } from './票.ts';
import { passGate, passRenderGate, type GateEnv } from './闸.ts';
let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-日志字段-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });
const fakeMachine = () => ({ load: 2, cores: 10, gate: 40, pressure: 1, free: 1, compressed: 1, swap: 0, swapOut: 0, GPU: 0, thermal: 0, disk: 1e10, orphans: 0, processes: '不该进日志的进程表' });
const parseParams = (xs: string[]) => parseArgs(xs, { value: ['--why', '--saw', '--decision'], toggles: ['--kill-holder'] });
const makeMemory = (n: number) => ({ grandTotal: 100, free: n, freePercent: n, swapTotal: 0, swapUsed: 0 });
const gateEnv = (x: Partial<GateEnv> = {}): Partial<GateEnv> => ({ lockDir: dir, localHost: os.hostname(), memFloor: 30, readMemory: () => makeMemory(80), readPressure: () => 1, load1Min: () => 0, coreCount: () => 10, readMachine: fakeMachine, clearOrphans: () => [], queueIntervalMs: 1, ...x });
const readLogs = () => readSchedulerEvents(path.join(dir, 'logs'));
const liveTicket = (task: string, pid = process.ppid, seqIndex = '000000000000100') => { const q = path.join(dir, '渲染.排队'), ticketName = `${seqIndex}-${os.hostname().replace(/[^A-Za-z0-9._-]/g, '_')}-${pid}`; fs.mkdirSync(q, { recursive: true }); fs.writeFileSync(path.join(q, ticketName), JSON.stringify({ v: 1, task: task, start: Date.now(), initiator: readCaller({}, [], dir, false), decl: { kind: 'still' } })); return ticketName; };

describe('日志字段', () => {
  it('领票、拿锁、放锁带 队 和 机（不带进程表），拿锁带等内存秒和被越次数', async () => {
    await passRenderGate(async () => {}, () => {}, gateEnv(), { kind: 'still' });
    const rows = readLogs(), findEvent = (eventName: string) => rows.find(x => x.event === eventName)!;
    for (const eventName of ['领票', '拿锁', '放锁']) {
      expect(findEvent(eventName).queue).toMatchObject({ depth: 0, ahead: [] });
      expect(findEvent(eventName).machine).toMatchObject({ load: 2, gate: 40 });
      expect(JSON.stringify(findEvent(eventName))).not.toContain('不该进日志');
    }
    expect(findEvent('拿锁')).toMatchObject({ memoryWaitSec: 0, overtakenCount: 0, lockWaitSec: expect.any(Number) });
    expect(findEvent('放锁').queue).toMatchObject({ lockHolders: process.pid });
  });
  it('等内存：起止带机，拿锁累计等内存秒', async () => {
    let now = Date.now(), free = 10;
    await passRenderGate(async () => {}, () => {}, gateEnv({ nowMs: () => now, readMemory: () => makeMemory(free), sleep: async () => { now += 60_000; if (now > Date.now() + 200_000) free = 80; } }), { kind: 'still' });
    const rows = readLogs(), startEntry = rows.find(x => x.event === '等内存起')!, endRow = rows.find(x => x.event === '等内存止')!;
    expect(startEntry).toMatchObject({ lock: '渲染', machine: { gate: 40 } });
    expect(endRow).toMatchObject({ lock: '渲染', machine: { gate: 40 } });
    expect(endRow.sec).toBeGreaterThan(0);
    expect(rows.find(x => x.event === '拿锁')!.memoryWaitSec).toBe(endRow.sec);
  });
  it('放行闸的拿锁和放行事件带锁种、等内存秒和读数', async () => {
    let now = Date.now(), free = 10;
    await passGate(async () => {}, () => {}, gateEnv({ nowMs: () => now, readMemory: () => makeMemory(free), sleep: async () => { now += 60_000; free = 80; } }), { kind: 'bake' });
    const rows = readLogs(), acquired = rows.find(x => x.event === '拿锁')!, letThroughRow = rows.find(x => x.event === '放行')!;
    expect(rows.find(x => x.event === '放行等起')).toMatchObject({ lock: '放行', stuckOn: '内存' });
    expect(acquired.memoryWaitSec).toBe(60);
    expect(letThroughRow).toMatchObject({ lock: '放行', machine: { load: 0, gate: 80, pressure: 1 } });
  });
  it('已被越有写入者：先 给越过的票加一，暂缓和后面的不算；计数写进拿锁', async () => {
    const e = resolveSchedulerEnv({ lockDir: dir, caller: readCaller({}, [], dir, false) }), q = path.join(dir, '渲染.排队');
    const makeTicket = (task: string) => claimTicket(q, e.localHost, { task: task, start: 0, heartbeat: 0, host: e.localHost, initiator: e.caller, decl: { kind: 'still' } }, Date.now());
    makeTicket('甲'); makeTicket('乙');
    const c = makeTicket('丙');
    makeTicket('丁');
    const findByTask = (task: string) => listTickets(q).find(x => x.content?.task === task)!.content!;
    changeScheduler('first', c.name, parseParams(['--why', '插队']), e, { state: () => readState(e, fakeMachine, false), output: () => {} });
    expect([findByTask('甲').已被越, findByTask('乙').已被越, findByTask('丙').已被越, findByTask('丁').已被越]).toEqual([1, 1, undefined, undefined]);
    for (const x of listTickets(q)) fs.rmSync(x.file);
    fs.writeFileSync(path.join(dir, '渲染.lock'), `${process.ppid}\n`);
    await passRenderGate(async () => {}, () => {}, gateEnv({ sleep: async () => {
      const ticket = listTickets(q)[0]!;
      ticket.content!.已被越 = 2; writeTicket(ticket);
      fs.rmSync(path.join(dir, '渲染.lock'), { force: true });
    } }), { kind: 'still' });
    expect(readLogs().find(x => x.event === '拿锁')!.overtakenCount).toBe(2);
  });
  it('放行越队拿锁时，前面的活票也记被越', async () => {
    const first = liveTicket('前面的'), q = path.join(dir, '渲染.排队');
    const e = resolveSchedulerEnv({ lockDir: dir, caller: readCaller({}, [], dir, false) });
    await passRenderGate(async () => {
      expect(JSON.parse(fs.readFileSync(path.join(q, first), 'utf8')).已被越).toBe(1);
    }, () => {}, gateEnv({ sleep: async () => {
      const ticket = listTickets(q).find(x => x.name !== first)!;
      changeScheduler('release', ticket.name, parseParams(['--why', '急']), e, { state: () => readState(e, fakeMachine, false), output: () => {} });
    } }), { kind: 'still' });
  });
  it('被杀说清当时持锁还是排队、已跑几秒、取消几秒内退出；限时杀说已跑', async () => {
    const fixture = path.join(import.meta.dirname, 'fixtures/持锁子进程.ts');
    const startChild = (env: Record<string, string> = {}) => spawn(process.execPath, [fixture, dir], { stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, ...env } });
    const waitReady = (c: ReturnType<typeof startChild>) => new Promise<void>((ok, no) => { c.stdout!.on('data', d => { if (String(d).includes('ready')) ok(); }); c.once('exit', () => no(Error('子进程提前退出'))); });
    const holder = startChild();
    await waitReady(holder);
    const child = startChild();
    for (let i = 0; i < 200 && !readLogs().some(x => x.event === '排队' && (x.initiator as { pid?: number }).pid === child.pid); i++) await new Promise(r => setTimeout(r, 20));
    const waiterExit = once(child, 'exit'); child.kill('SIGTERM'); await waiterExit;
    const task = JSON.parse(fs.readFileSync(path.join(dir, '渲染.lock.信息.json'), 'utf8')).task;
    fs.mkdirSync(path.join(dir, '指令'), { recursive: true });
    fs.writeFileSync(path.join(dir, '指令', task + '.json'), JSON.stringify({ 动作: '取消', why: '测试', timestamp: Date.now() - 2000 }));
    const holderExit = once(holder, 'exit'); holder.kill('SIGTERM'); await holderExit;
    const killEvents = readLogs().filter(x => x.event === '被杀');
    const firstKill = killEvents.find(x => (x.initiator as { pid?: number }).pid === child.pid)!, secondKill = killEvents.find(x => (x.initiator as { pid?: number }).pid === holder.pid)!;
    expect(firstKill).toMatchObject({ then: '排队', elapsedSec: expect.any(Number), machine: { load: expect.any(Number) } });
    expect(firstKill.afterCancelSec).toBeUndefined();
    expect(secondKill).toMatchObject({ then: '持锁', why: '测试' });
    expect(secondKill.afterCancelSec).toBeGreaterThanOrEqual(2);
    const limitedChild = startChild({ ANIM_TIME_LIMIT: '1' });
    const [exitCode] = await once(limitedChild, 'exit');
    expect(exitCode).toBe(124);
    expect(readLogs().find(x => x.event === '限时杀')).toMatchObject({ 限时: 1, elapsedSec: expect.any(Number) });
  }, 20_000);
  it('任务止带错误摘要', async () => {
    const e = resolveSchedulerEnv({ lockDir: dir, caller: readCaller({}, [], dir, false) });
    openTask(e, { kind: 'render' }, () => {}).endedAt(1, undefined, '段不存在');
    expect(readLogs().find(x => x.event === '任务止')).toMatchObject({ exitCode: 1, errors: '段不存在' });
  });
});
