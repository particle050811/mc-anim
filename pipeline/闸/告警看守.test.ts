import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderView, readState, oneLineStatus, type SchedulerState, type LockRecord } from './看.ts';
import { judgeAlerts, reportRepeatedStillFail, updateHistory, monitorRound, readMonitor, emptyHistory, type MonitorHistory } from './告警.ts';
import { resolveSchedulerEnv, type SchedulerEnv } from './任务.ts';
import { readCaller } from './发起者.ts';
import { watchSched } from './盯.ts';
import { readSchedulerEvents, readNewEvents, recordSchedulerEvent } from './调度日志.ts';
import { changeScheduler } from './改调度.ts';
import { listTickets, claimTicket, type Ticket } from './票.ts';
import { UsageError } from '../cli/参数.ts';

let dir: string;
const children: ReturnType<typeof spawn>[] = [];
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-看守-')); });
afterEach(async () => {
  for (const c of children.splice(0)) if (c.exitCode === null && c.signalCode === null) { const p = once(c, 'exit'); c.kill('SIGKILL'); await p; }
  fs.rmSync(dir, { recursive: true, force: true });
});
const makeInitiator = () => readCaller({ CLAUDE_CODE_SESSION_ID: 'sess0001' }, [], dir, false);
const makeSchedEnv = (o: Partial<SchedulerEnv> = {}) => resolveSchedulerEnv({ lockDir: dir, localHost: os.hostname(), caller: makeInitiator(), ...o });
const baseState = (timeMs = 1_000_000): SchedulerState => ({ 时: timeMs, 机: { 负载: 1, 核: 10, 闸: 40, 压力: 1, free: 1e9, 压缩: 1e9, swap: 0, swapOut: 0, GPU: 50, 热: 1, disk: 4e11, orphans: 0, psOutput: '' }, 票: [], lockHolders: [], running: [], recentEvents: [] });
const Ticket = (ticketName: string, ticketContent: Partial<NonNullable<Ticket['ticketContent']>> = {}): Ticket => ({ 名: ticketName, 文件: '/q/渲染.排队/' + ticketName, pid: 7, 主机: 'h', 时间: 0, ticketContent: { v: 1, 任务: 'T1', 起: 0, 声明: { 种: 'render', 段: '6-斩娜迦' }, 发起: makeInitiator(), ...ticketContent } });
const holdLock = (o: Partial<LockRecord> = {}): LockRecord => ({ pid: 9, 票: 'p1', 任务: 'R', 发起: makeInitiator(), 声明: { 种: 'render', 段: '第3段' }, 拿锁时: 0, 心跳: 1, 帧时: 0, 已出帧: 3, 总帧: 100, ...o });
/** 按真实次序走一轮：先更新历史再判，记下通知过的。 */
const watchStep = (h: MonitorHistory, s: SchedulerState) => {
  const n = updateHistory(s, h), a = judgeAlerts(s, s.时, undefined, n);
  for (const x of a) { if (x.类 === '队深') n.highWater = Math.max(n.highWater, x.值); else n.dedupe[x.类 + ':' + x.target] = { 次数: x.次数, lastSeen: s.时 }; }
  return [n, a.map(x => `${x.类}#${x.次数}`)] as const;
};
const stateWithMachine = (timeMs: number, overrides: Partial<SchedulerState['机']>) => { const s = baseState(timeMs); Object.assign(s.机, overrides); return s; };

it('队列行的约几分只算自己这把锁和同队的票：放行票不等渲染', () => {
  const timeMs = 4_000_000, s = baseState(timeMs);
  s.lockHolders = [holdLock({ lock: '渲染', 拿锁时: timeMs - 60_000, 声明: { 种: 'render', 预计秒: 3600 } })];
  s.票 = [{ ...Ticket('002-h-8', { 任务: 'R', 声明: { 种: 'still', 预计秒: 30 } }), pid: 8 }, { ...Ticket('003-h-9', { 任务: 'S', 声明: { 种: 'still', 预计秒: 30 } }), pid: 9 }, { ...Ticket('001-h-7', { 任务: 'P', 声明: { 种: 'voice', 预计秒: 30 } }), pid: 7, 文件: '/q/放行.排队/001-h-7' }];
  const lines = renderView(s).split('\n').filter(l => l.startsWith('排队'));
  expect(lines[0]).toContain('#8'); expect(lines[0]).toContain('约59.0分后');
  expect(lines[1]).toContain('#9'); expect(lines[1]).toContain('约59.5分后');
  expect(lines[2]).toContain('#7'); expect(lines[2]).toContain('约0.0分后');
});

describe('去重能复位', () => {
  it('压力：抖一下不重新叫醒，持续消失后是新事件；一天没人采样后再到也是新事件', () => {
    let h = emptyHistory(), a: string[];
    [h, a] = watchStep(h, stateWithMachine(0, { 压力: 4 })); expect(a).toEqual(['内存压力#1']);
    [h, a] = watchStep(h, stateWithMachine(30_000, { 压力: 1 })); expect(a).toEqual([]);
    [h, a] = watchStep(h, stateWithMachine(60_000, { 压力: 4 })); expect(a).toEqual([]);
    for (let t = 90_000; t <= 390_000; t += 30_000) { [h, a] = watchStep(h, stateWithMachine(t, { 压力: 1 })); expect(a).toEqual([]); }
    expect(h.dedupe).toEqual({});
    [h, a] = watchStep(h, stateWithMachine(420_000, { 压力: 4 })); expect(a).toEqual(['内存压力#1']);
    [h, a] = watchStep(h, stateWithMachine(420_000 + 86_400_000, { 压力: 4 })); expect(a).toEqual(['内存压力#1']);
  });
  it('负载：第一夜三次，第二夜还能醒', () => {
    const unattended = (start: number, h0: MonitorHistory) => { let h = h0; const out: string[] = []; for (let m = 0; m <= 15; m++) { const [n, a] = watchStep(h, stateWithMachine(start + m * 60_000, { 负载: 30 })); h = n; out.push(...a); } return [h, out] as const; };
    const [h1, a1] = unattended(0, emptyHistory()); expect(a1).toEqual(['负载#1', '负载#2', '负载#3']);
    const [h2] = watchStep(h1, stateWithMachine(16 * 60_000, { 负载: 1 }));
    expect(unattended(86_400_000, h2)[1]).toEqual(['负载#1', '负载#2', '负载#3']);
  });
  it('队深高水位在队列清空后复位，不清空时只创新高才醒', () => {
    const queue = (timeMs: number, n: number) => { const s = baseState(timeMs); s.票 = Array.from({ length: n }, (_, i) => Ticket('x' + i, { 起: timeMs, 任务: 'T' + i })); return s; };
    let h = emptyHistory(), a: string[];
    [h, a] = watchStep(h, queue(0, 6)); expect(a).toEqual(['队深#1']);
    [h, a] = watchStep(h, queue(30_000, 5)); expect(a).toEqual([]);
    [h, a] = watchStep(h, queue(60_000, 0)); expect(a).toEqual([]);
    [h, a] = watchStep(h, queue(90_000, 5)); expect(a).toEqual(['队深#1']);
  });
  it('落盘后也复位：不留挡住下一次的认领文件，删了监测文件也不会哑', () => {
    const e = makeSchedEnv(); const alarmKinds = (s: SchedulerState) => monitorRound(e, s).map(x => x.类);
    expect(alarmKinds(stateWithMachine(0, { 压力: 4 }))).toEqual(['内存压力']);
    expect(alarmKinds(stateWithMachine(5_000, { 压力: 4 }))).toEqual([]);
    expect(alarmKinds(stateWithMachine(400_000, { 压力: 1 }))).toEqual([]);
    expect(readMonitor(e).dedupe).toEqual({});
    expect(alarmKinds(stateWithMachine(405_000, { 压力: 4 }))).toEqual(['内存压力']);
    expect(fs.existsSync(path.join(e.schedulerDir, '告警'))).toBe(false);
    fs.rmSync(path.join(e.schedulerDir, '监测.json'));
    expect(alarmKinds(stateWithMachine(410_000, { 压力: 4 }))).toEqual(['内存压力']);
    expect(readSchedulerEvents(e.logDir).filter(x => x.事 === '告警')).toHaveLength(3);
  });
  it('监测文件是旧格式（去重存数字）时按事件已结束处理', () => {
    const h = { ...emptyHistory(), dedupe: { '内存压力:机器': 1 } } as unknown as MonitorHistory;
    expect(updateHistory(stateWithMachine(0, { 压力: 4 }), h).dedupe).toEqual({});
  });
});

describe('内存类只在闸兜不住时报（用户 11-14 定）', () => {
  /** 每 30 秒一轮跑到 分钟 分钟，帧速(秒) 给出这一刻每秒出几帧；返回全部告警 */
  const simulate = (minutes: number, pressureAt: (sec: number) => number, frameSpeedAt: (sec: number) => number, hasHolder = true) => {
    let h = emptyHistory(), frame = 0; const out: string[] = [];
    for (let t = 0; t <= minutes * 60_000; t += 30_000) {
      const s = stateWithMachine(t, { 压力: pressureAt(t / 1000) }); if (hasHolder) s.lockHolders = [holdLock({ 已出帧: Math.floor(frame), 总帧: 1e6, 帧时: t })];
      const [n, a] = watchStep(h, s); h = n; out.push(...a); frame += frameSpeedAt(t / 1000) * 30;
    }
    return out;
  };
  it('压力 2 一直在、帧速不变：不报', () => { expect(simulate(20, () => 2, () => 1)).toEqual([]); });
  it('压力 2 一直在、近 3 分钟帧速掉到五分之一：报', () => { expect(simulate(15, () => 2, t => t < 600 ? 1 : 0.2)).toContain('内存压力#1'); });
  it('帧速掉了但压力只有 1：不报（镜头变重本来就会慢）', () => { expect(simulate(15, () => 1, t => t < 600 ? 1 : 0.2)).toEqual([]); });
  it('压力 2 才出现不到 3 分钟：不报', () => { expect(simulate(12, t => t >= 600 ? 2 : 1, t => t < 600 ? 1 : 0.2)).toEqual([]); });
  it('压力 4：立刻报，不看帧速，没人渲也报', () => { expect(simulate(1, () => 4, () => 1, false)).toEqual(['内存压力#1']); });
  it('swap 3 分钟涨 1 GiB、压力 2，但没人变慢：不报', () => {
    let h = emptyHistory(); const stateAt = (t: number, swap: number) => { const s = stateWithMachine(t, { 压力: 2, swap }); s.lockHolders = [holdLock({ 已出帧: t / 1000, 总帧: 1e6, 帧时: t })]; return s; };
    for (let t = 0; t <= 600_000; t += 30_000) h = updateHistory(stateAt(t, t >= 600_000 ? 2 ** 30 : 0), h);
    expect(judgeAlerts(stateAt(600_000, 2 ** 30), 600_000, undefined, h)).toEqual([]);
  });
  it('出帧样本约 25 秒一个、只留 15 分钟，持锁者走了就丢', () => {
    let h = emptyHistory();
    for (let t = 0; t <= 1_200_000; t += 3_000) { const s = baseState(t); s.lockHolders = [holdLock({ 已出帧: t / 1000, 总帧: 1e6 })]; h = updateHistory(s, h); }
    const samples = Object.values(h.帧)[0]!; expect(samples.length).toBeLessThanOrEqual(37); expect(1_200_000 - samples[0]!.时).toBeLessThanOrEqual(900_000);
    expect(updateHistory(baseState(1_203_000), h).帧).toEqual({});
  });
});

describe('采样断档和读不到', () => {
  it('负载、孤儿隔 6 小时的两次采样不算持续', () => {
    const sixHoursMs = 6 * 3_600_000;
    let h = updateHistory(stateWithMachine(0, { 负载: 30, orphans: 1 }), emptyHistory());
    h = updateHistory(stateWithMachine(sixHoursMs, { 负载: 30, orphans: 1 }), h);
    expect(h.loadStart).toBe(sixHoursMs); expect(h.orphanRounds).toBe(1);
    expect(judgeAlerts(stateWithMachine(sixHoursMs, { 负载: 30, orphans: 1 }), sixHoursMs, undefined, h)).toEqual([]);
  });
  it('持锁者 30 秒一采、定时器略晚，swap 增长照样判得到（压力 2、有人变慢时）', () => {
    const startMs = 600_000, stateAt = (timeMs: number, frame: number, overrides: Partial<SchedulerState['机']>) => { const s = stateWithMachine(timeMs, overrides); s.lockHolders = [holdLock({ 已出帧: frame, 总帧: 1e5 })]; return s; };
    let h = emptyHistory();
    for (let t = 0; t <= startMs; t += 30_000) h = updateHistory(stateAt(t, t / 1000, { 压力: 2 }), h);
    for (let i = 1; i <= 7; i++) h = updateHistory(stateAt(startMs + i * 30_500, startMs / 1000, { 压力: 2, swap: i === 7 ? 2 ** 30 : 0 }), h);
    expect(judgeAlerts(stateAt(startMs + 7 * 30_500, startMs / 1000, { 压力: 2, swap: 2 ** 30 }), startMs + 7 * 30_500, undefined, h).map(x => x.类)).toContain('swap增长');
  });
  it('swap 读不到不入历史，恢复读数不算增长；负载、孤儿读不到不清零也不累加', () => {
    let h = updateHistory(stateWithMachine(0, { swap: null }), emptyHistory());
    expect(h.swap).toEqual([]);
    h = updateHistory(stateWithMachine(175_000, { swap: 5 * 2 ** 30 }), { ...h, lastTime: 170_000 });
    expect(judgeAlerts(stateWithMachine(175_000, { swap: 5 * 2 ** 30 }), 175_000, undefined, h)).toEqual([]);
    let g = updateHistory(stateWithMachine(0, { 负载: 30, orphans: 1 }), emptyHistory());
    g = updateHistory(stateWithMachine(30_000, { 负载: null, orphans: null }), g);
    expect([g.loadStart, g.orphanRounds]).toEqual([0, 1]);
    g = updateHistory(stateWithMachine(60_000, { 负载: 30, orphans: 1 }), g);
    expect([g.loadStart, g.orphanRounds]).toEqual([0, 2]);
  });
  it('看 和 一行 把读不到的显示成 ?', () => {
    const s = stateWithMachine(1_000_000, { 负载: null, orphans: null, swap: null });
    expect(oneLineStatus(s)).toContain('负载?/10');
    const view = renderView(s); expect(view).toContain('孤儿Chrome ?'); expect(view).toContain('swap?');
  });
});

describe('告警对象', () => {
  const waitMs = 400_000;
  it('排队票改序不换对象：同一事件不重复叫醒', () => {
    const s1 = baseState(waitMs); s1.票 = [Ticket('0001-h-7', { 声明: { 种: 'still' } })];
    const [h, a] = watchStep(emptyHistory(), s1); expect(a).toEqual(['小任务等待#1']);
    const s2 = baseState(waitMs + 5000); s2.票 = [Ticket('0000-h-7', { 声明: { 种: 'still' } })];
    expect(watchStep(h, s2)[1]).toEqual([]);
  });
  it('已暂缓的票不告警、不算队深，到期没人处理的也不抢着报', () => {
    const s = baseState(waitMs * 10); s.票 = [1, 2, 3, 4].map(i => Ticket('9' + i, { 任务: 'T' + i, deferredUntilMs: waitMs * 11 })); s.票[0]!.ticketContent!.waitMemStart = 0;
    expect(judgeAlerts(s, s.时)).toEqual([]);
    s.票[0]!.ticketContent!.deferredUntilMs = 1;
    expect(judgeAlerts(s, s.时)).toEqual([]);
  });
  it('暂缓和恢复走真命令：恢复后等待重新起算', () => {
    const e = makeSchedEnv(), q = path.join(dir, '渲染.排队');
    const t = claimTicket(q, e.localHost, { 任务: 'T1', 起: 0, 心跳: 0, 发起: e.caller, 声明: { 种: 'still' }, 主机: e.localHost }, Date.now() - waitMs);
    const fakeMachine = () => baseState().机, readFakeState = () => readState(e, fakeMachine, false), makeParams = (value: Record<string, string>) => ({ 位置: [], 值: value, toggles: new Set<string>(), multiValue: {} });
    expect(judgeAlerts(readFakeState(), Date.now()).map(x => `${x.类}:${x.target}`)).toEqual(['小任务等待:T1']);
    changeScheduler('后', t.名, makeParams({ '--为什么': '让产出先' }), e, { 状态: readFakeState, 输出: () => {} });
    expect(judgeAlerts(readFakeState(), Date.now())).toEqual([]);
    const deferredName = listTickets(q)[0]!.名;
    changeScheduler('恢复', deferredName, makeParams({ '--为什么': '产出完了' }), e, { 状态: readFakeState, 输出: () => {} });
    expect(listTickets(q)[0]!.ticketContent!.deferredUntilMs).toBeUndefined();
    expect(judgeAlerts(readFakeState(), Date.now())).toEqual([]);
  });
  it('多段 render：前一段的无帧告警不吞后面段', () => {
    const timeA = 400_000, s1 = baseState(timeA); s1.lockHolders = [holdLock({ 拿锁时: timeA - 360_000, 帧时: timeA - 360_000 })];
    const [h, a1] = watchStep(emptyHistory(), s1); expect(a1).toEqual(['无帧#1']);
    const timeB = timeA + 30_000, s2 = baseState(timeB); s2.lockHolders = [holdLock({ 票: 'p2', 声明: { 种: 'render', 段: '第17段' }, 拿锁时: timeB - 360_000, 帧时: timeB - 360_000 })];
    expect(watchStep(h, s2)[1]).toEqual(['无帧#1']);
  });
  it('没声明段的持锁按票区分', () => {
    const timeMs = 400_000, ticketState = (ticketName: string) => { const s = baseState(timeMs); s.lockHolders = [holdLock({ 票: ticketName, 声明: { 种: '批' }, 拿锁时: timeMs - 360_000, 帧时: timeMs - 360_000 })]; return s; };
    const [h, a] = watchStep(emptyHistory(), ticketState('a')); expect(a).toEqual(['无帧#1']);
    expect(watchStep(h, ticketState('b'))[1]).toEqual(['无帧#1']);
  });
  it('静帧 90 秒没出新帧就报，render 还是 5 分钟', () => {
    const alarmsFor = (taskKind: string, sec: number) => { const s = baseState(sec * 1000 + 1); s.lockHolders = [holdLock({ 声明: { 种: taskKind, 段: '4-齐放' }, 拿锁时: 1, 帧时: 1, 已出帧: 0, 总帧: 1 })]; return judgeAlerts(s, s.时).map(x => x.类); };
    expect(alarmsFor('still', 89)).toEqual([]);
    expect(alarmsFor('still', 91)).toEqual(['无帧']);
    expect(alarmsFor('render', 91)).toEqual([]);
  });
  it('同一批静帧连着两次没出来就报，换帧、中间成功过都不算', () => {
    const logDir = path.join(dir, 'logs'), now = Date.now(), initiator = { 工作区: 'wt' };
    const logEvent = (task: string, frameList: string, outcome: string, preSec: number) => recordSchedulerEvent(logDir, '放锁', { 任务: task, 结果: outcome, 声明: { 种: 'still', 作品: 'A', 段: '4-齐放', 帧: frameList }, 发起: initiator }, now - preSec * 1000);
    const current = (task: string, frame = '720') => reportRepeatedStillFail(logDir, { 声明: { 种: 'still', 作品: 'A', 段: '4-齐放', 帧: frame }, 工作区: 'wt', 任务: task }, now);
    logEvent('t1', '720', '被杀', 300);
    expect(current('t1')).toBeUndefined();
    expect(current('t2', '721')).toBeUndefined();
    expect(current('t2')).toMatchObject({ 类: '静帧重复失败', target: '4-齐放@720', 值: 2 });
    expect(readSchedulerEvents(logDir).filter(x => x.事 === '告警').length).toBe(1);
    logEvent('t2', '720', '被杀', 200); logEvent('t3', '720', '成', 100);
    expect(current('t4')).toBeUndefined();
    logEvent('t4', '720', '异常', 50);
    expect(current('t5')).toMatchObject({ 值: 2 });
    logEvent('t5', '720', '被杀', 40);
    expect(current('t6')).toBeUndefined();
    logEvent('t6', '720', '被杀', 30);
    expect(current('t7')).toMatchObject({ 值: 4, 次数: 2 });
  });
  it('低优先的票不报排队类、不算队深', () => {
    const s = baseState(2000_000); s.票 = Array.from({ length: 5 }, (_, i) => ({ ...Ticket('8' + i, { 任务: 'L' + i, 声明: { 种: 'still', 低优先: true } }), 文件: i ? '/q/渲染.排队/8' + i : '/q/放行.排队/80' }));
    expect(judgeAlerts(s, s.时)).toEqual([]);
  });
  it('still 只有预计缺失才算小任务', () => {
    const alarmsFor = (taskDecl: NonNullable<Ticket['ticketContent']>['声明'], waitSec: number) => { const s = baseState(waitSec * 1000); s.票 = [Ticket('a', { 声明: taskDecl })]; return judgeAlerts(s, s.时).map(x => x.类); };
    expect(alarmsFor({ 种: 'still' }, 301)).toEqual(['小任务等待']);
    expect(alarmsFor({ 种: 'still', 预计秒: null }, 301)).toEqual(['小任务等待']);
    expect(alarmsFor({ 种: 'still', 预计秒: 300 }, 400)).toEqual([]);
    expect(alarmsFor({ 种: 'still', 预计秒: 300 }, 901)).toEqual(['排队长']);
    expect(alarmsFor({ 种: 'render', 预计秒: 30 }, 301)).toEqual(['小任务等待']);
    expect(alarmsFor({ 种: 'render' }, 301)).toEqual([]);
  });
});

describe('盯', () => {
  /** 机器类告警只醒此刻有活的会话：默认让挂 盯 的会话自己有一个在跑的任务。 */
  const hasActive = (...sessions: string[]) => { const s = baseState(Date.now()); s.running = sessions.map(k => ({ 任务: 'M-' + k, 起: 0, 心跳: 0, 发起: readCaller({ CLAUDE_CODE_SESSION_ID: k }, [], dir, false), 声明: { 种: 'render' }, 主机: 'h' })); return s; };
  const runWatch = async (e: SchedulerEnv, o: Parameters<typeof watchSched>[1] = {}) => {
    const out: string[] = [];
    const code = await watchSched(e, { maxSec: 0.05, 读: () => hasActive(e.caller.会话), parentAlive: () => true, 输出: x => out.push(x), sleep: () => new Promise<void>(r => setTimeout(r, 10)), ...o });
    return { code, out };
  };
  /** 先挂一次定下游标，后面的事都算没挂时写入的。 */
  const pinCursor = async (e: SchedulerEnv) => { expect((await runWatch(e)).code).toBe(124); };
  const recordAlert = (e: SchedulerEnv, alarmKind: string, timeMs = Date.now()) => recordSchedulerEvent(e.logDir, '告警', { 类: alarmKind, target: '机器', 次数: 1 }, timeMs);

  it('告警被挤出尾部也不丢', async () => {
    const e = makeSchedEnv(); await pinCursor(e); recordAlert(e, '内存压力');
    for (let i = 0; i < 60; i++) recordSchedulerEvent(e.logDir, '汇报', { observed: 'x'.repeat(900) });
    const r = await runWatch(e); expect(r.code).toBe(0); expect(r.out[0]).toContain('内存压力');
    expect((await runWatch(e)).code).toBe(124);
  });
  it('跨月：上月末的告警在新月有新行后还读得到，游标跟到新月', async () => {
    const e = makeSchedEnv(); recordSchedulerEvent(e.logDir, '汇报', {}, Date.parse('2026-10-31T23:00:00Z'));
    fs.mkdirSync(e.schedulerDir, { recursive: true });
    fs.writeFileSync(path.join(e.schedulerDir, '游标-sess0001.json'), JSON.stringify(readNewEvents(e.logDir).endCursor));
    recordAlert(e, '负载', Date.parse('2026-10-31T23:59:50Z')); recordSchedulerEvent(e.logDir, '汇报', {}, Date.parse('2026-11-01T00:00:01Z'));
    const r = await runWatch(e); expect(r.out[0]).toContain('10-31T23:59:50Z 负载');
    expect(JSON.parse(fs.readFileSync(path.join(e.schedulerDir, '游标-sess0001.json'), 'utf8')).月).toBe('2026-11');
  });
  it('半行不读：写到一半的末行留到下一次', () => {
    const e = makeSchedEnv(); recordAlert(e, 'a');
    const f = path.join(e.logDir, fs.readdirSync(e.logDir)[0]!), byteSize = fs.statSync(f).size;
    fs.appendFileSync(f, '{"事":"告');
    const r = readNewEvents(e.logDir); expect(r.行).toHaveLength(1); expect(r.endCursor.offset).toBe(byteSize);
    expect(readNewEvents(e.logDir, r.endCursor).行).toHaveLength(0);
  });
  it('一轮多于 3 条：说还有几条和最重的，重挂接着报，一条不吞', async () => {
    const e = makeSchedEnv(); await pinCursor(e);
    for (const alarmKind of ['小任务等待', '排队长', '负载', '持锁者死', '内存压力']) recordAlert(e, alarmKind);
    const a = await runWatch(e); expect(a.out[0]).toContain('小任务等待'); expect(a.out[0]).toContain('另2件未报（最重 持锁者死）');
    expect(a.out[0]).not.toContain('内存压力 ');
    const b = await runWatch(e); expect(b.code).toBe(0); expect(b.out[0]).toContain('持锁者死'); expect(b.out[0]).toContain('内存压力'); expect(b.out[0]).not.toContain('未报');
    expect((await runWatch(e)).code).toBe(124);
  });
  it('崩溃、回收死锁都叫醒；普通事件不叫醒但游标前进', async () => {
    const e = makeSchedEnv(); await pinCursor(e);
    recordSchedulerEvent(e.logDir, '任务起', { 任务: 'X' }); expect((await runWatch(e)).code).toBe(124);
    recordSchedulerEvent(e.logDir, '崩溃', { 任务: 'X', 发起: { pid: 123 }, 声明: { 段: '6-斩娜迦' } });
    expect((await runWatch(e)).out[0]).toContain('崩溃 #123 6-斩娜迦');
    recordSchedulerEvent(e.logDir, '回收死锁', { 任务: 'Y', prevHolder: { pid: 123 } });
    expect((await runWatch(e)).out[0]).toContain('回收死锁 #123');
  });
  describe('按归属分发', () => {
    const taskAlert = (e: SchedulerEnv, session: string) => recordSchedulerEvent(e.logDir, '告警', { 类: '排队长', target: 'T9', 次数: 1, pid: 9, 会话: session });
    /** 让会话 k 看起来挂着 盯（本测试进程的 pid 是活的）。 */
    const addWatch = (e: SchedulerEnv, k: string) => { fs.mkdirSync(path.join(e.schedulerDir, '盯'), { recursive: true }); fs.writeFileSync(path.join(e.schedulerDir, '盯', `其他-${k}.json`), JSON.stringify({ pid: process.pid, 会话: k })); };
    const leftWatch = (e: SchedulerEnv, k: string, msAgo: number) => { fs.mkdirSync(e.schedulerDir, { recursive: true }); fs.writeFileSync(path.join(e.schedulerDir, `离盯-${k}.json`), JSON.stringify({ 时: Date.now() - msAgo })); };
    it('任务类：自己的醒；别人的、主人在盯就不醒', async () => {
      const e = makeSchedEnv(); await pinCursor(e); addWatch(e, 'other');
      taskAlert(e, 'other'); expect((await runWatch(e)).code).toBe(124);
      taskAlert(e, 'sess0001'); const r = await runWatch(e); expect(r.code).toBe(0); expect(r.out[0]).toContain('排队长');
    });
    it('任务类兜底：主人没挂 盯、没有会话（人手起的）都照旧醒', async () => {
      const e = makeSchedEnv(); await pinCursor(e);
      taskAlert(e, 'other'); expect((await runWatch(e)).out[0]).toContain('排队长');
      taskAlert(e, ''); expect((await runWatch(e)).out[0]).toContain('排队长');
    });
    it('主人刚离开 盯（重挂空档）：先不广播、游标停住，过了宽限还没回来再醒', async () => {
      const e = makeSchedEnv(); await pinCursor(e); leftWatch(e, 'other', 10_000);
      taskAlert(e, 'other'); expect((await runWatch(e)).code).toBe(124);
      leftWatch(e, 'other', 600_000); expect((await runWatch(e)).out[0]).toContain('排队长');
    });
    it('主人在宽限里时，停在它前面的自己的告警照报', async () => {
      const e = makeSchedEnv(); await pinCursor(e); leftWatch(e, 'other', 10_000);
      taskAlert(e, 'sess0001'); taskAlert(e, 'other');
      const r = await runWatch(e); expect(r.code).toBe(0); expect(r.out[0]!.match(/排队长/g)).toHaveLength(1);
      expect((await runWatch(e)).code).toBe(124);
    });
    it('回收死锁按原持有者的会话算，不按回收者', async () => {
      const e = makeSchedEnv(); await pinCursor(e); addWatch(e, 'other');
      recordSchedulerEvent(e.logDir, '回收死锁', { 发起: { 会话: 'sess0001' }, prevHolder: { pid: 5, 发起: { 会话: 'other' } } }); expect((await runWatch(e)).code).toBe(124);
    });
    it('机器类：谁都没活不醒；只有别人有活且在盯不醒；自己有活醒', async () => {
      const e = makeSchedEnv(); await pinCursor(e); addWatch(e, 'other');
      recordAlert(e, '负载'); expect((await runWatch(e, { 读: () => hasActive() })).code).toBe(124);
      recordAlert(e, '负载'); expect((await runWatch(e, { 读: () => hasActive('other') })).code).toBe(124);
      recordAlert(e, '负载'); expect((await runWatch(e, { 读: () => hasActive('other', 'sess0001') })).out[0]).toContain('负载');
    });
    it('机器类兜底：有活的会话没挂 盯 就照旧醒', async () => {
      const e = makeSchedEnv(); await pinCursor(e);
      recordAlert(e, '负载'); expect((await runWatch(e, { 读: () => hasActive('other') })).out[0]).toContain('负载');
    });
    it('没有会话的 盯（人手挂的）什么都看', async () => {
      const e = makeSchedEnv({ caller: readCaller({}, [], dir, false) }); await pinCursor(e); addWatch(e, 'other');
      taskAlert(e, 'other'); expect((await runWatch(e)).out[0]).toContain('排队长');
    });
  });
  it('告警记下任务主人的会话：排队的取票上的发起者，持锁的取锁信息上的', () => {
    const s = baseState(10_000_000), otherInitiator = readCaller({ CLAUDE_CODE_SESSION_ID: 'other123' }, [], dir, false);
    s.票 = [Ticket('001-h-7', { 起: 0, 发起: otherInitiator })]; s.lockHolders = [holdLock({ 拿锁时: 0, 帧时: 0, 发起: otherInitiator })];
    const a = judgeAlerts(s, s.时); expect(a.length).toBeGreaterThan(1);
    expect(a.every(x => x.会话 === 'other123')).toBe(true);
  });
  it('别的会话的路完不叫醒，同会话的叫醒', async () => {
    const e = makeSchedEnv(); await pinCursor(e);
    recordSchedulerEvent(e.logDir, '路完', { 路: '别人的', 发起: { 会话: 'other' } }); expect((await runWatch(e)).code).toBe(124);
    recordSchedulerEvent(e.logDir, '路败', { 路: '我的', 发起: { 会话: 'sess0001' } }); expect((await runWatch(e)).out[0]).toContain('路败 我的');
  });
  it('新会话第一次挂：三天前别的会话的告警不算新事件，30 分钟内的算，输出带时间', async () => {
    const e = makeSchedEnv(), now = Date.now();
    recordAlert(e, '持锁者死', now - 3 * 86_400_000); expect((await runWatch(e)).code).toBe(124);
    const e2 = makeSchedEnv({ caller: readCaller({ CLAUDE_CODE_SESSION_ID: 'sess0002' }, [], dir, false) });
    recordAlert(e, '内存压力', now - 60_000);
    const r = await runWatch(e2); expect(r.code).toBe(0); expect(r.out[0]).toContain('内存压力');
    expect(r.out[0]).toContain(new Date(now - 60_000).toISOString().slice(5, 19) + 'Z');
    expect(r.out[0]).not.toContain('持锁者死');
  });
  it('--任务：#pid、任务 id、任意历史票名都认；任务已结束立刻报', async () => {
    const e = makeSchedEnv(), logEvent = (eventName: string, x: Record<string, unknown>) => recordSchedulerEvent(e.logDir, eventName, { 任务: 'T7', 发起: { pid: 777 }, ...x });
    logEvent('任务起', {}); logEvent('领票', { 票: '0001-h-777' }); logEvent('改序', { 票: '0000-h-777', 原序: '0001-h-777', 新序: '0000-h-777' }); logEvent('领票', { 票: '0002-h-777' });
    for (const taskName of ['#777', '777', 'T7', '0001-h-777', '0000-h-777', '0002-h-777']) expect((await runWatch(e, { 任务: taskName })).code, taskName).toBe(124);
    logEvent('任务止', { 票: '0002-h-777', 退出码: 0 });
    for (const taskName of ['#777', 'T7', '0001-h-777']) { const r = await runWatch(e, { 任务: taskName }); expect(r.code, taskName).toBe(0); expect(r.out[0]).toContain('任务止 #777'); expect(r.out[0]).toContain('退出码0'); }
  });
  it('--任务 目标被 SIGKILL 时按崩溃醒，只醒一次', async () => {
    const e = makeSchedEnv(); recordSchedulerEvent(e.logDir, '任务起', { 任务: 'K', 发起: { pid: 55 } }); await pinCursor(e);
    recordSchedulerEvent(e.logDir, '崩溃', { 任务: 'K', 发起: { pid: 55 } });
    const r = await runWatch(e, { 任务: 'K' }); expect(r.code).toBe(0); expect(r.out[0]!.match(/崩溃/g)).toHaveLength(1);
  });
  it('--任务 只等自己的任务：无关告警不退出、不消费，全局 盯 照样醒；它也不算挂了看守', async () => {
    const e = makeSchedEnv(); await pinCursor(e);
    recordSchedulerEvent(e.logDir, '任务起', { 任务: 'X', 发起: { pid: 111 } }); recordAlert(e, '持锁者死');
    const r = await runWatch(e, { 任务: 'X', sleep: async () => { expect(fs.readdirSync(path.join(e.schedulerDir, '盯'))).toEqual([]); await new Promise(r => setTimeout(r, 10)); } });
    expect(r).toEqual({ code: 124, out: [] });
    const g = await runWatch(e); expect(g.code).toBe(0); expect(g.out[0]).toContain('持锁者死');
  });
  it('--任务 匹配不到报用法错误，不默默等到点', async () => {
    const e = makeSchedEnv(); recordSchedulerEvent(e.logDir, '任务起', { 任务: 'K', 发起: { pid: 55 } });
    await expect(runWatch(e, { 任务: '#56' })).rejects.toBeInstanceOf(UsageError);
    await expect(runWatch(e, { 任务: '没有这张票' })).rejects.toBeInstanceOf(UsageError);
  });
  it('全局那只先读过任务止，--任务 那只照样醒', async () => {
    const e = makeSchedEnv(); recordSchedulerEvent(e.logDir, '任务起', { 任务: 'K', 发起: { pid: 55 } });
    const wakeRun = runWatch(e, { 任务: 'K', maxSec: 2 }); await pinCursor(e);
    recordSchedulerEvent(e.logDir, '任务止', { 任务: 'K', 发起: { pid: 55 } }); await pinCursor(e);
    expect((await wakeRun).code).toBe(0);
  });
  it('看 的告警行带时间，被汇报挤过 16 KB 还在', () => {
    const e = makeSchedEnv(), timeMs = Date.now(); recordSchedulerEvent(e.logDir, '告警', { 类: '内存压力', target: '机器', 次数: 1 }, timeMs);
    for (let i = 0; i < 60; i++) recordSchedulerEvent(e.logDir, '汇报', { observed: 'x'.repeat(900) });
    const s = readState(e, () => baseState().机, false);
    expect(renderView(s)).toContain(`告警 ${new Date(timeMs).toISOString().slice(5, 19)}Z 内存压力 机器`);
    expect(s.recentEvents.every(x => x.事 === '告警' || x.事 === '决定')).toBe(true);
  });
  it('读调度 的尾部能跨月', () => {
    const e = makeSchedEnv(); recordSchedulerEvent(e.logDir, '甲', {}, Date.parse('2026-10-31T23:59:50Z')); recordSchedulerEvent(e.logDir, '乙', {}, Date.parse('2026-11-01T00:00:01Z'));
    expect(readSchedulerEvents(e.logDir, 4096).map(x => x.事)).toEqual(['甲', '乙']);
    expect(readSchedulerEvents(e.logDir).map(x => x.事)).toEqual(['甲', '乙']);
  });

  const runSubWatch = (prefix: string) => {
    const modulePathLiteral = (n: string) => JSON.stringify(path.join(import.meta.dirname, n));
    const scriptSource = `import {盯} from ${modulePathLiteral('盯.ts')};import {取调度环境} from ${modulePathLiteral('任务.ts')};import {读发起者} from ${modulePathLiteral('发起者.ts')};
const e=取调度环境({锁目录:${JSON.stringify(dir)},发起者:读发起者({CLAUDE_CODE_SESSION_ID:'sess0001'},[],${JSON.stringify(dir)},false)});
const 机={负载:1,核:10,闸:40,压力:1,free:1,压缩:1,swap:0,换出:0,GPU:1,热:1,盘:1,孤儿:0,进程:''};
console.log('ready');
process.exitCode=await 盯(e,{最长:4,父活:()=>true,读:()=>({时:Date.now(),机,持锁:[],票:[],在跑:[{任务:'M',起:0,心跳:0,发起:e.发起者,声明:{种:'render'},主机:'h'}],最近:[]}),睡:()=>new Promise(r=>setTimeout(r,20)),输出:s=>console.log(${JSON.stringify(prefix)}+s)});`;
    const c = spawn(process.execPath, ['--input-type=module', '-e', scriptSource], { stdio: ['ignore', 'pipe', 'inherit'] });
    children.push(c);
    let out = ''; c.stdout!.on('data', d => { out += d; });
    return { c, 出: () => out, ready: new Promise<void>(r => { c.stdout!.on('data', d => { if (String(d).includes('ready')) r(); }); }), exited: once(c, 'exit') };
  };
  it('同会话两只真进程：一条告警只醒一只，另一只到点；游标不被覆盖', async () => {
    const e = makeSchedEnv(); await pinCursor(e);
    const a = runSubWatch('甲:'), b = runSubWatch('乙:');
    await Promise.all([a.ready, b.ready]); await new Promise(r => setTimeout(r, 300));
    recordAlert(e, '持锁者死');
    const [[ca], [cb]] = await Promise.all([a.exited, b.exited]);
    const wakeLines = [a.出(), b.出()].filter(x => x.includes('持锁者死'));
    expect(wakeLines).toHaveLength(1); expect([ca, cb].sort()).toEqual([0, 124]);
    expect((await runWatch(e)).code).toBe(124);
  }, 15000);
  it('持锁者真被 SIGKILL：没有等待者时，盯 靠崩溃和持锁者死叫醒', async () => {
    const c = spawn(process.execPath, [path.join(import.meta.dirname, 'fixtures/持锁子进程.ts'), dir], { stdio: ['ignore', 'pipe', 'inherit'] }); children.push(c);
    await new Promise<void>(r => { c.stdout!.on('data', d => { if (String(d).includes('ready')) r(); }); });
    const e = makeSchedEnv(); await runWatch(e, { 读: () => readState(e, () => baseState().机) });
    const wakeRun = runWatch(e, { maxSec: 8, 读: () => readState(e, () => baseState().机) });
    const dead = once(c, 'exit'); c.kill('SIGKILL'); await dead;
    const r = await wakeRun; expect(r.code).toBe(0); expect(r.out[0]).toMatch(/崩溃|持锁者死/); expect(r.out[0]).toContain(`#${c.pid}`);
  }, 20000);
});


