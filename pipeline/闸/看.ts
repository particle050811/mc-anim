import fs from 'node:fs';
import path from 'node:path';
import { 持有者, 进程在吗 } from './锁.ts';
import { 读JSON, 列文件 } from './文件.ts';
import { 列票, type 票 } from './票.ts';
import { 读调度, type 调度事件 } from './调度日志.ts';
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
};
export type 调度状态 = {
    时: number;
    机: 机器快照;
    持锁: 锁信息[];
    票: 票[];
    在跑: 任务信息[];
    最近: 调度事件[];
};
export const 读状态 = (e: 调度环境, 读机 = 读机器快照, 回收 = true): 调度状态 => {
    if (回收)
        清崩溃(e);
    const 持锁: 锁信息[] = [];
    for (const name of ['渲染', '放行']) {
        const file = path.join(e.锁目录, name + '.lock'), pid = 持有者(file);
        if (!pid)
            continue;
        const info = 读JSON<锁信息>(file + '.信息.json');
        if (info?.pid === pid)
            持锁.push({ ...info, 死: !进程在吗(pid) });
        else {
            let 起 = e.现在毫秒();
            try {
                起 = fs.statSync(file).mtimeMs;
            }
            catch { /* 正在放锁 */ }
            持锁.push({ pid, 票: `#${pid}`, 任务: `旧-${pid}`, 发起: { pid, 工作区: '旧闸，无信息' } as 发起者, 声明: { 种: name }, 拿锁时: 起, 心跳: 0, 帧时: 起, 已出帧: 0, 旧: true, 死: !进程在吗(pid) });
        }
    }
    return { 时: e.现在毫秒(), 机: 读机(), 持锁, 票: ['渲染', '放行'].flatMap(n => 列票(path.join(e.锁目录, n + '.排队'))),
        在跑: 列文件(path.join(e.锁目录, '在跑')).flatMap(n => { const x = 读JSON<任务信息>(path.join(e.锁目录, '在跑', n)); return x ? [x] : []; }), 最近: 读调度(e.日志目录, 16 * 1024) };
};
const 分 = (秒: number) => `${Math.max(0, 秒 / 60).toFixed(1)}分`;
const G = (n: number | null) => n === null ? '?' : (n / 2 ** 30).toFixed(1) + 'G';
export const 一行状态 = (s: 调度状态) => `负载${s.机.负载.toFixed(1)}/${s.机.核} 闸${s.机.闸 ?? '?'}% 压力${s.机.压力 ?? '?'} 持锁${s.持锁.map(x => '#' + x.pid).join(',') || '无'} 排队${s.票.length}`;
/** 固定预算，字符串按 UTF-8 字节截断；20 张票也不铺满会话。完整字段用 --json。 */
export const 渲染看 = (s: 调度状态): string => {
    const m = s.机, lines = [`${new Date(s.时).toISOString().slice(5, 19)}Z ${一行状态(s)} free${G(m.free)} 压缩${G(m.压缩)} swap${G(m.swap)} 换出${G(m.换出)} GPU${m.GPU ?? '?'}% 热${m.热 ?? '?'} 盘${G(m.盘)}`];
    const cpu = s.在跑.filter(t => !s.持锁.some(x => x.任务 === t.任务) && !s.票.some(x => x.内容?.任务 === t.任务));
    lines.push(`CPU/准备 ${cpu.slice(0, 3).map(x => `#${x.发起.pid} ${x.声明.种} ${x.发起.路 || x.发起.工作区}`).join('；') || '无登记'}；孤儿Chrome ${m.孤儿}`);
    for (const x of s.持锁.slice(0, 2))
        lines.push(`持锁 #${x.pid} ${x.声明.种 ?? '脚本'} ${x.声明.段 ?? ''} ${x.已出帧}/${x.总帧 ?? '?'}帧 ${x.发起.工作区}/${x.发起.路 || '?'} ${x.声明.用途 ?? '?'} 已占${分((s.时 - x.拿锁时) / 1000)}/预计${x.声明.预计秒 ? 分(x.声明.预计秒) : '?'} 心跳${x.心跳 ? Math.round((s.时 - x.心跳) / 1000) + '秒' : '无，旧闸'}`);
    let 等 = s.持锁.reduce((n, x) => n + Math.max(0, (x.声明.预计秒 ?? 23) - (s.时 - x.拿锁时) / 1000), 0);
    let 未知 = s.持锁.some(x => !x.声明.预计秒);
    const seen = new Map<string, number>();
    s.票.slice(0, 3).forEach((t, i) => {
        const c = t.内容, d = c?.声明, key = JSON.stringify([d?.种, d?.作品, d?.段, d?.帧数]);
        const 重复 = c && seen.get(key);
        seen.set(key, t.pid);
        lines.push(`排队${i + 1} #${t.pid} ${d?.种 ?? '旧票'} ${d?.段 ?? ''} ${c?.发起.路 ?? ''} 等${分((s.时 - (c?.起 ?? t.时间)) / 1000)} 预计${d?.预计秒 ? 分(d.预计秒) : '?'} 约${未知 ? '≥' : ''}${分(等)}后${重复 ? ' 重复#' + 重复 : ''}${c?.卡在 ? ' 等' + c.卡在 : ''}${c?.暂缓至 ? ' 暂缓' : ''}`);
        等 += d?.预计秒 ?? 23;
        未知 ||= !d?.预计秒;
    });
    if (s.票.length > 3)
        lines.push(`另${s.票.length - 3}张（--json 看全队）`);
    const warn = s.最近.findLast(x => x.事 === '告警'), dec = s.最近.findLast(x => x.事 === '决定');
    lines.push(`告警 ${warn ? `${warn.类} ${warn.对象}` : '无已记录'}`);
    lines.push(`最近决定 ${dec ? `${dec.决定}：${dec.为什么}` : '无'}`);
    const 截 = (text: string, limit: number) => { let out = ''; for (const c of text) {
        if (Buffer.byteLength(out + c) > limit - 3)
            return out + '…';
        out += c;
    } return out; };
    return lines.slice(0, 10).map((l, i) => 截(l, i === 0 ? 210 : l.startsWith('持锁') ? 140 : 95)).join('\n');
};
