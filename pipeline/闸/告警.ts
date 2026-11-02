import path from 'node:path';
import { 读JSON, 写JSON, 只提示 } from './文件.ts';
import type { 调度状态 } from './看.ts';
import type { 票 } from './票.ts';
import type { 调度环境 } from './任务.ts';
import { 记调度 } from './调度日志.ts';
import { 试做, 锁文件 } from './锁.ts';
export type 告警 = {
    类: string;
    对象: string;
    值: number;
    阈值: number;
    次数: number;
    pid?: number;
    段?: string;
    票?: string;
};
export const 默认阈值 = { 内存: 180, 小任务: 300, 任意: 600, 队深: 4, 无帧: 300, 负载: 180, 批: 1800 };
/** 持锁者每 30 秒采一次，容两次没赶上；再久就不算连续观察到。 */
const 断档毫秒 = 90_000;
/** 条件要持续消失这么久才算事件结束：压力这类读数来回跳时，一跳一叫醒比晚 5 分钟复位更糟。 */
const 复位毫秒 = 300_000;
export type 监测历史 = {
    上次?: number;
    负载起?: number;
    swap: {
        时: number;
        量: number;
    }[];
    孤儿轮: number;
    高水位: number;
    /** 进行中的事件：已通知到第几次、条件最后一次成立的时刻。 */
    去重: Record<string, {
        次数: number;
        末: number;
    }>;
};
export const 空历史 = (): 监测历史 => ({ swap: [], 孤儿轮: 0, 高水位: 0, 去重: {} });
const 键 = (a: 告警) => a.类 + ':' + a.对象;
/** 暂缓是主 Agent 的决定，不是卡住；到期后票主人重置等待起点，别的进程可能先看到过期的暂缓至，所以不比时刻。死票没人在等。 */
const 在等 = (t: 票) => !t.内容?.暂缓至 && !t.死;
/** 此刻成立的全部条件，不管通知过没有。 */
const 判条件 = (s: 调度状态, 现在: number, 阈值: typeof 默认阈值, h: 监测历史): 告警[] => {
    const out: 告警[] = [];
    const 加 = (类: string, 对象: string, 值: number, 阈: number, 附: Pick<告警, 'pid' | '段' | '票'> = {}) => { if (值 >= 阈)
        out.push({ 类, 对象, 值, 阈值: 阈, 次数: Math.min(3, 1 + Math.floor(Math.log2(Math.max(1, 值 / 阈)))), ...附 }); };
    const 待 = s.票.filter(在等);
    for (const t of 待) {
        const c = t.内容, 等 = (现在 - (c?.起 ?? t.时间)) / 1000, d = c?.声明, 预计 = d?.预计秒 ?? null;
        // 改序会换票名，对象用任务 id（旧票不能改序，没有任务 id）。
        const 对象 = c?.任务 ?? t.名, 附 = { pid: t.pid, 段: d?.段, 票: t.名 };
        if (c?.等内存起 !== undefined)
            加('等内存', 对象, (现在 - c.等内存起) / 1000, 阈值.内存, 附);
        if (预计 === null ? d?.种 === 'still' : 预计 <= 60)
            加('小任务等待', 对象, 等, 阈值.小任务, 附);
        加('排队长', 对象, 等, Math.max(阈值.任意, 3 * (预计 ?? 0)), 附);
        if (t.文件.includes('放行.排队'))
            加('重任务等待', 对象, 等, 600, 附);
    }
    if (待.length >= 阈值.队深)
        out.push({ 类: '队深', 对象: '全局', 值: 待.length, 阈值: 阈值.队深, 次数: 1 });
    for (const x of s.持锁) {
        // 多段 render 共用一个任务，只用任务 id 时后面段的卡死会被前面段的告警吞掉。
        const 对象 = `${x.任务}/${x.声明.段 ?? x.票}`, 附 = { pid: x.pid, 段: x.声明.段, 票: x.票 };
        if (x.死) {
            加('持锁者死', 对象, 1, 1, 附);
            continue;
        }
        const 已占 = (现在 - x.拿锁时) / 1000, 预计 = x.声明.预计秒;
        加('持锁超时', 对象, 已占, 预计 ? Math.max(3 * 预计, 预计 + 600) : 1800, 附);
        if (x.心跳 && x.总帧 && x.已出帧 < x.总帧)
            加('无帧', 对象, (现在 - x.帧时) / 1000, 阈值.无帧, 附);
        if (x.声明.连贯 && 待.some(t => 现在 - (t.内容?.起 ?? t.时间) > 300000))
            加('连贯批', 对象, 已占, 阈值.批, 附);
    }
    if (h.负载起 !== undefined)
        加('负载', '机器', (现在 - h.负载起) / 1000, 阈值.负载);
    if ((s.机.压力 ?? 0) >= 2)
        加('内存压力', '机器', s.机.压力!, 2);
    const old = h.swap.findLast(x => 现在 - x.时 >= 170000);
    if (old && s.机.swap !== null)
        加('swap增长', '机器', s.机.swap - old.量, 2 ** 30);
    加('孤儿Chrome', '机器', h.孤儿轮, 2);
    return out;
};
export const 更新历史 = (s: 调度状态, h: 监测历史, 阈值 = 默认阈值): 监测历史 => {
    const 断 = h.上次 !== undefined && s.时 - h.上次 > 断档毫秒, { 负载, 核, 孤儿, swap } = s.机;
    const 旧负载起 = 断 ? undefined : h.负载起, 旧孤儿轮 = 断 ? 0 : h.孤儿轮;
    const n: 监测历史 = { 上次: s.时,
        // 读不到时不下结论：既不算过载，也不算恢复。
        负载起: 负载 === null ? 旧负载起 : 负载 > 核 * 2 ? (旧负载起 ?? s.时) : undefined,
        孤儿轮: 孤儿 === null ? 旧孤儿轮 : 孤儿 ? 旧孤儿轮 + 1 : 0,
        // 比 3 分钟多留 30 秒：持锁者 30 秒一采，定时器稍晚就会挤掉 180 秒前那个样本，再也凑不够窗口。
        swap: [...(断 ? [] : h.swap.filter(x => s.时 - x.时 <= 210000)), ...(swap === null ? [] : [{ 时: s.时, 量: swap }])],
        高水位: s.票.some(在等) ? h.高水位 : 0, 去重: {} };
    const 成立 = new Set(判条件(s, s.时, 阈值, n).map(键));
    for (const [k, v] of Object.entries(h.去重))
        // 这么久没见它成立（消失了，或这段时间没人采样）就算结束，此刻再成立是新事件。
        if (s.时 - v.末 < 复位毫秒)
            n.去重[k] = 成立.has(k) ? { ...v, 末: s.时 } : v;
    return n;
};
/** 不读盘、不取时钟；历史与阈值都由调用者提供，fixture 可按原始时间回放。 */
export const 判告警 = (s: 调度状态, 现在: number, 阈值 = 默认阈值, h: 监测历史 = 空历史()): 告警[] => 判条件(s, 现在, 阈值, h).filter(a => a.类 === '队深' ? a.值 > h.高水位 : a.次数 > (h.去重[键(a)]?.次数 ?? 0));
export const 记录告警 = (e: 调度环境, s: 调度状态, h: 监测历史, alarms: 告警[]) => {
    for (const a of alarms) {
        if (a.类 === '队深')
            h.高水位 = Math.max(h.高水位, a.值);
        else
            h.去重[键(a)] = { 次数: a.次数, 末: s.时 };
        记调度(e.日志目录, '告警', { ...a, 机: { ...s.机, 进程: undefined } }, s.时);
    }
    只提示('告警记录', () => 写JSON(path.join(e.调度目录, '监测.json'), h));
    return alarms;
};
export const 读监测 = (e: 调度环境) => 读JSON<监测历史>(path.join(e.调度目录, '监测.json')) ?? 空历史();
/** 读历史、判、记、写回在一把短锁里做完，多个等待者和 盯 不会重复记同一条。锁被人拿着就跳过：他手里是同一时刻的快照。 */
export const 监测一轮 = (e: 调度环境, s: 调度状态) => 试做(锁文件(e.调度目录, '监测'), e.本机, () => {
    const h = 更新历史(s, 读监测(e));
    return 记录告警(e, s, h, 判告警(s, s.时, undefined, h));
}) ?? [];
