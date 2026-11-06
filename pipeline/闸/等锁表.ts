// anim 调度 等锁表：渲染锁按「主检出 / worktree × 种 × 低优先」分组的票数、等锁、占锁，和 worktree 静帧等锁的分位数。
// 用来对比用户 11-06 定的让路做法（子 Agent 只出静帧，整段渲染由主 Agent 合并后 --低优先 排）改前改后，基线见 docs/决策/0012-调度.md「让路」。
// 静帧等锁时锁在谁手里：按时间重叠归因到持锁票的分组。
import type { 调度事件 } from './调度日志.ts';

type 票 = { 到: number; 拿?: number; 放?: number; 等: number; 持: number; 组: string; 静帧wt: boolean };

const 组名 = (e: 调度事件) => {
  const 发 = e.发起 as { cwd?: string } | undefined, 声明 = (e.声明 ?? {}) as { 种?: string; 低优先?: boolean };
  return `${(发?.cwd ?? '').includes('/mc-anim-wt/') ? 'worktree' : '主检出'} ${声明.种 ?? '?'}${声明.低优先 ? ' 低优先' : ''}`;
};

export const 等锁表 = (events: 调度事件[], 入选: (e: 调度事件) => boolean) => {
  const 票们 = new Map<string, 票>();
  for (const e of events) {
    if (e.锁 !== '渲染' || typeof e.票 !== 'string' || !入选(e)) continue;
    const 时 = Date.parse(e.时);
    if (e.事 === '领票') {
      const 组 = 组名(e);
      票们.set(e.票, { 到: 时, 等: 0, 持: 0, 组, 静帧wt: 组 === 'worktree still' });
    } else {
      const x = 票们.get(e.票);
      if (!x) continue;
      if (e.事 === '拿锁') Object.assign(x, { 拿: 时, 等: Number(e.等锁秒 ?? 0) });
      if (e.事 === '放锁') Object.assign(x, { 放: 时, 持: Number(e.持锁秒 ?? 0) });
    }
  }
  const 全 = [...票们.values()].filter((x) => x.拿 !== undefined && x.放 !== undefined);
  const 分组: Record<string, { 票: number; 等锁时: number; 占锁时: number }> = {};
  for (const x of 全) {
    const g = (分组[x.组] ??= { 票: 0, 等锁时: 0, 占锁时: 0 });
    g.票++;
    g.等锁时 += x.等 / 3600;
    g.占锁时 += x.持 / 3600;
  }
  const 静 = 全.filter((x) => x.静帧wt).map((x) => x.等).sort((a, b) => a - b);
  const 分位 = (q: number) => (静.length ? 静[Math.min(静.length - 1, Math.floor(静.length * q))]! : 0);
  const 挡静帧: Record<string, number> = {};
  for (const s of 全) {
    if (!s.静帧wt || s.等 < 1) continue;
    for (const h of 全) {
      const o = Math.min(s.拿!, h.放!) - Math.max(s.到, h.拿!);
      if (o > 0 && h !== s) 挡静帧[h.组] = (挡静帧[h.组] ?? 0) + o / 3_600_000;
    }
  }
  const 两位 = <T extends Record<string, number>>(o: T) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 100) / 100]));
  return {
    分组: Object.fromEntries(Object.entries(分组).sort((a, b) => b[1].占锁时 - a[1].占锁时).map(([k, v]) => [k, 两位(v)])),
    worktree静帧等锁: { 票: 静.length, 合计时: Math.round((静.reduce((a, b) => a + b, 0) / 3600) * 100) / 100, 中位秒: 分位(0.5), p90秒: 分位(0.9), 最长秒: 静.at(-1) ?? 0 },
    静帧等锁时锁在谁手里: 两位(Object.fromEntries(Object.entries(挡静帧).sort((a, b) => b[1] - a[1]))),
  };
};
