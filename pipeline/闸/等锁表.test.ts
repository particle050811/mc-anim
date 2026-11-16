import { expect, it } from 'vitest';
import { lockWaitTable } from './等锁表.ts';
import type { SchedulerEvent } from './调度日志.ts';

const isoAt = (sec: number) => new Date(Date.UTC(2026, 10, 7) + sec * 1000).toISOString();
const ticketEvents = (ticket: string, cwd: string, taskKind: string, arriveTime: number, acquire: number, releaseSec: number, lowPriority = false): SchedulerEvent[] => {
  const base = { ticket: ticket, lock: '渲染', host: 'h', initiator: { cwd }, decl: { kind: taskKind, ...(lowPriority ? { lowPriority: lowPriority } : {}) }, v: 1 };
  return [
    { ...base, event: '领票', timestamp: isoAt(arriveTime) },
    { ...base, event: '拿锁', timestamp: isoAt(acquire), lockWaitSec: acquire - arriveTime },
    { ...base, event: '放锁', timestamp: isoAt(releaseSec), lockHoldSec: releaseSec - acquire },
  ] as SchedulerEvent[];
};

it('按 主检出/worktree × 种 × 低优先 分组；worktree 静帧等锁的分位数；静帧等时锁在谁手里', () => {
  const r = lockWaitTable(
    [
      ...ticketEvents('a', '/x/mc-anim', 'render', 0, 0, 100, true),
      ...ticketEvents('b', '/x/mc-anim-wt/甲', 'still', 10, 100, 103),
      ...ticketEvents('c', '/x/mc-anim-wt/乙', 'still', 200, 200, 202),
    ],
    () => true,
  );
  expect(Object.keys(r.分组)).toEqual(['主检出 render 低优先', 'worktree still']);
  expect(r.分组['worktree still']).toEqual({ ticket: 2, 等锁时: 0.03, 占锁时: 0 });
  expect(r.worktree静帧等锁).toMatchObject({ ticket: 2, 最长秒: 90 });
  expect(r.静帧等锁时锁在谁手里).toEqual({ '主检出 render 低优先': 0.03 });
});
