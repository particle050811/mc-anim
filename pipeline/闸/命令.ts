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
    const { '--from': fromStr, '--to': toStr, '--day': day, '--event': eventName, '--ticket': ticket, '--seg': segmentKey, '--route': lane } = p.value;
    if (day && !/^\d{2}-\d{2}$/.test(day))
        throw new UsageError(`--day 要写 UTC 的 11-01，不认识 ${day}`);
    const fromMs = fromStr ? parseMoment('--from', fromStr, now) : -Infinity, endMs = toStr ? parseMoment('--to', toStr, now) : Infinity;
    const jsonIncludes = (v: unknown, needle: string) => JSON.stringify(v)?.includes(needle);
    const inWindow = (ms: number) => ms >= fromMs && ms <= endMs && (!day || new Date(ms).toISOString().slice(5, 10) === day);
    // route open、order 这些事件的路名在顶层，发起者多半没设 ANIM_ROUTE。顶层有段的（告警）以它为准：声明里是任务手上那段。
    const matches = (x: SchedulerEvent) => inWindow(Date.parse(x.timestamp)) && (!eventName || jsonIncludes(x.event, eventName)) && (!ticket || jsonIncludes(x.ticket, ticket)) && (!segmentKey || jsonIncludes(x.segment ?? (x.decl as { segment?: string } | undefined)?.segment, segmentKey)) && (!lane || jsonIncludes(x.lane, lane) || jsonIncludes((x.initiator as { lane?: string } | undefined)?.lane, lane));
    return { inWindow, matches };
};
export const runScheduler = async (args: string[], env?: SchedulerEnv, output: (s: string) => void = console.log): Promise<number> => {
    const p = parseArgs(args, { toggles: ['--json', '--oneline', '--force', '--kill-holder', '--orig-order', '--gate-empty', '--undo'], value: ['--yield', '--max-sec', '--task', '--from', '--to', '--event', '--ticket', '--seg', '--route', '--day', '--why', '--minutes', '--saw', '--decision', '--note', '--result', '--pid', '--file', '--memory', '--level'] });
    const e = env ?? resolveSchedulerEnv(), [cmd = 'show', ...rest] = p.位置;
    if (modifyCommands.has(cmd)) {
        changeScheduler(cmd, rest[0], p, e, { output: output });
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
        recordSchedulerEvent(e.logDir,'汇报',{initiator:e.caller,observed:oneLineStatus(s)},s.timestamp);
        output(p.toggles.has('--json') ? JSON.stringify({ ...s, machine: { ...s.machine, processes: undefined } }) : p.toggles.has('--oneline') ? oneLineStatus(s) : renderView(s));
        return 0;
    }
    if (cmd === 'estimate') {
        if(!rest.length)throw new UsageError('estimate 要给选择器');
        const {selectSegs}=await import('../清单/清单.ts');
        // 不经 渲/段产物.ts：它的闭包里有 Remotion（资源闸的闭包不许有）
        const {segFrameCount}=await import('../../engine/段/段定义.ts');
        const {filmProfile}=await import('../渲/设置.ts');
        const segments=await selectSegs(rest),s=readState(e),runDir=path.dirname(e.logDir),level=p.value['--level']??'视频',aheadWait=waitAhead(queueOccupancy(s,'渲染'),s.timestamp);
        // 渲段的明细按切片的输出帧记，预计也按输出帧数算
        const outputFrames=(t:(typeof segments)[number])=>segFrameCount(t.segment,filmProfile().fps);
        output(JSON.stringify({前方约秒:aheadWait.sec,未知按下界:aheadWait.unresolved,level: level,segment:segments.map(t=>({segment:t.key,render纯跑秒:estimate({kind:'render',segment:t.key,frameCount:outputFrames(t),level: level},runDir),still一帧秒:estimate({kind:'still',segment:t.key,frameCount:1,level: level},runDir)})),note:'未知显示 null；无预计的票按 23 秒下界，不承诺完成时刻'}));
        return 0;
    }
    if (cmd === 'watch') {
        if(p.value['--max-sec']&&(!Number.isFinite(Number(p.value['--max-sec']))||Number(p.value['--max-sec'])<=0))throw new UsageError('--max-sec 要正秒数');
        return watchSched(e, { maxSec: p.value['--max-sec'] ? Number(p.value['--max-sec']) : undefined, task: p.value['--task'], output: output });
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
        output(JSON.stringify({ ...review(readSchedulerEvents(e.logDir), { matches, now }), 当前持锁: inWindow(now) ? readOccupancy(e).lockHolders.filter(x => !x.死) : [] }, null, 2));
        return 0;
    }
    throw new UsageError(`不认识的调度命令 ${cmd}`);
};
export const schedulerCommands: Record<string, Command> = { sched: { usage: usage, note: '看机器、队列、归因日志；按事件叫醒，不自动派发', noRecord: true, 跑: args => runScheduler(args) } };
