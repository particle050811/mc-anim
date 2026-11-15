import type { SchedulerEvent } from './调度日志.ts';
const timeOf = (e: SchedulerEvent) => Date.parse(e.时);
const addSec = (totals: Record<string, number>, bucketKey: string, elapsedSec: number) => { totals[bucketKey] = (totals[bucketKey] ?? 0) + elapsedSec; };
const roundValues = (totals: Record<string, number>) => Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Math.round(v * 10) / 10]));
const purposeOf = (e: SchedulerEvent) => (e.声明 as { 用途?: string } | undefined)?.用途 ?? '未声明';
const sourceLabel = (v: unknown) => { const f = v as { 来源?: string; 会话?: string; 路?: string; 工作区?: string } | undefined; return f ? `${f.来源 ?? '?'}:${f.会话 ?? ''}/${f.工作区 ?? ''}/${f.路 || '未声明路'}` : '未声明'; };
const getSet = <T>(setMap: Map<string, Set<T>>, bucketKey: string) => { const s = setMap.get(bucketKey) ?? new Set<T>(); setMap.set(bucketKey, s); return s; };
/** 排队票的告警对象是任务 id，持锁的是 任务/段；票名只有旧票才用。 */
const related = (a: SchedulerEvent, d: SchedulerEvent) => {
    const target = String(a.对象 ?? '');
    return Boolean(d.任务 && (target === d.任务 || target.startsWith(`${d.任务}/`))) || [d.票, d.目标].some(x => x && (x === target || x === a.票 || x === `#${a.pid}`));
};
type HoldSpan = { 起: number; 止: number; 任务: string; 发起: unknown; 死: boolean };
export type ReviewOptions = {
    /** 只定汇报哪些。配对总用全部事件：领票可能在窗口外，挡路的持锁者也不一定满足过滤条件。 */
    matches?: (e: SchedulerEvent) => boolean;
    /** 还没结束的等待算到这一刻；不给就算到最后一条事件。 */
    now?: number;
};
export const review = (events: SchedulerEvent[], { matches = () => true, now }: ReviewOptions = {}) => {
    const rows = [...events].sort((a, b) => a.时.localeCompare(b.时)), endTime = now ?? (rows.length ? timeOf(rows.at(-1)!) : 0);
    const lockHolds = new Map<string, SchedulerEvent>(), segments = new Map<string, HoldSpan[]>();
    // 键是 任务|锁：票会改名；同一任务多段时后一段的领票覆盖前一段。
    const waitingEvents = new Map<string, SchedulerEvent>(), waitSeen = new Map<string, Set<number>>(), stuckSeen = new Map<string, Set<string>>(), memWaitStarts = new Map<string, SchedulerEvent>();
    const lockSecByPurpose: Record<string, number> = {}, waitingOn: Record<string, number> = {}, initiatorWaitSec: Record<string, number> = {}, memWaitSec: Record<string, number> = {}, unattributedBreakdown: Record<string, number> = {};
    const gateWait = { 总秒: 0, 持锁者秒: 0, 其中已崩溃者秒: 0, 内存秒: 0, 未归因秒: 0 };
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
        colList.push({ 起: timeOf(startEvent), 止: endTime, 任务: startEvent.任务!, 发起: startEvent.发起, 死: dead });
        return startEvent;
    };
    /** 没有放锁就没了。崩溃常隔很久才被人发现：占锁算到最后心跳，别人的等待算到发现为止。 */
    const closeDeadHolder = (lock: string, e: SchedulerEvent) => {
        const startEvent = closeLock(lock, timeOf(e), true), heartbeat = Number(e.心跳 ?? (e.原持有者 as { 心跳?: number } | undefined)?.心跳) || timeOf(e);
        if (startEvent && matches(e))
            addSec(lockSecByPurpose, purposeOf(startEvent), Math.max(0, Math.min(heartbeat, timeOf(e)) - timeOf(startEvent)) / 1000);
    };
    const computeWait = (e: SchedulerEvent, startEvent: SchedulerEvent | undefined, passed: Set<number> | undefined, stuck: Set<string> | undefined) => {
        const endMs = timeOf(e), waitSec = e.等锁秒 !== undefined ? Number(e.等锁秒) : startEvent ? (endMs - timeOf(startEvent)) / 1000 : null;
        if (waitSec === null) {
            noWaitDataCount++;
            unattributedDetail.push({ 任务: e.任务, 锁: e.锁, 票: e.票, 原因: '无领票' });
            return;
        }
        const startMs = endMs - waitSec * 1000, lockHolds = segments.get(e.锁 ?? '渲染') ?? [], seenPids = new Set<number | undefined>();
        let totalSec = 0;
        // 同一把锁的持锁段不重叠且按时间排好，往回找到等待开始就够了。
        for (let i = lockHolds.length - 1; i >= 0 && lockHolds[i]!.止 > startMs; i--) {
            const h = lockHolds[i]!, elapsedSec = Math.max(0, Math.min(endMs, h.止) - Math.max(startMs, h.起)) / 1000;
            if (!elapsedSec)
                continue;
            totalSec += elapsedSec;
            seenPids.add((h.发起 as { pid?: number } | undefined)?.pid);
            addSec(waitingOn, `${e.任务}→${h.任务}`, elapsedSec);
            addSec(initiatorWaitSec, `${sourceLabel(e.发起)}→${sourceLabel(h.发起)}`, elapsedSec);
            if (h.死)
                gateWait.其中已崩溃者秒 += elapsedSec;
        }
        const memoryWait = Math.min(Math.max(0, waitSec - totalSec), Number(e.等内存秒 ?? 0)), remainingSec = waitSec - totalSec - memoryWait;
        gateWait.总秒 += waitSec;
        gateWait.持锁者秒 += totalSec;
        gateWait.内存秒 += memoryWait;
        // 余下不到 0.05 秒是交接和浮点误差。
        if (remainingSec < 0.05)
            return;
        const staleGateHolders = [...(passed ?? [])].filter(p => !seenPids.has(p));
        const reason = stuck?.size ? `放行卡在${[...stuck].join('、')}` : staleGateHolders.length ? `旧闸 #${staleGateHolders.join(' #')}` : '锁空或无持锁记录';
        gateWait.未归因秒 += remainingSec;
        addSec(unattributedBreakdown, reason, remainingSec);
        addSec(initiatorWaitSec, `${sourceLabel(e.发起)}→未归因`, remainingSec);
        unattributedDetail.push({ 任务: e.任务, 锁: e.锁, 票: e.票, 秒: Math.round(remainingSec * 10) / 10, 原因: reason });
    };
    /** 任务没了，它没等完的都到此为止：10-22 那种等内存若以取消收场，也要看得到。 */
    const settle = (task: string | null, endMs: number, outcome: string) => {
        for (const [k, waitEvent] of waitingEvents)
            if (task === null || waitEvent.任务 === task) {
                waitingEvents.delete(k);
                if (matches(waitEvent))
                    notWaited.push({ 任务: waitEvent.任务, 锁: waitEvent.锁, 票: waitEvent.票, 起: waitEvent.时, 秒: Math.round(endMs - timeOf(waitEvent)) / 1000, 结局: outcome });
            }
        for (const [k, startEntry] of memWaitStarts)
            if (task === null || k === task) {
                memWaitStarts.delete(k);
                if (matches(startEntry)) {
                    const elapsedSec = (endMs - timeOf(startEntry)) / 1000;
                    addSec(memWaitSec, k, elapsedSec);
                    memWaitOpen.push({ 任务: k, 票: startEntry.票, 起: startEntry.时, 秒: Math.round(elapsedSec * 10) / 10, 结局: outcome });
                }
            }
    };
    for (const e of rows) {
        const t = timeOf(e), report = matches(e), lock = e.锁 ?? '渲染', bucketKey = `${e.任务}|${lock}`;
        if (e.事 === '领票')
            waitingEvents.set(bucketKey, e);
        else if (e.事 === '排队' && e.等谁)
            getSet(waitSeen, bucketKey).add(Number(e.等谁));
        else if (e.事 === '放行等起')
            getSet(stuckSeen, bucketKey).add(String(e.卡在));
        else if (e.事 === '拿锁') {
            // 上一任既没放锁也没崩溃事件就被接手，只可能是死了而事件没写成。
            closeDeadHolder(lock, e);
            lockHolds.set(lock, e);
            if (report)
                computeWait(e, waitingEvents.get(bucketKey), waitSeen.get(bucketKey), stuckSeen.get(bucketKey));
            waitingEvents.delete(bucketKey);
            waitSeen.delete(bucketKey);
            stuckSeen.delete(bucketKey);
        }
        else if (e.事 === '放锁') {
            if (report)
                addSec(lockSecByPurpose, purposeOf(e), Number(e.持锁秒 ?? 0));
            if (lockHolds.get(lock)?.任务 === e.任务)
                closeLock(lock, t, false);
        }
        else if (e.事 === '等内存起')
            memWaitStarts.set(e.任务 ?? '', e);
        else if (e.事 === '等内存止') {
            memWaitStarts.delete(e.任务 ?? '');
            if (report)
                addSec(memWaitSec, e.任务 ?? e.票!, Number(e.秒 ?? 0));
        }
        else if (e.事 === '回收死锁')
            closeDeadHolder(lock, e);
        if (e.事 === '崩溃')
            for (const [k, h] of lockHolds)
                if (h.任务 === e.任务)
                    closeDeadHolder(k, e);
        if (e.任务 && ['任务止', '被杀', '崩溃'].includes(e.事))
            settle(e.任务, t, e.事);
        if (['被杀', '崩溃', '取消', '限时杀'].includes(e.事) && report)
            killed.push(e);
        if (['回收死锁', '清死票', '清孤儿'].includes(e.事) && report)
            reclaims.push(e);
        if (e.事 === '告警') {
            unconfiguredAlerts.push(e);
            if (report)
                alerts.push(e);
        }
        if (e.事 === '决定') {
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
    return { 当前持锁: [...lockHolds.values()], 等闸: roundValues(gateWait), 等谁: roundValues(waitingOn), 发起等秒: roundValues(initiatorWaitSec), 未归因: { 分解: roundValues(unattributedBreakdown), 无等待数据次: noWaitDataCount, 明细: unattributedDetail }, 没等到: notWaited, 等内存: roundValues(memWaitSec), 等内存未结束: memWaitOpen, 占锁秒: roundValues(lockSecByPurpose), 实验占比: totalLockSec ? (lockSecByPurpose.实验 ?? 0) / totalLockSec : 0, 被杀: killed, 决定: decisions, 回收: reclaims, 告警: alerts, 告警到决定秒: delaysSec, 等待事件: chosen.filter(x => x.事 === '排队'), 放行等待: chosen.filter(x => x.事 === '放行'), 路: chosen.filter(x => /^路[开完败]$/.test(x.事)) };
};
