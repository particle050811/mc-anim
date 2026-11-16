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
    readMachine: e.readMachine ?? (e.lockDir ? () => ({ 负载: 0, 核: 10, 闸: null, 压力: null, free: null, 压缩: null, swap: null, 换出: null, GPU: null, 热: null, 盘: null, 孤儿: 0, 进程: '' }) : readMachineSnapshot),
    clearOrphans: e.clearOrphans ?? (e.lockDir ? () => [] : clearOrphans) });
export type LockHandle = {
    文件: string;
    票: string;
    任务: string;
    声明: TaskDecl;
    拿锁时: number;
    放: (outcome?: string) => void;
    心跳: (frame?: number) => void;
};
type QueueOptions = Partial<GateEnv> & {
    intervalMs?: number;
    waitHint?: (s: string) => void;
    canAdmit?: (ticket: Ticket) => boolean;
    canOvertake?: (ticket: Ticket) => boolean;
    声明?: TaskDecl;
    recheckInLock?: (ticket: Ticket) => boolean;
    /** 这一轮没轮到或锁被活进程拿着，准入没被调：等资源的状态要结束，等的是锁或队列。 */
    onLeaveAdmit?: (ticket: Ticket) => void;
    /** 这次排队里等内存的累计秒，写进拿锁事件。 */
    waitMemorySec?: () => number;
};
const writeTicketState = (t: Ticket) => promptOnly('票状态', () => writeTicket(t));
/** 票主人每轮对一次，不一样才写：记被越、改调度 可能用旧内容盖过票，只在状态变化时写的话，等内存告警和 看 的标记就一直缺。 */
const setTicketState = (t: Ticket, stuckOn: string, waitMemStart?: number) => {
    const c = t.内容!;
    if ((c.卡在 ?? '') === stuckOn && c.等内存起 === waitMemStart)
        return;
    if (stuckOn)
        c.卡在 = stuckOn;
    else
        delete c.卡在;
    if (waitMemStart === undefined)
        delete c.等内存起;
    else
        c.等内存起 = waitMemStart;
    writeTicketState(t);
};
const withoutProcesses = ({ 进程: _, ...m }: MachineSnapshot) => m;
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
        const taskDecl = opts.声明 ?? { 种: process.argv[2] ?? '脚本', 用途: process.env.ANIM_PURPOSE ?? '未声明' };
        taskDecl.种 ??= process.argv[2] ?? '脚本';
        taskDecl.用途 ??= process.env.ANIM_PURPOSE ?? '未声明';
        if (process.env.ANIM_PRIORITY === 'low') taskDecl.低优先 = true;
        taskDecl.预计秒 ??= estimate(taskDecl, path.dirname(e.logDir));
        const task = taskHandle = openTask(e, taskDecl);
        clearTicket = () => promptOnly('删票', () => clearTaskTickets(dir, task.info.任务));
        clearTicket();
        let t = claimTicket(dir, e.localHost, { ...task.info, 声明: taskDecl }, e.nowMs());
        task.update(taskDecl, t.名, '排队');
        const yieldCmd = readDirective(e, task.info.任务);
        if (yieldCmd?.动作 === '让路' && yieldCmd.至 && yieldCmd.至 > e.nowMs() && yieldCmd.票 !== t.名) {
            t.内容!.暂缓至 = yieldCmd.至;
            t.内容!.暂缓因 = yieldCmd.为什么;
            t.内容!.原序 = String(t.时间);
            t = setOrder(t, String(900000000000000 + e.nowMs()));
            writeTicketState(t);
            console.error(`== 调度让路：${yieldCmd.为什么}；下一张票暂缓至 ${new Date(yieldCmd.至).toISOString()}`);
            deleteDirective(e, task.info.任务);
        }
        const startMs = e.nowMs();
        let origWait = '', lastMonitor = 0;
        const logEvent = (eventName: string, fields: Record<string, unknown> = {}) => task.logEvent(eventName, { 票: t.名, 锁: lockName, 声明: taskDecl, ...fields });
        const monitorDue = () => e.nowMs() - lastMonitor >= 3000;
        const monitor = (machine?: MachineSnapshot) => { if (!monitorDue())
            return; lastMonitor = e.nowMs(); promptOnly('监测', () => {
            // 说的是自己的告警当场打到 stderr：调用方（子 Agent）不挂 盯 也看得到自己卡住了
            for (const a of monitorRound(e, readState(e, () => machine ?? e.readMachine(), false)))
                if (a.pid === process.pid)
                    console.error(`!! 告警 ${a.类} ${a.对象}：${Math.round(a.值)} ≥ ${Math.round(a.阈值)}（第 ${a.次数} 次）。${a.类 === '无帧' ? '这么久没出新帧，多半卡住了；别原样重跑，先缩小范围查是哪样东西卡' : ''}`);
        }); };
        const cleanOrphans = () => promptOnly('清孤儿', () => { for (const p of e.clearOrphans())
            logEvent('清孤儿', { 进程: p }); });
        const onReclaim = (pid: number | null) => {
            const info = readJson<{ pid: number }>(infoFile);
            logEvent('回收死锁', { 原持有者: info?.pid === pid ? info : { pid } });
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
        const readQueueState = () => { const tickets = listTickets(dir); return { 深度: tickets.filter(x => x.名 !== t.名).length, 前面: tickets.filter(x => x.名 < t.名).slice(0, 3).map(x => x.名), 持锁: holderPid(file) }; };
        withdrawTicket = registerCleanup(clearTicket);
        const queueState = readQueueState();
        roundMachine = await sampleMachine();
        logEvent('领票', { 队: queueState, 机: roundReading() });
        promptOnly('领票提示', () => {
            const occupancy = queueOccupancy(readOccupancy(e), lockName), ahead = occupancy.票.filter(q => !q.死 && q.名 < t.名), liveLocks = occupancy.持锁.filter(x => !x.死);
            if (!ahead.length && !liveLocks.length)
                return;
            const { 秒: waitSec, unresolved } = waitAhead({ 持锁: liveLocks, 票: ahead }, e.nowMs());
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
            const myTickets = listTickets(dir).filter(x => x.内容?.任务 === task.info.任务 && x.pid === process.pid);
            // 写旧路径和改名撞上时会出两张：改名后的那张才算数。
            const other = myTickets.find(x => x.名 !== t.名) ?? myTickets[0];
            for (const x of myTickets)
                if (x !== other)
                    promptOnly('删票', () => fs.rmSync(x.文件, { force: true }));
            if (other)
                t = other;
            else {
                const oldName = t.名;
                t = claimTicket(dir, e.localHost, { ...task.info, 声明: taskDecl }, e.nowMs());
                logEvent('票丢失', { 原名: oldName, 新名: t.名 });
            }
            if (t.内容?.暂缓至 && t.内容.暂缓至 <= e.nowMs()) {
                try {
                    t = requeueTail(t);
                }
                catch {
                    await pause();
                    continue;
                }
                delete t.内容!.暂缓至;
                delete t.内容!.暂缓因;
                t.内容!.起 = e.nowMs();
                writeTicketState(t);
                logEvent('恢复', { 原因: '暂缓到期回队尾' });
            }
            try {
                fs.utimesSync(t.文件, new Date(), new Date());
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
                        fs.unlinkSync(q.文件);
                        logEvent('清死票', { 原信息: q });
                        cleanOrphans();
                    }
                    catch { /* 另一读者先回收 */ }
                }
            }
            const grant = readDirective(e, task.info.任务);
            if (grant?.动作 === '放行' && (grant.至 ?? 0) <= e.nowMs()) {
                console.error(`!! 放行授权已过期（${grant.为什么}）：这张票回到正常判断，还要放行请重发`);
                logEvent('放行过期', { 至: grant.至, 为什么: grant.为什么 });
                deleteDirective(e, task.info.任务);
            }
            const skipQueue = opts.canOvertake?.(t) ?? false;
            const deferred = Boolean(t.内容?.暂缓至 && t.内容.暂缓至 > e.nowMs());
            const myTurn = skipQueue || (!deferred && liveTickets[0]?.名 === t.名), held = lockHeld(file, e.localHost);
            if (myTurn && !held) {
                if ((opts.canAdmit?.(t) ?? true) && tryAcquire(file, e.localHost, onReclaim)) {
                    if (!opts.recheckInLock || opts.recheckInLock(t))
                        break;
                    releaseLock(file);
                }
            }
            else
                opts.onLeaveAdmit?.(t);
            const waitText = deferred ? `暂缓至 ${new Date(t.内容!.暂缓至!).toISOString()}${t.内容!.暂缓因 ? `：${t.内容!.暂缓因}` : ''}` : held ? `锁在 pid ${holderPid(file) ?? '?'} 手里` : myTurn ? '等资源' : '前面还有人排队';
            if (waitText !== origWait) {
                opts.waitHint?.(waitText);
                logEvent('排队', { 等谁: holderPid(file), 前面: liveTickets.slice(0, 3).map(x => x.名), 状态: waitText });
                origWait = waitText;
            }
            await pause();
        }
        const acquiredAt = e.nowMs();
        task.update(taskDecl, t.名, '持锁');
        // 正常轮到时前面没有活票；还有的就是被放行越过了。
        promptOnly('被越计数', () => recordOvertaken(listTickets(dir).filter(q => q.名 < t.名), e.localHost));
        logEvent('拿锁', { 等锁秒: (acquiredAt - startMs) / 1000, 等内存秒: opts.waitMemorySec?.() ?? 0, 被越次数: t.内容?.已被越 ?? 0, 队: readQueueState(), 机: roundReading() ?? machineReading(e) });
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
            promptOnly('信息文件', () => writeJson(infoFile, { pid: process.pid, 任务: task.info.任务, 票: t.名, 发起: task.info.发起, 声明: taskDecl, 拿锁时: acquiredAt, 心跳: lastWrite, 帧时: frameTime, 已出帧: framesDone, 总帧: taskDecl.帧数 }));
        };
        heartbeat();
        const timeLimit = Number(process.env.ANIM_TIME_LIMIT);
        const limitTimer = lockName === '渲染' && timeLimit > 0 ? setTimeout(() => { logEvent('限时杀', { 限时: timeLimit, 已跑秒: (e.nowMs() - task.info.起) / 1000 }); process.exit(124); }, timeLimit * 1000) : undefined;
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
            logEvent('放锁', { 持锁秒: (e.nowMs() - acquiredAt) / 1000, 结果: outcome, 已出帧: framesDone, 队: readQueueState(), 机: interrupted ? { 负载: e.load1Min() } : machineReading(e) });
            if (outcome !== '成')
                promptOnly('重复失败', () => { const a = reportRepeatedStillFail(e.logDir, { 声明: taskDecl, 工作区: task.info.发起.工作区, 任务: task.info.任务, pid: process.pid, 会话: task.info.发起.会话 }, e.nowMs()); if (a)
                    console.error(`!! 告警 静帧重复失败 ${a.对象}：同一批帧连着 ${a.值} 次没出来，别再原样重跑`); });
            if (!interrupted)
                task.update(taskDecl, t.名, '');
            // 持锁期间 anim sched 的改名可能和删票撞上，留下的票会挡住后来者，放锁前再扫一次。
            clearTicket();
            dropLock();
            handOver();
            if (ownsTask && !interrupted)
                task.结束(outcome === '成' ? 0 : 1);
        };
        return { 文件: file, 票: t.名, 任务: task.info.任务, 声明: taskDecl, 拿锁时: acquiredAt, 放: release, 心跳: heartbeat };
    }
    catch (err) {
        clearTicket();
        withdrawTicket();
        dropLock();
        handOver();
        taskHandle?.update(taskHandle.info.声明, taskHandle.info.票, '');
        if (ownsTask)
            taskHandle?.结束(failExitCode(err));
        throw err;
    }
};
export const gateHeartbeat = (frame?: number) => lockContext.getStore()?.心跳(frame);
export const currentTicket = () => lockContext.getStore()?.票;
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
            openTask(e, taskDecl).logEvent(`等${stuckOn}止`, { 票: t.名, 锁: '渲染', 秒: elapsedSec, 机: machineReading(e) });
            stuckOn = '';
            alarmed = false;
        }
        checkTicket(t);
    };
    const handle = await queueAcquire('渲染', { ...e, 声明: taskDecl, waitHint: s => hint(`渲染排队（${s}）`), canOvertake: t => Boolean(getPassGrant(e, t.内容!.任务)), onLeaveAdmit: stopStuck, waitMemorySec: () => waitMemorySec, canAdmit: t => {
            if (taskDecl.不开渲染)
                return true;
            const m = e.readMemory(), pressure = e.readPressure(), grant = getPassGrant(e, t.内容!.任务), load = taskDecl.需负载 ? e.load1Min() : null;
            const memPass = (pressure !== 4 || grant?.强) && (grant || !m || enoughMemory(m, e.memFloor));
            const loadPass = grant || load === null || load < e.coreCount() * 0.8;
            const blockReason = !memPass ? '内存' : !loadPass ? '负载' : '';
            if (blockReason !== stuckOn) {
                stopStuck(t);
                if (blockReason) {
                    stuckOn = blockReason;
                    stuckStartMs = e.nowMs();
                    if (blockReason === '内存') {
                        hint(`渲染等内存（${m ? readingNote(m) : '无读数'}，下限 ${e.memFloor}%，压力 ${pressure ?? '?'}）`);
                        openTask(e, taskDecl).logEvent('等内存起', { 票: t.名, 锁: '渲染', 读数: m, 压力: pressure, 阈值: e.memFloor, 机: machineReading(e) });
                    }
                    else {
                        hint(`渲染等负载（${load}，上限 ${e.coreCount()}×0.8）`);
                        openTask(e, taskDecl).logEvent('等负载起', { 票: t.名, 锁: '渲染', 负载: load, 机: machineReading(e) });
                    }
                }
            }
            checkTicket(t);
            if (stuckOn === '内存' && !alarmed && e.nowMs() - stuckStartMs >= 180000) {
                hint(`告警：等内存已满 3 分钟，票 ${t.名}；锁未占用，请主 Agent 决定`);
                alarmed = true;
            }
            if (!blockReason && grant)
                ticketReading = { 票: t.名, 压力: pressure, 读数: m, 强: grant.强 };
            return !blockReason;
        } });
    if (ticketReading)
        openTask(e, taskDecl).logEvent('单票放行', ticketReading);
    hint('放行渲染');
    consumePassGrant(e, handle.任务);
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
            秒: number;
            pid: number;
        }>(lastAllowFile + '.信息.json');
        return lockInfo?.秒 === epochSec && !processAlive(lockInfo.pid) || e.nowMs() / 1000 - epochSec >= 60;
    };
    try {
        const stopMemWait = (t: Ticket) => {
            if (memWaitStartMs === undefined)
                return;
            const elapsedSec = (e.nowMs() - memWaitStartMs) / 1000;
            waitMemorySec += elapsedSec;
            task.logEvent('等内存止', { 票: t.名, 锁: '放行', 秒: elapsedSec, 机: lastReading });
            memWaitStartMs = undefined;
        };
        const handle = await queueAcquire('放行', { ...e, 声明: taskDecl, canOvertake: t => Boolean(getPassGrant(e, t.内容!.任务)), onLeaveAdmit: t => { stuckOn = ''; stopMemWait(t); setTicketState(t, '', undefined); }, waitMemorySec: () => waitMemorySec, canAdmit: t => {
                const grant = getPassGrant(e, t.内容!.任务), m = e.readMemory(), pressure = e.readPressure(), load = e.load1Min();
                lastReading = { 负载: load, 闸: m?.空闲百分比, 压力: pressure };
                const reasonItems = [!grant && !intervalOk() ? '间隔' : '', !grant && load !== null && load >= e.coreCount() * 0.8 ? '负载' : '', !taskDecl.不开渲染 && ((pressure === 4 && !grant?.强) || (!grant && m && !enoughMemory(m, e.memFloor))) ? '内存' : ''].filter(Boolean).join('、');
                if (!reasonItems.includes('内存'))
                    stopMemWait(t);
                if (reasonItems && reasonItems !== stuckOn) {
                    hint(`等资源（卡在${reasonItems}；负载 ${load ?? '?'}，内存 ${m?.空闲百分比 ?? '?'}%，压力 ${pressure ?? '?'}）`);
                    task.logEvent('放行等起', { 票: t.名, 锁: '放行', 卡在: reasonItems, 机: lastReading });
                    if (reasonItems.includes('内存') && memWaitStartMs === undefined) {
                        memWaitStartMs = e.nowMs();
                        task.logEvent('等内存起', { 票: t.名, 锁: '放行', 读数: m, 压力: pressure, 阈值: e.memFloor, 机: lastReading });
                    }
                }
                if (reasonItems)
                    stuckSeen.add(reasonItems);
                stuckOn = reasonItems;
                setTicketState(t, reasonItems, memWaitStartMs);
                return !reasonItems;
            }, recheckInLock: t => Boolean(getPassGrant(e, t.内容!.任务)) || intervalOk() });
        try {
            const epochSec = Math.floor(e.nowMs() / 1000);
            promptOnly('上次放行', () => {
                fs.writeFileSync(lastAllowFile, `${epochSec}\n`);
                writeJson(lastAllowFile + '.信息.json', { 秒: epochSec, pid: process.pid, 任务: task.info.任务 });
            });
            task.logEvent('放行', { 票: handle.票, 锁: '放行', 等秒: (e.nowMs() - startMs) / 1000, 卡在: [...stuckSeen], 机: lastReading });
            consumePassGrant(e, handle.任务);
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
            task.结束(code);
    }
};
/** 项间只在占锁满 120 秒且有人等、或明确让路时交棒；打包和浏览器由调用者保留。 */
export const openGateBatch = (taskDecl: TaskDecl, env: Partial<GateEnv> = {}) => {
    checkReentry();
    if (taskDecl.连贯 && !taskDecl.连贯.为什么?.trim())
        throw Error('连贯批必须写为什么');
    // 只有一项的批没有下一个让路点；项数没声明时还可能有下一项。
    const canYield = taskDecl.项数 !== 1;
    const e = resolveEnv(env), ownsTask = !hasTask(e.lockDir), task = openTask(e, { ...taskDecl, 种: '批', 可让路: canYield });
    let handle: LockHandle | null = null, finished = false, busy = false, itemsDone = 0, exitCode = 0;
    return {
        runTask: async <T>(taskItem: TaskDecl, fn: () => Promise<T>): Promise<T> => {
            if (finished || busy)
                throw Error('批已结束或并发调用一项；批内一次一路');
            busy = true;
            try {
                handle ??= await takeRenderGate(s => console.error(`== 资源闸：${s}`), e, { ...taskDecl, ...taskItem, 种: '批', 可让路: canYield });
                Object.assign(handle.声明, taskItem);
                handle.心跳(0);
                const startMs = e.nowMs();
                process.env[ancestorLockEnv] = String(process.pid);
                try {
                    return await lockContext.run(handle, fn);
                }
                finally {
                    delete process.env[ancestorLockEnv];
                    task.logEvent('批项', { 票: handle.票, 第几项: ++itemsDone, 秒: (e.nowMs() - startMs) / 1000, 声明: taskItem });
                    const instruction = readDirective(e, task.info.任务), yielding = instruction?.动作 === '让路' && instruction.至! > e.nowMs();
                    const otherTickets = listTickets(path.join(e.lockDir, '渲染.排队')).filter(t => t.pid !== process.pid && ticketAlive(t, e.localHost));
                    // 低优先的批：有普通票在等就让，不等满 120 秒
                    const lowPriorityYield = handle.声明.低优先 && otherTickets.some(t => !isLowPriorityTicket(t));
                    if (yielding || (!taskDecl.连贯 && (lowPriorityYield || (otherTickets.length && e.nowMs() - handle.拿锁时 >= 120000)))) {
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
        结束: () => { if (busy)
            throw Error('批项还在跑，不能提前结束'); if (finished)
            return; finished = true; handle?.放(); handle = null; if (ownsTask)
            task.结束(exitCode); },
    };
};
export const lazyPassGate = (passGateFn: (fn: () => Promise<void>) => Promise<void> = passGate) => { let p: Promise<void> | undefined; return () => p ??= passGateFn(async () => { }); };
