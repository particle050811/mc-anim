// GPU 位容量 1。用户 11-01 定的是总纲：程序守底线、主 Agent 决定、日志不翻会话就能复盘。
// 等内存不持锁、单票放行、压力 4 加 --force 是主 Agent 11-01 的裁决；30%、负载核×0.8、60 秒是 Agent 选的阈值。这些都不是用户定值，可以改。
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { config } from '../环境/配置.ts';
import { enoughMemory, readMemory, readPressure, readingNote, coreCount, load1Min, type MemReading } from '../环境/资源.ts';
import { holderPid, tryAcquire, releaseLock, processAlive, reclaimDeadLock, lockHeld } from './锁.ts';
import { registerCleanup } from '../环境/收尾.ts';
import { resolveSchedulerEnv, openTask, hasTask, cleanCrashed, type SchedulerEnv, type TaskDecl } from './任务.ts';
import { claimTicket, listTickets, ticketAlive, type Ticket, requeueTail, setOrder, writeTicket, clearTaskTickets, recordOvertaken, isLowPriorityTicket } from './票.ts';
import { writeJson, readJson, promptOnly } from './文件.ts';
import { clearOrphans } from './孤儿.ts';
import { readState, readOccupancy, waitAhead, queueOccupancy } from './看.ts';
import { reportRepeatedStillFail, monitorRound } from './告警.ts';
import { readMachineSnapshot, readMachineSnapshotParallel, type MachineSnapshot } from './机器.ts';
import { estimate } from './估计.ts';
import { readDirective, getPassGrant, consumePassGrant, deleteDirective, routeYield, SchedYieldError, failExitCode } from './指令.ts';
export type { TaskDecl } from './任务.ts';
export { gateRecordKilled, registerTempFile } from '../环境/收尾.ts';
export const ancestorLockEnv = 'MCAI_RENDER_LOCK_PID';
const lockContext = new AsyncLocalStorage<LockHandle>();
const serialQueue = new Map<string, Promise<void>>();
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
export type GateEnv = SchedulerEnv & {
    memFloor: number;
    readMemory: () => MemReading | null;
    readPressure: () => number | null;
    load1Min: () => number | null;
    coreCount: () => number;
    sleep: (ms: number) => Promise<void>;
    queueIntervalMs?: number;
    clearOrphans: () => unknown[];
    readMachine: () => MachineSnapshot;
};
export const resolveEnv = (e: Partial<GateEnv> = {}): GateEnv => ({ ...resolveSchedulerEnv(e), memFloor: e.memFloor ?? Number(config('渲染内存下限')), readMemory: e.readMemory ?? readMemory, readPressure: e.readPressure ?? readPressure,
    load1Min: e.load1Min ?? load1Min, coreCount: e.coreCount ?? coreCount, sleep: e.sleep ?? sleep, queueIntervalMs: e.queueIntervalMs ?? 1000,
    // 注入锁目录的调用必须显式注入进程清理，测试不能碰真 Chrome。
    readMachine: e.readMachine ?? (e.lockDir ? () => ({ load: 0, cores: 10, gate: null, pressure: null, free: null, compressed: null, swap: null, swapOut: null, GPU: null, thermal: null, disk: null, orphans: 0, processes: '' }) : readMachineSnapshot),
    clearOrphans: e.clearOrphans ?? (e.lockDir ? () => [] : clearOrphans) });
export type LockHandle = {
    file: string;
    ticket: string;
    task: string;
    decl: TaskDecl;
    lockAcquiredAt: number;
    放: (outcome?: string) => void;
    heartbeat: (frame?: number) => void;
};
type QueueOptions = Partial<GateEnv> & {
    intervalMs?: number;
    waitHint?: (s: string) => void;
    canAdmit?: (ticket: Ticket) => boolean;
    canOvertake?: (ticket: Ticket) => boolean;
    decl?: TaskDecl;
    recheckInLock?: (ticket: Ticket) => boolean;
    /** 这一轮没轮到或锁被活进程拿着，准入没被调：等资源的状态要结束，等的是锁或队列。 */
    onLeaveAdmit?: (ticket: Ticket) => void;
    /** 这次排队里等内存的累计秒，写进拿锁事件。 */
    waitMemorySec?: () => number;
};
const writeTicketState = (t: Ticket) => promptOnly('票状态', () => writeTicket(t));
/** 票主人每轮对一次，不一样才写：记被越、改调度 可能用旧内容盖过票，只在状态变化时写的话，等内存告警和 看 的标记就一直缺。 */
const setTicketState = (t: Ticket, stuckOn: string, waitMemStart?: number) => {
    const c = t.content!;
    if ((c.stuckOn ?? '') === stuckOn && c.等内存起 === waitMemStart)
        return;
    if (stuckOn)
        c.stuckOn = stuckOn;
    else
        delete c.stuckOn;
    if (waitMemStart === undefined)
        delete c.等内存起;
    else
        c.等内存起 = waitMemStart;
    writeTicketState(t);
};
const withoutProcesses = ({ processes: _, ...m }: MachineSnapshot) => m;
/** 进日志的读数。进程表太大不进；读不到不能影响过闸。 */
const machineReading = (e: GateEnv) => { try {
    return withoutProcesses(e.readMachine());
}
catch {
    return undefined;
} };
export const queueAcquire = async (lockName: string, opts: QueueOptions = {}): Promise<LockHandle> => {
    checkReentry();
    const e = resolveEnv(opts), key = path.join(e.lockDir, lockName), prev = serialQueue.get(key) ?? Promise.resolve();
    let passBaton!: () => void;
    const released = new Promise<void>(r => { passBaton = r; });
    serialQueue.set(key, released);
    const handOver = () => { passBaton(); if (serialQueue.get(key) === released)
        serialQueue.delete(key); };
    await prev;
    const file = path.join(e.lockDir, lockName + '.lock'), infoFile = file + '.信息.json', dir = path.join(e.lockDir, lockName + '.排队');
    const dropLock = () => {
        promptOnly('信息文件', () => { if (holderPid(file) === process.pid)
            fs.rmSync(infoFile, { force: true }); });
        promptOnly('放锁', () => releaseLock(file));
    };
    let taskHandle: ReturnType<typeof openTask> | undefined, ownsTask = false, clearTicket = () => { }, withdrawTicket = () => { };
    // 到返回柄为止任何一步抛错都要放锁、交棒，否则同进程下一次过闸永远挂在 await 前。
    try {
        ownsTask = !hasTask(e.lockDir);
        const taskDecl = opts.decl ?? { kind: process.argv[2] ?? '脚本', purpose: process.env.ANIM_PURPOSE ?? '未声明' };
        taskDecl.kind ??= process.argv[2] ?? '脚本';
        taskDecl.purpose ??= process.env.ANIM_PURPOSE ?? '未声明';
        if (process.env.ANIM_PRIORITY === 'low') taskDecl.lowPriority = true;
        taskDecl.estimatedSec ??= estimate(taskDecl, path.dirname(e.logDir));
        const task = taskHandle = openTask(e, taskDecl);
        clearTicket = () => promptOnly('删票', () => clearTaskTickets(dir, task.info.task));
        clearTicket();
        let t = claimTicket(dir, e.localHost, { ...task.info, decl: taskDecl }, e.nowMs());
        task.update(taskDecl, t.name, '排队');
        const yieldCmd = readDirective(e, task.info.task);
        if (yieldCmd?.动作 === '让路' && yieldCmd.至 && yieldCmd.至 > e.nowMs() && yieldCmd.ticket !== t.name) {
            t.content!.暂缓至 = yieldCmd.至;
            t.content!.暂缓因 = yieldCmd.why;
            t.content!.原序 = String(t.time);
            t = setOrder(t, String(900000000000000 + e.nowMs()));
            writeTicketState(t);
            console.error(`== 调度让路：${yieldCmd.why}；下一张票暂缓至 ${new Date(yieldCmd.至).toISOString()}`);
            deleteDirective(e, task.info.task);
        }
        const startMs = e.nowMs();
        let origWait = '', lastMonitor = 0;
        const logEvent = (eventName: string, fields: Record<string, unknown> = {}) => task.logEvent(eventName, { ticket: t.name, lock: lockName, decl: taskDecl, ...fields });
        const monitorDue = () => e.nowMs() - lastMonitor >= 3000;
        const monitor = (machine?: MachineSnapshot) => { if (!monitorDue())
            return; lastMonitor = e.nowMs(); promptOnly('监测', () => {
            // 说的是自己的告警当场打到 stderr：调用方（子 Agent）不挂 盯 也看得到自己卡住了
            for (const a of monitorRound(e, readState(e, () => machine ?? e.readMachine(), false)))
                if (a.pid === process.pid)
                    console.error(`!! 告警 ${a.type} ${a.subject}：${Math.round(a.value)} ≥ ${Math.round(a.threshold)}（第 ${a.attempts} 次）。${a.type === '无帧' ? '这么久没出新帧，多半卡住了；别原样重跑，先缩小范围查是哪样东西卡' : ''}`);
        }); };
        const cleanOrphans = () => promptOnly('清孤儿', () => { for (const p of e.clearOrphans())
            logEvent('清孤儿', { processes: p }); });
        const onReclaim = (pid: number | null) => {
            const info = readJson<{ pid: number }>(infoFile);
            logEvent('回收死锁', { prevHolder: info?.pid === pid ? info : { pid } });
            cleanOrphans();
        };
        // 观测快照只供日志和监测复用；准入仍独立现读内存、压力、负载。
        // 不在重读队序到试拿之间追加探针、睡眠或 I/O，尽量缩短窗口。
        // 与其他进程改调度的次序仍是尽力而为，撞上时由记被越记录。
        const sampleMachine = async () => {
            try { return e.readMachine === readMachineSnapshot ? await readMachineSnapshotParallel() : e.readMachine(); }
            catch { return undefined; }
        };
        let roundMachine: MachineSnapshot | undefined;
        const roundReading = () => roundMachine && withoutProcesses(roundMachine);
        const pause = async () => {
            await e.sleep(opts.intervalMs ?? e.queueIntervalMs ?? 1000);
            roundMachine = monitorDue() ? await sampleMachine() : undefined;
        };
        const readQueueState = () => { const tickets = listTickets(dir); return { depth: tickets.filter(x => x.name !== t.name).length, ahead: tickets.filter(x => x.name < t.name).slice(0, 3).map(x => x.name), lockHolders: holderPid(file) }; };
        withdrawTicket = registerCleanup(clearTicket);
        const queueState = readQueueState();
        roundMachine = await sampleMachine();
        logEvent('领票', { queue: queueState, machine: roundReading() });
        promptOnly('领票提示', () => {
            const occupancy = queueOccupancy(readOccupancy(e), lockName), ahead = occupancy.ticket.filter(q => !q.死 && q.name < t.name), liveLocks = occupancy.lockHolders.filter(x => !x.死);
            if (!ahead.length && !liveLocks.length)
                return;
            const { sec: waitSec, unresolved } = waitAhead({ lockHolders: liveLocks, ticket: ahead }, e.nowMs());
            (opts.waitHint ?? (s => console.error(`== 资源闸：${lockName}排队（${s}）`)))(`前面 ${ahead.length} 张，约${unresolved ? '≥' : ''}${(waitSec / 60).toFixed(1)} 分`);
        });
        for (;;) {
            const yieldReason = routeYield(e);
            if (yieldReason) {
                console.error(`被路令让路：${yieldReason}，不要原样重发（退出 75，不算失败）`);
                throw new SchedYieldError(yieldReason);
            }
            cleanCrashed(e);
            monitor(roundMachine);
            // 每个等待者每轮都回收，不看队位和准入：只靠队首的话，全队暂缓时没人回收。
            promptOnly('回收死锁', () => reclaimDeadLock(file, e.localHost, onReclaim));
            const myTickets = listTickets(dir).filter(x => x.content?.task === task.info.task && x.pid === process.pid);
            // 写旧路径和改名撞上时会出两张：改名后的那张才算数。
            const other = myTickets.find(x => x.name !== t.name) ?? myTickets[0];
            for (const x of myTickets)
                if (x !== other)
                    promptOnly('删票', () => fs.rmSync(x.file, { force: true }));
            if (other)
                t = other;
            else {
                const oldName = t.name;
                t = claimTicket(dir, e.localHost, { ...task.info, decl: taskDecl }, e.nowMs());
                logEvent('票丢失', { 原名: oldName, 新名: t.name });
            }
            if (t.content?.暂缓至 && t.content.暂缓至 <= e.nowMs()) {
                try {
                    t = requeueTail(t);
                }
                catch {
                    await pause();
                    continue;
                }
                delete t.content!.暂缓至;
                delete t.content!.暂缓因;
                t.content!.start = e.nowMs();
                writeTicketState(t);
                logEvent('恢复', { cause: '暂缓到期回队尾' });
            }
            try {
                fs.utimesSync(t.file, new Date(), new Date());
            }
            catch {
                await pause();
                continue;
            }
            const liveTickets: Ticket[] = [];
            for (const q of listTickets(dir)) {
                if (ticketAlive(q, e.localHost))
                    liveTickets.push(q);
                else {
                    try {
                        fs.unlinkSync(q.file);
                        logEvent('清死票', { origInfo: q });
                        cleanOrphans();
                    }
                    catch { /* 另一读者先回收 */ }
                }
            }
            const grant = readDirective(e, task.info.task);
            if (grant?.动作 === '放行' && (grant.至 ?? 0) <= e.nowMs()) {
                console.error(`!! 放行授权已过期（${grant.why}）：这张票回到正常判断，还要放行请重发`);
                logEvent('放行过期', { 至: grant.至, why: grant.why });
                deleteDirective(e, task.info.task);
            }
            const skipQueue = opts.canOvertake?.(t) ?? false;
            const deferred = Boolean(t.content?.暂缓至 && t.content.暂缓至 > e.nowMs());
            const myTurn = skipQueue || (!deferred && liveTickets[0]?.name === t.name), held = lockHeld(file, e.localHost);
            if (myTurn && !held) {
                if ((opts.canAdmit?.(t) ?? true) && tryAcquire(file, e.localHost, onReclaim)) {
                    if (!opts.recheckInLock || opts.recheckInLock(t))
                        break;
                    releaseLock(file);
                }
            }
            else
                opts.onLeaveAdmit?.(t);
            const waitText = deferred ? `暂缓至 ${new Date(t.content!.暂缓至!).toISOString()}${t.content!.暂缓因 ? `：${t.content!.暂缓因}` : ''}` : held ? `锁在 pid ${holderPid(file) ?? '?'} 手里` : myTurn ? '等资源' : '前面还有人排队';
            if (waitText !== origWait) {
                opts.waitHint?.(waitText);
                logEvent('排队', { waitingOn: holderPid(file), ahead: liveTickets.slice(0, 3).map(x => x.name), state: waitText });
                origWait = waitText;
            }
            await pause();
        }
        const acquiredAt = e.nowMs();
        task.update(taskDecl, t.name, '持锁');
        // 正常轮到时前面没有活票；还有的就是被放行越过了。
        promptOnly('被越计数', () => recordOvertaken(listTickets(dir).filter(q => q.name < t.name), e.localHost));
        logEvent('拿锁', { lockWaitSec: (acquiredAt - startMs) / 1000, memoryWaitSec: opts.waitMemorySec?.() ?? 0, overtakenCount: t.content?.已被越 ?? 0, queue: readQueueState(), machine: roundReading() ?? machineReading(e) });
        clearTicket();
        withdrawTicket();
        let lastWrite = 0, framesDone = 0, frameTime = acquiredAt, finished = false;
        const heartbeat = (frame?: number) => {
            if (frame !== undefined && frame !== framesDone) {
                framesDone = frame;
                frameTime = e.nowMs();
            }
            if (lastWrite && e.nowMs() - lastWrite < 5000)
                return;
            lastWrite = e.nowMs();
            promptOnly('信息文件', () => writeJson(infoFile, { pid: process.pid, task: task.info.task, ticket: t.name, initiator: task.info.initiator, decl: taskDecl, lockAcquiredAt: acquiredAt, heartbeat: lastWrite, frameTime: frameTime, framesDone: framesDone, totalFrames: taskDecl.frameCount }));
        };
        heartbeat();
        const timeLimit = Number(process.env.ANIM_TIME_LIMIT);
        const limitTimer = lockName === '渲染' && timeLimit > 0 ? setTimeout(() => { logEvent('限时杀', { 限时: timeLimit, elapsedSec: (e.nowMs() - task.info.start) / 1000 }); process.exit(124); }, timeLimit * 1000) : undefined;
        limitTimer?.unref();
        const timer = setInterval(() => { heartbeat(); monitor(); }, 30000);
        timer.unref();
        const unregisterExit = registerCleanup((_, sig) => release(sig ? '被杀' : '退出'));
        const release = (outcome = '成') => {
            if (finished)
                return;
            finished = true;
            clearInterval(timer);
            clearTimeout(limitTimer);
            unregisterExit();
            const interrupted = outcome === '被杀' || outcome === '退出';
            // 中断时在退出钩子里，不开子进程读内存，要快。被杀事件靠 当时 说明，所以不清。
            logEvent('放锁', { lockHoldSec: (e.nowMs() - acquiredAt) / 1000, result: outcome, framesDone: framesDone, queue: readQueueState(), machine: interrupted ? { load: e.load1Min() } : machineReading(e) });
            if (outcome !== '成')
                promptOnly('重复失败', () => { const a = reportRepeatedStillFail(e.logDir, { decl: taskDecl, workspace: task.info.initiator.workspace, task: task.info.task, pid: process.pid, session: task.info.initiator.session }, e.nowMs()); if (a)
                    console.error(`!! 告警 静帧重复失败 ${a.subject}：同一批帧连着 ${a.value} 次没出来，别再原样重跑`); });
            if (!interrupted)
                task.update(taskDecl, t.name, '');
            // 持锁期间 anim sched 的改名可能和删票撞上，留下的票会挡住后来者，放锁前再扫一次。
            clearTicket();
            dropLock();
            handOver();
            if (ownsTask && !interrupted)
                task.endedAt(outcome === '成' ? 0 : 1);
        };
        return { file: file, ticket: t.name, task: task.info.task, decl: taskDecl, lockAcquiredAt: acquiredAt, 放: release, heartbeat: heartbeat };
    }
    catch (err) {
        clearTicket();
        withdrawTicket();
        dropLock();
        handOver();
        taskHandle?.update(taskHandle.info.decl, taskHandle.info.ticket, '');
        if (ownsTask)
            taskHandle?.endedAt(failExitCode(err));
        throw err;
    }
};
export const gateHeartbeat = (frame?: number) => lockContext.getStore()?.heartbeat(frame);
export const currentTicket = () => lockContext.getStore()?.ticket;
const checkReentry = () => { if (lockContext.getStore())
    throw Error('禁止嵌套过闸：当前调用已经持有渲染锁'); const pid = Number(process.env[ancestorLockEnv]); if (pid && pid !== process.pid && processAlive(pid))
    throw Error(`祖先 pid ${pid} 持有渲染锁，子进程不能再次过闸`); };
const takeRenderGate = async (hint: (s: string) => void, env: Partial<GateEnv>, taskDecl: TaskDecl): Promise<LockHandle> => {
    const e = resolveEnv(env);
    let ticketReading: Record<string, unknown> | undefined, stuckOn: '' | '内存' | '负载' = '', stuckStartMs = 0, alarmed = false, waitMemorySec = 0;
    const checkTicket = (t: Ticket) => setTicketState(t, stuckOn, stuckOn === '内存' ? stuckStartMs : undefined);
    const stopStuck = (t: Ticket) => {
        if (stuckOn) {
            const elapsedSec = (e.nowMs() - stuckStartMs) / 1000;
            if (stuckOn === '内存')
                waitMemorySec += elapsedSec;
            openTask(e, taskDecl).logEvent(`等${stuckOn}止`, { ticket: t.name, lock: '渲染', sec: elapsedSec, machine: machineReading(e) });
            stuckOn = '';
            alarmed = false;
        }
        checkTicket(t);
    };
    const handle = await queueAcquire('渲染', { ...e, decl: taskDecl, waitHint: s => hint(`渲染排队（${s}）`), canOvertake: t => Boolean(getPassGrant(e, t.content!.task)), onLeaveAdmit: stopStuck, waitMemorySec: () => waitMemorySec, canAdmit: t => {
            if (taskDecl.noRender)
                return true;
            const m = e.readMemory(), pressure = e.readPressure(), grant = getPassGrant(e, t.content!.task), load = taskDecl.needsLoad ? e.load1Min() : null;
            const memPass = (pressure !== 4 || grant?.strength) && (grant || !m || enoughMemory(m, e.memFloor));
            const loadRatio = taskDecl.loadLimit ?? 0.8;
            const loadPass = grant || load === null || load < e.coreCount() * loadRatio;
            const blockReason = !memPass ? '内存' : !loadPass ? '负载' : '';
            if (blockReason !== stuckOn) {
                stopStuck(t);
                if (blockReason) {
                    stuckOn = blockReason;
                    stuckStartMs = e.nowMs();
                    if (blockReason === '内存') {
                        hint(`渲染等内存（${m ? readingNote(m) : '无读数'}，下限 ${e.memFloor}%，压力 ${pressure ?? '?'}）`);
                        openTask(e, taskDecl).logEvent('等内存起', { ticket: t.name, lock: '渲染', reading: m, pressure: pressure, threshold: e.memFloor, machine: machineReading(e) });
                    }
                    else {
                        hint(`渲染等负载（${load}，上限 ${e.coreCount()}×${loadRatio}）`);
                        openTask(e, taskDecl).logEvent('等负载起', { ticket: t.name, lock: '渲染', load: load, machine: machineReading(e) });
                    }
                }
            }
            checkTicket(t);
            if (stuckOn === '内存' && !alarmed && e.nowMs() - stuckStartMs >= 180000) {
                hint(`告警：等内存已满 3 分钟，票 ${t.name}；锁未占用，请主 Agent 决定`);
                alarmed = true;
            }
            if (!blockReason && grant)
                ticketReading = { ticket: t.name, pressure: pressure, reading: m, strength: grant.strength };
            return !blockReason;
        } });
    if (ticketReading)
        openTask(e, taskDecl).logEvent('单票放行', ticketReading);
    hint('放行渲染');
    consumePassGrant(e, handle.task);
    return handle;
};
export const passRenderGate = async <T>(fn: () => Promise<T>, hint: (s: string) => void = s => console.error(`== 资源闸：${s}`), env: Partial<GateEnv> = {}, taskDecl: TaskDecl = {}): Promise<T> => {
    checkReentry();
    const handle = await takeRenderGate(hint, env, taskDecl);
    let outcome = '成';
    try {
        process.env[ancestorLockEnv] = String(process.pid);
        return await lockContext.run(handle, fn);
    }
    catch (err) {
        outcome = '异常';
        throw err;
    }
    finally {
        delete process.env[ancestorLockEnv];
        handle.放(outcome);
    }
};
/** 旧读者 Number(全文)，因此 pid 放旁文件，主文件仍是纯秒数；不破坏新旧间隔。 */
export const passGate = async <T>(fn: () => Promise<T>, hint: (s: string) => void = s => console.error(`== 资源闸：${s}`), env: Partial<GateEnv> = {}, taskDecl: TaskDecl = {}): Promise<T> => {
    checkReentry();
    const e = resolveEnv(env), ownsTask = !hasTask(e.lockDir), task = openTask(e, taskDecl), lastAllowFile = path.join(e.lockDir, '上次放行'), startMs = e.nowMs();
    let stuckOn = '', memWaitStartMs: number | undefined, code = 1, waitMemorySec = 0, lastReading: Record<string, unknown> | undefined;
    const stuckSeen = new Set<string>();
    const intervalOk = () => {
        let epochSec = 0;
        try {
            epochSec = Number(fs.readFileSync(lastAllowFile, 'utf8').trim()) || 0;
        }
        catch { /* 首次 */ }
        const lockInfo = readJson<{
            sec: number;
            pid: number;
        }>(lastAllowFile + '.信息.json');
        return lockInfo?.sec === epochSec && !processAlive(lockInfo.pid) || e.nowMs() / 1000 - epochSec >= 60;
    };
    try {
        const stopMemWait = (t: Ticket) => {
            if (memWaitStartMs === undefined)
                return;
            const elapsedSec = (e.nowMs() - memWaitStartMs) / 1000;
            waitMemorySec += elapsedSec;
            task.logEvent('等内存止', { ticket: t.name, lock: '放行', sec: elapsedSec, machine: lastReading });
            memWaitStartMs = undefined;
        };
        const handle = await queueAcquire('放行', { ...e, decl: taskDecl, canOvertake: t => Boolean(getPassGrant(e, t.content!.task)), onLeaveAdmit: t => { stuckOn = ''; stopMemWait(t); setTicketState(t, '', undefined); }, waitMemorySec: () => waitMemorySec, canAdmit: t => {
                const grant = getPassGrant(e, t.content!.task), m = e.readMemory(), pressure = e.readPressure(), load = e.load1Min();
                lastReading = { load: load, gate: m?.freePercent, pressure: pressure };
                const reasonItems = [!grant && !intervalOk() ? '间隔' : '', !grant && load !== null && load >= e.coreCount() * 0.8 ? '负载' : '', !taskDecl.noRender && ((pressure === 4 && !grant?.strength) || (!grant && m && !enoughMemory(m, e.memFloor))) ? '内存' : ''].filter(Boolean).join('、');
                if (!reasonItems.includes('内存'))
                    stopMemWait(t);
                if (reasonItems && reasonItems !== stuckOn) {
                    hint(`等资源（卡在${reasonItems}；负载 ${load ?? '?'}，内存 ${m?.freePercent ?? '?'}%，压力 ${pressure ?? '?'}）`);
                    task.logEvent('放行等起', { ticket: t.name, lock: '放行', stuckOn: reasonItems, machine: lastReading });
                    if (reasonItems.includes('内存') && memWaitStartMs === undefined) {
                        memWaitStartMs = e.nowMs();
                        task.logEvent('等内存起', { ticket: t.name, lock: '放行', reading: m, pressure: pressure, threshold: e.memFloor, machine: lastReading });
                    }
                }
                if (reasonItems)
                    stuckSeen.add(reasonItems);
                stuckOn = reasonItems;
                setTicketState(t, reasonItems, memWaitStartMs);
                return !reasonItems;
            }, recheckInLock: t => Boolean(getPassGrant(e, t.content!.task)) || intervalOk() });
        try {
            const epochSec = Math.floor(e.nowMs() / 1000);
            promptOnly('上次放行', () => {
                fs.writeFileSync(lastAllowFile, `${epochSec}\n`);
                writeJson(lastAllowFile + '.信息.json', { sec: epochSec, pid: process.pid, task: task.info.task });
            });
            task.logEvent('放行', { ticket: handle.ticket, lock: '放行', waitSec: (e.nowMs() - startMs) / 1000, stuckOn: [...stuckSeen], machine: lastReading });
            consumePassGrant(e, handle.task);
        }
        finally {
            handle.放();
        }
        const result = await fn();
        code = 0;
        return result;
    }
    catch (err) {
        code = failExitCode(err);
        throw err;
    }
    finally {
        if (ownsTask)
            task.endedAt(code);
    }
};
/** 项间只在占锁满 120 秒且有人等、或明确让路时交棒；打包和浏览器由调用者保留。 */
export const openGateBatch = (taskDecl: TaskDecl, env: Partial<GateEnv> = {}) => {
    checkReentry();
    if (taskDecl.连贯 && !taskDecl.连贯.why?.trim())
        throw Error('连贯批必须写为什么');
    // 只有一项的批没有下一个让路点；项数没声明时还可能有下一项。
    const canYield = taskDecl.itemCount !== 1;
    const e = resolveEnv(env), ownsTask = !hasTask(e.lockDir), task = openTask(e, { ...taskDecl, kind: '批', canYield: canYield });
    let handle: LockHandle | null = null, finished = false, busy = false, itemsDone = 0, exitCode = 0;
    return {
        runTask: async <T>(taskItem: TaskDecl, fn: () => Promise<T>): Promise<T> => {
            if (finished || busy)
                throw Error('批已结束或并发调用一项；批内一次一路');
            busy = true;
            try {
                handle ??= await takeRenderGate(s => console.error(`== 资源闸：${s}`), e, { ...taskDecl, ...taskItem, kind: '批', canYield: canYield });
                Object.assign(handle.decl, taskItem);
                handle.heartbeat(0);
                const startMs = e.nowMs();
                process.env[ancestorLockEnv] = String(process.pid);
                try {
                    return await lockContext.run(handle, fn);
                }
                finally {
                    delete process.env[ancestorLockEnv];
                    task.logEvent('批项', { ticket: handle.ticket, 第几项: ++itemsDone, sec: (e.nowMs() - startMs) / 1000, decl: taskItem });
                    const instruction = readDirective(e, task.info.task), yielding = instruction?.动作 === '让路' && instruction.至! > e.nowMs();
                    const otherTickets = listTickets(path.join(e.lockDir, '渲染.排队')).filter(t => t.pid !== process.pid && ticketAlive(t, e.localHost));
                    // 低优先的批：有普通票在等就让，不等满 120 秒
                    const lowPriorityYield = handle.decl.lowPriority && otherTickets.some(t => !isLowPriorityTicket(t));
                    if (yielding || (!taskDecl.连贯 && (lowPriorityYield || (otherTickets.length && e.nowMs() - handle.lockAcquiredAt >= 120000)))) {
                        handle.放('让路');
                        handle = null;
                    }
                }
            }
            catch (err) {
                exitCode = failExitCode(err);
                throw err;
            }
            finally {
                busy = false;
            }
        },
        endedAt: () => { if (busy)
            throw Error('批项还在跑，不能提前结束'); if (finished)
            return; finished = true; handle?.放(); handle = null; if (ownsTask)
            task.endedAt(exitCode); },
    };
};
export const lazyPassGate = (passGateFn: (fn: () => Promise<void>) => Promise<void> = passGate) => { let p: Promise<void> | undefined; return () => p ??= passGateFn(async () => { }); };
