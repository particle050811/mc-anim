import fs from 'node:fs';
import path from 'node:path';
import { 配置 } from '../环境/配置.ts';
import { 列文件 } from './文件.ts';
import { 遮密 } from './发起者.ts';
export type 调度事件 = {
    v: number;
    时: string;
    事: string;
    任务?: string;
    票?: string;
    锁?: string;
    主机: string;
    [k: string]: unknown;
};
/** 单次 O_APPEND write，不能先读再写；多进程和跨月均不轮转正在打开的文件。 */
export const 记调度 = (目录: string, 事: string, 字段: Record<string, unknown> = {}, now = Date.now()) => {
    try {
        fs.mkdirSync(目录, { recursive: true });
        const 清 = (x: unknown, key = ''): unknown => {
            if (/token|secret|password|authorization|api.?key/i.test(key))
                return '[已遮蔽]';
            if (typeof x === 'string')
                return 遮密(x).slice(0, 400);
            if (Array.isArray(x))
                return x.slice(0, 8).map(v => 清(v));
            if (x && typeof x === 'object')
                return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, 清(v, k)]));
            return x;
        };
        const 行: 调度事件 = { ...(清(字段) as Record<string, unknown>), v: 1, 时: new Date(now).toISOString(), 事, 主机: 配置('主机') };
        let text = JSON.stringify(行) + '\n';
        if (Buffer.byteLength(text) >= 4096) {
            行.看到=(行.看到 as {摘要?:string}|undefined)?.摘要??'快照过长，见同票领票事件';
            delete 行.队;
            行.截断 = true;
            text = JSON.stringify(行) + '\n';
        }
        if (Buffer.byteLength(text) >= 4096)
            text = JSON.stringify({ v: 1, 时: 行.时, 事, 任务: 行.任务, 票: 行.票, 主机: 行.主机, 截断: true }) + '\n';
        const fd = fs.openSync(path.join(目录, 行.时.slice(0, 7) + '.jsonl'), 'a');
        try {
            fs.writeSync(fd, text);
        }
        finally {
            fs.closeSync(fd);
        }
    }
    catch (e) {
        console.error(`!! 调度日志写失败：${(e as Error).message}`);
    }
};
export const 读调度 = (目录: string, 尾字节?: number): 调度事件[] => {
    const files = 列文件(目录).filter(x => /^\d{4}-\d{2}\.jsonl$/.test(x)).sort();
    const out: 调度事件[] = [];
    for (const name of 尾字节 ? files.slice(-1) : files) {
        let fd: number | undefined;
        try {
            fd = fs.openSync(path.join(目录, name), 'r');
            const size = fs.fstatSync(fd).size;
            const offset = 尾字节 ? Math.max(0, size - 尾字节) : 0;
            const b = Buffer.alloc(size - offset);
            fs.readSync(fd, b, 0, b.length, offset);
            const lines = b.toString('utf8').split('\n');
            if (offset)
                lines.shift();
            for (const l of lines) {
                try {
                    out.push(JSON.parse(l));
                }
                catch { /* 并发写入的末行下一次再读 */ }
            }
        }
        catch { /* 月文件可能尚未创建 */ }
        finally {
            if (fd !== undefined)
                fs.closeSync(fd);
        }
    }
    return out;
};
