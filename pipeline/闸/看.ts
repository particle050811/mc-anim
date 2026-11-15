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
    票: string;
    任务: string;
    发起: Caller;
    声明: TaskDecl;
    拿锁时: number;
    心跳: number;
    帧时: number;
    已出帧: number;
    总帧?: number;
    死?: boolean;
    旧?: boolean;
    锁?: string;
};
export type SchedulerState = {
    时: number;
    机: MachineSnapshot;
    持锁: LockRecord[];
    票: Ticket[];
    在跑: TaskInfo[];
    最近: SchedulerEvent[];
};
/** 锁和票的现状，各带 死 标记。死的要等下一个等待者回收，没人排队时一直留着，读的人不能把它们算占用。 */
export const readOccupancy = (e: SchedulerEnv): Pick<SchedulerState, '持锁' | '票'> => {
    const lockHolders: LockRecord[] = [];
    for (const name of ['渲染', '放行']) {
        const file = path.join(e.lockDir, name + '.lock'), holder = readHolder(file, e.localHost);
        if (!holder)
            continue;
        const { pid, 死: dead } = holder, info = readJson<LockRecord>(file + '.信息.json');
        if (info?.pid === pid)
            lockHolders.push({ ...info, 死: dead, 锁: name });
        else {
            let startMs = e.nowMs();
            try {
                startMs = fs.statSync(file).mtimeMs;
            }
            catch { /* 正在放锁 */ }
            lockHolders.push({ pid, 票: `#${pid}`, 任务: `旧-${pid}`, 发起: { pid, 工作区: '旧闸，无信息' } as Caller, 声明: { 种: name }, 拿锁时: startMs, 心跳: 0, 帧时: startMs, 已出帧: 0, 旧: true, 死: dead, 锁: name });
        }
    }
    return { 持锁: lockHolders, 票: ['渲染', '放行'].flatMap(n => listTickets(path.join(e.lockDir, n + '.排队'))).map(t => ({ ...t, 死: !ticketAlive(t, e.localHost) })) };
};
/** 活的占用，一处一条。 */
export const whoHolds = ({ 持锁: lockHolders, 票: tickets }: Pick<SchedulerState, '持锁' | '票'>) => [
    ...lockHolders.filter(x => !x.死).map(x => `持锁 #${x.pid} ${x.声明.种 ?? '脚本'} ${x.声明.段 ?? ''} ${x.发起.路 || x.发起.工作区}`),
    ...tickets.filter(t => !t.死).map(t => `排队 #${t.pid} ${t.内容?.声明.种 ?? '旧票'} ${t.内容?.声明.段 ?? ''} ${t.内容?.发起.路 ?? ''}`),
].map(x => x.replace(/\s+/g, ' ').trim());
export const readState = (e: SchedulerEnv, readMachine = readMachineSnapshot, reclaim = true): SchedulerState => {
    if (reclaim)
        cleanCrashed(e);
    const occupancy = readOccupancy(e);
    return { 时: e.nowMs(), 机: readMachine(), ...occupancy,
        在跑: listFiles(path.join(e.lockDir, '在跑')).flatMap(n => { const x = readJson<TaskInfo>(path.join(e.lockDir, '在跑', n)); return x ? [x] : []; }),
        // 一次 anim sched 就写一行汇报，尾部开小了告警和决定很快被挤掉，看 就显示成没有。
        最近: readSchedulerEvents(e.logDir, 256 * 1024).filter(x => x.事 === '告警' || x.事 === '决定').slice(-8) };
};
const formatMinutes = (elapsedSec: number) => `${Math.max(0, elapsedSec / 60).toFixed(1)}分`;
const G = (n: number | null) => n === null ? '?' : (n / 2 ** 30).toFixed(1) + 'G';
const thermalBrief = (m: MachineSnapshot) => `${m.芯片最高温 == null ? '' : ` 芯温${m.芯片最高温.toFixed(1)}°C`}${m.发热等级 == null ? '' : ` 热${m.发热等级}`}`;
export const oneLineStatus = (s: SchedulerState) => `负载${s.机.负载?.toFixed(1) ?? '?'}/${s.机.核} 闸${s.机.闸 ?? '?'}% 压力${s.机.压力 ?? '?'}${thermalBrief(s.机)} 持锁${s.持锁.map(x => `#${x.pid}${x.死 ? '死' : ''}`).join(',') || '无'} 排队${s.票.filter(t => !t.死).length}${s.票.some(t => t.死) ? ` 死票${s.票.filter(t => t.死).length}` : ''}`;
/** 一张票只等自己这把锁和同队的票：放行票不等渲染锁。 */
export const queueOccupancy = ({ 持锁: lockHolders, 票: tickets }: Pick<SchedulerState, '持锁' | '票'>, lockName: string) => ({ 持锁: lockHolders.filter(x => x.锁 === lockName), 票: tickets.filter(t => path.basename(path.dirname(t.文件)) === `${lockName}.排队`) });
/** 占锁中位数，没有预计的按它算下界。 */
const defaultEstimatedSec = 23;
/** 这些活占用还要多久：持锁剩余加票的预计。 */
export const waitAhead = ({ 持锁: lockHolders, 票: tickets }: Pick<SchedulerState, '持锁' | '票'>, now: number) => {
    const liveHolders = lockHolders.filter(x => !x.死), liveTickets = tickets.filter(t => !t.死);
    return {
        秒: liveHolders.reduce((n, x) => n + Math.max(0, (x.声明.预计秒 ?? defaultEstimatedSec) - (now - x.拿锁时) / 1000), 0) + liveTickets.reduce((n, t) => n + (t.内容?.声明.预计秒 ?? defaultEstimatedSec), 0),
        unresolved: liveHolders.some(x => !x.声明.预计秒) || liveTickets.some(t => !t.内容?.声明.预计秒),
    };
};
/** 固定预算，字符串按 UTF-8 字节截断；20 张票也不铺满会话。完整字段用 --json。 */
export const renderView = (s: SchedulerState): string => {
    const m = s.机, lines = [`${new Date(s.时).toISOString().slice(5, 19)}Z ${oneLineStatus(s)} free${G(m.free)} 压缩${G(m.压缩)} swap${G(m.swap)} 换出${G(m.换出)} GPU${m.GPU ?? '?'}% 盘${G(m.盘)}`];
    const cpu = s.在跑.filter(t => !s.持锁.some(x => x.任务 === t.任务) && !s.票.some(x => x.内容?.任务 === t.任务));
    lines.push(`CPU/准备 ${[...cpu.slice(0, 3).map(x => `#${x.发起.pid} ${x.声明.种} ${x.发起.路 || x.发起.工作区}`)].join('；') || '无登记'}；孤儿Chrome ${m.孤儿 ?? '?'}`);
    for (const x of s.持锁.slice(0, 2))
        lines.push(`持锁 #${x.pid}${x.死 ? ' 死' : ''} ${x.声明.种 ?? '脚本'} ${x.声明.段 ?? ''} ${x.已出帧}/${x.总帧 ?? '?'}帧 ${x.发起.工作区}/${x.发起.路 || '?'} ${x.声明.用途 ?? '?'} 已占${formatMinutes((s.时 - x.拿锁时) / 1000)}/预计${x.声明.预计秒 ? formatMinutes(x.声明.预计秒) : '?'} 心跳${x.心跳 ? Math.round((s.时 - x.心跳) / 1000) + '秒' : '无，旧闸'}`);
    const seen = new Map<string, number>();
    s.票.slice(0, 3).forEach((t, i) => {
        const c = t.内容, d = c?.声明, key = JSON.stringify([d?.种, d?.作品, d?.段, d?.级别, d?.帧, d?.帧数]), alive = c && !t.死;
        const occupancy = queueOccupancy(s, path.basename(path.dirname(t.文件), '.排队')), dupOf = alive && seen.get(key), { 秒: waitSec, unresolved } = waitAhead({ 持锁: occupancy.持锁, 票: occupancy.票.filter(q => q.名 < t.名) }, s.时);
        if (alive)
            seen.set(key, t.pid);
        // 标记放前面：超预算时只截段和路名，「约 0 分后」后面的 等内存 不能被截掉。
        lines.push(`排队${i + 1} #${t.pid}${t.死 ? ' 死' : ''}${dupOf ? ' 重复#' + dupOf : ''}${c?.卡在 ? ' 等' + c.卡在 : ''}${c?.暂缓至 ? ' 暂缓' : ''} 等${formatMinutes((s.时 - (c?.起 ?? t.时间)) / 1000)} 预计${d?.预计秒 ? formatMinutes(d.预计秒) : '?'} 约${unresolved ? '≥' : ''}${formatMinutes(waitSec)}后 ${d?.种 ?? '旧票'} ${d?.段 ?? ''} ${c?.发起.路 ?? ''}`);
    });
    if (s.票.length > 3)
        lines.push(`另${s.票.length - 3}张（--json 看全队）`);
    const warn = s.最近.findLast(x => x.事 === '告警'), dec = s.最近.findLast(x => x.事 === '决定');
    lines.push(`告警 ${warn ? `${warn.时.slice(5, 19)}Z ${warn.类} ${warn.pid === undefined ? warn.对象 : '#' + warn.pid}` : '近期无'}`);
    lines.push(`最近决定 ${dec ? `${dec.决定}：${dec.为什么}` : '无'}`);
    const truncate = (text: string, limit: number) => { let out = ''; for (const c of text) {
        if (Buffer.byteLength(out + c) > limit - 3)
            return out + '…';
        out += c;
    } return out; };
    return lines.slice(0, 10).map((l, i) => truncate(l, i === 0 ? 210 : l.startsWith('持锁') ? 140 : l.startsWith('CPU/准备') ? 125 : 95)).join('\n');
};
