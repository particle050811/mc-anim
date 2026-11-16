import path from 'node:path';
import { readJson, writeJson, promptOnly } from './文件.ts';
import type { SchedulerState } from './看.ts';
import type { Ticket } from './票.ts';
import type { SchedulerEnv } from './任务.ts';
import { recordSchedulerEvent, readSchedulerEvents, type SchedulerEvent } from './调度日志.ts';
import { tryLocked, lockPath } from './锁.ts';
export type Alert = {
    type: string;
    subject: string;
    value: number;
    threshold: number;
    attempts: number;
    pid?: number;
    segment?: string;
    ticket?: string;
    /** 发起这个任务的会话：盯 只叫醒它（机器类告警不填，按此刻谁有活分发）。 */
    session?: string;
};
// 发热阈值 3 是 Agent 选的初值：实测约 3 分钟到 2 并一直保持，渲染结束半分钟内回落；
// 2 是这台机器渲染的常态，叫醒没有可做的动作；14 分钟连跑没到过 3。温度不作准入条件。
// 静帧无帧 90 秒：静帧一帧常态约 4 秒，连开浏览器、载地形的头一帧也在半分钟内；卡住的静帧常被调用方自己的超时在 3～7 分钟杀掉重来，
// 等不到 5 分钟那条（用户 11-10 定加，起因是同一帧反复卡、反复超时却一次没报）。
export const defaultThresholds = { memory: 180, smallTask: 300, anyTaskSec: 600, queueDepth: 4, noFrameSec: 300, stillNoFrameSec: 90, load: 180, batch: 1800, heatLimit: 3, repeatFailWindowSec: 1800 };
/** 持锁者每 30 秒采一次，容两次没赶上；再久就不算连续观察到。 */
const gapMs = 90_000;
/** 条件要持续消失这么久才算事件结束：压力这类读数来回跳时，一跳一叫醒比晚 5 分钟复位更糟。 */
const resetMs = 300_000;
/**
 * 内存类告警只在闸兜不住时报（用户 11-14 定）：压力 2、swap 涨是这台机器重渲染的常态，闸本来就按内存限流，
 * 11-07～11-14 的 81 条告警里这两类占 27 条，叫醒主 Agent 都只能「看一眼接着等」。
 * 兜不住 = 压力到 4，或压力 2 持续 3 分钟（swap 3 分钟涨 1 GiB 且压力至少 2）时有持锁者近 3 分钟出帧速度不到之前的一半。
 * 「之前」取 3～15 分钟前，至少要有 5 分钟才比；镜头轻重不一帧速本来就会变，所以要和压力同时成立才算。
 */
const slowWindowMs = 180_000, baselineWindowMs = 900_000, baselineMinMs = 300_000, frameSampleIntervalMs = 25_000;
type FrameSample = { timestamp: number; frame: number };
const lockTarget = (x: SchedulerState['lockHolders'][number]) => `${x.task}/${x.decl.segment ?? x.ticket}`;
/** 近 3 分钟帧速 / 之前帧速；样本不够返回 null。 */
export const frameRateRatio = (frameSamples: FrameSample[], now: number): number | null => {
    const nearestSample = frameSamples.findLast(x => now - x.timestamp >= slowWindowMs), latest = frameSamples.at(-1), baseSample = frameSamples.find(x => now - x.timestamp <= baselineWindowMs);
    if (!nearestSample || !latest || !baseSample || nearestSample.timestamp - baseSample.timestamp < baselineMinMs || latest.timestamp <= nearestSample.timestamp)
        return null;
    const before = (nearestSample.frame - baseSample.frame) / (nearestSample.timestamp - baseSample.timestamp), lateSlope = (latest.frame - nearestSample.frame) / (latest.timestamp - nearestSample.timestamp);
    return before > 0 ? lateSlope / before : null;
};
const anyJobSlowing = (s: SchedulerState, h: MonitorHistory) => s.lockHolders.some(x => !x.死 && x.totalFrames && x.framesDone < x.totalFrames && (frameRateRatio(h.frame[lockTarget(x)] ?? [], s.timestamp) ?? 1) < 0.5);
export type MonitorHistory = {
    last?: number;
    负载起?: number;
    /** 压力连续至少 2 的起点 */
    压力起?: number;
    /** 持锁者出帧样本，约 25 秒一个、留 15 分钟，按持锁对象分 */
    frame: Record<string, FrameSample[]>;
    swap: {
        timestamp: number;
        measure: number;
    }[];
    orphanRounds: number;
    highWater: number;
    /** 进行中的事件：已通知到第几次、条件最后一次成立的时刻。 */
    dedupe: Record<string, {
        attempts: number;
        末: number;
    }>;
};
export const emptyHistory = (): MonitorHistory => ({ swap: [], frame: {}, orphanRounds: 0, highWater: 0, dedupe: {} });
const alertKey = (a: Alert) => a.type + ':' + a.subject;
/** 暂缓是主 Agent 的决定，不是卡住；到期后票主人重置等待起点，别的进程可能先看到过期的暂缓至，所以不比时刻。死票没人在等。 */
const isWaiting = (t: Ticket) => !t.content?.暂缓至 && !t.死;
/** 此刻成立的全部条件，不管通知过没有。 */
const judgeConditions = (s: SchedulerState, now: number, thresholds: typeof defaultThresholds, h: MonitorHistory): Alert[] => {
    const out: Alert[] = [];
    const addAlert = (alarmKind: string, target: string, value: number, threshold: number, extra: Pick<Alert, 'pid' | 'segment' | 'ticket' | 'session'> = {}) => { if (value >= threshold)
        out.push({ type: alarmKind, subject: target, value: value, threshold: threshold, attempts: Math.min(3, 1 + Math.floor(Math.log2(Math.max(1, value / threshold)))), ...extra }); };
    const waiting = s.ticket.filter(isWaiting);
    // 低优先的票本来就排在别人后面、只用空闲，等得久不告警、不算队深（用户 11-06 定的让路做法，11-14 定扩到全部排队类）
    const normal = waiting.filter(t => !t.content?.decl?.lowPriority);
    for (const t of normal) {
        const c = t.content, waitSec = (now - (c?.start ?? t.time)) / 1000, d = c?.decl, estimatedSec = d?.estimatedSec ?? null;
        // 改序会换票名，对象用任务 id（旧票不能改序，没有任务 id）。
        const target = c?.task ?? t.name, extra = { pid: t.pid, segment: d?.segment, ticket: t.name, session: c?.initiator.session };
        if (c?.等内存起 !== undefined)
            addAlert('等内存', target, (now - c.等内存起) / 1000, thresholds.memory, extra);
        if (estimatedSec === null ? d?.kind === 'still' : estimatedSec <= 60)
            addAlert('小任务等待', target, waitSec, thresholds.smallTask, extra);
        addAlert('排队长', target, waitSec, Math.max(thresholds.anyTaskSec, 3 * (estimatedSec ?? 0)), extra);
        if (t.file.includes('放行.排队'))
            addAlert('重任务等待', target, waitSec, 600, extra);
    }
    if (normal.length >= thresholds.queueDepth)
        out.push({ type: '队深', subject: '全局', value: normal.length, threshold: thresholds.queueDepth, attempts: 1 });
    for (const x of s.lockHolders) {
        // 一次 film 多段共用一个任务，只用任务 id 时后面段的卡死会被前面段的告警吞掉。
        const target = `${x.task}/${x.decl.segment ?? x.ticket}`, extra = { pid: x.pid, segment: x.decl.segment, ticket: x.ticket, session: x.initiator.session };
        if (x.死) {
            addAlert('持锁者死', target, 1, 1, extra);
            continue;
        }
        const heldSec = (now - x.lockAcquiredAt) / 1000, estimatedSec = x.decl.estimatedSec;
        addAlert('持锁超时', target, heldSec, estimatedSec ? Math.max(3 * estimatedSec, estimatedSec + 600) : 1800, extra);
        if (x.heartbeat && x.totalFrames && x.framesDone < x.totalFrames)
            addAlert('无帧', target, (now - x.frameTime) / 1000, x.decl.kind === 'still' ? thresholds.stillNoFrameSec : thresholds.noFrameSec, extra);
        if (x.decl.连贯 && waiting.some(t => now - (t.content?.start ?? t.time) > 300000))
            addAlert('连贯批', target, heldSec, thresholds.batch, extra);
    }
    if (h.负载起 !== undefined)
        addAlert('负载', '机器', (now - h.负载起) / 1000, thresholds.load);
    const pressure = s.machine.pressure ?? 0, isSlow = pressure >= 2 && anyJobSlowing(s, h);
    if (pressure >= 4 || (isSlow && h.压力起 !== undefined && now - h.压力起 >= slowWindowMs))
        addAlert('内存压力', '机器', pressure, pressure >= 4 ? 4 : 2);
    if (s.machine.thermalLevel != null)
        addAlert('发热', '机器', s.machine.thermalLevel, thresholds.heatLimit);
    const old = h.swap.findLast(x => now - x.timestamp >= 170000);
    if (old && s.machine.swap !== null && isSlow)
        addAlert('swap增长', '机器', s.machine.swap - old.measure, 2 ** 30);
    addAlert('孤儿Chrome', '机器', h.orphanRounds, 2);
    return out;
};
export const updateHistory = (s: SchedulerState, h: MonitorHistory, thresholds = defaultThresholds): MonitorHistory => {
    const hasGap = h.last !== undefined && s.timestamp - h.last > gapMs, { load: load, cores: cores, orphans: orphans, swap, pressure: pressure } = s.machine;
    const prevLoadStart = hasGap ? undefined : h.负载起, prevOrphanRounds = hasGap ? 0 : h.orphanRounds, prevPressureStartMs = hasGap ? undefined : h.压力起;
    const frameSamples: MonitorHistory['frame'] = {};
    for (const x of s.lockHolders) {
        if (x.死 || !x.totalFrames)
            continue;
        const k = lockTarget(x), prevSamples = hasGap ? [] : (h.frame?.[k] ?? []).filter(y => s.timestamp - y.timestamp <= baselineWindowMs), lastSample = prevSamples.at(-1);
        frameSamples[k] = !lastSample || s.timestamp - lastSample.timestamp >= frameSampleIntervalMs ? [...prevSamples, { timestamp: s.timestamp, frame: x.framesDone }] : prevSamples;
    }
    const n: MonitorHistory = { last: s.timestamp,
        // 读不到时不下结论：既不算过载，也不算恢复。
        负载起: load === null ? prevLoadStart : load > cores * 2 ? (prevLoadStart ?? s.timestamp) : undefined,
        压力起: pressure === null ? prevPressureStartMs : pressure >= 2 ? (prevPressureStartMs ?? s.timestamp) : undefined,
        frame: frameSamples,
        orphanRounds: orphans === null ? prevOrphanRounds : orphans ? prevOrphanRounds + 1 : 0,
        // 比 3 分钟多留 30 秒：持锁者 30 秒一采，定时器稍晚就会挤掉 180 秒前那个样本，再也凑不够窗口。
        swap: [...(hasGap ? [] : h.swap.filter(x => s.timestamp - x.timestamp <= 210000)), ...(swap === null ? [] : [{ timestamp: s.timestamp, measure: swap }])],
        highWater: s.ticket.some(isWaiting) ? h.highWater : 0, dedupe: {} };
    const established = new Set(judgeConditions(s, s.timestamp, thresholds, n).map(alertKey));
    for (const [k, v] of Object.entries(h.dedupe))
        // 这么久没见它成立（消失了，或这段时间没人采样）就算结束，此刻再成立是新事件。
        if (s.timestamp - v.末 < resetMs)
            n.dedupe[k] = established.has(k) ? { ...v, 末: s.timestamp } : v;
    return n;
};
/** 历史、时间与阈值由调用者提供。 */
export const judgeAlerts = (s: SchedulerState, now: number, thresholds = defaultThresholds, h: MonitorHistory = emptyHistory()): Alert[] => judgeConditions(s, now, thresholds, h).filter(a => a.type === '队深' ? a.value > h.highWater : a.attempts > (h.dedupe[alertKey(a)]?.attempts ?? 0));
export const recordAlerts = (e: SchedulerEnv, s: SchedulerState, h: MonitorHistory, alarms: Alert[]) => {
    for (const a of alarms) {
        if (a.type === '队深')
            h.highWater = Math.max(h.highWater, a.value);
        else
            h.dedupe[alertKey(a)] = { attempts: a.attempts, 末: s.timestamp };
        recordSchedulerEvent(e.logDir, '告警', { ...a, machine: { ...s.machine, processes: undefined } }, s.timestamp);
    }
    promptOnly('告警记录', () => writeJson(path.join(e.schedulerDir, '监测.json'), h));
    return alarms;
};
export const readMonitor = (e: SchedulerEnv) => readJson<MonitorHistory>(path.join(e.schedulerDir, '监测.json')) ?? emptyHistory();
/** 读历史、判、记、写回在一把短锁里做完，多个等待者和 盯 不会重复记同一条。锁被人拿着就跳过：他手里是同一时刻的快照。 */
export const monitorRound = (e: SchedulerEnv, s: SchedulerState) => tryLocked(lockPath(e.schedulerDir, '监测'), e.localHost, () => {
    const h = updateHistory(s, readMonitor(e));
    return recordAlerts(e, s, h, judgeAlerts(s, s.timestamp, undefined, h));
}) ?? [];
type StillDecl = { kind?: string; work?: string; segment?: string; frame?: string };
/**
 * 同一个工作区、同一段、同一批帧的静帧连着没出来（超时被杀、异常），第二次起就报：每次重来都是新任务新票，
 * 按任务去重的告警看不出「同一件事又失败了」（用户 11-10 定加）。事件 = 这次的 放锁，结果不是 成。返回报了的告警。
 */
export const reportRepeatedStillFail = (logDir: string, current: { decl: StillDecl; workspace?: string; task: string; pid?: number; session?: string }, now: number, previous: SchedulerEvent[] = readSchedulerEvents(logDir, 512 * 1024), windowSec = defaultThresholds.repeatFailWindowSec): Alert | undefined => {
    const d = current.decl;
    if (d.kind !== 'still' || !d.segment)
        return;
    const isSameFailure = (x: SchedulerEvent) => { const otherDecl = x.decl as StillDecl | undefined, initiator = x.initiator as { workspace?: string } | undefined; return x.event === '放锁' && x.result !== '成' && x.task !== current.task && otherDecl?.kind === 'still' && otherDecl.work === d.work && otherDecl.segment === d.segment && otherDecl.frame === d.frame && initiator?.workspace === current.workspace && now - Date.parse(x.timestamp) <= windowSec * 1000; };
    // 中间成功过一次就从头数
    let consecutiveFails = 1;
    for (const x of [...previous].reverse()) {
        const otherDecl = x.decl as StillDecl | undefined, initiator = x.initiator as { workspace?: string } | undefined;
        if (x.event !== '放锁' || x.task === current.task || otherDecl?.kind !== 'still' || otherDecl.work !== d.work || otherDecl.segment !== d.segment || otherDecl.frame !== d.frame || initiator?.workspace !== current.workspace)
            continue;
        if (!isSameFailure(x))
            break;
        consecutiveFails++;
    }
    // 同别的告警：首次、×2、×4，最多三次（连败 2、4、8 次时报）。排查卡死时同一帧会连着失败很多次，每次都叫醒只是噪声
    const retryLevel = [2, 4, 8].indexOf(consecutiveFails) + 1;
    if (!retryLevel)
        return;
    const a: Alert = { type: '静帧重复失败', subject: `${d.segment}@${d.frame ?? '?'}`, value: consecutiveFails, threshold: 2, attempts: retryLevel, pid: current.pid, segment: d.segment, session: current.session };
    recordSchedulerEvent(logDir, '告警', { ...a }, now);
    return a;
};
