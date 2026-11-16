import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { frameEncodeTiming, stageTiming, recordPhase, measureStage, stageSummary, type StageRecord } from './阶段.ts';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-阶段-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('分阶段计时', () => {
  it('记进运行记录的数组，阶段表第一次写表头、之后追加', () => {
    const stageFile = path.join(dir, 'logs', '阶段耗时.tsv');
    const records: StageRecord[] = [];
    recordPhase(records, 'still:作/段:视频', '等闸', Date.UTC(2026, 9, 30, 1, 2, 3), 1.234, stageFile);
    recordPhase(records, 'still:作/段:视频', '出帧', Date.UTC(2026, 9, 30, 1, 2, 4), 5, stageFile);
    expect(records).toEqual([
      { label: 'still:作/段:视频', stage: '等闸', startedAt: '2026-10-30T01:02:03Z', sec: 1.23 },
      { label: 'still:作/段:视频', stage: '出帧', startedAt: '2026-10-30T01:02:04Z', sec: 5 },
    ]);
    const rows = fs.readFileSync(stageFile, 'utf8').trim().split('\n').map((l) => l.split('\t'));
    expect(rows[0]).toEqual(['开始（UTC）', '标签', '阶段', '秒', '主机', 'pid']);
    expect(rows.slice(1).map((c) => [c[0], c[1], c[2], c[3], c[5]])).toEqual([
      ['2026-10-30T01:02:03Z', 'still:作/段:视频', '等闸', '1.23', String(process.pid)],
      ['2026-10-30T01:02:04Z', 'still:作/段:视频', '出帧', '5.00', String(process.pid)],
    ]);
  });

  it('分段计时：每次记从上一次调用到现在', () => {
    const tsvFile = path.join(dir, '表.tsv');
    const records: StageRecord[] = [];
    const timer = stageTiming(records, '成片:作:名', tsvFile);
    timer('取母版');
    timer('拼声音');
    expect(records.map((r) => r.stage)).toEqual(['取母版', '拼声音']);
    expect(records.every((r) => r.sec >= 0 && r.label === '成片:作:名')).toBe(true);
  });

  it('量阶段：fn 抛错也记，错照常抛出', async () => {
    const stageFile = path.join(dir, '阶段耗时.tsv');
    const records: StageRecord[] = [];
    expect(await measureStage(records, '会话', '打包', async () => 7, stageFile)).toBe(7);
    await expect(measureStage(records, '会话', '开浏览器', async () => { throw new Error('开不了'); }, stageFile)).rejects.toThrow('开不了');
    expect(records.map((r) => r.stage)).toEqual(['打包', '开浏览器']);
    expect(stageSummary(records)).toMatch(/^打包 \d+\.\d 秒、开浏览器 \d+\.\d 秒$/);
  });

  it('renderMedia 的进度拆成出帧、编码；没报出帧完成就全算出帧', () => {
    const timer = frameEncodeTiming();
    timer.onProgress({ renderedDoneIn: null });
    timer.onProgress({ renderedDoneIn: 8000 });
    expect(timer.split(10_000)).toEqual({ 出帧秒: 8, encodeSec: 2 });
    expect(frameEncodeTiming().split(3000)).toEqual({ 出帧秒: 3, encodeSec: 0 });
  });
});

