import path from 'node:path';
import { 改命令, 改调度, 路命令, 令命令 } from './改调度.ts';
import { 等条件 } from './等.ts';
import { 解析参数, 用法错误, type 已解析 } from '../cli/参数.ts';
import type { 命令 } from '../cli/命令.ts';
import { 取调度环境, 清崩溃, type 调度环境 } from './任务.ts';
import { 读状态, 读占用, 渲染看, 一行状态, 前方等待, 队上占用 } from './看.ts';
import { 读机器快照并行 } from './机器.ts';
import { 读调度,记调度,type 调度事件 } from './调度日志.ts';
import { 复盘 } from './复盘.ts';
import { 等锁表 } from './等锁表.ts';
import { 估计 } from './估计.ts';
import { 盯 } from './盯.ts';
export const 用法 = '调度 [看|先|后|恢复|放行|让路|取消|清孤儿|记|预计|盯|等|路|令|日志|复盘|等锁表] [--json|--一行]';
/** 都按 UTC，和日志、--日 一致。只给日期的 --到 算到当天结束，否则当天的事全被排除。 */
const 解析时刻 = (名: string, s: string, 现在: number) => {
    const m = /^(?:(\d{4})-)?(\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:\d{2})?)?$/.exec(s);
    const ms = m ? Date.parse(`${m[1] ?? new Date(现在).getUTCFullYear()}-${m[2]}T${m[3] ?? '00:00'}${m[4] ?? 'Z'}`) : NaN;
    if (Number.isNaN(ms))
        throw new 用法错误(`${名} 要写 UTC 的 2026-11-01、11-01 或 2026-11-01T08:00:00Z，不认识 ${s}`);
    return m![3] || 名 === '--从' ? ms : ms + 86_399_999;
};
const 日志筛 = (p: 已解析, 现在: number) => {
    const { '--从': 从串, '--到': 到串, '--日': 日, '--事': 事, '--票': 票, '--段': 段, '--路': 路 } = p.值;
    if (日 && !/^\d{2}-\d{2}$/.test(日))
        throw new 用法错误(`--日 要写 UTC 的 11-01，不认识 ${日}`);
    const 从 = 从串 ? 解析时刻('--从', 从串, 现在) : -Infinity, 到 = 到串 ? 解析时刻('--到', 到串, 现在) : Infinity;
    const 含 = (v: unknown, 要: string) => JSON.stringify(v)?.includes(要);
    const 在窗 = (ms: number) => ms >= 从 && ms <= 到 && (!日 || new Date(ms).toISOString().slice(5, 10) === 日);
    // 路 开、令 这些事件的路名在顶层，发起者多半没设 ANIM_ROUTE。顶层有段的（告警、后台事件）以它为准：声明里是任务手上那段，后台做的可能是上一段。
    const 入选 = (x: 调度事件) => 在窗(Date.parse(x.时)) && (!事 || 含(x.事, 事)) && (!票 || 含(x.票, 票)) && (!段 || 含(x.段 ?? (x.声明 as { 段?: string } | undefined)?.段, 段)) && (!路 || 含(x.路, 路) || 含((x.发起 as { 路?: string } | undefined)?.路, 路));
    return { 在窗, 入选 };
};
export const 跑调度 = async (args: string[], env?: 调度环境, 输出: (s: string) => void = console.log): Promise<number> => {
    const p = 解析参数(args, { 开关: ['--json', '--一行', '--强', '--杀持锁', '--原序', '--闸空', '--撤'], 值: ['--让路', '--最长', '--任务', '--从', '--到', '--事', '--票', '--段', '--路', '--日', '--为什么', '--分钟', '--看到', '--决定', '--说明', '--结果', '--pid', '--文件', '--内存', '--级别'] });
    const e = env ?? 取调度环境(), [cmd = '看', ...rest] = p.位置;
    if (改命令.has(cmd)) {
        改调度(cmd, rest[0], p, e, { 输出 });
        return 0;
    }
    if (cmd === '路') {
        路命令(rest, p, e, 输出);
        return 0;
    }
    if (cmd === '令') {
        令命令(rest, p, e, 输出);
        return 0;
    }
    if (cmd === '等')
        return 等条件(p, e);
    if (cmd === '看') {
        const 机 = await 读机器快照并行();
        const s = 读状态(e, () => 机);
        记调度(e.日志目录,'汇报',{发起:e.发起者,看到:一行状态(s)},s.时);
        输出(p.开关.has('--json') ? JSON.stringify({ ...s, 机: { ...s.机, 进程: undefined } }) : p.开关.has('--一行') ? 一行状态(s) : 渲染看(s));
        return 0;
    }
    if (cmd === '预计') {
        if(!rest.length)throw new 用法错误('预计 要给选择器');
        const {选段,全部段}=await import('../清单/清单.ts');
        // 不经 渲/段产物.ts：它的闭包里有 Remotion（资源闸的闭包不许有）
        const {段输出窗,全片起帧表}=await import('../../engine/段/出帧.ts');
        const {成片档}=await import('../渲/设置.ts');
        const 段们=await 选段(rest),起帧=全片起帧表((await 全部段()).map(x=>({键:x.键,帧数:x.段.帧数}))),s=读状态(e),根=path.dirname(e.日志目录),级别=p.值['--级别']??'视频',前方=前方等待(队上占用(s,'渲染'),s.时);
        // 渲段的明细按切片的输出帧记，预计也按输出帧数算
        const 输出帧数=(t:(typeof 段们)[number])=>段输出窗(起帧.get(t.键)??0,t.段.帧数,t.段.fps,成片档().fps).帧数;
        输出(JSON.stringify({前方约秒:前方.秒,未知按下界:前方.未知,级别,段:段们.map(t=>({段:t.键,render纯跑秒:估计({种:'render',段:t.键,帧数:输出帧数(t),级别},根),still一帧秒:估计({种:'still',段:t.键,帧数:1,级别},根)})),说明:'未知显示 null；无预计的票按 23 秒下界，不承诺完成时刻'}));
        return 0;
    }
    if (cmd === '盯') {
        if(p.值['--最长']&&(!Number.isFinite(Number(p.值['--最长']))||Number(p.值['--最长'])<=0))throw new 用法错误('--最长 要正秒数');
        return 盯(e, { 最长: p.值['--最长'] ? Number(p.值['--最长']) : undefined, 任务: p.值['--任务'], 输出 });
    }
    if (cmd === '等锁表') {
        输出(JSON.stringify(等锁表(读调度(e.日志目录), 日志筛(p, e.现在毫秒()).入选), null, 2));
        return 0;
    }
    if (cmd === '日志' || cmd === '复盘') {
        const 现在 = e.现在毫秒(), { 在窗, 入选 } = 日志筛(p, 现在);
        if (cmd === '日志') {
            输出(读调度(e.日志目录).filter(入选).map(x => JSON.stringify(x)).join('\n'));
            return 0;
        }
        // 先认领崩溃再读；当前持锁读现状，日志回放不知道旧闸，也可能还没人发现持锁者死了。
        清崩溃(e);
        输出(JSON.stringify({ ...复盘(读调度(e.日志目录), { 入选, 现在 }), 当前持锁: 在窗(现在) ? 读占用(e).持锁.filter(x => !x.死) : [] }, null, 2));
        return 0;
    }
    throw new 用法错误(`不认识的调度命令 ${cmd}`);
};
export const 调度命令: Record<string, 命令> = { 调度: { 用法, 说明: '看机器、队列、归因日志；按事件叫醒，不自动派发', 不记录: true, 跑: args => 跑调度(args) } };
