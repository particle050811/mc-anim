import {持有者,持有者主机,进程起于} from './锁.ts';
import fs from 'node:fs';
import path from 'node:path';
import { 用法错误, type 已解析 } from '../cli/参数.ts';
import { 读状态, 一行状态, type 调度状态 } from './看.ts';
import { 列票, 改序, 回队尾, 主机片段, 写票, 记被越, type 票, type 票内容 } from './票.ts';
import { 写JSON, 读JSON, 只提示 } from './文件.ts';
import { 记调度, 读调度 } from './调度日志.ts';
import { 写指令, 删指令, 令文件 } from './指令.ts';
import { 清孤儿 } from './孤儿.ts';
import type { 调度环境 } from './任务.ts';
import { isWindows } from '../环境/配置.ts';
export const 改命令 = new Set(['先', '后', '恢复', '放行', '让路', '取消', '清孤儿', '记']);
export const 改调度 = (cmd: string, 目标: string | undefined, p: 已解析, e: 调度环境, o: {
    状态?: () => 调度状态;
    杀?: (pid: number, sig: NodeJS.Signals) => void;
    进程起于?: (pid: number) => number | null;
    清?: () => unknown[];
    输出?: (s: string) => void;
    Windows?: boolean;
} = {}) => {
    const why = p.值['--为什么']?.trim();
    if (!why)
        throw new 用法错误(`${cmd} 必须带 --为什么`);
    const 输出 = o.输出 ?? console.log, s = (o.状态 ?? (() => 读状态(e)))();
    const 中 = (name: string, pid: number) => 目标 === name || 目标 === `#${pid}` || 目标 === String(pid);
    const tickets = s.票.filter(t => 中(t.名, t.pid)), held = s.持锁.filter(t => 中(t.票, t.pid)), 唯一 = tickets.length + held.length === 1;
    const t = 唯一 ? tickets[0] : undefined, h = 唯一 ? held[0] : undefined, 任务 = t?.内容?.任务 ?? h?.任务;
    // 记解析后的任务和票，#pid 配不上告警，票名改序后也配不上。
    const 记 = (结果?: string) => 记调度(e.日志目录, '决定', { 结果, 任务, 票: t?.名 ?? h?.票, 目标, 谁: e.发起者, 发起: e.发起者, 看到: { 人工:p.值['--看到'],摘要: 一行状态(s), 队: s.票.slice(0, 3).map(t => ({ 票: t.名, 声明: t.内容?.声明 })), 持锁: s.持锁.map(t => ({ pid: t.pid, 任务: t.任务, 票: t.票 })) }, 决定: p.值['--决定'] ?? `${cmd} ${目标 ?? ''}`, 为什么: why, 机: { ...s.机, 进程: undefined } }, e.现在毫秒());
    if (e.发起者.子会话 || e.发起者.代理标.endsWith('_agent'))
        console.error('!! 当前环境标记为子代理；改调度应由主 Agent 决定，身份事实已入日志');
    if (cmd === '记') {
        记();
        return;
    }
    if (cmd === '清孤儿') {
        记();
        for (const x of (o.清 ?? 清孤儿)())
            记调度(e.日志目录, '清孤儿', { 进程: x, 为什么: why }, e.现在毫秒());
        return;
    }
    if (!目标)
        throw new 用法错误(`${cmd} 要指定完整票名或 #pid`);
    if (!唯一)
        throw new 用法错误(`目标不存在或不唯一：${目标}；用完整票名`);
    const pid = t?.pid ?? h!.pid;
    if (t && t.主机 !== 主机片段(e.本机))
        throw new 用法错误('不能从本机改另一主机的票');
    if (h && h.发起.pid !== pid)
        throw new 用法错误('锁信息与 pid 不符，请重看调度');
    if(h){for(const n of ['渲染','放行']){const file=path.join(e.锁目录,n+'.lock');if(持有者(file)===pid){const host=持有者主机(file,pid);if(host&&host!==e.本机)throw new 用法错误('不能从本机操作另一主机的持锁者');}}}
    if (cmd !== '取消' && (t?.死 || h?.死))
        throw new 用法错误(`#${pid} 的进程已不在，${cmd} 没有意义；留下的票或锁由下一个等待者回收`);
    const 分钟 = Number(p.值['--分钟'] ?? 30);
    if (!Number.isFinite(分钟) || 分钟 <= 0)
        throw new 用法错误('--分钟 要是正数');
    const 至 = e.现在毫秒() + 分钟 * 60000;
    if (cmd === '取消') {
        // 写全名取消一张残留票也可能杀到持锁者，同样要确认。
        if ((h || s.持锁.some(x => x.pid === pid && !x.死)) && !p.开关.has('--杀持锁'))
            throw new 用法错误('目标正在持锁；确认中断请加 --杀持锁');
        const 称 = h ? '锁' : '票', 未发 = () => { const 话 = `未发信号：进程已不在，留下的${称}由下一个等待者回收`; 记(话); 输出(话); };
        if (h?.死 || t?.死) {
            未发();
            return;
        }
        // 信号不能撤回，这里不用判死时的余量：只要启动晚于拿锁、领票就不是原来那个进程。
        const 声称 = h ? h.拿锁时 : t!.内容?.起 ?? t!.时间, 起于 = (o.进程起于 ?? 进程起于)(pid);
        if (起于 !== null && 起于 > 声称) {
            const 话 = `未发信号：pid ${pid} 已换人（${new Date(起于).toISOString()} 才启动，晚于${h ? '拿锁' : '领票'} ${new Date(声称).toISOString()}），原进程已不在；留下的${称}由下一个等待者回收`;
            记(话);
            输出(话);
            return;
        }
        if (起于 === null)
            console.error('!! 读不到进程启动时刻（没有 ps），只凭 pid 和开机时间核对');
        const sig = p.开关.has('--强') ? 'SIGKILL' : 'SIGTERM';
        if (任务)
            写指令(e, 任务, { 动作: '取消', 为什么: why, 时: e.现在毫秒(), 任务 });
        try {
            (o.杀 ?? ((n, sig) => { process.kill(n, sig); }))(pid, sig);
        }
        catch (err) {
            if (任务)
                删指令(e, 任务);
            const code = (err as NodeJS.ErrnoException).code;
            if (code === 'ESRCH') {
                未发();
                return;
            }
            const 话 = `信号失败：${sig} #${pid} ${code ?? (err as Error).message}`;
            记(话);
            throw Error(话);
        }
        记(`已发 ${sig}`);
        记调度(e.日志目录, '取消', { 任务, 票: t?.名 ?? h?.票, 目标: pid, 信号: sig, 为什么: why, 谁: e.发起者 }, e.现在毫秒());
        // Windows 上 process.kill 是无条件终止，退出钩子不跑。
        输出(`已请求 ${sig} #${pid}；${o.Windows ?? isWindows ? `Windows 上是立即终止：目标不放锁、不写日志、不打印原因，${称}等下一个等待者回收，它的 Chrome 查不到，要手动看` : t && !t.内容 || h?.旧 ? '旧代码不能打印取消原因' : '不要原样重发'}`);
        return;
    }
    if (cmd === '让路') {
        if (!h?.声明.可让路)
            throw new 用法错误('不能让路，只能等或取消：单项或旧式整批没有让路点');
        写指令(e, 任务!, { 动作: '让路', 为什么: why, 时: e.现在毫秒(), 至, 票: h.票, 任务 });
        记();
        记调度(e.日志目录, '让路', { 票: h.票, 任务, 至, 为什么: why }, e.现在毫秒());
        输出('当前段不中断；下一张票暂缓领，到期回队尾');
        return;
    }
    if (!t)
        throw new 用法错误(`${cmd} 只能操作排队票`);
    if (!t.内容)
        throw new 用法错误('旧票拒绝改名或放行：旧代码不认指令，只能等或取消');
    if (cmd === '放行') {
        写指令(e, 任务!, { 动作: '放行', 为什么: why, 强: p.开关.has('--强'), 时: e.现在毫秒(), 至, 票: t.名, 任务 });
        // 快照之后票主人可能已拿锁、用掉放行，这条指令就没人删了，同任务下一段会继承。票主人删票在先、用掉在后：写完还看得到这张票，就一定会被用掉。
        if (!fs.existsSync(t.文件)) {
            删指令(e, 任务!);
            const 话 = `未放行：票 ${t.名} 已不在，可能刚拿到锁、改了序或退出了，请重看调度`;
            记(话);
            throw new 用法错误(话);
        }
        记();
        输出(`单票授权已写，${new Date(至).toISOString()} 到期作废（--分钟 可改）；压力 4 仍需 --强，下一张票不继承`);
        return;
    }
    const 原 = t.名, 回原序 = p.开关.has('--原序');
    if (cmd === '恢复' && (回原序 ? !t.内容.原序 : !t.内容.暂缓至))
        throw new 用法错误(回原序 ? `票 ${t.名} 没改过序，没有原序可回` : `票 ${t.名} 没在暂缓，没有可恢复的；回原位用 --原序`);
    // 先改名再写内容：票主人可能刚拿到锁删了票，改名失败就停，写旧路径会把票复活。
    let 新: 票;
    try {
        新 = cmd === '后' ? 改序(t, String(900000000000000 + e.现在毫秒()))
            : cmd === '先' ? 改序(t, String(Math.max(1, Math.min(...列票(path.dirname(t.文件)).filter(x => !x.名.startsWith('9')).map(x => x.时间), Date.now()) - 1)))
                : 回原序 ? 改序(t, t.内容.原序!) : 回队尾(t);
    }
    catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
            throw err;
        throw new 用法错误(`票 ${t.名} 已不在：可能刚拿到锁或退出了，请重看调度`);
    }
    // 快照早于读机器，票主人这期间可能写了 等内存起、卡在。改名后它不再往旧名写，这时重读才不会盖掉。
    新.内容 = 读JSON<票内容>(新.文件) ?? 新.内容;
    // 往前移才算越过别人：先、恢复 --原序。
    if (新.名 < 原)
        只提示('被越计数', () => 记被越(列票(path.dirname(新.文件)).filter(q => q.名 > 新.名 && q.名 < 原), e.本机));
    if (cmd !== '恢复')
        新.内容!.原序 ??= String(t.时间);
    if (cmd === '后') {
        新.内容!.暂缓至 = 至;
        新.内容!.暂缓因 = why;
    }
    else if (新.内容!.暂缓至) {
        delete 新.内容!.暂缓至;
        delete 新.内容!.暂缓因;
        新.内容!.起 = e.现在毫秒();
    }
    写票(新);
    记();
    记调度(e.日志目录, cmd === '先' ? '改序' : cmd === '后' ? '暂缓' : '恢复', { 任务, 票: 新.名, 原序: 原, 新序: 新.名, 至: cmd === '后' ? 至 : undefined, 为什么: why }, e.现在毫秒());
    输出(新.名);
};
export const 路命令 = (args: string[], p: 已解析, e: 调度环境, 输出: (s: string) => void) => {
    const [动作, 路] = args;
    if (动作 === '看') {
        const 最新 = new Map<string, unknown>();
        for (const x of 读调度(e.日志目录).filter(x => /^路[开完败]$/.test(x.事)))
            最新.set(String(x.路), x);
        输出(JSON.stringify([...最新.values()], null, 2));
        return;
    }
    if (!['开', '完', '败'].includes(动作 ?? '') || !路)
        throw new 用法错误('用法：调度 路 开|完|败 <路名> [--说明 …]，或 路 看');
    记调度(e.日志目录, '路' + 动作, { 路, 发起: e.发起者, 说明: p.值['--说明'], 结果: p.值['--结果'] }, e.现在毫秒());
};
/** 动作写成明确字段：从自由文本猜，「不用让路了」也会触发退出。 */
export const 令命令 = (args: string[], p: 已解析, e: 调度环境, 输出: (s: string) => void) => {
    const [路, ...多余] = args, 因 = p.值['--让路']?.trim(), 撤 = p.开关.has('--撤'), now = e.现在毫秒();
    if (!路 || 多余.length || Boolean(因) === 撤)
        throw new 用法错误('用法：调度 令 <路名> --让路 "原因"，或 令 <路名> --撤');
    const file = 令文件(e, 路);
    if (撤) {
        const 有 = fs.existsSync(file);
        fs.rmSync(file, { force: true });
        记调度(e.日志目录, '令', { 路, 动作: '撤', 发起: e.发起者 }, now);
        输出(有 ? `已撤 ${路} 的令` : `${路} 没有令，无事可撤`);
        return;
    }
    const 至 = now + 1800000;
    写JSON(file, { 动作: '让路', 为什么: 因, 时: now, 至 });
    记调度(e.日志目录, '令', { 路, 动作: '让路', 为什么: 因, 至, 发起: e.发起者 }, now);
    输出(`${路} 排队中的任务退出 75，不算失败；${new Date(至).toISOString()} 失效，提前撤用 --撤`);
};
