// anim sched lock-waits：渲染锁按「主检出 / worktree × 种 × 低优先」分组的票数、等锁、占锁，和 worktree 静帧等锁的分位数。
// 用来对比用户 11-06 定的让路做法（子 Agent 只出静帧，整段渲染由主 Agent 合并后 --low-priority 排）改前改后，基线见 docs/决策/0012-调度.md「让路」。
// 静帧等锁时锁在谁手里：按时间重叠归因到持锁票的分组。
import type { SchedulerEvent } from './调度日志.ts';

type TicketRow = { 到: number; acquire?: number; 放?: number; 等: number; heldSec: number; 组: string; isWorktreeStill: boolean };

const groupName = (e: SchedulerEvent) => {
  const initiator = e.发起 as { cwd?: string } | undefined, eventDecl = (e.声明 ?? {}) as { 种?: string; 低优先?: boolean };
  return `${(initiator?.cwd ?? '').includes('/mc-anim-wt/') ? 'worktree' : '主检出'} ${eventDecl.种 ?? '?'}${eventDecl.低优先 ? ' 低优先' : ''}`;
};

export const lockWaitTable = (events: SchedulerEvent[], matches: (e: SchedulerEvent) => boolean) => {
  const ticketMap = new Map<string, TicketRow>();
  for (const e of events) {
    if (e.锁 !== '渲染' || typeof e.票 !== 'string' || !matches(e)) continue;
    const timeMs = Date.parse(e.时);
    if (e.事 === '领票') {
      const lockGroup = groupName(e);
      ticketMap.set(e.票, { 到: timeMs, 等: 0, heldSec: 0, 组: lockGroup, isWorktreeStill: lockGroup === 'worktree still' });
    } else {
      const x = ticketMap.get(e.票);
      if (!x) continue;
      if (e.事 === '拿锁') Object.assign(x, { acquire: timeMs, 等: Number(e.等锁秒 ?? 0) });
      if (e.事 === '放锁') Object.assign(x, { 放: timeMs, heldSec: Number(e.持锁秒 ?? 0) });
    }
  }
  const completed = [...ticketMap.values()].filter((x) => x.acquire !== undefined && x.放 !== undefined);
  const groups: Record<string, { 票: number; 等锁时: number; 占锁时: number }> = {};
  for (const x of completed) {
    const g = (groups[x.组] ??= { 票: 0, 等锁时: 0, 占锁时: 0 });
    g.票++;
    g.等锁时 += x.等 / 3600;
    g.占锁时 += x.heldSec / 3600;
  }
  const stillWaits = completed.filter((x) => x.isWorktreeStill).map((x) => x.等).sort((a, b) => a - b);
  const quantile = (q: number) => (stillWaits.length ? stillWaits[Math.min(stillWaits.length - 1, Math.floor(stillWaits.length * q))]! : 0);
  const stillBlockedHours: Record<string, number> = {};
  for (const s of completed) {
    if (!s.isWorktreeStill || s.等 < 1) continue;
    for (const h of completed) {
      const o = Math.min(s.acquire!, h.放!) - Math.max(s.到, h.acquire!);
      if (o > 0 && h !== s) stillBlockedHours[h.组] = (stillBlockedHours[h.组] ?? 0) + o / 3_600_000;
    }
  }
  const round2 = <T extends Record<string, number>>(o: T) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 100) / 100]));
  return {
    分组: Object.fromEntries(Object.entries(groups).sort((a, b) => b[1].占锁时 - a[1].占锁时).map(([k, v]) => [k, round2(v)])),
    worktree静帧等锁: { 票: stillWaits.length, 合计时: Math.round((stillWaits.reduce((a, b) => a + b, 0) / 3600) * 100) / 100, 中位秒: quantile(0.5), p90秒: quantile(0.9), 最长秒: stillWaits.at(-1) ?? 0 },
    静帧等锁时锁在谁手里: round2(Object.fromEntries(Object.entries(stillBlockedHours).sort((a, b) => b[1] - a[1]))),
  };
};
