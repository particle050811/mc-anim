import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { 出帧编码计时, 记阶段, 量阶段, 阶段小结, type 阶段记录 } from './阶段.ts';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-阶段-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('分阶段计时', () => {
  it('记进运行记录的数组，阶段表第一次写表头、之后追加', () => {
    const 表 = path.join(dir, 'logs', '阶段耗时.tsv');
    const 收: 阶段记录[] = [];
    记阶段(收, 'still:作/段:视频', '等闸', Date.UTC(2026, 9, 30, 1, 2, 3), 1.234, 表);
    记阶段(收, 'still:作/段:视频', '出帧', Date.UTC(2026, 9, 30, 1, 2, 4), 5, 表);
    expect(收).toEqual([
      { 标签: 'still:作/段:视频', 阶段: '等闸', 开始: '2026-10-30T01:02:03Z', 秒: 1.23 },
      { 标签: 'still:作/段:视频', 阶段: '出帧', 开始: '2026-10-30T01:02:04Z', 秒: 5 },
    ]);
    const 行 = fs.readFileSync(表, 'utf8').trim().split('\n').map((l) => l.split('\t'));
    expect(行[0]).toEqual(['开始（UTC）', '标签', '阶段', '秒', '主机', 'pid']);
    expect(行.slice(1).map((c) => [c[0], c[1], c[2], c[3], c[5]])).toEqual([
      ['2026-10-30T01:02:03Z', 'still:作/段:视频', '等闸', '1.23', String(process.pid)],
      ['2026-10-30T01:02:04Z', 'still:作/段:视频', '出帧', '5.00', String(process.pid)],
    ]);
  });

  it('量阶段：fn 抛错也记，错照常抛出', async () => {
    const 表 = path.join(dir, '阶段耗时.tsv');
    const 收: 阶段记录[] = [];
    expect(await 量阶段(收, '会话', '打包', async () => 7, 表)).toBe(7);
    await expect(量阶段(收, '会话', '开浏览器', async () => { throw new Error('开不了'); }, 表)).rejects.toThrow('开不了');
    expect(收.map((r) => r.阶段)).toEqual(['打包', '开浏览器']);
    expect(阶段小结(收)).toMatch(/^打包 \d+\.\d 秒、开浏览器 \d+\.\d 秒$/);
  });

  it('renderMedia 的进度拆成出帧、编码；没报出帧完成就全算出帧', () => {
    const 计 = 出帧编码计时();
    计.onProgress({ renderedDoneIn: null });
    计.onProgress({ renderedDoneIn: 8000 });
    expect(计.拆(10_000)).toEqual({ 出帧秒: 8, 编码秒: 2 });
    expect(出帧编码计时().拆(3000)).toEqual({ 出帧秒: 3, 编码秒: 0 });
  });
});
