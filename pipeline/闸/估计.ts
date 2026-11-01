import fs from 'node:fs';
import path from 'node:path';
import { 列文件, 读JSON } from './文件.ts';
import type { 任务声明 } from './任务.ts';
/** still 只用纯出帧记录，不能用含排队的 anim still 命令总时长。 */
export const 估计 = (声明: 任务声明, 日志根: string): number | null => {
    const dir = path.join(日志根, '渲染明细');
    const 样本: number[] = [];
    for (const name of 列文件(dir).sort().reverse()) {
        const d = 读JSON<{
            标签: string;
            小结: {
                帧数: number;
                首帧毫秒: number;
                中位毫秒: number;
            };
        }>(path.join(dir, name));
        if (!d?.标签?.startsWith((声明.种 ?? 'render') + ':') || 声明.段 && !d.标签.includes('/' + 声明.段 + ':'))
            continue;
        样本.push((d.小结.首帧毫秒 + Math.max(0, (声明.帧数 ?? d.小结.帧数) - 1) * d.小结.中位毫秒) / 1000);
        if (样本.length === 5)
            break;
    }
    if (!样本.length) {
        try {
            for (const l of fs.readFileSync(path.join(日志根, '阶段耗时.tsv'), 'utf8').trim().split('\n').reverse()) {
                const [, 标签, 阶段, 秒] = l.split('\t');
                if (阶段 === '出帧' && 标签?.startsWith((声明.种 ?? 'render') + ':') && (!声明.段 || 标签.includes('/' + 声明.段 + ':')))
                    样本.push(Number(秒));
                if (样本.length === 5)
                    break;
            }
        }
        catch { /* 尚无纯跑样本 */ }
    }
    const 有效 = 样本.filter(Number.isFinite).sort((a, b) => a - b);
    return 有效.length ? 有效[Math.floor(有效.length / 2)]! : null;
};
