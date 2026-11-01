import type { 调度事件 } from './调度日志.ts';
export const 复盘 = (events: 调度事件[]) => {
    const rows = [...events].sort((a, b) => a.时.localeCompare(b.时));
    const 持锁 = new Map<string, 调度事件>(), 领票 = new Map<string, 调度事件>();
    const 发起等秒:Record<string,number>={};
    const 占锁: Record<string, number> = {}, 等谁: Record<string, number> = {}, 等内存: Record<string, number> = {};
    const 被杀: 调度事件[] = [], 决定: 调度事件[] = [], 回收: 调度事件[] = [], 告警: 调度事件[] = [], 延迟: number[] = [];
    const intervals: {
        起: number;
        止: number;
        任务: string;
        发起: unknown;
    }[] = [];
    for (const e of rows) {
        if (e.事 === '拿锁')
            持锁.set(e.票 ?? e.任务!, e);
        if (e.事 === '放锁') {
            const 种 = (e.声明 as {
                用途?: string;
            } | undefined)?.用途 ?? '未声明';
            占锁[种] = (占锁[种] ?? 0) + Number(e.持锁秒 ?? 0);
            const 起 = 持锁.get(e.票 ?? e.任务!);
            if (起)
                intervals.push({ 起: Date.parse(起.时), 止: Date.parse(e.时), 任务: e.任务!, 发起: e.发起 });
            持锁.delete(e.票 ?? e.任务!);
        }
        if (e.事 === '等内存止')
            等内存[e.票 ?? e.任务!] = (等内存[e.票 ?? e.任务!] ?? 0) + Number(e.秒 ?? 0);
        if (['被杀', '崩溃', '取消'].includes(e.事))
            被杀.push(e);
        if (['回收死锁', '清死票', '清孤儿'].includes(e.事))
            回收.push(e);
        if (e.事 === '告警')
            告警.push(e);
        if (e.事 === '决定') {
            决定.push(e);
            const a = 告警.findLast(x => !e.票 || x.对象 === e.票 || x.票 === e.票);
            if (a)
                延迟.push((Date.parse(e.时) - Date.parse(a.时)) / 1000);
        }
    }
    for (const e of rows) {
        if (e.事 === '领票')
            领票.set(e.票!, e);
        if (e.事 === '拿锁') {
            const 入 = 领票.get(e.票!);
            if (!入)
                continue;
            for (const h of intervals) {
                const 秒 = Math.max(0, Math.min(Date.parse(e.时), h.止) - Math.max(Date.parse(入.时), h.起)) / 1000;
                if (秒) {
                    const key = `${入.任务}→${h.任务}`;
                    等谁[key] = (等谁[key] ?? 0) + 秒;
                    const 标签=(v:unknown)=>{const f=v as {来源?:string;会话?:string;路?:string;工作区?:string}|undefined;return f?`${f.来源??'?'}:${f.会话??''}/${f.工作区??''}/${f.路||'未声明路'}`:'未声明';};
                    const 谁=标签(入.发起)+'→'+标签(h.发起);发起等秒[谁]=(发起等秒[谁]??0)+秒;
                }
            }
        }
    }
    const 总 = Object.values(占锁).reduce((a, b) => a + b, 0);
    return { 当前持锁: [...持锁.values()], 等谁, 发起等秒, 等内存, 占锁秒: 占锁, 实验占比: 总 ? (占锁.实验 ?? 0) / 总 : 0, 被杀, 决定, 回收, 告警到决定秒: 延迟, 等待事件: rows.filter(x => x.事 === '排队'), 放行等待: rows.filter(x => x.事 === '放行'), 路: rows.filter(x => /^路[开完败]$/.test(x.事)) };
};
