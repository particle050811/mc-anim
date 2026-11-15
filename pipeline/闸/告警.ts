import path from 'node:path';
import { readJson, writeJson, promptOnly } from './文件.ts';
import type { SchedulerState } from './看.ts';
import type { Ticket } from './票.ts';
import type { SchedulerEnv } from './任务.ts';
import { recordSchedulerEvent, readSchedulerEvents, type SchedulerEvent } from './调度日志.ts';
import { tryLocked, lockPath } from './锁.ts';
export type Alert = {
    类: string;
    对象: string;
    值: number;
    阈值: number;
    次数: number;
    pid?: number;
    段?: string;
    票?: string;
    /** 发起这个任务的会话：盯 只叫醒它（机器类告警不填，按此刻谁有活分发）。 */
    会话?: string;
};
// 发热阈值 3 是 Agent 选的初值：实测约 3 分钟到 2 并一直保持，渲染结束半分钟内回落；
// 2 是这台机器渲染的常态，叫醒没有可做的动作；14 分钟连跑没到过 3。温度不作准入条件。
// 静帧无帧 90 秒：静帧一帧常态约 4 秒，连开浏览器、载地形的头一帧也在半分钟内；卡住的静帧常被调用方自己的超时在 3～7 分钟杀掉重来，
// 等不到 5 分钟那条（用户 11-10 定加，起因是同一帧反复卡、反复超时却一次没报）。
export const defaultThresholds = { memory: 180, smallTask: 300, anyTaskSec: 600, queueDepth: 4, noFrameSec: 300, stillNoFrameSec: 90, 负载: 180, batch: 1800, heatLimit: 3, repeatFailWindowSec: 1800 };
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
type FrameSample = { 时: number; 帧: number };
const lockTarget = (x: SchedulerState['持锁'][number]) => `${x.任务}/${x.声明.段 ?? x.票}`;
/** 近 3 分钟帧速 / 之前帧速；样本不够返回 null。 */
export const frameRateRatio = (frameSamples: FrameSample[], now: number): number | null => {
    const nearestSample = frameSamples.findLast(x => now - x.时 >= slowWindowMs), latest = frameSamples.at(-1), baseSample = frameSamples.find(x => now - x.时 <= baselineWindowMs);
    if (!nearestSample || !latest || !baseSample || nearestSample.时 - baseSample.时 < baselineMinMs || latest.时 <= nearestSample.时)
        return null;
    const before = (nearestSample.帧 - baseSample.帧) / (nearestSample.时 - baseSample.时), lateSlope = (latest.帧 - nearestSample.帧) / (latest.时 - nearestSample.时);
    return before > 0 ? lateSlope / before : null;
};
const anyJobSlowing = (s: SchedulerState, h: MonitorHistory) => s.持锁.some(x => !x.死 && x.总帧 && x.已出帧 < x.总帧 && (frameRateRatio(h.帧[lockTarget(x)] ?? [], s.时) ?? 1) < 0.5);
export type MonitorHistory = {
    上次?: number;
    负载起?: number;
    /** 压力连续至少 2 的起点 */
    压力起?: number;
    /** 持锁者出帧样本，约 25 秒一个、留 15 分钟，按持锁对象分 */
    帧: Record<string, FrameSample[]>;
    swap: {
        时: number;
        量: number;
    }[];
    孤儿轮: number;
    高水位: number;
    /** 进行中的事件：已通知到第几次、条件最后一次成立的时刻。 */
    去重: Record<string, {
        次数: number;
        末: number;
    }>;
};
export const emptyHistory = (): MonitorHistory => ({ swap: [], 帧: {}, 孤儿轮: 0, 高水位: 0, 去重: {} });
const alertKey = (a: Alert) => a.类 + ':' + a.对象;
/** 暂缓是主 Agent 的决定，不是卡住；到期后票主人重置等待起点，别的进程可能先看到过期的暂缓至，所以不比时刻。死票没人在等。 */
const isWaiting = (t: Ticket) => !t.内容?.暂缓至 && !t.死;
/** 此刻成立的全部条件，不管通知过没有。 */
const judgeConditions = (s: SchedulerState, now: number, thresholds: typeof defaultThresholds, h: MonitorHistory): Alert[] => {
    const out: Alert[] = [];
    const addAlert = (alarmKind: string, target: string, value: number, threshold: number, extra: Pick<Alert, 'pid' | '段' | '票' | '会话'> = {}) => { if (value >= threshold)
        out.push({ 类: alarmKind, 对象: target, 值: value, 阈值: threshold, 次数: Math.min(3, 1 + Math.floor(Math.log2(Math.max(1, value / threshold)))), ...extra }); };
    const waiting = s.票.filter(isWaiting);
    // 低优先的票本来就排在别人后面、只用空闲，等得久不告警、不算队深（用户 11-06 定的让路做法，11-14 定扩到全部排队类）
    const normal = waiting.filter(t => !t.内容?.声明?.低优先);
    for (const t of normal) {
        const c = t.内容, waitSec = (now - (c?.起 ?? t.时间)) / 1000, d = c?.声明, estimatedSec = d?.预计秒 ?? null;
        // 改序会换票名，对象用任务 id（旧票不能改序，没有任务 id）。
        const target = c?.任务 ?? t.名, extra = { pid: t.pid, 段: d?.段, 票: t.名, 会话: c?.发起.会话 };
        if (c?.等内存起 !== undefined)
            addAlert('等内存', target, (now - c.等内存起) / 1000, thresholds.memory, extra);
        if (estimatedSec === null ? d?.种 === 'still' : estimatedSec <= 60)
            addAlert('小任务等待', target, waitSec, thresholds.smallTask, extra);
        addAlert('排队长', target, waitSec, Math.max(thresholds.anyTaskSec, 3 * (estimatedSec ?? 0)), extra);
        if (t.文件.includes('放行.排队'))
            addAlert('重任务等待', target, waitSec, 600, extra);
    }
    if (normal.length >= thresholds.queueDepth)
        out.push({ 类: '队深', 对象: '全局', 值: normal.length, 阈值: thresholds.queueDepth, 次数: 1 });
    for (const x of s.持锁) {
        // 一次 film 多段共用一个任务，只用任务 id 时后面段的卡死会被前面段的告警吞掉。
        const target = `${x.任务}/${x.声明.段 ?? x.票}`, extra = { pid: x.pid, 段: x.声明.段, 票: x.票, 会话: x.发起.会话 };
        if (x.死) {
            addAlert('持锁者死', target, 1, 1, extra);
            continue;
        }
        const heldSec = (now - x.拿锁时) / 1000, estimatedSec = x.声明.预计秒;
        addAlert('持锁超时', target, heldSec, estimatedSec ? Math.max(3 * estimatedSec, estimatedSec + 600) : 1800, extra);
        if (x.心跳 && x.总帧 && x.已出帧 < x.总帧)
            addAlert('无帧', target, (now - x.帧时) / 1000, x.声明.种 === 'still' ? thresholds.stillNoFrameSec : thresholds.noFrameSec, extra);
        if (x.声明.连贯 && waiting.some(t => now - (t.内容?.起 ?? t.时间) > 300000))
            addAlert('连贯批', target, heldSec, thresholds.batch, extra);
    }
    if (h.负载起 !== undefined)
        addAlert('负载', '机器', (now - h.负载起) / 1000, thresholds.负载);
    const pressure = s.机.压力 ?? 0, isSlow = pressure >= 2 && anyJobSlowing(s, h);
    if (pressure >= 4 || (isSlow && h.压力起 !== undefined && now - h.压力起 >= slowWindowMs))
        addAlert('内存压力', '机器', pressure, pressure >= 4 ? 4 : 2);
    if (s.机.发热等级 != null)
        addAlert('发热', '机器', s.机.发热等级, thresholds.heatLimit);
    const old = h.swap.findLast(x => now - x.时 >= 170000);
    if (old && s.机.swap !== null && isSlow)
        addAlert('swap增长', '机器', s.机.swap - old.量, 2 ** 30);
    addAlert('孤儿Chrome', '机器', h.孤儿轮, 2);
    return out;
};
export const updateHistory = (s: SchedulerState, h: MonitorHistory, thresholds = defaultThresholds): MonitorHistory => {
    const hasGap = h.上次 !== undefined && s.时 - h.上次 > gapMs, { 负载: load, 核: cores, 孤儿: orphans, swap, 压力: pressure } = s.机;
    const prevLoadStart = hasGap ? undefined : h.负载起, prevOrphanRounds = hasGap ? 0 : h.孤儿轮, prevPressureStartMs = hasGap ? undefined : h.压力起;
    const frameSamples: MonitorHistory['帧'] = {};
    for (const x of s.持锁) {
        if (x.死 || !x.总帧)
            continue;
        const k = lockTarget(x), prevSamples = hasGap ? [] : (h.帧?.[k] ?? []).filter(y => s.时 - y.时 <= baselineWindowMs), lastSample = prevSamples.at(-1);
        frameSamples[k] = !lastSample || s.时 - lastSample.时 >= frameSampleIntervalMs ? [...prevSamples, { 时: s.时, 帧: x.已出帧 }] : prevSamples;
    }
    const n: MonitorHistory = { 上次: s.时,
        // 读不到时不下结论：既不算过载，也不算恢复。
        负载起: load === null ? prevLoadStart : load > cores * 2 ? (prevLoadStart ?? s.时) : undefined,
        压力起: pressure === null ? prevPressureStartMs : pressure >= 2 ? (prevPressureStartMs ?? s.时) : undefined,
        帧: frameSamples,
        孤儿轮: orphans === null ? prevOrphanRounds : orphans ? prevOrphanRounds + 1 : 0,
        // 比 3 分钟多留 30 秒：持锁者 30 秒一采，定时器稍晚就会挤掉 180 秒前那个样本，再也凑不够窗口。
        swap: [...(hasGap ? [] : h.swap.filter(x => s.时 - x.时 <= 210000)), ...(swap === null ? [] : [{ 时: s.时, 量: swap }])],
        高水位: s.票.some(isWaiting) ? h.高水位 : 0, 去重: {} };
    const established = new Set(judgeConditions(s, s.时, thresholds, n).map(alertKey));
    for (const [k, v] of Object.entries(h.去重))
        // 这么久没见它成立（消失了，或这段时间没人采样）就算结束，此刻再成立是新事件。
        if (s.时 - v.末 < resetMs)
            n.去重[k] = established.has(k) ? { ...v, 末: s.时 } : v;
    return n;
};
/** 历史、时间与阈值由调用者提供。 */
export const judgeAlerts = (s: SchedulerState, now: number, thresholds = defaultThresholds, h: MonitorHistory = emptyHistory()): Alert[] => judgeConditions(s, now, thresholds, h).filter(a => a.类 === '队深' ? a.值 > h.高水位 : a.次数 > (h.去重[alertKey(a)]?.次数 ?? 0));
export const recordAlerts = (e: SchedulerEnv, s: SchedulerState, h: MonitorHistory, alarms: Alert[]) => {
    for (const a of alarms) {
        if (a.类 === '队深')
            h.高水位 = Math.max(h.高水位, a.值);
        else
            h.去重[alertKey(a)] = { 次数: a.次数, 末: s.时 };
        recordSchedulerEvent(e.logDir, '告警', { ...a, 机: { ...s.机, 进程: undefined } }, s.时);
    }
    promptOnly('告警记录', () => writeJson(path.join(e.schedulerDir, '监测.json'), h));
    return alarms;
};
export const readMonitor = (e: SchedulerEnv) => readJson<MonitorHistory>(path.join(e.schedulerDir, '监测.json')) ?? emptyHistory();
/** 读历史、判、记、写回在一把短锁里做完，多个等待者和 盯 不会重复记同一条。锁被人拿着就跳过：他手里是同一时刻的快照。 */
export const monitorRound = (e: SchedulerEnv, s: SchedulerState) => tryLocked(lockPath(e.schedulerDir, '监测'), e.localHost, () => {
    const h = updateHistory(s, readMonitor(e));
    return recordAlerts(e, s, h, judgeAlerts(s, s.时, undefined, h));
}) ?? [];
type StillDecl = { 种?: string; 作品?: string; 段?: string; 帧?: string };
/**
 * 同一个工作区、同一段、同一批帧的静帧连着没出来（超时被杀、异常），第二次起就报：每次重来都是新任务新票，
 * 按任务去重的告警看不出「同一件事又失败了」（用户 11-10 定加）。事件 = 这次的 放锁，结果不是 成。返回报了的告警。
 */
export const reportRepeatedStillFail = (logDir: string, current: { 声明: StillDecl; 工作区?: string; 任务: string; pid?: number; 会话?: string }, now: number, previous: SchedulerEvent[] = readSchedulerEvents(logDir, 512 * 1024), windowSec = defaultThresholds.repeatFailWindowSec): Alert | undefined => {
    const d = current.声明;
    if (d.种 !== 'still' || !d.段)
        return;
    const isSameFailure = (x: SchedulerEvent) => { const otherDecl = x.声明 as StillDecl | undefined, initiator = x.发起 as { 工作区?: string } | undefined; return x.事 === '放锁' && x.结果 !== '成' && x.任务 !== current.任务 && otherDecl?.种 === 'still' && otherDecl.作品 === d.作品 && otherDecl.段 === d.段 && otherDecl.帧 === d.帧 && initiator?.工作区 === current.工作区 && now - Date.parse(x.时) <= windowSec * 1000; };
    // 中间成功过一次就从头数
    let consecutiveFails = 1;
    for (const x of [...previous].reverse()) {
        const otherDecl = x.声明 as StillDecl | undefined, initiator = x.发起 as { 工作区?: string } | undefined;
        if (x.事 !== '放锁' || x.任务 === current.任务 || otherDecl?.种 !== 'still' || otherDecl.作品 !== d.作品 || otherDecl.段 !== d.段 || otherDecl.帧 !== d.帧 || initiator?.工作区 !== current.工作区)
            continue;
        if (!isSameFailure(x))
            break;
        consecutiveFails++;
    }
    // 同别的告警：首次、×2、×4，最多三次（连败 2、4、8 次时报）。排查卡死时同一帧会连着失败很多次，每次都叫醒只是噪声
    const retryLevel = [2, 4, 8].indexOf(consecutiveFails) + 1;
    if (!retryLevel)
        return;
    const a: Alert = { 类: '静帧重复失败', 对象: `${d.段}@${d.帧 ?? '?'}`, 值: consecutiveFails, 阈值: 2, 次数: retryLevel, pid: current.pid, 段: d.段, 会话: current.会话 };
    recordSchedulerEvent(logDir, '告警', { ...a }, now);
    return a;
};
