import fs from 'node:fs';
import path from 'node:path';
import { 读持有 } from './锁.ts';
import { 读JSON, 写JSON, 列文件, 只提示 } from './文件.ts';
import { 列票, 票活着, type 票 } from './票.ts';
import { 读调度, 记调度, type 调度事件 } from './调度日志.ts';
import { 清崩溃, type 调度环境, type 任务信息, type 任务声明 } from './任务.ts';
import { 读机器快照, type 机器快照 } from './机器.ts';
import type { 发起者 } from './发起者.ts';
export type 锁信息 = {
    pid: number;
    票: string;
    任务: string;
    发起: 发起者;
    声明: 任务声明;
    拿锁时: number;
    心跳: number;
    帧时: number;
    已出帧: number;
    总帧?: number;
    死?: boolean;
    旧?: boolean;
    锁?: string;
};
export type 调度状态 = {
    时: number;
    机: 机器快照;
    持锁: 锁信息[];
    票: 票[];
    在跑: 任务信息[];
    最近: 调度事件[];
};
/** 锁和票的现状，各带 死 标记。死的要等下一个等待者回收，没人排队时一直留着，读的人不能把它们算占用。 */
export const 读占用 = (e: 调度环境): Pick<调度状态, '持锁' | '票'> => {
    const 持锁: 锁信息[] = [];
    for (const name of ['渲染', '放行']) {
        const file = path.join(e.锁目录, name + '.lock'), 持 = 读持有(file, e.本机);
        if (!持)
            continue;
        const { pid, 死 } = 持, info = 读JSON<锁信息>(file + '.信息.json');
        if (info?.pid === pid)
            持锁.push({ ...info, 死, 锁: name });
        else {
            let 起 = e.现在毫秒();
            try {
                起 = fs.statSync(file).mtimeMs;
            }
            catch { /* 正在放锁 */ }
            持锁.push({ pid, 票: `#${pid}`, 任务: `旧-${pid}`, 发起: { pid, 工作区: '旧闸，无信息' } as 发起者, 声明: { 种: name }, 拿锁时: 起, 心跳: 0, 帧时: 起, 已出帧: 0, 旧: true, 死, 锁: name });
        }
    }
    return { 持锁, 票: ['渲染', '放行'].flatMap(n => 列票(path.join(e.锁目录, n + '.排队'))).map(t => ({ ...t, 死: !票活着(t, e.本机) })) };
};
/** 活的占用，一处一条。 */
export const 谁占着 = ({ 持锁, 票 }: Pick<调度状态, '持锁' | '票'>) => [
    ...持锁.filter(x => !x.死).map(x => `持锁 #${x.pid} ${x.声明.种 ?? '脚本'} ${x.声明.段 ?? ''} ${x.发起.路 || x.发起.工作区}`),
    ...票.filter(t => !t.死).map(t => `排队 #${t.pid} ${t.内容?.声明.种 ?? '旧票'} ${t.内容?.声明.段 ?? ''} ${t.内容?.发起.路 ?? ''}`),
].map(x => x.replace(/\s+/g, ' ').trim());
/** 退役条件是「连续 7 天没见到旧票、旧锁」，不记这个条件恒真。一小时一条够判断，不逐张记。刚拿锁的新闸还没写信息文件，看着像旧锁，所以占够 10 秒才算。 */
const 记旧协议 = (e: 调度环境, { 持锁, 票 }: Pick<调度状态, '持锁' | '票'>) => {
    const 现在 = e.现在毫秒(), 旧锁 = 持锁.filter(x => x.旧 && !x.死 && 现在 - x.拿锁时 > 10_000).map(x => x.pid), 旧票 = 票.filter(t => !t.内容 && !t.死).map(t => t.名), file = path.join(e.调度目录, '旧协议.json');
    if ((!旧锁.length && !旧票.length) || 现在 - (读JSON<{ 时: number }>(file)?.时 ?? 0) < 3_600_000)
        return;
    写JSON(file, { 时: 现在 });
    记调度(e.日志目录, '见到旧协议', { 旧锁, 旧票 }, 现在);
};
export const 读状态 = (e: 调度环境, 读机 = 读机器快照, 回收 = true): 调度状态 => {
    if (回收)
        清崩溃(e);
    const 占用 = 读占用(e);
    只提示('旧协议记录', () => 记旧协议(e, 占用));
    return { 时: e.现在毫秒(), 机: 读机(), ...占用,
        在跑: 列文件(path.join(e.锁目录, '在跑')).flatMap(n => { const x = 读JSON<任务信息>(path.join(e.锁目录, '在跑', n)); return x ? [x] : []; }),
        // 一次 anim 调度 就写一行汇报，尾部开小了告警和决定很快被挤掉，看 就显示成没有。
        最近: 读调度(e.日志目录, 256 * 1024).filter(x => x.事 === '告警' || x.事 === '决定').slice(-8) };
};
const 分 = (秒: number) => `${Math.max(0, 秒 / 60).toFixed(1)}分`;
const G = (n: number | null) => n === null ? '?' : (n / 2 ** 30).toFixed(1) + 'G';
export const 一行状态 = (s: 调度状态) => `负载${s.机.负载?.toFixed(1) ?? '?'}/${s.机.核} 闸${s.机.闸 ?? '?'}% 压力${s.机.压力 ?? '?'} 持锁${s.持锁.map(x => `#${x.pid}${x.死 ? '死' : ''}`).join(',') || '无'} 排队${s.票.filter(t => !t.死).length}${s.票.some(t => t.死) ? ` 死票${s.票.filter(t => t.死).length}` : ''}`;
/** 一张票只等自己这把锁和同队的票：放行票不等渲染锁。 */
export const 队上占用 = ({ 持锁, 票 }: Pick<调度状态, '持锁' | '票'>, 锁名: string) => ({ 持锁: 持锁.filter(x => x.锁 === 锁名), 票: 票.filter(t => path.basename(path.dirname(t.文件)) === `${锁名}.排队`) });
/** 占锁中位数，没有预计的按它算下界。 */
const 无预计秒 = 23;
/** 这些活占用还要多久：持锁剩余加票的预计。 */
export const 前方等待 = ({ 持锁, 票 }: Pick<调度状态, '持锁' | '票'>, 现在: number) => {
    const 活锁 = 持锁.filter(x => !x.死), 活票 = 票.filter(t => !t.死);
    return {
        秒: 活锁.reduce((n, x) => n + Math.max(0, (x.声明.预计秒 ?? 无预计秒) - (现在 - x.拿锁时) / 1000), 0) + 活票.reduce((n, t) => n + (t.内容?.声明.预计秒 ?? 无预计秒), 0),
        未知: 活锁.some(x => !x.声明.预计秒) || 活票.some(t => !t.内容?.声明.预计秒),
    };
};
/** 固定预算，字符串按 UTF-8 字节截断；20 张票也不铺满会话。完整字段用 --json。 */
export const 渲染看 = (s: 调度状态): string => {
    const m = s.机, lines = [`${new Date(s.时).toISOString().slice(5, 19)}Z ${一行状态(s)} free${G(m.free)} 压缩${G(m.压缩)} swap${G(m.swap)} 换出${G(m.换出)} GPU${m.GPU ?? '?'}% 热${m.热 ?? '?'} 盘${G(m.盘)}`];
    const cpu = s.在跑.filter(t => !s.持锁.some(x => x.任务 === t.任务) && !s.票.some(x => x.内容?.任务 === t.任务));
    lines.push(`CPU/准备 ${cpu.slice(0, 3).map(x => `#${x.发起.pid} ${x.声明.种} ${x.发起.路 || x.发起.工作区}`).join('；') || '无登记'}；孤儿Chrome ${m.孤儿 ?? '?'}`);
    for (const x of s.持锁.slice(0, 2))
        lines.push(`持锁 #${x.pid}${x.死 ? ' 死' : ''} ${x.声明.种 ?? '脚本'} ${x.声明.段 ?? ''} ${x.已出帧}/${x.总帧 ?? '?'}帧 ${x.发起.工作区}/${x.发起.路 || '?'} ${x.声明.用途 ?? '?'} 已占${分((s.时 - x.拿锁时) / 1000)}/预计${x.声明.预计秒 ? 分(x.声明.预计秒) : '?'} 心跳${x.心跳 ? Math.round((s.时 - x.心跳) / 1000) + '秒' : '无，旧闸'}`);
    const seen = new Map<string, number>();
    s.票.slice(0, 3).forEach((t, i) => {
        const c = t.内容, d = c?.声明, key = JSON.stringify([d?.种, d?.作品, d?.段, d?.级别, d?.帧, d?.帧数]), 活 = c && !t.死;
        const 上 = 队上占用(s, path.basename(path.dirname(t.文件), '.排队')), 重复 = 活 && seen.get(key), { 秒, 未知 } = 前方等待({ 持锁: 上.持锁, 票: 上.票.filter(q => q.名 < t.名) }, s.时);
        if (活)
            seen.set(key, t.pid);
        // 标记放前面：超预算时只截段和路名，「约 0 分后」后面的 等内存 不能被截掉。
        lines.push(`排队${i + 1} #${t.pid}${t.死 ? ' 死' : ''}${重复 ? ' 重复#' + 重复 : ''}${c?.卡在 ? ' 等' + c.卡在 : ''}${c?.暂缓至 ? ' 暂缓' : ''} 等${分((s.时 - (c?.起 ?? t.时间)) / 1000)} 预计${d?.预计秒 ? 分(d.预计秒) : '?'} 约${未知 ? '≥' : ''}${分(秒)}后 ${d?.种 ?? '旧票'} ${d?.段 ?? ''} ${c?.发起.路 ?? ''}`);
    });
    if (s.票.length > 3)
        lines.push(`另${s.票.length - 3}张（--json 看全队）`);
    const warn = s.最近.findLast(x => x.事 === '告警'), dec = s.最近.findLast(x => x.事 === '决定');
    lines.push(`告警 ${warn ? `${warn.时.slice(5, 19)}Z ${warn.类} ${warn.pid === undefined ? warn.对象 : '#' + warn.pid}` : '近期无'}`);
    lines.push(`最近决定 ${dec ? `${dec.决定}：${dec.为什么}` : '无'}`);
    const 截 = (text: string, limit: number) => { let out = ''; for (const c of text) {
        if (Buffer.byteLength(out + c) > limit - 3)
            return out + '…';
        out += c;
    } return out; };
    return lines.slice(0, 10).map((l, i) => 截(l, i === 0 ? 210 : l.startsWith('持锁') ? 140 : 95)).join('\n');
};
