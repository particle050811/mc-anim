import { expect, it } from 'vitest';
import { 等锁表 } from './等锁表.ts';
import type { 调度事件 } from './调度日志.ts';

const 时 = (秒: number) => new Date(Date.UTC(2026, 10, 7) + 秒 * 1000).toISOString();
const 票 = (票: string, cwd: string, 种: string, 到: number, 拿: number, 放: number, 低优先 = false): 调度事件[] => {
  const 共 = { 票, 锁: '渲染', 主机: 'h', 发起: { cwd }, 声明: { 种, ...(低优先 ? { 低优先 } : {}) }, v: 1 };
  return [
    { ...共, 事: '领票', 时: 时(到) },
    { ...共, 事: '拿锁', 时: 时(拿), 等锁秒: 拿 - 到 },
    { ...共, 事: '放锁', 时: 时(放), 持锁秒: 放 - 拿 },
  ] as 调度事件[];
};

it('按 主检出/worktree × 种 × 低优先 分组；worktree 静帧等锁的分位数；静帧等时锁在谁手里', () => {
  const r = 等锁表(
    [
      ...票('a', '/x/mc-anim', 'render', 0, 0, 100, true),
      ...票('b', '/x/mc-anim-wt/甲', 'still', 10, 100, 103),
      ...票('c', '/x/mc-anim-wt/乙', 'still', 200, 200, 202),
    ],
    () => true,
  );
  expect(Object.keys(r.分组)).toEqual(['主检出 render 低优先', 'worktree still']);
  expect(r.分组['worktree still']).toEqual({ 票: 2, 等锁时: 0.03, 占锁时: 0 });
  expect(r.worktree静帧等锁).toMatchObject({ 票: 2, 最长秒: 90 });
  expect(r.静帧等锁时锁在谁手里).toEqual({ '主检出 render 低优先': 0.03 });
});
