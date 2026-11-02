// 后台转存的队列：一个工作者，先排先做。限流看「排着还没开始的」：满了让下一段先别出帧，CRF1 才不会堆满盘、后台才不会越落越远。
// 只管次序，不管做什么（做什么见 后处理.ts、后台转存.ts）；一项失败只报给 出错，不连累后面。

/** x264 -threads 4 加出帧在 10 核上放得下一个工作者，再多就和 Chrome 抢；排着的超过这么多段就让下一段等（在做的那段不算） */
export const 后台排队上限 = 2;

export type 后台项 = { 名: string; 做: () => Promise<void> };

export const 建后台队列 = (o: { 上限?: number; 出错?: (名: string, 错: unknown) => void } = {}) => {
  const 上限 = o.上限 ?? 后台排队上限;
  const 排着: 后台项[] = [];
  let 在做: 后台项 | null = null;
  let 等变: (() => void)[] = [];
  const 变了 = () => {
    const 们 = 等变;
    等变 = [];
    for (const f of 们) f();
  };
  const 下一个 = () => {
    if (在做) return;
    const t = 排着.shift();
    if (!t) return 变了();
    在做 = t;
    变了();
    void (async () => {
      try {
        await t.做();
      } catch (e) {
        o.出错?.(t.名, e);
      } finally {
        在做 = null;
        下一个();
      }
    })();
  };
  const 等下一变 = () => new Promise<void>((r) => void 等变.push(r));
  return {
    排: (t: 后台项) => {
      排着.push(t);
      下一个();
    },
    等空位: async () => {
      while (排着.length >= 上限) await 等下一变();
    },
    等齐: async () => {
      while (在做 || 排着.length) await 等下一变();
    },
    现状: () => ({ 在做: 在做?.名 ?? null, 排着: 排着.map((t) => t.名) }),
  };
};
