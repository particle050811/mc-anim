import fs from 'node:fs';
import path from 'node:path';
import { 列文件, 读JSON } from './文件.ts';
import type { 任务声明 } from './任务.ts';
/** 表的最后几条（新的在前）；取 返回 null 的行不算。 */
const 表尾 = (file: string, 取: (列: string[]) => number | null) => {
    const 样本: number[] = [];
    try {
        for (const l of fs.readFileSync(file, 'utf8').trim().split('\n').reverse()) {
            const n = 取(l.split('\t'));
            if (n !== null)
                样本.push(n);
            if (样本.length === 5)
                break;
        }
    }
    catch { /* 尚无样本 */ }
    return 样本;
};
/**
 * 明细 > 阶段表 > 耗时表。still 只用纯出帧记录，不能用含排队的 anim still 命令总时长；
 * render 的耗时表行从拿锁后算，可以作回退。级别差一档每帧差很多，声明了级别就只认同级。
 */
export const 估计 = (声明: 任务声明, 日志根: string): number | null => {
    const 种 = 声明.种 ?? 'render', { 段, 级别 } = 声明;
    const 中 = (标签 = '') => 标签.startsWith(种 + ':') && (!段 || 标签.includes('/' + 段 + ':')) && (!级别 || 标签.endsWith(':' + 级别));
    const dir = path.join(日志根, '渲染明细');
    let 样本: number[] = [];
    for (const name of 列文件(dir).sort().reverse()) {
        const d = 读JSON<{
            标签: string;
            小结: {
                帧数: number;
                首帧毫秒: number;
                中位毫秒: number;
            };
        }>(path.join(dir, name));
        if (!d || !中(d.标签))
            continue;
        样本.push((d.小结.首帧毫秒 + Math.max(0, (声明.帧数 ?? d.小结.帧数) - 1) * d.小结.中位毫秒) / 1000);
        if (样本.length === 5)
            break;
    }
    if (!样本.length)
        样本 = 表尾(path.join(日志根, '阶段耗时.tsv'), 列 => 列[2] === '出帧' && 中(列[1]) ? Number(列[3]) : null);
    if (!样本.length && 种 === 'render')
        样本 = 表尾(path.join(日志根, '耗时.tsv'), 列 => 中(列[1]) && 列[3] === '0' ? Number(列[2]) : null);
    const 有效 = 样本.filter(Number.isFinite).sort((a, b) => a - b);
    return 有效.length ? 有效[Math.floor(有效.length / 2)]! : null;
};
