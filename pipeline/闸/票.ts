import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pidReplaced, processAlive, retry } from './锁.ts';
import { readJson, writeJson, listFiles } from './文件.ts';
import type { TaskInfo, TaskDecl } from './任务.ts';
import type { Caller } from './发起者.ts';
export type TicketContent = {
    v: 1;
    任务: string;
    /** 这一轮等待的起点；暂缓结束时重新起算，否则一恢复就按等了半小时告警。 */
    起: number;
    发起: Caller;
    声明: TaskDecl;
    原序?: string;
    暂缓至?: number;
    暂缓因?: string;
    等内存起?: number;
    卡在?: string;
    已被越?: number;
};
export type Ticket = {
    文件: string;
    名: string;
    pid: number;
    主机: string;
    时间: number;
    内容: TicketContent | null;
    /** 读状态才算；死票要等下一个等待者回收，读的人不能把它算占用。 */
    死?: boolean;
};
export const hostSlug = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_');
export const parseTicket = (ticketName: string) => { const m = /^(\d+)-(.+)-(\d+)$/.exec(ticketName); return m ? { 时间: Number(m[1]), 主机: m[2]!, pid: Number(m[3]) } : null; };
export const listTickets = (dir: string): Ticket[] => listFiles(dir).sort().flatMap(ticketName => { const x = parseTicket(ticketName); if (!x)
    return []; const file = path.join(dir, ticketName), ticketContent = readJson<TicketContent>(file); return [{ ...x, 文件: file, 名: ticketName, 内容: ticketContent?.v === 1 ? ticketContent : null }]; });
let seqIndex = 0;
/** 队序就是票名：普通票 0 开头（领票毫秒），低优先 8 开头（排在全部普通票后面，彼此仍先来先渲），暂缓 9 开头 */
const lowPriorityBase = 800000000000000;
export const isLowPriorityTicket = (t: Pick<Ticket, '时间'>) => t.时间 >= lowPriorityBase && t.时间 < 900000000000000;
const isNormalTicket = (x: Ticket) => !x.名.startsWith('9') && !isLowPriorityTicket(x);
export const claimTicket = (dir: string, localHost: string, task: TaskInfo, now: number): Ticket => {
    fs.mkdirSync(dir, { recursive: true });
    seqIndex = Math.max(Date.now(), seqIndex + 1);
    const ticketName = `${String(task.声明.低优先 ? lowPriorityBase + seqIndex : seqIndex).padStart(15, '0')}-${hostSlug(localHost)}-${process.pid}`;
    const ticketContent: TicketContent = { v: 1, 任务: task.任务, 起: now, 发起: task.发起, 声明: task.声明 };
    const file = path.join(dir, ticketName);
    writeJson(file, ticketContent);
    return { 名: ticketName, 文件: file, 内容: ticketContent, pid: process.pid, 主机: hostSlug(localHost), 时间: Number(ticketName.split('-')[0]) };
};
export const ticketAlive = (t: Ticket, localHost: string) => {
    if (t.主机 === hostSlug(localHost))
        return processAlive(t.pid) && (()=>{try{const m=fs.statSync(t.文件).mtimeMs;return m>=Date.now()-os.uptime()*1000&&!pidReplaced(t.pid,m);}catch{return false;}})();
    try {
        return Date.now() - fs.statSync(t.文件).mtimeMs < 60000;
    }
    catch {
        return false;
    }
};
export const setOrder = (t: Ticket, seqIndex: string) => {
    if (!t.内容)
        throw Error('旧票拒绝改名：旧代码不能重新找票；只能等或取消');
    const newTicketName = `${seqIndex.padStart(15, '0')}-${t.主机}-${t.pid}`, file = path.join(path.dirname(t.文件), newTicketName);
    fs.renameSync(t.文件, file);
    return { ...t, 名: newTicketName, 文件: file, 时间: Number(seqIndex) };
};
/** 票可能刚被改名或删除：往旧路径写会把它复活成残留活票。 */
export const writeTicket = (t: Ticket) => { if (fs.existsSync(t.文件))
    writeJson(t.文件, t.内容); };
/** 写进别人的票，票主人每轮重读；撞上改名或删票至多丢一次计数。暂缓的本来就不在等，不算被越。 */
export const recordOvertaken = (tickets: Ticket[], localHost: string) => { for (const q of tickets)
    if (q.内容 && !q.内容.暂缓至 && ticketAlive(q, localHost)) {
        q.内容.已被越 = (q.内容.已被越 ?? 0) + 1;
        writeTicket(q);
    } };
/** anim sched 随时可能改票名，记下的文件名靠不住，按任务和 pid 扫。 */
export const clearTaskTickets = (dir: string, task: string) => { for (const x of listTickets(dir))
    if (x.pid === process.pid && x.内容?.任务 === task)
        retry(() => fs.rmSync(x.文件, { force: true })); };
/** 低优先的票回到低优先那一档的队尾，普通票回普通票的队尾 */
export const requeueTail = (t: Ticket) => {
    const lowPriority = Boolean(t.内容?.声明?.低优先), baseTime = lowPriority ? lowPriorityBase : 0;
    const sameTierTimes = listTickets(path.dirname(t.文件)).filter(x => (lowPriority ? isLowPriorityTicket(x) : isNormalTicket(x))).map(x => x.时间 - baseTime);
    return setOrder(t, String(baseTime + Math.max(Date.now(), ...sameTierTimes) + 1));
};
