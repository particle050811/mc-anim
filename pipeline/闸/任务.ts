import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { dataPath, config } from '../环境/配置.ts';
import { readCaller, type Caller } from './发起者.ts';
import { recordSchedulerEvent } from './调度日志.ts';
import { readJson, writeJson, listFiles, promptOnly } from './文件.ts';
import { registerCleanup } from '../环境/收尾.ts';
import { pidReplaced, processAlive } from './锁.ts';
import { readDirective, directiveFile } from './指令.ts';
import type { SchedulerEnv } from './调度环境.ts';
import { load1Min } from '../环境/资源.ts';
export type TaskDecl = {
    种?: string;
    作品?: string;
    段?: string;
    帧数?: number;
    /** 帧号摘要：只为认出重复的票，帧多时截短。 */
    帧?: string;
    级别?: string;
    预计秒?: number | null;
    用途?: string;
    项数?: number;
    连贯?: {
        为什么: string;
    };
    不开渲染?: boolean;
    可让路?: boolean;
    /** anim --low-priority（ANIM_PRIORITY=low）：票排在所有普通票后面，多段批有普通票在等就在项间让开 */
    低优先?: boolean;
    需负载?: boolean;
};
export type { SchedulerEnv };
export type TaskInfo = {
    任务: string;
    起: number;
    心跳: number;
    发起: Caller;
    声明: TaskDecl;
    主机: string;
    票?: string;
    /** 被杀时说得清当时在干嘛；崩溃事件也从在跑文件带出来。 */
    当时?: '排队' | '持锁' | '';
};
const liveTasks = new Map<string, ReturnType<typeof buildTask>>();
export const resolveSchedulerEnv = (e: Partial<SchedulerEnv> = {}): SchedulerEnv => ({ lockDir: e.lockDir ?? config('锁目录'),
    logDir: e.logDir ?? (e.lockDir ? path.join(e.lockDir, 'logs') : dataPath('run', 'logs', '调度')),
    schedulerDir: e.schedulerDir ?? (e.lockDir ? path.join(e.lockDir, 'state') : dataPath('run', '调度')), localHost: e.localHost ?? config('主机'),
    caller: e.caller ?? readCaller(), nowMs: e.nowMs ?? Date.now });
const buildTask = (e: SchedulerEnv, taskDecl: TaskDecl, onEnd?: (exitCode: number) => void) => {
    const now = e.nowMs();
    const info: TaskInfo = { 任务: `${now.toString(36)}-${process.pid}-${randomUUID().slice(0, 8)}`, 起: now, 心跳: now, 发起: e.caller, 声明: taskDecl, 主机: e.localHost };
    const file = path.join(e.lockDir, '在跑', info.任务 + '.json');
    const save = () => promptOnly('在跑登记', () => writeJson(file, info));
    save();
    const logEvent = (eventName: string, fields: Record<string, unknown> = {}) => recordSchedulerEvent(e.logDir, eventName, { 任务: info.任务, 发起: info.发起, 声明: info.声明, ...fields }, e.nowMs());
    logEvent('任务起');
    promptOnly('盯未挂记录', () => checkWatch(e, info));
    let ended = false;
    const finish = (exitCode = 0, signal?: string, errorText?: string) => {
        if (ended)
            return;
        ended = true;
        clearInterval(timer);
        undo();
        const directive = readDirective(e, info.任务), cancel = directive?.动作 === '取消' ? directive : undefined, now = e.nowMs();
        if (signal) {
            if (cancel)
                console.error(`被调度取消：${cancel.为什么}，不要原样重发`);
            logEvent('被杀', { 信号: signal, 退出码: exitCode, 为什么: cancel?.为什么, 票: info.票, 当时: info.当时 || '其他', 已跑秒: (now - info.起) / 1000, 取消后秒: cancel?.时 ? (now - cancel.时) / 1000 : undefined, 机: { 负载: load1Min() } });
        }
        logEvent('任务止', { 票: info.票, 退出码: exitCode, 信号: signal, 错误: errorText, 秒: (now - info.起) / 1000 });
        promptOnly('耗时记录', () => {
            if (onEnd)
                onEnd(exitCode);
            else {
                const timingFile = path.join(e.logDir, '..', '耗时.tsv');
                fs.mkdirSync(path.dirname(timingFile), { recursive: true });
                const line = [new Date(info.起).toISOString(), `脚本 ${taskDecl.种 ?? '过闸'}`, ((e.nowMs() - info.起) / 1000).toFixed(1), exitCode, e.localHost, info.发起.命令].join('\t') + '\n';
                fs.appendFileSync(timingFile, line);
            }
        });
        promptOnly('在跑登记', () => {
            fs.rmSync(file, { force: true });
            fs.rmSync(directiveFile(e, info.任务), { force: true });
        });
        liveTasks.delete(e.lockDir);
    };
    const undo = registerCleanup(finish);
    const timer = setInterval(() => { info.心跳 = e.nowMs(); save(); }, 30000);
    timer.unref();
    return { info, logEvent, 结束: finish, update: (taskDecl: TaskDecl, ticket?: string, phase = info.当时) => { info.声明 = taskDecl; info.票 = ticket; info.当时 = phase; save(); } };
};
export const openTask = (e: SchedulerEnv, taskDecl: TaskDecl, onDone?: (exitCode: number) => void) => {
    let t = liveTasks.get(e.lockDir);
    if (!t) {
        t = buildTask(e, taskDecl, onDone);
        liveTasks.set(e.lockDir, t);
    }
    return t;
};
export const checkWatch = (e: SchedulerEnv, taskInfo: TaskInfo) => {
    // 挂盯是 CLAUDE.md 给作者的 Claude、Codex 会话定的纪律；别人照 docs/从零渲染.md 跑（人或别家 AI 助手，来源都是「人」）看到这句只会困惑（11-14 在 Windows 上从 GitHub 走一遍时见到）
    if (e.caller.来源 === '人')
        return;
    const dir = path.join(e.schedulerDir, '盯');
    if (listFiles(dir).some(n => { const x = readJson<{
        pid: number;
        会话: string;
    }>(path.join(dir, n)); return x && processAlive(x.pid) && x.会话 === e.caller.会话; }))
        return;
    const f = path.join(e.schedulerDir, `未挂-${e.caller.会话 || process.pid}.json`);
    const prevCheck = readJson<{
        时: number;
    }>(f);
    if (prevCheck && e.nowMs() - prevCheck.时 < 600000)
        return;
    writeJson(f, { 时: e.nowMs() });
    console.error('!! 盯未挂：请主 Agent 挂 anim sched watch；任务照常排队');
    recordSchedulerEvent(e.logDir, '盯未挂', { 任务: taskInfo.任务, 发起: e.caller }, e.nowMs());
};
/** unlink 的胜者才记崩溃，多个等待者不会重复归因；跨主机不按本机 pid 猜死。 */
export const cleanCrashed = (e: SchedulerEnv, isAlive = (pid: number, heartbeat: number) => processAlive(pid) && !pidReplaced(pid, heartbeat)) => {
    for (const fileName of listFiles(path.join(e.lockDir, '在跑'))) {
        const file = path.join(e.lockDir, '在跑', fileName), t = readJson<TaskInfo>(file);
        if (!t || t.主机 !== e.localHost || isAlive(t.发起.pid, t.心跳))
            continue;
        try {
            fs.unlinkSync(file);
        }
        catch {
            continue;
        }
        recordSchedulerEvent(e.logDir, '崩溃', t, e.nowMs());
    }
};
export const hasTask = (lockDir: string) => liveTasks.has(lockDir);
