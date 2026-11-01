import path from 'node:path';
import { 改命令, 改调度, 路命令, 令命令 } from './改调度.ts';
import { 等条件 } from './等.ts';
import { 解析参数, 用法错误 } from '../cli/参数.ts';
import type { 命令 } from '../cli/命令.ts';
import { 取调度环境, type 调度环境 } from './任务.ts';
import { 读状态, 渲染看, 一行状态 } from './看.ts';
import { 读机器快照并行 } from './机器.ts';
import { 读调度,记调度 } from './调度日志.ts';
import { 复盘 } from './复盘.ts';
import { 估计 } from './估计.ts';
import { 盯 } from './盯.ts';
const 用法 = '调度 [看|先|后|恢复|放行|让路|取消|清孤儿|记|预计|盯|等|路|令|日志|复盘] [--json|--一行]';
export const 跑调度 = async (args: string[], env?: 调度环境, 输出: (s: string) => void = console.log): Promise<number> => {
    const p = 解析参数(args, { 开关: ['--json', '--一行', '--help', '--强', '--杀持锁', '--原序', '--闸空'], 值: ['--最长', '--任务', '--从', '--到', '--事', '--票', '--段', '--路', '--日', '--为什么', '--分钟', '--看到', '--决定', '--说明', '--结果', '--pid', '--文件', '--内存'] });
    if (p.开关.has('--help')) {
        输出('用法：anim ' + 用法);
        return 0;
    }
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
        令命令(rest, e);
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
        const {选段}=await import('../清单/清单.ts');
        const 段们=await 选段(rest),s=读状态(e),根=path.dirname(e.日志目录);
        const 等秒=s.票.reduce((n,t)=>n+(t.内容?.声明.预计秒??23),0)+s.持锁.reduce((n,t)=>n+Math.max(0,(t.声明.预计秒??23)-(s.时-t.拿锁时)/1000),0);
        输出(JSON.stringify({前方约秒:等秒,未知按下界:s.票.some(t=>!t.内容?.声明.预计秒)||s.持锁.some(t=>!t.声明.预计秒),段:段们.map(t=>({段:t.键,render纯跑秒:估计({种:'render',段:t.键,帧数:t.段.帧数},根),still一帧秒:估计({种:'still',段:t.键,帧数:1},根)})),说明:'未知显示 null；无预计的票按 23 秒下界，不承诺完成时刻'}));
        return 0;
    }
    if (cmd === '盯') {
        if(p.值['--最长']&&(!Number.isFinite(Number(p.值['--最长']))||Number(p.值['--最长'])<=0))throw new 用法错误('--最长 要正秒数');
        return 盯(e, { 最长: p.值['--最长'] ? Number(p.值['--最长']) : undefined, 任务: p.值['--任务'], 输出 });
    }
    if (cmd === '日志' || cmd === '复盘') {
        const rows = 读调度(e.日志目录).filter(x => (!p.值['--从'] || x.时 >= p.值['--从']) && (!p.值['--到'] || x.时 <= p.值['--到']) && (!p.值['--日'] || x.时.slice(5, 10) === p.值['--日']) && ['事', '票', '段', '路'].every(k => !p.值['--' + k] || JSON.stringify(k === '段' ? (x.声明 as {
            段?: string;
        })?.段 : k === '路' ? (x.发起 as {
            路?: string;
        })?.路 : x[k])?.includes(p.值['--' + k]!)));
        输出(cmd === '日志' ? rows.map(x => JSON.stringify(x)).join('\n') : JSON.stringify(复盘(rows), null, 2));
        return 0;
    }
    throw new 用法错误(`不认识的调度命令 ${cmd}`);
};
export const 调度命令: Record<string, 命令> = { 调度: { 用法, 说明: '看机器、队列、归因日志；按事件叫醒，不自动派发', 不记录: true, 跑: args => 跑调度(args) } };
