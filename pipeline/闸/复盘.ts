import type { SchedulerEvent } from './调度日志.ts';
const timeOf = (e: SchedulerEvent) => Date.parse(e.timestamp);
const addSec = (totals: Record<string, number>, bucketKey: string, elapsedSec: number) => { totals[bucketKey] = (totals[bucketKey] ?? 0) + elapsedSec; };
const roundValues = (totals: Record<string, number>) => Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Math.round(v * 10) / 10]));
const purposeOf = (e: SchedulerEvent) => (e.decl as { purpose?: string } | undefined)?.purpose ?? '未声明';
const sourceLabel = (v: unknown) => { const f = v as { source?: string; session?: string; lane?: string; workspace?: string } | undefined; return f ? `${f.source ?? '?'}:${f.session ?? ''}/${f.workspace ?? ''}/${f.lane || '未声明路'}` : '未声明'; };
const getSet = <T>(setMap: Map<string, Set<T>>, bucketKey: string) => { const s = setMap.get(bucketKey) ?? new Set<T>(); setMap.set(bucketKey, s); return s; };
/** 排队票的告警对象是任务 id，持锁的是 任务/段；票名只有旧票才用。 */
const related = (a: SchedulerEvent, d: SchedulerEvent) => {
    const target = String(a.subject ?? '');
    return Boolean(d.task && (target === d.task || target.startsWith(`${d.task}/`))) || [d.ticket, d.target].some(x => x && (x === target || x === a.ticket || x === `#${a.pid}`));
};
type HoldSpan = { start: number; end: number; task: string; initiator: unknown; 死: boolean };
export type ReviewOptions = {
    /** 只定汇报哪些。配对总用全部事件：领票可能在窗口外，挡路的持锁者也不一定满足过滤条件。 */
    matches?: (e: SchedulerEvent) => boolean;
    /** 还没结束的等待算到这一刻；不给就算到最后一条事件。 */
    now?: number;
};
export const review = (events: SchedulerEvent[], { matches = () => true, now }: ReviewOptions = {}) => {
    const rows = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp)), endTime = now ?? (rows.length ? timeOf(rows.at(-1)!) : 0);
    const lockHolds = new Map<string, SchedulerEvent>(), segments = new Map<string, HoldSpan[]>();
    // 键是 任务|锁：票会改名；同一任务多段时后一段的领票覆盖前一段。
    const waitingEvents = new Map<string, SchedulerEvent>(), waitSeen = new Map<string, Set<number>>(), stuckSeen = new Map<string, Set<string>>(), memWaitStarts = new Map<string, SchedulerEvent>();
    const lockSecByPurpose: Record<string, number> = {}, waitingOn: Record<string, number> = {}, initiatorWaitSec: Record<string, number> = {}, memWaitSec: Record<string, number> = {}, unattributedBreakdown: Record<string, number> = {};
    const gateWait = { totalSec: 0, 持锁者秒: 0, 其中已崩溃者秒: 0, 内存秒: 0, 未归因秒: 0 };
    const unattributedDetail: unknown[] = [], notWaited: unknown[] = [], memWaitOpen: unknown[] = [];
    const killed: SchedulerEvent[] = [], decisions: SchedulerEvent[] = [], reclaims: SchedulerEvent[] = [], alerts: SchedulerEvent[] = [], delaysSec: number[] = [];
    let unconfiguredAlerts: SchedulerEvent[] = [], noWaitDataCount = 0;
    const closeLock = (lock: string, endTime: number, dead: boolean) => {
        const startEvent = lockHolds.get(lock);
        if (!startEvent)
            return;
        lockHolds.delete(lock);
        const colList = segments.get(lock) ?? [];
        segments.set(lock, colList);
        colList.push({ start: timeOf(startEvent), end: endTime, task: startEvent.task!, initiator: startEvent.initiator, 死: dead });
        return startEvent;
    };
    /** 没有放锁就没了。崩溃常隔很久才被人发现：占锁算到最后心跳，别人的等待算到发现为止。 */
    const closeDeadHolder = (lock: string, e: SchedulerEvent) => {
        const startEvent = closeLock(lock, timeOf(e), true), heartbeat = Number(e.heartbeat ?? (e.prevHolder as { heartbeat?: number } | undefined)?.heartbeat) || timeOf(e);
        if (startEvent && matches(e))
            addSec(lockSecByPurpose, purposeOf(startEvent), Math.max(0, Math.min(heartbeat, timeOf(e)) - timeOf(startEvent)) / 1000);
    };
    const computeWait = (e: SchedulerEvent, startEvent: SchedulerEvent | undefined, passed: Set<number> | undefined, stuck: Set<string> | undefined) => {
        const endMs = timeOf(e), waitSec = e.lockWaitSec !== undefined ? Number(e.lockWaitSec) : startEvent ? (endMs - timeOf(startEvent)) / 1000 : null;
        if (waitSec === null) {
            noWaitDataCount++;
            unattributedDetail.push({ task: e.task, lock: e.lock, ticket: e.ticket, cause: '无领票' });
            return;
        }
        const startMs = endMs - waitSec * 1000, lockHolds = segments.get(e.lock ?? '渲染') ?? [], seenPids = new Set<number | undefined>();
        let totalSec = 0;
        // 同一把锁的持锁段不重叠且按时间排好，往回找到等待开始就够了。
        for (let i = lockHolds.length - 1; i >= 0 && lockHolds[i]!.end > startMs; i--) {
            const h = lockHolds[i]!, elapsedSec = Math.max(0, Math.min(endMs, h.end) - Math.max(startMs, h.start)) / 1000;
            if (!elapsedSec)
                continue;
            totalSec += elapsedSec;
            seenPids.add((h.initiator as { pid?: number } | undefined)?.pid);
            addSec(waitingOn, `${e.task}→${h.task}`, elapsedSec);
            addSec(initiatorWaitSec, `${sourceLabel(e.initiator)}→${sourceLabel(h.initiator)}`, elapsedSec);
            if (h.死)
                gateWait.其中已崩溃者秒 += elapsedSec;
        }
        const memoryWait = Math.min(Math.max(0, waitSec - totalSec), Number(e.memoryWaitSec ?? 0)), remainingSec = waitSec - totalSec - memoryWait;
        gateWait.totalSec += waitSec;
        gateWait.持锁者秒 += totalSec;
        gateWait.内存秒 += memoryWait;
        // 余下不到 0.05 秒是交接和浮点误差。
        if (remainingSec < 0.05)
            return;
        const staleGateHolders = [...(passed ?? [])].filter(p => !seenPids.has(p));
        const reason = stuck?.size ? `放行卡在${[...stuck].join('、')}` : staleGateHolders.length ? `旧闸 #${staleGateHolders.join(' #')}` : '锁空或无持锁记录';
        gateWait.未归因秒 += remainingSec;
        addSec(unattributedBreakdown, reason, remainingSec);
        addSec(initiatorWaitSec, `${sourceLabel(e.initiator)}→未归因`, remainingSec);
        unattributedDetail.push({ task: e.task, lock: e.lock, ticket: e.ticket, sec: Math.round(remainingSec * 10) / 10, cause: reason });
    };
    /** 任务没了，它没等完的都到此为止：10-22 那种等内存若以取消收场，也要看得到。 */
    const settle = (task: string | null, endMs: number, outcome: string) => {
        for (const [k, waitEvent] of waitingEvents)
            if (task === null || waitEvent.task === task) {
                waitingEvents.delete(k);
                if (matches(waitEvent))
                    notWaited.push({ task: waitEvent.task, lock: waitEvent.lock, ticket: waitEvent.ticket, start: waitEvent.timestamp, sec: Math.round(endMs - timeOf(waitEvent)) / 1000, 结局: outcome });
            }
        for (const [k, startEntry] of memWaitStarts)
            if (task === null || k === task) {
                memWaitStarts.delete(k);
                if (matches(startEntry)) {
                    const elapsedSec = (endMs - timeOf(startEntry)) / 1000;
                    addSec(memWaitSec, k, elapsedSec);
                    memWaitOpen.push({ task: k, ticket: startEntry.ticket, start: startEntry.timestamp, sec: Math.round(elapsedSec * 10) / 10, 结局: outcome });
                }
            }
    };
    for (const e of rows) {
        const t = timeOf(e), report = matches(e), lock = e.lock ?? '渲染', bucketKey = `${e.task}|${lock}`;
        if (e.event === '领票')
            waitingEvents.set(bucketKey, e);
        else if (e.event === '排队' && e.waitingOn)
            getSet(waitSeen, bucketKey).add(Number(e.waitingOn));
        else if (e.event === '放行等起')
            getSet(stuckSeen, bucketKey).add(String(e.stuckOn));
        else if (e.event === '拿锁') {
            // 上一任既没放锁也没崩溃事件就被接手，只可能是死了而事件没写成。
            closeDeadHolder(lock, e);
            lockHolds.set(lock, e);
            if (report)
                computeWait(e, waitingEvents.get(bucketKey), waitSeen.get(bucketKey), stuckSeen.get(bucketKey));
            waitingEvents.delete(bucketKey);
            waitSeen.delete(bucketKey);
            stuckSeen.delete(bucketKey);
        }
        else if (e.event === '放锁') {
            if (report)
                addSec(lockSecByPurpose, purposeOf(e), Number(e.lockHoldSec ?? 0));
            if (lockHolds.get(lock)?.task === e.task)
                closeLock(lock, t, false);
        }
        else if (e.event === '等内存起')
            memWaitStarts.set(e.task ?? '', e);
        else if (e.event === '等内存止') {
            memWaitStarts.delete(e.task ?? '');
            if (report)
                addSec(memWaitSec, e.task ?? e.ticket!, Number(e.sec ?? 0));
        }
        else if (e.event === '回收死锁')
            closeDeadHolder(lock, e);
        if (e.event === '崩溃')
            for (const [k, h] of lockHolds)
                if (h.task === e.task)
                    closeDeadHolder(k, e);
        if (e.task && ['任务止', '被杀', '崩溃'].includes(e.event))
            settle(e.task, t, e.event);
        if (['被杀', '崩溃', '取消', '限时杀'].includes(e.event) && report)
            killed.push(e);
        if (['回收死锁', '清死票', '清孤儿'].includes(e.event) && report)
            reclaims.push(e);
        if (e.event === '告警') {
            unconfiguredAlerts.push(e);
            if (report)
                alerts.push(e);
        }
        if (e.event === '决定') {
            if (report)
                decisions.push(e);
            // 升级会连发几条，延迟从最早没处理的那条算；配过的不再配，没指向谁的决定不进统计。
            const unconfigured = unconfiguredAlerts.filter(a => related(a, e));
            if (unconfigured.length && report)
                delaysSec.push((t - timeOf(unconfigured[0]!)) / 1000);
            unconfiguredAlerts = unconfiguredAlerts.filter(a => !unconfigured.includes(a));
        }
    }
    settle(null, endTime, '未结束');
    const totalLockSec = Object.values(lockSecByPurpose).reduce((a, b) => a + b, 0), chosen = rows.filter(matches);
    return { 当前持锁: [...lockHolds.values()], 等闸: roundValues(gateWait), waitingOn: roundValues(waitingOn), 发起等秒: roundValues(initiatorWaitSec), 未归因: { 分解: roundValues(unattributedBreakdown), 无等待数据次: noWaitDataCount, detail: unattributedDetail }, 没等到: notWaited, 等内存: roundValues(memWaitSec), 等内存未结束: memWaitOpen, 占锁秒: roundValues(lockSecByPurpose), 实验占比: totalLockSec ? (lockSecByPurpose.实验 ?? 0) / totalLockSec : 0, 被杀: killed, decision: decisions, 回收: reclaims, 告警: alerts, 告警到决定秒: delaysSec, 等待事件: chosen.filter(x => x.event === '排队'), 放行等待: chosen.filter(x => x.event === '放行'), lane: chosen.filter(x => /^路[开完败]$/.test(x.event)) };
};
