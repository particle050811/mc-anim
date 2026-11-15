import fs from 'node:fs';
import path from 'node:path';
import { UsageError } from '../cli/参数.ts';
import { writeJson, readJson, promptOnly, listFiles } from './文件.ts';
import { readNewEvents, type LogPosition, type SchedulerEvent } from './调度日志.ts';
import { processAlive, tryLocked, lockPath } from './锁.ts';
import { readState, oneLineStatus, type SchedulerState } from './看.ts';
import { monitorRound } from './告警.ts';
import { parseTicket } from './票.ts';
import type { SchedulerEnv } from './任务.ts';
export const timeoutExitCode = 124;
const maxPerRound = 3;
/** 新会话第一次挂：更早的事当新事件报，只会让人去查不存在的事故。默认挂 29 分钟，30 分钟内的算重挂间隙里该知道的。 */
const firstAttachLookbackMs = 1800_000;
/** 盯 退出到钩子重挂之间有空档（报完一件、前台长命令跑着都不挂），这么久内离开的会话还算在盯。 */
const reattachGraceMs = 120_000;
const leftWatchFile = (e: SchedulerEnv, session: string) => path.join(e.schedulerDir, `离盯-${session}.json`);
/** 此刻挂着 盯 的会话，和判断「刚离开」用的读法。 */
const watchedSessions = (e: SchedulerEnv) => {
    const dir = path.join(e.schedulerDir, '盯'), active = new Set<string>();
    for (const n of listFiles(dir)) {
        const x = readJson<{ pid: number; 会话: string }>(path.join(dir, n));
        if (x && processAlive(x.pid))
            active.add(x.会话);
    }
    return { active, justLeft: (session: string) => e.nowMs() - (readJson<{ 时: number }>(leftWatchFile(e, session))?.时 ?? 0) < reattachGraceMs };
};
type WatchedSessions = ReturnType<typeof watchedSessions>;
const initiatorSession = (x: unknown) => (x as { 发起?: { 会话?: string } } | undefined)?.发起?.会话;
/** 此刻有任务在跑、持锁或排队的会话；人手起的、旧闸的没有会话，记成空串。 */
const activeSessions = (s: SchedulerState) => new Set([...s.在跑.map(initiatorSession), ...s.持锁.filter(x => !x.死).map(initiatorSession), ...s.票.filter(t => !t.死).map(t => initiatorSession(t.内容))].map(x => x ?? ''));
/**
 * 告警按归属分发（用户 11-15 定，此前每个会话都被别人的告警叫醒）：
 * 任务类只醒任务的主人；机器类（负载、压力、发热……）只醒此刻在机器上有活的会话，谁都没活就不醒；
 * 主人没挂 盯（会话关了、人手起的、没挂看守的 Codex）就照旧醒所有在盯的会话，免得没人管。
 * 主人刚离开、还在重挂宽限里的返回「待」：游标停在这件之前，过一会儿再判，别让它在空档里被广播或漏掉。
 */
const judgeWake = (e: SchedulerEnv, x: SchedulerEvent, s: SchedulerState, watch: () => WatchedSessions): '醒' | '跳' | '待' => {
    const mySession = e.caller.会话;
    if (['路完', '路败'].includes(x.事))
        return initiatorSession(x) === mySession ? '醒' : '跳';
    if (!['告警', '崩溃', '回收死锁', '放行过期'].includes(x.事))
        return '跳';
    // 人手挂的 盯 没有会话，什么都看
    if (!mySession)
        return '醒';
    let owners: string[];
    if (x.事 === '告警' && ['机器', '全局'].includes(String(x.对象))) {
        owners = [...activeSessions(s)];
        if (!owners.length)
            return '跳';
    }
    else
        owners = [String((x.事 === '告警' ? x.会话 : initiatorSession(x.事 === '回收死锁' ? { 发起: (x.原持有者 as { 发起?: unknown } | undefined)?.发起 } : x)) ?? '')];
    if (owners.includes(mySession))
        return '醒';
    const g = watch(), absent = owners.filter(k => !k || !g.active.has(k));
    if (!absent.length)
        return '跳';
    return absent.every(k => k && g.justLeft(k)) ? '待' : '醒';
};
const taskEnded = (x: SchedulerEvent, task: string) => (x.事 === '任务止' || x.事 === '崩溃') && x.任务 === task;
/** 票会改名，一个任务多张票，看 又只显示 #pid：一律按日志里见过的名字解析成任务 id。同 pid 取最新，pid 会复用。 */
const parseTask = (schedDir: string, target: string) => {
    const { 行: rows, endCursor } = readNewEvents(schedDir), pid = Number(/^#?(\d+)$/.exec(target)?.[1]);
    const matchesEvent = (x: SchedulerEvent) => [x.任务, x.票, x.原序, x.新序, x.原名, x.新名].includes(target) || (pid > 0 && ((x.发起 as { pid?: number } | undefined)?.pid === pid || parseTicket(String(x.票))?.pid === pid));
    const task = rows.findLast(r => r.事件.任务 && matchesEvent(r.事件))?.事件.任务;
    if (!task)
        throw new UsageError(`--task ${target} 在调度日志里找不到；要 #pid、任务 id 或票名。旧闸的任务不写日志，用 anim sched wait --pid`);
    return { 任务: task, stoppedEvent: rows.findLast(r => taskEnded(r.事件, task))?.事件, 位: endCursor };
};
const describeEvent = (x: SchedulerEvent) => {
    const initiator = x.发起 as { pid?: number } | undefined, eventDecl = x.声明 as { 段?: string } | undefined, prevHolder = x.原持有者 as { pid?: number } | undefined;
    const source = x.路 ?? (x.事 === '回收死锁' ? `#${prevHolder?.pid ?? '?'}` : x.pid !== undefined ? `#${x.pid} ${x.段 ?? ''}` : x.对象 ?? (initiator?.pid ? `#${initiator.pid} ${eventDecl?.段 ?? ''}` : x.任务));
    const suffix = Number(x.次数) > 1 ? ` 第${x.次数}次` : x.退出码 !== undefined ? ` 退出码${x.退出码}` : '';
    return `${x.时.slice(5, 19)}Z ${x.事 === '告警' ? x.类 : x.事} ${String(source).trim()}${suffix}`;
};
const heaviest = (events: SchedulerEvent[]) => { const eventNames = events.map(x => String(x.事 === '告警' ? x.类 : x.事)); return ['持锁者死', '崩溃', '回收死锁', '内存压力'].find(x => eventNames.includes(x)) ?? eventNames[0]; };
export const watchSched = async (e: SchedulerEnv, o: {
    maxSec?: number;
    任务?: string;
    输出?: (s: string) => void;
    读?: () => SchedulerState;
    sleep?: (ms: number) => Promise<void>;
    parentAlive?: () => boolean;
} = {}) => {
    const targetTask = o.任务 ? parseTask(e.logDir, o.任务) : undefined;
    const pause = () => (o.sleep ?? (ms => new Promise(r => setTimeout(r, ms))))(5000);
    const startMs = e.nowMs(), parentPid = process.ppid, live = path.join(e.schedulerDir, '盯', process.pid + '.json');
    // --task 只等自己的任务，不算挂了看守：它不报告警。
    if (!targetTask)
        writeJson(live, { pid: process.pid, 会话: e.caller.会话, 起: startMs });
    // 按会话一份；同会话两只 盯 共用，一件事只醒一只。
    const cursorName = `游标-${e.caller.会话 || '人'}`, cursorFile = path.join(e.schedulerDir, cursorName + '.json'), cursorLock = lockPath(e.schedulerDir, cursorName);
    try {
        while ((o.parentAlive ?? (() => process.ppid === parentPid && processAlive(parentPid)))()) {
            if (e.nowMs() - startMs >= (o.maxSec ?? 1740) * 1000)
                return timeoutExitCode;
            const s = (o.读 ?? (() => readState(e)))();
            promptOnly('监测', () => { monitorRound(e, s); });
            // --task 不碰共用游标：主子 Agent 可能共用会话，子代理读走告警主 Agent 就不醒了；`sched watch --task X && 下一步` 也不能因为别的告警提前走。
            if (targetTask) {
                const { 行: rows, endCursor } = readNewEvents(e.logDir, targetTask.位), endEvent = targetTask.stoppedEvent ?? rows.find(r => taskEnded(r.事件, targetTask.任务))?.事件;
                targetTask.位 = endCursor;
                if (endEvent) {
                    (o.输出 ?? console.log)(`${describeEvent(endEvent)} | ${oneLineStatus(s)}`);
                    return 0;
                }
                await pause();
                continue;
            }
            const trialResult = tryLocked(cursorLock, e.localHost, () => {
                const savedCursor = readJson<LogPosition>(cursorFile), cursor = typeof savedCursor?.偏移 === 'number' ? savedCursor : null;
                const { 行: rows, endCursor } = readNewEvents(e.logDir, cursor);
                let watchedCache: WatchedSessions | undefined, stopPos: LogPosition | null | undefined, prevCursor: LogPosition | null = cursor;
                const unread: typeof rows = [];
                for (const r of rows) {
                    if (cursor || s.时 - Date.parse(r.事件.时) <= firstAttachLookbackMs) {
                        const v = judgeWake(e, r.事件, s, () => (watchedCache ??= watchedSessions(e)));
                        if (v === '待') {
                            stopPos = prevCursor;
                            break;
                        }
                        if (v === '醒')
                            unread.push(r);
                    }
                    prevCursor = r.到;
                }
                const batch = unread.slice(0, maxPerRound), unreported = unread.slice(batch.length);
                // 没报的留在游标后面，下一只接着报；游标写坏了顶多重报，不能挡住这次叫醒。
                // 停在第一件之前又没有游标（新会话首挂）就不写，下一轮照样按首挂回看。
                const nextCursor = unreported.length ? batch.at(-1)!.到 : stopPos !== undefined ? stopPos : endCursor;
                if (nextCursor && (nextCursor.月 !== cursor?.月 || nextCursor.偏移 !== cursor.偏移))
                    promptOnly('盯游标', () => writeJson(cursorFile, nextCursor));
                return { report: batch.map(r => r.事件), 余: unreported.map(r => r.事件) };
            });
            if (trialResult?.report.length) {
                (o.输出 ?? console.log)(`${trialResult.report.map(describeEvent).join('；')}${trialResult.余.length ? `；另${trialResult.余.length}件未报（最重 ${heaviest(trialResult.余)}），重挂接着报` : ''} | ${oneLineStatus(s)}`);
                return 0;
            }
            await pause();
        }
        return 0;
    }
    finally {
        fs.rmSync(live, { force: true });
        if (!targetTask && e.caller.会话)
            promptOnly('离盯', () => writeJson(leftWatchFile(e, e.caller.会话), { 时: e.nowMs() }));
    }
};
