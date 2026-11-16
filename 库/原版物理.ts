// 原版（1.20.1）实体逐刻运动的正本（10-30 整体优化方案 0.6）：下落、落地时刻、按刻插值。新代码一律从这里 import；
// 旧代码里照 LivingEntity.travel 手写的下落循环（`v = (v − 0.08) × 0.98`）原样不动，登记在 docs/副本表.tsv。纯模块。
//
// 原版每刻（20 刻/秒），生物、玩家（LivingEntity.travel）：先按当前速度挪（Entity.move），再改速度：竖直 v = (v − 重力) × 0.98，水平在空中 × 0.91、在地上 × 0.6 × 0.91。
// 物品、下落方块（ItemEntity.tick、FallingBlockEntity.tick）顺序不同：先加重力（v − 0.04），再挪，再 × 0.98（物品水平也是 × 0.98）。
// 用 下落选项 的 物品下落（重力 0.04、先加重力）；同样的初速，物品第一刻就动，生物第二刻才动。
// 渲染时刻与刻之间按 partialTick 线性插值，所以「第 k.5 刻」的位置是第 k、k+1 刻两个位置的中点。
// 这里的高度都是竖直方向的位移（往上为正），单位格；用在场景坐标里就是 z。

export const ticksPerSec = 20;

/** 原版常数（LivingEntity、ItemEntity、FallingBlockEntity、Player） */
export const vanillaMotion = {
  /** 生物、玩家的重力（格/刻²） */
  mobGravity: 0.08,
  /** 物品、下落方块的重力 */
  itemGravity: 0.04,
  /** 竖直阻力：每刻速度乘这个 */
  verticalDrag: 0.98,
  /** 生物空中水平阻力 */
  airHorizontalDrag: 0.91,
  /** 物品空中水平阻力（ItemEntity.tick；落地时是方块滑度 × 0.98） */
  itemHorizontalDrag: 0.98,
  /** 地上水平阻力：方块滑度 0.6 × 0.91（冰 0.98、蓝冰 0.989 另算） */
  groundHorizontalDrag: 0.6 * 0.91,
  /** 起跳的竖直初速（跳跃提升每级 +0.1） */
  jumpInitialSpeed: 0.42,
  /** 疾跑起跳时朝前多给的水平速度 */
  sprintJumpBoost: 0.2,
  /** 站在地上时的竖直速度：每刻都被重力拉一次 (0 − 0.08) × 0.98，再被地面挡住；从边上走下去时就以这个速度开始掉 */
  standingVertSpeed: (0 - 0.08) * 0.98,
} as const;

export type FallOptions = {
  initSpeed?: number;
  重力?: number;
  drag?: number;
  /** 物品、下落方块：先加重力再挪（默认 false：生物、玩家的先挪再改速度） */
  gravityFirst?: boolean;
};

/** 物品、下落方块的下落（ItemEntity、FallingBlockEntity）。初速另给：{ ...物品下落, 初速: 0.2 } */
export const itemFallOptions: FallOptions = { 重力: vanillaMotion.itemGravity, gravityFirst: true };

/** 下落一刻：默认先挪再改速度（生物）；先加重力 时先 v − 重力、再挪、再乘阻力（物品） */
export const fallOneTick = (height: number, vSpeed: number, gravity: number = vanillaMotion.mobGravity, drag: number = vanillaMotion.verticalDrag, gravityFirst = false) =>
  gravityFirst ? { height: height + vSpeed - gravity, 速: (vSpeed - gravity) * drag } : { height: height + vSpeed, 速: (vSpeed - gravity) * drag };

/**
 * 从 0 起落了 刻数 刻时的高度（≤ 0 时一直往下，不碰地面）；刻数可带小数，刻与刻之间线性插值。刻数 ≤ 0 给 0。
 * 副本：把回忆 2-末地 的 原版下落 返回的是「掉了多少格」，等于这里取负（初速 0）。
 */
export const fallHeightAtTick = (tickCount: number, options: FallOptions = {}): number => {
  if (tickCount <= 0) return 0;
  let height = 0;
  let vSpeed = options.initSpeed ?? 0;
  const n = Math.floor(tickCount);
  for (let k = 0; k < n; k++) ({ height: height, 速: vSpeed } = fallOneTick(height, vSpeed, options.重力, options.drag, options.gravityFirst));
  // 刻间按下一刻的位置插（先加重力 时下一刻挪的是 速 − 重力，不是 速）
  return height + (tickCount - n) * (fallOneTick(height, vSpeed, options.重力, options.drag, options.gravityFirst).height - height);
};

/**
 * 从 0 掉到 −落差 的逐刻高度表：第 0 项是 0，往后每刻一项，最后一项正好是 −落差（落地那一刻夹在地面上）。
 * 副本：把回忆 2-第一晚 的 下落（默认初速是 站着竖直速度：从方块边上走下去）。
 */
export const fallTable = (fallHeight: number, options: FallOptions = {}): number[] => {
  if (!(fallHeight > 0)) return [0];
  const out = [0];
  let height = 0;
  let vSpeed = options.initSpeed ?? 0;
  for (let k = 0; height > -fallHeight; k++) {
    if (k > 100000) throw new Error(`下落表：${fallHeight} 格落不到底（初速 ${options.initSpeed}）`);
    const nextState = fallOneTick(height, vSpeed, options.重力, options.drag, options.gravityFirst);
    height = Math.max(-fallHeight, nextState.height);
    vSpeed = nextState.速;
    out.push(height);
  }
  return out;
};

/**
 * 掉 落差 格要几刻（带小数：碰地那一刻按这一刻里走过的比例算）。秒 = 刻 / 20。
 * 副本：应力转动 6-3-2 编排的 fallTime（返回秒）。
 */
export const landTick = (fallHeight: number, options: FallOptions = {}): number => {
  if (!(fallHeight > 0)) return 0;
  let height = 0;
  let vSpeed = options.initSpeed ?? 0;
  for (let k = 0; k < 100000; k++) {
    const nextState = fallOneTick(height, vSpeed, options.重力, options.drag, options.gravityFirst);
    if (nextState.height <= -fallHeight) return k + (height + fallHeight) / (height - nextState.height);
    height = nextState.height;
    vSpeed = nextState.速;
  }
  throw new Error(`落地刻：${fallHeight} 格落不到底（初速 ${options.initSpeed}）`);
};

/** 逐刻表按刻取值：刻与刻之间线性插值（渲染的 partialTick），出了表两头停在端点 */
export const sampleByTick = (curveTable: readonly number[], tick: number): number => {
  if (!curveTable.length) throw new Error('按刻取：空表');
  if (tick <= 0) return curveTable[0]!;
  const i = Math.floor(tick);
  if (i >= curveTable.length - 1) return curveTable[curveTable.length - 1]!;
  return curveTable[i]! + (curveTable[i + 1]! - curveTable[i]!) * (tick - i);
};
