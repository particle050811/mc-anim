import fs from 'node:fs';
import path from 'node:path';
import { readHolder } from './锁.ts';
import { readJson, listFiles } from './文件.ts';
import { listTickets, ticketAlive, type Ticket } from './票.ts';
import { readSchedulerEvents, type SchedulerEvent } from './调度日志.ts';
import { cleanCrashed, type SchedulerEnv, type TaskInfo, type TaskDecl } from './任务.ts';
import { readMachineSnapshot, type MachineSnapshot } from './机器.ts';
import type { Caller } from './发起者.ts';
export type LockRecord = {
    pid: number;
    ticket: string;
    task: string;
    initiator: Caller;
    decl: TaskDecl;
    lockAcquiredAt: number;
    heartbeat: number;
    frameTime: number;
    framesDone: number;
    totalFrames?: number;
    死?: boolean;
    旧?: boolean;
    lock?: string;
};
export type SchedulerState = {
    timestamp: number;
    machine: MachineSnapshot;
    lockHolders: LockRecord[];
    ticket: Ticket[];
    在跑: TaskInfo[];
    最近: SchedulerEvent[];
};
/** 锁和票的现状，各带 死 标记。死的要等下一个等待者回收，没人排队时一直留着，读的人不能把它们算占用。 */
export const readOccupancy = (e: SchedulerEnv): Pick<SchedulerState, 'lockHolders' | 'ticket'> => {
    const lockHolders: LockRecord[] = [];
    for (const name of ['渲染', '放行']) {
        const file = path.join(e.lockDir, name + '.lock'), holder = readHolder(file, e.localHost);
        if (!holder)
            continue;
        const { pid, 死: dead } = holder, info = readJson<LockRecord>(file + '.信息.json');
        if (info?.pid === pid)
            lockHolders.push({ ...info, 死: dead, lock: name });
        else {
            let startMs = e.nowMs();
            try {
                startMs = fs.statSync(file).mtimeMs;
            }
            catch { /* 正在放锁 */ }
            lockHolders.push({ pid, ticket: `#${pid}`, task: `旧-${pid}`, initiator: { pid, workspace: '旧闸，无信息' } as Caller, decl: { kind: name }, lockAcquiredAt: startMs, heartbeat: 0, frameTime: startMs, framesDone: 0, 旧: true, 死: dead, lock: name });
        }
    }
    return { lockHolders: lockHolders, ticket: ['渲染', '放行'].flatMap(n => listTickets(path.join(e.lockDir, n + '.排队'))).map(t => ({ ...t, 死: !ticketAlive(t, e.localHost) })) };
};
/** 活的占用，一处一条。 */
export const whoHolds = ({ lockHolders: lockHolders, ticket: tickets }: Pick<SchedulerState, 'lockHolders' | 'ticket'>) => [
    ...lockHolders.filter(x => !x.死).map(x => `持锁 #${x.pid} ${x.decl.kind ?? '脚本'} ${x.decl.segment ?? ''} ${x.initiator.lane || x.initiator.workspace}`),
    ...tickets.filter(t => !t.死).map(t => `排队 #${t.pid} ${t.content?.decl.kind ?? '旧票'} ${t.content?.decl.segment ?? ''} ${t.content?.initiator.lane ?? ''}`),
].map(x => x.replace(/\s+/g, ' ').trim());
export const readState = (e: SchedulerEnv, readMachine = readMachineSnapshot, reclaim = true): SchedulerState => {
    if (reclaim)
        cleanCrashed(e);
    const occupancy = readOccupancy(e);
    return { timestamp: e.nowMs(), machine: readMachine(), ...occupancy,
        在跑: listFiles(path.join(e.lockDir, '在跑')).flatMap(n => { const x = readJson<TaskInfo>(path.join(e.lockDir, '在跑', n)); return x ? [x] : []; }),
        // 一次 anim sched 就写一行汇报，尾部开小了告警和决定很快被挤掉，看 就显示成没有。
        最近: readSchedulerEvents(e.logDir, 256 * 1024).filter(x => x.event === '告警' || x.event === '决定').slice(-8) };
};
const formatMinutes = (elapsedSec: number) => `${Math.max(0, elapsedSec / 60).toFixed(1)}分`;
const G = (n: number | null) => n === null ? '?' : (n / 2 ** 30).toFixed(1) + 'G';
const thermalBrief = (m: MachineSnapshot) => `${m.chipMaxTemp == null ? '' : ` 芯温${m.chipMaxTemp.toFixed(1)}°C`}${m.thermalLevel == null ? '' : ` 热${m.thermalLevel}`}`;
export const oneLineStatus = (s: SchedulerState) => `负载${s.machine.load?.toFixed(1) ?? '?'}/${s.machine.cores} 闸${s.machine.gate ?? '?'}% 压力${s.machine.pressure ?? '?'}${thermalBrief(s.machine)} 持锁${s.lockHolders.map(x => `#${x.pid}${x.死 ? '死' : ''}`).join(',') || '无'} 排队${s.ticket.filter(t => !t.死).length}${s.ticket.some(t => t.死) ? ` 死票${s.ticket.filter(t => t.死).length}` : ''}`;
/** 一张票只等自己这把锁和同队的票：放行票不等渲染锁。 */
export const queueOccupancy = ({ lockHolders: lockHolders, ticket: tickets }: Pick<SchedulerState, 'lockHolders' | 'ticket'>, lockName: string) => ({ lockHolders: lockHolders.filter(x => x.lock === lockName), ticket: tickets.filter(t => path.basename(path.dirname(t.file)) === `${lockName}.排队`) });
/** 占锁中位数，没有预计的按它算下界。 */
const defaultEstimatedSec = 23;
/** 这些活占用还要多久：持锁剩余加票的预计。 */
export const waitAhead = ({ lockHolders: lockHolders, ticket: tickets }: Pick<SchedulerState, 'lockHolders' | 'ticket'>, now: number) => {
    const liveHolders = lockHolders.filter(x => !x.死), liveTickets = tickets.filter(t => !t.死);
    return {
        sec: liveHolders.reduce((n, x) => n + Math.max(0, (x.decl.estimatedSec ?? defaultEstimatedSec) - (now - x.lockAcquiredAt) / 1000), 0) + liveTickets.reduce((n, t) => n + (t.content?.decl.estimatedSec ?? defaultEstimatedSec), 0),
        unresolved: liveHolders.some(x => !x.decl.estimatedSec) || liveTickets.some(t => !t.content?.decl.estimatedSec),
    };
};
/** 固定预算，字符串按 UTF-8 字节截断；20 张票也不铺满会话。完整字段用 --json。 */
export const renderView = (s: SchedulerState): string => {
    const m = s.machine, lines = [`${new Date(s.timestamp).toISOString().slice(5, 19)}Z ${oneLineStatus(s)} free${G(m.free)} 压缩${G(m.compressed)} swap${G(m.swap)} 换出${G(m.swapOut)} GPU${m.GPU ?? '?'}% 盘${G(m.disk)}`];
    const cpu = s.在跑.filter(t => !s.lockHolders.some(x => x.task === t.task) && !s.ticket.some(x => x.content?.task === t.task));
    lines.push(`CPU/准备 ${[...cpu.slice(0, 3).map(x => `#${x.initiator.pid} ${x.decl.kind} ${x.initiator.lane || x.initiator.workspace}`)].join('；') || '无登记'}；孤儿Chrome ${m.orphans ?? '?'}`);
    for (const x of s.lockHolders.slice(0, 2))
        lines.push(`持锁 #${x.pid}${x.死 ? ' 死' : ''} ${x.decl.kind ?? '脚本'} ${x.decl.segment ?? ''} ${x.framesDone}/${x.totalFrames ?? '?'}帧 ${x.initiator.workspace}/${x.initiator.lane || '?'} ${x.decl.purpose ?? '?'} 已占${formatMinutes((s.timestamp - x.lockAcquiredAt) / 1000)}/预计${x.decl.estimatedSec ? formatMinutes(x.decl.estimatedSec) : '?'} 心跳${x.heartbeat ? Math.round((s.timestamp - x.heartbeat) / 1000) + '秒' : '无，旧闸'}`);
    const seen = new Map<string, number>();
    s.ticket.slice(0, 3).forEach((t, i) => {
        const c = t.content, d = c?.decl, key = JSON.stringify([d?.kind, d?.work, d?.segment, d?.level, d?.frame, d?.frameCount]), alive = c && !t.死;
        const occupancy = queueOccupancy(s, path.basename(path.dirname(t.file), '.排队')), dupOf = alive && seen.get(key), { sec: waitSec, unresolved } = waitAhead({ lockHolders: occupancy.lockHolders, ticket: occupancy.ticket.filter(q => q.name < t.name) }, s.timestamp);
        if (alive)
            seen.set(key, t.pid);
        // 标记放前面：超预算时只截段和路名，「约 0 分后」后面的 等内存 不能被截掉。
        lines.push(`排队${i + 1} #${t.pid}${t.死 ? ' 死' : ''}${dupOf ? ' 重复#' + dupOf : ''}${c?.stuckOn ? ' 等' + c.stuckOn : ''}${c?.暂缓至 ? ' 暂缓' : ''} 等${formatMinutes((s.timestamp - (c?.start ?? t.time)) / 1000)} 预计${d?.estimatedSec ? formatMinutes(d.estimatedSec) : '?'} 约${unresolved ? '≥' : ''}${formatMinutes(waitSec)}后 ${d?.kind ?? '旧票'} ${d?.segment ?? ''} ${c?.initiator.lane ?? ''}`);
    });
    if (s.ticket.length > 3)
        lines.push(`另${s.ticket.length - 3}张（--json 看全队）`);
    const warn = s.最近.findLast(x => x.event === '告警'), dec = s.最近.findLast(x => x.event === '决定');
    lines.push(`告警 ${warn ? `${warn.timestamp.slice(5, 19)}Z ${warn.type} ${warn.pid === undefined ? warn.subject : '#' + warn.pid}` : '近期无'}`);
    lines.push(`最近决定 ${dec ? `${dec.decision}：${dec.why}` : '无'}`);
    const truncate = (text: string, limit: number) => { let out = ''; for (const c of text) {
        if (Buffer.byteLength(out + c) > limit - 3)
            return out + '…';
        out += c;
    } return out; };
    return lines.slice(0, 10).map((l, i) => truncate(l, i === 0 ? 210 : l.startsWith('持锁') ? 140 : l.startsWith('CPU/准备') ? 125 : 95)).join('\n');
};
