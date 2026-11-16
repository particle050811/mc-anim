// anim sched lock-waits：渲染锁按「主检出 / worktree × 种 × 低优先」分组的票数、等锁、占锁，和 worktree 静帧等锁的分位数。
// 用来对比用户 11-06 定的让路做法（子 Agent 只出静帧，整段渲染由主 Agent 合并后 --low-priority 排）改前改后，基线见 docs/决策/0012-调度.md「让路」。
// 静帧等锁时锁在谁手里：按时间重叠归因到持锁票的分组。
import type { SchedulerEvent } from './调度日志.ts';

type TicketRow = { dest: number; acquire?: number; 放?: number; waits: number; heldSec: number; group: string; isWorktreeStill: boolean };

const groupName = (e: SchedulerEvent) => {
  const initiator = e.initiator as { cwd?: string } | undefined, eventDecl = (e.decl ?? {}) as { kind?: string; lowPriority?: boolean };
  return `${(initiator?.cwd ?? '').includes('/mc-anim-wt/') ? 'worktree' : '主检出'} ${eventDecl.kind ?? '?'}${eventDecl.lowPriority ? ' 低优先' : ''}`;
};

export const lockWaitTable = (events: SchedulerEvent[], matches: (e: SchedulerEvent) => boolean) => {
  const ticketMap = new Map<string, TicketRow>();
  for (const e of events) {
    if (e.lock !== '渲染' || typeof e.ticket !== 'string' || !matches(e)) continue;
    const timeMs = Date.parse(e.timestamp);
    if (e.event === '领票') {
      const lockGroup = groupName(e);
      ticketMap.set(e.ticket, { dest: timeMs, waits: 0, heldSec: 0, group: lockGroup, isWorktreeStill: lockGroup === 'worktree still' });
    } else {
      const x = ticketMap.get(e.ticket);
      if (!x) continue;
      if (e.event === '拿锁') Object.assign(x, { acquire: timeMs, waits: Number(e.lockWaitSec ?? 0) });
      if (e.event === '放锁') Object.assign(x, { 放: timeMs, heldSec: Number(e.lockHoldSec ?? 0) });
    }
  }
  const completed = [...ticketMap.values()].filter((x) => x.acquire !== undefined && x.放 !== undefined);
  const groups: Record<string, { ticket: number; 等锁时: number; 占锁时: number }> = {};
  for (const x of completed) {
    const g = (groups[x.group] ??= { ticket: 0, 等锁时: 0, 占锁时: 0 });
    g.ticket++;
    g.等锁时 += x.waits / 3600;
    g.占锁时 += x.heldSec / 3600;
  }
  const stillWaits = completed.filter((x) => x.isWorktreeStill).map((x) => x.waits).sort((a, b) => a - b);
  const quantile = (q: number) => (stillWaits.length ? stillWaits[Math.min(stillWaits.length - 1, Math.floor(stillWaits.length * q))]! : 0);
  const stillBlockedHours: Record<string, number> = {};
  for (const s of completed) {
    if (!s.isWorktreeStill || s.waits < 1) continue;
    for (const h of completed) {
      const o = Math.min(s.acquire!, h.放!) - Math.max(s.dest, h.acquire!);
      if (o > 0 && h !== s) stillBlockedHours[h.group] = (stillBlockedHours[h.group] ?? 0) + o / 3_600_000;
    }
  }
  const round2 = <T extends Record<string, number>>(o: T) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 100) / 100]));
  return {
    分组: Object.fromEntries(Object.entries(groups).sort((a, b) => b[1].占锁时 - a[1].占锁时).map(([k, v]) => [k, round2(v)])),
    worktree静帧等锁: { ticket: stillWaits.length, 合计时: Math.round((stillWaits.reduce((a, b) => a + b, 0) / 3600) * 100) / 100, 中位秒: quantile(0.5), p90秒: quantile(0.9), 最长秒: stillWaits.at(-1) ?? 0 },
    静帧等锁时锁在谁手里: round2(Object.fromEntries(Object.entries(stillBlockedHours).sort((a, b) => b[1] - a[1]))),
  };
};
