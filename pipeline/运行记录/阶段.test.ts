import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { 出帧编码计时, 分段计时, 后台账, 记阶段, 量阶段, 阶段小结, type 阶段记录 } from './阶段.ts';

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

  it('分段计时：每次记从上一次调用到现在', () => {
    const 表 = path.join(dir, '表.tsv');
    const 收: 阶段记录[] = [];
    const 点 = 分段计时(收, '成片:作:名', 表);
    点('取母版');
    点('拼声音');
    expect(收.map((r) => r.阶段)).toEqual(['取母版', '拼声音']);
    expect(收.every((r) => r.秒 >= 0 && r.标签 === '成片:作:名')).toBe(true);
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

describe('后台账', () => {
  const 写表 = (行们: string[][]) => {
    const 表 = path.join(dir, '阶段耗时.tsv');
    fs.writeFileSync(表, '开始（UTC）\t标签\t阶段\t秒\t主机\tpid\n' + 行们.map((c) => `${c[0]}\t${c[1]}\t${c[2]}\t${c[3]}\tm\t${c[4]}\n`).join(''), 'utf8');
    return 表;
  };
  const t = (秒: number) => `2026-11-02T01:00:${String(秒).padStart(2, '0')}Z`;

  it('子进程的派生段签、转存按这批的标签认；同时另一批的段不算；内联的批没有等后台不列', () => {
    const 表 = 写表([
      [t(0), '批:作:视频', '准备', '0', '7'],
      [t(1), 'render:作/内联:视频', '出帧', '99', '7'],
      [t(1), 'render:作/内联:视频', '转存', '99', '7'],
      [t(2), '批:作:视频', '准备', '0', '100'],
      [t(3), 'render:作/甲:视频', '出帧', '10', '100'],
      [t(4), 'render:作/别人:视频', '出帧', '50', '300'],
      [t(4), 'render:作/别人:视频', '转存', '50', '300'],
      [t(5), 'render:作/甲:视频', '派生段签', '2', '201'],
      [t(6), 'render:作/甲:视频', '转存', '3', '201'],
      [t(7), 'render:作/乙:视频', '等后台', '1.5', '100'],
      [t(8), 'render:作/乙:视频', '出帧', '20', '100'],
      [t(9), 'render:作/乙:视频', '派生段签', '4', '202'],
      [t(9), 'render:作/乙:视频', '转存', '5', '202'],
      [t(9), '批:作:视频', '等后台', '6', '100'],
    ]);
    expect(后台账(3, 表)).toEqual([{ 开始: t(2), 标签: '批:作:视频', 段数: 2, 出帧: 30, 派生段签: 6, 转存: 8, 限流: 1.5, 等齐: 6 }]);
  });

  it('只取最近几批，新的在前；没有表是空', () => {
    const 一批 = (pid: string, 起: number) => [
      [t(起), '批:作:视频', '准备', '0', pid],
      [t(起 + 1), 'render:作/甲:视频', '出帧', pid, pid],
      [t(起 + 2), '批:作:视频', '等后台', '1', pid],
    ];
    const 表 = 写表([...一批('1', 0), ...一批('2', 10), ...一批('3', 20)]);
    expect(后台账(2, 表).map((x) => x.出帧)).toEqual([3, 2]);
    expect(后台账(3, path.join(dir, '没有.tsv'))).toEqual([]);
  });
});
