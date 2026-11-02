import type { 调度事件 } from './调度日志.ts';
const 时刻 = (e: 调度事件) => Date.parse(e.时);
const 加 = (表: Record<string, number>, 键: string, 秒: number) => { 表[键] = (表[键] ?? 0) + 秒; };
const 整 = (表: Record<string, number>) => Object.fromEntries(Object.entries(表).map(([k, v]) => [k, Math.round(v * 10) / 10]));
const 用途 = (e: 调度事件) => (e.声明 as { 用途?: string } | undefined)?.用途 ?? '未声明';
const 标签 = (v: unknown) => { const f = v as { 来源?: string; 会话?: string; 路?: string; 工作区?: string } | undefined; return f ? `${f.来源 ?? '?'}:${f.会话 ?? ''}/${f.工作区 ?? ''}/${f.路 || '未声明路'}` : '未声明'; };
const 集 = <T>(表: Map<string, Set<T>>, 键: string) => { const s = 表.get(键) ?? new Set<T>(); 表.set(键, s); return s; };
/** 排队票的告警对象是任务 id，持锁的是 任务/段；票名只有旧票才用。 */
const 相关 = (a: 调度事件, d: 调度事件) => {
    const 对象 = String(a.对象 ?? '');
    return Boolean(d.任务 && (对象 === d.任务 || 对象.startsWith(`${d.任务}/`))) || [d.票, d.目标].some(x => x && (x === 对象 || x === a.票 || x === `#${a.pid}`));
};
type 持有段 = { 起: number; 止: number; 任务: string; 发起: unknown; 死: boolean };
export type 复盘选项 = {
    /** 只定汇报哪些。配对总用全部事件：领票可能在窗口外，挡路的持锁者也不一定满足过滤条件。 */
    入选?: (e: 调度事件) => boolean;
    /** 还没结束的等待算到这一刻；不给就算到最后一条事件。 */
    现在?: number;
};
export const 复盘 = (events: 调度事件[], { 入选 = () => true, 现在 }: 复盘选项 = {}) => {
    const rows = [...events].sort((a, b) => a.时.localeCompare(b.时)), 末 = 现在 ?? (rows.length ? 时刻(rows.at(-1)!) : 0);
    const 持锁 = new Map<string, 调度事件>(), 段们 = new Map<string, 持有段[]>();
    // 键是 任务|锁：票会改名；同一任务多段时后一段的领票覆盖前一段。
    const 在等 = new Map<string, 调度事件>(), 等过 = new Map<string, Set<number>>(), 卡过 = new Map<string, Set<string>>(), 内存起 = new Map<string, 调度事件>();
    const 占锁: Record<string, number> = {}, 等谁: Record<string, number> = {}, 发起等秒: Record<string, number> = {}, 等内存: Record<string, number> = {}, 未归因分解: Record<string, number> = {};
    const 等闸 = { 总秒: 0, 持锁者秒: 0, 其中已崩溃者秒: 0, 内存秒: 0, 未归因秒: 0 };
    const 未归因明细: unknown[] = [], 没等到: unknown[] = [], 等内存未结束: unknown[] = [];
    const 被杀: 调度事件[] = [], 决定: 调度事件[] = [], 回收: 调度事件[] = [], 告警: 调度事件[] = [], 延迟: number[] = [];
    let 未配告警: 调度事件[] = [], 无等待数据次 = 0;
    // 后台转存（渲/后台转存.ts）：不占闸，所以不进 等闸、占锁；限流秒、等齐秒 是出帧为它多等的。
    const 后台 = { 段数: 0, 总秒: 0, 排队秒: 0, 限流秒: 0, 等齐秒: 0 }, 后台没转成: string[] = [];
    const 关 = (锁: string, 止: number, 死: boolean) => {
        const 起事 = 持锁.get(锁);
        if (!起事)
            return;
        持锁.delete(锁);
        const 列 = 段们.get(锁) ?? [];
        段们.set(锁, 列);
        列.push({ 起: 时刻(起事), 止, 任务: 起事.任务!, 发起: 起事.发起, 死 });
        return 起事;
    };
    /** 没有放锁就没了。崩溃常隔很久才被人发现：占锁算到最后心跳，别人的等待算到发现为止。 */
    const 关死者 = (锁: string, e: 调度事件) => {
        const 起事 = 关(锁, 时刻(e), true), 跳 = Number(e.心跳 ?? (e.原持有者 as { 心跳?: number } | undefined)?.心跳) || 时刻(e);
        if (起事 && 入选(e))
            加(占锁, 用途(起事), Math.max(0, Math.min(跳, 时刻(e)) - 时刻(起事)) / 1000);
    };
    const 算等 = (e: 调度事件, 入: 调度事件 | undefined, 过: Set<number> | undefined, 卡: Set<string> | undefined) => {
        const 到 = 时刻(e), 总 = e.等锁秒 !== undefined ? Number(e.等锁秒) : 入 ? (到 - 时刻(入)) / 1000 : null;
        if (总 === null) {
            无等待数据次++;
            未归因明细.push({ 任务: e.任务, 锁: e.锁, 票: e.票, 原因: '无领票' });
            return;
        }
        const 起 = 到 - 总 * 1000, 段 = 段们.get(e.锁 ?? '渲染') ?? [], 见过 = new Set<number | undefined>();
        let 已 = 0;
        // 同一把锁的持锁段不重叠且按时间排好，往回找到等待开始就够了。
        for (let i = 段.length - 1; i >= 0 && 段[i]!.止 > 起; i--) {
            const h = 段[i]!, 秒 = Math.max(0, Math.min(到, h.止) - Math.max(起, h.起)) / 1000;
            if (!秒)
                continue;
            已 += 秒;
            见过.add((h.发起 as { pid?: number } | undefined)?.pid);
            加(等谁, `${e.任务}→${h.任务}`, 秒);
            加(发起等秒, `${标签(e.发起)}→${标签(h.发起)}`, 秒);
            if (h.死)
                等闸.其中已崩溃者秒 += 秒;
        }
        const 内存 = Math.min(Math.max(0, 总 - 已), Number(e.等内存秒 ?? 0)), 余 = 总 - 已 - 内存;
        等闸.总秒 += 总;
        等闸.持锁者秒 += 已;
        等闸.内存秒 += 内存;
        // 余下不到 0.05 秒是交接和浮点误差。
        if (余 < 0.05)
            return;
        const 旧闸 = [...(过 ?? [])].filter(p => !见过.has(p));
        const 原因 = 卡?.size ? `放行卡在${[...卡].join('、')}` : 旧闸.length ? `旧闸 #${旧闸.join(' #')}` : '锁空或无持锁记录';
        等闸.未归因秒 += 余;
        加(未归因分解, 原因, 余);
        加(发起等秒, `${标签(e.发起)}→未归因`, 余);
        未归因明细.push({ 任务: e.任务, 锁: e.锁, 票: e.票, 秒: Math.round(余 * 10) / 10, 原因 });
    };
    /** 任务没了，它没等完的都到此为止：10-22 那种等内存若以取消收场，也要看得到。 */
    const 了结 = (任务: string | null, 到: number, 结局: string) => {
        for (const [k, 入] of 在等)
            if (任务 === null || 入.任务 === 任务) {
                在等.delete(k);
                if (入选(入))
                    没等到.push({ 任务: 入.任务, 锁: 入.锁, 票: 入.票, 起: 入.时, 秒: Math.round(到 - 时刻(入)) / 1000, 结局 });
            }
        for (const [k, 起] of 内存起)
            if (任务 === null || k === 任务) {
                内存起.delete(k);
                if (入选(起)) {
                    const 秒 = (到 - 时刻(起)) / 1000;
                    加(等内存, k, 秒);
                    等内存未结束.push({ 任务: k, 票: 起.票, 起: 起.时, 秒: Math.round(秒 * 10) / 10, 结局 });
                }
            }
    };
    for (const e of rows) {
        const t = 时刻(e), 报 = 入选(e), 锁 = e.锁 ?? '渲染', 键 = `${e.任务}|${锁}`;
        if (e.事 === '领票')
            在等.set(键, e);
        else if (e.事 === '排队' && e.等谁)
            集(等过, 键).add(Number(e.等谁));
        else if (e.事 === '放行等起')
            集(卡过, 键).add(String(e.卡在));
        else if (e.事 === '拿锁') {
            // 上一任既没放锁也没崩溃事件就被接手，只可能是死了而事件没写成。
            关死者(锁, e);
            持锁.set(锁, e);
            if (报)
                算等(e, 在等.get(键), 等过.get(键), 卡过.get(键));
            在等.delete(键);
            等过.delete(键);
            卡过.delete(键);
        }
        else if (e.事 === '放锁') {
            if (报)
                加(占锁, 用途(e), Number(e.持锁秒 ?? 0));
            if (持锁.get(锁)?.任务 === e.任务)
                关(锁, t, false);
        }
        else if (e.事 === '等内存起')
            内存起.set(e.任务 ?? '', e);
        else if (e.事 === '等内存止') {
            内存起.delete(e.任务 ?? '');
            if (报)
                加(等内存, e.任务 ?? e.票!, Number(e.秒 ?? 0));
        }
        else if (e.事 === '回收死锁')
            关死者(锁, e);
        if (报 && e.事 === '后台起')
            后台.排队秒 += Number(e.等秒 ?? 0);
        else if (报 && e.事 === '后台满')
            后台.限流秒 += Number(e.秒 ?? 0);
        else if (报 && e.事 === '后台等齐')
            后台.等齐秒 += Number(e.秒 ?? 0);
        else if (报 && e.事 === '后台止') {
            后台.段数++;
            后台.总秒 += Number(e.秒 ?? 0);
            if (e.结果 === '留CRF1' || e.结果 === '中断' || e.结果 === '丢了')
                后台没转成.push(String(e.段));
        }
        if (e.事 === '崩溃')
            for (const [k, h] of 持锁)
                if (h.任务 === e.任务)
                    关死者(k, e);
        if (e.任务 && ['任务止', '被杀', '崩溃'].includes(e.事))
            了结(e.任务, t, e.事);
        if (['被杀', '崩溃', '取消', '限时杀'].includes(e.事) && 报)
            被杀.push(e);
        if (['回收死锁', '清死票', '清孤儿'].includes(e.事) && 报)
            回收.push(e);
        if (e.事 === '告警') {
            未配告警.push(e);
            if (报)
                告警.push(e);
        }
        if (e.事 === '决定') {
            if (报)
                决定.push(e);
            // 升级会连发几条，延迟从最早没处理的那条算；配过的不再配，没指向谁的决定不进统计。
            const 配 = 未配告警.filter(a => 相关(a, e));
            if (配.length && 报)
                延迟.push((t - 时刻(配[0]!)) / 1000);
            未配告警 = 未配告警.filter(a => !配.includes(a));
        }
    }
    了结(null, 末, '未结束');
    const 总 = Object.values(占锁).reduce((a, b) => a + b, 0), 选 = rows.filter(入选);
    return { 当前持锁: [...持锁.values()], 等闸: 整(等闸), 等谁: 整(等谁), 发起等秒: 整(发起等秒), 未归因: { 分解: 整(未归因分解), 无等待数据次, 明细: 未归因明细 }, 没等到, 等内存: 整(等内存), 等内存未结束, 占锁秒: 整(占锁), 实验占比: 总 ? (占锁.实验 ?? 0) / 总 : 0, 被杀, 决定, 回收, 告警, 告警到决定秒: 延迟, 后台: { ...(整(后台) as typeof 后台), 没转成: 后台没转成 }, 等待事件: 选.filter(x => x.事 === '排队'), 放行等待: 选.filter(x => x.事 === '放行'), 路: 选.filter(x => /^路[开完败]$/.test(x.事)) };
};
