// 调度用的目录、本机名、发起者和时钟：任务.ts 和 指令.ts 都按它读写，单放一处，两边不互相引。
import type { Caller } from './发起者.ts';

export type SchedulerEnv = {
    lockDir: string;
    logDir: string;
    schedulerDir: string;
    localHost: string;
    caller: Caller;
    nowMs: () => number;
};
