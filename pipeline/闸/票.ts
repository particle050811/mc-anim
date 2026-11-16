import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pidReplaced, processAlive, retry } from './锁.ts';
import { readJson, writeJson, listFiles } from './文件.ts';
import type { TaskInfo, TaskDecl } from './任务.ts';
import type { Caller } from './发起者.ts';
export type TicketContent = {
    v: 1;
    task: string;
    /** 这一轮等待的起点；暂缓结束时重新起算，否则一恢复就按等了半小时告警。 */
    start: number;
    initiator: Caller;
    decl: TaskDecl;
    原序?: string;
    暂缓至?: number;
    暂缓因?: string;
    等内存起?: number;
    stuckOn?: string;
    已被越?: number;
};
export type Ticket = {
    file: string;
    name: string;
    pid: number;
    host: string;
    time: number;
    content: TicketContent | null;
    /** 读状态才算；死票要等下一个等待者回收，读的人不能把它算占用。 */
    死?: boolean;
};
export const hostSlug = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_');
export const parseTicket = (ticketName: string) => { const m = /^(\d+)-(.+)-(\d+)$/.exec(ticketName); return m ? { time: Number(m[1]), host: m[2]!, pid: Number(m[3]) } : null; };
export const listTickets = (dir: string): Ticket[] => listFiles(dir).sort().flatMap(ticketName => { const x = parseTicket(ticketName); if (!x)
    return []; const file = path.join(dir, ticketName), ticketContent = readJson<TicketContent>(file); return [{ ...x, file: file, name: ticketName, content: ticketContent?.v === 1 ? ticketContent : null }]; });
let seqIndex = 0;
/** 队序就是票名：普通票 0 开头（领票毫秒），低优先 8 开头（排在全部普通票后面，彼此仍先来先渲），暂缓 9 开头 */
const lowPriorityBase = 800000000000000;
export const isLowPriorityTicket = (t: Pick<Ticket, 'time'>) => t.time >= lowPriorityBase && t.time < 900000000000000;
const isNormalTicket = (x: Ticket) => !x.name.startsWith('9') && !isLowPriorityTicket(x);
export const claimTicket = (dir: string, localHost: string, task: TaskInfo, now: number): Ticket => {
    fs.mkdirSync(dir, { recursive: true });
    seqIndex = Math.max(Date.now(), seqIndex + 1);
    const ticketName = `${String(task.decl.lowPriority ? lowPriorityBase + seqIndex : seqIndex).padStart(15, '0')}-${hostSlug(localHost)}-${process.pid}`;
    const ticketContent: TicketContent = { v: 1, task: task.task, start: now, initiator: task.initiator, decl: task.decl };
    const file = path.join(dir, ticketName);
    writeJson(file, ticketContent);
    return { name: ticketName, file: file, content: ticketContent, pid: process.pid, host: hostSlug(localHost), time: Number(ticketName.split('-')[0]) };
};
export const ticketAlive = (t: Ticket, localHost: string) => {
    if (t.host === hostSlug(localHost))
        return processAlive(t.pid) && (()=>{try{const m=fs.statSync(t.file).mtimeMs;return m>=Date.now()-os.uptime()*1000&&!pidReplaced(t.pid,m);}catch{return false;}})();
    try {
        return Date.now() - fs.statSync(t.file).mtimeMs < 60000;
    }
    catch {
        return false;
    }
};
export const setOrder = (t: Ticket, seqIndex: string) => {
    if (!t.content)
        throw Error('旧票拒绝改名：旧代码不能重新找票；只能等或取消');
    const newTicketName = `${seqIndex.padStart(15, '0')}-${t.host}-${t.pid}`, file = path.join(path.dirname(t.file), newTicketName);
    fs.renameSync(t.file, file);
    return { ...t, name: newTicketName, file: file, time: Number(seqIndex) };
};
/** 票可能刚被改名或删除：往旧路径写会把它复活成残留活票。 */
export const writeTicket = (t: Ticket) => { if (fs.existsSync(t.file))
    writeJson(t.file, t.content); };
/** 写进别人的票，票主人每轮重读；撞上改名或删票至多丢一次计数。暂缓的本来就不在等，不算被越。 */
export const recordOvertaken = (tickets: Ticket[], localHost: string) => { for (const q of tickets)
    if (q.content && !q.content.暂缓至 && ticketAlive(q, localHost)) {
        q.content.已被越 = (q.content.已被越 ?? 0) + 1;
        writeTicket(q);
    } };
/** anim sched 随时可能改票名，记下的文件名靠不住，按任务和 pid 扫。 */
export const clearTaskTickets = (dir: string, task: string) => { for (const x of listTickets(dir))
    if (x.pid === process.pid && x.content?.task === task)
        retry(() => fs.rmSync(x.file, { force: true })); };
/** 低优先的票回到低优先那一档的队尾，普通票回普通票的队尾 */
export const requeueTail = (t: Ticket) => {
    const lowPriority = Boolean(t.content?.decl?.lowPriority), baseTime = lowPriority ? lowPriorityBase : 0;
    const sameTierTimes = listTickets(path.dirname(t.file)).filter(x => (lowPriority ? isLowPriorityTicket(x) : isNormalTicket(x))).map(x => x.time - baseTime);
    return setOrder(t, String(baseTime + Math.max(Date.now(), ...sameTierTimes) + 1));
};
