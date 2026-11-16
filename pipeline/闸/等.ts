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
    const conditions = [p.value['--pid'], p.value['--file'], p.toggles.has('--gate-empty'), p.value['--memory']].filter(Boolean);
    if (conditions.length !== 1)
        throw new UsageError('等 要且只要 --pid、--file、--gate-empty、--memory 之一');
    if(p.value['--pid']&&(!Number.isSafeInteger(Number(p.value['--pid']))||Number(p.value['--pid'])<=0))throw new UsageError('--pid 要正整数');
    if(p.value['--memory']&&(!Number.isFinite(Number(p.value['--memory']))||Number(p.value['--memory'])<0||Number(p.value['--memory'])>100))throw new UsageError('--memory 要 0–100 的百分比');
    const maxSec = Number(p.value['--max-sec'] ?? 540);
    if (!Number.isFinite(maxSec) || maxSec <= 0)
        throw new UsageError('--max-sec 要正秒数');
    const startMs = e.nowMs();
    let idleStart: number | undefined;
    const holders = () => whoHolds(readOccupancy(e));
    const gateEmpty = o.gateEmpty ?? (() => holders().length === 0);
    for (;;) {
        if (e.nowMs() - startMs >= maxSec * 1000) {
            if (p.toggles.has('--gate-empty')) {
                const blockers = holders();
                (o.提示 ?? console.error)(blockers.length ? `到点，闸还不空：卡在 ${blockers.slice(0, 5).join('；')}${blockers.length > 5 ? `；另${blockers.length - 5}处` : ''}` : '到点：闸是空的，但没连续空满 30 秒');
            }
            return timeoutExitCode;
        }
        if (p.value['--pid'] && !(o.isAlive ?? processAlive)(Number(p.value['--pid'])))
            return 0;
        if (p.value['--file'] && fs.existsSync(p.value['--file']))
            return 0;
        if (p.value['--memory']) {
            const n = (o.freeMemory ?? (() => readMemory()?.freePercent ?? null))();
            if (n !== null && n >= Number(p.value['--memory']))
                return 0;
        }
        if (p.toggles.has('--gate-empty')) {
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
