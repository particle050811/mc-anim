import fs from 'node:fs';
import { UsageError, type ParsedArgs } from '../cli/参数.ts';
import { processAlive } from './锁.ts';
import { readOccupancy, whoHolds } from './看.ts';
import { readMemory } from '../环境/资源.ts';
import type { SchedulerEnv } from './任务.ts';
import { timeoutExitCode } from './盯.ts';
export const waitUntil = async (p: ParsedArgs, e: SchedulerEnv, o: {
    sleep?: (ms: number) => Promise<void>;
    freeMemory?: () => number | null;
    gateEmpty?: () => boolean;
    isAlive?: (pid: number) => boolean;
    提示?: (s: string) => void;
} = {}) => {
    const conditions = [p.值['--pid'], p.值['--文件'], p.toggles.has('--闸空'), p.值['--内存']].filter(Boolean);
    if (conditions.length !== 1)
        throw new UsageError('等 要且只要 --pid、--文件、--闸空、--内存 之一');
    if(p.值['--pid']&&(!Number.isSafeInteger(Number(p.值['--pid']))||Number(p.值['--pid'])<=0))throw new UsageError('--pid 要正整数');
    if(p.值['--内存']&&(!Number.isFinite(Number(p.值['--内存']))||Number(p.值['--内存'])<0||Number(p.值['--内存'])>100))throw new UsageError('--内存 要 0–100 的百分比');
    const maxSec = Number(p.值['--最长'] ?? 540);
    if (!Number.isFinite(maxSec) || maxSec <= 0)
        throw new UsageError('--最长 要正秒数');
    const startMs = e.nowMs();
    let idleStart: number | undefined;
    const holders = () => whoHolds(readOccupancy(e));
    const gateEmpty = o.gateEmpty ?? (() => holders().length === 0);
    for (;;) {
        if (e.nowMs() - startMs >= maxSec * 1000) {
            if (p.toggles.has('--闸空')) {
                const blockers = holders();
                (o.提示 ?? console.error)(blockers.length ? `到点，闸还不空：卡在 ${blockers.slice(0, 5).join('；')}${blockers.length > 5 ? `；另${blockers.length - 5}处` : ''}` : '到点：闸是空的，但没连续空满 30 秒');
            }
            return timeoutExitCode;
        }
        if (p.值['--pid'] && !(o.isAlive ?? processAlive)(Number(p.值['--pid'])))
            return 0;
        if (p.值['--文件'] && fs.existsSync(p.值['--文件']))
            return 0;
        if (p.值['--内存']) {
            const n = (o.freeMemory ?? (() => readMemory()?.freePercent ?? null))();
            if (n !== null && n >= Number(p.值['--内存']))
                return 0;
        }
        if (p.toggles.has('--闸空')) {
            if (gateEmpty())
                idleStart ??= e.nowMs();
            else
                idleStart = undefined;
            if (idleStart !== undefined && e.nowMs() - idleStart >= 30000)
                return 0;
        }
        await (o.sleep ?? (ms => new Promise(r => setTimeout(r, ms))))(1000);
    }
};
