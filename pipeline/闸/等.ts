import fs from 'node:fs';
import { 用法错误, type 已解析 } from '../cli/参数.ts';
import { 进程在吗 } from './锁.ts';
import { 读占用, 谁占着 } from './看.ts';
import { 读内存 } from '../环境/资源.ts';
import type { 调度环境 } from './任务.ts';
import { 到点退出码 } from './盯.ts';
export const 等条件 = async (p: 已解析, e: 调度环境, o: {
    睡?: (ms: number) => Promise<void>;
    内存?: () => number | null;
    闸空?: () => boolean;
    活?: (pid: number) => boolean;
    提示?: (s: string) => void;
} = {}) => {
    const 条件 = [p.值['--pid'], p.值['--文件'], p.开关.has('--闸空'), p.值['--内存']].filter(Boolean);
    if (条件.length !== 1)
        throw new 用法错误('等 要且只要 --pid、--文件、--闸空、--内存 之一');
    if(p.值['--pid']&&(!Number.isSafeInteger(Number(p.值['--pid']))||Number(p.值['--pid'])<=0))throw new 用法错误('--pid 要正整数');
    if(p.值['--内存']&&(!Number.isFinite(Number(p.值['--内存']))||Number(p.值['--内存'])<0||Number(p.值['--内存'])>100))throw new 用法错误('--内存 要 0–100 的百分比');
    const 最长 = Number(p.值['--最长'] ?? 540);
    if (!Number.isFinite(最长) || 最长 <= 0)
        throw new 用法错误('--最长 要正秒数');
    const 起 = e.现在毫秒();
    let 空起: number | undefined;
    const 占着的 = () => 谁占着(读占用(e));
    const 闸空 = o.闸空 ?? (() => 占着的().length === 0);
    for (;;) {
        if (e.现在毫秒() - 起 >= 最长 * 1000) {
            if (p.开关.has('--闸空')) {
                const 卡 = 占着的();
                (o.提示 ?? console.error)(卡.length ? `到点，闸还不空：卡在 ${卡.slice(0, 5).join('；')}${卡.length > 5 ? `；另${卡.length - 5}处` : ''}` : '到点：闸是空的，但没连续空满 30 秒');
            }
            return 到点退出码;
        }
        if (p.值['--pid'] && !(o.活 ?? 进程在吗)(Number(p.值['--pid'])))
            return 0;
        if (p.值['--文件'] && fs.existsSync(p.值['--文件']))
            return 0;
        if (p.值['--内存']) {
            const n = (o.内存 ?? (() => 读内存()?.空闲百分比 ?? null))();
            if (n !== null && n >= Number(p.值['--内存']))
                return 0;
        }
        if (p.开关.has('--闸空')) {
            if (闸空())
                空起 ??= e.现在毫秒();
            else
                空起 = undefined;
            if (空起 !== undefined && e.现在毫秒() - 空起 >= 30000)
                return 0;
        }
        await (o.睡 ?? (ms => new Promise(r => setTimeout(r, ms))))(1000);
    }
};
