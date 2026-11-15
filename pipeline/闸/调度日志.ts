import fs from 'node:fs';
import path from 'node:path';
import { config } from '../环境/配置.ts';
import { listFiles } from './文件.ts';
import { maskSecret, sensitiveRe, type Caller } from './发起者.ts';
export type SchedulerEvent = {
    v: number;
    时: string;
    事: string;
    任务?: string;
    票?: string;
    lock?: string;
    主机: string;
    [k: string]: unknown;
};
const maxRowBytes = 4096;
const fitsLimit = (record: SchedulerEvent) => Buffer.byteLength(JSON.stringify(record)) + 1 < maxRowBytes;
const shortInitiator = (x: unknown) => { const { 来源: source, 会话: sessionId, 路: lane, 工作区: workspace, pid, 子会话: isChildSession, 代理标: agentTag } = x as Partial<Caller>; return { 来源: source, 会话: sessionId, 路: lane, 工作区: workspace, pid, 子会话: isChildSession, 代理标: agentTag }; };
const truncateBytes = (s: string, n: number) => Buffer.byteLength(s) <= n ? s : Buffer.from(s).subarray(0, n).toString('utf8').replace(/\uFFFD+$/, '') + '…';
/** 按丢失的代价从小到大退。决定、为什么、谁 是这条日志存在的理由，只收缩不删。 */
const compactLine = (record: SchedulerEvent): SchedulerEvent => {
    const a: SchedulerEvent = { ...record, 截断: true }, seen = a.看到 as { manualNote?: string; 摘要?: string } | string | undefined;
    if (seen && typeof seen === 'object')
        a.看到 = [seen.manualNote, seen.摘要].filter(Boolean).join('；');
    delete a.队;
    delete a.机;
    if (fitsLimit(a))
        return a;
    for (const k of ['发起', '谁'])
        if (a[k] && typeof a[k] === 'object')
            a[k] = shortInitiator(a[k]);
    if (fitsLimit(a))
        return a;
    for (const k of ['看到', '决定', '为什么'])
        if (typeof a[k] === 'string')
            a[k] = truncateBytes(a[k], 900);
    return fitsLimit(a) ? a : { v: a.v, 时: a.时, 事: a.事, 任务: a.任务, 票: a.票, 主机: a.主机, 截断: true, 谁: a.谁, 决定: a.决定, 为什么: a.为什么 };
};
/** 单次 O_APPEND write，不能先读再写；多进程和跨月均不轮转正在打开的文件。 */
export const recordSchedulerEvent = (schedDir: string, eventName: string, fields: Record<string, unknown> = {}, now = Date.now()) => {
    try {
        fs.mkdirSync(schedDir, { recursive: true });
        const sanitize = (x: unknown, key = ''): unknown => {
            if (sensitiveRe.test(key))
                return '[已遮蔽]';
            if (typeof x === 'string')
                return maskSecret(x).slice(0, 400);
            if (Array.isArray(x))
                return x.slice(0, 8).map(v => sanitize(v));
            if (x && typeof x === 'object')
                return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, sanitize(v, k)]));
            return x;
        };
        const record: SchedulerEvent = { ...(sanitize(fields) as Record<string, unknown>), v: 1, 时: new Date(now).toISOString(), 事: eventName, 主机: config('主机') };
        let text = JSON.stringify(record) + '\n';
        if (!fitsLimit(record)) {
            text = JSON.stringify(compactLine(record)) + '\n';
            console.error(`!! 调度日志一行超过 ${maxRowBytes} 字节，已压缩：${eventName}`);
        }
        const fd = fs.openSync(path.join(schedDir, record.时.slice(0, 7) + '.jsonl'), 'a');
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
const monthFiles = (schedDir: string) => listFiles(schedDir).filter(x => /^\d{4}-\d{2}\.jsonl$/.test(x)).sort();
/** 起：给定文件大小，定从哪个字节读起。月文件可能尚未创建，读不到返回 null。 */
const readBytes = (file: string, startOffsetOf: (size: number) => number) => {
    let fd: number | undefined;
    try {
        fd = fs.openSync(file, 'r');
        const size = fs.fstatSync(fd).size, offset = startOffsetOf(size), b = Buffer.alloc(size - offset);
        fs.readSync(fd, b, 0, b.length, offset);
        return b;
    }
    catch {
        return null;
    }
    finally {
        if (fd !== undefined)
            fs.closeSync(fd);
    }
};
export const readSchedulerEvents = (schedDir: string, tailBytes?: number): SchedulerEvent[] => {
    let out: SchedulerEvent[] = [], remainingBytes = tailBytes ?? Infinity;
    for (const name of monthFiles(schedDir).reverse()) {
        if (remainingBytes <= 0)
            break;
        let truncated = false, bytesRead = 0;
        const b = readBytes(path.join(schedDir, name), size => { const offset = Math.max(0, size - remainingBytes); truncated = offset > 0; bytesRead = size - offset; return offset; });
        if (!b)
            continue;
        remainingBytes -= bytesRead;
        const lines = b.toString('utf8').split('\n'), tailEvents: SchedulerEvent[] = [];
        if (truncated)
            lines.shift();
        for (const l of lines) {
            try {
                tailEvents.push(JSON.parse(l));
            }
            catch { /* 并发写入的末行下一次再读 */ }
        }
        out = [...tailEvents, ...out];
    }
    return out;
};
/** UTC 月文件名和字节偏移，跨月、尾部滑出都不丢。 */
export type LogPosition = {
    月: string;
    offset: number;
};
/** 从位置读到末尾，只吃整行（末行可能还在写）。每行带读完它的位置，调用方可以只把报过的算已读。 */
export const readNewEvents = (schedDir: string, fromCursor?: LogPosition | null) => {
    const rows: { 事件: SchedulerEvent; 到: LogPosition }[] = [];
    let endCursor: LogPosition = fromCursor ?? { 月: '', offset: 0 };
    for (const name of monthFiles(schedDir)) {
        const month = name.slice(0, 7);
        if (fromCursor && month < fromCursor.月)
            continue;
        let startOffset = 0;
        const b = readBytes(path.join(schedDir, name), size => (startOffset = fromCursor?.月 === month && fromCursor.offset <= size ? fromCursor.offset : 0));
        if (!b)
            continue;
        for (let lineStart = 0, lineEnd = b.indexOf(10); lineEnd >= 0; lineStart = lineEnd + 1, lineEnd = b.indexOf(10, lineStart)) {
            endCursor = { 月: month, offset: startOffset + lineEnd + 1 };
            try {
                rows.push({ 事件: JSON.parse(b.toString('utf8', lineStart, lineEnd)), 到: endCursor });
            }
            catch { /* 坏行跳过，不卡住后面 */ }
        }
    }
    return { 行: rows, endCursor };
};
