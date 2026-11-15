// 复盘的归因和日志过滤。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../cli/参数.ts';
import { review } from './复盘.ts';
import { readSchedulerEvents, recordSchedulerEvent, type SchedulerEvent } from './调度日志.ts';
import { readCaller } from './发起者.ts';
import { resolveSchedulerEnv } from './任务.ts';
import { changeScheduler } from './改调度.ts';
import { readState } from './看.ts';
import { runScheduler } from './命令.ts';
import { claimTicket } from './票.ts';
let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-复盘-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });
const sequence = () => { const rows: SchedulerEvent[] = []; return { rows, add: (sec: number, eventName: string, x: Record<string, unknown> = {}) => { rows.push({ v: 1, 主机: 'h', 时: new Date(sec * 1000).toISOString(), 事: eventName, lock: '渲染', ...x }); } }; };
const fakeMachine = () => ({ 负载: 2, 核: 10, 闸: 40, 压力: 1, free: 1, 压缩: 1, swap: 0, swapOut: 0, GPU: 0, 热: 0, disk: 1e10, orphans: 0, psOutput: '' });
const parseParams = (xs: string[]) => parseArgs(xs, { 值: ['--为什么', '--看到', '--决定'], toggles: ['--杀持锁'] });

describe('等谁', () => {
  it('领票和拿锁按任务关联：改序不丢', () => {
    const { rows, add } = sequence();
    add(0, '拿锁', { 票: 'a', 任务: 'A' }); add(1, '领票', { 票: 'b', 任务: 'B' }); add(5, '改序', { 任务: 'B', 票: 'b2', origOrder: 'b', newOrder: 'b2' }); add(100, '放锁', { 票: 'a', 任务: 'A', lockHoldSec: 100 }); add(100, '拿锁', { 票: 'b2', 任务: 'B' });
    expect(review(rows).waitingOn).toEqual({ 'B→A': 99 });
  });
  it('分锁种：放行队列不算到渲染持锁者头上，等的是什么单列', () => {
    const { rows, add } = sequence();
    add(0, '拿锁', { 票: 'a', 任务: 'A' }); add(1, '领票', { 票: 'p', 任务: 'P', lockName: '放行' }); add(2, '放行等起', { 票: 'p', 任务: 'P', lockName: '放行', stuckOn: '间隔、负载' }); add(100, '拿锁', { 票: 'p', 任务: 'P', lockName: '放行' }); add(200, '放锁', { 票: 'a', 任务: 'A', lockHoldSec: 200 });
    const r = review(rows);
    expect(r.waitingOn).toEqual({});
    expect(r.unattributed.breakdown).toEqual({ '放行卡在间隔、负载': 99 });
  });
  it('持锁者崩溃：关闭持锁区间，等它的算它，不算当前持锁，占锁算到最后心跳', () => {
    const { rows, add } = sequence();
    add(0, '拿锁', { 票: 'a', 任务: 'A', 声明: { 用途: '产出' } }); add(1, '领票', { 票: 'b', 任务: 'B' });
    add(100, '崩溃', { 任务: 'A', 票: 'a', 心跳: 30_000 }); add(100, '回收死锁', { 票: 'b', 任务: 'B', prevHolder: { pid: 1, 任务: 'A' } }); add(100, '拿锁', { 票: 'b', 任务: 'B' }); add(120, '放锁', { 票: 'b', 任务: 'B', lockHoldSec: 20, 声明: { 用途: '产出' } });
    const r = review(rows);
    expect(r.waitingOn).toEqual({ 'B→A': 99 });
    expect(r.gateWait.crashedHolderSec).toBe(99);
    expect(r.currentHolds).toEqual([]);
    expect(r.lockOccupySec).toEqual({ output: 50 });
    expect(r.killed.map(x => x.事)).toEqual(['崩溃']);
  });
  it('只有回收事件也关闭：在跑文件没了时崩溃事件写不出来', () => {
    const { rows, add } = sequence();
    add(0, '拿锁', { 票: 'a', 任务: 'A' }); add(1, '领票', { 票: 'b', 任务: 'B' }); add(50, '回收死锁', { 票: 'b', 任务: 'B', prevHolder: { pid: 1 } }); add(50, '拿锁', { 票: 'b', 任务: 'B' });
    const r = review(rows);
    expect(r.waitingOn).toEqual({ 'B→A': 49 });
    expect(r.currentHolds.map(x => x.任务)).toEqual(['B']);
  });
  it('旧闸挡路没有持锁记录：列进未归因并点名 pid，发起者分解也看得到', () => {
    const { rows, add } = sequence();
    add(0, '领票', { 票: 'b', 任务: 'B' }); add(0, '排队', { 票: 'b', 任务: 'B', waitingOn: 5067 }); add(600, '拿锁', { 票: 'b', 任务: 'B', lockWaitSec: 600, 发起: { 来源: '人', 工作区: '主', 路: '' } });
    const r = review(rows);
    expect(r.waitingOn).toEqual({});
    expect(r.gateWait).toMatchObject({ 总秒: 600, unattributedSec: 600 });
    expect(r.unattributed.breakdown).toEqual({ '旧闸 #5067': 600 });
    expect(r.initiatorWaitSec).toEqual({ '人:/主/未声明路→未归因': 600 });
  });
  it('没有领票也没有等锁秒：列无等待数据，不静默丢', () => {
    const { rows, add } = sequence();
    add(10, '拿锁', { 票: 'b', 任务: 'B' });
    const r = review(rows);
    expect(r.unattributed.noWaitDataCount).toBe(1);
    expect(r.unattributed.明细).toEqual([{ 任务: 'B', lockName: '渲染', 票: 'b', 原因: '无领票' }]);
  });
  it('等锁秒是总量；等内存单算，不进未归因', () => {
    const { rows, add } = sequence();
    add(0, '拿锁', { 票: 'a', 任务: 'A' }); add(10, '放锁', { 票: 'a', 任务: 'A', lockHoldSec: 10 }); add(40, '拿锁', { 票: 'b', 任务: 'B', lockWaitSec: 35, waitMemorySec: 30 });
    const r = review(rows);
    expect(r.waitingOn).toEqual({ 'B→A': 5 });
    expect(r.gateWait).toMatchObject({ 总秒: 35, lockHolderSec: 5, memorySec: 30, unattributedSec: 0 });
  });
  it('入选只定汇报哪些：领票在窗口外、挡路者不满足过滤，照样归因', () => {
    const { rows, add } = sequence();
    add(0, '拿锁', { 票: 'a', 任务: 'A', 发起: { 路: '别的路' } }); add(1, '领票', { 票: 'b', 任务: 'B', 发起: { 路: '这路' } }); add(100, '放锁', { 票: 'a', 任务: 'A', lockHoldSec: 100, 发起: { 路: '别的路' }, 声明: { 用途: '实验' } }); add(100, '拿锁', { 票: 'b', 任务: 'B', 发起: { 路: '这路' } });
    const r = review(rows, { matches: x => (x.发起 as { 路?: string } | undefined)?.路 === '这路' && Date.parse(x.时) >= 50_000 });
    expect(r.waitingOn).toEqual({ 'B→A': 99 });
    expect(r.lockOccupySec).toEqual({});
  });
  it('没拿到锁就没了的等待和还在等的都列出来', () => {
    const { rows, add } = sequence();
    add(1, '领票', { 票: 'k', 任务: 'K' }); add(10, '被杀', { 任务: 'K' }); add(11, '任务止', { 任务: 'K' }); add(20, '领票', { 票: 'w', 任务: 'W' });
    expect(review(rows, { now: 50_000 }).notWaited).toEqual([
      { 任务: 'K', lock: '渲染', 票: 'k', 起: new Date(1000).toISOString(), 秒: 9, outcome: '被杀' },
      { 任务: 'W', lock: '渲染', 票: 'w', 起: new Date(20_000).toISOString(), 秒: 30, outcome: '未结束' },
    ]);
  });
  it('等内存起后被杀：按结束事件计入并标未结束', () => {
    const { rows, add } = sequence();
    add(0, '等内存起', { 票: 'b', 任务: 'B' }); add(8760, '被杀', { 任务: 'B' }); add(8760, '任务止', { 任务: 'B' }); add(9000, '等内存起', { 票: 'c', 任务: 'C' });
    const r = review(rows, { now: 9100_000 });
    expect(r.memWaitSec).toEqual({ B: 8760, C: 100 });
    expect(r.memWaitOpen).toEqual([expect.objectContaining({ 任务: 'B', outcome: '被杀', 秒: 8760 }), expect.objectContaining({ 任务: 'C', outcome: '未结束' })]);
  });
});

describe('告警到决定', () => {
  it('持锁告警对象是 任务/段，#pid 的决定落库带任务 id，配得上；改序不影响', () => {
    const e = resolveSchedulerEnv({ lockDir: dir, caller: readCaller({}, [], dir, false) }), q = path.join(dir, '渲染.排队');
    const t = claimTicket(q, e.localHost, { 任务: '任务甲', 起: 0, 心跳: 0, 主机: e.localHost, 发起: e.caller, 声明: { 种: 'still' } }, Date.now());
    recordSchedulerEvent(e.logDir, '告警', { 类: '排队长', target: '任务甲', 票: t.名, pid: process.pid });
    const o = { 状态: () => readState(e, fakeMachine, false), 输出: () => {} };
    changeScheduler('先', `#${process.pid}`, parseParams(['--为什么', '插队']), e, o);
    const decision = readSchedulerEvents(e.logDir).find(x => x.事 === '决定')!;
    expect(decision).toMatchObject({ 任务: '任务甲', 票: t.名, 目标: `#${process.pid}` });
    expect(review(readSchedulerEvents(e.logDir)).alertToDecisionSec).toHaveLength(1);
  });
  it('升级连发时从最早那条算；配过的不再配；没指向谁的决定不进统计', () => {
    const { rows, add } = sequence();
    add(0, '告警', { target: 'T/段', 次数: 1 }); add(60, '告警', { target: 'T/段', 次数: 2 }); add(100, '决定', { 任务: 'T', decision: '取消' }); add(200, '决定', { 任务: 'T', decision: '又一次' });
    add(300, '告警', { 类: '负载', target: '机器' }); add(400, '决定', { decision: '错开派活' }); add(500, '告警', { target: 'U' }); add(600, '决定', { 任务: 'V' }); add(700, '决定', { 目标: '机器', decision: '记' });
    expect(review(rows).alertToDecisionSec).toEqual([100, 400]);
  });
});

describe('日志过滤', () => {
  const makeSchedEnv = () => resolveSchedulerEnv({ lockDir: dir, caller: readCaller({}, [], dir, false), nowMs: () => Date.parse('2026-11-01T12:00:00Z') });
  const runCmd = async (e: ReturnType<typeof makeSchedEnv>, ...args: string[]) => { const out: string[] = []; await runScheduler(args, e, s => out.push(s)); return out.join('\n'); };
  const countLines = (s: string) => s ? s.split('\n').length : 0;
  it('--段 先看事件顶层的段：告警的声明是任务手上那段，不能归错', async () => {
    const e = resolveSchedulerEnv({ lockDir: dir });
    recordSchedulerEvent(e.logDir, '告警', { 任务: 'R', 段: '甲', 声明: { 段: '乙' } }, Date.now());
    recordSchedulerEvent(e.logDir, '拿锁', { 任务: 'R', 声明: { 段: '乙' } }, Date.now());
    const readLog = async (segmentKey: string) => { const lines: string[] = []; expect(await runScheduler(['日志', '--段', segmentKey, '--json'], e, (s) => lines.push(s))).toBe(0); return lines.join('\n'); };
    const outputA = await readLog('甲'), secondLog = await readLog('乙');
    expect(outputA).toContain('告警');expect(outputA).not.toContain('拿锁');
    expect(secondLog).toContain('拿锁');expect(secondLog).not.toContain('告警');
  });
  it('--路 同时查事件顶层的 路 和 发起.路', async () => {
    const e = makeSchedEnv();
    await runCmd(e, '路', '开', '纹理核对'); await runCmd(e, '令', '纹理核对', '--让路', '产出优先');
    recordSchedulerEvent(e.logDir, '拿锁', { 任务: 'T', 发起: { 路: '纹理核对' } });
    recordSchedulerEvent(e.logDir, '拿锁', { 任务: 'U', 发起: { 路: '别的' } });
    expect(countLines(await runCmd(e, '日志', '--路', '纹理核对'))).toBe(3);
  });
  it('--从 --到 按时刻比：只给日期的 --到 含当天；月-日和 --日 同格式；写错报用法错误', async () => {
    const e = makeSchedEnv();
    for (const t of ['2026-10-31T23:59:00Z', '2026-11-01T08:00:00Z', '2026-11-02T00:00:00Z']) recordSchedulerEvent(e.logDir, '测试', {}, Date.parse(t));
    expect(countLines(await runCmd(e, '日志', '--到', '2026-11-01'))).toBe(2);
    expect(countLines(await runCmd(e, '日志', '--从', '2026-11-01'))).toBe(2);
    expect(countLines(await runCmd(e, '日志', '--从', '11-01', '--到', '11-01'))).toBe(1);
    expect(countLines(await runCmd(e, '日志', '--从', '2026-11-01T08:00:00Z', '--到', '2026-11-01T08:00:00Z'))).toBe(1);
    expect(countLines(await runCmd(e, '日志', '--到', '2026-11-01T16:00:00+08:00'))).toBe(2);
    expect(countLines(await runCmd(e, '日志', '--日', '11-01'))).toBe(1);
    for (const [k, v] of [['--到', '乱写'], ['--从', '乱写'], ['--从', '2026-13-45'], ['--日', '11-1']] as const)
      await expect(runCmd(e, '日志', k, v)).rejects.toThrow(k);
  });
  it('复盘 --日：前一天的领票也配得上；不在窗口里就没有当前持锁；持锁者已死不算', async () => {
    const e = makeSchedEnv();
    const logEvent = (t: string, eventName: string, x: Record<string, unknown>) => recordSchedulerEvent(e.logDir, eventName, { lockName: '渲染', ...x }, Date.parse(t));
    logEvent('2026-10-31T23:59:00Z', '拿锁', { 票: 'a', 任务: 'A' }); logEvent('2026-10-31T23:59:30Z', '领票', { 票: 'b', 任务: 'B' }); logEvent('2026-11-01T00:01:00Z', '放锁', { 票: 'a', 任务: 'A', 持锁秒: 120 }); logEvent('2026-11-01T00:01:00Z', '拿锁', { 票: 'b', 任务: 'B' });
    const r = JSON.parse(await runCmd(e, '复盘', '--日', '11-01'));
    expect(r.等谁).toEqual({ 'B→A': 90 });
    fs.writeFileSync(path.join(dir, '渲染.lock'), `${process.pid}\n`);
    fs.writeFileSync(path.join(dir, '渲染.lock.信息.json'), JSON.stringify({ pid: process.pid, 票: 'b', 任务: 'B', 发起: e.caller, 声明: {}, 拿锁时: Date.now(), 心跳: Date.now(), 帧时: Date.now(), 已出帧: 0 }));
    expect(JSON.parse(await runCmd(e, '复盘')).currentHolds.map((x: { 任务: string }) => x.任务)).toEqual(['B']);
    expect(JSON.parse(await runCmd(e, '复盘', '--日', '10-31')).currentHolds).toEqual([]);
    fs.writeFileSync(path.join(dir, '渲染.lock'), '99999998\n');
    expect(JSON.parse(await runCmd(e, '复盘')).currentHolds).toEqual([]);
  });
});
