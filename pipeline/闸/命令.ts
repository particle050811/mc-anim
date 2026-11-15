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
export const usage = 'sched [show|first|last|resume|release|yield|cancel|clean-orphans|note|estimate|watch|wait|route|order|log|review|lock-waits] [--json|--oneline]';
/** 都按 UTC，和日志、--day 一致。只给日期的 --to 算到当天结束，否则当天的事全被排除。 */
const parseMoment = (optionName: string, s: string, now: number) => {
    const m = /^(?:(\d{4})-)?(\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:\d{2})?)?$/.exec(s);
    const ms = m ? Date.parse(`${m[1] ?? new Date(now).getUTCFullYear()}-${m[2]}T${m[3] ?? '00:00'}${m[4] ?? 'Z'}`) : NaN;
    if (Number.isNaN(ms))
        throw new UsageError(`${optionName} 要写 UTC 的 2026-11-01、11-01 或 2026-11-01T08:00:00Z，不认识 ${s}`);
    return m![3] || optionName === '--from' ? ms : ms + 86_399_999;
};
const filterLog = (p: ParsedArgs, now: number) => {
    const { '--from': fromStr, '--to': toStr, '--day': day, '--event': eventName, '--ticket': ticket, '--seg': segmentKey, '--route': lane } = p.值;
    if (day && !/^\d{2}-\d{2}$/.test(day))
        throw new UsageError(`--day 要写 UTC 的 11-01，不认识 ${day}`);
    const fromMs = fromStr ? parseMoment('--from', fromStr, now) : -Infinity, endMs = toStr ? parseMoment('--to', toStr, now) : Infinity;
    const jsonIncludes = (v: unknown, needle: string) => JSON.stringify(v)?.includes(needle);
    const inWindow = (ms: number) => ms >= fromMs && ms <= endMs && (!day || new Date(ms).toISOString().slice(5, 10) === day);
    // route open、order 这些事件的路名在顶层，发起者多半没设 ANIM_ROUTE。顶层有段的（告警）以它为准：声明里是任务手上那段。
    const matches = (x: SchedulerEvent) => inWindow(Date.parse(x.时)) && (!eventName || jsonIncludes(x.事, eventName)) && (!ticket || jsonIncludes(x.票, ticket)) && (!segmentKey || jsonIncludes(x.段 ?? (x.声明 as { 段?: string } | undefined)?.段, segmentKey)) && (!lane || jsonIncludes(x.路, lane) || jsonIncludes((x.发起 as { 路?: string } | undefined)?.路, lane));
    return { inWindow, matches };
};
export const runScheduler = async (args: string[], env?: SchedulerEnv, output: (s: string) => void = console.log): Promise<number> => {
    const p = parseArgs(args, { toggles: ['--json', '--oneline', '--force', '--kill-holder', '--orig-order', '--gate-empty', '--undo'], 值: ['--yield', '--max-sec', '--task', '--from', '--to', '--event', '--ticket', '--seg', '--route', '--day', '--why', '--minutes', '--saw', '--decision', '--note', '--result', '--pid', '--file', '--memory', '--level'] });
    const e = env ?? resolveSchedulerEnv(), [cmd = 'show', ...rest] = p.位置;
    if (modifyCommands.has(cmd)) {
        changeScheduler(cmd, rest[0], p, e, { 输出: output });
        return 0;
    }
    if (cmd === 'route') {
        routeCommand(rest, p, e, output);
        return 0;
    }
    if (cmd === 'order') {
        orderCommand(rest, p, e, output);
        return 0;
    }
    if (cmd === 'wait')
        return waitUntil(p, e);
    if (cmd === 'show') {
        const machine = await readMachineSnapshotParallel();
        const s = readState(e, () => machine);
        recordSchedulerEvent(e.logDir,'汇报',{发起:e.caller,看到:oneLineStatus(s)},s.时);
        output(p.toggles.has('--json') ? JSON.stringify({ ...s, 机: { ...s.机, 进程: undefined } }) : p.toggles.has('--oneline') ? oneLineStatus(s) : renderView(s));
        return 0;
    }
    if (cmd === 'estimate') {
        if(!rest.length)throw new UsageError('estimate 要给选择器');
        const {selectSegs}=await import('../清单/清单.ts');
        // 不经 渲/段产物.ts：它的闭包里有 Remotion（资源闸的闭包不许有）
        const {segFrameCount}=await import('../../engine/段/段定义.ts');
        const {filmProfile}=await import('../渲/设置.ts');
        const segments=await selectSegs(rest),s=readState(e),runDir=path.dirname(e.logDir),level=p.值['--level']??'视频',aheadWait=waitAhead(queueOccupancy(s,'渲染'),s.时);
        // 渲段的明细按切片的输出帧记，预计也按输出帧数算
        const outputFrames=(t:(typeof segments)[number])=>segFrameCount(t.段,filmProfile().fps);
        output(JSON.stringify({前方约秒:aheadWait.秒,未知按下界:aheadWait.unresolved,级别: level,段:segments.map(t=>({段:t.键,render纯跑秒:estimate({种:'render',段:t.键,帧数:outputFrames(t),级别: level},runDir),still一帧秒:estimate({种:'still',段:t.键,帧数:1,级别: level},runDir)})),说明:'未知显示 null；无预计的票按 23 秒下界，不承诺完成时刻'}));
        return 0;
    }
    if (cmd === 'watch') {
        if(p.值['--max-sec']&&(!Number.isFinite(Number(p.值['--max-sec']))||Number(p.值['--max-sec'])<=0))throw new UsageError('--max-sec 要正秒数');
        return watchSched(e, { maxSec: p.值['--max-sec'] ? Number(p.值['--max-sec']) : undefined, 任务: p.值['--task'], 输出: output });
    }
    if (cmd === 'lock-waits') {
        output(JSON.stringify(lockWaitTable(readSchedulerEvents(e.logDir), filterLog(p, e.nowMs()).matches), null, 2));
        return 0;
    }
    if (cmd === 'log' || cmd === 'review') {
        const now = e.nowMs(), { inWindow, matches } = filterLog(p, now);
        if (cmd === 'log') {
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
export const schedulerCommands: Record<string, Command> = { sched: { 用法: usage, 说明: '看机器、队列、归因日志；按事件叫醒，不自动派发', noRecord: true, 跑: args => runScheduler(args) } };
