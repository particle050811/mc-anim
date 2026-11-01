import fs from 'node:fs';
import path from 'node:path';
import { 读JSON, 写JSON, 只提示 } from './文件.ts';
import type { 调度环境 } from './任务.ts';
export type 指令 = {
    动作: string;
    为什么: string;
    时: number;
    至?: number;
    强?: boolean;
    票?: string;
    任务?: string;
};
export const 指令文件 = (e: 调度环境, id: string) => path.join(e.锁目录, '指令', encodeURIComponent(id) + '.json');
export const 取指令 = (e: 调度环境, id: string) => 读JSON<指令>(指令文件(e, id));
export const 写指令 = (e: 调度环境, id: string, c: 指令) => 写JSON(指令文件(e, id), c);
export const 删指令 = (e: 调度环境, id: string) => 只提示('指令文件', () => fs.rmSync(指令文件(e, id), { force: true }));
/** 放行授权按任务 id 存（票会改名）；过了期不再算数：当时看的内存读数已经过时。 */
export const 取放行 = (e: 调度环境, 任务: string) => { const c = 取指令(e, 任务); return c?.动作 === '放行' && (c.至 ?? 0) > e.现在毫秒() ? c : null; };
/** 同一文件也放让路和取消，用掉授权不能把它们一起删了。 */
export const 用掉放行 = (e: 调度环境, 任务: string) => { if (取指令(e, 任务)?.动作 === '放行')
    删指令(e, 任务); };
export const 令文件 = (e: 调度环境, 路: string) => path.join(e.调度目录, '令', encodeURIComponent(路));
export const 路让路 = (e: 调度环境) => {
    const x = 读JSON<{
        动作: string;
        为什么: string;
        至: number;
    }>(令文件(e, e.发起者.路));
    return e.发起者.路 && x?.动作 === '让路' && x.至 > e.现在毫秒() ? x.为什么 : null;
};
export const 让路退出码 = 75;
export class 调度让路 extends Error {
    退出码 = 让路退出码;
}
export const 失败退出码 = (err: unknown) => err instanceof 调度让路 ? 让路退出码 : 1;
// 直接 import 闸的脚本没有路由接这个异常，Node 会打调用栈退 1，子代理就当失败重试了。Monitor 不改别的异常的崩溃行为。
process.on('uncaughtExceptionMonitor', err => { if (err instanceof 调度让路)
    process.exit(让路退出码); });
