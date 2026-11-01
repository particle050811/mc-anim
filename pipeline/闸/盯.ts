import fs from 'node:fs';
import path from 'node:path';
import { 用法错误 } from '../cli/参数.ts';
import { 写JSON, 读JSON, 只提示 } from './文件.ts';
import { 读新事件, type 日志位置, type 调度事件 } from './调度日志.ts';
import { 进程在吗, 试做, 锁文件 } from './锁.ts';
import { 读状态, 一行状态, type 调度状态 } from './看.ts';
import { 监测一轮 } from './告警.ts';
import { 解析票 } from './票.ts';
import type { 调度环境 } from './任务.ts';
export const 到点退出码 = 124;
const 一次最多 = 3;
/** 新会话第一次挂：更早的事当新事件报，只会让人去查不存在的事故。默认挂 29 分钟，30 分钟内的算重挂间隙里该知道的。 */
const 首挂回看毫秒 = 1800_000;
const 该醒 = (e: 调度环境, x: 调度事件) => ['告警', '崩溃', '回收死锁'].includes(x.事) || (['路完', '路败'].includes(x.事) && (x.发起 as { 会话?: string } | undefined)?.会话 === e.发起者.会话);
const 任务结束 = (x: 调度事件, 任务: string) => (x.事 === '任务止' || x.事 === '崩溃') && x.任务 === 任务;
/** 票会改名，一个任务多张票，看 又只显示 #pid：一律按日志里见过的名字解析成任务 id。同 pid 取最新，pid 会复用。 */
const 解析任务 = (目录: string, 目标: string) => {
    const { 行, 末 } = 读新事件(目录), pid = Number(/^#?(\d+)$/.exec(目标)?.[1]);
    const 中 = (x: 调度事件) => [x.任务, x.票, x.原序, x.新序, x.原名, x.新名].includes(目标) || (pid > 0 && ((x.发起 as { pid?: number } | undefined)?.pid === pid || 解析票(String(x.票))?.pid === pid));
    const 任务 = 行.findLast(r => r.事件.任务 && 中(r.事件))?.事件.任务;
    if (!任务)
        throw new 用法错误(`--任务 ${目标} 在调度日志里找不到；要 #pid、任务 id 或票名。旧闸的任务不写日志，用 anim 调度 等 --pid`);
    return { 任务, 已止: 行.findLast(r => 任务结束(r.事件, 任务))?.事件, 位: 末 };
};
const 说事件 = (x: 调度事件) => {
    const 发起 = x.发起 as { pid?: number } | undefined, 声明 = x.声明 as { 段?: string } | undefined, 原 = x.原持有者 as { pid?: number } | undefined;
    const 谁 = x.路 ?? (x.事 === '回收死锁' ? `#${原?.pid ?? '?'}` : x.pid !== undefined ? `#${x.pid} ${x.段 ?? ''}` : x.对象 ?? (发起?.pid ? `#${发起.pid} ${声明?.段 ?? ''}` : x.任务));
    const 尾 = Number(x.次数) > 1 ? ` 第${x.次数}次` : x.退出码 !== undefined ? ` 退出码${x.退出码}` : '';
    return `${x.时.slice(5, 19)}Z ${x.事 === '告警' ? x.类 : x.事} ${String(谁).trim()}${尾}`;
};
const 最重 = (事件们: 调度事件[]) => { const 名 = 事件们.map(x => String(x.事 === '告警' ? x.类 : x.事)); return ['持锁者死', '崩溃', '回收死锁', '内存压力'].find(x => 名.includes(x)) ?? 名[0]; };
export const 盯 = async (e: 调度环境, o: {
    最长?: number;
    任务?: string;
    输出?: (s: string) => void;
    读?: () => 调度状态;
    睡?: (ms: number) => Promise<void>;
    父活?: () => boolean;
} = {}) => {
    const 目标 = o.任务 ? 解析任务(e.日志目录, o.任务) : undefined;
    const 起 = e.现在毫秒(), 父 = process.ppid, live = path.join(e.调度目录, '盯', process.pid + '.json');
    写JSON(live, { pid: process.pid, 会话: e.发起者.会话, 起 });
    // 按会话一份；同会话两只 盯 共用，一件事只醒一只。
    const 名 = `游标-${e.发起者.会话 || '人'}`, 游标文件 = path.join(e.调度目录, 名 + '.json'), 游标锁 = 锁文件(e.调度目录, 名);
    try {
        while ((o.父活 ?? (() => process.ppid === 父 && 进程在吗(父)))()) {
            if (e.现在毫秒() - 起 >= (o.最长 ?? 1740) * 1000)
                return 到点退出码;
            const s = (o.读 ?? (() => 读状态(e)))();
            只提示('监测', () => { 监测一轮(e, s); });
            // 任务结束是这一只 盯 自己要等的，不走共用游标：全局那只读过去了，这只也得醒。
            const 私: 调度事件[] = 目标?.已止 ? [目标.已止] : [];
            if (目标) {
                const { 行, 末 } = 读新事件(e.日志目录, 目标.位);
                目标.位 = 末;
                私.push(...行.filter(r => 任务结束(r.事件, 目标.任务)).map(r => r.事件));
            }
            const 公 = 试做(游标锁, e.本机, () => {
                const 旧 = 读JSON<日志位置>(游标文件), 游标 = typeof 旧?.偏移 === 'number' ? 旧 : null;
                const { 行, 末 } = 读新事件(e.日志目录, 游标);
                const 未读 = 行.filter(r => 该醒(e, r.事件) && !(目标 && 任务结束(r.事件, 目标.任务)) && (游标 || s.时 - Date.parse(r.事件.时) <= 首挂回看毫秒));
                const 报 = 未读.slice(0, Math.max(1, 一次最多 - 私.length)), 余 = 未读.slice(报.length);
                // 没报的留在游标后面，下一只接着报；游标写坏了顶多重报，不能挡住这次叫醒。
                const 新 = 余.length ? 报.at(-1)!.到 : 末;
                if (新.月 !== 游标?.月 || 新.偏移 !== 游标.偏移)
                    只提示('盯游标', () => 写JSON(游标文件, 新));
                return { 报: 报.map(r => r.事件), 余: 余.map(r => r.事件) };
            });
            const 报 = [...私, ...(公?.报 ?? [])], 余 = 公?.余 ?? [];
            if (报.length) {
                (o.输出 ?? console.log)(`${报.map(说事件).join('；')}${余.length ? `；另${余.length}件未报（最重 ${最重(余)}），重挂接着报` : ''} | ${一行状态(s)}`);
                return 0;
            }
            await (o.睡 ?? (ms => new Promise(r => setTimeout(r, ms))))(5000);
        }
        return 0;
    }
    finally {
        fs.rmSync(live, { force: true });
    }
};
