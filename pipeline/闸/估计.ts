import fs from 'node:fs';
import path from 'node:path';
import { listFiles, readJson } from './文件.ts';
import type { TaskDecl } from './任务.ts';
/** 表的最后几条（新的在前）；取 返回 null 的行不算。 */
const tailTableValue = (file: string, readColumn: (cols: string[]) => number | null) => {
    const values: number[] = [];
    try {
        for (const l of fs.readFileSync(file, 'utf8').trim().split('\n').reverse()) {
            const n = readColumn(l.split('\t'));
            if (n !== null)
                values.push(n);
            if (values.length === 5)
                break;
        }
    }
    catch { /* 尚无样本 */ }
    return values;
};
/**
 * 明细 > 阶段表 > 耗时表。still 只用纯出帧记录，不能用含排队的 anim still 命令总时长；
 * render 的耗时表行从拿锁后算，可以作回退。级别差一档每帧差很多，声明了级别就只认同级。
 */
export const estimate = (taskDecl: TaskDecl, logRoot: string): number | null => {
    const taskKind = taskDecl.kind ?? 'render', { segment: segmentKey, level: level } = taskDecl;
    const matchesTag = (label = '') => label.startsWith(taskKind + ':') && (!segmentKey || label.includes('/' + segmentKey + ':')) && (!level || label.endsWith(':' + level));
    const dir = path.join(logRoot, '渲染明细');
    let samples: number[] = [];
    for (const name of listFiles(dir).sort().reverse()) {
        const d = readJson<{
            label: string;
            summary: {
                frameCount: number;
                firstFrameMs: number;
                medianMs: number;
            };
        }>(path.join(dir, name));
        if (!d || !matchesTag(d.label))
            continue;
        samples.push((d.summary.firstFrameMs + Math.max(0, (taskDecl.frameCount ?? d.summary.frameCount) - 1) * d.summary.medianMs) / 1000);
        if (samples.length === 5)
            break;
    }
    if (!samples.length)
        samples = tailTableValue(path.join(logRoot, '阶段耗时.tsv'), cols => cols[2] === '出帧' && matchesTag(cols[1]) ? Number(cols[3]) : null);
    if (!samples.length && taskKind === 'render')
        samples = tailTableValue(path.join(logRoot, '耗时.tsv'), cols => matchesTag(cols[1]) && cols[3] === '0' ? Number(cols[2]) : null);
    const valid = samples.filter(Number.isFinite).sort((a, b) => a - b);
    return valid.length ? valid[Math.floor(valid.length / 2)]! : null;
};
