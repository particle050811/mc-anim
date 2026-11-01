// GPU 位容量 1；用户 11-01 定：等内存不持锁，人工放行只作用一票。
// 30%、负载核×0.8、60 秒是 Agent 选的阈值，不冒称用户定值。
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { 配置 } from '../环境/配置.ts';
import { 内存够渲染, 读内存, 读压力, 读数说明, 核数, 一分钟负载, type 内存读数 } from '../环境/资源.ts';
import { 持有者, 试拿, 放, 进程在吗, 回收死锁, 锁被占 } from './锁.ts';
import { 登记收尾 } from './收尾.ts';
import { 取调度环境, 开任务, 有任务, 清崩溃, type 调度环境, type 任务声明 } from './任务.ts';
import { 领票, 列票, 票活着, type 票, 回队尾, 改序, 写票, 清任务票, 记被越 } from './票.ts';
import { 写JSON, 读JSON, 只提示 } from './文件.ts';
import { 清孤儿 } from './孤儿.ts';
import { 读状态 } from './看.ts';
import { 监测一轮 } from './告警.ts';
import { 读机器快照, type 机器快照 } from './机器.ts';
import { 估计 } from './估计.ts';
import { 取指令, 取放行, 用掉放行, 删指令, 路让路, 调度让路, 失败退出码 } from './指令.ts';
export type { 任务声明 } from './任务.ts';
export { 闸记被杀, 登记临时文件 } from './收尾.ts';
export const 祖先持锁变量 = 'MCAI_RENDER_LOCK_PID';
const 持锁上下文 = new AsyncLocalStorage<锁柄>();
const 串行 = new Map<string, Promise<void>>();
const 睡 = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
export type 闸环境 = 调度环境 & {
    内存下限: number;
    读内存: () => 内存读数 | null;
    读压力: () => number | null;
    一分钟负载: () => number | null;
    核数: () => number;
    睡: (ms: number) => Promise<void>;
    排队间隔毫秒?: number;
    清孤儿: () => unknown[];
    读机器: () => 机器快照;
};
export const 取环境 = (e: Partial<闸环境> = {}): 闸环境 => ({ ...取调度环境(e), 内存下限: e.内存下限 ?? Number(配置('渲染内存下限')), 读内存: e.读内存 ?? 读内存, 读压力: e.读压力 ?? 读压力,
    一分钟负载: e.一分钟负载 ?? 一分钟负载, 核数: e.核数 ?? 核数, 睡: e.睡 ?? 睡, 排队间隔毫秒: e.排队间隔毫秒 ?? 1000,
    // 注入锁目录的调用必须显式注入进程清理，测试不能碰真 Chrome。
    读机器: e.读机器 ?? (e.锁目录 ? () => ({ 负载: 0, 核: 10, 闸: null, 压力: null, free: null, 压缩: null, swap: null, 换出: null, GPU: null, 热: null, 盘: null, 孤儿: 0, 进程: '' }) : 读机器快照),
    清孤儿: e.清孤儿 ?? (e.锁目录 ? () => [] : 清孤儿) });
export type 锁柄 = {
    文件: string;
    票: string;
    任务: string;
    声明: 任务声明;
    拿锁时: number;
    放: (结果?: string) => void;
    心跳: (帧?: number) => void;
};
type 排队选项 = Partial<闸环境> & {
    间隔毫秒?: number;
    等待提示?: (s: string) => void;
    准入?: (票: 票) => boolean;
    越队?: (票: 票) => boolean;
    声明?: 任务声明;
    锁内复核?: (票: 票) => boolean;
    /** 这一轮没轮到或锁被活进程拿着，准入没被调：等资源的状态要结束，等的是锁或队列。 */
    离开准入?: (票: 票) => void;
    /** 这次排队里等内存的累计秒，写进拿锁事件。 */
    等内存秒?: () => number;
};
const 写票态 = (t: 票) => 只提示('票状态', () => 写票(t));
/** 进日志的读数。进程表太大不进；读不到不能影响过闸。 */
const 机读数 = (e: 闸环境) => { try {
    const { 进程: _, ...m } = e.读机器();
    return m;
}
catch {
    return undefined;
} };
export const 排队拿 = async (名: string, opts: 排队选项 = {}): Promise<锁柄> => {
    检查重入();
    const e = 取环境(opts), key = path.join(e.锁目录, 名), 前 = 串行.get(key) ?? Promise.resolve();
    let 交棒!: () => void;
    const 完 = new Promise<void>(r => { 交棒 = r; });
    串行.set(key, 完);
    const 交接 = () => { 交棒(); if (串行.get(key) === 完)
        串行.delete(key); };
    await 前;
    const file = path.join(e.锁目录, 名 + '.lock'), 信息文件 = file + '.信息.json', dir = path.join(e.锁目录, 名 + '.排队');
    const 放掉 = () => {
        只提示('信息文件', () => { if (持有者(file) === process.pid)
            fs.rmSync(信息文件, { force: true }); });
        只提示('放锁', () => 放(file));
    };
    let 任务柄: ReturnType<typeof 开任务> | undefined, 自建 = false, 清票 = () => { }, 撤票 = () => { };
    // 到返回柄为止任何一步抛错都要放锁、交棒，否则同进程下一次过闸永远挂在 await 前。
    try {
        自建 = !有任务(e.锁目录);
        const 声明 = opts.声明 ?? { 种: process.argv[2] ?? '脚本', 用途: process.env.ANIM_PURPOSE ?? '未声明' };
        声明.种 ??= process.argv[2] ?? '脚本';
        声明.用途 ??= process.env.ANIM_PURPOSE ?? '未声明';
        声明.预计秒 ??= 估计(声明, path.dirname(e.日志目录));
        const task = 任务柄 = 开任务(e, 声明);
        清票 = () => 只提示('删票', () => 清任务票(dir, task.info.任务));
        清票();
        let t = 领票(dir, e.本机, { ...task.info, 声明 }, e.现在毫秒());
        task.更新(声明, t.名, '排队');
        const 让路 = 取指令(e, task.info.任务);
        if (让路?.动作 === '让路' && 让路.至 && 让路.至 > e.现在毫秒() && 让路.票 !== t.名) {
            t.内容!.暂缓至 = 让路.至;
            t.内容!.原序 = String(t.时间);
            t = 改序(t, String(900000000000000 + e.现在毫秒()));
            写票态(t);
            console.error(`== 调度让路：${让路.为什么}；下一张票暂缓至 ${new Date(让路.至).toISOString()}`);
            删指令(e, task.info.任务);
        }
        const 起 = e.现在毫秒();
        let 原等待 = '', 上次监测 = 0;
        const 记 = (事: string, 字段: Record<string, unknown> = {}) => task.记(事, { 票: t.名, 锁: 名, 声明, ...字段 });
        const 监测 = () => { if (e.现在毫秒() - 上次监测 < 3000)
            return; 上次监测 = e.现在毫秒(); 只提示('监测', () => { 监测一轮(e, 读状态(e, e.读机器, false)); }); };
        const 清 = () => 只提示('清孤儿', () => { for (const p of e.清孤儿())
            记('清孤儿', { 进程: p }); });
        const 回收 = (pid: number | null) => {
            const info = 读JSON<{ pid: number }>(信息文件);
            记('回收死锁', { 原持有者: info?.pid === pid ? info : { pid } });
            清();
        };
        const 歇 = () => e.睡(opts.间隔毫秒 ?? e.排队间隔毫秒 ?? 1000);
        const 队况 = () => { const 全 = 列票(dir); return { 深度: 全.filter(x => x.名 !== t.名).length, 前面: 全.filter(x => x.名 < t.名).slice(0, 3).map(x => x.名), 持锁: 持有者(file) }; };
        撤票 = 登记收尾(清票);
        记('领票', { 队: 队况(), 机: 机读数(e) });
        for (;;) {
            const 令 = 路让路(e);
            if (令) {
                console.error(`被路令让路：${令}，不要原样重发（退出 75，不算失败）`);
                throw new 调度让路(令);
            }
            清崩溃(e);
            监测();
            // 每个等待者每轮都回收，不看队位和准入：只靠队首的话，全队暂缓时没人回收。
            只提示('回收死锁', () => 回收死锁(file, e.本机, 回收));
            const 我的 = 列票(dir).filter(x => x.内容?.任务 === task.info.任务 && x.pid === process.pid);
            // 写旧路径和改名撞上时会出两张：改名后的那张才算数。
            const 找 = 我的.find(x => x.名 !== t.名) ?? 我的[0];
            for (const x of 我的)
                if (x !== 找)
                    只提示('删票', () => fs.rmSync(x.文件, { force: true }));
            if (找)
                t = 找;
            else {
                const 原 = t.名;
                t = 领票(dir, e.本机, { ...task.info, 声明 }, e.现在毫秒());
                记('票丢失', { 原名: 原, 新名: t.名 });
            }
            if (t.内容?.暂缓至 && t.内容.暂缓至 <= e.现在毫秒()) {
                try {
                    t = 回队尾(t);
                }
                catch {
                    await 歇();
                    continue;
                }
                delete t.内容!.暂缓至;
                t.内容!.起 = e.现在毫秒();
                写票态(t);
                记('恢复', { 原因: '暂缓到期回队尾' });
            }
            try {
                fs.utimesSync(t.文件, new Date(), new Date());
            }
            catch {
                await 歇();
                continue;
            }
            const 活: 票[] = [];
            for (const q of 列票(dir)) {
                if (票活着(q, e.本机))
                    活.push(q);
                else {
                    try {
                        fs.unlinkSync(q.文件);
                        记('清死票', { 原信息: q });
                        清();
                    }
                    catch { /* 另一读者先回收 */ }
                }
            }
            const 授权 = 取指令(e, task.info.任务);
            if (授权?.动作 === '放行' && (授权.至 ?? 0) <= e.现在毫秒()) {
                console.error(`!! 放行授权已过期（${授权.为什么}）：这张票回到正常判断，还要放行请重发`);
                记('放行过期', { 至: 授权.至, 为什么: 授权.为什么 });
                删指令(e, task.info.任务);
            }
            const 越 = opts.越队?.(t) ?? false;
            const 暂缓 = Boolean(t.内容?.暂缓至 && t.内容.暂缓至 > e.现在毫秒());
            const 轮到 = 越 || (!暂缓 && 活[0]?.名 === t.名), 占 = 锁被占(file, e.本机);
            if (轮到 && !占) {
                if ((opts.准入?.(t) ?? true) && 试拿(file, e.本机, 回收)) {
                    if (!opts.锁内复核 || opts.锁内复核(t))
                        break;
                    放(file);
                }
            }
            else
                opts.离开准入?.(t);
            const 等待 = 暂缓 ? `暂缓至 ${new Date(t.内容!.暂缓至!).toISOString()}` : 占 ? `锁在 pid ${持有者(file) ?? '?'} 手里` : 轮到 ? '等资源' : '前面还有人排队';
            if (等待 !== 原等待) {
                opts.等待提示?.(等待);
                记('排队', { 等谁: 持有者(file), 前面: 活.slice(0, 3).map(x => x.名), 状态: 等待 });
                原等待 = 等待;
            }
            await 歇();
        }
        const 拿锁时 = e.现在毫秒();
        task.更新(声明, t.名, '持锁');
        // 正常轮到时前面没有活票；还有的就是被放行越过了。
        只提示('被越计数', () => 记被越(列票(dir).filter(q => q.名 < t.名), e.本机));
        记('拿锁', { 等锁秒: (拿锁时 - 起) / 1000, 等内存秒: opts.等内存秒?.() ?? 0, 被越次数: t.内容?.已被越 ?? 0, 队: 队况(), 机: 机读数(e) });
        清票();
        撤票();
        let 最近写 = 0, 已出帧 = 0, 帧时 = 拿锁时, 完了 = false;
        const 心跳 = (帧?: number) => {
            if (帧 !== undefined && 帧 !== 已出帧) {
                已出帧 = 帧;
                帧时 = e.现在毫秒();
            }
            if (最近写 && e.现在毫秒() - 最近写 < 5000)
                return;
            最近写 = e.现在毫秒();
            只提示('信息文件', () => 写JSON(信息文件, { pid: process.pid, 任务: task.info.任务, 票: t.名, 发起: task.info.发起, 声明, 拿锁时, 心跳: 最近写, 帧时, 已出帧, 总帧: 声明.帧数 }));
        };
        心跳();
        const 限时 = Number(process.env.ANIM_TIME_LIMIT);
        const 限时器 = 名 === '渲染' && 限时 > 0 ? setTimeout(() => { 记('限时杀', { 限时, 已跑秒: (e.现在毫秒() - task.info.起) / 1000 }); process.exit(124); }, 限时 * 1000) : undefined;
        限时器?.unref();
        const timer = setInterval(() => { 心跳(); 监测(); }, 30000);
        timer.unref();
        const 撤锁 = 登记收尾((_, sig) => 释放(sig ? '被杀' : '退出'));
        const 释放 = (结果 = '成') => {
            if (完了)
                return;
            完了 = true;
            clearInterval(timer);
            clearTimeout(限时器);
            撤锁();
            const 中断 = 结果 === '被杀' || 结果 === '退出';
            // 中断时在退出钩子里，不开子进程读内存，要快。被杀事件靠 当时 说明，所以不清。
            记('放锁', { 持锁秒: (e.现在毫秒() - 拿锁时) / 1000, 结果, 已出帧, 队: 队况(), 机: 中断 ? { 负载: e.一分钟负载() } : 机读数(e) });
            if (!中断)
                task.更新(声明, t.名, '');
            // 持锁期间 anim 调度 的改名可能和删票撞上，留下的票会挡住后来者，放锁前再扫一次。
            清票();
            放掉();
            交接();
            if (自建 && !中断)
                task.结束(结果 === '成' ? 0 : 1);
        };
        return { 文件: file, 票: t.名, 任务: task.info.任务, 声明, 拿锁时, 放: 释放, 心跳 };
    }
    catch (err) {
        清票();
        撤票();
        放掉();
        交接();
        任务柄?.更新(任务柄.info.声明, 任务柄.info.票, '');
        if (自建)
            任务柄?.结束(失败退出码(err));
        throw err;
    }
};
export const 闸心跳 = (帧?: number) => 持锁上下文.getStore()?.心跳(帧);
export const 当前票 = () => 持锁上下文.getStore()?.票;
const 检查重入 = () => { if (持锁上下文.getStore())
    throw Error('禁止嵌套过闸：当前调用已经持有渲染锁'); const pid = Number(process.env[祖先持锁变量]); if (pid && pid !== process.pid && 进程在吗(pid))
    throw Error(`祖先 pid ${pid} 持有渲染锁，子进程不能再次过闸`); };
const 拿渲染闸 = async (提示: (s: string) => void, 环境: Partial<闸环境>, 声明: 任务声明): Promise<锁柄> => {
    const e = 取环境(环境);
    let 单票读数: Record<string, unknown> | undefined, 卡: '' | '内存' | '负载' = '', 卡起 = 0, 告警过 = false, 等内存秒 = 0;
    const 止卡 = (t: 票) => {
        if (!卡)
            return;
        const 秒 = (e.现在毫秒() - 卡起) / 1000;
        if (卡 === '内存')
            等内存秒 += 秒;
        开任务(e, 声明).记(`等${卡}止`, { 票: t.名, 锁: '渲染', 秒, 机: 机读数(e) });
        卡 = '';
        告警过 = false;
        delete t.内容!.等内存起;
        delete t.内容!.卡在;
        写票态(t);
    };
    const 柄 = await 排队拿('渲染', { ...e, 声明, 等待提示: s => 提示(`渲染排队（${s}）`), 越队: t => Boolean(取放行(e, t.内容!.任务)), 离开准入: 止卡, 等内存秒: () => 等内存秒, 准入: t => {
            if (声明.不开渲染)
                return true;
            const m = e.读内存(), 压力 = e.读压力(), 授权 = 取放行(e, t.内容!.任务), load = 声明.需负载 ? e.一分钟负载() : null;
            const 内存过 = (压力 !== 4 || 授权?.强) && (授权 || !m || 内存够渲染(m, e.内存下限));
            const 负载过 = 授权 || load === null || load < e.核数() * 0.8;
            const 新 = !内存过 ? '内存' : !负载过 ? '负载' : '';
            if (新 !== 卡) {
                止卡(t);
                if (新) {
                    卡 = 新;
                    卡起 = e.现在毫秒();
                    t.内容!.卡在 = 新;
                    if (新 === '内存') {
                        t.内容!.等内存起 = 卡起;
                        提示(`渲染等内存（${m ? 读数说明(m) : '无读数'}，下限 ${e.内存下限}%，压力 ${压力 ?? '?'}）`);
                        开任务(e, 声明).记('等内存起', { 票: t.名, 锁: '渲染', 读数: m, 压力, 阈值: e.内存下限, 机: 机读数(e) });
                    }
                    else {
                        提示(`渲染等负载（${load}，上限 ${e.核数()}×0.8）`);
                        开任务(e, 声明).记('等负载起', { 票: t.名, 锁: '渲染', 负载: load, 机: 机读数(e) });
                    }
                    写票态(t);
                }
            }
            if (卡 === '内存' && !告警过 && e.现在毫秒() - 卡起 >= 180000) {
                提示(`告警：等内存已满 3 分钟，票 ${t.名}；锁未占用，请主 Agent 决定`);
                告警过 = true;
            }
            if (!新 && 授权)
                单票读数 = { 票: t.名, 压力, 读数: m, 强: 授权.强 };
            return !新;
        } });
    if (单票读数)
        开任务(e, 声明).记('单票放行', 单票读数);
    提示('放行渲染');
    用掉放行(e, 柄.任务);
    return 柄;
};
export const 过渲染闸 = async <T>(fn: () => Promise<T>, 提示: (s: string) => void = s => console.error(`== 资源闸：${s}`), 环境: Partial<闸环境> = {}, 声明: 任务声明 = {}): Promise<T> => {
    检查重入();
    const 柄 = await 拿渲染闸(提示, 环境, 声明);
    let 结果 = '成';
    try {
        process.env[祖先持锁变量] = String(process.pid);
        return await 持锁上下文.run(柄, fn);
    }
    catch (err) {
        结果 = '异常';
        throw err;
    }
    finally {
        delete process.env[祖先持锁变量];
        柄.放(结果);
    }
};
/** 旧读者 Number(全文)，因此 pid 放旁文件，主文件仍是纯秒数；不破坏新旧间隔。 */
export const 过放行闸 = async <T>(fn: () => Promise<T>, 提示: (s: string) => void = s => console.error(`== 资源闸：${s}`), 环境: Partial<闸环境> = {}, 声明: 任务声明 = {}): Promise<T> => {
    检查重入();
    const e = 取环境(环境), 自建 = !有任务(e.锁目录), task = 开任务(e, 声明), 上次文件 = path.join(e.锁目录, '上次放行'), 起 = e.现在毫秒();
    let 卡在 = '', code = 1, 等内存秒 = 0, 末读数: Record<string, unknown> | undefined;
    const 卡过 = new Set<string>();
    const 间隔够 = () => {
        let 秒 = 0;
        try {
            秒 = Number(fs.readFileSync(上次文件, 'utf8').trim()) || 0;
        }
        catch { /* 首次 */ }
        const 信息 = 读JSON<{
            秒: number;
            pid: number;
        }>(上次文件 + '.信息.json');
        return 信息?.秒 === 秒 && !进程在吗(信息.pid) || e.现在毫秒() / 1000 - 秒 >= 60;
    };
    try {
        const 止等 = (t: 票) => {
            const c = t.内容!;
            if (c.等内存起 !== undefined) {
                const 秒 = (e.现在毫秒() - c.等内存起) / 1000;
                等内存秒 += 秒;
                task.记('等内存止', { 票: t.名, 锁: '放行', 秒, 机: 末读数 });
            }
            if (c.等内存起 === undefined && c.卡在 === undefined)
                return;
            delete c.等内存起;
            delete c.卡在;
            写票态(t);
        };
        const 柄 = await 排队拿('放行', { ...e, 声明, 越队: t => Boolean(取放行(e, t.内容!.任务)), 离开准入: t => { 卡在 = ''; 止等(t); }, 等内存秒: () => 等内存秒, 准入: t => {
                const 授权 = 取放行(e, t.内容!.任务), m = e.读内存(), 压力 = e.读压力(), load = e.一分钟负载();
                末读数 = { 负载: load, 闸: m?.空闲百分比, 压力 };
                const 项 = [!授权 && !间隔够() ? '间隔' : '', !授权 && load !== null && load >= e.核数() * 0.8 ? '负载' : '', !声明.不开渲染 && ((压力 === 4 && !授权?.强) || (!授权 && m && !内存够渲染(m, e.内存下限))) ? '内存' : ''].filter(Boolean).join('、');
                if (t.内容!.等内存起 !== undefined && !项.includes('内存'))
                    止等(t);
                if (项 && 项 !== 卡在) {
                    提示(`等资源（卡在${项}；负载 ${load ?? '?'}，内存 ${m?.空闲百分比 ?? '?'}%，压力 ${压力 ?? '?'}）`);
                    task.记('放行等起', { 票: t.名, 锁: '放行', 卡在: 项, 机: 末读数 });
                    t.内容!.卡在 = 项;
                    if (项.includes('内存') && t.内容!.等内存起 === undefined) {
                        t.内容!.等内存起 = e.现在毫秒();
                        task.记('等内存起', { 票: t.名, 锁: '放行', 读数: m, 压力, 阈值: e.内存下限, 机: 末读数 });
                    }
                    写票态(t);
                }
                if (项)
                    卡过.add(项);
                卡在 = 项;
                return !项;
            }, 锁内复核: t => Boolean(取放行(e, t.内容!.任务)) || 间隔够() });
        try {
            const 秒 = Math.floor(e.现在毫秒() / 1000);
            只提示('上次放行', () => {
                fs.writeFileSync(上次文件, `${秒}\n`);
                写JSON(上次文件 + '.信息.json', { 秒, pid: process.pid, 任务: task.info.任务 });
            });
            task.记('放行', { 票: 柄.票, 锁: '放行', 等秒: (e.现在毫秒() - 起) / 1000, 卡在: [...卡过], 机: 末读数 });
            用掉放行(e, 柄.任务);
        }
        finally {
            柄.放();
        }
        const result = await fn();
        code = 0;
        return result;
    }
    catch (err) {
        code = 失败退出码(err);
        throw err;
    }
    finally {
        if (自建)
            task.结束(code);
    }
};
/** 项间只在占锁满 120 秒且有人等、或明确让路时交棒；打包和浏览器由调用者保留。 */
export const 开闸批 = (声明: 任务声明, 环境: Partial<闸环境> = {}) => {
    检查重入();
    if (声明.连贯 && !声明.连贯.为什么?.trim())
        throw Error('连贯批必须写为什么');
    // 只有一项的批没有下一个让路点；项数没声明时还可能有下一项。
    const 可让路 = 声明.项数 !== 1;
    const e = 取环境(环境), 自建 = !有任务(e.锁目录), task = 开任务(e, { ...声明, 种: '批', 可让路 });
    let 柄: 锁柄 | null = null, 结束了 = false, 忙 = false, 项数 = 0, 码 = 0;
    return {
        一项: async <T>(项: 任务声明, fn: () => Promise<T>): Promise<T> => {
            if (结束了 || 忙)
                throw Error('批已结束或并发调用一项；批内一次一路');
            忙 = true;
            try {
                柄 ??= await 拿渲染闸(s => console.error(`== 资源闸：${s}`), e, { ...声明, ...项, 种: '批', 可让路 });
                Object.assign(柄.声明, 项);
                柄.心跳(0);
                const 起 = e.现在毫秒();
                process.env[祖先持锁变量] = String(process.pid);
                try {
                    return await 持锁上下文.run(柄, fn);
                }
                finally {
                    delete process.env[祖先持锁变量];
                    task.记('批项', { 票: 柄.票, 第几项: ++项数, 秒: (e.现在毫秒() - 起) / 1000, 声明: 项 });
                    const 指 = 取指令(e, task.info.任务), 让 = 指?.动作 === '让路' && 指.至! > e.现在毫秒();
                    const 别人 = 列票(path.join(e.锁目录, '渲染.排队')).some(t => t.pid !== process.pid && 票活着(t, e.本机));
                    if (让 || (!声明.连贯 && 别人 && e.现在毫秒() - 柄.拿锁时 >= 120000)) {
                        柄.放('让路');
                        柄 = null;
                    }
                }
            }
            catch (err) {
                码 = 失败退出码(err);
                throw err;
            }
            finally {
                忙 = false;
            }
        },
        结束: () => { if (忙)
            throw Error('批项还在跑，不能提前结束'); if (结束了)
            return; 结束了 = true; 柄?.放(); 柄 = null; if (自建)
            task.结束(码); },
    };
};
export const 懒放行闸 = (过闸: (fn: () => Promise<void>) => Promise<void> = 过放行闸) => { let p: Promise<void> | undefined; return () => p ??= 过闸(async () => { }); };
