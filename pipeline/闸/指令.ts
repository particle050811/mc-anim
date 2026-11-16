import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson, promptOnly } from './文件.ts';
import type { SchedulerEnv } from './调度环境.ts';
export type Directive = {
    动作: string;
    why: string;
    timestamp: number;
    至?: number;
    strength?: boolean;
    ticket?: string;
    task?: string;
};
export const directiveFile = (e: SchedulerEnv, id: string) => path.join(e.lockDir, '指令', encodeURIComponent(id) + '.json');
export const readDirective = (e: SchedulerEnv, id: string) => readJson<Directive>(directiveFile(e, id));
export const writeDirective = (e: SchedulerEnv, id: string, c: Directive) => writeJson(directiveFile(e, id), c);
export const deleteDirective = (e: SchedulerEnv, id: string) => promptOnly('指令文件', () => fs.rmSync(directiveFile(e, id), { force: true }));
/** 放行授权按任务 id 存（票会改名）；过了期不再算数：当时看的内存读数已经过时。 */
export const getPassGrant = (e: SchedulerEnv, task: string) => { const c = readDirective(e, task); return c?.动作 === '放行' && (c.至 ?? 0) > e.nowMs() ? c : null; };
/** 同一文件也放让路和取消，用掉授权不能把它们一起删了。 */
export const consumePassGrant = (e: SchedulerEnv, task: string) => { if (readDirective(e, task)?.动作 === '放行')
    deleteDirective(e, task); };
export const orderFile = (e: SchedulerEnv, lane: string) => path.join(e.schedulerDir, '令', encodeURIComponent(lane));
export const routeYield = (e: SchedulerEnv) => {
    const x = readJson<{
        动作: string;
        why: string;
        至: number;
    }>(orderFile(e, e.caller.lane));
    return e.caller.lane && x?.动作 === '让路' && x.至 > e.nowMs() ? x.why : null;
};
export const yieldExitCode = 75;
export class SchedYieldError extends Error {
    exitCode = yieldExitCode;
}
export const failExitCode = (err: unknown) => err instanceof SchedYieldError ? yieldExitCode : 1;
// 直接 import 闸的脚本没有路由接这个异常，Node 会打调用栈退 1，子代理就当失败重试了。Monitor 不改别的异常的崩溃行为。
process.on('uncaughtExceptionMonitor', err => { if (err instanceof SchedYieldError)
    process.exit(yieldExitCode); });
