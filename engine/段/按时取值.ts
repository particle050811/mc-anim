// 按时间读「一格一个值」的老数据（逐帧增益、逐帧查表、一档一格的闪光）。纯模块。
// 老数据第 i 项是第 i 格那一刻的值（一格 = 1/每秒 秒，第 6、7 章是 1/24 秒）；读的代码按秒算位置 x = 秒 × 每秒，不对齐到格（docs/决策/0015-原生60帧.md）。
// 格点上（x 是整数）两种读法都正好取到第 x 项，和以前 24 帧输出时每帧取到的一样。

// 浮点里 0.4 × 2.5 这种算出 0.99999…，差这么点当作在格点上（导出给要整数帧号的显示、等号判断用）
export const 贴格 = (x: number): number => {
  const r = Math.round(x);
  return Math.abs(x - r) < 1e-9 ? r : x;
};

/** 连续量：第 x 格（带小数）在相邻两项间线性插值，头尾之外取头尾 */
export const 插表 = (表: ArrayLike<number>, x: number): number => {
  const n = 表.length;
  if (!n) throw new Error('插表：表是空的');
  const p = 贴格(x);
  if (p <= 0) return 表[0]!;
  if (p >= n - 1) return 表[n - 1]!;
  const i = Math.floor(p);
  const k = p - i;
  return k === 0 ? 表[i]! : 表[i]! + (表[i + 1]! - 表[i]!) * k;
};

/** 一档一格的硬切（闪光这类）：第 x 格落在哪一档就取哪一项（第 i 档管 [i, i + 1) 格），档内不插值；头尾之外取头尾，给了 出界 就取它 */
export const 取档 = <T>(表: ArrayLike<T>, x: number, 出界?: { 值: T }): T => {
  const n = 表.length;
  if (!n) throw new Error('取档：表是空的');
  const i = Math.floor(贴格(x));
  if (出界 && (i < 0 || i >= n)) return 出界.值;
  return 表[Math.min(n - 1, Math.max(0, i))]!;
};
