import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { 读JSON, 写JSON, 只提示 } from './文件.ts';
import type { 调度状态 } from './看.ts';
import type { 调度环境 } from './任务.ts';
import { 记调度 } from './调度日志.ts';
export type 告警 = {
    类: string;
    对象: string;
    值: number;
    阈值: number;
    次数: number;
};
export const 默认阈值 = { 内存: 180, 小任务: 300, 任意: 600, 队深: 4, 无帧: 300, 负载: 180, 批: 1800 };
export type 监测历史 = {
    负载起?: number;
    swap: {
        时: number;
        量: number;
    }[];
    孤儿轮: number;
    高水位: number;
    去重: Record<string, number>;
};
export const 空历史 = (): 监测历史 => ({ swap: [], 孤儿轮: 0, 高水位: 0, 去重: {} });
export const 更新历史 = (s: 调度状态, h: 监测历史): 监测历史 => ({ ...h, 负载起: s.机.负载 > s.机.核 * 2 ? (h.负载起 ?? s.时) : undefined, 孤儿轮: s.机.孤儿 ? h.孤儿轮 + 1 : 0, swap: [...h.swap.filter(x => s.时 - x.时 <= 180000), { 时: s.时, 量: s.机.swap ?? 0 }] });
/** 不读盘、不取时钟；历史与阈值都由调用者提供，fixture 可按原始时间回放。 */
export const 判告警 = (s: 调度状态, 现在: number, 阈值 = 默认阈值, h: 监测历史 = 空历史()): 告警[] => {
    const out: 告警[] = [];
    const 加 = (类: string, 对象: string, 值: number, 阈: number) => { if (值 < 阈)
        return; const 次数 = Math.min(3, 1 + Math.floor(Math.log2(Math.max(1, 值 / 阈)))); if ((h.去重[类 + ':' + 对象] ?? 0) < 次数)
        out.push({ 类, 对象, 值, 阈值: 阈, 次数 }); };
    for (const t of s.票) {
        const c = t.内容, 等 = (现在 - (c?.起 ?? t.时间)) / 1000, d = c?.声明;
        if (c?.等内存起 !== undefined)
            加('等内存', t.名, (现在 - c.等内存起) / 1000, 阈值.内存);
        if ((d?.预计秒 !== undefined && d.预计秒 !== null && d.预计秒 <= 60) || d?.种 === 'still')
            加('小任务等待', t.名, 等, 阈值.小任务);
        加('排队长', t.名, 等, Math.max(阈值.任意, 3 * (d?.预计秒 ?? 0)));
        if (t.文件.includes('放行.排队'))
            加('重任务等待', t.名, 等, 600);
    }
    if (s.票.length >= 阈值.队深 && s.票.length > h.高水位)
        out.push({ 类: '队深', 对象: '全局', 值: s.票.length, 阈值: 阈值.队深, 次数: 1 });
    for (const x of s.持锁) {
        const 已占 = (现在 - x.拿锁时) / 1000, 预计 = x.声明.预计秒;
        加('持锁超时', x.任务, 已占, 预计 ? Math.max(3 * 预计, 预计 + 600) : 1800);
        if (x.死)
            加('持锁者死', x.任务, 1, 1);
        if (x.心跳 && x.总帧 && x.已出帧 < x.总帧)
            加('无帧', x.任务, (现在 - x.帧时) / 1000, 阈值.无帧);
        if (x.声明.连贯 && s.票.some(t => 现在 - (t.内容?.起 ?? t.时间) > 300000))
            加('连贯批', x.任务, 已占, 阈值.批);
    }
    if (h.负载起 !== undefined)
        加('负载', '机器', (现在 - h.负载起) / 1000, 阈值.负载);
    if ((s.机.压力 ?? 0) >= 2)
        加('内存压力', '机器', s.机.压力!, 2);
    const old = h.swap[0];
    if (old && 现在 - old.时 >= 170000)
        加('swap增长', '机器', (s.机.swap ?? 0) - old.量, 2 ** 30);
    加('孤儿Chrome', '机器', h.孤儿轮, 2);
    return out;
};
export const 记录告警 = (e: 调度环境, s: 调度状态, h: 监测历史, alarms: 告警[]) => {
    const 新: 告警[] = [];
    for (const a of alarms) {
        const key = a.类 + ':' + a.对象;
        h.去重[key] = Math.max(h.去重[key] ?? 0, a.次数);
        const id = createHash('sha256').update(key + ':' + (a.类 === '队深' ? a.值 : a.次数)).digest('hex');
        只提示('告警记录', () => {
            const dir = path.join(e.调度目录, '告警');
            fs.mkdirSync(dir, { recursive: true });
            try {
                const fd = fs.openSync(path.join(dir, id), 'wx');
                fs.closeSync(fd);
            }
            catch (err) {
                if ((err as NodeJS.ErrnoException).code === 'EEXIST')
                    return;
                throw err;
            }
            记调度(e.日志目录, '告警', { ...a, 机: { ...s.机, 进程: undefined } }, s.时);
            新.push(a);
        });
    }
    if (alarms.some(a => a.类 === '队深'))
        h.高水位 = Math.max(h.高水位, s.票.length);
    只提示('告警记录', () => 写JSON(path.join(e.调度目录, '监测.json'), h));
    return 新;
};
export const 读监测 = (e: 调度环境) => 读JSON<监测历史>(path.join(e.调度目录, '监测.json')) ?? 空历史();
