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
const baseState = (timeMs = 1_000_000): SchedulerState => ({ timestamp: timeMs, machine: { load: 1, cores: 10, gate: 40, pressure: 1, free: 1e9, compressed: 1e9, swap: 0, swapOut: 0, GPU: 50, thermal: 1, disk: 4e11, orphans: 0, processes: '' }, ticket: [], lockHolders: [], 在跑: [], 最近: [] });
const Ticket = (ticketName: string, ticketContent: Partial<NonNullable<Ticket['content']>> = {}): Ticket => ({ name: ticketName, file: '/q/渲染.排队/' + ticketName, pid: 7, host: 'h', time: 0, content: { v: 1, task: 'T1', start: 0, decl: { kind: 'render', segment: '6-斩娜迦' }, initiator: makeInitiator(), ...ticketContent } });
const holdLock = (o: Partial<LockRecord> = {}): LockRecord => ({ pid: 9, ticket: 'p1', task: 'R', initiator: makeInitiator(), decl: { kind: 'render', segment: '第3段' }, lockAcquiredAt: 0, heartbeat: 1, frameTime: 0, framesDone: 3, totalFrames: 100, ...o });
/** 按真实次序走一轮：先更新历史再判，记下通知过的。 */
const watchStep = (h: MonitorHistory, s: SchedulerState) => {
  const n = updateHistory(s, h), a = judgeAlerts(s, s.timestamp, undefined, n);
  for (const x of a) { if (x.type === '队深') n.highWater = Math.max(n.highWater, x.value); else n.dedupe[x.type + ':' + x.subject] = { attempts: x.attempts, 末: s.timestamp }; }
  return [n, a.map(x => `${x.type}#${x.attempts}`)] as const;
};
const stateWithMachine = (timeMs: number, overrides: Partial<SchedulerState['machine']>) => { const s = baseState(timeMs); Object.assign(s.machine, overrides); return s; };

it('队列行的约几分只算自己这把锁和同队的票：放行票不等渲染', () => {
  const timeMs = 4_000_000, s = baseState(timeMs);
  s.lockHolders = [holdLock({ lock: '渲染', lockAcquiredAt: timeMs - 60_000, decl: { kind: 'render', estimatedSec: 3600 } })];
  s.ticket = [{ ...Ticket('002-h-8', { task: 'R', decl: { kind: 'still', estimatedSec: 30 } }), pid: 8 }, { ...Ticket('003-h-9', { task: 'S', decl: { kind: 'still', estimatedSec: 30 } }), pid: 9 }, { ...Ticket('001-h-7', { task: 'P', decl: { kind: 'voice', estimatedSec: 30 } }), pid: 7, file: '/q/放行.排队/001-h-7' }];
  const lines = renderView(s).split('\n').filter(l => l.startsWith('排队'));
  expect(lines[0]).toContain('#8'); expect(lines[0]).toContain('约59.0分后');
  expect(lines[1]).toContain('#9'); expect(lines[1]).toContain('约59.5分后');
  expect(lines[2]).toContain('#7'); expect(lines[2]).toContain('约0.0分后');
});

describe('去重能复位', () => {
  it('压力：抖一下不重新叫醒，持续消失后是新事件；一天没人采样后再到也是新事件', () => {
    let h = emptyHistory(), a: string[];
    [h, a] = watchStep(h, stateWithMachine(0, { pressure: 4 })); expect(a).toEqual(['内存压力#1']);
    [h, a] = watchStep(h, stateWithMachine(30_000, { pressure: 1 })); expect(a).toEqual([]);
    [h, a] = watchStep(h, stateWithMachine(60_000, { pressure: 4 })); expect(a).toEqual([]);
    for (let t = 90_000; t <= 390_000; t += 30_000) { [h, a] = watchStep(h, stateWithMachine(t, { pressure: 1 })); expect(a).toEqual([]); }
    expect(h.dedupe).toEqual({});
    [h, a] = watchStep(h, stateWithMachine(420_000, { pressure: 4 })); expect(a).toEqual(['内存压力#1']);
    [h, a] = watchStep(h, stateWithMachine(420_000 + 86_400_000, { pressure: 4 })); expect(a).toEqual(['内存压力#1']);
  });
  it('负载：第一夜三次，第二夜还能醒', () => {
    const unattended = (start: number, h0: MonitorHistory) => { let h = h0; const out: string[] = []; for (let m = 0; m <= 15; m++) { const [n, a] = watchStep(h, stateWithMachine(start + m * 60_000, { load: 30 })); h = n; out.push(...a); } return [h, out] as const; };
    const [h1, a1] = unattended(0, emptyHistory()); expect(a1).toEqual(['负载#1', '负载#2', '负载#3']);
    const [h2] = watchStep(h1, stateWithMachine(16 * 60_000, { load: 1 }));
    expect(unattended(86_400_000, h2)[1]).toEqual(['负载#1', '负载#2', '负载#3']);
  });
  it('队深高水位在队列清空后复位，不清空时只创新高才醒', () => {
    const queue = (timeMs: number, n: number) => { const s = baseState(timeMs); s.ticket = Array.from({ length: n }, (_, i) => Ticket('x' + i, { start: timeMs, task: 'T' + i })); return s; };
    let h = emptyHistory(), a: string[];
    [h, a] = watchStep(h, queue(0, 6)); expect(a).toEqual(['队深#1']);
    [h, a] = watchStep(h, queue(30_000, 5)); expect(a).toEqual([]);
    [h, a] = watchStep(h, queue(60_000, 0)); expect(a).toEqual([]);
    [h, a] = watchStep(h, queue(90_000, 5)); expect(a).toEqual(['队深#1']);
  });
  it('落盘后也复位：不留挡住下一次的认领文件，删了监测文件也不会哑', () => {
    const e = makeSchedEnv(); const alarmKinds = (s: SchedulerState) => monitorRound(e, s).map(x => x.type);
    expect(alarmKinds(stateWithMachine(0, { pressure: 4 }))).toEqual(['内存压力']);
    expect(alarmKinds(stateWithMachine(5_000, { pressure: 4 }))).toEqual([]);
    expect(alarmKinds(stateWithMachine(400_000, { pressure: 1 }))).toEqual([]);
    expect(readMonitor(e).dedupe).toEqual({});
    expect(alarmKinds(stateWithMachine(405_000, { pressure: 4 }))).toEqual(['内存压力']);
    expect(fs.existsSync(path.join(e.schedulerDir, '告警'))).toBe(false);
    fs.rmSync(path.join(e.schedulerDir, '监测.json'));
    expect(alarmKinds(stateWithMachine(410_000, { pressure: 4 }))).toEqual(['内存压力']);
    expect(readSchedulerEvents(e.logDir).filter(x => x.event === '告警')).toHaveLength(3);
  });
  it('监测文件是旧格式（去重存数字）时按事件已结束处理', () => {
    const h = { ...emptyHistory(), dedupe: { '内存压力:机器': 1 } } as unknown as MonitorHistory;
    expect(updateHistory(stateWithMachine(0, { pressure: 4 }), h).dedupe).toEqual({});
  });
});

describe('内存类只在闸兜不住时报（用户 11-14 定）', () => {
  /** 每 30 秒一轮跑到 分钟 分钟，帧速(秒) 给出这一刻每秒出几帧；返回全部告警 */
  const simulate = (minutes: number, pressureAt: (sec: number) => number, frameSpeedAt: (sec: number) => number, hasHolder = true) => {
    let h = emptyHistory(), frame = 0; const out: string[] = [];
    for (let t = 0; t <= minutes * 60_000; t += 30_000) {
      const s = stateWithMachine(t, { pressure: pressureAt(t / 1000) }); if (hasHolder) s.lockHolders = [holdLock({ framesDone: Math.floor(frame), totalFrames: 1e6, frameTime: t })];
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
    let h = emptyHistory(); const stateAt = (t: number, swap: number) => { const s = stateWithMachine(t, { pressure: 2, swap }); s.lockHolders = [holdLock({ framesDone: t / 1000, totalFrames: 1e6, frameTime: t })]; return s; };
    for (let t = 0; t <= 600_000; t += 30_000) h = updateHistory(stateAt(t, t >= 600_000 ? 2 ** 30 : 0), h);
    expect(judgeAlerts(stateAt(600_000, 2 ** 30), 600_000, undefined, h)).toEqual([]);
  });
  it('出帧样本约 25 秒一个、只留 15 分钟，持锁者走了就丢', () => {
    let h = emptyHistory();
    for (let t = 0; t <= 1_200_000; t += 3_000) { const s = baseState(t); s.lockHolders = [holdLock({ framesDone: t / 1000, totalFrames: 1e6 })]; h = updateHistory(s, h); }
    const samples = Object.values(h.frame)[0]!; expect(samples.length).toBeLessThanOrEqual(37); expect(1_200_000 - samples[0]!.timestamp).toBeLessThanOrEqual(900_000);
    expect(updateHistory(baseState(1_203_000), h).frame).toEqual({});
  });
});

describe('采样断档和读不到', () => {
  it('负载、孤儿隔 6 小时的两次采样不算持续', () => {
    const sixHoursMs = 6 * 3_600_000;
    let h = updateHistory(stateWithMachine(0, { load: 30, orphans: 1 }), emptyHistory());
    h = updateHistory(stateWithMachine(sixHoursMs, { load: 30, orphans: 1 }), h);
    expect(h.负载起).toBe(sixHoursMs); expect(h.orphanRounds).toBe(1);
    expect(judgeAlerts(stateWithMachine(sixHoursMs, { load: 30, orphans: 1 }), sixHoursMs, undefined, h)).toEqual([]);
  });
  it('持锁者 30 秒一采、定时器略晚，swap 增长照样判得到（压力 2、有人变慢时）', () => {
    const startMs = 600_000, stateAt = (timeMs: number, frame: number, overrides: Partial<SchedulerState['machine']>) => { const s = stateWithMachine(timeMs, overrides); s.lockHolders = [holdLock({ framesDone: frame, totalFrames: 1e5 })]; return s; };
    let h = emptyHistory();
    for (let t = 0; t <= startMs; t += 30_000) h = updateHistory(stateAt(t, t / 1000, { pressure: 2 }), h);
    for (let i = 1; i <= 7; i++) h = updateHistory(stateAt(startMs + i * 30_500, startMs / 1000, { pressure: 2, swap: i === 7 ? 2 ** 30 : 0 }), h);
    expect(judgeAlerts(stateAt(startMs + 7 * 30_500, startMs / 1000, { pressure: 2, swap: 2 ** 30 }), startMs + 7 * 30_500, undefined, h).map(x => x.type)).toContain('swap增长');
  });
  it('swap 读不到不入历史，恢复读数不算增长；负载、孤儿读不到不清零也不累加', () => {
    let h = updateHistory(stateWithMachine(0, { swap: null }), emptyHistory());
    expect(h.swap).toEqual([]);
    h = updateHistory(stateWithMachine(175_000, { swap: 5 * 2 ** 30 }), { ...h, last: 170_000 });
    expect(judgeAlerts(stateWithMachine(175_000, { swap: 5 * 2 ** 30 }), 175_000, undefined, h)).toEqual([]);
    let g = updateHistory(stateWithMachine(0, { load: 30, orphans: 1 }), emptyHistory());
    g = updateHistory(stateWithMachine(30_000, { load: null, orphans: null }), g);
    expect([g.负载起, g.orphanRounds]).toEqual([0, 1]);
    g = updateHistory(stateWithMachine(60_000, { load: 30, orphans: 1 }), g);
    expect([g.负载起, g.orphanRounds]).toEqual([0, 2]);
  });
  it('看 和 一行 把读不到的显示成 ?', () => {
    const s = stateWithMachine(1_000_000, { load: null, orphans: null, swap: null });
    expect(oneLineStatus(s)).toContain('负载?/10');
    const view = renderView(s); expect(view).toContain('孤儿Chrome ?'); expect(view).toContain('swap?');
  });
});

describe('告警对象', () => {
  const waitMs = 400_000;
  it('排队票改序不换对象：同一事件不重复叫醒', () => {
    const s1 = baseState(waitMs); s1.ticket = [Ticket('0001-h-7', { decl: { kind: 'still' } })];
    const [h, a] = watchStep(emptyHistory(), s1); expect(a).toEqual(['小任务等待#1']);
    const s2 = baseState(waitMs + 5000); s2.ticket = [Ticket('0000-h-7', { decl: { kind: 'still' } })];
    expect(watchStep(h, s2)[1]).toEqual([]);
  });
  it('已暂缓的票不告警、不算队深，到期没人处理的也不抢着报', () => {
    const s = baseState(waitMs * 10); s.ticket = [1, 2, 3, 4].map(i => Ticket('9' + i, { task: 'T' + i, 暂缓至: waitMs * 11 })); s.ticket[0]!.content!.等内存起 = 0;
    expect(judgeAlerts(s, s.timestamp)).toEqual([]);
    s.ticket[0]!.content!.暂缓至 = 1;
    expect(judgeAlerts(s, s.timestamp)).toEqual([]);
  });
  it('暂缓和恢复走真命令：恢复后等待重新起算', () => {
    const e = makeSchedEnv(), q = path.join(dir, '渲染.排队');
    const t = claimTicket(q, e.localHost, { task: 'T1', start: 0, heartbeat: 0, initiator: e.caller, decl: { kind: 'still' }, host: e.localHost }, Date.now() - waitMs);
    const fakeMachine = () => baseState().machine, readFakeState = () => readState(e, fakeMachine, false), makeParams = (value: Record<string, string>) => ({ 位置: [], value: value, toggles: new Set<string>(), multiValue: {} });
    expect(judgeAlerts(readFakeState(), Date.now()).map(x => `${x.type}:${x.subject}`)).toEqual(['小任务等待:T1']);
    changeScheduler('last', t.name, makeParams({ '--why': '让产出先' }), e, { state: readFakeState, output: () => {} });
    expect(judgeAlerts(readFakeState(), Date.now())).toEqual([]);
    const deferredName = listTickets(q)[0]!.name;
    changeScheduler('resume', deferredName, makeParams({ '--why': '产出完了' }), e, { state: readFakeState, output: () => {} });
    expect(listTickets(q)[0]!.content!.暂缓至).toBeUndefined();
    expect(judgeAlerts(readFakeState(), Date.now())).toEqual([]);
  });
  it('多段 render：前一段的无帧告警不吞后面段', () => {
    const timeA = 400_000, s1 = baseState(timeA); s1.lockHolders = [holdLock({ lockAcquiredAt: timeA - 360_000, frameTime: timeA - 360_000 })];
    const [h, a1] = watchStep(emptyHistory(), s1); expect(a1).toEqual(['无帧#1']);
    const timeB = timeA + 30_000, s2 = baseState(timeB); s2.lockHolders = [holdLock({ ticket: 'p2', decl: { kind: 'render', segment: '第17段' }, lockAcquiredAt: timeB - 360_000, frameTime: timeB - 360_000 })];
    expect(watchStep(h, s2)[1]).toEqual(['无帧#1']);
  });
  it('没声明段的持锁按票区分', () => {
    const timeMs = 400_000, ticketState = (ticketName: string) => { const s = baseState(timeMs); s.lockHolders = [holdLock({ ticket: ticketName, decl: { kind: '批' }, lockAcquiredAt: timeMs - 360_000, frameTime: timeMs - 360_000 })]; return s; };
    const [h, a] = watchStep(emptyHistory(), ticketState('a')); expect(a).toEqual(['无帧#1']);
    expect(watchStep(h, ticketState('b'))[1]).toEqual(['无帧#1']);
  });
  it('静帧 90 秒没出新帧就报，render 还是 5 分钟', () => {
    const alarmsFor = (taskKind: string, sec: number) => { const s = baseState(sec * 1000 + 1); s.lockHolders = [holdLock({ decl: { kind: taskKind, segment: '4-齐放' }, lockAcquiredAt: 1, frameTime: 1, framesDone: 0, totalFrames: 1 })]; return judgeAlerts(s, s.timestamp).map(x => x.type); };
    expect(alarmsFor('still', 89)).toEqual([]);
    expect(alarmsFor('still', 91)).toEqual(['无帧']);
    expect(alarmsFor('render', 91)).toEqual([]);
  });
  it('同一批静帧连着两次没出来就报，换帧、中间成功过都不算', () => {
    const logDir = path.join(dir, 'logs'), now = Date.now(), initiator = { workspace: 'wt' };
    const logEvent = (task: string, frameList: string, outcome: string, preSec: number) => recordSchedulerEvent(logDir, '放锁', { task: task, result: outcome, decl: { kind: 'still', work: 'A', segment: '4-齐放', frame: frameList }, initiator: initiator }, now - preSec * 1000);
    const current = (task: string, frame = '720') => reportRepeatedStillFail(logDir, { decl: { kind: 'still', work: 'A', segment: '4-齐放', frame: frame }, workspace: 'wt', task: task }, now);
    logEvent('t1', '720', '被杀', 300);
    expect(current('t1')).toBeUndefined();
    expect(current('t2', '721')).toBeUndefined();
    expect(current('t2')).toMatchObject({ type: '静帧重复失败', subject: '4-齐放@720', value: 2 });
    expect(readSchedulerEvents(logDir).filter(x => x.event === '告警').length).toBe(1);
    logEvent('t2', '720', '被杀', 200); logEvent('t3', '720', '成', 100);
    expect(current('t4')).toBeUndefined();
    logEvent('t4', '720', '异常', 50);
    expect(current('t5')).toMatchObject({ value: 2 });
    logEvent('t5', '720', '被杀', 40);
    expect(current('t6')).toBeUndefined();
    logEvent('t6', '720', '被杀', 30);
    expect(current('t7')).toMatchObject({ value: 4, attempts: 2 });
  });
  it('低优先的票不报排队类、不算队深', () => {
    const s = baseState(2000_000); s.ticket = Array.from({ length: 5 }, (_, i) => ({ ...Ticket('8' + i, { task: 'L' + i, decl: { kind: 'still', lowPriority: true } }), file: i ? '/q/渲染.排队/8' + i : '/q/放行.排队/80' }));
    expect(judgeAlerts(s, s.timestamp)).toEqual([]);
  });
  it('still 只有预计缺失才算小任务', () => {
    const alarmsFor = (taskDecl: NonNullable<Ticket['content']>['decl'], waitSec: number) => { const s = baseState(waitSec * 1000); s.ticket = [Ticket('a', { decl: taskDecl })]; return judgeAlerts(s, s.timestamp).map(x => x.type); };
    expect(alarmsFor({ kind: 'still' }, 301)).toEqual(['小任务等待']);
    expect(alarmsFor({ kind: 'still', estimatedSec: null }, 301)).toEqual(['小任务等待']);
    expect(alarmsFor({ kind: 'still', estimatedSec: 300 }, 400)).toEqual([]);
    expect(alarmsFor({ kind: 'still', estimatedSec: 300 }, 901)).toEqual(['排队长']);
    expect(alarmsFor({ kind: 'render', estimatedSec: 30 }, 301)).toEqual(['小任务等待']);
    expect(alarmsFor({ kind: 'render' }, 301)).toEqual([]);
  });
});

describe('盯', () => {
  /** 机器类告警只醒此刻有活的会话：默认让挂 盯 的会话自己有一个在跑的任务。 */
  const hasActive = (...sessions: string[]) => { const s = baseState(Date.now()); s.在跑 = sessions.map(k => ({ task: 'M-' + k, start: 0, heartbeat: 0, initiator: readCaller({ CLAUDE_CODE_SESSION_ID: k }, [], dir, false), decl: { kind: 'render' }, host: 'h' })); return s; };
  const runWatch = async (e: SchedulerEnv, o: Parameters<typeof watchSched>[1] = {}) => {
    const out: string[] = [];
    const code = await watchSched(e, { maxSec: 0.05, 读: () => hasActive(e.caller.session), parentAlive: () => true, output: x => out.push(x), sleep: () => new Promise<void>(r => setTimeout(r, 10)), ...o });
    return { code, out };
  };
  /** 先挂一次定下游标，后面的事都算没挂时写入的。 */
  const pinCursor = async (e: SchedulerEnv) => { expect((await runWatch(e)).code).toBe(124); };
  const recordAlert = (e: SchedulerEnv, alarmKind: string, timeMs = Date.now()) => recordSchedulerEvent(e.logDir, '告警', { type: alarmKind, subject: '机器', attempts: 1 }, timeMs);

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
    expect(JSON.parse(fs.readFileSync(path.join(e.schedulerDir, '游标-sess0001.json'), 'utf8')).month).toBe('2026-11');
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
    recordSchedulerEvent(e.logDir, '任务起', { task: 'X' }); expect((await runWatch(e)).code).toBe(124);
    recordSchedulerEvent(e.logDir, '崩溃', { task: 'X', initiator: { pid: 123 }, decl: { segment: '6-斩娜迦' } });
    expect((await runWatch(e)).out[0]).toContain('崩溃 #123 6-斩娜迦');
    recordSchedulerEvent(e.logDir, '回收死锁', { task: 'Y', prevHolder: { pid: 123 } });
    expect((await runWatch(e)).out[0]).toContain('回收死锁 #123');
  });
  describe('按归属分发', () => {
    const taskAlert = (e: SchedulerEnv, session: string) => recordSchedulerEvent(e.logDir, '告警', { type: '排队长', subject: 'T9', attempts: 1, pid: 9, session: session });
    /** 让会话 k 看起来挂着 盯（本测试进程的 pid 是活的）。 */
    const addWatch = (e: SchedulerEnv, k: string) => { fs.mkdirSync(path.join(e.schedulerDir, '盯'), { recursive: true }); fs.writeFileSync(path.join(e.schedulerDir, '盯', `其他-${k}.json`), JSON.stringify({ pid: process.pid, session: k })); };
    const leftWatch = (e: SchedulerEnv, k: string, msAgo: number) => { fs.mkdirSync(e.schedulerDir, { recursive: true }); fs.writeFileSync(path.join(e.schedulerDir, `离盯-${k}.json`), JSON.stringify({ timestamp: Date.now() - msAgo })); };
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
      recordSchedulerEvent(e.logDir, '回收死锁', { initiator: { session: 'sess0001' }, prevHolder: { pid: 5, initiator: { session: 'other' } } }); expect((await runWatch(e)).code).toBe(124);
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
    s.ticket = [Ticket('001-h-7', { start: 0, initiator: otherInitiator })]; s.lockHolders = [holdLock({ lockAcquiredAt: 0, frameTime: 0, initiator: otherInitiator })];
    const a = judgeAlerts(s, s.timestamp); expect(a.length).toBeGreaterThan(1);
    expect(a.every(x => x.session === 'other123')).toBe(true);
  });
  it('别的会话的路完不叫醒，同会话的叫醒', async () => {
    const e = makeSchedEnv(); await pinCursor(e);
    recordSchedulerEvent(e.logDir, '路完', { lane: '别人的', initiator: { session: 'other' } }); expect((await runWatch(e)).code).toBe(124);
    recordSchedulerEvent(e.logDir, '路败', { lane: '我的', initiator: { session: 'sess0001' } }); expect((await runWatch(e)).out[0]).toContain('路败 我的');
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
  it('--task：#pid、任务 id、任意历史票名都认；任务已结束立刻报', async () => {
    const e = makeSchedEnv(), logEvent = (eventName: string, x: Record<string, unknown>) => recordSchedulerEvent(e.logDir, eventName, { task: 'T7', initiator: { pid: 777 }, ...x });
    logEvent('任务起', {}); logEvent('领票', { ticket: '0001-h-777' }); logEvent('改序', { ticket: '0000-h-777', 原序: '0001-h-777', 新序: '0000-h-777' }); logEvent('领票', { ticket: '0002-h-777' });
    for (const taskName of ['#777', '777', 'T7', '0001-h-777', '0000-h-777', '0002-h-777']) expect((await runWatch(e, { task: taskName })).code, taskName).toBe(124);
    logEvent('任务止', { ticket: '0002-h-777', exitCode: 0 });
    for (const taskName of ['#777', 'T7', '0001-h-777']) { const r = await runWatch(e, { task: taskName }); expect(r.code, taskName).toBe(0); expect(r.out[0]).toContain('任务止 #777'); expect(r.out[0]).toContain('退出码0'); }
  });
  it('--task 目标被 SIGKILL 时按崩溃醒，只醒一次', async () => {
    const e = makeSchedEnv(); recordSchedulerEvent(e.logDir, '任务起', { task: 'K', initiator: { pid: 55 } }); await pinCursor(e);
    recordSchedulerEvent(e.logDir, '崩溃', { task: 'K', initiator: { pid: 55 } });
    const r = await runWatch(e, { task: 'K' }); expect(r.code).toBe(0); expect(r.out[0]!.match(/崩溃/g)).toHaveLength(1);
  });
  it('--task 只等自己的任务：无关告警不退出、不消费，全局 盯 照样醒；它也不算挂了看守', async () => {
    const e = makeSchedEnv(); await pinCursor(e);
    recordSchedulerEvent(e.logDir, '任务起', { task: 'X', initiator: { pid: 111 } }); recordAlert(e, '持锁者死');
    const r = await runWatch(e, { task: 'X', sleep: async () => { expect(fs.readdirSync(path.join(e.schedulerDir, '盯'))).toEqual([]); await new Promise(r => setTimeout(r, 10)); } });
    expect(r).toEqual({ code: 124, out: [] });
    const g = await runWatch(e); expect(g.code).toBe(0); expect(g.out[0]).toContain('持锁者死');
  });
  it('--task 匹配不到报用法错误，不默默等到点', async () => {
    const e = makeSchedEnv(); recordSchedulerEvent(e.logDir, '任务起', { task: 'K', initiator: { pid: 55 } });
    await expect(runWatch(e, { task: '#56' })).rejects.toBeInstanceOf(UsageError);
    await expect(runWatch(e, { task: '没有这张票' })).rejects.toBeInstanceOf(UsageError);
  });
  it('全局那只先读过任务止，--task 那只照样醒', async () => {
    const e = makeSchedEnv(); recordSchedulerEvent(e.logDir, '任务起', { task: 'K', initiator: { pid: 55 } });
    const wakeRun = runWatch(e, { task: 'K', maxSec: 2 }); await pinCursor(e);
    recordSchedulerEvent(e.logDir, '任务止', { task: 'K', initiator: { pid: 55 } }); await pinCursor(e);
    expect((await wakeRun).code).toBe(0);
  });
  it('看 的告警行带时间，被汇报挤过 16 KB 还在', () => {
    const e = makeSchedEnv(), timeMs = Date.now(); recordSchedulerEvent(e.logDir, '告警', { type: '内存压力', subject: '机器', attempts: 1 }, timeMs);
    for (let i = 0; i < 60; i++) recordSchedulerEvent(e.logDir, '汇报', { observed: 'x'.repeat(900) });
    const s = readState(e, () => baseState().machine, false);
    expect(renderView(s)).toContain(`告警 ${new Date(timeMs).toISOString().slice(5, 19)}Z 内存压力 机器`);
    expect(s.最近.every(x => x.event === '告警' || x.event === '决定')).toBe(true);
  });
  it('读调度 的尾部能跨月', () => {
    const e = makeSchedEnv(); recordSchedulerEvent(e.logDir, '甲', {}, Date.parse('2026-10-31T23:59:50Z')); recordSchedulerEvent(e.logDir, '乙', {}, Date.parse('2026-11-01T00:00:01Z'));
    expect(readSchedulerEvents(e.logDir, 4096).map(x => x.event)).toEqual(['甲', '乙']);
    expect(readSchedulerEvents(e.logDir).map(x => x.event)).toEqual(['甲', '乙']);
  });

  const runSubWatch = (prefix: string) => {
    const modulePathLiteral = (n: string) => JSON.stringify(path.join(import.meta.dirname, n));
    const scriptSource = `import {watchSched} from ${modulePathLiteral('盯.ts')};import {resolveSchedulerEnv} from ${modulePathLiteral('任务.ts')};import {readCaller} from ${modulePathLiteral('发起者.ts')};
const e=resolveSchedulerEnv({lockDir:${JSON.stringify(dir)},caller:readCaller({CLAUDE_CODE_SESSION_ID:'sess0001'},[],${JSON.stringify(dir)},false)});
const machine={load:1,cores:10,gate:40,pressure:1,free:1,compressed:1,swap:0,swapOut:0,GPU:1,thermal:1,disk:1,orphans:0,processes:''};
console.log('ready');
process.exitCode=await watchSched(e,{maxSec:4,parentAlive:()=>true,读:()=>({timestamp:Date.now(),machine,lockHolders:[],ticket:[],在跑:[{task:'M',start:0,heartbeat:0,initiator:e.caller,decl:{kind:'render'},host:'h'}],最近:[]}),sleep:()=>new Promise(r=>setTimeout(r,20)),output:s=>console.log(${JSON.stringify(prefix)}+s)});`;
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
    const e = makeSchedEnv(); await runWatch(e, { 读: () => readState(e, () => baseState().machine) });
    const wakeRun = runWatch(e, { maxSec: 8, 读: () => readState(e, () => baseState().machine) });
    const dead = once(c, 'exit'); c.kill('SIGKILL'); await dead;
    const r = await wakeRun; expect(r.code).toBe(0); expect(r.out[0]).toMatch(/崩溃|持锁者死/); expect(r.out[0]).toContain(`#${c.pid}`);
  }, 20000);
});


