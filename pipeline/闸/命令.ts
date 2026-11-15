import path from 'node:path';
import { modifyCommands, changeScheduler, routeCommand, orderCommand } from './改调度.ts';
import { waitUntil } from './等.ts';
import { parseArgs, UsageError, type ParsedArgs } from '../cli/参数.ts';
import type { Command } from '../cli/命令.ts';
import { resolveSchedulerEnv, cleanCrashed, type SchedulerEnv } from './任务.ts';
import { readState, readOccupancy, renderView, oneLineStatus, waitAhead, queueOccupancy } from './看.ts';
import { readMachineSnapshotParallel } from './机器.ts';
import { readSchedulerEvents,recordSchedulerEvent,type SchedulerEvent } from './调度日志.ts';
import { review } from './复盘.ts';
import { lockWaitTable } from './等锁表.ts';
import { estimate } from './估计.ts';
import { watchSched } from './盯.ts';
export const usage = '调度 [看|先|后|恢复|放行|让路|取消|清孤儿|记|预计|盯|等|路|令|日志|复盘|等锁表] [--json|--一行]';
/** 都按 UTC，和日志、--日 一致。只给日期的 --到 算到当天结束，否则当天的事全被排除。 */
const parseMoment = (optionName: string, s: string, now: number) => {
    const m = /^(?:(\d{4})-)?(\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:\d{2})?)?$/.exec(s);
    const ms = m ? Date.parse(`${m[1] ?? new Date(now).getUTCFullYear()}-${m[2]}T${m[3] ?? '00:00'}${m[4] ?? 'Z'}`) : NaN;
    if (Number.isNaN(ms))
        throw new UsageError(`${optionName} 要写 UTC 的 2026-11-01、11-01 或 2026-11-01T08:00:00Z，不认识 ${s}`);
    return m![3] || optionName === '--从' ? ms : ms + 86_399_999;
};
const filterLog = (p: ParsedArgs, now: number) => {
    const { '--从': fromStr, '--到': toStr, '--日': day, '--事': eventName, '--票': ticket, '--段': segmentKey, '--路': lane } = p.值;
    if (day && !/^\d{2}-\d{2}$/.test(day))
        throw new UsageError(`--日 要写 UTC 的 11-01，不认识 ${day}`);
    const fromMs = fromStr ? parseMoment('--从', fromStr, now) : -Infinity, endMs = toStr ? parseMoment('--到', toStr, now) : Infinity;
    const jsonIncludes = (v: unknown, needle: string) => JSON.stringify(v)?.includes(needle);
    const inWindow = (ms: number) => ms >= fromMs && ms <= endMs && (!day || new Date(ms).toISOString().slice(5, 10) === day);
    // 路 开、令 这些事件的路名在顶层，发起者多半没设 ANIM_ROUTE。顶层有段的（告警）以它为准：声明里是任务手上那段。
    const matches = (x: SchedulerEvent) => inWindow(Date.parse(x.时)) && (!eventName || jsonIncludes(x.事, eventName)) && (!ticket || jsonIncludes(x.票, ticket)) && (!segmentKey || jsonIncludes(x.段 ?? (x.声明 as { 段?: string } | undefined)?.段, segmentKey)) && (!lane || jsonIncludes(x.路, lane) || jsonIncludes((x.发起 as { 路?: string } | undefined)?.路, lane));
    return { inWindow, matches };
};
export const runScheduler = async (args: string[], env?: SchedulerEnv, output: (s: string) => void = console.log): Promise<number> => {
    const p = parseArgs(args, { toggles: ['--json', '--一行', '--强', '--杀持锁', '--原序', '--闸空', '--撤'], 值: ['--让路', '--最长', '--任务', '--从', '--到', '--事', '--票', '--段', '--路', '--日', '--为什么', '--分钟', '--看到', '--决定', '--说明', '--结果', '--pid', '--文件', '--内存', '--级别'] });
    const e = env ?? resolveSchedulerEnv(), [cmd = '看', ...rest] = p.位置;
    if (modifyCommands.has(cmd)) {
        changeScheduler(cmd, rest[0], p, e, { 输出: output });
        return 0;
    }
    if (cmd === '路') {
        routeCommand(rest, p, e, output);
        return 0;
    }
    if (cmd === '令') {
        orderCommand(rest, p, e, output);
        return 0;
    }
    if (cmd === '等')
        return waitUntil(p, e);
    if (cmd === '看') {
        const machine = await readMachineSnapshotParallel();
        const s = readState(e, () => machine);
        recordSchedulerEvent(e.logDir,'汇报',{发起:e.caller,看到:oneLineStatus(s)},s.时);
        output(p.toggles.has('--json') ? JSON.stringify({ ...s, 机: { ...s.机, 进程: undefined } }) : p.toggles.has('--一行') ? oneLineStatus(s) : renderView(s));
        return 0;
    }
    if (cmd === '预计') {
        if(!rest.length)throw new UsageError('预计 要给选择器');
        const {selectSegs}=await import('../清单/清单.ts');
        // 不经 渲/段产物.ts：它的闭包里有 Remotion（资源闸的闭包不许有）
        const {segFrameCount}=await import('../../engine/段/段定义.ts');
        const {filmProfile}=await import('../渲/设置.ts');
        const segments=await selectSegs(rest),s=readState(e),runDir=path.dirname(e.logDir),level=p.值['--级别']??'视频',aheadWait=waitAhead(queueOccupancy(s,'渲染'),s.时);
        // 渲段的明细按切片的输出帧记，预计也按输出帧数算
        const outputFrames=(t:(typeof segments)[number])=>segFrameCount(t.段,filmProfile().fps);
        output(JSON.stringify({前方约秒:aheadWait.秒,未知按下界:aheadWait.unresolved,级别: level,段:segments.map(t=>({段:t.键,render纯跑秒:estimate({种:'render',段:t.键,帧数:outputFrames(t),级别: level},runDir),still一帧秒:estimate({种:'still',段:t.键,帧数:1,级别: level},runDir)})),说明:'未知显示 null；无预计的票按 23 秒下界，不承诺完成时刻'}));
        return 0;
    }
    if (cmd === '盯') {
        if(p.值['--最长']&&(!Number.isFinite(Number(p.值['--最长']))||Number(p.值['--最长'])<=0))throw new UsageError('--最长 要正秒数');
        return watchSched(e, { maxSec: p.值['--最长'] ? Number(p.值['--最长']) : undefined, 任务: p.值['--任务'], 输出: output });
    }
    if (cmd === '等锁表') {
        output(JSON.stringify(lockWaitTable(readSchedulerEvents(e.logDir), filterLog(p, e.nowMs()).matches), null, 2));
        return 0;
    }
    if (cmd === '日志' || cmd === '复盘') {
        const now = e.nowMs(), { inWindow, matches } = filterLog(p, now);
        if (cmd === '日志') {
            output(readSchedulerEvents(e.logDir).filter(matches).map(x => JSON.stringify(x)).join('\n'));
            return 0;
        }
        // 先认领崩溃再读；当前持锁读现状，日志回放不知道旧闸，也可能还没人发现持锁者死了。
        cleanCrashed(e);
        output(JSON.stringify({ ...review(readSchedulerEvents(e.logDir), { matches, now }), 当前持锁: inWindow(now) ? readOccupancy(e).持锁.filter(x => !x.死) : [] }, null, 2));
        return 0;
    }
    throw new UsageError(`不认识的调度命令 ${cmd}`);
};
export const schedulerCommands: Record<string, Command> = { 调度: { 用法: usage, 说明: '看机器、队列、归因日志；按事件叫醒，不自动派发', noRecord: true, 跑: args => runScheduler(args) } };
