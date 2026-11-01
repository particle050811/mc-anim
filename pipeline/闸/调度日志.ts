import fs from 'node:fs';
import path from 'node:path';
import { 配置 } from '../环境/配置.ts';
import { 列文件 } from './文件.ts';
import { 遮密, 敏感名, type 发起者 } from './发起者.ts';
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
const 行上限 = 4096;
const 放得下 = (行: 调度事件) => Buffer.byteLength(JSON.stringify(行)) + 1 < 行上限;
const 短发起 = (x: unknown) => { const { 来源, 会话, 路, 工作区, pid, 子会话, 代理标 } = x as Partial<发起者>; return { 来源, 会话, 路, 工作区, pid, 子会话, 代理标 }; };
const 按字节截 = (s: string, n: number) => Buffer.byteLength(s) <= n ? s : Buffer.from(s).subarray(0, n).toString('utf8').replace(/\uFFFD+$/, '') + '…';
/** 按丢失的代价从小到大退。决定、为什么、谁 是这条日志存在的理由，只收缩不删。 */
const 压行 = (行: 调度事件): 调度事件 => {
    const a: 调度事件 = { ...行, 截断: true }, 看 = a.看到 as { 人工?: string; 摘要?: string } | string | undefined;
    if (看 && typeof 看 === 'object')
        a.看到 = [看.人工, 看.摘要].filter(Boolean).join('；');
    delete a.队;
    delete a.机;
    if (放得下(a))
        return a;
    for (const k of ['发起', '谁'])
        if (a[k] && typeof a[k] === 'object')
            a[k] = 短发起(a[k]);
    if (放得下(a))
        return a;
    for (const k of ['看到', '决定', '为什么'])
        if (typeof a[k] === 'string')
            a[k] = 按字节截(a[k], 900);
    return 放得下(a) ? a : { v: a.v, 时: a.时, 事: a.事, 任务: a.任务, 票: a.票, 主机: a.主机, 截断: true, 谁: a.谁, 决定: a.决定, 为什么: a.为什么 };
};
/** 单次 O_APPEND write，不能先读再写；多进程和跨月均不轮转正在打开的文件。 */
export const 记调度 = (目录: string, 事: string, 字段: Record<string, unknown> = {}, now = Date.now()) => {
    try {
        fs.mkdirSync(目录, { recursive: true });
        const 清 = (x: unknown, key = ''): unknown => {
            if (敏感名.test(key))
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
        if (!放得下(行)) {
            text = JSON.stringify(压行(行)) + '\n';
            console.error(`!! 调度日志一行超过 ${行上限} 字节，已压缩：${事}`);
        }
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
const 月文件们 = (目录: string) => 列文件(目录).filter(x => /^\d{4}-\d{2}\.jsonl$/.test(x)).sort();
/** 起：给定文件大小，定从哪个字节读起。月文件可能尚未创建，读不到返回 null。 */
const 读字节 = (file: string, 起: (size: number) => number) => {
    let fd: number | undefined;
    try {
        fd = fs.openSync(file, 'r');
        const size = fs.fstatSync(fd).size, offset = 起(size), b = Buffer.alloc(size - offset);
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
export const 读调度 = (目录: string, 尾字节?: number): 调度事件[] => {
    let out: 调度事件[] = [], 余 = 尾字节 ?? Infinity;
    for (const name of 月文件们(目录).reverse()) {
        if (余 <= 0)
            break;
        let 截了 = false, 读了 = 0;
        const b = 读字节(path.join(目录, name), size => { const offset = Math.max(0, size - 余); 截了 = offset > 0; 读了 = size - offset; return offset; });
        if (!b)
            continue;
        余 -= 读了;
        const lines = b.toString('utf8').split('\n'), 本月: 调度事件[] = [];
        if (截了)
            lines.shift();
        for (const l of lines) {
            try {
                本月.push(JSON.parse(l));
            }
            catch { /* 并发写入的末行下一次再读 */ }
        }
        out = [...本月, ...out];
    }
    return out;
};
/** UTC 月文件名和字节偏移，跨月、尾部滑出都不丢。 */
export type 日志位置 = {
    月: string;
    偏移: number;
};
/** 从位置读到末尾，只吃整行（末行可能还在写）。每行带读完它的位置，调用方可以只把报过的算已读。 */
export const 读新事件 = (目录: string, 从?: 日志位置 | null) => {
    const 行: { 事件: 调度事件; 到: 日志位置 }[] = [];
    let 末: 日志位置 = 从 ?? { 月: '', 偏移: 0 };
    for (const name of 月文件们(目录)) {
        const 月 = name.slice(0, 7);
        if (从 && 月 < 从.月)
            continue;
        let 基 = 0;
        const b = 读字节(path.join(目录, name), size => (基 = 从?.月 === 月 && 从.偏移 <= size ? 从.偏移 : 0));
        if (!b)
            continue;
        for (let 头 = 0, 尾 = b.indexOf(10); 尾 >= 0; 头 = 尾 + 1, 尾 = b.indexOf(10, 头)) {
            末 = { 月, 偏移: 基 + 尾 + 1 };
            try {
                行.push({ 事件: JSON.parse(b.toString('utf8', 头, 尾)), 到: 末 });
            }
            catch { /* 坏行跳过，不卡住后面 */ }
        }
    }
    return { 行, 末 };
};
