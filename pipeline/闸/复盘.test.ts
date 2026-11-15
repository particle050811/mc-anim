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
const sequence = () => { const rows: SchedulerEvent[] = []; return { rows, add: (sec: number, eventName: string, x: Record<string, unknown> = {}) => { rows.push({ v: 1, 主机: 'h', 时: new Date(sec * 1000).toISOString(), 事: eventName, 锁: '渲染', ...x }); } }; };
const fakeMachine = () => ({ 负载: 2, 核: 10, 闸: 40, 压力: 1, free: 1, 压缩: 1, swap: 0, 换出: 0, GPU: 0, 热: 0, 盘: 1e10, 孤儿: 0, 进程: '' });
const parseParams = (xs: string[]) => parseArgs(xs, { 值: ['--why', '--saw', '--decision'], toggles: ['--kill-holder'] });

describe('等谁', () => {
  it('领票和拿锁按任务关联：改序不丢', () => {
    const { rows, add } = sequence();
    add(0, '拿锁', { 票: 'a', 任务: 'A' }); add(1, '领票', { 票: 'b', 任务: 'B' }); add(5, '改序', { 任务: 'B', 票: 'b2', 原序: 'b', 新序: 'b2' }); add(100, '放锁', { 票: 'a', 任务: 'A', 持锁秒: 100 }); add(100, '拿锁', { 票: 'b2', 任务: 'B' });
    expect(review(rows).等谁).toEqual({ 'B→A': 99 });
  });
  it('分锁种：放行队列不算到渲染持锁者头上，等的是什么单列', () => {
    const { rows, add } = sequence();
    add(0, '拿锁', { 票: 'a', 任务: 'A' }); add(1, '领票', { 票: 'p', 任务: 'P', 锁: '放行' }); add(2, '放行等起', { 票: 'p', 任务: 'P', 锁: '放行', 卡在: '间隔、负载' }); add(100, '拿锁', { 票: 'p', 任务: 'P', 锁: '放行' }); add(200, '放锁', { 票: 'a', 任务: 'A', 持锁秒: 200 });
    const r = review(rows);
    expect(r.等谁).toEqual({});
    expect(r.未归因.分解).toEqual({ '放行卡在间隔、负载': 99 });
  });
  it('持锁者崩溃：关闭持锁区间，等它的算它，不算当前持锁，占锁算到最后心跳', () => {
    const { rows, add } = sequence();
    add(0, '拿锁', { 票: 'a', 任务: 'A', 声明: { 用途: '产出' } }); add(1, '领票', { 票: 'b', 任务: 'B' });
    add(100, '崩溃', { 任务: 'A', 票: 'a', 心跳: 30_000 }); add(100, '回收死锁', { 票: 'b', 任务: 'B', 原持有者: { pid: 1, 任务: 'A' } }); add(100, '拿锁', { 票: 'b', 任务: 'B' }); add(120, '放锁', { 票: 'b', 任务: 'B', 持锁秒: 20, 声明: { 用途: '产出' } });
    const r = review(rows);
    expect(r.等谁).toEqual({ 'B→A': 99 });
    expect(r.等闸.其中已崩溃者秒).toBe(99);
    expect(r.当前持锁).toEqual([]);
    expect(r.占锁秒).toEqual({ 产出: 50 });
    expect(r.被杀.map(x => x.事)).toEqual(['崩溃']);
  });
  it('只有回收事件也关闭：在跑文件没了时崩溃事件写不出来', () => {
    const { rows, add } = sequence();
    add(0, '拿锁', { 票: 'a', 任务: 'A' }); add(1, '领票', { 票: 'b', 任务: 'B' }); add(50, '回收死锁', { 票: 'b', 任务: 'B', 原持有者: { pid: 1 } }); add(50, '拿锁', { 票: 'b', 任务: 'B' });
    const r = review(rows);
    expect(r.等谁).toEqual({ 'B→A': 49 });
    expect(r.当前持锁.map(x => x.任务)).toEqual(['B']);
  });
  it('旧闸挡路没有持锁记录：列进未归因并点名 pid，发起者分解也看得到', () => {
    const { rows, add } = sequence();
    add(0, '领票', { 票: 'b', 任务: 'B' }); add(0, '排队', { 票: 'b', 任务: 'B', 等谁: 5067 }); add(600, '拿锁', { 票: 'b', 任务: 'B', 等锁秒: 600, 发起: { 来源: '人', 工作区: '主', 路: '' } });
    const r = review(rows);
    expect(r.等谁).toEqual({});
    expect(r.等闸).toMatchObject({ 总秒: 600, 未归因秒: 600 });
    expect(r.未归因.分解).toEqual({ '旧闸 #5067': 600 });
    expect(r.发起等秒).toEqual({ '人:/主/未声明路→未归因': 600 });
  });
  it('没有领票也没有等锁秒：列无等待数据，不静默丢', () => {
    const { rows, add } = sequence();
    add(10, '拿锁', { 票: 'b', 任务: 'B' });
    const r = review(rows);
    expect(r.未归因.无等待数据次).toBe(1);
    expect(r.未归因.明细).toEqual([{ 任务: 'B', 锁: '渲染', 票: 'b', 原因: '无领票' }]);
  });
  it('等锁秒是总量；等内存单算，不进未归因', () => {
    const { rows, add } = sequence();
    add(0, '拿锁', { 票: 'a', 任务: 'A' }); add(10, '放锁', { 票: 'a', 任务: 'A', 持锁秒: 10 }); add(40, '拿锁', { 票: 'b', 任务: 'B', 等锁秒: 35, 等内存秒: 30 });
    const r = review(rows);
    expect(r.等谁).toEqual({ 'B→A': 5 });
    expect(r.等闸).toMatchObject({ 总秒: 35, 持锁者秒: 5, 内存秒: 30, 未归因秒: 0 });
  });
  it('入选只定汇报哪些：领票在窗口外、挡路者不满足过滤，照样归因', () => {
    const { rows, add } = sequence();
    add(0, '拿锁', { 票: 'a', 任务: 'A', 发起: { 路: '别的路' } }); add(1, '领票', { 票: 'b', 任务: 'B', 发起: { 路: '这路' } }); add(100, '放锁', { 票: 'a', 任务: 'A', 持锁秒: 100, 发起: { 路: '别的路' }, 声明: { 用途: '实验' } }); add(100, '拿锁', { 票: 'b', 任务: 'B', 发起: { 路: '这路' } });
    const r = review(rows, { matches: x => (x.发起 as { 路?: string } | undefined)?.路 === '这路' && Date.parse(x.时) >= 50_000 });
    expect(r.等谁).toEqual({ 'B→A': 99 });
    expect(r.占锁秒).toEqual({});
  });
  it('没拿到锁就没了的等待和还在等的都列出来', () => {
    const { rows, add } = sequence();
    add(1, '领票', { 票: 'k', 任务: 'K' }); add(10, '被杀', { 任务: 'K' }); add(11, '任务止', { 任务: 'K' }); add(20, '领票', { 票: 'w', 任务: 'W' });
    expect(review(rows, { now: 50_000 }).没等到).toEqual([
      { 任务: 'K', 锁: '渲染', 票: 'k', 起: new Date(1000).toISOString(), 秒: 9, 结局: '被杀' },
      { 任务: 'W', 锁: '渲染', 票: 'w', 起: new Date(20_000).toISOString(), 秒: 30, 结局: '未结束' },
    ]);
  });
  it('等内存起后被杀：按结束事件计入并标未结束', () => {
    const { rows, add } = sequence();
    add(0, '等内存起', { 票: 'b', 任务: 'B' }); add(8760, '被杀', { 任务: 'B' }); add(8760, '任务止', { 任务: 'B' }); add(9000, '等内存起', { 票: 'c', 任务: 'C' });
    const r = review(rows, { now: 9100_000 });
    expect(r.等内存).toEqual({ B: 8760, C: 100 });
    expect(r.等内存未结束).toEqual([expect.objectContaining({ 任务: 'B', 结局: '被杀', 秒: 8760 }), expect.objectContaining({ 任务: 'C', 结局: '未结束' })]);
  });
});

describe('告警到决定', () => {
  it('持锁告警对象是 任务/段，#pid 的决定落库带任务 id，配得上；改序不影响', () => {
    const e = resolveSchedulerEnv({ lockDir: dir, caller: readCaller({}, [], dir, false) }), q = path.join(dir, '渲染.排队');
    const t = claimTicket(q, e.localHost, { 任务: '任务甲', 起: 0, 心跳: 0, 主机: e.localHost, 发起: e.caller, 声明: { 种: 'still' } }, Date.now());
    recordSchedulerEvent(e.logDir, '告警', { 类: '排队长', 对象: '任务甲', 票: t.名, pid: process.pid });
    const o = { 状态: () => readState(e, fakeMachine, false), 输出: () => {} };
    changeScheduler('first', `#${process.pid}`, parseParams(['--why', '插队']), e, o);
    const decision = readSchedulerEvents(e.logDir).find(x => x.事 === '决定')!;
    expect(decision).toMatchObject({ 任务: '任务甲', 票: t.名, 目标: `#${process.pid}` });
    expect(review(readSchedulerEvents(e.logDir)).告警到决定秒).toHaveLength(1);
  });
  it('升级连发时从最早那条算；配过的不再配；没指向谁的决定不进统计', () => {
    const { rows, add } = sequence();
    add(0, '告警', { 对象: 'T/段', 次数: 1 }); add(60, '告警', { 对象: 'T/段', 次数: 2 }); add(100, '决定', { 任务: 'T', 决定: '取消' }); add(200, '决定', { 任务: 'T', 决定: '又一次' });
    add(300, '告警', { 类: '负载', 对象: '机器' }); add(400, '决定', { 决定: '错开派活' }); add(500, '告警', { 对象: 'U' }); add(600, '决定', { 任务: 'V' }); add(700, '决定', { 目标: '机器', 决定: '记' });
    expect(review(rows).告警到决定秒).toEqual([100, 400]);
  });
});

describe('日志过滤', () => {
  const makeSchedEnv = () => resolveSchedulerEnv({ lockDir: dir, caller: readCaller({}, [], dir, false), nowMs: () => Date.parse('2026-11-01T12:00:00Z') });
  const runCmd = async (e: ReturnType<typeof makeSchedEnv>, ...args: string[]) => { const out: string[] = []; await runScheduler(args, e, s => out.push(s)); return out.join('\n'); };
  const countLines = (s: string) => s ? s.split('\n').length : 0;
  it('--seg 先看事件顶层的段：告警的声明是任务手上那段，不能归错', async () => {
    const e = resolveSchedulerEnv({ lockDir: dir });
    recordSchedulerEvent(e.logDir, '告警', { 任务: 'R', 段: '甲', 声明: { 段: '乙' } }, Date.now());
    recordSchedulerEvent(e.logDir, '拿锁', { 任务: 'R', 声明: { 段: '乙' } }, Date.now());
    const readLog = async (segmentKey: string) => { const lines: string[] = []; expect(await runScheduler(['log', '--seg', segmentKey, '--json'], e, (s) => lines.push(s))).toBe(0); return lines.join('\n'); };
    const outputA = await readLog('甲'), secondLog = await readLog('乙');
    expect(outputA).toContain('告警');expect(outputA).not.toContain('拿锁');
    expect(secondLog).toContain('拿锁');expect(secondLog).not.toContain('告警');
  });
  it('--route 同时查事件顶层的 路 和 发起.路', async () => {
    const e = makeSchedEnv();
    await runCmd(e, 'route', 'open', '纹理核对'); await runCmd(e, 'order', '纹理核对', '--yield', '产出优先');
    recordSchedulerEvent(e.logDir, '拿锁', { 任务: 'T', 发起: { 路: '纹理核对' } });
    recordSchedulerEvent(e.logDir, '拿锁', { 任务: 'U', 发起: { 路: '别的' } });
    expect(countLines(await runCmd(e, 'log', '--route', '纹理核对'))).toBe(3);
  });
  it('--from --to 按时刻比：只给日期的 --to 含当天；月-日和 --day 同格式；写错报用法错误', async () => {
    const e = makeSchedEnv();
    for (const t of ['2026-10-31T23:59:00Z', '2026-11-01T08:00:00Z', '2026-11-02T00:00:00Z']) recordSchedulerEvent(e.logDir, '测试', {}, Date.parse(t));
    expect(countLines(await runCmd(e, 'log', '--to', '2026-11-01'))).toBe(2);
    expect(countLines(await runCmd(e, 'log', '--from', '2026-11-01'))).toBe(2);
    expect(countLines(await runCmd(e, 'log', '--from', '11-01', '--to', '11-01'))).toBe(1);
    expect(countLines(await runCmd(e, 'log', '--from', '2026-11-01T08:00:00Z', '--to', '2026-11-01T08:00:00Z'))).toBe(1);
    expect(countLines(await runCmd(e, 'log', '--to', '2026-11-01T16:00:00+08:00'))).toBe(2);
    expect(countLines(await runCmd(e, 'log', '--day', '11-01'))).toBe(1);
    for (const [k, v] of [['--to', '乱写'], ['--from', '乱写'], ['--from', '2026-13-45'], ['--day', '11-1']] as const)
      await expect(runCmd(e, 'log', k, v)).rejects.toThrow(k);
  });
  it('review --day：前一天的领票也配得上；不在窗口里就没有当前持锁；持锁者已死不算', async () => {
    const e = makeSchedEnv();
    const logEvent = (t: string, eventName: string, x: Record<string, unknown>) => recordSchedulerEvent(e.logDir, eventName, { 锁: '渲染', ...x }, Date.parse(t));
    logEvent('2026-10-31T23:59:00Z', '拿锁', { 票: 'a', 任务: 'A' }); logEvent('2026-10-31T23:59:30Z', '领票', { 票: 'b', 任务: 'B' }); logEvent('2026-11-01T00:01:00Z', '放锁', { 票: 'a', 任务: 'A', 持锁秒: 120 }); logEvent('2026-11-01T00:01:00Z', '拿锁', { 票: 'b', 任务: 'B' });
    const r = JSON.parse(await runCmd(e, 'review', '--day', '11-01'));
    expect(r.等谁).toEqual({ 'B→A': 90 });
    fs.writeFileSync(path.join(dir, '渲染.lock'), `${process.pid}\n`);
    fs.writeFileSync(path.join(dir, '渲染.lock.信息.json'), JSON.stringify({ pid: process.pid, 票: 'b', 任务: 'B', 发起: e.caller, 声明: {}, 拿锁时: Date.now(), 心跳: Date.now(), 帧时: Date.now(), 已出帧: 0 }));
    expect(JSON.parse(await runCmd(e, 'review')).当前持锁.map((x: { 任务: string }) => x.任务)).toEqual(['B']);
    expect(JSON.parse(await runCmd(e, 'review', '--day', '10-31')).当前持锁).toEqual([]);
    fs.writeFileSync(path.join(dir, '渲染.lock'), '99999998\n');
    expect(JSON.parse(await runCmd(e, 'review')).当前持锁).toEqual([]);
  });
});
