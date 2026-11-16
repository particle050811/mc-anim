import {holderPid,holderHost,processStartTime} from './锁.ts';
import fs from 'node:fs';
import path from 'node:path';
import { UsageError, type ParsedArgs } from '../cli/参数.ts';
import { readState, oneLineStatus, type SchedulerState } from './看.ts';
import { listTickets, setOrder, requeueTail, hostSlug, writeTicket, recordOvertaken, type Ticket, type TicketContent } from './票.ts';
import { writeJson, readJson, promptOnly } from './文件.ts';
import { recordSchedulerEvent, readSchedulerEvents } from './调度日志.ts';
import { writeDirective, deleteDirective, orderFile } from './指令.ts';
import { clearOrphans } from './孤儿.ts';
import type { SchedulerEnv } from './任务.ts';
import { isWindows } from '../环境/配置.ts';
export const modifyCommands = new Set(['first', 'last', 'resume', 'release', 'yield', 'cancel', 'clean-orphans', 'note']);
export const changeScheduler = (cmd: string, target: string | undefined, p: ParsedArgs, e: SchedulerEnv, o: {
    state?: () => SchedulerState;
    kill?: (pid: number, sig: NodeJS.Signals) => void;
    processStartTime?: (pid: number) => number | null;
    cleanOrphans?: () => unknown[];
    output?: (s: string) => void;
    Windows?: boolean;
} = {}) => {
    const why = p.value['--why']?.trim();
    if (!why)
        throw new UsageError(`${cmd} 必须带 --why`);
    const output = o.output ?? console.log, s = (o.state ?? (() => readState(e)))();
    const matchesTarget = (name: string, pid: number) => target === name || target === `#${pid}` || target === String(pid);
    const tickets = s.ticket.filter(t => matchesTarget(t.name, t.pid)), held = s.lockHolders.filter(t => matchesTarget(t.ticket, t.pid));
    const single = tickets.length + held.length === 1;
    const t = single ? tickets[0] : undefined, h = single ? held[0] : undefined, task = t?.content?.task ?? h?.task;
    // 记解析后的任务和票，#pid 配不上告警，票名改序后也配不上。
    const logEvent = (outcome?: string) => recordSchedulerEvent(e.logDir, '决定', { result: outcome, task: task, ticket: t?.name ?? h?.ticket, target: target, who: e.caller, initiator: e.caller, observed: { 人工:p.value['--saw'],digest: oneLineStatus(s), queue: s.ticket.slice(0, 3).map(t => ({ ticket: t.name, decl: t.content?.decl })), lockHolders: s.lockHolders.map(t => ({ pid: t.pid, task: t.task, ticket: t.ticket })) }, decision: p.value['--decision'] ?? `${cmd} ${target ?? ''}`, why: why, machine: { ...s.machine, processes: undefined } }, e.nowMs());
    if (e.caller.childSession || e.caller.agentTag.endsWith('_agent'))
        console.error('!! 当前环境标记为子代理；改调度应由主 Agent 决定，身份事实已入日志');
    if (cmd === 'note') {
        logEvent();
        return;
    }
    if (cmd === 'clean-orphans') {
        logEvent();
        for (const x of (o.cleanOrphans ?? clearOrphans)())
            recordSchedulerEvent(e.logDir, '清孤儿', { processes: x, why: why }, e.nowMs());
        return;
    }
    if (!target)
        throw new UsageError(`${cmd} 要指定完整票名或 #pid`);
    if (!single)
        throw new UsageError(`目标不存在或不唯一：${target}；用完整票名`);
    const pid = t?.pid ?? h!.pid;
    if (t && t.host !== hostSlug(e.localHost))
        throw new UsageError('不能从本机改另一主机的票');
    if (h && h.initiator.pid !== pid)
        throw new UsageError('锁信息与 pid 不符，请重看调度');
    if(h){for(const n of ['渲染','放行']){const file=path.join(e.lockDir,n+'.lock');if(holderPid(file)===pid){const host=holderHost(file,pid);if(host&&host!==e.localHost)throw new UsageError('不能从本机操作另一主机的持锁者');}}}
    if (cmd !== 'cancel' && (t?.死 || h?.死))
        throw new UsageError(`#${pid} 的进程已不在，${cmd} 没有意义；留下的票或锁由下一个等待者回收`);
    const minutes = Number(p.value['--minutes'] ?? 30);
    if (!Number.isFinite(minutes) || minutes <= 0)
        throw new UsageError('--minutes 要是正数');
    const untilMs = e.nowMs() + minutes * 60000;
    if (cmd === 'cancel') {
        // 写全名取消一张残留票也可能杀到持锁者，同样要确认。
        if ((h || s.lockHolders.some(x => x.pid === pid && !x.死)) && !p.toggles.has('--kill-holder'))
            throw new UsageError('目标正在持锁；确认中断请加 --kill-holder');
        const lockOrTicket = h ? '锁' : '票', reportNoSignal = () => { const message = `未发信号：进程已不在，留下的${lockOrTicket}由下一个等待者回收`; logEvent(message); output(message); };
        if (h?.死 || t?.死) {
            reportNoSignal();
            return;
        }
        // 信号不能撤回，这里不用判死时的余量：只要启动晚于拿锁、领票就不是原来那个进程。
        const claimedStartMs = h ? h.lockAcquiredAt : t!.content?.start ?? t!.time, startedAt = (o.processStartTime ?? processStartTime)(pid);
        if (startedAt !== null && startedAt > claimedStartMs) {
            const message = `未发信号：pid ${pid} 已换人（${new Date(startedAt).toISOString()} 才启动，晚于${h ? '拿锁' : '领票'} ${new Date(claimedStartMs).toISOString()}），原进程已不在；留下的${lockOrTicket}由下一个等待者回收`;
            logEvent(message);
            output(message);
            return;
        }
        if (startedAt === null)
            console.error('!! 读不到进程启动时刻（没有 ps），只凭 pid 和开机时间核对');
        const sig = p.toggles.has('--force') ? 'SIGKILL' : 'SIGTERM';
        if (task)
            writeDirective(e, task, { 动作: '取消', why: why, timestamp: e.nowMs(), task: task });
        try {
            (o.kill ?? ((n, sig) => { process.kill(n, sig); }))(pid, sig);
        }
        catch (err) {
            if (task)
                deleteDirective(e, task);
            const code = (err as NodeJS.ErrnoException).code;
            if (code === 'ESRCH') {
                reportNoSignal();
                return;
            }
            const message = `信号失败：${sig} #${pid} ${code ?? (err as Error).message}`;
            logEvent(message);
            throw Error(message);
        }
        logEvent(`已发 ${sig}`);
        recordSchedulerEvent(e.logDir, '取消', { task: task, ticket: t?.name ?? h?.ticket, target: pid, signal: sig, why: why, who: e.caller }, e.nowMs());
        // Windows 上 process.kill 是无条件终止，退出钩子不跑。
        output(`已请求 ${sig} #${pid}；${o.Windows ?? isWindows ? `Windows 上是立即终止：目标不放锁、不写日志、不打印原因，${lockOrTicket}等下一个等待者回收，它的 Chrome 查不到，要手动看` : t && !t.content || h?.旧 ? '旧代码不能打印取消原因' : '不要原样重发'}`);
        return;
    }
    if (cmd === 'yield') {
        if (!h?.decl.canYield)
            throw new UsageError('不能让路，只能等或取消：单项或旧式整批没有让路点');
        writeDirective(e, task!, { 动作: '让路', why: why, timestamp: e.nowMs(), 至: untilMs, ticket: h?.ticket, task: task });
        logEvent();
        recordSchedulerEvent(e.logDir, '让路', { ticket: h?.ticket, task: task, 至: untilMs, why: why }, e.nowMs());
        output('当前段不中断；下一张票暂缓领，到期回队尾');
        return;
    }
    if (!t)
        throw new UsageError(`${cmd} 只能操作排队票`);
    if (!t.content)
        throw new UsageError('旧票拒绝改名或放行：旧代码不认指令，只能等或取消');
    if (cmd === 'release') {
        writeDirective(e, task!, { 动作: '放行', why: why, strength: p.toggles.has('--force'), timestamp: e.nowMs(), 至: untilMs, ticket: t.name, task: task });
        // 快照之后票主人可能已拿锁、用掉放行，这条指令就没人删了，同任务下一段会继承。票主人删票在先、用掉在后：写完还看得到这张票，就一定会被用掉。
        if (!fs.existsSync(t.file)) {
            deleteDirective(e, task!);
            const message = `未放行：票 ${t.name} 已不在，可能刚拿到锁、改了序或退出了，请重看调度`;
            logEvent(message);
            throw new UsageError(message);
        }
        logEvent();
        output(`单票授权已写，${new Date(untilMs).toISOString()} 到期作废（--minutes 可改）；压力 4 仍需 --force，下一张票不继承`);
        return;
    }
    const oldName = t.name, restoreOrder = p.toggles.has('--orig-order');
    if (cmd === 'resume' && (restoreOrder ? !t.content.原序 : !t.content.暂缓至))
        throw new UsageError(restoreOrder ? `票 ${t.name} 没改过序，没有原序可回` : `票 ${t.name} 没在暂缓，没有可恢复的；回原位用 --orig-order`);
    // 先改名再写内容：票主人可能刚拿到锁删了票，改名失败就停，写旧路径会把票复活。
    let nextTicket: Ticket;
    try {
        nextTicket = cmd === 'last' ? setOrder(t, String(900000000000000 + e.nowMs()))
            : cmd === 'first' ? setOrder(t, String(Math.max(1, Math.min(...listTickets(path.dirname(t.file)).filter(x => !x.name.startsWith('9')).map(x => x.time), Date.now()) - 1)))
                : restoreOrder ? setOrder(t, t.content.原序!) : requeueTail(t);
    }
    catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
            throw err;
        throw new UsageError(`票 ${t.name} 已不在：可能刚拿到锁或退出了，请重看调度`);
    }
    // 快照早于读机器，票主人这期间可能写了 等内存起、卡在。改名后它不再往旧名写，这时重读才不会盖掉。
    nextTicket.content = readJson<TicketContent>(nextTicket.file) ?? nextTicket.content;
    // 往前移才算越过别人：first、resume --orig-order。
    if (nextTicket.name < oldName)
        promptOnly('被越计数', () => recordOvertaken(listTickets(path.dirname(nextTicket.file)).filter(q => q.name > nextTicket.name && q.name < oldName), e.localHost));
    if (cmd !== 'resume')
        nextTicket.content!.原序 ??= String(t.time);
    if (cmd === 'last') {
        nextTicket.content!.暂缓至 = untilMs;
        nextTicket.content!.暂缓因 = why;
    }
    else if (nextTicket.content!.暂缓至) {
        delete nextTicket.content!.暂缓至;
        delete nextTicket.content!.暂缓因;
        nextTicket.content!.start = e.nowMs();
    }
    writeTicket(nextTicket);
    logEvent();
    recordSchedulerEvent(e.logDir, cmd === 'first' ? '改序' : cmd === 'last' ? '暂缓' : '恢复', { task: task, ticket: nextTicket.name, 原序: oldName, 新序: nextTicket.name, 至: cmd === 'last' ? untilMs : undefined, why: why }, e.nowMs());
    output(nextTicket.name);
};
export const routeCommand = (args: string[], p: ParsedArgs, e: SchedulerEnv, output: (s: string) => void) => {
    const [action, lane] = args;
    if (action === 'show') {
        const latest = new Map<string, unknown>();
        for (const x of readSchedulerEvents(e.logDir).filter(x => /^路[开完败]$/.test(x.event)))
            latest.set(String(x.lane), x);
        output(JSON.stringify([...latest.values()], null, 2));
        return;
    }
    // 日志里的事件名照旧是 路开、路完、路败（盘上数据，sched watch 和 route show 都按它认）
    const eventName = ({ open: '路开', done: '路完', fail: '路败' } as Record<string, string>)[action ?? ''];
    if (!eventName || !lane)
        throw new UsageError('用法：sched route open|done|fail <路名> [--note …]，或 route show');
    recordSchedulerEvent(e.logDir, eventName, { lane: lane, initiator: e.caller, note: p.value['--note'], result: p.value['--result'] }, e.nowMs());
};
/** 动作写成明确字段：从自由文本猜，「不用让路了」也会触发退出。 */
export const orderCommand = (args: string[], p: ParsedArgs, e: SchedulerEnv, output: (s: string) => void) => {
    const [lane, ...extra] = args, yieldReason = p.value['--yield']?.trim(), undo = p.toggles.has('--undo'), now = e.nowMs();
    if (!lane || extra.length || Boolean(yieldReason) === undo)
        throw new UsageError('用法：sched order <路名> --yield "原因"，或 order <路名> --undo');
    const file = orderFile(e, lane);
    if (undo) {
        const exists = fs.existsSync(file);
        fs.rmSync(file, { force: true });
        recordSchedulerEvent(e.logDir, '令', { lane: lane, 动作: '撤', initiator: e.caller }, now);
        output(exists ? `已撤 ${lane} 的令` : `${lane} 没有令，无事可撤`);
        return;
    }
    const untilMs = now + 1800000;
    writeJson(file, { 动作: '让路', why: yieldReason, timestamp: now, 至: untilMs });
    recordSchedulerEvent(e.logDir, '令', { lane: lane, 动作: '让路', why: yieldReason, 至: untilMs, initiator: e.caller }, now);
    output(`${lane} 排队中的任务退出 75，不算失败；${new Date(untilMs).toISOString()} 失效，提前撤用 --undo`);
};
