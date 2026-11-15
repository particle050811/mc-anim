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
export const modifyCommands = new Set(['先', '后', '恢复', '放行', '让路', '取消', '清孤儿', '记']);
export const changeScheduler = (cmd: string, target: string | undefined, p: ParsedArgs, e: SchedulerEnv, o: {
    状态?: () => SchedulerState;
    kill?: (pid: number, sig: NodeJS.Signals) => void;
    processStartTime?: (pid: number) => number | null;
    cleanOrphans?: () => unknown[];
    输出?: (s: string) => void;
    Windows?: boolean;
} = {}) => {
    const why = p.值['--为什么']?.trim();
    if (!why)
        throw new UsageError(`${cmd} 必须带 --为什么`);
    const output = o.输出 ?? console.log, s = (o.状态 ?? (() => readState(e)))();
    const matchesTarget = (name: string, pid: number) => target === name || target === `#${pid}` || target === String(pid);
    const tickets = s.票.filter(t => matchesTarget(t.名, t.pid)), held = s.持锁.filter(t => matchesTarget(t.票, t.pid));
    const single = tickets.length + held.length === 1;
    const t = single ? tickets[0] : undefined, h = single ? held[0] : undefined, task = t?.内容?.任务 ?? h?.任务;
    // 记解析后的任务和票，#pid 配不上告警，票名改序后也配不上。
    const logEvent = (outcome?: string) => recordSchedulerEvent(e.logDir, '决定', { 结果: outcome, 任务: task, 票: t?.名 ?? h?.票, 目标: target, 谁: e.caller, 发起: e.caller, 看到: { 人工:p.值['--看到'],摘要: oneLineStatus(s), 队: s.票.slice(0, 3).map(t => ({ 票: t.名, 声明: t.内容?.声明 })), 持锁: s.持锁.map(t => ({ pid: t.pid, 任务: t.任务, 票: t.票 })) }, 决定: p.值['--决定'] ?? `${cmd} ${target ?? ''}`, 为什么: why, 机: { ...s.机, 进程: undefined } }, e.nowMs());
    if (e.caller.子会话 || e.caller.代理标.endsWith('_agent'))
        console.error('!! 当前环境标记为子代理；改调度应由主 Agent 决定，身份事实已入日志');
    if (cmd === '记') {
        logEvent();
        return;
    }
    if (cmd === '清孤儿') {
        logEvent();
        for (const x of (o.cleanOrphans ?? clearOrphans)())
            recordSchedulerEvent(e.logDir, '清孤儿', { 进程: x, 为什么: why }, e.nowMs());
        return;
    }
    if (!target)
        throw new UsageError(`${cmd} 要指定完整票名或 #pid`);
    if (!single)
        throw new UsageError(`目标不存在或不唯一：${target}；用完整票名`);
    const pid = t?.pid ?? h!.pid;
    if (t && t.主机 !== hostSlug(e.localHost))
        throw new UsageError('不能从本机改另一主机的票');
    if (h && h.发起.pid !== pid)
        throw new UsageError('锁信息与 pid 不符，请重看调度');
    if(h){for(const n of ['渲染','放行']){const file=path.join(e.lockDir,n+'.lock');if(holderPid(file)===pid){const host=holderHost(file,pid);if(host&&host!==e.localHost)throw new UsageError('不能从本机操作另一主机的持锁者');}}}
    if (cmd !== '取消' && (t?.死 || h?.死))
        throw new UsageError(`#${pid} 的进程已不在，${cmd} 没有意义；留下的票或锁由下一个等待者回收`);
    const minutes = Number(p.值['--分钟'] ?? 30);
    if (!Number.isFinite(minutes) || minutes <= 0)
        throw new UsageError('--分钟 要是正数');
    const untilMs = e.nowMs() + minutes * 60000;
    if (cmd === '取消') {
        // 写全名取消一张残留票也可能杀到持锁者，同样要确认。
        if ((h || s.持锁.some(x => x.pid === pid && !x.死)) && !p.toggles.has('--杀持锁'))
            throw new UsageError('目标正在持锁；确认中断请加 --杀持锁');
        const lockOrTicket = h ? '锁' : '票', reportNoSignal = () => { const message = `未发信号：进程已不在，留下的${lockOrTicket}由下一个等待者回收`; logEvent(message); output(message); };
        if (h?.死 || t?.死) {
            reportNoSignal();
            return;
        }
        // 信号不能撤回，这里不用判死时的余量：只要启动晚于拿锁、领票就不是原来那个进程。
        const claimedStartMs = h ? h.拿锁时 : t!.内容?.起 ?? t!.时间, startedAt = (o.processStartTime ?? processStartTime)(pid);
        if (startedAt !== null && startedAt > claimedStartMs) {
            const message = `未发信号：pid ${pid} 已换人（${new Date(startedAt).toISOString()} 才启动，晚于${h ? '拿锁' : '领票'} ${new Date(claimedStartMs).toISOString()}），原进程已不在；留下的${lockOrTicket}由下一个等待者回收`;
            logEvent(message);
            output(message);
            return;
        }
        if (startedAt === null)
            console.error('!! 读不到进程启动时刻（没有 ps），只凭 pid 和开机时间核对');
        const sig = p.toggles.has('--强') ? 'SIGKILL' : 'SIGTERM';
        if (task)
            writeDirective(e, task, { 动作: '取消', 为什么: why, 时: e.nowMs(), 任务: task });
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
        recordSchedulerEvent(e.logDir, '取消', { 任务: task, 票: t?.名 ?? h?.票, 目标: pid, 信号: sig, 为什么: why, 谁: e.caller }, e.nowMs());
        // Windows 上 process.kill 是无条件终止，退出钩子不跑。
        output(`已请求 ${sig} #${pid}；${o.Windows ?? isWindows ? `Windows 上是立即终止：目标不放锁、不写日志、不打印原因，${lockOrTicket}等下一个等待者回收，它的 Chrome 查不到，要手动看` : t && !t.内容 || h?.旧 ? '旧代码不能打印取消原因' : '不要原样重发'}`);
        return;
    }
    if (cmd === '让路') {
        if (!h?.声明.可让路)
            throw new UsageError('不能让路，只能等或取消：单项或旧式整批没有让路点');
        writeDirective(e, task!, { 动作: '让路', 为什么: why, 时: e.nowMs(), 至: untilMs, 票: h?.票, 任务: task });
        logEvent();
        recordSchedulerEvent(e.logDir, '让路', { 票: h?.票, 任务: task, 至: untilMs, 为什么: why }, e.nowMs());
        output('当前段不中断；下一张票暂缓领，到期回队尾');
        return;
    }
    if (!t)
        throw new UsageError(`${cmd} 只能操作排队票`);
    if (!t.内容)
        throw new UsageError('旧票拒绝改名或放行：旧代码不认指令，只能等或取消');
    if (cmd === '放行') {
        writeDirective(e, task!, { 动作: '放行', 为什么: why, 强: p.toggles.has('--强'), 时: e.nowMs(), 至: untilMs, 票: t.名, 任务: task });
        // 快照之后票主人可能已拿锁、用掉放行，这条指令就没人删了，同任务下一段会继承。票主人删票在先、用掉在后：写完还看得到这张票，就一定会被用掉。
        if (!fs.existsSync(t.文件)) {
            deleteDirective(e, task!);
            const message = `未放行：票 ${t.名} 已不在，可能刚拿到锁、改了序或退出了，请重看调度`;
            logEvent(message);
            throw new UsageError(message);
        }
        logEvent();
        output(`单票授权已写，${new Date(untilMs).toISOString()} 到期作废（--分钟 可改）；压力 4 仍需 --强，下一张票不继承`);
        return;
    }
    const oldName = t.名, restoreOrder = p.toggles.has('--原序');
    if (cmd === '恢复' && (restoreOrder ? !t.内容.原序 : !t.内容.暂缓至))
        throw new UsageError(restoreOrder ? `票 ${t.名} 没改过序，没有原序可回` : `票 ${t.名} 没在暂缓，没有可恢复的；回原位用 --原序`);
    // 先改名再写内容：票主人可能刚拿到锁删了票，改名失败就停，写旧路径会把票复活。
    let nextTicket: Ticket;
    try {
        nextTicket = cmd === '后' ? setOrder(t, String(900000000000000 + e.nowMs()))
            : cmd === '先' ? setOrder(t, String(Math.max(1, Math.min(...listTickets(path.dirname(t.文件)).filter(x => !x.名.startsWith('9')).map(x => x.时间), Date.now()) - 1)))
                : restoreOrder ? setOrder(t, t.内容.原序!) : requeueTail(t);
    }
    catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
            throw err;
        throw new UsageError(`票 ${t.名} 已不在：可能刚拿到锁或退出了，请重看调度`);
    }
    // 快照早于读机器，票主人这期间可能写了 等内存起、卡在。改名后它不再往旧名写，这时重读才不会盖掉。
    nextTicket.内容 = readJson<TicketContent>(nextTicket.文件) ?? nextTicket.内容;
    // 往前移才算越过别人：先、恢复 --原序。
    if (nextTicket.名 < oldName)
        promptOnly('被越计数', () => recordOvertaken(listTickets(path.dirname(nextTicket.文件)).filter(q => q.名 > nextTicket.名 && q.名 < oldName), e.localHost));
    if (cmd !== '恢复')
        nextTicket.内容!.原序 ??= String(t.时间);
    if (cmd === '后') {
        nextTicket.内容!.暂缓至 = untilMs;
        nextTicket.内容!.暂缓因 = why;
    }
    else if (nextTicket.内容!.暂缓至) {
        delete nextTicket.内容!.暂缓至;
        delete nextTicket.内容!.暂缓因;
        nextTicket.内容!.起 = e.nowMs();
    }
    writeTicket(nextTicket);
    logEvent();
    recordSchedulerEvent(e.logDir, cmd === '先' ? '改序' : cmd === '后' ? '暂缓' : '恢复', { 任务: task, 票: nextTicket.名, 原序: oldName, 新序: nextTicket.名, 至: cmd === '后' ? untilMs : undefined, 为什么: why }, e.nowMs());
    output(nextTicket.名);
};
export const routeCommand = (args: string[], p: ParsedArgs, e: SchedulerEnv, output: (s: string) => void) => {
    const [action, lane] = args;
    if (action === '看') {
        const latest = new Map<string, unknown>();
        for (const x of readSchedulerEvents(e.logDir).filter(x => /^路[开完败]$/.test(x.事)))
            latest.set(String(x.路), x);
        output(JSON.stringify([...latest.values()], null, 2));
        return;
    }
    if (!['开', '完', '败'].includes(action ?? '') || !lane)
        throw new UsageError('用法：调度 路 开|完|败 <路名> [--说明 …]，或 路 看');
    recordSchedulerEvent(e.logDir, '路' + action, { 路: lane, 发起: e.caller, 说明: p.值['--说明'], 结果: p.值['--结果'] }, e.nowMs());
};
/** 动作写成明确字段：从自由文本猜，「不用让路了」也会触发退出。 */
export const orderCommand = (args: string[], p: ParsedArgs, e: SchedulerEnv, output: (s: string) => void) => {
    const [lane, ...extra] = args, yieldReason = p.值['--让路']?.trim(), undo = p.toggles.has('--撤'), now = e.nowMs();
    if (!lane || extra.length || Boolean(yieldReason) === undo)
        throw new UsageError('用法：调度 令 <路名> --让路 "原因"，或 令 <路名> --撤');
    const file = orderFile(e, lane);
    if (undo) {
        const exists = fs.existsSync(file);
        fs.rmSync(file, { force: true });
        recordSchedulerEvent(e.logDir, '令', { 路: lane, 动作: '撤', 发起: e.caller }, now);
        output(exists ? `已撤 ${lane} 的令` : `${lane} 没有令，无事可撤`);
        return;
    }
    const untilMs = now + 1800000;
    writeJson(file, { 动作: '让路', 为什么: yieldReason, 时: now, 至: untilMs });
    recordSchedulerEvent(e.logDir, '令', { 路: lane, 动作: '让路', 为什么: yieldReason, 至: untilMs, 发起: e.caller }, now);
    output(`${lane} 排队中的任务退出 75，不算失败；${new Date(untilMs).toISOString()} 失效，提前撤用 --撤`);
};
